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
    window.setTimeout(restore, 800);
    window.setTimeout(restore, 2200);
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
  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0 || !(event.metaKey || event.ctrlKey)) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2) return;
    try {
      const range = selection.getRangeAt(0);
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
    } else if (msg.action === 'SET_ACTIVE_CLIP') {
      setActiveClip(msg.clipId);
    } else if (msg.action === 'CLEAR_ACTIVE_CLIP') {
      clearActiveClip(msg.clipId);
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
        removeClipHighlightFromDOM(clipId);
        selectedHighlight = null;
        notifyStorageUpdated();
        showPageToast(t('mark_deleted'), {
          label: t('undo'),
          onAction: async () => {
            if (await undoPageAction()) return;
          }
        });
      }
      return;
    }
    if (event.key === 'Enter' && event.shiftKey && selectedHighlight && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      // Shift + Enter on a selected highlight adds a Note or opens the existing Note for editing.
      event.preventDefault();
      const clipId = selectedHighlight.getAttribute('data-clip-id');
      const clips = await ReMarkStorage.getClips();
      const item = clips.find((clip) => clip.id === clipId);
      const rect = selectedHighlight.getBoundingClientRect();
      openQuickNoteInput({
        rect,
        initialValue: item?.note || '',
        onSave: async (note) => {
          if (!note) return;
          await ReMarkStorage.updateClip(clipId, { note });
          setClipNoteIndicator(clipId);
          notifyStorageUpdated();
        }
      });
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    await undoPageAction();
  });
  async function undoPageAction() {
    const action = await ReMarkStorage.get(ReMarkStorage.KEYS.UNDO);
    if (!action || !(await ReMarkStorage.undoLast())) return false;
    if (action.type === 'restore_clip' && action.id) {
      clearActiveClip(action.id);
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
    if (mark) { performLocateAnimation(mark); return; }
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
    const top = Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.4);
    window.scrollTo({ top, behavior: 'smooth' });
    setTimeout(focus, 460);
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
        mark.querySelectorAll('.remark-note-control, .remark-note-hint').forEach((node) => node.remove());
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
            mark.querySelectorAll('.remark-note-control, .remark-note-hint').forEach((node) => node.remove());
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
      color: colorCode,
      note: ''
    };

    const savedClip = await ReMarkStorage.addClip(clipData);
    await ReMarkStorage.pushUndo({ type: 'restore_clip', id: savedClip.id });
    if (range) {
      highlightDOMRange(range, savedClip, true);
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
  }

  function openQuickNoteInput({ rect, onSave, initialValue = '' }) {
    document.getElementById('remark-quick-note')?.remove();
    const anchor = rect || { left: window.innerWidth / 2 - 140, bottom: window.innerHeight / 2 };
    const shell = document.createElement('div');
    shell.id = 'remark-quick-note';
    shell.className = 'remark-quick-note';
    shell.style.left = `${Math.max(12, Math.min(anchor.left || 12, window.innerWidth - 292))}px`;
    shell.style.top = `${Math.max(12, Math.min((anchor.bottom || 12) + 8, window.innerHeight - 118))}px`;
    shell.innerHTML = `<textarea aria-label="${t('add_note')}" placeholder="${t('note_placeholder')}"></textarea><span>${t('note_save_hint')}</span>`;
    document.documentElement.appendChild(shell);
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
        if (value) showNoteSavedChip(rect);
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

  // DOM Highlighting Engine
  // fresh = true when the mark was just created by the user; it then lands
  // with a short ink sweep so the capture moment feels immediate.
  function highlightDOMRange(range, clip, fresh = false) {
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
  function clearActiveClip(clipId) {
    document.querySelectorAll('.remark-highlight-mark.remark-selected').forEach((node) => {
      if (!clipId || node.dataset.clipId === String(clipId)) node.classList.remove('remark-selected');
    });
    if (!clipId || selectedHighlight?.dataset.clipId === String(clipId)) selectedHighlight = null;
  }
  async function setClipNoteIndicator(clipId) {
    const marks = [...document.querySelectorAll(`mark[data-clip-id="${clipId}"]`)];
    marks.forEach((mark) => {
      mark.classList.remove('has-note');
      mark.querySelectorAll('.remark-note-control, .remark-note-hint').forEach((node) => node.remove());
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
  function setActiveClip(clipId) {
    clearActiveClip();
    const marks = [...document.querySelectorAll(`mark[data-clip-id="${clipId}"]`)];
    marks.forEach((mark) => mark.classList.add('remark-selected'));
    selectedHighlight = marks.at(-1) || null;
  }
  // Click highlight → select it locally for page-level keyboard actions.
  function bindHighlightClick(element, clip) {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveClip(clip.id);
      selectedHighlight = element;
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

  // Restore page highlights from storage.
  async function restorePageHighlights() {
    const clips = await ReMarkStorage.getClips();
    const currentUrl = window.location.href.split('#')[0];
    loadedClipsForPage = clips.filter((clip) => clip.url && clip.url.split('#')[0] === currentUrl);
    for (const clip of loadedClipsForPage) {
      if (clip.text) highlightTextInBody(clip);
    }
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
    if (!Number.isFinite(Number(clip.sourcePosition))) {
      void ReMarkStorage.updateClip(clip.id, { sourcePosition: Math.round(range.getBoundingClientRect().top + window.scrollY) });
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
  function pulseVideoMarker(markId, video) {
    const bar = findVideoProgressBar();
    if (!isTimelineVisible(bar)) {
      if (isFullscreenVideo(video)) revealFullscreenTimeline(video);
      else showInVideoMarkerFeedback(video);
      return;
    }
    const dot = document.querySelector(`.remark-video-mark[data-mark-id="${CSS.escape(String(markId))}"]`);
    if (!dot) { showInVideoMarkerFeedback(video); return; }
    addMarkerInkParticles(dot);
    dot.classList.remove('pop');
    void dot.offsetWidth;
    dot.classList.add('pop');
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
      openQuickNoteInput({ rect: video.getBoundingClientRect(), onSave: async (note) => {
        if (note) { await ReMarkStorage.updateVideoMark(mark.id, { note }); notifyStorageUpdated(); }
        if (shouldResume) video.play().catch(() => {});
      }});
    };
    if (existing) {
      if (withNote) { promptForNote(existing); return; }
      video.currentTime = existing.time;
      pulseVideoMarker(existing.id, video);
      return;
    }
    if (withNote) video.pause();
    const savedMark = await ReMarkStorage.addVideoMark({
      url: window.location.href.split('#')[0], videoKey: vkey, time: Math.round(t * 10) / 10,
      duration: isFinite(video.duration) ? Math.floor(video.duration) : 0, title: getVideoTitle()
    });
    notifyStorageUpdated();
    const timelineHidden = !isTimelineVisible(findVideoProgressBar());
    if (timelineHidden && isFullscreenVideo(video)) revealFullscreenTimeline(video);
    renderVideoMarkers();
    if (timelineHidden && !isFullscreenVideo(video)) showInVideoMarkerFeedback(video);
    if (withNote) promptForNote(savedMark);
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
  }

  function showMarkTooltip(dot, mark) {
    if (markTooltipHideTimer) { clearTimeout(markTooltipHideTimer); markTooltipHideTimer = null; }
    hideMarkTooltip();
    const tip = document.createElement('div');
    tip.className = 'remark-video-mark-tip';
    const notePreview = mark.note ? `<span class="remark-video-mark-tip-note">${escHtml(mark.note)}</span>` : '';
    tip.innerHTML = `<span class="remark-video-mark-tip-time">${formatVideoTime(mark.time)}</span>${notePreview}<button class="remark-video-mark-tip-del" type="button" title="${t('delete_video_marker')}" aria-label="${t('delete_video_marker')}">×</button>`;
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

})();
