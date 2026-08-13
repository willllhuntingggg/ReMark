/** ReMark: chronological Mark feed plus native-order source collections. */
document.addEventListener('DOMContentLoaded', async () => {
  let clips = [], videos = [], sourceUrl = null, query = '', selected = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const list = $('#clips-container'), empty = $('#clips-empty-state');
  const search = $('#search-input'), clear = $('#search-clear');
  const back = $('#source-back'), subtitle = $('#view-subtitle'), context = $('#collection-context');

  const all = () => [
    ...clips.map((item) => ({
      id: item.id, key: `h:${item.id}`, type: 'highlight', raw: item,
      url: item.url || '', title: item.pageTitle || '未命名网页', text: item.text || '',
      note: item.note || '', createdAt: Number(item.createdAt) || 0,
      position: Number.isFinite(Number(item.sourcePosition)) ? Number(item.sourcePosition) : null
    })),
    ...videos.map((item) => ({
      id: item.id, key: `v:${item.id}`, type: 'video', raw: item,
      url: item.url || '', title: item.title || '未命名视频', text: '', note: item.note || '',
      createdAt: Number(item.createdAt) || 0, time: Number(item.time) || 0, duration: Number(item.duration) || 0
    }))
  ];
  const sameUrl = (a, b) => String(a || '').split('#')[0] === String(b || '').split('#')[0];
  const itemFor = (key) => all().find((item) => item.key === key);
  const cardFor = (key) => list.querySelector(`.mark-card[data-key="${CSS.escape(key)}"]`);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const clock = (value) => { const n = Math.max(0, Math.floor(Number(value) || 0)); const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60, p = (v) => String(v).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`; };

  function filtered() {
    const q = query.trim().toLowerCase();
    let items = all().filter((item) => !q || [item.text, item.note, item.title, item.url, item.type === 'video' ? clock(item.time) : ''].some((value) => String(value).toLowerCase().includes(q)));
    if (sourceUrl === null) return items.sort((a, b) => b.createdAt - a.createdAt);
    return items.filter((item) => sameUrl(item.url, sourceUrl)).sort((a, b) => {
      if (a.type === 'video' && b.type === 'video') return a.time - b.time;
      if (a.type === 'highlight' && b.type === 'highlight') {
        if (a.position !== null && b.position !== null) return a.position - b.position;
        if (a.position !== null) return -1;
        if (b.position !== null) return 1;
      }
      return a.createdAt - b.createdAt;
    });
  }

  function day(value) {
    const now = new Date(), date = new Date(value);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.round((today - target) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff < 7) return `${diff} 天前`;
    return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date);
  }
  function relative(value) {
    const diff = Math.max(0, Date.now() - value);
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
  }

  function card(item) {
    const content = item.type === 'video'
      ? `<span class="video-timestamp"><span aria-hidden="true">▶</span>${clock(item.time)}</span>${item.duration ? `<span class="video-duration"> / ${clock(item.duration)}</span>` : ''}`
      : `“${esc(item.text)}”`;
    const note = item.note ? `<button class="mark-note" data-action="note" data-key="${esc(item.key)}" type="button"><span>↳</span>${esc(item.note)}</button>` : '';
    const source = `${item.title}${host(item.url) ? ` · ${host(item.url)}` : ''}`;
    return `<article class="mark-card mark-card--${item.type}" data-key="${esc(item.key)}" data-id="${esc(item.id)}">
      <button class="mark-content" data-action="jump" data-key="${esc(item.key)}" type="button">${content}</button>
      <div class="mark-note-area">${note}<div class="mark-note-editor" data-key="${esc(item.key)}" hidden><textarea class="mark-note-textarea" placeholder="写下你的想法…">${esc(item.note)}</textarea><div class="mark-note-editor-actions"><span>⌘↵ 保存 · Esc 取消</span><button data-action="cancel" data-key="${esc(item.key)}" type="button">取消</button><button class="mark-note-save" data-action="save" data-key="${esc(item.key)}" type="button">保存</button></div></div></div>
      <footer class="mark-footer"><button class="mark-source" data-action="source" data-url="${esc(item.url)}" type="button">${esc(source)}</button><span class="mark-created">${relative(item.createdAt)}</span><div class="mark-actions"><button class="mark-action" data-action="note" data-key="${esc(item.key)}" type="button">${item.note ? '笔记' : '+ 笔记'}</button><button class="mark-action mark-delete" data-action="delete" data-key="${esc(item.key)}" type="button">×</button></div></footer>
    </article>`;
  }

  function render() {
    const items = filtered();
    const inCollection = sourceUrl !== null;
    back.style.display = inCollection ? 'inline-flex' : 'none';
    if (inCollection) {
      const sourceItems = all().filter((item) => sameUrl(item.url, sourceUrl));
      const item = sourceItems[0], title = item?.title || '来源 Mark 集合';
      subtitle.textContent = title;
      context.hidden = false;
      context.innerHTML = `<div class="source-collection-summary"><span>来源中的 Mark</span><strong>${esc(title)}</strong><small>${esc(host(sourceUrl))} · ${sourceItems.length} 条 · 按原始${item?.type === 'video' ? '时间线' : '阅读顺序'}排列</small></div>`;
    } else {
      subtitle.textContent = '你的 Mark 时间流'; context.hidden = true; context.innerHTML = '';
    }
    let previous = '';
    list.innerHTML = items.map((item) => {
      const divider = inCollection || day(item.createdAt) === previous ? '' : `<div class="feed-day-heading">${day(item.createdAt)}</div>`;
      previous = day(item.createdAt);
      return divider + card(item);
    }).join('');
    empty.style.display = items.length ? 'none' : 'block';
    const h = $('h3', empty), p = $('p', empty);
    if (inCollection) { h.textContent = query ? '当前来源没有匹配的 Mark' : '这个来源还没有 Mark'; p.textContent = query ? '修改搜索词，或返回时间流。' : '返回时间流，或在原始内容中留下新的 Mark。'; }
    else if (query) { h.textContent = '没有匹配的 Mark'; p.textContent = '尝试搜索标记内容、笔记、来源名称或视频时间点。'; }
    else { h.textContent = '还没有留下 Mark'; p.innerHTML = '在网页中先按住 <strong>Command/Ctrl</strong>，再划选文字；在视频中按 <strong>Command/Ctrl+M</strong>。Mark 会自动出现在这里。'; }
  }

  async function load() { [clips, videos] = await Promise.all([ReMarkStorage.getClips(), ReMarkStorage.getVideoMarks()]); render(); }
  async function jump(item) {
    try {
      const tabs = await chrome.tabs.query({}), target = tabs.find((tab) => sameUrl(tab.url, item.url));
      if (target?.id) { await chrome.tabs.update(target.id, { active: true }); if (target.windowId) await chrome.windows.update(target.windowId, { focused: true }); chrome.tabs.sendMessage(target.id, item.type === 'video' ? { action: 'SEEK_VIDEO_MARK', time: item.time } : { action: 'LOCATE_CLIP', clipId: item.id }); return; }
      if (item.type === 'highlight') { const tab = await chrome.tabs.create({ url: item.url, active: true }); setTimeout(() => chrome.tabs.sendMessage(tab.id, { action: 'LOCATE_CLIP', clipId: item.id }), 1200); return; }
    } catch (error) { console.warn('[ReMark] Mark jump failed:', error); }
    if (item.url) window.open(item.type === 'video' ? `${item.url}${item.url.includes('?') ? '&' : '?'}t=${Math.floor(item.time)}` : item.url, '_blank');
  }
  function openNote(key) { const node = cardFor(key), editor = $('.mark-note-editor', node); if (!editor) return; editor.hidden = false; $('.mark-note', node)?.setAttribute('hidden', ''); editor.querySelector('textarea').focus(); }
  function closeNote(key) { const node = cardFor(key); $('.mark-note-editor', node)?.setAttribute('hidden', ''); $('.mark-note', node)?.removeAttribute('hidden'); }
  async function saveNote(key) { const item = itemFor(key), note = $('.mark-note-textarea', cardFor(key))?.value.trim() || ''; if (!item) return; await (item.type === 'video' ? ReMarkStorage.updateVideoMark(item.id, { note }) : ReMarkStorage.updateClip(item.id, { note })); await load(); }
  async function remove(key) { const item = itemFor(key); if (!item) return; if (item.type === 'video') { await ReMarkStorage.deleteVideoMark(item.id); await ReMarkStorage.pushUndo({ type: 'delete_video_mark', item: item.raw }); } else { await ReMarkStorage.deleteClip(item.id); await ReMarkStorage.pushUndo({ type: 'delete_clip', item: item.raw }); } selected = null; await load(); }

  list.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]'); if (!control) return;
    const { action, key, url } = control.dataset;
    if (action === 'jump') void jump(itemFor(key));
    if (action === 'source') { sourceUrl = url || ''; selected = null; render(); }
    if (action === 'note') openNote(key);
    if (action === 'cancel') closeNote(key);
    if (action === 'save') void saveNote(key);
    if (action === 'delete') void remove(key);
  });
  list.addEventListener('keydown', (event) => { if (event.target.matches('.mark-note-textarea')) { const key = event.target.closest('.mark-note-editor').dataset.key; if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void saveNote(key); } if (event.key === 'Escape') { event.preventDefault(); closeNote(key); } } });
  back.addEventListener('click', () => { sourceUrl = null; selected = null; render(); });
  search.addEventListener('input', () => { query = search.value; clear.style.display = query ? 'block' : 'none'; render(); });
  clear.addEventListener('click', () => { search.value = ''; query = ''; clear.style.display = 'none'; render(); search.focus(); });
  document.addEventListener('keydown', async (event) => { const editing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName); if (!editing && event.key === '/' ) { event.preventDefault(); search.focus(); } else if (!editing && event.key === 'Escape' && sourceUrl !== null) { sourceUrl = null; render(); } else if (!editing && ['Delete', 'Backspace'].includes(event.key) && selected) { event.preventDefault(); await remove(selected); } });
  list.addEventListener('focusin', (event) => { const node = event.target.closest('.mark-card'); if (node) selected = node.dataset.key; });
  globalThis.chrome?.runtime?.onMessage?.addListener((message) => { if (message?.action === 'REMARK_STORAGE_UPDATED') void load(); });
  globalThis.chrome?.storage?.onChanged?.addListener(() => void load());
  try { await ReMarkStorage.init(); await load(); } catch (error) { console.error('[ReMark] Sidepanel initialization failed:', error); empty.style.display = 'block'; $('h3', empty).textContent = 'Mark 列表暂时无法加载'; $('p', empty).textContent = '请重新加载扩展后重试。'; }
});
