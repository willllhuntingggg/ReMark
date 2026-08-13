/**
 * ReMark Sidepanel Controller
 * Tags removed. Note editing is inline on each card.
 */

document.addEventListener('DOMContentLoaded', async () => {
  let clips = [];
  let videoMarks = [];
  let searchQuery = '';
  let selectedPageUrls = new Set();

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const clipsContainer = document.getElementById('clips-container');
  const clipsEmptyState = document.getElementById('clips-empty-state');

  setupEventListeners();

  // Real-time sync
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'REMARK_STORAGE_UPDATED') loadData();
    });
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(() => loadData());
  }

  try {
    await ReMarkStorage.init();
    await loadData();
  } catch (err) {
    console.error('[ReMark] Error initializing sidepanel:', err);
  }

  async function loadData() {
    try {
      clips = await ReMarkStorage.getClips();
      videoMarks = await ReMarkStorage.getVideoMarks();
      updateBatchActionBar();
      await renderClips();
    } catch (e) {
      console.error('[ReMark] Error in loadData:', e);
    }
  }

  // ── Render Pages & Cards ──────────────────────────────────────

  async function renderClips() {
    const pages = await ReMarkStorage.getPages();

    if (!pages.length) {
      clipsContainer.innerHTML = '';
      clipsEmptyState.style.display = 'block';
      return;
    }

    let filteredPages = pages.map(page => {
      let pageClips = [...page.clips];
      let pageMarks = [...page.marks];

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        pageClips = pageClips.filter(c =>
          (c.text && c.text.toLowerCase().includes(q)) ||
          (c.note && c.note.toLowerCase().includes(q)) ||
          (page.pageTitle && page.pageTitle.toLowerCase().includes(q))
        );
        pageMarks = pageMarks.filter(m =>
          (m.title && m.title.toLowerCase().includes(q)) ||
          (m.note && m.note.toLowerCase().includes(q)) ||
          formatTimeSide(m.time).includes(q)
        );
      }

      return { ...page, clips: pageClips, marks: pageMarks };
    }).filter(p => p.clips.length > 0 || p.marks.length > 0);

    // Clean stale selections
    const visibleUrls = new Set(filteredPages.map(p => p.url));
    selectedPageUrls.forEach(url => { if (!visibleUrls.has(url)) selectedPageUrls.delete(url); });

    if (!filteredPages.length) {
      clipsContainer.innerHTML = '';
      clipsEmptyState.style.display = 'block';
      updateBatchActionBar(filteredPages);
      return;
    }

    clipsEmptyState.style.display = 'none';

    let html = '';
    filteredPages.forEach(page => {
      const isChecked = selectedPageUrls.has(page.url);
      const safeUrl = escapeHtml(page.url || '');
      const safeTitle = escapeHtml(page.pageTitle || '未知网页');
      html += `
        <div class="url-group-card ${isChecked ? 'selected-page' : ''}" data-page-url="${safeUrl}">
          <div class="url-group-header" data-url="${safeUrl}">
            <div class="url-info">
              <input type="checkbox" class="page-select-checkbox" data-page-url="${safeUrl}" ${isChecked ? 'checked' : ''} title="选择此页面">
              <span class="url-icon">🌐</span>
              <div style="overflow: hidden;">
                <a href="${safeUrl}" target="_blank" class="url-title" title="${safeTitle}">${safeTitle}</a>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="url-badge">${page.clips.length} 条划线${page.marks.length ? ` · ${page.marks.length} 个打点` : ''}</span>
              <span class="clip-action-icon btn-delete-page" data-url="${safeUrl}" title="删除此页面的归档">🗑️</span>
            </div>
          </div>
          <div class="url-clips-body">
            ${page.clips.map(clip => renderClipCardHTML(clip)).join('')}
            ${page.marks.map(mark => renderVideoMarkCardHTML(mark)).join('')}
          </div>
        </div>
      `;
    });

    clipsContainer.innerHTML = html;
    bindPageEvents(filteredPages);
    bindCardEvents();
    updateBatchActionBar(filteredPages);
  }

  // ── Card HTML ─────────────────────────────────────────────────

  function renderClipCardHTML(clip) {
    const noteHtml = clip.note
      ? `<div class="clip-note-display" data-clip-id="${clip.id}">💡 ${escapeHtml(clip.note)}</div>`
      : `<div class="clip-note-placeholder" data-clip-id="${clip.id}">+ 添加笔记</div>`;

    return `
      <div class="clip-card" data-clip-id="${clip.id}">
        <div class="clip-highlight-box" style="border-left-color: ${clip.color || '#FFE066'}; background: ${getLightColor(clip.color)}">
          "${escapeHtml(clip.text)}"
        </div>
        <div class="clip-note-area">
          ${noteHtml}
          <div class="clip-note-editor" data-clip-id="${clip.id}" style="display:none;">
            <textarea class="clip-note-textarea" placeholder="写下你的想法...">${escapeHtml(clip.note || '')}</textarea>
            <div class="clip-note-editor-actions">
              <span class="note-hint">⌘↵ 保存 · Esc 取消</span>
              <button class="note-save-btn" data-clip-id="${clip.id}">保存</button>
            </div>
          </div>
        </div>
        <div class="clip-footer">
          <div class="clip-actions">
            <span class="clip-action-icon btn-locate-clip" data-clip-id="${clip.id}" data-clip-url="${escapeHtml(clip.url)}" title="定位到原文位置">📍</span>
            <span class="clip-action-icon btn-delete-clip" data-clip-id="${clip.id}" title="删除划线">🗑️</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderVideoMarkCardHTML(mark) {
    const noteHtml = mark.note
      ? `<div class="clip-note-display" data-mark-id="${mark.id}">💡 ${escapeHtml(mark.note)}</div>`
      : `<div class="clip-note-placeholder" data-mark-id="${mark.id}">+ 添加笔记</div>`;

    return `
      <div class="clip-card remark-video-mark-card" data-mark-id="${mark.id}">
        <div class="clip-highlight-box" style="border-left-color: #00A1D6; background: rgba(0,161,214,0.12);">
          ⏱️ <b>${formatTimeSide(mark.time)}</b><span style="opacity:0.55; font-size:11px;"> / ${formatTimeSide(mark.duration)}</span>
        </div>
        <div class="clip-video-title">🎬 ${escapeHtml(mark.title || '视频打点')}</div>
        <div class="clip-note-area">
          ${noteHtml}
          <div class="clip-note-editor" data-mark-id="${mark.id}" style="display:none;">
            <textarea class="clip-note-textarea" placeholder="写下这个时间点的想法...">${escapeHtml(mark.note || '')}</textarea>
            <div class="clip-note-editor-actions">
              <span class="note-hint">⌘↵ 保存 · Esc 取消</span>
              <button class="note-save-btn" data-mark-id="${mark.id}">保存</button>
            </div>
          </div>
        </div>
        <div class="clip-footer">
          <div class="clip-actions">
            <span class="clip-action-icon btn-open-video-mark" data-mark-id="${mark.id}" title="跳转到该时间点">▶️</span>
            <span class="clip-action-icon btn-delete-video-mark" data-mark-id="${mark.id}" title="删除此打点">🗑️</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Note Inline Editing ───────────────────────────────────────

  function openNoteEditor(editorEl, displayEl, placeholderEl) {
    if (displayEl) displayEl.style.display = 'none';
    if (placeholderEl) placeholderEl.style.display = 'none';
    editorEl.style.display = 'block';
    const ta = editorEl.querySelector('.clip-note-textarea');
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  function closeNoteEditor(editorEl, displayEl, placeholderEl, savedNote) {
    editorEl.style.display = 'none';
    if (savedNote) {
      if (displayEl) { displayEl.textContent = '💡 ' + savedNote; displayEl.style.display = 'block'; }
      if (placeholderEl) placeholderEl.style.display = 'none';
    } else {
      if (displayEl) displayEl.style.display = 'block';
      if (placeholderEl) placeholderEl.style.display = displayEl ? 'none' : 'block';
    }
  }

  function bindNoteEditing(container) {
    // Clip notes
    container.querySelectorAll('.clip-note-display[data-clip-id], .clip-note-placeholder[data-clip-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const clipId = el.getAttribute('data-clip-id');
        const card = el.closest('.clip-card');
        const editorEl = card.querySelector(`.clip-note-editor[data-clip-id="${clipId}"]`);
        const displayEl = card.querySelector(`.clip-note-display[data-clip-id="${clipId}"]`);
        const placeholderEl = card.querySelector(`.clip-note-placeholder[data-clip-id="${clipId}"]`);
        openNoteEditor(editorEl, displayEl, placeholderEl);
      });
    });

    // Video mark notes
    container.querySelectorAll('.clip-note-display[data-mark-id], .clip-note-placeholder[data-mark-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const markId = el.getAttribute('data-mark-id');
        const card = el.closest('.clip-card');
        const editorEl = card.querySelector(`.clip-note-editor[data-mark-id="${markId}"]`);
        const displayEl = card.querySelector(`.clip-note-display[data-mark-id="${markId}"]`);
        const placeholderEl = card.querySelector(`.clip-note-placeholder[data-mark-id="${markId}"]`);
        openNoteEditor(editorEl, displayEl, placeholderEl);
      });
    });

    // Save buttons & keyboard shortcuts
    container.querySelectorAll('.clip-note-editor').forEach(editorEl => {
      const clipId = editorEl.getAttribute('data-clip-id');
      const markId = editorEl.getAttribute('data-mark-id');
      const card = editorEl.closest('.clip-card');
      const ta = editorEl.querySelector('.clip-note-textarea');
      const saveBtn = editorEl.querySelector('.note-save-btn');

      const displayEl = clipId
        ? card.querySelector(`.clip-note-display[data-clip-id="${clipId}"]`)
        : card.querySelector(`.clip-note-display[data-mark-id="${markId}"]`);
      const placeholderEl = clipId
        ? card.querySelector(`.clip-note-placeholder[data-clip-id="${clipId}"]`)
        : card.querySelector(`.clip-note-placeholder[data-mark-id="${markId}"]`);

      const save = async () => {
        const note = ta.value.trim();
        if (clipId) {
          await ReMarkStorage.updateClip(clipId, { note });
          clips = await ReMarkStorage.getClips();
        } else if (markId) {
          await ReMarkStorage.updateVideoMark(markId, { note });
          videoMarks = await ReMarkStorage.getVideoMarks();
        }

        // Update display without full re-render
        if (note) {
          if (displayEl) { displayEl.textContent = '💡 ' + note; displayEl.style.display = 'block'; }
          else {
            // Create display element if it didn't exist
            const newDisplay = document.createElement('div');
            newDisplay.className = 'clip-note-display';
            newDisplay.setAttribute(clipId ? 'data-clip-id' : 'data-mark-id', clipId || markId);
            newDisplay.textContent = '💡 ' + note;
            newDisplay.addEventListener('click', (ev) => { ev.stopPropagation(); openNoteEditor(editorEl, newDisplay, null); });
            editorEl.parentNode.insertBefore(newDisplay, editorEl);
          }
          if (placeholderEl) placeholderEl.style.display = 'none';
        } else {
          if (displayEl) displayEl.style.display = 'none';
          if (placeholderEl) placeholderEl.style.display = 'block';
        }
        closeNoteEditor(editorEl, note ? displayEl : null, note ? null : placeholderEl, note);
      };

      saveBtn?.addEventListener('click', (e) => { e.stopPropagation(); save(); });

      ta?.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeNoteEditor(editorEl, displayEl, placeholderEl, ta.value.trim() || null);
        }
      });
    });
  }

  // ── Card & Page Events ────────────────────────────────────────

  function bindPageEvents(filteredPages) {
    clipsContainer.querySelectorAll('.page-select-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const url = cb.getAttribute('data-page-url');
        if (!url) return;
        if (cb.checked) selectedPageUrls.add(url); else selectedPageUrls.delete(url);
        updateBatchActionBar(filteredPages || []);
        const card = cb.closest('.url-group-card');
        if (card) card.classList.toggle('selected-page', cb.checked);
      });
    });

    clipsContainer.querySelectorAll('.btn-delete-page').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (!confirm('确定要删除该网页下的所有划线与打点记录吗？')) return;
        await notifyContentScriptDeletePage(url);
        await ReMarkStorage.deletePage(url);
        await loadData();
      });
    });
  }

  function bindCardEvents() {
    // Locate clip
    clipsContainer.querySelectorAll('.btn-locate-clip').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await locateClipInPage(btn.getAttribute('data-clip-id'), btn.getAttribute('data-clip-url'));
      });
    });

    // Click highlight text to locate
    clipsContainer.querySelectorAll('.clip-card:not(.remark-video-mark-card)').forEach(card => {
      card.querySelector('.clip-highlight-box')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const clipId = card.getAttribute('data-clip-id');
        const clip = clips.find(c => c.id === clipId);
        if (clip) await locateClipInPage(clipId, clip.url);
      });
    });

    // Delete clip
    clipsContainer.querySelectorAll('.btn-delete-clip').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-clip-id');
        await notifyContentScriptDeleteClip(id);
        await ReMarkStorage.deleteClip(id);
        await loadData();
      });
    });

    // Play video mark
    clipsContainer.querySelectorAll('.btn-open-video-mark').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-mark-id');
        const mark = videoMarks.find(m => m.id === id);
        if (mark) await openVideoMarkInTab(mark);
      });
    });

    // Delete video mark
    clipsContainer.querySelectorAll('.btn-delete-video-mark').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-mark-id');
        await ReMarkStorage.deleteVideoMark(id);
        await notifyContentRefreshVideoMarks();
        await loadData();
      });
    });

    // Inline note editing
    bindNoteEditing(clipsContainer);
  }

  // ── Batch Actions ─────────────────────────────────────────────

  function updateBatchActionBar(filteredPages) {
    const bar = document.getElementById('batch-actions-bar');
    const countEl = document.getElementById('batch-selected-count');
    const selectAll = document.getElementById('batch-select-all-page');
    const exportBtn = document.getElementById('batch-export-markdown');
    if (!bar) return;
    bar.style.display = selectedPageUrls.size > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${selectedPageUrls.size} 个页面已选`;
    if (selectAll && filteredPages) {
      selectAll.checked = filteredPages.length > 0 && filteredPages.every(p => selectedPageUrls.has(p.url));
    }
    if (exportBtn) exportBtn.disabled = selectedPageUrls.size === 0;
  }

  function setupBatchActionBarHandlers() {
    const selectAll = document.getElementById('batch-select-all-page');
    const clearBtn = document.getElementById('batch-clear-selection');
    const exportBtn = document.getElementById('batch-export-markdown');

    selectAll?.addEventListener('change', async (e) => {
      const pages = await ReMarkStorage.getPages();
      const filtered = pages.map(page => {
        let pageClips = [...page.clips];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          pageClips = pageClips.filter(c =>
            (c.text && c.text.toLowerCase().includes(q)) ||
            (c.note && c.note.toLowerCase().includes(q)) ||
            (page.pageTitle && page.pageTitle.toLowerCase().includes(q))
          );
        }
        return { ...page, clips: pageClips };
      }).filter(p => p.clips.length > 0 || p.marks.length > 0);

      const visibleUrls = new Set(filtered.map(p => p.url));
      if (e.target.checked) visibleUrls.forEach(u => selectedPageUrls.add(u));
      else visibleUrls.forEach(u => selectedPageUrls.delete(u));
      await renderClips();
    });

    clearBtn?.addEventListener('click', async () => { selectedPageUrls.clear(); await renderClips(); });

    exportBtn?.addEventListener('click', () => {
      if (selectedPageUrls.size === 0) return;
      const md = buildMarkdownExport(Array.from(selectedPageUrls));
      if (md.trim()) downloadTextFile(md, `remark-export-${formatFileStamp(new Date())}.md`);
    });
  }

  // ── Markdown Export ───────────────────────────────────────────

  function buildMarkdownExport(urls) {
    const sections = [];
    let clipTotal = 0, markTotal = 0;

    for (const url of urls) {
      const base = url.split('#')[0];
      const pageClips = clips.filter(c => c.url && c.url.split('#')[0] === base);
      const pageMarks = videoMarks.filter(m => m.url && m.url.split('#')[0] === base);
      if (!pageClips.length && !pageMarks.length) continue;

      clipTotal += pageClips.length;
      markTotal += pageMarks.length;
      const pageTitle = pageClips[0]?.pageTitle || pageMarks[0]?.title || url;

      sections.push(`## ${pageTitle}`, '', `来源：[${pageTitle}](${url})`, '');

      if (pageClips.length) {
        sections.push('### 划线段落', '');
        pageClips.forEach(c => {
          sections.push(`> ${String(c.text || '').replace(/\n+/g, '\n> ')}`, '');
          if (c.note) sections.push(`**💡 笔记：** ${c.note}`, '');
          sections.push('---', '');
        });
      }

      if (pageMarks.length) {
        sections.push('### 视频打点', '');
        pageMarks.forEach(m => {
          const noteStr = m.note ? ` — 💡 ${m.note}` : '';
          sections.push(`- ⏱️ ${formatTimeSide(m.time)}${m.duration ? ` / ${formatTimeSide(m.duration)}` : ''}${noteStr} [${m.title || '打开视频'}](${url})`);
        });
        sections.push('');
      }
    }

    const header = [
      '# ReMark 导出',
      '',
      `> 导出时间：${new Date().toLocaleString('zh-CN')} · 共 ${urls.length} 个网页、${clipTotal} 条划线、${markTotal} 个视频打点`,
      ''
    ];
    return header.concat(sections).join('\n');
  }

  // ── Navigation & Messaging ────────────────────────────────────

  async function locateClipInPage(clipId, clipUrl) {
    try {
      if (!chrome.tabs) { window.open(clipUrl, '_blank'); return; }
      const tabs = await chrome.tabs.query({});
      const targetTab = tabs.find(t => t.url && t.url.split('#')[0] === clipUrl.split('#')[0]);
      if (targetTab && targetTab.id) {
        await chrome.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId) await chrome.windows.update(targetTab.windowId, { focused: true });
        chrome.tabs.sendMessage(targetTab.id, { action: 'LOCATE_CLIP', clipId });
      } else {
        const newTab = await chrome.tabs.create({ url: clipUrl, active: true });
        await new Promise(resolve => {
          const listener = (tabId, info) => {
            if (tabId === newTab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); resolve(); }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(resolve, 5000);
        });
        chrome.tabs.sendMessage(newTab.id, { action: 'LOCATE_CLIP', clipId });
      }
    } catch (err) {
      console.warn('[ReMark] locateClipInPage error:', err);
      window.open(clipUrl, '_blank');
    }
  }

  async function openVideoMarkInTab(mark) {
    try {
      if (chrome.tabs) {
        const tabs = await chrome.tabs.query({});
        const targetTab = tabs.find(t => t.url && t.url.split('#')[0] === (mark.url || '').split('#')[0]);
        if (targetTab && targetTab.id) {
          await chrome.tabs.update(targetTab.id, { active: true });
          if (targetTab.windowId) await chrome.windows.update(targetTab.windowId, { focused: true });
          chrome.tabs.sendMessage(targetTab.id, { action: 'SEEK_VIDEO_MARK', time: mark.time });
          return;
        }
      }
      let url = mark.url || '';
      if (!url) return;
      url += (url.includes('?') ? '&' : '?') + 't=' + Math.floor(mark.time);
      window.open(url, '_blank');
    } catch (err) {
      console.warn('[ReMark] openVideoMarkInTab error:', err);
    }
  }

  async function notifyContentScriptDeletePage(pageUrl) {
    try {
      if (!chrome.tabs) return;
      const tabs = await chrome.tabs.query({});
      tabs.filter(t => t.url && t.url.split('#')[0] === pageUrl.split('#')[0])
        .forEach(tab => { if (tab.id) chrome.tabs.sendMessage(tab.id, { action: 'DELETE_PAGE_CLIPS_FROM_PAGE', pageUrl }); });
    } catch (err) {
      console.warn('[ReMark] notifyContentScriptDeletePage error:', err);
    }
  }

  async function notifyContentScriptDeleteClip(clipId) {
    try {
      const clip = clips.find(c => c.id === clipId);
      if (!clip || !chrome.tabs) return;
      const tabs = await chrome.tabs.query({});
      tabs.filter(t => t.url && t.url.split('#')[0] === clip.url.split('#')[0])
        .forEach(tab => { if (tab.id) chrome.tabs.sendMessage(tab.id, { action: 'DELETE_CLIP_FROM_PAGE', clipId }); });
    } catch (err) {
      console.warn('[ReMark] notifyContentScriptDeleteClip error:', err);
    }
  }

  async function notifyContentRefreshVideoMarks() {
    try {
      if (!chrome.tabs) return;
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        if (!tab.id || !tab.url) return;
        try {
          const host = new URL(tab.url).hostname;
          if (/(^|\.)bilibili\.com$/.test(host) || /(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host)) {
            chrome.tabs.sendMessage(tab.id, { action: 'REFRESH_VIDEO_MARKS' });
          }
        } catch (_) {}
      });
    } catch (e) {}
  }

  // ── Utils ─────────────────────────────────────────────────────

  function formatTimeSide(sec) {
    if (!isFinite(sec) || sec <= 0) return '00:00';
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function getLightColor(hexColor) {
    if (!hexColor) return 'rgba(255,224,102,0.2)';
    return hexColor + '33';
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function formatFileStamp(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
  }

  function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setupEventListeners() {
    setupBatchActionBarHandlers();
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      searchClear.style.display = searchQuery ? 'block' : 'none';
      renderClips();
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = ''; searchQuery = '';
      searchClear.style.display = 'none';
      renderClips();
    });
  }
});
