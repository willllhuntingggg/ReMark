const assert = require('assert').strict;

// Set up localStorage mock for ReMarkStorage
const values = new Map();
global.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const storage = require('../lib/storage.js');
const supabase = require('../lib/supabase.js');

async function testPkceAndParsers() {
  const verifier = supabase.generateCodeVerifier();
  assert.ok(verifier.length >= 43, 'Verifier length should be at least 43 chars');
  assert.match(verifier, /^[A-Za-z0-9_-]+$/, 'Verifier should be url-safe base64');

  const challenge1 = await supabase.generateCodeChallenge('test-verifier-123');
  const challenge2 = await supabase.generateCodeChallenge('test-verifier-123');
  assert.equal(challenge1, challenge2, 'Challenge should be deterministic for same input');
  assert.match(challenge1, /^[A-Za-z0-9_-]+$/, 'Challenge should be url-safe base64');

  // Test redirect parser for PKCE code
  const parsedCode = supabase.parseAuthRedirect('https://cnenmlplpglldfbejcenalhiajnfgimn.chromiumapp.org/?code=auth-code-xyz');
  assert.equal(parsedCode.type, 'code');
  assert.equal(parsedCode.code, 'auth-code-xyz');

  // Test redirect parser for implicit tokens
  const parsedToken = supabase.parseAuthRedirect('https://cnenmlplpglldfbejcenalhiajnfgimn.chromiumapp.org/#access_token=token-123&refresh_token=refresh-456&expires_in=7200');
  assert.equal(parsedToken.type, 'token');
  assert.equal(parsedToken.access_token, 'token-123');
  assert.equal(parsedToken.refresh_token, 'refresh-456');
  assert.equal(parsedToken.expires_in, 7200);

  // Test redirect parser for error
  const parsedError = supabase.parseAuthRedirect('https://cnenmlplpglldfbejcenalhiajnfgimn.chromiumapp.org/?error=access_denied&error_description=User+cancelled');
  assert.equal(parsedError.type, 'error');
  assert.match(parsedError.error, /cancelled/i);
}

async function testStorageAuthAndMeta() {
  // Clear session
  await storage.setAuthSession(null);
  assert.equal(await storage.getAuthSession(), null);

  // Set session
  const testSession = {
    access_token: 'test_at',
    refresh_token: 'test_rt',
    expires_at: Date.now() + 3600000,
    user: { id: 'u-1', email: 'test@example.com' }
  };
  await storage.setAuthSession(testSession);
  const loadedSession = await storage.getAuthSession();
  assert.deepEqual(loadedSession, testSession);

  // Test cloud backup meta
  const meta = await storage.getCloudBackupMeta();
  assert.equal(meta.status, 'idle');

  await storage.setCloudBackupMeta({
    lastBackupTime: 123456789,
    status: 'success'
  });
  const updatedMeta = await storage.getCloudBackupMeta();
  assert.equal(updatedMeta.lastBackupTime, 123456789);
  assert.equal(updatedMeta.status, 'success');

  // Clear session
  await storage.setAuthSession(null);
  assert.equal(await storage.getAuthSession(), null);
}

async function testRestoreAndDemoCleanup() {
  // Simulate fresh install with demo clips
  await storage.set(storage.KEYS.CLIPS, [
    { id: 'clip_demo_1', text: 'Demo 1', createdAt: 10 },
    { id: 'clip_demo_2', text: 'Demo 2', createdAt: 20 }
  ]);
  await storage.set(storage.KEYS.VIDEO_MARKS, []);

  // Simulate cloud backup with real marks
  const cloudBackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      [storage.KEYS.CLIPS]: [
        { id: 'clip_real_100', text: 'User real highlight', createdAt: 100 },
        { id: 'clip_real_200', text: 'Another highlight', createdAt: 200 }
      ],
      [storage.KEYS.VIDEO_MARKS]: [
        { id: 'vmark_real_300', title: 'Video note', time: 45, createdAt: 300 }
      ],
      [storage.KEYS.SETTINGS]: { defaultColor: '#FF5500', theme: 'system' }
    }
  };

  // Perform import (Restore)
  const importResult = await storage.importBackup(cloudBackupData);
  assert.equal(importResult.added, 3);

  // Check demo clip cleanup logic as executed in background.js
  const currentClips = await storage.getClips();
  const realClips = currentClips.filter((c) => !c.id.startsWith('clip_demo_'));
  assert.equal(realClips.length, 2);
  await storage.set(storage.KEYS.CLIPS, realClips);

  const finalClips = await storage.getClips();
  assert.equal(finalClips.length, 2);
  assert.ok(finalClips.every((c) => !c.id.startsWith('clip_demo_')));

  const finalVideos = await storage.getVideoMarks();
  assert.equal(finalVideos.length, 1);
  assert.equal(finalVideos[0].id, 'vmark_real_300');
}

async function main() {
  await testPkceAndParsers();
  await testStorageAuthAndMeta();
  await testRestoreAndDemoCleanup();
  console.log('cloud-backup.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
