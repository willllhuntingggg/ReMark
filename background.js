importScripts('lib/i18n.js', 'lib/storage.js');
const SETTINGS_KEY = 'markit_settings';
let nativeUiRefreshRevision = 0;

function createNativeMenuItem(options) {
  chrome.contextMenus.create(options, () => {
    // Read lastError in the callback so a stale browser menu state cannot leak
    // an unchecked runtime error during extension reloads.
    void chrome.runtime.lastError;
  });
}

function refreshNativeUi() {
  const revision = ++nativeUiRefreshRevision;
  chrome.action.setTitle({ title: ReMarkI18n.t('open_sidepanel') }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    if (revision !== nativeUiRefreshRevision) return;
    // Consume an API error, then skip this refresh rather than risking a create
    // against an uncleared menu collection.
    if (chrome.runtime.lastError) return;
    createNativeMenuItem({
      id: 'remark_highlight',
      title: ReMarkI18n.t('highlight_context_menu'),
      contexts: ['selection']
    });
    createNativeMenuItem({
      id: 'remark_open_sidepanel',
      title: ReMarkI18n.t('open_sidepanel_context_menu'),
      contexts: ['all']
    });
  });
}

async function syncNativeLanguage() {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    ReMarkI18n.setLocale(data?.[SETTINGS_KEY]?.language);
  } catch (_) {
    ReMarkI18n.setLocale('system');
  }
  refreshNativeUi();
}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener((details) => {
  void syncNativeLanguage();
  void syncAllActionIcons();
  if (details?.reason === 'install') {
    // First install only: open the Welcome page. The existing onboarding
    // flow and its state logic are left untouched.
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }, () => {
      void chrome.runtime.lastError;
    });
  }
});
chrome.runtime.onStartup.addListener(() => void syncAllActionIcons());
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes?.[SETTINGS_KEY]) void syncNativeLanguage();
  if (changes?.[ReMarkStorage.KEYS.CLIPS] || changes?.[ReMarkStorage.KEYS.VIDEO_MARKS]) {
    void syncAllActionIcons();
  }
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'remark_highlight' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'CONTEXT_HIGHLIGHT',
      text: info.selectionText
    });
  } else if (info.menuItemId === 'remark_open_sidepanel' && tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

const pendingSourceNavigations = new Map();

const PENDING_SOURCE_LOCATE_DELAYS = [0, 600, 1800, 4200, 7000, 10000];
const UNMARKED_ACTION_ICON_PATHS = {
  16: 'assets/icons/icon16-monochrome.png',
  24: 'assets/icons/icon24-monochrome.png',
  32: 'assets/icons/icon32-monochrome.png',
  48: 'assets/icons/icon48-monochrome.png',
  64: 'assets/icons/icon64-monochrome.png',
  96: 'assets/icons/icon96-monochrome.png',
  128: 'assets/icons/icon128-monochrome.png',
  256: 'assets/icons/icon256-monochrome.png',
  512: 'assets/icons/icon512-monochrome.png'
};
const MARKED_ACTION_ICON_PATHS = {
  16: 'assets/icons/icon16.png',
  24: 'assets/icons/icon24.png',
  32: 'assets/icons/icon32.png',
  48: 'assets/icons/icon48.png',
  64: 'assets/icons/icon64.png',
  96: 'assets/icons/icon96.png',
  128: 'assets/icons/icon128.png',
  256: 'assets/icons/icon256.png',
  512: 'assets/icons/icon512.png'
};

function sameReMarkPageUrl(a, b) {
  return String(a || '').split('#')[0] === String(b || '').split('#')[0];
}

function isNavigablePageUrl(url) {
  return /^https?:/i.test(String(url || ''));
}

async function markedUrlHasReMarkMarks(url) {
  if (!isNavigablePageUrl(url)) return false;
  // Keep this lookup aligned with the Side Panel's existing URL Collection aggregation.
  const pages = await ReMarkStorage.getPages();
  return pages.some((page) => sameReMarkPageUrl(page?.url, url));
}

async function syncActionIconForPage(tabId, url) {
  if (!Number.isInteger(tabId)) return;
  let hasMarks = false;
  try {
    hasMarks = await markedUrlHasReMarkMarks(url);
  } catch (_) {}
  try {
    await chrome.action.setIcon({
      tabId,
      path: hasMarks ? MARKED_ACTION_ICON_PATHS : UNMARKED_ACTION_ICON_PATHS
    });
  } catch (_) {}
}

async function syncAllActionIcons() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => syncActionIconForPage(tab.id, tab.url)));
  } catch (_) {}
}

