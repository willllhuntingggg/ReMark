/**
 * ReMark Content Script
 * ⌘/Ctrl + drag-select to silently highlight text.
 * Notes are added later in the side panel.
 */

(function () {
  if (window.__remark_loaded__) return;
  const t = ReMarkI18n.t;
  window.__remark_loaded__ = true;

  let currentSelection = null;
  let loadedClipsForPage = [];
  const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DEFAULT_HIGHLIGHT_COLOR = '#FFE066';
  function applyMarkContrastTheme() {
    const readColor = (value) => { const match = String(value || '').match(/rgba?\(([^)]+)\)/); if (!match) return null; const parts = match[1].split(',').map((part) => Number.parseFloat(part)); if (parts.length < 3 || (parts.length > 3 && parts[3] === 0)) return null; return parts; };
    const bodyColor = document.body ? readColor(getComputedStyle(document.body).backgroundColor) : null;
    const rootColor = readColor(getComputedStyle(document.documentElement).backgroundColor);
    const rgb = bodyColor || rootColor || [255, 255, 255];
    const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    document.documentElement.classList.toggle('remark-page-light', luminance >= 150);
  }
  applyMarkContrastTheme();
  window.addEventListener('load', applyMarkContrastTheme, { once: true });


  // Initialize storage and apply the saved language before rendering ReMark UI.
  ReMarkStorage.init().then(async () => {
    const settings = await ReMarkStorage.getSettings();
    ReMarkI18n.setLocale(settings.language);
    ReMarkI18n.apply();
    showFirstUseGuide();
    schedulePageHighlightRestore();
    watchForUrlChanges();
    initVideoMarkFeature();
  });

  // Re-render video markers and synchronize language after storage updates.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      const settings = changes?.[ReMarkStorage.KEYS.SETTINGS]?.newValue;
      if (settings?.language) {
        ReMarkI18n.setLocale(settings.language);
        ReMarkI18n.apply();
      }
      renderVideoMarkers();
    });
  }

  function schedulePageHighlightRestore() {
    const restore = () => { void restorePageHighlights(); };
    restore();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore, { once: true });
    window.addEventListener('load', restore, { once: true });
    // Fixed retries cover slow first paints...
    [800, 2200, 4000, 7000].forEach((delay) => window.setTimeout(restore, delay));
    // ...and a debounced MutationObserver catches content that renders much
    // later (SPA routes, lazy loading, comments). It stops as soon as every
    // clip is restored, and hard-stops after 20s.
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        restorePageHighlights().then((allDone) => { if (allDone) observer.disconnect(); });
      }, 500);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 20000);
  }
  let onboardingTutorial = null;

  async function showFirstUseGuide(options = {}) {
    if (document.getElementById('remark-onboarding-tutorial')) return;
    const manual = Boolean(options.manual);
    try {
      if (!manual && await ReMarkStorage.getOnboardingStatus() !== 'not_started') return;
      const videoSupported = isVideoPage();
      const modal = document.createElement('div');
      modal.id = 'remark-onboarding-tutorial';
      modal.className = 'remark-onboarding';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', t('onboarding_title'));
      modal.innerHTML = [
        '<div class="remark-onboarding-card">',
        `<button class="remark-onboarding-close" type="button" aria-label="${t('onboarding_close')}">×</button>`,
        `<h2>${t('onboarding_title')}</h2>`,
        `<p class="remark-onboarding-subtitle">${t('onboarding_subtitle')}</p>`,
        '<section class="remark-onboarding-step" data-step="text">',
        `<div><h3>${t('onboarding_text_title')}</h3><p>${t('onboarding_text_instruction')}</p></div>`,
        `<p class="remark-onboarding-sample" data-onboarding-text>${t('onboarding_text_sample')}</p>`,
        `<span class="remark-onboarding-done" hidden>✓ ${t('onboarding_marked')}</span>`,
        '</section>',
        '<section class="remark-onboarding-step" data-step="video">',
        `<div><h3>${t('onboarding_video_title')}</h3><p>${t(videoSupported ? 'onboarding_video_supported' : 'onboarding_video_unsupported')}</p></div>`,
        videoSupported ? '' : `<div class="remark-onboarding-links"><button type="button" data-tutorial-platform="youtube">${t('onboarding_try_youtube')}</button><button type="button" data-tutorial-platform="bilibili">${t('onboarding_try_bilibili')}</button></div>`,
        `<span class="remark-onboarding-done" hidden>✓ ${t('onboarding_marked')}</span>`,
        '</section>',
        '<div class="remark-onboarding-actions">',
        `<button class="remark-onboarding-dismiss" type="button">${t('onboarding_dismiss')}</button>`,
        `<button class="remark-onboarding-finish" type="button" disabled>${t('onboarding_finish')}</button>`,
        '</div></div>'
      ].join('');
      document.documentElement.appendChild(modal);
      onboardingTutorial = { modal, manual, textDone: false, videoDone: false };
      bindOnboardingTutorial(onboardingTutorial);
    } catch (error) {
      console.warn('[ReMark] Onboarding unavailable:', error);
    }
  }
  function bindOnboardingTutorial(tutorial) {
    const { modal } = tutorial;
    const close = (status) => { void closeOnboardingTutorial(status); };
    modal.querySelector('.remark-onboarding-close')?.addEventListener('click', () => close('dismissed'));
    modal.querySelector('.remark-onboarding-dismiss')?.addEventListener('click', () => close('dismissed'));
    modal.querySelector('.remark-onboarding-finish')?.addEventListener('click', () => close('completed'));
    modal.querySelectorAll('[data-tutorial-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        const platform = button.dataset.tutorialPlatform;
        const url = platform === 'bilibili' ? 'https://www.bilibili.com' : 'https://www.youtube.com';
        window.open(url, '_blank', 'noopener');
      });
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close('dismissed');
    });
    const onEscape = (event) => {
      if (event.key !== 'Escape' || !document.documentElement.contains(modal)) return;
      document.removeEventListener('keydown', onEscape);
      close('dismissed');
    };
    document.addEventListener('keydown', onEscape);
  }

  async function closeOnboardingTutorial(status) {
    const tutorial = onboardingTutorial;
    if (!tutorial) return;
    onboardingTutorial = null;
    tutorial.modal.remove();
    if (!tutorial.manual) await ReMarkStorage.setOnboardingStatus(status);
  }

  function markOnboardingStep(step) {
    const tutorial = onboardingTutorial;
    if (!tutorial) return;
    const key = step === 'video' ? 'videoDone' : 'textDone';
    tutorial[key] = true;
    const section = tutorial.modal.querySelector(`[data-step="${step}"]`);
    section?.classList.add('is-complete');
    const done = section?.querySelector('.remark-onboarding-done');
    if (done) done.hidden = false;
    const finish = tutorial.modal.querySelector('.remark-onboarding-finish');
    if (finish) finish.disabled = !(tutorial.textDone || tutorial.videoDone);
  }

  function isTutorialTextRange(range) {
    const sample = onboardingTutorial?.modal.querySelector('[data-onboarding-text]');
    return Boolean(sample && range && sample.contains(range.startContainer) && sample.contains(range.endContainer));
  }

  // ⌘/Ctrl + mouseup → silent highlight. Capture phase blocks page popup handlers.
  // Start a Mark + Note drag from a clean selection state. This listener is
  // deliberately limited to ReMark's primary-button modifier gesture; it does
  // not prevent the event or alter ordinary Chrome Shift-click selection.
  function isMarkNoteDragStart(event) {
    return event.button === 0
      && event.shiftKey
      && (event.metaKey || event.ctrlKey);
  }

  document.addEventListener('mousedown', (event) => {
    if (!isMarkNoteDragStart(event)) return;
    const selection = window.getSelection();
    if (selection?.rangeCount) selection.removeAllRanges();
  }, true);

  function suppressSelectionFollowupClick() {
    const swallow = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener('click', swallow, true);
    };
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true), 650);
  }
  // AI chat UIs (e.g. ChatGPT writing blocks and code blocks) render generated
  // content inside contenteditable editors (ProseMirror / CodeMirror). Those
  // blocks are page content the user wants to mark, not user input, so they
  // stay markable while real inputs remain protected.
  const AI_GENERATED_BLOCK_SELECTOR = [
    // ChatGPT writing blocks — inline and full-screen editor.
    '[data-testid="writing-block-container"]',
    '[data-writing-block="true"]',
    '[data-writing-block-fullscreen-editor-region="true"]',
    // ChatGPT / Claude code blocks (classic <pre> render).
    'pre.code-block__code',
    // Editable CodeMirror / ProseMirror editors inside assistant replies.
    // Matches both the classic article wrapper and the newer turn containers.
    '[data-message-author-role] .cm-editor',
    '[data-message-author-role] .cm-content',
    '[data-message-author-role] .ProseMirror',
    '.agent-turn .cm-editor',
    '.agent-turn .cm-content',
    '.agent-turn .ProseMirror'
  ].join(',');
  function isEditableSelection(selection) {
    const node = selection?.anchorNode;
    if (!node) return false;
    const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!parent?.closest) return false;
    if (parent.closest('input, textarea')) return true;
    const editable = parent.closest('[contenteditable]');
    if (!editable) return false;
    return !editable.closest(AI_GENERATED_BLOCK_SELECTOR);
  }
  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    const range = (() => { try { return selection && selection.rangeCount ? selection.getRangeAt(0) : null; } catch (_) { return null; } })();
    if (!text || text.length < 2 || !range || isEditableSelection(selection)) { hideMarkPill(); return; }
    if (!(event.metaKey || event.ctrlKey)) {
      // Plain selection: offer a one-click Mark pill next to the selection.
      if (isTutorialTextRange(range)) { hideMarkPill(); return; }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      showMarkPill({ text, range: range.cloneRange() }, { x: event.clientX, y: event.clientY });
      return;
    }
    try {
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressSelectionFollowupClick();
      currentSelection = { text, range: range.cloneRange() };
      quickHighlightSelection(DEFAULT_HIGHLIGHT_COLOR, {
        withNote: event.shiftKey,
        anchorRect: rect,
        tutorialStep: isTutorialTextRange(range) ? 'text' : null
      });
    } catch (error) {
      console.warn('[ReMark] Error handling selection:', error);
    }
  }, true);

  // Listen for messages from sidepanel / background
  chrome.runtime.onMessage?.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'CONTEXT_HIGHLIGHT') {
      const selectedText = window.getSelection().toString().trim();
      if (selectedText) quickHighlightSelection(DEFAULT_HIGHLIGHT_COLOR);
    } else if (msg.action === 'REPLAY_ONBOARDING') {
      void showFirstUseGuide({ manual: true });
    } else if (msg.action === 'RESTORE_HIGHLIGHTS') {
      restorePageHighlights();
    } else if (msg.action === 'LOCATE_CLIP') {
      locateAndAnimateClip(msg.clipId);
    } else if (msg.action === 'DELETE_CLIP_FROM_PAGE') {
      removeClipHighlightFromDOM(msg.clipId);
    } else if (msg.action === 'DELETE_PAGE_CLIPS_FROM_PAGE') {
      removeAllPageHighlightsFromDOM();
    } else if (msg.action === 'COMPUTE_CLIP_POSITIONS') {
      void computeClipPositionsForPage();
    } else if (msg.action === 'REFRESH_VIDEO_MARKS' || msg.action === 'VIDEO_MARK_DELETED') {
      renderVideoMarkers();
    } else if (msg.action === 'SEEK_VIDEO_MARK') {
      seekVideoToMark(msg.time);
    }
  });
  async function deletePageClip(clipId) {
    const clips = await ReMarkStorage.getClips();
    const item = clips.find((clip) => clip.id === clipId);
    if (!item) return false;
    await ReMarkStorage.deleteClip(clipId);
    await ReMarkStorage.pushUndo({ type: 'delete_clip', item });
    removeClipHighlightFromDOM(clipId);
    notifyStorageUpdated();
    showPageToast(t('mark_deleted'), {
      label: t('undo'),
      onAction: async () => { await undoPageAction(); }
    });
    return true;
  }
  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (_) {}
      area.remove();
    }
  }
  async function copyPageClip(clipId) {
    const clips = await ReMarkStorage.getClips();
    const item = clips.find((clip) => clip.id === clipId);
    if (!item) return;
    const payload = `“${item.text}”${item.note ? `\n\n${item.note}` : ''}`;
    await copyTextToClipboard(payload);
    showPageToast(t('copied'));
  }
  async function openPageNoteEditor(clipId, anchor) {
    const item = (await ReMarkStorage.getClips()).find((clip) => clip.id === clipId);
    if (!item) return;
    const mark = anchor || getHighlightActionAnchor(clipId);
    openQuickNoteInput({
      rect: mark?.getBoundingClientRect(),
      initialValue: item.note || '',
      onSave: async (note) => {
        if (!note) return;
        await ReMarkStorage.updateClip(clipId, { note });
        await setClipNoteIndicator(clipId);
        notifyStorageUpdated();
      }
    });
  }
  // Page marks are never "selected"; only ⌘/Ctrl+Z undo stays as a shortcut.
  document.addEventListener('keydown', async (event) => {
    const editing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (editing || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    await undoPageAction();
  });
  async function undoPageAction() {
    const action = await ReMarkStorage.get(ReMarkStorage.KEYS.UNDO);
    if (!action || !(await ReMarkStorage.undoLast())) return false;
    if (action.type === 'restore_clip' && action.id) {
      removeClipHighlightFromDOM(action.id, { immediate: true });
    } else if (action.type === 'delete_clip' && action.item?.id) {
      cancelClipHighlightRemoval(action.item.id);
      await restorePageHighlights();
    }
    renderVideoMarkers();
    notifyStorageUpdated();
    return true;
  }
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

  // Locate clip by ID, scroll into view and play animation.
  function locateAndAnimateClip(clipId, attempt = 0) {
    const mark = document.querySelector(`mark[data-clip-id="${clipId}"]`);
    if (mark) {
      performLocateAnimation(mark);
      return;
    }
    if (attempt >= 5) { reportSourceUnavailable(clipId); return; }
    Promise.resolve(restorePageHighlights()).finally(() => {
      setTimeout(() => locateAndAnimateClip(clipId, attempt + 1), 250 + attempt * 300);
    });
  }
  function reportSourceUnavailable(clipId) {
    showPageToast(t('source_unavailable'));
    try { chrome.runtime?.sendMessage({ action: 'SOURCE_MARK_UNAVAILABLE', clipId, url: window.location.href }); } catch (_) {}
  }
  function performLocateAnimation(mark) {
    const focus = () => {
      mark.classList.remove('remark-locate-pulse');
      void mark.offsetWidth;
      mark.classList.add('remark-locate-pulse');
      setTimeout(() => mark.classList.remove('remark-locate-pulse'), 1300);
    };
    const rect = mark.getBoundingClientRect();
    const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (visible) { focus(); return; }
    try {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (_) {
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.4), behavior: 'smooth' });
    }
    setTimeout(focus, 520);
  }

  function cancelClipHighlightRemoval(clipId) {
    document.querySelectorAll(`mark[data-clip-id="${clipId}"]`).forEach((mark) => {
      delete mark.dataset.remarkRemovalPending;
      mark.classList.remove('remark-remove-fade');
    });
  }
  function removeClipHighlightFromDOM(clipId, options = {}) {
    const marks = [...document.querySelectorAll(`mark[data-clip-id="${clipId}"]`)];
    if (!marks.length) return;
    const remove = () => {
      const parents = new Set();
      marks.forEach((mark) => {
        if (!options.immediate && mark.dataset.remarkRemovalPending !== 'true') return;
        const parent = mark.parentNode;
        if (!parent) return;
        mark.querySelectorAll('.remark-note-control, .remark-note-hint, .remark-mark-actions, .remark-mark-actions-anchor').forEach((node) => node.remove());
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parents.add(parent);
      });
      parents.forEach((parent) => parent.normalize());
    };
    if (options.immediate) { remove(); return; }
    marks.forEach((mark) => {
      mark.dataset.remarkRemovalPending = 'true';
      mark.classList.add('remark-remove-fade');
    });
    setTimeout(remove, 280);
  }
  function removeAllPageHighlightsFromDOM() {
    const marks = document.querySelectorAll('mark.remark-highlight-mark');
    marks.forEach((mark, i) => {
      setTimeout(() => {
        mark.classList.add('remark-remove-fade');
        setTimeout(() => {
          const parent = mark.parentNode;
          if (parent) {
            mark.querySelectorAll('.remark-note-control, .remark-note-hint, .remark-mark-actions, .remark-mark-actions-anchor').forEach((node) => node.remove());
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
          }
        }, 280);
      }, i * 40);
    });
  }

  // Silent highlight — no popup, no toast
  async function quickHighlightSelection(colorCode, options = {}) {
    const sel = currentSelection;
    if (!sel || !sel.text) return;

    const { text, range } = sel;
    currentSelection = null;

    if (options.tutorialStep) {
      const tutorialClip = {
        id: `tutorial_text_${Date.now()}`,
        color: colorCode,
        note: ''
      };
      if (range) {
        highlightDOMRange(range, tutorialClip);
        window.getSelection()?.removeAllRanges();
      }
      markOnboardingStep(options.tutorialStep);
      window.setTimeout(() => removeClipHighlightFromDOM(tutorialClip.id), 1200);
      return;
    }

    const clipData = {
      url: window.location.href,
      pageTitle: document.title,
      text,
      sourcePosition: range ? Math.round(range.getBoundingClientRect().top + window.scrollY) : null,
      sourcePositionX: range ? Math.round(range.getBoundingClientRect().left) : null,
      color: colorCode,
      note: ''
    };

    const savedClip = await ReMarkStorage.addClip(clipData);
    await ReMarkStorage.pushUndo({ type: 'restore_clip', id: savedClip.id });
    if (range) {
      highlightDOMRange(range, savedClip, true);
      if (!options.suppressActions) showHighlightActions(savedClip.id, 2800);
      window.getSelection()?.removeAllRanges();
    }
    notifyStorageUpdated();
    if (options.withNote) openQuickNoteInput({
      rect: options.anchorRect || range?.getBoundingClientRect(),
      onSave: async (note) => {
        if (!note) return;
        await ReMarkStorage.updateClip(savedClip.id, { note });
        setClipNoteIndicator(savedClip.id);
        notifyStorageUpdated();
      }
    });
    return savedClip;
  }

  function openQuickNoteInput({ rect, onSave, initialValue = '', above = false }) {
    document.getElementById('remark-quick-note')?.remove();
    const anchor = rect || { left: window.innerWidth / 2 - 140, bottom: window.innerHeight / 2 };
    const shell = document.createElement('div');
    shell.id = 'remark-quick-note';
    shell.className = 'remark-quick-note';
    shell.style.left = `${Math.max(12, Math.min(anchor.left || 12, window.innerWidth - 292))}px`;
    shell.innerHTML = `<textarea aria-label="${t('add_note')}" placeholder="${t('note_placeholder')}"></textarea><span>${t('note_save_hint')}</span>`;
    document.documentElement.appendChild(shell);
    if (above) {
      // Place the note field above the anchor so it never covers the flag.
      shell.style.top = `${Math.max(12, Math.min((anchor.top || 12) - shell.offsetHeight - 8, window.innerHeight - shell.offsetHeight - 8))}px`;
    } else {
      shell.style.top = `${Math.max(12, Math.min((anchor.bottom || 12) + 8, window.innerHeight - 118))}px`;
    }
    const input = shell.querySelector('textarea');
    input.value = initialValue;
    input.setSelectionRange(initialValue.length, initialValue.length);
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      try {
        await onSave(value);
        if (value) showNoteSavedChip(shell.getBoundingClientRect());
      } finally { shell.remove(); }
    };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void finish(); } if (event.key === 'Escape') { event.preventDefault(); void finish(); } });
    input.addEventListener('blur', () => setTimeout(() => { if (!shell.contains(document.activeElement)) void finish(); }, 0));
    input.focus();
  }

  function showNoteSavedChip(rect) {
    document.querySelector('.remark-note-saved-chip')?.remove();
    const chip = document.createElement('div');
    chip.className = 'remark-note-saved-chip';
    chip.textContent = '✓ ' + t('note_saved');
    document.body.appendChild(chip);
    const left = Math.max(12, Math.min((rect?.left ?? window.innerWidth / 2) + 10, window.innerWidth - 150));
    const top = Math.max(12, (rect?.bottom ?? 48) + 10);
    chip.style.left = left + 'px';
    chip.style.top = top + 'px';
    window.setTimeout(() => chip.remove(), 1500);
  }

  // Lightweight, auto-dismissing toast with an optional undo action.
  function showPageToast(message, options = {}) {
    let root = document.getElementById('remark-page-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'remark-page-toast-root';
      root.className = 'remark-toast-root';
      document.body.appendChild(root);
    }
    root.textContent = '';
    const toast = document.createElement('div');
    toast.className = 'remark-toast';
    const textNode = document.createElement('span');
    textNode.textContent = message;
    toast.appendChild(textNode);
    if (options.label && options.onAction) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'remark-toast-action';
      action.textContent = options.label;
      action.addEventListener('click', () => { hidePageToast(); void options.onAction(); });
      toast.appendChild(action);
    }
    root.appendChild(toast);
    clearTimeout(showPageToast.timer);
    showPageToast.timer = window.setTimeout(hidePageToast, options.duration ?? 4200);
  }
  function hidePageToast() {
    clearTimeout(showPageToast.timer);
    document.getElementById('remark-page-toast-root')?.remove();
  }

  // ========= One-click Mark pill =========
  // The floating action row is always [Mark] [Note] [Copy]. The Mark
  // button is a toggle: unmarked → create the highlight; marked (filled
  // pen + check) → click again to unmark. The state flips in place — the
  // row never disappears or flashes. The row dismisses itself, but never
  // while the pointer is over it; every button shows a hover tooltip
  // (data-hint), like the anchored actions.
  // Official Font Awesome solid icons (CC BY 4.0, Fonticons Inc.):
  // fa-highlighter / fa-note-sticky / fa-copy. The marked state reuses the
  // highlighter — the gold button background carries the state signal.
  const MARK_PILL_ICON = '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M315 315l158.4-215L444.1 70.6 229 229 315 315zm-187 5l0 0V248.3c0-15.3 7.2-29.6 19.5-38.6L420.6 8.4C428 2.9 437 0 446.2 0c11.4 0 22.4 4.5 30.5 12.6l54.8 54.8c8.1 8.1 12.6 19 12.6 30.5c0 9.2-2.9 18.2-8.4 25.6L334.4 396.5c-9 12.3-23.4 19.5-38.6 19.5H224l-25.4 25.4c-12.5 12.5-32.8 12.5-45.3 0l-50.7-50.7c-12.5-12.5-12.5-32.8 0-45.3L128 320zM7 466.3l63-63 70.6 70.6-31 31c-4.5 4.5-10.6 7-17 7H24c-13.3 0-24-10.7-24-24v-4.7c0-6.4 2.5-12.5 7-17z"/></svg>';
  const MARKED_PILL_ICON = MARK_PILL_ICON;
  const NOTE_BTN_ICON = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H288V368c0-26.5 21.5-48 48-48H448V96c0-35.3-28.7-64-64-64H64zM448 352H402.7 336c-8.8 0-16 7.2-16 16v66.7V480l32-32 64-64 32-32z"/></svg>';
  const COPY_BTN_ICON = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M208 0H332.1c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9V336c0 26.5-21.5 48-48 48H208c-26.5 0-48-21.5-48-48V48c0-26.5 21.5-48 48-48zM48 128h80v64H64V448H256V416h64v48c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V176c0-26.5 21.5-48 48-48z"/></svg>';
  const DELETE_BTN_ICON = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"/></svg>';
  let markPillEl = null;
  let markPillContext = null;  // { text, range } while in the selection state
  let markPillClipId = null;   // clip id once the row morphed to the highlighted state
  let markPillHideTimer = null;
  function makePillAction(kind, icon, hint, onClick, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `remark-mark-action remark-mark-action--${kind}${extraClass ? ' ' + extraClass : ''}`;
    button.dataset.hint = hint;
    button.setAttribute('aria-label', hint);
    button.innerHTML = icon;
    button.__pillAction = onClick;
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
    return button;
  }
  function setPillButtons(state, clipId) {
    const el = markPillEl;
    if (!el) return;
    el.querySelectorAll('.remark-mark-action').forEach((node) => node.remove());
    el.append(
      makePillAction('mark', MARK_PILL_ICON, '', () => {}),
      makePillAction('note', NOTE_BTN_ICON, '', () => {}),
      makePillAction('copy', COPY_BTN_ICON, '', () => {})
    );
    updatePillMarkState(state === 'highlight', clipId);
  }
  // Flip only the buttons' state in place — the row never disappears.
  function updatePillMarkState(marked, clipId) {
    const el = markPillEl;
    if (!el) return;
    const markBtn = el.querySelector('.remark-mark-action--mark');
    const noteBtn = el.querySelector('.remark-mark-action--note');
    const copyBtn = el.querySelector('.remark-mark-action--copy');
    if (markBtn) {
      if (marked) {
        markBtn.classList.add('remark-mark-action--marked');
        markBtn.innerHTML = MARKED_PILL_ICON;
        markBtn.dataset.hint = t('unmark');
        markBtn.__pillAction = () => { hideMarkPill(); void deletePageClip(clipId); };
      } else {
        markBtn.classList.remove('remark-mark-action--marked');
        markBtn.innerHTML = MARK_PILL_ICON;
        markBtn.dataset.hint = t('mark_action');
        markBtn.__pillAction = () => { void markFromPill(); };
      }
      markBtn.setAttribute('aria-label', markBtn.dataset.hint);
    }
    if (noteBtn) {
      noteBtn.dataset.hint = marked ? `${t('add_note')} · Shift+Enter` : t('add_note');
      noteBtn.setAttribute('aria-label', noteBtn.dataset.hint);
      noteBtn.__pillAction = marked
        ? () => { void openPageNoteEditor(clipId, getHighlightActionAnchor(clipId)); }
        : () => { void markFromPill({ withNote: true }); };
    }
    if (copyBtn) {
      copyBtn.dataset.hint = t('copy');
      copyBtn.setAttribute('aria-label', t('copy'));
      copyBtn.__pillAction = marked
        ? () => { void copyPageClip(clipId); }
        : () => { copySelectionFromPill(); };
    }
  }
  function showMarkPill(context, point) {
    clearTimeout(markPillHideTimer);
    markPillContext = context;
    markPillClipId = null;
    let el = markPillEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'remark-mark-actions remark-mark-pill';
      el.addEventListener('mouseenter', () => clearTimeout(markPillHideTimer));
      el.addEventListener('mouseleave', () => scheduleMarkPillHide(600));
      el.addEventListener('click', (event) => {
        const btn = event.target.closest('.remark-mark-action');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        if (btn.__pillAction) btn.__pillAction();
      });
      document.body.appendChild(el);
      markPillEl = el;
    }
    setPillButtons('selection');
    positionMarkPill(el, point);
    void el.offsetWidth;
    el.classList.add('is-visible');
    scheduleMarkPillHide();
  }
  function positionMarkPill(el, point) {
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 70);
    const height = Math.max(rect.height, 28);
    let left = point.x - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = point.y + 12;
    if (top + height > window.innerHeight - 8) top = point.y - height - 10;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
  function scheduleMarkPillHide(delay = 2500) {
    clearTimeout(markPillHideTimer);
    markPillHideTimer = window.setTimeout(() => {
      if (markPillEl) markPillEl.classList.remove('is-visible');
    }, delay);
  }
  function hideMarkPill() {
    clearTimeout(markPillHideTimer);
    if (markPillEl) { markPillEl.remove(); markPillEl = null; }
    markPillContext = null;
    markPillClipId = null;
  }
  function copySelectionFromPill() {
    const ctx = markPillContext;
    if (!ctx || !ctx.text) return;
    void copyTextToClipboard(ctx.text);
    showPageToast(t('copied'));
  }
  async function markFromPill(options = {}) {
    const ctx = markPillContext;
    if (!ctx || !ctx.text || !ctx.range) return;
    markPillContext = null;
    try {
      currentSelection = { text: ctx.text, range: ctx.range.cloneRange() };
      const saved = await quickHighlightSelection(DEFAULT_HIGHLIGHT_COLOR, {
        anchorRect: ctx.range.getBoundingClientRect(),
        withNote: Boolean(options.withNote),
        suppressActions: true
      });
      if (!saved || !markPillEl) { hideMarkPill(); return; }
      markPillClipId = saved.id;
      // Only the buttons' state flips — the row stays fixed, no flash.
      updatePillMarkState(true, saved.id);
      scheduleMarkPillHide(4000);
    } catch (error) {
      console.warn('[ReMark] Mark from pill failed:', error);
      hideMarkPill();
    }
  }
  // Reappear while the pointer is over the selected range.
  document.addEventListener('mousemove', (event) => {
    const ctx = markPillContext;
    if (!ctx) return;
    let inside = false;
    try {
      const rects = ctx.range.getClientRects();
      for (const r of rects) {
        if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) { inside = true; break; }
      }
    } catch (_) {}
    if (inside) {
      if (!markPillEl || !markPillEl.classList.contains('is-visible')) showMarkPill(ctx, { x: event.clientX, y: event.clientY });
      else clearTimeout(markPillHideTimer);
    } else if (markPillEl?.classList.contains('is-visible')) {
      scheduleMarkPillHide(500);
    }
  });
  // Starting a new selection elsewhere hides the pill; clicking the pill itself must not.
  document.addEventListener('mousedown', (event) => {
    if (event.target.closest?.('.remark-mark-pill')) return;
    hideMarkPill();
  }, true);

  // DOM Highlighting Engine
  // fresh = true when the mark was just created by the user; it then lands
  // with a short ink sweep so the capture moment feels immediate.
  // ChatGPT writing/code blocks are editors (ProseMirror / CodeMirror) that
  // own and re-render their content DOM, so no durable page highlight can be
  // painted there. The clip is still saved — the sidebar record is the mark.
  function isAiEditorRange(range) {
    const node = range?.commonAncestorContainer;
    const el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el?.closest) return false;
    return Boolean(
      el.closest(AI_GENERATED_BLOCK_SELECTOR) ||
      el.closest('[contenteditable], .cm-editor, .cm-content, .ProseMirror')
    );
  }
  function highlightDOMRange(range, clip, fresh = false) {
    if (isAiEditorRange(range)) return;
    const markWithFresh = (mark) => {
      if (fresh) {
        mark.classList.add('remark-fresh');
        mark.addEventListener('animationend', () => mark.classList.remove('remark-fresh'), { once: true });
      }
    };
    const createMark = (showNote = false) => {
      const mark = document.createElement('mark');
      mark.className = `remark-highlight-mark ${showNote ? 'has-note' : ''}`;
      mark.setAttribute('data-clip-id', clip.id);
      markWithFresh(mark);
      return mark;
    };
    const textSegments = [];
    const root = range.commonAncestorContainer;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.length || !range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (parent?.closest('mark.remark-highlight-mark, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (start >= end) continue;
      const segment = document.createRange();
      segment.setStart(node, start);
      segment.setEnd(node, end);
      textSegments.push(segment);
    }
    if (root.nodeType === Node.TEXT_NODE && textSegments.length === 0) {
      const segment = document.createRange();
      segment.setStart(root, range.startOffset);
      segment.setEnd(root, range.endOffset);
      textSegments.push(segment);
    }
    try {
      if (textSegments.length) {
        textSegments.slice().reverse().forEach((segment) => {
          const showNote = Boolean(clip.note && segment === textSegments[0]);
          const mark = createMark(showNote);
          segment.surroundContents(mark);
          bindHighlightClick(mark, clip);
          if (showNote) attachNoteControl(mark, clip);
        });
        return;
      }
      const mark = createMark(Boolean(clip.note));
      range.surroundContents(mark);
      bindHighlightClick(mark, clip);
      if (clip.note) attachNoteControl(mark, clip);
    } catch (error) {
      console.warn('[ReMark] Highlight DOM range fallback:', error);
      try {
        const mark = createMark(Boolean(clip.note));
        const contents = range.extractContents();
        mark.appendChild(contents);
        range.insertNode(mark);
        bindHighlightClick(mark, clip);
        if (clip.note) attachNoteControl(mark, clip);
      } catch (fallbackError) {
        console.error('[ReMark] Fallback highlight failed:', fallbackError);
      }
    }
  }
  async function setClipNoteIndicator(clipId) {
    const marks = [...document.querySelectorAll(`mark[data-clip-id="${clipId}"]`)];
    marks.forEach((mark) => {
      mark.classList.remove('has-note');
      mark.querySelectorAll('.remark-note-control, .remark-note-hint, .remark-mark-actions, .remark-mark-actions-anchor').forEach((node) => node.remove());
    });
    const clip = (await ReMarkStorage.getClips()).find((item) => item.id === clipId);
    if (!clip?.note?.trim()) return;
    const target = marks.at(0);
    if (!target) return;
    target.classList.add('has-note');
    attachNoteControl(target, clip);
  }
  function attachNoteControl(mark, clip) {
    const note = String(clip?.note || '').trim();
    if (!mark || !note || mark.querySelector('.remark-note-control')) return;
    mark.classList.add('has-note');
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'remark-note-control';
    control.setAttribute('aria-label', t('edit_note'));
    control.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h8v8.3L8.2 14H4z"></path><path d="M5.8 5.2h4.4M5.8 7.5h4.4"></path></svg>';
    const hint = document.createElement('span');
    hint.className = 'remark-note-hint';
    hint.textContent = note;
    control.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = mark.getBoundingClientRect();
      openQuickNoteInput({
        rect,
        initialValue: note,
        onSave: async (value) => {
          if (!value) return;
          const updated = await ReMarkStorage.updateClip(clip.id, { note: value });
          if (updated) await setClipNoteIndicator(clip.id);
          notifyStorageUpdated();
        }
      });
    });
    mark.append(control, hint);
  }
  const highlightActionTimers = new Map();
  const highlightActionShowTimers = new Map();
  const HIGHLIGHT_ACTION_SHOW_DELAY = 350;
  function cancelHighlightActionShow(clipId) {
    const timer = highlightActionShowTimers.get(clipId);
    if (timer) window.clearTimeout(timer);
    highlightActionShowTimers.delete(clipId);
  }
  function scheduleHighlightActionShow(clipId) {
    cancelHighlightActionShow(clipId);
    highlightActionShowTimers.set(clipId, window.setTimeout(() => showHighlightActions(clipId), HIGHLIGHT_ACTION_SHOW_DELAY));
  }
  function getHighlightActionAnchor(clipId) {
    return [...document.querySelectorAll(`mark[data-clip-id="${clipId}"]`)].at(-1) || null;
  }
  function cancelHighlightActionHide(clipId) {
    const timer = highlightActionTimers.get(clipId);
    if (timer) window.clearTimeout(timer);
    highlightActionTimers.delete(clipId);
  }
  function scheduleHighlightActionHide(clipId, delay = 650) {
    cancelHighlightActionHide(clipId);
    highlightActionTimers.set(clipId, window.setTimeout(() => {
      const actions = getHighlightActionAnchor(clipId)?.querySelector('.remark-mark-actions');
      if (actions && !actions.matches(':hover')) actions.classList.remove('is-visible');
    }, delay));
  }
  function ensureHighlightActions(clipId) {
    const host = getHighlightActionAnchor(clipId);
    if (!host) return null;
    let mount = host.querySelector('.remark-mark-actions-anchor');
    if (!mount) {
      mount = document.createElement('span');
      mount.className = 'remark-mark-actions-anchor';
      host.appendChild(mount);
    }
    const existing = mount.querySelector('.remark-mark-actions');
    if (existing) return existing;
    const actions = document.createElement('span');
    actions.className = 'remark-mark-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', t('more_actions'));
    // The row is [mark ✓][note][copy]: the mark button is a toggle — click
    // it again to unmark (the previous delete).
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'remark-mark-action remark-mark-action--mark remark-mark-action--marked';
    mark.dataset.hint = t('unmark');
    mark.setAttribute('aria-label', t('unmark'));
    mark.innerHTML = MARKED_PILL_ICON;
    const note = document.createElement('button');
    note.type = 'button';
    note.className = 'remark-mark-action remark-mark-action--note';
    note.dataset.hint = `${t('add_note')} · Shift+Enter`;
    note.setAttribute('aria-label', t('add_note'));
    note.innerHTML = NOTE_BTN_ICON;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'remark-mark-action remark-mark-action--copy';
    copy.dataset.hint = t('copy');
    copy.setAttribute('aria-label', t('copy'));
    copy.innerHTML = COPY_BTN_ICON;
    const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
    mark.addEventListener('pointerdown', stop);
    note.addEventListener('pointerdown', stop);
    copy.addEventListener('pointerdown', stop);
    mark.addEventListener('click', async (event) => { stop(event); await deletePageClip(clipId); });
    note.addEventListener('click', async (event) => { stop(event); await openPageNoteEditor(clipId, host); });
    copy.addEventListener('click', async (event) => { stop(event); await copyPageClip(clipId); });
    actions.addEventListener('mouseenter', () => cancelHighlightActionHide(clipId));
    actions.addEventListener('mouseleave', () => scheduleHighlightActionHide(clipId));
    actions.append(mark, note, copy);
    mount.appendChild(actions);
    return actions;
  }
  function showHighlightActions(clipId, duration = 0) {
    const actions = ensureHighlightActions(clipId);
    if (!actions) return;
    cancelHighlightActionShow(clipId);
    cancelHighlightActionHide(clipId);
    actions.classList.add('is-visible');
    if (duration) window.setTimeout(() => scheduleHighlightActionHide(clipId, 0), duration);
  }
  // Page interaction shows ephemeral tools but deliberately has no persistent visual selection.
  function bindHighlightClick(element, clip) {
    element.addEventListener('click', (event) => {
      if (event.target.closest('.remark-note-control, .remark-mark-actions')) return;
      event.preventDefault();
      event.stopPropagation();
      showHighlightActions(clip.id);
    });
    element.addEventListener('mouseenter', () => scheduleHighlightActionShow(clip.id));
    element.addEventListener('mouseleave', () => { cancelHighlightActionShow(clip.id); scheduleHighlightActionHide(clip.id); });
  }

  function notifyStorageUpdated() {
    try {
      chrome.runtime?.sendMessage({ action: 'REMARK_STORAGE_UPDATED' });
    } catch (e) {
      // Ignored
    }
  }

  // Backfill page positions for every clip of this page that is currently
  // rendered, so older marks without position data can be ordered too.
  async function computeClipPositionsForPage() {
    const clips = await ReMarkStorage.getClips();
    const currentUrl = window.location.href;
    for (const clip of clips) {
      if (!clip.url || !samePageUrl(clip.url, currentUrl)) continue;
      if (Number.isFinite(Number(clip.sourcePosition)) && Number.isFinite(Number(clip.sourcePositionX))) continue;
      const mark = [...document.querySelectorAll(`mark[data-clip-id="${clip.id}"]`)].at(-1);
      if (!mark) continue;
      const rect = mark.getBoundingClientRect();
      await ReMarkStorage.updateClip(clip.id, {
        sourcePosition: Math.round(rect.top + window.scrollY),
        sourcePositionX: Math.round(rect.left)
      });
    }
    notifyStorageUpdated();
  }
  // Two URLs belong to the same page when their host (sans www) and path
  // match; hash, query strings and trailing slashes are ignored. If the
  // marked text is absent from the page, the text matcher simply skips it,
  // so loose URL matching is safe.
  function samePageUrl(a, b) {
    const norm = (value) => {
      try {
        const url = new URL(value);
        return url.hostname.replace(/^www\./, '').toLowerCase() + url.pathname.replace(/\/+$/, '');
      } catch (_) {
        return String(value || '').split('#')[0].replace(/\/+$/, '');
      }
    };
    return norm(a) === norm(b);
  }
  // Restore page highlights from storage. Returns true when every clip for
  // this page is restored (or nothing is pending), which lets the caller
  // stop watching the DOM.
  async function restorePageHighlights() {
    const clips = await ReMarkStorage.getClips();
    const currentUrl = window.location.href;
    loadedClipsForPage = clips.filter((clip) => clip.url && samePageUrl(clip.url, currentUrl));
    let allDone = true;
    for (const clip of loadedClipsForPage) {
      if (clip.text && !highlightTextInBody(clip)) allDone = false;
    }
    return allDone;
  }
  function highlightTextInBody(clip) {
    if (document.querySelector(`mark[data-clip-id="${clip.id}"]`)) return true;
    const textSegments = [];
    let text = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        return !node.nodeValue?.length || parent?.closest('mark.remark-highlight-mark, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const start = text.length;
      text += node.nodeValue;
      textSegments.push({ node, start, end: text.length });
    }
    let startIndex = text.indexOf(clip.text);
    let endIndex = startIndex + clip.text.length;
    if (startIndex < 0) {
      const normalizedClipText = String(clip.text).replace(/\s+/g, '');
      const originalIndexes = [];
      let normalizedPageText = '';
      for (let index = 0; index < text.length; index += 1) {
        if (/\s/.test(text[index])) continue;
        originalIndexes.push(index);
        normalizedPageText += text[index];
      }
      const normalizedStart = normalizedClipText ? normalizedPageText.indexOf(normalizedClipText) : -1;
      if (normalizedStart < 0) return false;
      startIndex = originalIndexes[normalizedStart];
      endIndex = originalIndexes[normalizedStart + normalizedClipText.length - 1] + 1;
    }
    const start = textSegments.find((segment) => startIndex >= segment.start && startIndex < segment.end);
    const end = textSegments.find((segment) => endIndex > segment.start && endIndex <= segment.end);
    if (!start || !end) return false;
    const range = document.createRange();
    range.setStart(start.node, startIndex - start.start);
    range.setEnd(end.node, endIndex - end.start);
    if (!Number.isFinite(Number(clip.sourcePosition)) || !Number.isFinite(Number(clip.sourcePositionX))) {
      const rect = range.getBoundingClientRect();
      void ReMarkStorage.updateClip(clip.id, {
        sourcePosition: Math.round(rect.top + window.scrollY),
        sourcePositionX: Math.round(rect.left)
      });
    }
    highlightDOMRange(range, clip);
    return true;
  }
  // ========= Video Timestamp Marks (YouTube & Bilibili) =========

  const MARKER_POLL_INTERVAL = 1200;
  let videoMarkRenderSig = null;
  let videoMarkRenderedIds = new Set();
  let markTooltipEl = null;
  let markTooltipHideTimer = null;
  let markShowcaseTimer = null;
  let markCreationCardEl = null;
  let markCreationOverlayEl = null;
  let markCreationFlagEl = null;
  let markCreationTime = null;
  let markCreationAnchor = null;
  let markCreationPointerHandler = null;
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

  function addMarkerInkParticles(dot) {
    dot.querySelectorAll('.remark-ink-particle, .remark-marker-stroke').forEach((node) => node.remove());
    const stroke = document.createElement('em');
    stroke.className = 'remark-marker-stroke';
    dot.appendChild(stroke);
    [[-7,-4],[7,-3],[-4,7],[5,6]].forEach(([x, y]) => {
      const particle = document.createElement('b');
      particle.className = 'remark-ink-particle';
      particle.style.setProperty('--ink-x', x + 'px');
      particle.style.setProperty('--ink-y', y + 'px');
      dot.appendChild(particle);
    });
  }
  function isTimelineVisible(bar) {
    if (!bar || !bar.isConnected) return false;
    const rect = bar.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 2) return false;
    for (let node = bar; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .08) return false;
    }
    return true;
  }
  function showInVideoMarkerFeedback(video) {
    const rect = video.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const progress = isFinite(video.duration) && video.duration > 0 ? Math.max(0, Math.min(1, video.currentTime / video.duration)) : .5;
    const dot = document.createElement('div');
    dot.className = 'remark-video-marker-feedback';
    dot.style.left = (rect.left + rect.width * progress) + 'px';
    dot.style.top = (rect.top + rect.height * .84) + 'px';
    document.body.appendChild(dot);
    void dot.offsetWidth;
    dot.classList.add('land');
    setTimeout(() => dot.remove(), 520);
  }
  function isFullscreenVideo(video) {
    const fullscreen = document.fullscreenElement;
    return Boolean(fullscreen && (fullscreen === video || fullscreen.contains(video)));
  }
  function revealNativeTimeline(video) {
    video.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
    const player = video.closest('.html5-video-player');
    if (player) { player.classList.remove('ytp-autohide'); setTimeout(() => player.classList.add('ytp-autohide'), 900); }
  }
  function showFullscreenTimelineFeedback(video) {
    const rect = video.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const progress = isFinite(video.duration) && video.duration > 0 ? Math.max(0, Math.min(1, video.currentTime / video.duration)) : .5;
    document.querySelectorAll('.remark-video-timeline-feedback').forEach((node) => node.remove());
    const timeline = document.createElement('div');
    timeline.className = 'remark-video-timeline-feedback';
    timeline.style.left = (rect.left + Math.max(16, rect.width * .035)) + 'px';
    timeline.style.top = (rect.bottom - Math.max(28, rect.height * .075)) + 'px';
    timeline.style.width = Math.max(36, rect.width * .93) + 'px';
    const dot = document.createElement('i');
    dot.style.left = (progress * 100) + '%';
    addMarkerInkParticles(dot);
    timeline.appendChild(dot);
    document.body.appendChild(timeline);
    void timeline.offsetWidth;
    timeline.classList.add('show');
    setTimeout(() => timeline.classList.add('fade'), 620);
    setTimeout(() => timeline.remove(), 940);
  }
  function revealFullscreenTimeline(video) {
    // ReMark draws its own quiet timeline; native player controls stay hidden.
    showFullscreenTimelineFeedback(video);
  }
  function initVideoMarkFeature() {
    if (!detectVideoPlatform()) return;
    document.addEventListener('keydown', onVideoMarkKeydown);
    document.getElementById('remark-video-mark-btn')?.remove();
    renderVideoMarkers();
    if (detectVideoPlatform() === 'bilibili') {
      try { chrome.runtime?.sendMessage({ action: 'INSTALL_BILI_SUBTITLE_CAPTURE' }); } catch (_) {}
    }

    setInterval(() => renderVideoMarkersIfChanged(), MARKER_POLL_INTERVAL);

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
    recordVideoMark({ withNote: e.shiftKey });
  }
  function pulseVideoMarker(mark, video) {
    showMarkCreationFeedback(mark, video);
  }
  // Creation confirmation: one unit — a self-drawn fake progress bar with a
  // flag at the mark position, plus its action card — that appears and
  // disappears together. The flag is positioned over the real progress bar
  // (same time→x mapping) but is fixed to the viewport, so it never
  // disappears when the player controls auto-hide. The fake bar is always
  // shown so the insert position is obvious in any mode. The card tells the
  // user two things: the mark was saved, and they can add a note there.
  function showMarkCreationFeedback(mark, video) {
    dismissMarkCreationFeedback(true);
    const rect = video.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    markCreationTime = Number(mark.time) || 0;
    const geometry = markCreationGeometry(video, markCreationTime);
    if (!geometry) return;

    const flag = document.createElement('div');
    flag.className = 'remark-video-mark-flag';
    flag.style.left = `${geometry.flagX}px`;
    flag.style.top = `${geometry.flagY}px`;
    addMarkerInkParticles(flag);
    document.body.appendChild(flag);
    void flag.offsetWidth;
    flag.classList.add('pop');
    markCreationFlagEl = flag;

    const overlay = document.createElement('div');
    overlay.className = 'remark-video-timeline-feedback';
    overlay.style.left = `${geometry.line.left}px`;
    overlay.style.top = `${geometry.line.top}px`;
    overlay.style.width = `${geometry.line.width}px`;
    document.body.appendChild(overlay);
    void overlay.offsetWidth;
    overlay.classList.add('show');
    markCreationOverlayEl = overlay;

    const anchor = { left: geometry.flagX, top: geometry.flagY };
    markCreationAnchor = anchor;

    const card = document.createElement('div');
    card.className = 'remark-video-mark-card';
    const head = document.createElement('div');
    head.className = 'remark-video-mark-card-head';
    const time = document.createElement('span');
    time.className = 'remark-video-mark-card-time';
    time.textContent = formatVideoTime(mark.time);
    const status = document.createElement('span');
    status.className = 'remark-video-mark-card-status';
    status.textContent = '✓ ' + t('video_mark_created');
    head.append(time, status);
    const hint = document.createElement('span');
    hint.className = 'remark-video-mark-card-hint';
    hint.textContent = t('video_mark_note_hint');

    const actions = document.createElement('div');
    actions.className = 'remark-video-mark-card-actions';
    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'remark-mark-action remark-mark-action--note remark-video-mark-card-note';
    noteBtn.dataset.hint = t('add_note');
    noteBtn.setAttribute('aria-label', t('add_note'));
    noteBtn.innerHTML = NOTE_BTN_ICON + `<span>${escHtml(t('video_mark_add_note'))}</span>`;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'remark-mark-action remark-mark-action--copy';
    copyBtn.dataset.hint = t('copy');
    copyBtn.setAttribute('aria-label', t('copy'));
    copyBtn.innerHTML = COPY_BTN_ICON;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'remark-mark-action remark-mark-action--delete';
    delBtn.dataset.hint = t('delete_video_marker');
    delBtn.setAttribute('aria-label', t('delete_video_marker'));
    delBtn.innerHTML = DELETE_BTN_ICON;
    const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
    noteBtn.addEventListener('pointerdown', stop);
    copyBtn.addEventListener('pointerdown', stop);
    delBtn.addEventListener('pointerdown', stop);
    noteBtn.addEventListener('click', (event) => {
      stop(event);
      const wasPlaying = !video.paused;
      if (wasPlaying) video.pause();
      hideMarkCreationCard();
      openQuickNoteInput({
        rect: { left: anchor.left - 140, top: anchor.top },
        above: true,
        initialValue: mark.note || '',
        onSave: async (note) => {
          if (wasPlaying) video.play().catch(() => {});
          if (note) { await ReMarkStorage.updateVideoMark(mark.id, { note }); notifyStorageUpdated(); }
          dismissMarkCreationFeedback(false);
        }
      });
    });
    copyBtn.addEventListener('click', (event) => { stop(event); void copyVideoMark(mark); });
    delBtn.addEventListener('click', async (event) => {
      stop(event);
      dismissMarkCreationFeedback(true);
      await ReMarkStorage.deleteVideoMark(mark.id);
      await ReMarkStorage.pushUndo({ type: 'delete_video_mark', item: mark });
      renderVideoMarkers();
      notifyStorageUpdated();
      showPageToast(t('video_mark_deleted'), {
        label: t('undo'),
        onAction: async () => {
          if (await ReMarkStorage.undoLast()) { renderVideoMarkers(); notifyStorageUpdated(); }
        }
      });
    });
    actions.append(noteBtn, copyBtn, delBtn);
    card.append(head, hint, actions);
    document.body.appendChild(card);
    positionMarkCreationCard(card, anchor);
    markCreationCardEl = card;

    card.addEventListener('mouseenter', () => {
      if (markShowcaseTimer) { clearTimeout(markShowcaseTimer); markShowcaseTimer = null; }
    });
    card.addEventListener('mouseleave', () => scheduleMarkCreationDismiss(1500));
    markCreationPointerHandler = (event) => {
      if (markCreationCardEl?.contains(event.target)) return;
      if (document.getElementById('remark-quick-note')?.contains(event.target)) return;
      dismissMarkCreationFeedback(false);
    };
    document.addEventListener('pointerdown', markCreationPointerHandler, true);
    scheduleMarkCreationDismiss();
  }
  // Position the showcase flag exactly where the native progress bar would put
  // it (same time→x mapping), falling back to the video frame when the bar
  // cannot be measured.
  function markCreationGeometry(video, time) {
    const duration = Number(video.duration);
    const progress = isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(1, time / duration))
      : 0.5;
    const rect = video.getBoundingClientRect();
    const bar = findVideoProgressBar();
    let barRect = null;
    try { if (bar) barRect = bar.getBoundingClientRect(); } catch (_) {}
    if (barRect && barRect.width >= 16) {
      return {
        flagX: barRect.left + progress * barRect.width,
        flagY: barRect.top + barRect.height / 2,
        line: { left: barRect.left, top: barRect.top + barRect.height / 2 - 2, width: barRect.width }
      };
    }
    const lineLeft = rect.left + Math.max(16, rect.width * 0.035);
    const lineTop = rect.bottom - Math.max(30, rect.height * 0.075);
    const lineWidth = Math.max(36, rect.width * 0.93);
    return {
      flagX: lineLeft + progress * lineWidth,
      flagY: lineTop,
      line: { left: lineLeft, top: lineTop, width: lineWidth }
    };
  }
  // Editing an existing mark's note: show the same fake progress bar + flag at
  // the mark position while the note editor is open, so the location stays
  // obvious (and survives control auto-hide).
  function showMarkEditingBar(mark) {
    dismissMarkCreationFeedback(true);
    const video = findVideoElement();
    if (!video) return;
    markCreationTime = Number(mark.time) || 0;
    const geometry = markCreationGeometry(video, markCreationTime);
    if (!geometry) return;
    const flag = document.createElement('div');
    flag.className = 'remark-video-mark-flag';
    flag.style.left = `${geometry.flagX}px`;
    flag.style.top = `${geometry.flagY}px`;
    addMarkerInkParticles(flag);
    document.body.appendChild(flag);
    void flag.offsetWidth;
    flag.classList.add('pop');
    markCreationFlagEl = flag;
    const overlay = document.createElement('div');
    overlay.className = 'remark-video-timeline-feedback';
    overlay.style.left = `${geometry.line.left}px`;
    overlay.style.top = `${geometry.line.top}px`;
    overlay.style.width = `${geometry.line.width}px`;
    document.body.appendChild(overlay);
    void overlay.offsetWidth;
    overlay.classList.add('show');
    markCreationOverlayEl = overlay;
    markCreationAnchor = { left: geometry.flagX, top: geometry.flagY };
  }
  function positionVideoMarkPanel(panel, anchor) {
    const edge = 10;
    const gap = 14;
    const panelRect = panel.getBoundingClientRect();
    const maxLeft = Math.max(edge, window.innerWidth - panelRect.width - edge);
    const left = Math.max(edge, Math.min(anchor.left - panelRect.width / 2, maxLeft));
    const aboveTop = anchor.top - panelRect.height - gap;
    const belowTop = anchor.top + gap;
    const aboveFits = aboveTop >= edge;
    const belowFits = belowTop + panelRect.height <= window.innerHeight - edge;
    const above = aboveFits || (!belowFits && anchor.top > window.innerHeight / 2);
    const desiredTop = above ? aboveTop : belowTop;
    const maxTop = Math.max(edge, window.innerHeight - panelRect.height - edge);

    panel.classList.toggle('is-above', above);
    panel.classList.toggle('is-below', !above);
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(edge, Math.min(desiredTop, maxTop))}px`;
  }
  function positionMarkCreationCard(card, anchor) {
    positionVideoMarkPanel(card, anchor);
  }
  function scheduleMarkCreationDismiss(delay = 4200) {
    clearTimeout(markShowcaseTimer);
    markShowcaseTimer = window.setTimeout(() => {
      markShowcaseTimer = null;
      if (markCreationCardEl?.matches(':hover')) { scheduleMarkCreationDismiss(1500); return; }
      dismissMarkCreationFeedback(false);
    }, delay);
  }
  // Keep the flag (and the fullscreen overlay) visible while the note editor
  // is open; only the action card steps aside so it never overlaps the input.
  function hideMarkCreationCard() {
    clearTimeout(markShowcaseTimer);
    markShowcaseTimer = null;
    if (markCreationPointerHandler) {
      document.removeEventListener('pointerdown', markCreationPointerHandler, true);
      markCreationPointerHandler = null;
    }
    if (markCreationCardEl) {
      markCreationCardEl.remove();
      markCreationCardEl = null;
    }
  }
  function dismissMarkCreationFeedback(immediate) {
    clearTimeout(markShowcaseTimer);
    markShowcaseTimer = null;
    if (markCreationPointerHandler) {
      document.removeEventListener('pointerdown', markCreationPointerHandler, true);
      markCreationPointerHandler = null;
    }
    if (markCreationCardEl) {
      const card = markCreationCardEl;
      markCreationCardEl = null;
      if (immediate) card.remove();
      else {
        card.classList.add('is-leaving');
        window.setTimeout(() => card.remove(), 180);
      }
    }
    if (markCreationOverlayEl) {
      const overlay = markCreationOverlayEl;
      markCreationOverlayEl = null;
      if (immediate) overlay.remove();
      else {
        overlay.classList.add('fade');
        window.setTimeout(() => overlay.remove(), 320);
      }
    }
    if (markCreationFlagEl) {
      const flag = markCreationFlagEl;
      markCreationFlagEl = null;
      if (immediate) flag.remove();
      else {
        flag.classList.add('is-leaving');
        window.setTimeout(() => flag.remove(), 180);
      }
    }
    markCreationTime = null;
    markCreationAnchor = null;
  }
  function syncMarkCreationFeedback() {
    if (!markCreationFlagEl || !markCreationAnchor) return;
    const video = findVideoElement();
    if (!video) return;
    const geometry = markCreationGeometry(video, markCreationTime);
    if (!geometry) return;
    markCreationFlagEl.style.left = `${geometry.flagX}px`;
    markCreationFlagEl.style.top = `${geometry.flagY}px`;
    if (markCreationOverlayEl) {
      markCreationOverlayEl.style.left = `${geometry.line.left}px`;
      markCreationOverlayEl.style.top = `${geometry.line.top}px`;
      markCreationOverlayEl.style.width = `${geometry.line.width}px`;
    }
    markCreationAnchor = { left: geometry.flagX, top: geometry.flagY };
    if (markCreationCardEl) positionMarkCreationCard(markCreationCardEl, markCreationAnchor);
  }
  async function recordVideoMark(options = {}) {
    const video = findVideoElement();
    if (!video) return;
    const withNote = Boolean(options.withNote);
    const shouldResume = withNote && !video.paused;
    const t = video.currentTime;
    if (!isFinite(t) || t < 0) return;
    const vkey = getVideoKey();
    if (!vkey) return;
    if (onboardingTutorial && isVideoPage()) {
      const bar = findVideoProgressBar();
      if (isTimelineVisible(bar)) {
        const host = getVideoMarkerHost(bar);
        const dot = document.createElement('div');
        dot.className = 'remark-video-mark remark-video-mark--tutorial';
        host.appendChild(dot);
        const duration = Number(video.duration) || 0;
        const percent = duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 50;
        positionMarkerInHost(dot, host, bar, percent);
        addMarkerInkParticles(dot);
        void dot.offsetWidth;
        dot.classList.add('pop');
        window.setTimeout(() => dot.remove(), 1200);
      } else if (isFullscreenVideo(video)) {
        showFullscreenTimelineFeedback(video);
      } else {
        showInVideoMarkerFeedback(video);
      }
      markOnboardingStep('video');
      return;
    }

    const marks = await ReMarkStorage.getVideoMarks();
    const existing = marks.find(m => m.videoKey === vkey && Math.abs(m.time - t) < 1);
    const promptForNote = (mark) => {
      if (withNote) video.pause();
      const rect = video.getBoundingClientRect();
      const anchor = markCreationAnchor || { left: rect.left + rect.width / 2, top: rect.bottom - 10 };
      hideMarkCreationCard();
      // The note input appears next to the flag.
      openQuickNoteInput({
        rect: { left: anchor.left - 140, top: anchor.top },
        above: true,
        onSave: async (note) => {
          if (note) { await ReMarkStorage.updateVideoMark(mark.id, { note }); notifyStorageUpdated(); }
          if (shouldResume) video.play().catch(() => {});
          dismissMarkCreationFeedback(false);
        }
      });
    };
    if (existing) {
      if (withNote) { promptForNote(existing); return; }
      video.currentTime = existing.time;
      pulseVideoMarker(existing, video);
      return;
    }
    if (withNote) video.pause();
    const savedMark = await ReMarkStorage.addVideoMark({
      url: window.location.href.split('#')[0], videoKey: vkey, time: Math.round(t * 10) / 10,
      duration: isFinite(video.duration) ? Math.floor(video.duration) : 0, title: getVideoTitle()
    });
    notifyStorageUpdated();
    void attachVideoMarkCaption(savedMark, video, t);
    await renderVideoMarkers();
    showMarkCreationFeedback(savedMark, video);
    if (withNote) promptForNote(savedMark);
    // The flag on the progress bar (with its action row) is the confirmation.
  }
  // Best-effort auxiliary info: the subtitle line spoken at the mark moment
  // (exact cue match) plus the YouTube chapter the mark falls inside. Anything
  // not captured is skipped silently — the mark itself is already saved.
  async function attachVideoMarkCaption(mark, video, time) {
    try {
      const platform = detectVideoPlatform();
      if (!platform) return;
      const settings = await ReMarkStorage.getSettings();
      const payload = {
        platform,
        time,
        duration: isFinite(video.duration) ? video.duration : 0,
        videoKey: mark.videoKey || '',
        language: settings.language || 'system',
        bvid: String(mark.videoKey || '').split('?')[0],
        cid: ''
      };
      let result = null;
      try {
        result = await chrome.runtime?.sendMessage({ action: 'CAPTURE_VIDEO_CAPTION', payload });
      } catch (_) {}
      if (!result) return;
      const updates = {};
      if (result.caption?.text) updates.caption = result.caption;
      if (result.chapter?.text) updates.chapter = result.chapter;
      if (!Object.keys(updates).length) return;
      await ReMarkStorage.updateVideoMark(mark.id, updates);
      notifyStorageUpdated();
      renderVideoMarkers();
    } catch (_) {
      // Caption capture is optional; never fail the mark over it.
    }
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
    if (!markShowcaseTimer && !(markTooltipEl && markTooltipEl.matches(':hover'))) hideMarkTooltip();

    const marks = await ReMarkStorage.getVideoMarks();
    const forVideo = marks.filter(m => m.videoKey === vkey);
    const newIds = new Set();

    forVideo.forEach(m => {
      const pct = Math.min(100, Math.max(0, (m.time / dur) * 100));
      const dot = document.createElement('div');
      dot.className = 'remark-video-mark';
      dot.dataset.markId = m.id;
      dot.setAttribute('aria-label', t('video_marker'));
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        video.currentTime = m.time;
        if (video.paused) video.play().catch(() => {});
      });
      dot.addEventListener('mouseenter', () => { showMarkTooltip(dot, m); });
      dot.addEventListener('mouseleave', () => scheduleHideMarkTooltip());
      host.appendChild(dot);
      positionMarkerInHost(dot, host, bar, pct);
      newIds.add(m.id);
      if (!videoMarkRenderedIds.has(m.id)) {
        addMarkerInkParticles(dot);
        void dot.offsetWidth;
        dot.classList.add('pop');
      }
    });

    videoMarkRenderedIds = newIds;
    syncMarkCreationFeedback();
  }

  async function copyVideoMark(mark) {
    const payload = `${mark.title || t('untitled_video')} — ${formatVideoTime(mark.time)}${mark.note ? `\n\n${mark.note}` : ''}`;
    await copyTextToClipboard(payload);
    showPageToast(t('copied'));
  }
  // Hovering a video mark reveals the same style of action row as the
  // highlights: note / copy / delete, with Font Awesome icons.
  function showMarkTooltip(dot, mark, options = {}) {
    if (markTooltipHideTimer) { clearTimeout(markTooltipHideTimer); markTooltipHideTimer = null; }
    hideMarkTooltip();
    const tip = document.createElement('div');
    tip.className = 'remark-video-mark-tip';
    const time = document.createElement('span');
    time.className = 'remark-video-mark-tip-time';
    time.textContent = formatVideoTime(mark.time);
    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'remark-mark-action remark-mark-action--note';
    noteBtn.dataset.hint = t('add_note');
    noteBtn.setAttribute('aria-label', t('add_note'));
    noteBtn.innerHTML = NOTE_BTN_ICON;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'remark-mark-action remark-mark-action--copy';
    copyBtn.dataset.hint = t('copy');
    copyBtn.setAttribute('aria-label', t('copy'));
    copyBtn.innerHTML = COPY_BTN_ICON;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'remark-mark-action remark-mark-action--delete';
    delBtn.dataset.hint = t('delete_video_marker');
    delBtn.setAttribute('aria-label', t('delete_video_marker'));
    delBtn.innerHTML = DELETE_BTN_ICON;
    const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
    noteBtn.addEventListener('pointerdown', stop);
    copyBtn.addEventListener('pointerdown', stop);
    delBtn.addEventListener('pointerdown', stop);
    noteBtn.addEventListener('click', (event) => {
      stop(event);
      const video = findVideoElement();
      const wasPlaying = video && !video.paused;
      if (wasPlaying) video.pause();
      hideMarkTooltip();
      showMarkEditingBar(mark);
      const d = dot.getBoundingClientRect();
      const anchor = markCreationAnchor || { left: d.left + d.width / 2, top: d.top + d.height / 2 };
      openQuickNoteInput({
        rect: { left: anchor.left - 140, top: anchor.top },
        above: true,
        initialValue: mark.note || '',
        onSave: async (note) => {
          if (wasPlaying) video?.play().catch(() => {});
          if (note) { await ReMarkStorage.updateVideoMark(mark.id, { note }); notifyStorageUpdated(); }
          dismissMarkCreationFeedback(false);
        }
      });
    });
    copyBtn.addEventListener('click', (event) => { stop(event); void copyVideoMark(mark); });
    delBtn.addEventListener('click', async (event) => {
      stop(event);
      await ReMarkStorage.deleteVideoMark(mark.id);
      await ReMarkStorage.pushUndo({ type: 'delete_video_mark', item: mark });
      hideMarkTooltip();
      renderVideoMarkers();
      notifyStorageUpdated();
      showPageToast(t('video_mark_deleted'), {
        label: t('undo'),
        onAction: async () => {
          if (await ReMarkStorage.undoLast()) { renderVideoMarkers(); notifyStorageUpdated(); }
        }
      });
    });
    tip.append(time, noteBtn, copyBtn, delBtn);
    document.body.appendChild(tip);
    markTooltipEl = tip;

    // options.point overrides the anchor (used when the timeline is hidden);
    // options.duration keeps the row visible for a while (creation showcase).
    const anchor = options.point || dot.getBoundingClientRect();
    const tooltipAnchor = { left: anchor.left + (anchor.width || 0) / 2, top: anchor.top };
    positionVideoMarkPanel(tip, tooltipAnchor);

    tip.addEventListener('mouseenter', () => { if (markTooltipHideTimer) { clearTimeout(markTooltipHideTimer); markTooltipHideTimer = null; } });
    tip.addEventListener('mouseleave', () => scheduleHideMarkTooltip());
    if (options.duration) {
      clearTimeout(markShowcaseTimer);
      markShowcaseTimer = window.setTimeout(() => {
        markShowcaseTimer = null;
        if (markTooltipEl && markTooltipEl.matches(':hover')) return;  // hovering keeps it
        hideMarkTooltip();
      }, options.duration);
    }
  }

  function scheduleHideMarkTooltip(delay = 320) {
    if (markShowcaseTimer) return;  // keep during the creation showcase
    if (markTooltipHideTimer) clearTimeout(markTooltipHideTimer);
    markTooltipHideTimer = setTimeout(() => { markTooltipHideTimer = null; hideMarkTooltip(); }, delay);
  }

  function hideMarkTooltip() {
    clearTimeout(markShowcaseTimer);
    markShowcaseTimer = null;
    if (markTooltipEl) { markTooltipEl.remove(); markTooltipEl = null; }
  }

  function seekVideoToMark(time) {
    const video = findVideoElement();
    if (!video || !isFinite(time)) return;
    video.currentTime = time;
    if (video.paused) video.play().catch(() => {});
  }

})();
