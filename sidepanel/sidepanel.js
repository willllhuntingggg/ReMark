/** ReMark Sidepanel: chronological Marks, lightweight Notes, native source order. */
document.addEventListener('DOMContentLoaded', async () => {
  const t = ReMarkI18n.t;
  ReMarkI18n.apply();
  let clips = [], videos = [], sourceUrl = null, query = '', selected = null, selectedKeys = new Set(), selectionAnchor = null, keyboardFocus = false;
  const $ = (s, root = document) => root.querySelector(s);
  const list = $('#clips-container'), empty = $('#clips-empty-state');
  const exportBackupButton = $('#export-backup');
  const importBackupButton = $('#import-backup');
  const importBackupFile = $('#import-backup-file');
  const backupStatus = $('#backup-status');
  const languageSetting = $('#language-setting');
  const settingsOpenButton = $('#settings-open');
  const settingsBackButton = $('#settings-back');
  const timelineControls = $('#timeline-controls');
  const clipsPanel = $('#panel-clips');
  const settingsPanel = $('#panel-settings');
  const viewIdentity = $('.view-identity');
  const appContainer = $('.app-container');
  const selectionTray = $('#selection-tray');
  const selectionBadge = $('#selection-badge');
  const selectionHintPoint = $('#selection-hint-point');
  const selectionHintRange = $('#selection-hint-range');
  const selectionExportButton = $('#selection-export-markdown');
  const selectionCopyButton = $('#selection-copy-markdown');
  const selectionClearButton = $('#selection-clear');
  const feedbackOpenButton = $('#feedback-open');
  const feedbackModal = $('#feedback-modal');
  const feedbackForm = $('#feedback-form');
  const feedbackCloseButton = $('#feedback-close');
  const feedbackType = $('#feedback-type');
  const feedbackMessage = $('#feedback-message');
  const feedbackStatus = $('#feedback-status');
  const feedbackSubmitButton = $('#feedback-submit');
  const feedbackActions = $('.feedback-actions', feedbackForm);
  const feedbackFallback = $('#feedback-fallback');
  const feedbackFallbackBody = $('#feedback-fallback-body');
  const feedbackCopyEmailButton = $('#feedback-copy-email');
  const FEEDBACK_RECIPIENT = 'xuzijian2222@gmail.com';
  const GMAIL_COMPOSE_URL = 'https://mail.google.com/mail/u/0/';
  let showingSettings = false;

  function showSettings() {
    showingSettings = true;
    timelineControls.hidden = true;
    clipsPanel.hidden = true;
    settingsPanel.hidden = false;
    settingsOpenButton.hidden = true;
    appContainer.classList.add('is-more-open');
    viewIdentity.hidden = true;
    updateSelectionTray([]);
  }

  function showTimeline() {
    showingSettings = false;
    timelineControls.hidden = false;
    clipsPanel.hidden = false;
    settingsPanel.hidden = true;
    settingsOpenButton.hidden = false;
    appContainer.classList.remove('is-more-open');
    viewIdentity.hidden = false;
    render(true);
  }

  async function applyLanguagePreference(preference) {
    const normalized = ['system', 'en', 'zh'].includes(preference) ? preference : 'system';
    ReMarkI18n.setLocale(normalized);
    ReMarkI18n.apply();
    languageSetting.value = normalized;
    if (!showingSettings) render();
  }
  async function initializeLanguagePreference() {
    const settings = await ReMarkStorage.getSettings();
    await applyLanguagePreference(settings.language);
  }

  function setBackupStatus(message, isError = false) {
    backupStatus.textContent = message;
    backupStatus.hidden = false;
    backupStatus.classList.toggle('is-error', isError);
  }

  function setBackupBusy(isBusy) {
    exportBackupButton.disabled = isBusy;
    importBackupButton.disabled = isBusy;
  }

  function backupFilename() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `remark-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
  }

  async function exportBackup() {
    setBackupBusy(true);
    try {
      const backup = await ReMarkStorage.createBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFilename();
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setBackupStatus(t('backup_exported'));
    } catch (error) {
      console.error('[ReMark] Backup export failed:', error);
      setBackupStatus(t('export_failed'), true); } finally {
      setBackupBusy(false);
    }
  }

  function importErrorMessage(error) {
    if (error?.message === 'INVALID_BACKUP') return t('invalid_backup');
    if (error?.message === 'UNSUPPORTED_BACKUP_VERSION') return t('unsupported_backup_version');
    return t('import_failed');
  }

  async function importBackup(file) {
    setBackupBusy(true);
    let backup;
    try {
      const text = await file.text();
      try {
        backup = JSON.parse(text);
      } catch (_) {
        setBackupStatus(t('invalid_backup'), true);
        return;
      }
      const result = await ReMarkStorage.importBackup(backup);
      await load();
      const message = result.added || result.updated
        ? t('backup_imported', result)
        : t('backup_imported_unchanged');
      setBackupStatus(message);
    } catch (error) {
      console.error('[ReMark] Backup import failed:', error);
      setBackupStatus(importErrorMessage(error), true);
    } finally {
      setBackupBusy(false);
      importBackupFile.value = '';
    }
  }

  async function replayTutorial() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, { action: 'REPLAY_ONBOARDING' });
    } catch (error) {
      console.warn('[ReMark] Tutorial replay unavailable for this page:', error);
    }
  }

  function setFeedbackStatus(message = '', isError = false) {
    feedbackStatus.textContent = message;
    feedbackStatus.hidden = !message;
    feedbackStatus.classList.toggle('is-error', isError);
  }

  function openFeedback() {
    setFeedbackStatus();
    feedbackFallback.hidden = true;
    feedbackActions.hidden = false;
    feedbackModal.hidden = false;
    window.setTimeout(() => feedbackMessage.focus(), 0);
  }

  function closeFeedback({ returnFocus = true } = {}) {
    feedbackModal.hidden = true;
    setFeedbackStatus();
    feedbackFallback.hidden = true;
    feedbackActions.hidden = false;
    if (returnFocus) feedbackOpenButton.focus();
  }

  async function feedbackContext() {
    let tab = null;
    try {
      [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    } catch (_) {}
    const pageUrl = tab?.url || t('feedback_unavailable');
    let domain = t('feedback_unavailable');
    try { domain = new URL(pageUrl).hostname || domain; } catch (_) {}
    return {
      version: chrome.runtime.getManifest().version,
      browser: navigator.userAgent,
      language: navigator.language || t('feedback_unavailable'),
      title: tab?.title || t('feedback_unavailable'),
      domain,
      pageUrl
    };
  }

  function feedbackEmailDraft(type, message, context) {
    const subject = `[ReMark] ${t('feedback_type')}: ${t(`feedback_type_${type}`)}`;
    const body = [
      `## ${t('feedback_message')}`,
      '',
      message,
      '',
      '---',
      '',
      `## ${t('feedback_context')}`,
      '',
      `- ${t('feedback_context_type')}: ${t(`feedback_type_${type}`)}`,
      `- ${t('feedback_context_version')}: ${context.version}`,
      `- ${t('feedback_context_browser')}: ${context.browser}`,
      `- ${t('feedback_context_language')}: ${context.language}`,
      `- ${t('feedback_context_title')}: ${context.title}`,
      `- ${t('feedback_context_domain')}: ${context.domain}`,
      `- ${t('feedback_context_url')}: ${context.pageUrl}`
    ].join('\n');
    return { subject, body };
  }

  function gmailComposeUrl(draft) {
    const url = new URL(GMAIL_COMPOSE_URL);
    url.searchParams.set('to', FEEDBACK_RECIPIENT);
    url.searchParams.set('su', draft.subject);
    url.searchParams.set('body', draft.body);
    url.searchParams.set('tf', 'cm');
    return url.href;
  }

  async function copyFeedbackEmail() {
    const payload = [`To: ${FEEDBACK_RECIPIENT}`, '', feedbackFallbackBody.value].join('\n');
    if (!await copyText(payload)) return;
    const original = feedbackCopyEmailButton.textContent;
    feedbackCopyEmailButton.textContent = t('feedback_copied');
    window.setTimeout(() => { feedbackCopyEmailButton.textContent = original; }, 1200);
  }

  async function sendFeedback() {
    const message = feedbackMessage.value.trim();
    if (!message) {
      setFeedbackStatus(t('feedback_required'), true);
      feedbackMessage.focus();
      return;
    }
    feedbackSubmitButton.disabled = true;
    setFeedbackStatus(t('feedback_preparing'));
    try {
      const type = feedbackType.value;
      const context = await feedbackContext();
      const draft = feedbackEmailDraft(type, message, context);
      feedbackFallbackBody.value = `Subject: ${draft.subject}\n\n${draft.body}`;
      feedbackFallback.hidden = false;
      feedbackActions.hidden = true;
      window.requestAnimationFrame(() => feedbackFallback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      await chrome.tabs.create({ url: gmailComposeUrl(draft), active: true });
      setFeedbackStatus(t('feedback_ready'));
    } catch (error) {
      console.warn('[ReMark] Gmail feedback compose could not be opened:', error);
      setFeedbackStatus(t('feedback_open_failed'), true);
    } finally {
      feedbackSubmitButton.disabled = false;
    }
  }

  $('#replay-tutorial').addEventListener('click', () => { void replayTutorial(); });
  feedbackOpenButton.addEventListener('click', openFeedback);
  feedbackCloseButton.addEventListener('click', () => closeFeedback());
  feedbackModal.addEventListener('click', (event) => { if (event.target === feedbackModal) closeFeedback(); });
  feedbackForm.addEventListener('submit', (event) => { event.preventDefault(); void sendFeedback(); });
  feedbackCopyEmailButton.addEventListener('click', () => { void copyFeedbackEmail(); });
  languageSetting.addEventListener('change', () => {
    const preference = languageSetting.value;
    void ReMarkStorage.updateSettings({ language: preference })
      .then(() => applyLanguagePreference(preference));
  });
  exportBackupButton.addEventListener('click', () => { void exportBackup(); });
  importBackupButton.addEventListener('click', () => { importBackupFile.click(); });
  importBackupFile.addEventListener('change', () => {
    const [file] = importBackupFile.files || [];
    if (file) void importBackup(file);
  });
  const search = $('#search-input'), clear = $('#search-clear'), back = $('#source-back');
  const subtitle = $('#view-subtitle'), context = $('#collection-context');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  settingsOpenButton.addEventListener('click', showSettings);
  settingsBackButton.addEventListener('click', showTimeline);
  const sameUrl = (a, b) => String(a || '').split('#')[0] === String(b || '').split('#')[0];
  const videoKeyFromUrl = (value) => { try { const url = new URL(value); const host = url.hostname.replace(/^www\./, ''); if (host.endsWith('youtube.com') || host === 'youtu.be') { const v = url.searchParams.get('v'); if (v) return v; const match = url.pathname.match(/\/(?:shorts|embed|e|live)\/([\w-]{6,})/) || url.pathname.match(/^\/([\w-]{6,})/); return match ? match[1] : ''; } if (host.endsWith('bilibili.com')) { const match = url.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i); if (!match) return ''; const p = url.searchParams.get('p'); return p ? match[1] + '?p=' + p : match[1]; } } catch (_) {} return ''; };
  const videoMarkSourceUrl = (item) => {
    const source = String(item?.url || '').split('#')[0];
    if (!source) return '';
    const time = Math.max(0, Math.floor(Number(item?.time) || 0));
    try {
      const url = new URL(source);
      url.searchParams.set('t', String(time));
      return url.href;
    } catch (_) {
      return `${source}${source.includes('?') ? '&' : '?'}t=${time}`;
    }
  };
  const sameVideoTab = (item, tabUrl) => Boolean(item.raw?.videoKey) && item.raw.videoKey === videoKeyFromUrl(tabUrl);
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const faviconUrl = (value) => {
    try {
      const page = new URL(value);
      return ['http:', 'https:'].includes(page.protocol) ? new URL('/favicon.ico', page.origin).href : '';
    } catch {
      return '';
    }
  };
  // Font Awesome Free 6.7.2 — fa-globe (CC BY 4.0, Fonticons Inc.).
  const SOURCE_FALLBACK_SVG = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>';
  function sourceIconHtml(value, faviconClass, fallbackClass) {
    const favicon = faviconUrl(value);
    return favicon
      ? `<img class="${faviconClass}" src="${esc(favicon)}" alt="" aria-hidden="true">`
      : `<span class="${fallbackClass}" aria-hidden="true">${SOURCE_FALLBACK_SVG}</span>`;
  }
  function sourceFallbackElement(className) {
    const fallback = document.createElement('span');
    fallback.className = className;
    fallback.setAttribute('aria-hidden', 'true');
    fallback.innerHTML = SOURCE_FALLBACK_SVG;
    return fallback;
  }
  const clock = (v) => { const n = Math.max(0, Math.floor(Number(v) || 0)), h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60, p = (x) => String(x).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`; };
  const dateLocale = () => ReMarkI18n.locale === 'zh' ? 'zh-CN' : 'en-US';
  const fullDate = (value) => new Intl.DateTimeFormat(dateLocale(), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value));
  const createdTime = (value) => new Intl.DateTimeFormat(dateLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const itemFor = (key) => all().find((item) => item.key === key);
  const cardFor = (key) => list.querySelector(`.mark-card[data-key="${CSS.escape(key)}"]`);
  // Font Awesome Free 6.7.2 — fa-copy / fa-check (CC BY 4.0, Fonticons Inc.).
  const COPY_BTN_ICON = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M208 0H332.1c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9V336c0 26.5-21.5 48-48 48H208c-26.5 0-48-21.5-48-48V48c0-26.5 21.5-48 48-48zM48 128h80v64H64V448H256V416h64v48c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V176c0-26.5 21.5-48 48-48z"/></svg>';
  const COPIED_BTN_ICON = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0l-96-96c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L224 274.7l169.4-169.3c12.5-12.5 32.8-12.5 45.3 0z"/></svg>';

  function all() {
    return [
      ...clips.map((raw) => ({ id: raw.id, key: `h:${raw.id}`, type: 'highlight', raw, url: raw.url || '', pageUrl: raw.pageUrl || raw.url || '', title: raw.pageTitle || t('untitled_page'), text: raw.text || '', note: raw.note || '', createdAt: Number(raw.createdAt) || 0, position: Number.isFinite(Number(raw.sourcePosition)) ? Number(raw.sourcePosition) : null, posX: Number.isFinite(Number(raw.sourcePositionX)) ? Number(raw.sourcePositionX) : null })),
      ...videos.map((raw) => ({ id: raw.id, key: `v:${raw.id}`, type: 'video', raw, url: raw.url || '', title: raw.title || t('untitled_video'), text: '', note: raw.note || '', createdAt: Number(raw.createdAt) || 0, time: Number(raw.time) || 0, duration: Number(raw.duration) || 0, caption: raw.caption || null, chapter: raw.chapter || null }))
    ];
  }
  function visible() {
    const q = query.trim().toLowerCase();
    let rows = all();
    if (sourceUrl !== null) rows = rows.filter((item) => sameUrl(item.url, sourceUrl));
    if (q) {
      rows = rows.filter((item) => [
        item.text,
        item.note,
        item.title,
        item.url,
        item.type === 'video' ? clock(item.time) : '',
        item.caption?.text || '',
        item.chapter?.text || ''
      ].some((value) => String(value).toLowerCase().includes(q)));
    }
    if (sourceUrl === null) return rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.sort((a, b) => {
      if (a.type === 'video' && b.type === 'video') return a.time - b.time;
      if (a.type === 'highlight' && b.type === 'highlight') {
        // Reading order: top → bottom, then left → right on the same line.
        if (a.position !== null && b.position !== null) {
          if (a.position !== b.position) return a.position - b.position;
          return (a.posX ?? 0) - (b.posX ?? 0);
        }
        if (a.position !== null) return -1;
        if (b.position !== null) return 1;
        return a.createdAt - b.createdAt;
      }
      return a.createdAt - b.createdAt;
    });
  }
  function sourceRowsFor(url) {
    return all().filter((item) => sameUrl(item.url, url)).sort((a, b) => {
      if (a.type === 'video' && b.type === 'video') return a.time - b.time;
      if (a.type === 'highlight' && b.type === 'highlight') {
        if (a.position !== null && b.position !== null) {
          if (a.position !== b.position) return a.position - b.position;
          return (a.posX ?? 0) - (b.posX ?? 0);
        }
        if (a.position !== null) return -1;
        if (b.position !== null) return 1;
      }
      return a.createdAt - b.createdAt;
    });
  }
  function day(value) {
    const now = new Date();
    const date = new Date(value);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const count = Math.round((start - target) / 86400000);
    if (count === 0) return t('today');
    if (count === 1) return t('yesterday');
    if (count < 7) return t('days_ago', { count });
    const locale = ReMarkI18n.locale === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(date);
  }
  function setViewTitle(label, count) {
    const countLabel = t(count === 1 ? 'one_mark' : 'marks_count', { count });
    subtitle.innerHTML = `${esc(label)} <span class="view-title-count">(${esc(countLabel)})</span>`;
  }
  function isMacPlatform() {
    const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
    return /mac|iphone|ipad|ipod/i.test(platform);
  }
  function selectedVisibleRows(rows = visible()) {
    return rows.filter((item) => selectedKeys.has(item.key));
  }
  function updateSelectionTray(rows = selectedVisibleRows()) {
    const count = rows.length;
    selectionTray.hidden = count === 0;
    appContainer.classList.toggle('has-selection-tray', count > 0);
    if (!count) return;
    selectionBadge.textContent = String(count);
    selectionTray.setAttribute('aria-label', t('selected_marks_count', { count }));
    const pointHint = t(isMacPlatform() ? 'selection_hint_point_mac' : 'selection_hint_point_ctrl');
    const rangeHint = t('selection_hint_range');
    selectionHintPoint.textContent = pointHint;
    selectionHintPoint.title = pointHint;
    selectionHintRange.textContent = rangeHint;
    selectionHintRange.title = rangeHint;
  }
  function selectedMarkdown(rows) {
    const entries = rows.map((item, index) => {
      const note = item.note ? `\n\n**${t('add_note')}:** ${item.note}` : '';
      if (item.type === 'video') {
        const detail = item.caption?.text || item.chapter?.text || item.title || t('untitled_video');
        const source = videoMarkSourceUrl(item);
        return `## ${index + 1}. ${clock(item.time)}\n\n<${source}>\n\n${detail}${note}`;
      }
      const source = item.url ? `\n\n<${item.url}>` : '';
      return `## ${index + 1}. ${item.title || t('untitled_page')}${source}\n\n${quoteMarkdown(item.text)}${note}`;
    });
    return `# ReMark\n\n${entries.join('\n\n---\n\n')}`;
  }
  function exportSelectedMarkdown() {
    const rows = selectedVisibleRows();
    if (!rows.length) return;
    const now = new Date();
    const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const blob = new Blob([selectedMarkdown(rows)], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `remark-marks-${stamp}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
  }
  async function copySelectedMarkdown() {
    const rows = selectedVisibleRows();
    if (!rows.length) return;
    if (await copyText(selectedMarkdown(rows))) showCopyFeedback(selectionCopyButton);
  }

  function markHtml(item, index = 0) {
    const jumpTitle = item.type === 'video'
      ? t('jump_to_time', { time: clock(item.time) })
      : item.text;
    const content = item.type === 'video'
      ? `<span class="video-timestamp">${clock(item.time)}</span>`
        + (item.duration ? `<span class="video-duration"> / ${clock(item.duration)}</span>` : '')
      : esc(item.text);
    const note = item.note
      ? `<button class="mark-note" data-action="note" data-key="${esc(item.key)}" type="button"><span class="mark-note-text">${esc(item.note)}</span></button>`
      : '';
    const caption = item.type === 'video' && item.caption?.text
      ? `<div class="mark-caption mark-caption--caption"><span class="mark-caption-label">${esc(t('video_caption'))}</span><span class="mark-caption-text">${esc(item.caption.text)}</span>${Number.isFinite(Number(item.caption.from)) ? `<span class="mark-caption-time">${clock(item.caption.from)}${Number.isFinite(Number(item.caption.to)) ? '–' + clock(item.caption.to) : ''}</span>` : ''}</div>`
      : '';
    const chapter = item.type === 'video' && item.chapter?.text
      ? `<div class="mark-caption mark-caption--chapter"><span class="mark-caption-label">${esc(t('video_chapter'))}</span><span class="mark-caption-text">${esc(item.chapter.text)}</span>${Number.isFinite(Number(item.chapter.from)) ? `<span class="mark-caption-time">${clock(item.chapter.from)}</span>` : ''}</div>`
      : '';
    // Inline editor: the visible note text itself becomes the field.
    const editor = `<textarea class="mark-note-textarea" data-key="${esc(item.key)}" aria-label="${esc(t('add_note'))}" placeholder="${esc(t('note_placeholder'))}" rows="1" hidden>${esc(item.note)}</textarea>`;
    const isLinkedSource = item.type === 'highlight' && item.url && item.pageUrl && !sameUrl(item.url, item.pageUrl);
    const source = item.title || host(item.url) || item.url;
    const sourceIcon = sourceIconHtml(item.url, 'mark-source-favicon', 'mark-source-fallback');
    const sourceControl = sourceUrl === null
      ? `<span class="mark-source-slot"><button class="mark-source" data-action="source" data-url="${esc(item.url)}" type="button" title="${esc(item.url)}">${sourceIcon}<span class="mark-source-label">${esc(source)}</span><span class="mark-source-arrow" aria-hidden="true">›</span></button></span>`
      : '';
    const menu = [
      `<button data-action="unmark" data-key="${esc(item.key)}" type="button">${esc(t('unmark'))}</button>`,
      `<button data-action="note" data-key="${esc(item.key)}" type="button">${esc(t(item.note ? 'edit_note' : 'add_note'))}</button>`,
      `<button data-action="copy" data-key="${esc(item.key)}" type="button">${esc(t('copy'))}</button>`
    ].join('');
    const quote = item.type === 'highlight'
      ? (isLinkedSource
        ? `<span class="mark-link-source" role="img" aria-label="Linked source" title="${esc(item.url)}">${LINK_SOURCE_SVG}</span>`
        : '<span class="mark-quote" aria-hidden="true">“</span>')
      : '<span class="mark-quote mark-quote--video" aria-hidden="true"></span>';
    return [
      `<article class="mark-card mark-card--${item.type}" data-key="${esc(item.key)}" data-id="${esc(item.id)}" tabindex="0" aria-selected="${selectedKeys.has(item.key)}" style="--i:${index}">`,
      `<div class="mark-content">${quote}<button class="mark-content-text" data-action="jump" data-key="${esc(item.key)}" type="button" title="${esc(jumpTitle)}">${content}</button><div class="mark-card-tools"><div class="mark-actions">`,
      `<button class="mark-action mark-more" data-action="menu" data-key="${esc(item.key)}" type="button" aria-label="${esc(t('more_actions'))}">···</button>`,
      `<div class="mark-menu" hidden>${menu}</div></div></div></div>`,
      caption + chapter,
      `<div class="mark-note-area">${note}${editor}</div>`,
      `<footer class="mark-footer">${sourceControl || '<span class="mark-source-slot"></span>'}<time class="mark-created" datetime="${new Date(item.createdAt).toISOString()}" title="${esc(fullDate(item.createdAt))}">${esc(createdTime(item.createdAt))}</time></footer></article>`
    ].join('');
  }
  function render(animated = false) {
    if (showingSettings) return;
    const rows = visible();
    const inSource = sourceUrl !== null;
    back.hidden = !inSource;
    viewIdentity.hidden = false;
    settingsOpenButton.hidden = inSource;
    appContainer.classList.toggle('is-source-view', inSource);
    search.placeholder = t('search_placeholder');
    if (inSource) {
      const sourceRows = sourceRowsFor(sourceUrl);
      setViewTitle(t('source_marks'), sourceRows.length);
      const sourceTitle = sourceRows[0]?.title || t('source_collection');
      const sourceIcon = sourceIconHtml(sourceUrl, 'source-collection-favicon', 'source-collection-fallback');
      context.hidden = false;
      context.innerHTML = [
        '<div class="source-collection-summary">',
        `<strong class="source-collection-page-title" title="${esc(sourceTitle)}">${esc(sourceTitle)}</strong>`,
        '<div class="source-collection-source-row">',
        sourceIcon,
        `<span class="source-collection-url" title="${esc(sourceUrl)}">${esc(host(sourceUrl) || sourceUrl)}</span>`,
        '</div>',
        '</div>'
      ].join('');
    } else if (query) {
      subtitle.hidden = false;
      setViewTitle(t('timeline'), all().length);
      context.hidden = true;
      context.innerHTML = '';
    } else {
      subtitle.hidden = false;
      setViewTitle(t('timeline'), all().length);
      context.hidden = true;
      context.innerHTML = '';
    }
    list.classList.toggle('is-entering', Boolean(animated));
    let previous = '';
    const html = [];
    rows.forEach((item, index) => {
      const label = day(item.createdAt);
      if (!inSource && label !== previous) {
        html.push(`<div class="feed-day-heading" style="--i:${html.length}"><span class="feed-day-label" title="${esc(fullDate(item.createdAt))}">${label}</span></div>`);
        previous = label;
      }
      html.push(markHtml(item, html.length));
    });
    list.innerHTML = html.join('');
    empty.hidden = rows.length > 0;
    if (selected) cardFor(selected)?.classList.add('mark-active');
    selectedKeys.forEach((key) => cardFor(key)?.classList.add('mark-selected'));
    list.classList.toggle('has-multiple-selection', selectedKeys.size > 1);
    const heading = $('h3', empty);
    const description = $('p', empty);
    if (inSource) {
      heading.textContent = query ? t('no_matches_in_source') : t('no_marks_in_source');
      description.textContent = query
        ? t('no_matches_in_source_description')
        : t('no_marks_in_source_description');
    } else if (query) {
      heading.textContent = t('no_matches');
      description.textContent = t('no_matches_description');
    } else {
      heading.textContent = t('no_marks_title');
      description.textContent = t('no_marks_description');
    }
    updateSelectionTray();
  }
  async function load(animated) {
    [clips, videos] = await Promise.all([ReMarkStorage.getClips(), ReMarkStorage.getVideoMarks()]);
    const existingKeys = new Set(all().map((item) => item.key));
    selectedKeys = new Set([...selectedKeys].filter((key) => existingKeys.has(key)));
    if (selected && !existingKeys.has(selected)) selected = null;
    if (selectionAnchor && !existingKeys.has(selectionAnchor)) selectionAnchor = null;
    render(animated);
  }
  async function saveNote(key, value) {
    const item = itemFor(key);
    if (!item) return;
    const note = String(value ?? '').trim();
    await (item.type === 'video' ? ReMarkStorage.updateVideoMark(item.id, { note }) : ReMarkStorage.updateClip(item.id, { note }));
    await load();
    const noteNode = cardFor(key)?.querySelector('.mark-note-text');
    if (noteNode) {
      noteNode.classList.remove('note-just-saved');
      void noteNode.offsetWidth;
      noteNode.classList.add('note-just-saved');
      setTimeout(() => noteNode.classList.remove('note-just-saved'), 1100);
    }
  }
  function resizeNoteInput(input) {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }
  function openNote(key) {
    const card = cardFor(key);
    if (!card) return;
    const input = $('.mark-note-textarea', card);
    if (!input) return;
    $('.mark-note', card)?.setAttribute('hidden', '');
    input.hidden = false;
    resizeNoteInput(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  function adjacentKeyAfterDelete(keys) {
    if (!selected || !keys.has(selected)) return null;
    const rows = visible();
    const activeIndex = rows.findIndex((item) => item.key === selected);
    if (activeIndex === -1) return null;
    for (let index = activeIndex + 1; index < rows.length; index += 1) {
      if (!keys.has(rows[index].key)) return rows[index].key;
    }
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      if (!keys.has(rows[index].key)) return rows[index].key;
    }
    return null;
  }
  async function deleteMarks(keys = selectedKeys) {
    const items = [...keys].map(itemFor).filter(Boolean);
    if (!items.length) return;
    const deletedKeys = new Set(items.map((item) => item.key));
    const adjacentKey = adjacentKeyAfterDelete(deletedKeys);
    const highlights = items.filter((item) => item.type === 'highlight');
    const videoMarks = items.filter((item) => item.type === 'video');
    if (highlights.length) await ReMarkStorage.deleteClips(highlights.map((item) => item.id));
    if (videoMarks.length) await ReMarkStorage.deleteVideoMarks(videoMarks.map((item) => item.id));
    await ReMarkStorage.pushUndo({
      type: 'delete_marks',
      clips: highlights.map((item) => item.raw),
      videoMarks: videoMarks.map((item) => item.raw)
    });
    await Promise.all(highlights.map((item) => notifySourceTabs(item, { action: 'DELETE_CLIP_FROM_PAGE', clipId: item.id })));
    if (adjacentKey) {
      selected = adjacentKey;
      selectedKeys = new Set([adjacentKey]);
      selectionAnchor = adjacentKey;
    } else {
      clearSelection();
    }
    await load();
    showToast(t('marks_deleted', { count: items.length }), {
      label: t('undo'),
      onAction: async () => {
        if (await ReMarkStorage.undoLast()) {
          await Promise.all(highlights.map((item) => notifySourceTabs(item, { action: 'RESTORE_HIGHLIGHTS' })));
          await load();
        }
      }
    });
  }
  async function deleteMark(key) { await deleteMarks([key]); }
  async function copyMark(key, button) {
    const item = itemFor(key);
    if (!item) return;
    const payload = item.type === 'video'
      ? videoMarkSourceUrl(item)
      : (item.note ? `“${item.text}”\n\n${item.note}` : `“${item.text}”`);
    if (!payload) return;
    if (await copyText(payload)) {
      showCopyFeedback(button);
    }
  }
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { return document.execCommand('copy'); } catch (_) { return false; } finally { area.remove(); }
    }
  }
  function showCopyFeedback(button) {
    if (!button) return;
    if (!button.__remarkCopyFeedback) {
      button.__remarkCopyFeedback = { html: button.innerHTML };
    }
    clearTimeout(button.__remarkCopyFeedbackTimer);
    button.innerHTML = COPIED_BTN_ICON;
    button.classList.add('copy-success');
    button.__remarkCopyFeedbackTimer = setTimeout(() => {
      const original = button.__remarkCopyFeedback;
      if (!original) return;
      button.innerHTML = original.html;
      button.classList.remove('copy-success');
      button.__remarkCopyFeedback = null;
    }, 1200);
  }
  function quoteMarkdown(value) {
    return String(value || '').trim().split('\n').map((line) => `> ${line}`).join('\n');
  }
  function sourceMarkdown(rows, url) {
    if (!rows.length) return '';
    const title = rows[0].title || t('source_collection');
    const entries = rows.map((item, index) => {
      if (item.type === 'video') {
        const detail = item.caption?.text || item.chapter?.text || item.title || t('untitled_video');
        const sourceUrl = videoMarkSourceUrl(item);
        const source = sourceUrl ? `\n\n<${sourceUrl}>` : '';
        const note = item.note ? `\n\n**${t('add_note')}:** ${item.note}` : '';
        return `## ${index + 1}. ${clock(item.time)}${source}\n\n${detail}${note}`;
      }
      const note = item.note ? `\n\n**${t('add_note')}:** ${item.note}` : '';
      return `## ${index + 1}\n\n${quoteMarkdown(item.text)}${note}`;
    });
    return `# ${title}\n\n<${url}>\n\n${entries.join('\n\n---\n\n')}`;
  }
  async function copySourceMarkdown(button) {
    if (sourceUrl === null) return;
    const markdown = sourceMarkdown(sourceRowsFor(sourceUrl), sourceUrl);
    if (!markdown) return;
    if (await copyText(markdown)) {
      showCopyFeedback(button);
    }
  }

  // Lightweight toast: reversible actions stay quiet and auto-dismiss.
  let toastTimer = null;
  function showToast(message, options = {}) {
    const root = document.getElementById('remark-toast-root');
    if (!root) return;
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
      action.addEventListener('click', () => {
        clearTimeout(toastTimer);
        root.textContent = '';
        void options.onAction();
      });
      toast.appendChild(action);
    }
    root.appendChild(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { root.textContent = ''; }, options.duration ?? 4200);
  }
  function safeSendMessage(tabId, message) { const tabs = globalThis.chrome?.tabs; if (!tabs?.sendMessage || !Number.isInteger(tabId)) return Promise.resolve(); return tabs.sendMessage(tabId, message).catch((error) => { if (!/Receiving end does not exist/i.test(error?.message || "")) console.debug("[ReMark] Message delivery skipped:", error); }); }
  async function notifySourceTabs(item, message) {
    const pageUrl = item?.pageUrl || item?.url;
    if (item?.type !== 'highlight' || !pageUrl) return;
    try {
      const tabs = await globalThis.chrome?.tabs?.query({});
      await Promise.all((tabs || []).filter((tab) => sameUrl(tab.url, pageUrl) && Number.isInteger(tab.id)).map((tab) => safeSendMessage(tab.id, message)));
    } catch (_) {}
  }
  // If any highlight in this source still lacks page-position data and the
  // source page is open in a tab, ask its content script to backfill it so
  // the collection can be ordered top-to-bottom / left-to-right.
  function syncSourcePositions(url) {
    const rows = all().filter((item) => item.type === 'highlight' && sameUrl(item.url, url) && (item.position === null || item.posX === null));
    if (!rows.length) return;
    globalThis.chrome?.tabs?.query({}).then((tabs) => {
      const pageUrls = [...new Set(rows.map((item) => item.pageUrl || item.url).filter(Boolean))];
      pageUrls.forEach((pageUrl) => {
        const tab = tabs.find((row) => sameUrl(row.url, pageUrl));
        if (tab?.id) safeSendMessage(tab.id, { action: 'COMPUTE_CLIP_POSITIONS', url: pageUrl });
      });
    }).catch(() => {});
  }
  function setActive(key) { selected = key; list.querySelectorAll('.mark-active').forEach((node) => node.classList.remove('mark-active')); cardFor(key)?.classList.add('mark-active'); }
  function clearActive(key) { if (selected === key) { selected = null; cardFor(key)?.classList.remove('mark-active'); } }
  function setSelection(keys, anchor = null) {
    selectedKeys = new Set(keys);
    if (anchor !== null) selectionAnchor = anchor;
    list.querySelectorAll('.mark-selected').forEach((node) => node.classList.remove('mark-selected'));
    selectedKeys.forEach((key) => {
      const card = cardFor(key);
      if (card) {
        card.classList.add('mark-selected');
        card.setAttribute('aria-selected', 'true');
      }
    });
    list.querySelectorAll('.mark-card:not(.mark-selected)').forEach((card) => card.setAttribute('aria-selected', 'false'));
    list.classList.toggle('has-multiple-selection', selectedKeys.size > 1);
    updateSelectionTray();
  }
  function clearSelection() {
    selectedKeys = new Set();
    selectionAnchor = null;
    selected = null;
    list.querySelectorAll('.mark-selected, .mark-active').forEach((node) => node.classList.remove('mark-selected', 'mark-active'));
    list.querySelectorAll('.mark-card').forEach((card) => card.setAttribute('aria-selected', 'false'));
    list.classList.remove('has-multiple-selection');
    updateSelectionTray([]);
  }
  function clearNativeTextSelection() {
    const nativeSelection = window.getSelection?.();
    if (nativeSelection?.rangeCount) nativeSelection.removeAllRanges();
  }
  function isShiftRangePointer(event) {
    const card = event.target.closest?.('.mark-card');
    return Boolean(event.shiftKey && card && !event.target.closest('.mark-note-textarea, .mark-menu'));
  }
  function selectCard(key, event) {
    if (event.shiftKey) {
      event.preventDefault?.();
      clearNativeTextSelection();
    }
    const rows = visible();
    const isToggle = event.metaKey || event.ctrlKey;
    if (event.shiftKey && selectionAnchor) {
      const start = rows.findIndex((row) => row.key === selectionAnchor);
      const end = rows.findIndex((row) => row.key === key);
      if (start !== -1 && end !== -1) {
        setSelection(rows.slice(Math.min(start, end), Math.max(start, end) + 1).map((row) => row.key));
        setActive(key);
        return;
      }
    }
    if (isToggle) {
      const next = new Set(selectedKeys);
      if (next.has(key)) next.delete(key); else next.add(key);
      setSelection(next, key);
      if (next.has(key)) setActive(key); else clearActive(key);
      return;
    }
    setSelection([key], key);
    setActive(key);
  }
  function moveActive(delta) { const rows = visible(); if (!rows.length) return; let index = rows.findIndex((row) => row.key === selected); index = index < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, index + delta)); const key = rows[index].key; setSelection([key], key); setActive(key); cardFor(key)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  clipsPanel.addEventListener('error', (event) => {
    const icon = event.target;
    if (!icon.matches?.('.mark-source-favicon, .source-collection-favicon')) return;
    icon.replaceWith(sourceFallbackElement(icon.classList.contains('source-collection-favicon') ? 'source-collection-fallback' : 'mark-source-fallback'));
  }, true);
  function focusFromSource(id) { const item = all().find((row) => row.id === id); if (!item) return; if (sourceUrl !== null && !sameUrl(sourceUrl, item.url)) sourceUrl = null; selected = item.key; selectedKeys = new Set([item.key]); selectionAnchor = item.key; render(); const card = list.querySelector(`.mark-card[data-id="${CSS.escape(id)}"]`); if (!card) return; card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('remark-panel-focus'); setTimeout(() => card.classList.remove('remark-panel-focus'), 900); }
  async function jump(item) {
    if (!item) return;
    const pageUrl = item.type === 'highlight' ? (item.pageUrl || item.url) : item.url;
    const isLinkedSource = item.type === 'highlight' && item.url && pageUrl && !sameUrl(item.url, pageUrl);
    try {
      const tabs = await chrome.tabs.query({});
      if (isLinkedSource) {
        const sourceTab = tabs.find((tab) => sameUrl(tab.url, item.url));
        if (sourceTab?.id) {
          await chrome.tabs.update(sourceTab.id, { active: true });
          if (sourceTab.windowId) await chrome.windows.update(sourceTab.windowId, { focused: true });
        } else {
          await chrome.tabs.create({ url: item.url, active: true });
        }
        return;
      }
      const target = tabs.find((tab) => item.type === 'video' ? (sameVideoTab(item, tab.url) || sameUrl(tab.url, item.url)) : sameUrl(tab.url, pageUrl));
      if (target?.id) {
        await chrome.tabs.update(target.id, { active: true });
        if (target.windowId) await chrome.windows.update(target.windowId, { focused: true });
        if (item.type === 'video') safeSendMessage(target.id, { action: 'SEEK_VIDEO_MARK', time: item.time });
        else { safeSendMessage(target.id, { action: 'RESTORE_HIGHLIGHTS' }); setTimeout(() => safeSendMessage(target.id, { action: 'LOCATE_CLIP', clipId: item.id }), 90); }
        return;
      }
      if (item.type === 'highlight') {
        const tab = await chrome.tabs.create({ url: pageUrl, active: true });
        try { chrome.runtime.sendMessage({ action: 'TRACK_SOURCE_NAVIGATION', tabId: tab.id, clipId: item.id, url: pageUrl }); } catch (_) {}
        setTimeout(() => { safeSendMessage(tab.id, { action: 'RESTORE_HIGHLIGHTS' }); safeSendMessage(tab.id, { action: 'LOCATE_CLIP', clipId: item.id }); }, 900);
        return;
      }
    } catch (error) {
      console.warn('[ReMark] Mark jump failed:', error);
      showToast(t('source_unavailable'));
      return;
    }
    if (pageUrl) window.open(item.type === 'video' ? videoMarkSourceUrl(item) : pageUrl, '_blank');
  }

  function isGlyphHit(event, element) { const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) { if (!node.nodeValue.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); for (const rect of range.getClientRects()) { if (event.clientX >= rect.left - 1 && event.clientX <= rect.right + 1 && event.clientY >= rect.top - 1 && event.clientY <= rect.bottom + 1) return true; } } return false; }
  list.addEventListener('pointermove', (event) => {
    const control = event.target.closest('.mark-content-text[data-action="jump"]');
    if (!control) return;
    control.classList.toggle('is-glyph-hover', isGlyphHit(event, control));
  });
  list.addEventListener('pointerout', (event) => {
    const control = event.target.closest('.mark-content-text[data-action="jump"]');
    if (control && !control.contains(event.relatedTarget)) control.classList.remove('is-glyph-hover');
  });
  // Prevent the browser from extending a text range before the Shift-click event
  // is converted into a Marks range selection. Regular text copying is unchanged.
  list.addEventListener('mousedown', (event) => {
    if (!isShiftRangePointer(event)) return;
    event.preventDefault();
    clearNativeTextSelection();
  });
  list.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const { action, key, url } = control.dataset;
    if (action === 'jump' && (event.shiftKey || event.metaKey || event.ctrlKey)) { selectCard(key, event); return; }
    if (action === 'jump') {
      setSelection([key], key);
      setActive(key);
      if (isGlyphHit(event, control)) void jump(itemFor(key));
      return;
    }
    if (action === 'source') { sourceUrl = url || ''; clearSelection(); render(); syncSourcePositions(sourceUrl); return; }
    if (action === 'unmark') void deleteMark(key);
    if (action === 'note') { setSelection([key], key); setActive(key); openNote(key); }
    if (action === 'copy') void copyMark(key, control);
    if (action === 'menu') {
      setSelection([key], key);
      setActive(key);
      openMarkMenu(control.parentElement.querySelector('.mark-menu'));
    }
  });
  // Clicking a card establishes an anchor. Shift + click extends a continuous
  // range in the current visible order; Cmd/Ctrl + click toggles individual cards.
  list.addEventListener('click', (event) => {
    const card = event.target.closest('.mark-card');
    if (!card || event.target.closest('[data-action], .mark-note-textarea')) return;
    selectCard(card.dataset.key, event);
  });
  // The ··· menu is intentionally explicit: opening it requires a click.
  function openMarkMenu(menu) {
    if (!menu) return;
    document.querySelectorAll('.mark-menu:not([hidden])').forEach((node) => { if (node !== menu) node.hidden = true; });
    menu.hidden = !menu.hidden;
  }
  function closeMarkMenus() { document.querySelectorAll('.mark-menu:not([hidden])').forEach((node) => { node.hidden = true; }); }
  list.addEventListener('keydown', (event) => { const input = event.target.closest('.mark-note-textarea'); if (input) { const key = input.dataset.key; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void saveNote(key, input.value); } if (event.key === 'Escape') { event.preventDefault(); void saveNote(key, input.value); } } });
  list.addEventListener('input', (event) => { const input = event.target.closest('.mark-note-textarea'); if (input) resizeNoteInput(input); });
  list.addEventListener('focusout', (event) => { const input = event.target.closest('.mark-note-textarea'); if (input) setTimeout(() => { if (!input.closest('.mark-note-area')?.contains(document.activeElement)) void saveNote(input.dataset.key, input.value); }, 0); });
  list.addEventListener('focusin', (event) => { const card = event.target.closest('.mark-card'); if (keyboardFocus && card) { setSelection([card.dataset.key], card.dataset.key); setActive(card.dataset.key); } });
  list.addEventListener('focusout', (event) => { const card = event.target.closest('.mark-card'); if (!card) return; setTimeout(() => { if (!card.contains(document.activeElement)) clearActive(card.dataset.key); }, 0); });
  selectionExportButton.addEventListener('click', exportSelectedMarkdown);
  selectionCopyButton.addEventListener('click', () => { void copySelectedMarkdown(); });
  selectionClearButton.addEventListener('click', clearSelection);
  document.addEventListener('pointerdown', (event) => { keyboardFocus = false; if (!event.target.closest('.mark-card, .selection-tray')) clearSelection(); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.mark-actions')) document.querySelectorAll('.mark-menu:not([hidden])').forEach((node) => { node.hidden = true; }); });
  back.addEventListener('click', () => { sourceUrl = null; clearSelection(); render(true); });
  function clearSearch() { search.value = ''; query = ''; clear.hidden = true; render(); }
  search.addEventListener('input', () => { query = search.value; clear.hidden = !query; render(); });
  search.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); clearSearch(); } });
  clear.addEventListener('click', () => { clearSearch(); search.focus(); });
  document.addEventListener('keydown', async (event) => { if (event.key === 'Tab' || event.key.startsWith('Arrow')) keyboardFocus = true; if (event.key === 'Escape' && !feedbackModal.hidden) { event.preventDefault(); closeFeedback(); return; } const editing = ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable; if (!editing && event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); return; } if (!editing && event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); return; } if (!editing && event.key === 'Enter' && event.shiftKey && selected && !event.target.closest('.mark-menu, .mark-actions')) { event.preventDefault(); openNote(selected); return; } if (!editing && (event.metaKey || event.ctrlKey) && event.key === 'Enter' && selected) { event.preventDefault(); openNote(selected); } else if (!editing && !event.isComposing && ['Delete','Backspace'].includes(event.key) && selectedKeys.size) { event.preventDefault(); await deleteMarks(); } else if (!editing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (await ReMarkStorage.undoLast()) await load(); } else if (!editing && event.key === 'Escape' && selectedKeys.size) { clearSelection(); } else if (!editing && event.key === '/') { event.preventDefault(); search.focus(); } else if (!editing && event.key === 'Escape' && showingSettings) { showTimeline(); } else if (!editing && event.key === 'Escape' && sourceUrl !== null) { sourceUrl = null; clearSelection(); render(true); } });
  globalThis.chrome?.runtime?.onMessage?.addListener((message) => {
    if (message?.action === 'REMARK_STORAGE_UPDATED') void load();
    if (message?.action === 'FOCUS_CLIP') focusFromSource(message.clipId || message.markId);
    if (message?.action === 'SOURCE_MARK_UNAVAILABLE' || message?.action === 'SOURCE_UNAVAILABLE') showToast(t('source_unavailable'));
  });
  async function consumePendingFocus() { try { const session = globalThis.chrome?.storage?.local; if (!session) return; const data = await session.get('remark_pending_focus'); const id = data?.remark_pending_focus?.clipId || data?.remark_pending_focus?.markId; if (id) { await session.remove('remark_pending_focus'); focusFromSource(id); } } catch (_) {} }
  globalThis.chrome?.storage?.onChanged?.addListener((changes) => { const pending = changes?.remark_pending_focus?.newValue; if (pending) focusFromSource(pending.clipId || pending.markId); void load(); });
  try {
    await ReMarkStorage.init();
    await initializeLanguagePreference();
    await load(true);
    await consumePendingFocus();
  } catch (error) {
    console.error('[ReMark] Sidepanel initialization failed:', error);
    empty.hidden = false;
    $('h3', empty).textContent = t('load_failed_title');
    $('p', empty).textContent = t('load_failed_description');
  }
});
  // Font Awesome Free 6.7.2 — fa-link (CC BY 4.0, Fonticons Inc.).
  const LINK_SOURCE_SVG = '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>';