function trackSourceNavigation(tabId, clipId, url) {
  const pending = { clipId, url: url || '' };
  pendingSourceNavigations.set(tabId, pending);
  setTimeout(() => {
    if (pendingSourceNavigations.get(tabId) === pending) pendingSourceNavigations.delete(tabId);
  }, 15000);
  return pending;
}

async function openMarkNavigation(url, clipId, locateClip) {
  const tab = await chrome.tabs.create({ active: true });
  if (!Number.isInteger(tab?.id)) throw new Error('Unable to create target tab');
  if (locateClip) trackSourceNavigation(tab.id, clipId, url);
  await chrome.tabs.update(tab.id, { url });
  return tab.id;
}

function deliverPendingSourceLocate(tabId, pending) {
  PENDING_SOURCE_LOCATE_DELAYS.forEach((delay) => setTimeout(async () => {
    if (pendingSourceNavigations.get(tabId) !== pending) return;
    try { await chrome.tabs.sendMessage(tabId, { action: 'RESTORE_HIGHLIGHTS' }); } catch (_) {}
    try { await chrome.tabs.sendMessage(tabId, { action: 'LOCATE_CLIP', clipId: pending.clipId }); } catch (_) {}
  }, delay));
}
function acknowledgePendingSourceLocate(tabId, clipId) {
  const pending = pendingSourceNavigations.get(tabId);
  if (pending?.clipId === clipId) pendingSourceNavigations.delete(tabId);
}


chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  void syncActionIconForPage(details.tabId, details.url);
  const pending = pendingSourceNavigations.get(details.tabId);
  if (pending) deliverPendingSourceLocate(details.tabId, pending);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  void syncActionIconForPage(details.tabId, details.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) void syncActionIconForPage(tabId, tab.url || changeInfo.url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId)
    .then((tab) => syncActionIconForPage(tabId, tab.url))
    .catch(() => {});
});

