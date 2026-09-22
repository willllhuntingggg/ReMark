/**
 * ReMark Supabase Client (Zero-dependency vanilla implementation)
 * Handles Google OAuth via chrome.identity.launchWebAuthFlow and Supabase Rest/Auth API.
 */

const ReMarkSupabase = (() => {
  const SUPABASE_URL = 'https://pfosedkbyrvgwatkdiin.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_pBTMOma6Wm0IoQWETWl1UA_pEulJ-_9';
  const EXTENSION_ID = 'cnenmlplpglldfbejcenalhiajnfgimn';
  const REDIRECT_URI = `https://${EXTENSION_ID}.chromiumapp.org/`;

  function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = (typeof btoa !== 'undefined')
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function generateCodeVerifier() {
    const array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return bufferToBase64Url(array);
  }

  async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hash = await crypto.subtle.digest('SHA-256', data);
      return bufferToBase64Url(hash);
    }
    throw new Error('Web Crypto API subtle.digest not available');
  }

  function parseAuthRedirect(responseUrl) {
    try {
      const url = new URL(responseUrl);
      const code = url.searchParams.get('code');
      if (code) {
        return { type: 'code', code };
      }
      if (url.hash) {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);
        if (accessToken) {
          return {
            type: 'token',
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: expiresIn
          };
        }
        const error = hashParams.get('error_description') || hashParams.get('error');
        if (error) return { type: 'error', error };
      }
      const error = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (error) return { type: 'error', error };
    } catch (err) {
      return { type: 'error', error: err.message };
    }
    return { type: 'error', error: 'INVALID_AUTH_REDIRECT' };
  }

  function launchWebAuthFlow(options) {
    return new Promise((resolve, reject) => {
      const identity = typeof chrome !== 'undefined' && chrome.identity;
      if (!identity || !identity.launchWebAuthFlow) {
        return reject(new Error('chrome.identity.launchWebAuthFlow not available'));
      }
      identity.launchWebAuthFlow(options, (responseUrl) => {
        const error = chrome.runtime?.lastError;
        if (error) {
          return reject(new Error(error.message));
        }
        if (!responseUrl) {
          return reject(new Error('Authentication was cancelled or failed.'));
        }
        resolve(responseUrl);
      });
    });
  }

  async function exchangeCodeForSession(authCode, codeVerifier) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        auth_code: authCode,
        code_verifier: codeVerifier
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.msg || err.error_description || err.error || 'Token exchange failed');
    }
    return await res.json();
  }

  async function fetchUser(accessToken) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (!res.ok) return null;
    return await res.json();
  }

  async function refreshSession(refreshToken) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      const current = (typeof ReMarkStorage !== 'undefined')
        ? await ReMarkStorage.getAuthSession()
        : null;

      const user = data.user || current?.user || null;
      const newSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        user: {
          id: user?.id,
          email: user?.email,
          name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '',
          avatar_url: user?.user_metadata?.avatar_url || ''
        }
      };
      if (typeof ReMarkStorage !== 'undefined') {
        await ReMarkStorage.setAuthSession(newSession);
      }
      return newSession;
    } catch (err) {
      console.warn('[ReMark Supabase] refreshSession error:', err);
      return null;
    }
  }

  async function getValidSession() {
    if (typeof ReMarkStorage === 'undefined') return null;
    const session = await ReMarkStorage.getAuthSession();
    if (!session || !session.access_token) return null;

    // If expiring within 2 minutes (120,000 ms), refresh early
    if (Date.now() > (session.expires_at || 0) - 120000) {
      if (session.refresh_token) {
        const refreshed = await refreshSession(session.refresh_token);
        if (refreshed?.access_token) {
          return refreshed;
        }
      }
      // If refresh failed and token has already passed expiration
      if (Date.now() > (session.expires_at || 0)) {
        await ReMarkStorage.setAuthSession(null);
        return null;
      }
    }
    return session;
  }

  async function signInWithGoogle() {
    try {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      const redirectUrl = (typeof chrome !== 'undefined' && chrome.identity?.getRedirectURL)
        ? chrome.identity.getRedirectURL()
        : REDIRECT_URI;

      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}&code_challenge=${challenge}&code_challenge_method=s256`;

      const responseUrl = await launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      const parsed = parseAuthRedirect(responseUrl);
      if (parsed.type === 'error') {
        throw new Error(parsed.error);
      }

      let tokenData;
      if (parsed.type === 'code') {
        tokenData = await exchangeCodeForSession(parsed.code, verifier);
      } else if (parsed.type === 'token') {
        tokenData = parsed;
      } else {
        throw new Error('Unsupported auth response');
      }

      let user = tokenData.user;
      if (!user && tokenData.access_token) {
        user = await fetchUser(tokenData.access_token);
      }

      const session = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
        user: {
          id: user?.id,
          email: user?.email,
          name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '',
          avatar_url: user?.user_metadata?.avatar_url || ''
        }
      };

      if (typeof ReMarkStorage !== 'undefined') {
        await ReMarkStorage.setAuthSession(session);
      }

      return { ok: true, session };
    } catch (err) {
      console.warn('[ReMark Supabase] signInWithGoogle failed:', err);
      return { ok: false, error: err.message };
    }
  }

  async function signOut() {
    try {
      const session = (typeof ReMarkStorage !== 'undefined')
        ? await ReMarkStorage.getAuthSession()
        : null;

      if (session?.access_token) {
        fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`
          }
        }).catch(() => {});
      }
    } catch (_) {}

    if (typeof ReMarkStorage !== 'undefined') {
      await ReMarkStorage.setAuthSession(null);
      await ReMarkStorage.setCloudBackupMeta({
        status: 'idle'
      });
    }
    return { ok: true };
  }

  async function fetchBackup() {
    const session = await getValidSession();
    if (!session) {
      return { ok: false, error: 'NOT_AUTHENTICATED' };
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/remark_backups?select=data,updated_at`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { ok: false, status: res.status, error: errText || 'FETCH_BACKUP_FAILED' };
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: true, data: null };
      }
      return { ok: true, data: rows[0].data, updatedAt: rows[0].updated_at };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function uploadBackup(backupData) {
    const session = await getValidSession();
    if (!session) {
      return { ok: false, error: 'NOT_AUTHENTICATED' };
    }
    try {
      const updatedAt = new Date().toISOString();
      let userId = session.user?.id;
      if (!userId) {
        const u = await fetchUser(session.access_token);
        userId = u?.id;
      }
      if (!userId) {
        return { ok: false, error: 'NO_USER_ID' };
      }

      const payload = {
        user_id: userId,
        data: backupData,
        client_version: (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
          ? chrome.runtime.getManifest()?.version || '1.2.0'
          : '1.2.0',
        updated_at: updatedAt
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/remark_backups?on_conflict=user_id`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Prefer': 'resolution=merge-duplicates',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[ReMark Supabase] uploadBackup failed:', res.status, errText);
        if (typeof ReMarkStorage !== 'undefined') {
          await ReMarkStorage.setCloudBackupMeta({
            status: 'error',
            lastError: errText || 'UPLOAD_FAILED'
          });
        }
        return { ok: false, status: res.status, error: errText || 'UPLOAD_FAILED' };
      }

      console.log('[ReMark Supabase] uploadBackup success, updated_at:', updatedAt);

      if (typeof ReMarkStorage !== 'undefined') {
        await ReMarkStorage.setCloudBackupMeta({
          lastBackupTime: Date.now(),
          status: 'success',
          lastError: null
        });
      }
      return { ok: true, updatedAt };
    } catch (err) {
      if (typeof ReMarkStorage !== 'undefined') {
        await ReMarkStorage.setCloudBackupMeta({
          status: 'error',
          lastError: err.message
        });
      }
      return { ok: false, error: err.message };
    }
  }

  return {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    EXTENSION_ID,
    REDIRECT_URI,
    bufferToBase64Url,
    generateCodeVerifier,
    generateCodeChallenge,
    parseAuthRedirect,
    exchangeCodeForSession,
    refreshSession,
    getValidSession,
    signInWithGoogle,
    signOut,
    fetchBackup,
    uploadBackup
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReMarkSupabase;
}
