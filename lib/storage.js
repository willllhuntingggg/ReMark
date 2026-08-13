/**
 * ReMark Data Storage Helper (Local Storage Wrapper)
 */

const ReMarkStorage = {
  KEYS: {
    CLIPS: 'markit_clips',
    VIDEO_MARKS: 'markit_video_marks',
    SETTINGS: 'markit_settings',
    UNDO: 'markit_undo'
  },

  DEFAULT_SETTINGS: {
    defaultColor: '#FFE066',
    theme: 'light',
    onboardingSeen: false
  },

  async get(key) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          try {
            chrome.storage.local.get([key], (result) => {
              if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('[ReMark] storage.get warning:', chrome.runtime.lastError);
              }
              resolve(result ? result[key] : null);
            });
          } catch (e) {
            const val = localStorage.getItem(key);
            resolve(val ? JSON.parse(val) : null);
          }
        });
      } else {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : null;
      }
    } catch (err) {
      console.error('[ReMark] storage.get error:', err);
      return null;
    }
  },

  async set(key, value) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          try {
            chrome.storage.local.set({ [key]: value }, () => {
              if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('[ReMark] storage.set warning:', chrome.runtime.lastError);
              }
              resolve(true);
            });
          } catch (e) {
            localStorage.setItem(key, JSON.stringify(value));
            resolve(true);
          }
        });
      } else {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      }
    } catch (err) {
      console.error('[ReMark] storage.set error:', err);
      return false;
    }
  },

  async init() {
    let settings = await this.get(this.KEYS.SETTINGS);
    if (!settings) {
      await this.set(this.KEYS.SETTINGS, this.DEFAULT_SETTINGS);
    }

    let clips = await this.get(this.KEYS.CLIPS);
    if (!clips) {
      const demoClips = [
        {
          id: 'clip_demo_1',
          url: 'https://example.com/ai-trends',
          pageTitle: '2026 前端与 AI 结合的 5 个关键爆点',
          text: '将长文内容拆解为高密度的信息碎片，并附上关键结论与出处，能显著提升二次检索与回顾的效率。',
          note: '重要的痛点！高密度、带加粗高亮与极简结构的信息展示更受青睐。',
          color: '#FFE066',
          createdAt: Date.now() - 3600000 * 5
        },
        {
          id: 'clip_demo_2',
          url: 'https://example.com/spaced-repetition',
          pageTitle: '认知心理学：间隔重复与知识卡片库',
          text: '高亮划线只是第一步，真正的知识内化发生于记录评语以及二次整理的过程中。',
          note: '记录想法时尽量用自己的话复述一遍，记忆效果更好。',
          color: '#B2F5EA',
          createdAt: Date.now() - 3600000 * 24
        }
      ];
      await this.set(this.KEYS.CLIPS, demoClips);
    }
  },

  // Pages: group clips + video marks by URL
  async getPages() {
    const clips = await this.getClips();
    const marks = await this.getVideoMarks();
    const pagesMap = new Map();

    const ensurePage = (item) => {
      const urlKey = item.url || 'other';
      if (!pagesMap.has(urlKey)) {
        pagesMap.set(urlKey, {
          url: item.url,
          pageTitle: item.pageTitle || item.title || '未知网页',
          lastUpdated: item.createdAt,
          clips: [],
          marks: []
        });
      }
      return pagesMap.get(urlKey);
    };

    clips.forEach(clip => {
      const page = ensurePage(clip);
      page.clips.push(clip);
      if (clip.createdAt > page.lastUpdated) page.lastUpdated = clip.createdAt;
    });

    marks.forEach(mark => {
      const page = ensurePage(mark);
      page.marks.push(mark);
      if (mark.createdAt > page.lastUpdated) page.lastUpdated = mark.createdAt;
    });

    return Array.from(pagesMap.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);
  },

  async deletePage(url) {
    let clips = await this.getClips();
    clips = clips.filter(c => c.url !== url);
    await this.set(this.KEYS.CLIPS, clips);

    let marks = await this.getVideoMarks();
    marks = marks.filter(m => m.url !== url);
    await this.set(this.KEYS.VIDEO_MARKS, marks);
  },

  async getClips() {
    return (await this.get(this.KEYS.CLIPS)) || [];
  },

  async addClip(clipData) {
    const clips = await this.getClips();
    const newClip = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      url: clipData.url || window.location.href,
      pageTitle: clipData.pageTitle || document.title,
      text: clipData.text,
      sourcePosition: Number.isFinite(Number(clipData.sourcePosition)) ? Number(clipData.sourcePosition) : null,
      note: clipData.note || '',
      color: clipData.color || '#FFE066',
      createdAt: Date.now()
    };
    clips.unshift(newClip);
    await this.set(this.KEYS.CLIPS, clips);
    return newClip;
  },

  async updateClip(id, updates) {
    const clips = await this.getClips();
    const idx = clips.findIndex((c) => c.id === id);
    if (idx !== -1) {
      clips[idx] = { ...clips[idx], ...updates, updatedAt: Date.now() };
      await this.set(this.KEYS.CLIPS, clips);
      return clips[idx];
    }
    return null;
  },

  async deleteClip(id) {
    let clips = await this.getClips();
    clips = clips.filter((c) => c.id !== id);
    await this.set(this.KEYS.CLIPS, clips);
  },
  async pushUndo(action) {
    await this.set(this.KEYS.UNDO, { ...action, createdAt: Date.now() });
  },
  async undoLast() {
    const action = await this.get(this.KEYS.UNDO);
    if (!action) return false;
    if (action.type === 'delete_clip' && action.item) {
      const clips = await this.getClips();
      if (!clips.some(c => c.id === action.item.id)) await this.set(this.KEYS.CLIPS, [action.item, ...clips]);
    } else if (action.type === 'delete_video_mark' && action.item) {
      const marks = await this.getVideoMarks();
      if (!marks.some(m => m.id === action.item.id)) await this.set(this.KEYS.VIDEO_MARKS, [action.item, ...marks]);
    } else if (action.type === 'restore_clip' && action.id) {
      await this.deleteClip(action.id);
    } else if (action.type === 'restore_video_mark' && action.id) {
      await this.deleteVideoMark(action.id);
    } else return false;
    await this.set(this.KEYS.UNDO, null);
    return true;
  },

  async getVideoMarks() {
    return (await this.get(this.KEYS.VIDEO_MARKS)) || [];
  },

  async addVideoMark(markData) {
    const marks = await this.getVideoMarks();
    const newMark = {
      id: 'vmark_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      url: markData.url || window.location.href,
      videoKey: markData.videoKey || '',
      time: markData.time || 0,
      duration: markData.duration || 0,
      title: markData.title || '',
      note: markData.note || '',
      createdAt: Date.now()
    };
    marks.unshift(newMark);
    await this.set(this.KEYS.VIDEO_MARKS, marks);
    return newMark;
  },

  async updateVideoMark(id, updates) {
    const marks = await this.getVideoMarks();
    const idx = marks.findIndex((m) => m.id === id);
    if (idx !== -1) {
      marks[idx] = { ...marks[idx], ...updates, updatedAt: Date.now() };
      await this.set(this.KEYS.VIDEO_MARKS, marks);
      return marks[idx];
    }
    return null;
  },

  async deleteVideoMark(id) {
    const marks = await this.getVideoMarks();
    const removed = marks.find(m => m.id === id) || null;
    await this.set(this.KEYS.VIDEO_MARKS, marks.filter((m) => m.id !== id));
    return removed;
  },

  async getSettings() {
    const settings = await this.get(this.KEYS.SETTINGS);
    return { ...this.DEFAULT_SETTINGS, ...settings };
  },

  async updateSettings(newSettings) {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings };
    await this.set(this.KEYS.SETTINGS, updated);
    return updated;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReMarkStorage;
}