// Runs in the MAIN world of the video tab. Reads page-level player state and
// fetches caption/subtitle data exactly like the page itself would, so the
// user's logged-in session and cookies apply. Returns { caption, chapter } or
// null — captions are best-effort and never block the mark itself.
async function captureVideoCaptionInMainWorld(payload) {
  const platform = payload?.platform;
  const time = Number(payload?.time);
  if (!platform || !Number.isFinite(time)) return null;
  const cueAt = (cues) => {
    if (!Array.isArray(cues)) return null;
    for (const cue of cues) {
      const from = Number(cue.from);
      const to = Number(cue.to);
      if (Number.isFinite(from) && Number.isFinite(to) && time >= from - 0.5 && time < to + 0.5) return cue;
    }
    return null;
  };
  const timedtextCues = (data) => {
    const cues = [];
    for (const ev of data?.events || []) {
      const start = Number(ev.tStartMs);
      if (!Number.isFinite(start)) continue;
      const duration = Number(ev.dDurationMs) || 0;
      let text = '';
      if (Array.isArray(ev.segs)) text = ev.segs.map((s) => s.utf8 || '').join('');
      else if (typeof ev.aAppend === 'string') text = ev.aAppend;
      text = String(text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      cues.push({ from: start / 1000, to: (start + duration) / 1000, text });
    }
    return cues;
  };
  const fetchJson = async (url, options) => {
    try {
      const res = await fetch(url, { credentials: 'include', ...(options || {}) });
      if (!res.ok) return null;
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  };
  const pickTrack = (tracks, prefs, kindOf) => tracks
    .map((track) => {
      const lang = String(kindOf(track) || '');
      const index = prefs.indexOf(lang);
      return { track, score: index === -1 ? 10 : index * 2 + (track.kind === 'asr' ? 1 : 0) };
    })
    .filter((entry) => entry.score < 10)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.track);
  const effectiveLanguage = payload.language === 'system'
    ? String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
    : payload.language;

  if (platform === 'youtube') {
    let player = null;
    try {
      if (typeof ytInitialPlayerResponse !== 'undefined') player = ytInitialPlayerResponse;
      else if (window.ytplayer?.config?.args?.player_response) {
        player = typeof window.ytplayer.config.args.player_response === 'string'
          ? JSON.parse(window.ytplayer.config.args.player_response)
          : window.ytplayer.config.args.player_response;
      }
    } catch (_) {}

    let chapter = null;
    try {
      if (typeof ytInitialData !== 'undefined') {
        const found = [];
        const seen = new Set();
        const stack = [ytInitialData];
        while (stack.length) {
          const node = stack.pop();
          if (!node || typeof node !== 'object' || seen.has(node)) continue;
          seen.add(node);
          if (node.multiMarkersPlayerBarRenderer && Array.isArray(node.multiMarkersPlayerBarRenderer.markersMap)) found.push(node.multiMarkersPlayerBarRenderer);
          for (const key of Object.keys(node)) {
            const value = node[key];
            if (value && typeof value === 'object') stack.push(value);
          }
        }
        const markers = found[0];
        const entry = markers?.markersMap?.find((m) => m.key === 'DESCRIPTION_CHAPTERS' || m.key === 'chapters' || Array.isArray(m.value?.chapters));
        const chapters = entry?.value?.chapters || [];
        if (chapters.length) {
          const cues = chapters.map((c, i) => ({
            from: Number(c.chapterRenderer?.timeRangeStartMillis || 0) / 1000,
            to: i + 1 < chapters.length
              ? Number(chapters[i + 1].chapterRenderer?.timeRangeStartMillis || 0) / 1000
              : Number(payload.duration) || Number.MAX_SAFE_INTEGER,
            text: String(c.chapterRenderer?.title?.simpleText || '').trim()
          })).filter((c) => c.text);
          const hit = cueAt(cues);
          if (hit) chapter = { kind: 'chapter', text: hit.text, from: hit.from, to: hit.to };
        }
      }
    } catch (_) {}

    let caption = null;
    try {
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length) {
        const prefs = effectiveLanguage === 'zh'
          ? ['zh-Hans', 'zh-CN', 'zh-TW', 'zh', 'en']
          : ['en', 'zh-Hans', 'zh-CN', 'zh-TW', 'zh'];
        const track = pickTrack(tracks, prefs, (t) => t.languageCode)[0];
        if (track) {
          const data = await fetchJson(track.baseUrl + '&fmt=json3');
          const hit = cueAt(timedtextCues(data));
          if (hit) caption = {
            kind: 'caption',
            text: hit.text,
            from: hit.from,
            to: hit.to,
            lang: track.languageCode || '',
            name: track.name?.simpleText || ''
          };
        }
      }
    } catch (_) {}
    return { caption, chapter };
  }

  if (platform === 'bilibili') {
    let bvid = payload.bvid || '';
    let cid = payload.cid || '';
    try {
      const state = window.__INITIAL_STATE__;
      bvid = bvid || state?.bvid || '';
      cid = cid || String(state?.videoData?.cid || '');
    } catch (_) {}

    let caption = null;
    try {
      let list = [];
      try { list = window.__INITIAL_STATE__?.videoData?.subtitle?.list || []; } catch (_) {}
      if (!list.length) {
        try {
          const captured = window.__remarkBiliSubtitles__;
          if (captured && captured.key === `${bvid}:${cid}`) list = captured.subtitles || [];
        } catch (_) {}
      }
      if (!list.length) {
        try {
          const data = await fetchJson(`https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`);
          list = data?.data?.subtitle?.subtitles || data?.data?.subtitle?.list || [];
        } catch (_) {}
      }
      if (list.length) {
        const prefs = effectiveLanguage === 'zh'
          ? ['ai-zh', 'zh-Hans', 'zh-CN', 'zh', 'zh-TW']
          : ['en', 'ai-zh', 'zh-Hans', 'zh-CN', 'zh'];
        const track = pickTrack(list, prefs, (t) => t.lan)[0];
        if (track?.subtitle_url) {
          const url = track.subtitle_url.startsWith('//') ? 'https:' + track.subtitle_url : track.subtitle_url;
          const data = await fetchJson(url);
          const body = Array.isArray(data?.body) ? data.body : [];
          const cues = body
            .filter((item) => item && item.content)
            .map((item) => ({ from: Number(item.from), to: Number(item.to), text: String(item.content).replace(/\s+/g, ' ').trim() }))
            .filter((item) => item.text);
          const hit = cueAt(cues);
          if (hit) caption = {
            kind: 'caption',
            text: hit.text,
            from: hit.from,
            to: hit.to,
            lang: track.lan_doc || track.lan || ''
          };
        }
      }
    } catch (_) {}
    return { caption, chapter: null };
  }
  return null;
}

