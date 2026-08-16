/** ReMark Sidepanel: chronological Marks, lightweight Notes, native source order. */
document.addEventListener('DOMContentLoaded', async () => {
  const t = ReMarkI18n.t;
  ReMarkI18n.apply();
  let clips = [], videos = [], sourceUrl = null, query = '', selected = null, keyboardFocus = false;
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
  let showingSettings = false;

  function showSettings() {
    showingSettings = true;
    timelineControls.hidden = true;
    clipsPanel.hidden = true;
    settingsPanel.hidden = false;
    settingsOpenButton.hidden = true;
    appContainer.classList.add('is-more-open');
    viewIdentity.hidden = true;
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

  $('#replay-tutorial').addEventListener('click', () => { void replayTutorial(); });
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
  const clock = (v) => { const n = Math.max(0, Math.floor(Number(v) || 0)), h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60, p = (x) => String(x).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`; };
  const itemFor = (key) => all().find((item) => item.key === key);
  const cardFor = (key) => list.querySelector(`.mark-card[data-key="${CSS.escape(key)}"]`);

  function all() {
    return [
      ...clips.map((raw) => ({ id: raw.id, key: `h:${raw.id}`, type: 'highlight', raw, url: raw.url || '', title: raw.pageTitle || t('untitled_page'), text: raw.text || '', note: raw.note || '', createdAt: Number(raw.createdAt) || 0, position: Number.isFinite(Number(raw.sourcePosition)) ? Number(raw.sourcePosition) : null })),
      ...videos.map((raw) => ({ id: raw.id, key: `v:${raw.id}`, type: 'video', raw, url: raw.url || '', title: raw.title || t('untitled_video'), text: '', note: raw.note || '', createdAt: Number(raw.createdAt) || 0, time: Number(raw.time) || 0, duration: Number(raw.duration) || 0 }))
    ];
  }
  function visible() {
    const q = query.trim().toLowerCase();
    let rows = all().filter((item) => !q || [item.text, item.note, item.title, item.url, item.type === 'video' ? clock(item.time) : ''].some((v) => String(v).toLowerCase().includes(q)));
    if (sourceUrl === null) return rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.filter((item) => sameUrl(item.url, sourceUrl)).sort((a, b) => {
      if (a.type === 'video' && b.type === 'video') return a.time - b.time;
      if (a.type === 'highlight' && b.type === 'highlight') { if (a.position !== null && b.position !== null) return a.position - b.position; if (a.position !== null) return -1; if (b.position !== null) return 1; }
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

  function ago(value) {
    const elapsed = Math.max(0, Date.now() - value);
    if (elapsed < 60000) return t('just_now');
    if (elapsed < 3600000) return t('minutes_ago', { count: Math.floor(elapsed / 60000) });
    if (elapsed < 86400000) return t('hours_ago', { count: Math.floor(elapsed / 3600000) });
    if (elapsed < 604800000) return t('days_ago', { count: Math.floor(elapsed / 86400000) });
    const locale = ReMarkI18n.locale === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(new Date(value));
  }
  function markHtml(item, index = 0) {
    const jumpTitle = item.type === 'video'
      ? t('jump_to_time', { time: clock(item.time) })
      : item.text;
    const content = item.type === 'video'
      ? `<span class="video-timestamp"><span aria-hidden="true">▶</span>${clock(item.time)}</span>`
        + (item.duration ? `<span class="video-duration"> / ${clock(item.duration)}</span>` : '')
      : `“${esc(item.text)}”`;
    const note = item.note
      ? `<button class="mark-note" data-action="note" data-key="${esc(item.key)}" type="button">${esc(item.note)}</button>`
      : '';
    const editor = [
      `<div class="mark-note-editor" data-key="${esc(item.key)}" hidden>`,
      `<textarea class="mark-note-textarea" aria-label="${esc(t('add_note'))}" placeholder="${esc(t('note_placeholder'))}">${esc(item.note)}</textarea>`,
      `<div class="mark-note-editor-hint">${esc(t('note_save_hint'))}</div>`,
      item.note ? `<button class="note-remove" data-action="remove-note" data-key="${esc(item.key)}" type="button">${esc(t('remove_note'))}</button>` : '',
      '</div>'
    ].join('');
    const source = `${item.title}${host(item.url) ? ` · ${host(item.url)}` : ''}`;
    const favicon = faviconUrl(item.url);
    const sourceIcon = favicon
      ? `<img class="mark-source-favicon" src="${esc(favicon)}" alt="" aria-hidden="true">`
      : '';
    const sourceControl = sourceUrl === null
      ? `<button class="mark-source" data-action="source" data-url="${esc(item.url)}" type="button" title="${esc(item.url)}">${sourceIcon}<span>${esc(source)}</span></button>`
      : '';
    const menu = [
      `<button data-action="note" data-key="${esc(item.key)}" type="button">${esc(t(item.note ? 'edit_note' : 'add_note'))}</button>`,
      item.note ? `<button data-action="remove-note" data-key="${esc(item.key)}" type="button">${esc(t('remove_note'))}</button>` : '',
      `<button data-action="delete" data-key="${esc(item.key)}" type="button">${esc(t('delete_mark'))}</button>`
    ].join('');
    return [
      `<article class="mark-card mark-card--${item.type}" data-key="${esc(item.key)}" data-id="${esc(item.id)}" tabindex="0" style="--i:${index}">`,
      `<div class="mark-content"><button class="mark-content-text" data-action="jump" data-key="${esc(item.key)}" type="button" title="${esc(jumpTitle)}">${content}</button></div>`,
      `<div class="mark-note-area">${note}${editor}</div>`,
      `<footer class="mark-footer">${sourceControl}`,
      `<span class="mark-created">${ago(item.createdAt)}</span><div class="mark-actions">`,
      `<button class="mark-action mark-more" data-action="menu" data-key="${esc(item.key)}" type="button" aria-label="${esc(t('more_actions'))}">···</button>`,
      `<div class="mark-menu" hidden>${menu}</div></div></footer></article>`
    ].join('');
  }
  function render(animated = false) {
    if (showingSettings) return;
    const rows = visible();
    const inSource = sourceUrl !== null;
    back.hidden = !inSource;
    if (inSource) {
      const sourceRows = all().filter((item) => sameUrl(item.url, sourceUrl));
      const title = sourceRows[0]?.title || t('source_collection');
      subtitle.hidden = false;
      subtitle.textContent = title;
      context.hidden = false;
      const count = sourceRows.length;
      context.innerHTML = [
        '<div class="source-collection-summary">',
        `<span>${esc(t('marks_in_source'))}</span>`,
        `<strong>${esc(count === 1 ? t('one_mark') : t('marks_count', { count }))}</strong>`,
        '</div>'
      ].join('');
    } else if (query) {
      subtitle.hidden = false;
      subtitle.textContent = t('timeline');
      context.hidden = false;
      context.innerHTML = `<div class="search-summary">${esc(rows.length === 1 ? t('one_mark_found') : t('marks_found', { count: rows.length }))}</div>`;
    } else {
      subtitle.hidden = false;
      subtitle.textContent = t('timeline');
      context.hidden = true;
      context.innerHTML = '';
    }
    list.classList.toggle('is-entering', Boolean(animated));
    let previous = '';
    const html = [];
    rows.forEach((item, index) => {
      const label = day(item.createdAt);
      if (!inSource && label !== previous) {
        html.push(`<div class="feed-day-heading" style="--i:${html.length}">${label}</div>`);
        previous = label;
      }
      html.push(markHtml(item, html.length));
    });
    list.innerHTML = html.join('');
    empty.hidden = rows.length > 0;
    if (selected) cardFor(selected)?.classList.add('mark-active');
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
  }
  async function load(animated) { [clips, videos] = await Promise.all([ReMarkStorage.getClips(), ReMarkStorage.getVideoMarks()]); render(animated); }
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
  function openNote(key) { const card = cardFor(key), editor = $('.mark-note-editor', card); if (!editor) return; editor.hidden = false; $('.mark-note', card)?.setAttribute('hidden', ''); $('.note-add', card)?.setAttribute('hidden', ''); const input = $('textarea', editor); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  async function deleteMark(key) {
    const item = itemFor(key);
    if (!item) return;
    let messageKey = 'mark_deleted';
    if (item.type === 'video') {
      await ReMarkStorage.deleteVideoMark(item.id);
      await ReMarkStorage.pushUndo({ type: 'delete_video_mark', item: item.raw });
      messageKey = 'video_mark_deleted';
    } else {
      await ReMarkStorage.deleteClip(item.id);
      await ReMarkStorage.pushUndo({ type: 'delete_clip', item: item.raw });
    }
    selected = null;
    await load();
    showToast(t(messageKey), {
      label: t('undo'),
      onAction: async () => { if (await ReMarkStorage.undoLast()) await load(); }
    });
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
  function syncSourceActive(item, active) { if (item?.type !== 'highlight') return; globalThis.chrome?.tabs?.query({}).then((tabs) => { const tab = tabs.find((row) => sameUrl(row.url, item.url)); if (tab?.id) safeSendMessage(tab.id, { action: active ? 'SET_ACTIVE_CLIP' : 'CLEAR_ACTIVE_CLIP', clipId: item.id }); }).catch(() => {}); }
  function setActive(key) { selected = key; list.querySelectorAll('.mark-active').forEach((node) => node.classList.remove('mark-active')); const item = itemFor(key); cardFor(key)?.classList.add('mark-active'); syncSourceActive(item, true); }
  function clearActive(key) { if (selected === key) { const item = itemFor(key); selected = null; cardFor(key)?.classList.remove('mark-active'); syncSourceActive(item, false); } }
  function moveActive(delta) { const rows = visible(); if (!rows.length) return; let index = rows.findIndex((row) => row.key === selected); index = index < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, index + delta)); const key = rows[index].key; setActive(key); cardFor(key)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  list.addEventListener('error', (event) => {
    if (event.target.matches?.('.mark-source-favicon')) event.target.remove();
  }, true);
  function focusFromSource(id) { const item = all().find((row) => row.id === id); if (!item) return; if (sourceUrl !== null && !sameUrl(sourceUrl, item.url)) sourceUrl = null; selected = item.key; render(); const card = list.querySelector(`.mark-card[data-id="${CSS.escape(id)}"]`); if (!card) return; card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('remark-panel-focus'); setTimeout(() => card.classList.remove('remark-panel-focus'), 900); }
  async function jump(item) { if (!item) return; try { const tabs = await chrome.tabs.query({}), target = tabs.find((tab) => item.type === 'video' ? (sameVideoTab(item, tab.url) || sameUrl(tab.url, item.url)) : sameUrl(tab.url, item.url)); if (target?.id) { await chrome.tabs.update(target.id, { active:true }); if (target.windowId) await chrome.windows.update(target.windowId, { focused:true }); safeSendMessage(target.id, item.type === 'video' ? { action:'SEEK_VIDEO_MARK', time:item.time } : { action:'LOCATE_CLIP', clipId:item.id }); return; } if (item.type === 'highlight') { const tab = await chrome.tabs.create({ url:item.url, active:true }); setTimeout(() => safeSendMessage(tab.id, { action:'LOCATE_CLIP', clipId:item.id }), 1200); return; } } catch (e) { console.warn('[ReMark] Mark jump failed:', e); } if (item.url) window.open(item.type === 'video' ? `${item.url}${item.url.includes('?') ? '&' : '?'}t=${Math.floor(item.time)}` : item.url, '_blank'); }

  function isGlyphHit(event, element) { const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) { if (!node.nodeValue.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); for (const rect of range.getClientRects()) { if (event.clientX >= rect.left - 1 && event.clientX <= rect.right + 1 && event.clientY >= rect.top - 1 && event.clientY <= rect.bottom + 1) return true; } } return false; }
  list.addEventListener('click', (event) => { const control = event.target.closest('[data-action]'); if (!control) return; const { action, key, url } = control.dataset; if (action === 'jump') { if (isGlyphHit(event, control)) void jump(itemFor(key)); else setActive(key); } if (action === 'source') { sourceUrl = url || ''; selected = null; render(); } if (action === 'note') openNote(key); if (action === 'remove-note') void saveNote(key, ''); if (action === 'delete') void deleteMark(key); if (action === 'menu') { const menu = control.parentElement.querySelector('.mark-menu'); document.querySelectorAll('.mark-menu:not([hidden])').forEach((node) => { if (node !== menu) node.hidden = true; }); menu.hidden = !menu.hidden; } });
  list.addEventListener('click', (event) => { const card = event.target.closest('.mark-card'); if (!card || event.target.closest('.mark-content-text, [data-action], .mark-note-editor')) return; setActive(card.dataset.key); });
  list.addEventListener('keydown', (event) => { const input = event.target.closest('.mark-note-textarea'); if (input) { const key = input.closest('.mark-note-editor').dataset.key; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void saveNote(key, input.value); } if (event.key === 'Escape') { event.preventDefault(); void saveNote(key, input.value); } } });
  list.addEventListener('focusout', (event) => { const input = event.target.closest('.mark-note-textarea'); if (input) setTimeout(() => { if (!input.closest('.mark-note-editor')?.contains(document.activeElement)) void saveNote(input.closest('.mark-note-editor').dataset.key, input.value); }, 0); });
  list.addEventListener('focusin', (event) => { const card = event.target.closest('.mark-card'); if (keyboardFocus && card) setActive(card.dataset.key); });
  list.addEventListener('focusout', (event) => { const card = event.target.closest('.mark-card'); if (!card) return; setTimeout(() => { if (!card.contains(document.activeElement)) clearActive(card.dataset.key); }, 0); });
  document.addEventListener('pointerdown', () => { keyboardFocus = false; if (selected) clearActive(selected); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.mark-actions')) document.querySelectorAll('.mark-menu:not([hidden])').forEach((node) => { node.hidden = true; }); });
  back.addEventListener('click', () => { sourceUrl = null; selected = null; render(true); });
  function clearSearch() { search.value = ''; query = ''; clear.hidden = true; render(); }
  search.addEventListener('input', () => { query = search.value; clear.hidden = !query; render(); });
  search.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); clearSearch(); } });
  clear.addEventListener('click', () => { clearSearch(); search.focus(); });
  document.addEventListener('keydown', async (event) => { if (event.key === 'Tab' || event.key.startsWith('Arrow')) keyboardFocus = true; const editing = ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName); if (!editing && event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); return; } if (!editing && event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); return; } if (!editing && event.key === 'Enter' && event.shiftKey && selected && !event.target.closest('.mark-menu, .mark-actions')) { event.preventDefault(); openNote(selected); return; } if (!editing && (event.metaKey || event.ctrlKey) && event.key === 'Enter' && selected) { event.preventDefault(); openNote(selected); } else if (!editing && ['Delete','Backspace'].includes(event.key) && selected) { event.preventDefault(); await deleteMark(selected); } else if (!editing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (await ReMarkStorage.undoLast()) await load(); } else if (!editing && event.key === '/') { event.preventDefault(); search.focus(); } else if (!editing && event.key === 'Escape' && showingSettings) { showTimeline(); } else if (!editing && event.key === 'Escape' && sourceUrl !== null) { sourceUrl = null; selected = null; render(true); } });
  globalThis.chrome?.runtime?.onMessage?.addListener((message) => { if (message?.action === 'REMARK_STORAGE_UPDATED') void load(); if (message?.action === 'FOCUS_CLIP') focusFromSource(message.clipId || message.markId); });
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