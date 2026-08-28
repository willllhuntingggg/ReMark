/**
 * ReMark Store Assets — presentation-state adapter.
 *
 * Seeds ONLY localStorage so the real ReMark storage layer
 * (lib/storage.js) has the marks the screenshots need to render.
 * No production extension file is touched.
 */
(function () {
  // Resolved at runtime so the same adapter works from any served location.
  const ARTICLE_URL = (location.origin + location.pathname).replace(/\/+$/, '');
  const YOUTUBE_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
  const HOUR = 3600000;
  const now = Date.now();

  const clips = [
    {
      id: 'clip_store_text',
      url: ARTICLE_URL,
      pageUrl: ARTICLE_URL,
      pageTitle: 'The Attention We Choose to Keep — Field Notes',
      text: 'What we keep is not always the loudest thing we encounter. Often it is the sentence that slows us down for a moment—the one that gives shape to something we had not yet found words for.',
      note: 'A thought worth returning to: attention often begins with a pause.',
      color: '#F5A623',
      createdAt: now - 2 * HOUR
    }
  ];

  const videoMarks = [
    {
      id: 'vmark_store_video',
      url: YOUTUBE_URL,
      videoKey: 'aqz-KE-bpKQ',
      time: 67,
      duration: 596,
      title: 'Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film',
      note: '',
      caption: {
        text: 'Big Buck Bunny is back, sharper and smoother than ever.',
        from: 65,
        to: 69
      },
      chapter: null,
      createdAt: now - 5 * HOUR
    }
  ];

  const settings = {
    theme: 'light',
    language: 'en',
    defaultColor: '#F5A623',
    onboardingSeen: true,
    onboardingStatus: 'completed'
  };

  localStorage.setItem('markit_clips', JSON.stringify(clips));
  localStorage.setItem('markit_video_marks', JSON.stringify(videoMarks));
  localStorage.setItem('markit_settings', JSON.stringify(settings));
})();