// Installed once per Bilibili video page (MAIN world). Captures the player's
// own subtitle-list response so the logged-in result can be reused at mark
// time without re-signing the wbi request ourselves.
function installBiliSubtitleCaptureInMainWorld() {
  try {
    if (window.__remarkBiliSubtitleHookInstalled__) return;
    window.__remarkBiliSubtitleHookInstalled__ = true;
    const store = { key: '', subtitles: [], updatedAt: 0 };
    Object.defineProperty(window, '__remarkBiliSubtitles__', { value: store, writable: false, configurable: true });
    const capture = (url, bodyText) => {
      try {
        if (typeof url !== 'string' || !/\/x\/player\/(wbi\/)?v2(\?|$)/.test(url) || !bodyText) return;
        const parsed = JSON.parse(bodyText);
        const subs = parsed?.data?.subtitle?.subtitles || parsed?.data?.subtitle?.list || [];
        if (!subs.length) return;
        const parsedUrl = new URL(url, location.href);
        const bvid = parsedUrl.searchParams.get('bvid') || '';
        const cid = parsedUrl.searchParams.get('cid') || '';
        if (!bvid && !cid) return;
        store.key = `${bvid}:${cid}`;
        store.subtitles = subs;
        store.updatedAt = Date.now();
      } catch (_) {}
    };
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const promise = originalFetch.apply(this, args);
        if (typeof url === 'string' && /\/x\/player\/(wbi\/)?v2(\?|$)/.test(url)) {
          promise.then((res) => {
            try { res.clone().text().then((text) => capture(url, text)); } catch (_) {}
          }).catch(() => {});
        }
        return promise;
      };
    }
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__remarkBiliUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', () => {
        try { capture(this.__remarkBiliUrl, this.responseText); } catch (_) {}
      });
      return originalSend.apply(this, args);
    };
  } catch (_) {}
}

chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (details.frameId !== 0) return;
  const pending = pendingSourceNavigations.get(details.tabId);
  if (!pending) return;
  pendingSourceNavigations.delete(details.tabId);
  chrome.runtime.sendMessage({ action: 'SOURCE_UNAVAILABLE', clipId: pending.clipId, url: pending.url }).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => pendingSourceNavigations.delete(tabId));
// Handle messages from content script or sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'TRACK_SOURCE_NAVIGATION' && Number.isInteger(message.tabId) && message.clipId) {
    const pending = trackSourceNavigation(message.tabId, message.clipId, message.url || '');
    chrome.tabs.get(message.tabId).then((tab) => {
      if (pendingSourceNavigations.get(message.tabId) === pending && tab.status === 'complete') {
        deliverPendingSourceLocate(message.tabId, pending);
      }
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === 'OPEN_MARK_NAVIGATION' && message.url) {
    openMarkNavigation(message.url, message.clipId || '', Boolean(message.locateClip))
      .then((tabId) => sendResponse({ ok: true, tabId }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.action === 'SOURCE_CLIP_LOCATED' && sender.tab?.id && message.clipId) {
    acknowledgePendingSourceLocate(sender.tab.id, message.clipId);
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === 'OPEN_SIDE_PANEL') {
    if (sender.tab?.windowId) {
      const focus = { clipId: message.clipId, markId: message.markId };
      chrome.storage.local.set({ remark_pending_focus: focus }).catch(() => {});
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => {
        setTimeout(() => chrome.runtime.sendMessage({ action: 'FOCUS_CLIP', ...focus }), 180);
        setTimeout(() => chrome.runtime.sendMessage({ action: 'FOCUS_CLIP', ...focus }), 700);
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }
  if (message.action === 'INSTALL_BILI_SUBTITLE_CAPTURE') {
    if (sender.tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        func: installBiliSubtitleCaptureInMainWorld
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === 'CAPTURE_VIDEO_CAPTION') {
    if (!sender.tab?.id) {
      sendResponse(null);
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: captureVideoCaptionInMainWorld,
      args: [message.payload]
    })
      .then((results) => sendResponse(results?.[0]?.result || null))
      .catch(() => sendResponse(null));
    return true;
  }
  return false;
});

void syncNativeLanguage();
