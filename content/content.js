/**
 * ReMark Content Script
 * ⌘/Ctrl + drag-select to silently highlight text.
 * Notes are added later in the side panel.
 */

(function () {
  if (window.__remark_loaded__) return;
  window.__remark_loaded__ = true;

  let currentSelection = null;
  showFirstUseGuide();
  let loadedClipsForPage = [];

  const DEFAULT_HIGHLIGHT_COLOR = '#FFE066';

  // Initialize storage
  ReMarkStorage.init().then(async () => {
    restorePageHighlights();
    watchForUrlChanges();
    initVideoMarkFeature();
  });

  // Re-render video markers when storage updates (real-time sync)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(() => {
      renderVideoMarkers();
    });
  }

  async function showFirstUseGuide() {
    if (document.getElementById('remark-first-use-guide')) return;
    try {
      const settings = await ReMarkStorage.getSettings();
      if (settings.onboardingSeen) return;
      const guide = document.createElement('div');
      guide.id = 'remark-first-use-guide';
      guide.setAttribute('role', 'dialog');
      guide.setAttribute('aria-live', 'polite');
      guide.innerHTML = '<div class="remark-guide-card">' +
        '<button class="remark-guide-close" type="button" aria-label="关闭首次使用教学">×</button>' +
        '<div class="remark-guide-eyebrow">ReMark 首次使用指南</div>' +
        '<h2>先按住快捷键，再划选文字</h2>' +
        '<p>先按住 <strong>Command ⌘</strong> 或 <strong>Ctrl</strong>，再用鼠标划选至少 2 个字符；鼠标停下后，内容就会自动保存并高亮。</p>' +
        '<div class="remark-guide-demo" aria-label="快捷键划选动画演示">' +
        '<div class="remark-guide-line remark-guide-line-top"></div>' +
        '<div class="remark-guide-line remark-guide-line-main"></div>' +
        '<div class="remark-guide-line remark-guide-line-bottom"></div>' +
        '<div class="remark-guide-selection" aria-hidden="true"></div>' +
        '<div class="remark-guide-cursor" aria-hidden="true"></div>' +
        '<div class="remark-guide-key">⌘ / Ctrl</div>' +
        '<div class="remark-guide-result">已高亮</div></div>' +
        '<div class="remark-guide-fallback">动画未播放时，请记住：<strong>先按住 Command/Ctrl，再用鼠标划选文字</strong>。</div>' +
        '<div class="remark-guide-actions"><button class="remark-guide-start" type="button">我知道了</button>' +
        '<button class="remark-guide-dismiss" type="button">不再提示</button></div></div>';
      document.documentElement.appendChild(guide);
      const complete = async () => {
        await ReMarkStorage.updateSettings({ onboardingSeen: true });
        guide.remove();
      };
      guide.querySelector('.remark-guide-close')?.addEventListener('click', complete);
      guide.querySelector('.remark-guide-start')?.addEventListener('click', complete);
      guide.querySelector('.remark-guide-dismiss')?.addEventListener('click', complete);
      guide.addEventListener('click', (event) => {
        if (event.target === guide) complete();
      });
      const onEscape = (event) => {
        if (event.key === 'Escape' && document.documentElement.contains(guide)) {
          document.removeEventListener('keydown', onEscape);
          complete();
        }
      };
      document.addEventListener('keydown', onEscape);
    } catch (error) {
      console.warn('[ReMark] First-use guide unavailable:', error);
    }
  }

  // ⌘/Ctrl + mouseup → silent highlight
  document.addEventListener('mouseup', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2) return;
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      currentSelection = { text, range: range.cloneRange() };
      quickHighlightSelection(DEFAULT_HIGHLIGHT_COLOR);
    } catch (err) {
      console.warn('[ReMark] Error handling selection:', err);
    }
  });

  // Listen for messages from sidepanel / background
  chrome.runtime.onMessage?.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'CONTEXT_HIGHLIGHT') {
      const selectedText = window.getSelection().toString().trim();
      if (selectedText) quickHighlightSelection(DEFAULT_HIGHLIGHT_COLOR);
    } else if (msg.action === 'RESTORE_HIGHLIGHTS') {
      restorePageHighlights();
    } else if (msg.action === 'LOCATE_CLIP') {
      locateAndAnimateClip(msg.clipId);
    } else if (msg.action === 'DELETE_CLIP_FROM_PAGE') {
      removeClipHighlightFromDOM(msg.clipId);
    } else if (msg.action === 'DELETE_PAGE_CLIPS_FROM_PAGE') {
      removeAllPageHighlightsFromDOM();
    } else if (msg.action === 'REFRESH_VIDEO_MARKS' || msg.action === 'VIDEO_MARK_DELETED') {
      renderVideoMarkers();
    } else if (msg.action === 'SEEK_VIDEO_MARK') {
      seekVideoToMark(msg.time);
    }
  });

  let selectedHighlight = null;
  document.addEventListener('keydown', async (event) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedHighlight && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      const clipId = selectedHighlight.getAttribute('data-clip-id');
      const clips = await ReMarkStorage.getClips();
      const item = clips.find(c => c.id === clipId);
      if (item) {
        await ReMarkStorage.deleteClip(clipId);
        await ReMarkStorage.pushUndo({ type: 'delete_clip', item });
        selectedHighlight.remove();
        selectedHighlight = null;
        notifyStorageUpdated();
      }
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    if (await ReMarkStorage.undoLast()) {
      restorePageHighlights();
      renderVideoMarkers();
      notifyStorageUpdated();
    }
  });
  // Re-run per-page restore when the URL changes without a full reload (SPA)
  function watchForUrlChanges() {
    const dispatchUrlChange = () => window.dispatchEvent(new Event('remark:urlchange'));
    const wrap = (method) => {
      const orig = history[method];
      return function (...args) {
        const result = orig.apply(this, args);
        dispatchUrlChange();
        return result;
      };
    };
    history.pushState = wrap('pushState');
    history.replaceState = wrap('replaceState');
    window.addEventListener('popstate', dispatchUrlChange);
    window.addEventListener('hashchange', dispatchUrlChange);
    window.addEventListener('remark:urlchange', () => restorePageHighlights());
  }

  // Locate clip by ID, scroll into view and play animation
  function locateAndAnimateClip(clipId) {
    const mark = document.querySelector(`mark[data-clip-id="${clipId}"]`);
    if (!mark) {
      restorePageHighlights();
      setTimeout(() => {
        const retryMark = document.querySelector(`mark[data-clip-id="${clipId}"]`);
        if (retryMark) performLocateAnimation(retryMark);
      }, 300);
      return;
    }
    performLocateAnimation(mark);
  }

  function performLocateAnimation(mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    mark.classList.add('remark-locate-pulse');
    mark.style.transition = 'all 0.3s ease';
    setTimeout(() => mark.classList.remove('remark-locate-pulse'), 2200);
  }

  function removeClipHighlightFromDOM(clipId) {
    const mark = document.querySelector(`mark[data-clip-id="${clipId}"]`);
    if (!mark) return;
    mark.classList.add('remark-remove-fade');
    setTimeout(() => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      }
    }, 280);
  }

  function removeAllPageHighlightsFromDOM() {
    const marks = document.querySelectorAll('mark.remark-highlight-mark');
    marks.forEach((mark, i) => {
      setTimeout(() => {
        mark.classList.add('remark-remove-fade');
        setTimeout(() => {
          const parent = mark.parentNode;
          if (parent) {
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
          }
        }, 280);
      }, i * 40);
    });
  }

  // Silent highlight — no popup, no toast
  async function quickHighlightSelection(colorCode) {
    const sel = currentSelection;
    if (!sel || !sel.text) return;

    const { text, range } = sel;
    currentSelection = null;

    const clipData = {
      url: window.location.href,
      pageTitle: document.title,
      text,
      sourcePosition: range ? Math.round(range.getBoundingClientRect().top + window.scrollY) : null,
      color: colorCode,
      note: ''
    };

    const savedClip = await ReMarkStorage.addClip(clipData);
    await ReMarkStorage.pushUndo({ type: 'restore_clip', id: savedClip.id });
    if (range) {
      highlightDOMRange(range, savedClip);
      window.getSelection()?.removeAllRanges();
    }
    notifyStorageUpdated();
  }

  // DOM Highlighting Engine
  function highlightDOMRange(range, clip) {
    try {
      const mark = document.createElement('mark');
      mark.className = `remark-highlight-mark ${clip.note ? 'has-note' : ''}`;
      mark.setAttribute('data-clip-id', clip.id);

      if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
        range.surroundContents(mark);
      } else {
        const contents = range.extractContents();
        mark.appendChild(contents);
        range.insertNode(mark);
      }
      bindHighlightClick(mark, clip);
    } catch (e) {
      console.warn('[ReMark] Highlight DOM range fallback:', e);
      try {
        const mark = document.createElement('mark');
        mark.className = `remark-highlight-mark ${clip.note ? 'has-note' : ''}`;
        mark.setAttribute('data-clip-id', clip.id);
        mark.textContent = range.toString();
        range.deleteContents();
        range.insertNode(mark);
        bindHighlightClick(mark, clip);
      } catch (err) {
        console.error('[ReMark] Fallback highlight failed:', err);
      }
    }
  }

  // Click highlight → locate it (focuses sidepanel via storage update)
  function bindHighlightClick(element, clip) {
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      try { chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL', clipId: clip.id }); } catch (_) {}
      // Pulse the element to acknowledge the click
      element.classList.add('remark-locate-pulse');
      setTimeout(() => element.classList.remove('remark-locate-pulse'), 2200);
    });
  }

  function notifyStorageUpdated() {
    try {
      chrome.runtime?.sendMessage({ action: 'REMARK_STORAGE_UPDATED' });
    } catch (e) {
      // Ignored
    }
  }

  // Restore page highlights from storage
  async function restorePageHighlights() {
    const clips = await ReMarkStorage.getClips();
    const currentUrl = window.location.href.split('#')[0];
    loadedClipsForPage = clips.filter((c) => c.url && c.url.split('#')[0] === currentUrl);
    if (!loadedClipsForPage.length) return;

    const bodyText = document.body.innerText;
    loadedClipsForPage.forEach((clip) => {
      if (clip.text && bodyText.includes(clip.text)) highlightTextInBody(clip);
    });
  }

  function highlightTextInBody(clip) {
    if (document.querySelector(`mark[data-clip-id="${clip.id}"]`)) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue;
      const val = node.nodeValue;
      const index = val.indexOf(clip.text);
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + clip.text.length);
        if (!Number.isFinite(Number(clip.sourcePosition))) {
          void ReMarkStorage.updateClip(clip.id, { sourcePosition: Math.round(range.getBoundingClientRect().top + window.scrollY) });
        }
        highlightDOMRange(range, clip);
        break;
      }
    }
  }

  // ========= Video Timestamp Marks (YouTube & Bilibili) =========

  const MARKER_POLL_INTERVAL = 1200;
  let videoMarkRenderSig = null;
  let videoMarkRenderedIds = new Set();
  let markTooltipEl = null;
  let markTooltipHideTimer = null;
  const healedVideoKeys = new Set();

  function detectVideoPlatform() {
    const host = window.location.hostname;
    if (host === 'music.youtube.com') return null;
    if (/(^|\.)bilibili\.com$/.test(host)) return 'bilibili';
    if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host)) return 'youtube';
    return null;
  }

  const VIDEO_PLATFORMS = {
    bilibili: {
      isVideoPage() { return /\/video\//.test(window.location.pathname); },
      getVideoKey() {
        const m = window.location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
        if (!m) return null;
        const p = new URLSearchParams(window.location.search).get('p');
        return p ? `${m[1]}?p=${p}` : m[1];
      },
      getVideoTitle() {
        const og = document.querySelector('meta[property="og:title"]');
        const metaTitle = document.querySelector('meta[name="title"]');
        return og ? og.content : (metaTitle ? metaTitle.content : (document.title.replace(/_哔哩哔哩_bilibili/i, '').trim() || document.title));
      },
      findVideoElement() {
        const candidates = ['video.bpx-player-video', 'video.bilibili-player-video', '.bpx-player-container video', '.bilibili-player-video video'];
        for (const sel of candidates) {
          const v = document.querySelector(sel);
          if (v && v.duration > 0) return v;
        }
        return document.querySelector('video');
      },
      findProgressBar() {
        const candidates = ['.bpx-player-progress', '.bilibili-player-video-progress', '.bilibili-player-video-progress-move'];
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (el && el.getBoundingClientRect().width > 0) return el;
        }
        return null;
      },
      findMarkerHost(bar) {
        const wrap = bar.closest('.bpx-player-progress-wrap, .bilibili-player-video-progress-wrap');
        return wrap || bar;
      }
    },
    youtube: {
      isVideoPage() {
        const p = window.location.pathname;
        if (/\/watch\b|\/embed\/|\/e\//.test(p)) return true;
        if (/\/shorts\//.test(p)) return true;
        if (/(^|\.)youtu\.be$/.test(window.location.hostname) && /^\/[\w-]{6,}/.test(p)) return true;
        return false;
      },
      getVideoKey() {
        const v = new URLSearchParams(window.location.search).get('v');
        if (v) return v;
        const m = window.location.pathname.match(/\/(?:shorts|embed|e|live)\/([\w-]{6,})/);
        if (m) return m[1];
        const be = window.location.pathname.match(/^\/([\w-]{6,})/);
        return be ? be[1] : null;
      },
      getVideoTitle() {
        const fromMeta = (sel) => { const m = document.querySelector(sel); return m && m.content && m.content.trim() ? m.content.trim() : ''; };
        const fromText = (sel) => { const el = document.querySelector(sel); return el && el.textContent && el.textContent.trim() ? el.textContent.trim() : ''; };
        const candidates = [
          fromMeta('meta[property="og:title"]'), fromMeta('meta[name="title"]'), fromMeta('meta[itemprop="name"]'),
          fromText('h1.ytd-watch-metadata yt-formatted-string'), fromText('h1.title.ytd-watch-metadata'),
          fromText('#info-contents h1'), fromText('ytd-reel-video-renderer h2')
        ];
        for (const t of candidates) {
          if (t && !/^(youtube|bilibili|哔哩哔哩)$/i.test(t)) return t;
        }
        const stripped = document.title.replace(/\s*-\s*YouTube$/i, '').trim();
        return (stripped && !/^youtube$/i.test(stripped)) ? stripped : (document.title || 'YouTube 视频');
      },
      findVideoElement() {
        const main = document.querySelector('video.html5-main-video');
        if (main) return main;
        const fallback = document.querySelector('video');
        if (fallback && fallback.duration > 0) return fallback;
        return fallback;
      },
      findProgressBar() {
        const candidates = ['.ytp-progress-bar', '.ytp-progress-container'];
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (el && el.getBoundingClientRect().width > 0) return el;
        }
        return null;
      },
      findMarkerHost(bar) {
        const wrap = bar.closest('.ytp-progress-bar-container, .ytp-progress-container');
        return wrap || bar;
      }
    }
  };

  function isVideoPage() { const p = detectVideoPlatform(); return !!p && VIDEO_PLATFORMS[p].isVideoPage(); }
  function getVideoKey() { const p = detectVideoPlatform(); return p ? VIDEO_PLATFORMS[p].getVideoKey() : null; }
  function getVideoTitle() { const p = detectVideoPlatform(); return p ? VIDEO_PLATFORMS[p].getVideoTitle() : document.title; }
  function findVideoElement() { const p = detectVideoPlatform(); return p ? VIDEO_PLATFORMS[p].findVideoElement() : document.querySelector('video'); }
  function findVideoProgressBar() { const p = detectVideoPlatform(); return p ? VIDEO_PLATFORMS[p].findProgressBar() : null; }

  function getVideoMarkerHost(bar) {
    const platform = detectVideoPlatform();
    const host = platform ? VIDEO_PLATFORMS[platform].findMarkerHost(bar) : bar;
    if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    return host;
  }

  function positionMarkerInHost(dot, host, bar, pct) {
    const hostRect = host.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    dot.style.left = `${(barRect.left - hostRect.left) + (pct / 100) * barRect.width}px`;
    dot.style.top = `${(barRect.top - hostRect.top) + barRect.height / 2}px`;
  }

  function formatVideoTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function initVideoMarkFeature() {
    if (!detectVideoPlatform()) return;
    document.addEventListener('keydown', onVideoMarkKeydown);
    ensureVideoMarkButton();
    renderVideoMarkers();

    setInterval(() => {
      ensureVideoMarkButton();
      renderVideoMarkersIfChanged();
    }, MARKER_POLL_INTERVAL);

    window.addEventListener('remark:urlchange', () => {
      hideMarkTooltip();
      videoMarkRenderedIds = new Set();
      healedVideoKeys.clear();
      renderVideoMarkers();
    });
  }

  function onVideoMarkKeydown(e) {
    if (!((e.metaKey || e.ctrlKey) && (e.key === 'm' || e.key === 'M'))) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
    if (!isVideoPage()) return;
    e.preventDefault();
    recordVideoMark();
  }

  function ensureVideoMarkButton() {
    let btn = document.getElementById('remark-video-mark-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'remark-video-mark-btn';
      btn.title = '记录当前视频时间点（⌘M / Ctrl+M）';
      btn.innerHTML = '<span class="remark-video-mark-btn-icon">⏱️</span><span class="remark-video-mark-btn-label">打点</span>';
      document.body.appendChild(btn);
      btn.addEventListener('click', (e) => { e.stopPropagation(); recordVideoMark(); });
    }
    const visible = isVideoPage() && !!findVideoElement();
    btn.style.display = visible ? 'flex' : 'none';
  }

  async function recordVideoMark() {
    const video = findVideoElement();
    if (!video) return;
    const t = video.currentTime;
    if (!isFinite(t) || t < 0) return;

    const vkey = getVideoKey();
    if (!vkey) return;

    const marks = await ReMarkStorage.getVideoMarks();
    const existing = marks.find(m => m.videoKey === vkey && Math.abs(m.time - t) < 1);
    if (existing) {
      video.currentTime = existing.time;
      showToast(`⏱️ ${formatVideoTime(existing.time)} 已记录过，已为你跳转`);
      return;
    }

    const savedMark = await ReMarkStorage.addVideoMark({
      url: window.location.href.split('#')[0],
      videoKey: vkey,
      time: Math.round(t * 10) / 10,
      duration: isFinite(video.duration) ? Math.floor(video.duration) : 0,
      title: getVideoTitle()
    });

    notifyStorageUpdated();
    renderVideoMarkers();
    // No toast — the dot appearing on the progress bar is the visual confirmation
  }

  async function healVideoMarkTitles(vkey) {
    if (!vkey) return false;
    const title = getVideoTitle();
    if (!title || /^(youtube|bilibili|哔哩哔哩|youtube 视频)$/i.test(title)) return false;
    const marks = await ReMarkStorage.getVideoMarks();
    let updated = false;
    marks.forEach(m => {
      if (m.videoKey === vkey && (!m.title || /^(youtube|bilibili|哔哩哔哩)$/i.test(m.title))) {
        m.title = title;
        updated = true;
      }
    });
    if (updated) {
      await ReMarkStorage.set(ReMarkStorage.KEYS.VIDEO_MARKS, marks);
      notifyStorageUpdated();
    }
    healedVideoKeys.add(vkey);
    return updated;
  }

  function renderVideoMarkersIfChanged() {
    const video = findVideoElement();
    const bar = findVideoProgressBar();
    const dur = video ? video.duration : 0;
    const sig = bar ? `${bar.getBoundingClientRect().width}:${isFinite(dur) ? Math.round(dur) : 0}:${!!video}` : 'nobar';
    if (videoMarkRenderSig === sig) return;
    videoMarkRenderSig = sig;
    renderVideoMarkers();
  }

  async function renderVideoMarkers() {
    if (!isVideoPage()) return;
    const video = findVideoElement();
    const bar = findVideoProgressBar();
    if (!video || !bar) return;
    const dur = video.duration;
    if (!isFinite(dur) || dur <= 0) return;
    const vkey = getVideoKey();
    if (!vkey) return;

    if (!healedVideoKeys.has(vkey)) {
      healVideoMarkTitles(vkey).then((did) => { if (did) renderVideoMarkers(); });
    }

    const host = getVideoMarkerHost(bar);
    host.querySelectorAll('.remark-video-mark').forEach(el => el.remove());
    hideMarkTooltip();

    const marks = await ReMarkStorage.getVideoMarks();
    const forVideo = marks.filter(m => m.videoKey === vkey);
    const newIds = new Set();

    forVideo.forEach(m => {
      const pct = Math.min(100, Math.max(0, (m.time / dur) * 100));
      const dot = document.createElement('div');
      dot.className = 'remark-video-mark';
      dot.title = formatVideoTime(m.time);
      dot.addEventListener('mouseenter', () => showMarkTooltip(dot, m));
      dot.addEventListener('mouseleave', () => scheduleHideMarkTooltip());
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        video.currentTime = m.time;
        if (video.paused) video.play().catch(() => {});
      });
      host.appendChild(dot);
      positionMarkerInHost(dot, host, bar, pct);
      newIds.add(m.id);
      if (!videoMarkRenderedIds.has(m.id)) {
        void dot.offsetWidth;
        dot.classList.add('pop');
      }
    });

    videoMarkRenderedIds = newIds;
  }

  function showMarkTooltip(dot, mark) {
    if (markTooltipHideTimer) { clearTimeout(markTooltipHideTimer); markTooltipHideTimer = null; }
    hideMarkTooltip();
    const tip = document.createElement('div');
    tip.className = 'remark-video-mark-tip';
    tip.innerHTML = `<span class="remark-video-mark-tip-time">${formatVideoTime(mark.time)}</span><button class="remark-video-mark-tip-del" type="button" title="删除此标记" aria-label="删除此标记">×</button>`;
    document.body.appendChild(tip);
    markTooltipEl = tip;

    const r = dot.getBoundingClientRect();
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${r.top - 8}px`;
    tip.style.transform = 'translate(-50%, -100%)';

    tip.addEventListener('mouseenter', () => { if (markTooltipHideTimer) { clearTimeout(markTooltipHideTimer); markTooltipHideTimer = null; } });
    tip.addEventListener('mouseleave', () => scheduleHideMarkTooltip());
    tip.querySelector('.remark-video-mark-tip-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await ReMarkStorage.deleteVideoMark(mark.id);
      hideMarkTooltip();
      renderVideoMarkers();
      notifyStorageUpdated();
    });
  }

  function scheduleHideMarkTooltip() {
    if (markTooltipHideTimer) clearTimeout(markTooltipHideTimer);
    markTooltipHideTimer = setTimeout(() => { markTooltipHideTimer = null; hideMarkTooltip(); }, 320);
  }

  function hideMarkTooltip() {
    if (markTooltipEl) { markTooltipEl.remove(); markTooltipEl = null; }
  }

  function seekVideoToMark(time) {
    const video = findVideoElement();
    if (!video || !isFinite(time)) return;
    video.currentTime = time;
    if (video.paused) video.play().catch(() => {});
  }

  function showToast(msg) {
    const existing = document.getElementById('remark-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'remark-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }
})();
