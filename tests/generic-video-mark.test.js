const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const content = read('content/content.js');
const sidepanel = read('sidepanel/sidepanel.js');
const background = read('background.js');

// 1. Static code contract assertions
assert.match(content, /if \(window\.location\.protocol === 'http:' \|\| window\.location\.protocol === 'https:'\) return 'generic';/);
assert.match(content, /generic: \{[\s\S]*?isVideoPage\(\) \{[\s\S]*?getVideoKey\(video\) \{[\s\S]*?getVideoTitle\(video\) \{[\s\S]*?findVideoElement\(\) \{/);
assert.match(content, /function collectAllVideos\(/);
assert.match(content, /function findGenericVideoElement\(\)/);
assert.match(content, /function extractVideoPostUrl\(/);
assert.match(content, /function extractVideoPostTitle\(/);
assert.match(content, /document\.addEventListener\('keydown', onVideoMarkKeydown, true\);/);
assert.match(content, /if \(msg\.clipId && msg\.clipId\.startsWith\('vmark_'\)\) \{[\s\S]*?void locateAndSeekVideoMark\(msg\.clipId\);/);
assert.match(background, /if \(locateClip \|\| \(clipId && clipId\.startsWith\('vmark_'\)\)\) trackSourceNavigation\(tab\.id, clipId, url\);/);
assert.match(sidepanel, /const videoReplaySourceUrl = \(item\) => \{[\s\S]*?if \(!videoKeyFromUrl\(source\)\) return source;/);
assert.match(sidepanel, /const sameGenericPostUrl = \(a, b\) => \{/);
assert.match(sidepanel, /const sameSource = \(item, url\) => \{[\s\S]*?if \(key\) return Boolean\(key\) && Boolean\(item\.raw\?\.videoKey\) && item\.raw\.videoKey === key;[\s\S]*?return sameUrl\(item\.url, url\);/);

// Helper to extract function by name from JS source
const extractFunc = (source, name) => {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) {
    start = source.indexOf(`const ${name} =`);
  }
  assert.ok(start >= 0, `function or const ${name} should exist`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.ok(end > start, `function ${name} end should be found`);
  return new Function(`${source.slice(start, end)}; return ${name};`)();
};

const findClosestContainer = extractFunc(content, 'findClosestContainer');
const collectAllVideos = extractFunc(content, 'collectAllVideos');
const extractVideoPostUrl = new Function('findClosestContainer', `${content.slice(content.indexOf('function extractVideoPostUrl('), content.indexOf('function extractVideoPostTitle('))}; return extractVideoPostUrl;`)(findClosestContainer);
const extractVideoPostTitle = new Function('findClosestContainer', `${content.slice(content.indexOf('function extractVideoPostTitle('), content.indexOf('function findGenericVideoElement('))}; return extractVideoPostTitle;`)(findClosestContainer);
const findGenericVideoElement = new Function('collectAllVideos', `${content.slice(content.indexOf('function findGenericVideoElement('), content.indexOf('const VIDEO_PLATFORMS = {'))}; return findGenericVideoElement;`)(collectAllVideos);

// 2. Test X.com Post URL extraction from containing Tweet
{
  global.window = {
    location: {
      hostname: 'x.com',
      origin: 'https://x.com',
      pathname: '/home',
      href: 'https://x.com/home'
    }
  };

  const timeLink = {
    getAttribute: (attr) => attr === 'href' ? '/SpaceX/status/1838123456789012345?s=20' : null
  };
  const mockTime = {
    closest: (sel) => sel.includes('/status/') ? timeLink : null
  };
  const mockArticle = {
    tagName: 'ARTICLE',
    querySelector: (sel) => {
      if (sel === 'time') return mockTime;
      if (sel === '[data-testid="tweetText"]') return { textContent: 'Starship flight test 5 was successful!' };
      if (sel === '[data-testid="User-Name"]') return { textContent: 'SpaceX @SpaceX' };
      return null;
    },
    querySelectorAll: (sel) => sel === 'a[href*="/status/"]' ? [timeLink] : []
  };
  const mockVideoInTweet = {
    tagName: 'VIDEO',
    closest: (sel) => sel.includes('article') ? mockArticle : null,
    getRootNode: () => null
  };

  const postUrl = extractVideoPostUrl(mockVideoInTweet);
  assert.strictEqual(postUrl, 'https://x.com/SpaceX/status/1838123456789012345', 'Should extract clean canonical tweet permalink without ?s= query');

  const title = extractVideoPostTitle(mockVideoInTweet);
  assert.strictEqual(title, 'SpaceX @SpaceX: Starship flight test 5 was successful!', 'Should extract author and tweet text for title');
}

// 3. Test Reddit Shadow DOM video collection & permalink extraction
{
  global.window = {
    location: {
      hostname: 'reddit.com',
      origin: 'https://www.reddit.com',
      pathname: '/r/all',
      href: 'https://www.reddit.com/r/all'
    },
    innerWidth: 1280,
    innerHeight: 800,
    getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' })
  };

  const mockPost = {
    tagName: 'SHREDDIT-POST',
    getAttribute: (attr) => {
      if (attr === 'permalink') return '/r/technology/comments/abc789/future_of_ai_clip/?utm_source=share';
      if (attr === 'post-title') return 'The future of agentic AI';
      return null;
    }
  };
  const mockPlayerHost = {
    tagName: 'SHREDDIT-PLAYER',
    closest: (sel) => sel.includes('shreddit-post') ? mockPost : null
  };
  const mockVideoInsideShadow = {
    tagName: 'VIDEO',
    id: 'reddit_shadow_video',
    closest: () => null,
    getRootNode: () => ({ host: mockPlayerHost }),
    getBoundingClientRect: () => ({ width: 720, height: 480, top: 100, left: 100, bottom: 580, right: 820 }),
    duration: 120,
    currentTime: 10,
    paused: false,
    ended: false
  };
  const mockShadowRoot = {
    querySelectorAll: (sel) => sel === 'video' ? [mockVideoInsideShadow] : []
  };
  mockPlayerHost.shadowRoot = mockShadowRoot;

  global.document = {
    documentElement: { clientWidth: 1280, clientHeight: 800 },
    querySelectorAll: (sel) => {
      if (sel === 'video') return []; // Standard DOM query finds nothing!
      if (sel.includes('shreddit-player')) return [mockPlayerHost];
      return [];
    }
  };

  // Check shadow DOM collection
  const allVideos = collectAllVideos(document);
  assert.strictEqual(allVideos.length, 1);
  assert.strictEqual(allVideos[0].id, 'reddit_shadow_video', 'collectAllVideos must find video inside shreddit-player shadow DOM');

  // Check generic video element scoring
  const chosen = findGenericVideoElement();
  assert.strictEqual(chosen.id, 'reddit_shadow_video', 'findGenericVideoElement must select the Reddit shadow DOM video');

  // Check permalink extraction from shadow DOM video
  const redditPostUrl = extractVideoPostUrl(mockVideoInsideShadow);
  assert.strictEqual(redditPostUrl, 'https://www.reddit.com/r/technology/comments/abc789', 'extractVideoPostUrl must pierce shadowRoot.host and extract clean post permalink');

  // Check title extraction
  const redditTitle = extractVideoPostTitle(mockVideoInsideShadow);
  assert.strictEqual(redditTitle, 'The future of agentic AI', 'extractVideoPostTitle must extract Reddit post-title');
}

// 4. Test Reddit Cmd+M shortcut interception (preventDefault must be called)
{
  let preventDefaultCalled = false;
  let stopImmediatePropagationCalled = false;
  let recordedMark = false;

  const mockEvent = {
    metaKey: true,
    ctrlKey: false,
    key: 'm',
    code: 'KeyM',
    shiftKey: false,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => {},
    stopImmediatePropagation: () => { stopImmediatePropagationCalled = true; }
  };

  global.document.activeElement = { tagName: 'SHREDDIT-PLAYER' };
  global.document.getElementById = () => null;

  const onVideoMarkKeydown = new Function(
    'isVideoPage', 'recordVideoMark', 'ONBOARDING_MODAL_ID',
    `${content.slice(content.indexOf('function onVideoMarkKeydown(e) {'), content.indexOf('function pulseVideoMarker('))}; return onVideoMarkKeydown;`
  )(
    () => true, // isVideoPage returns true because video was found in shadow root
    () => { recordedMark = true; },
    'remark-onboarding-tutorial'
  );

  onVideoMarkKeydown(mockEvent);

  assert.ok(preventDefaultCalled, 'preventDefault must be called so macOS window is NOT minimized');
  assert.ok(stopImmediatePropagationCalled, 'stopImmediatePropagation must be called');
  assert.ok(recordedMark, 'recordVideoMark must be invoked');
}

// 5. Test replay URL, source matching, and sameGenericPostUrl
{
  const sameGenericPostUrl = extractFunc(sidepanel, 'sameGenericPostUrl');

  // X matching
  assert.ok(sameGenericPostUrl('https://x.com/NASA/status/123456789', 'https://x.com/NASA/status/123456789'));
  assert.ok(sameGenericPostUrl('https://x.com/NASA/status/123456789', 'https://x.com/NASA/status/123456789/photo/1'));
  assert.ok(sameGenericPostUrl('https://x.com/NASA/status/123456789', 'https://x.com/NASA/status/123456789?s=20'));
  assert.ok(!sameGenericPostUrl('https://x.com/NASA/status/123456789', 'https://x.com/NASA/status/987654321'));
  assert.ok(!sameGenericPostUrl('https://x.com/NASA/status/123456789', 'https://x.com/home'));

  // Reddit matching
  assert.ok(sameGenericPostUrl('https://www.reddit.com/r/space/comments/xyz123', 'https://www.reddit.com/r/space/comments/xyz123/mars_rover/'));
  assert.ok(sameGenericPostUrl('https://www.reddit.com/r/space/comments/xyz123', 'https://www.reddit.com/r/space/comments/xyz123?utm_source=share'));
  assert.ok(!sameGenericPostUrl('https://www.reddit.com/r/space/comments/xyz123', 'https://www.reddit.com/r/space/comments/other'));

  // Video replay source URL
  const videoKeyFromUrl = (value) => {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, '');
      if (host.endsWith('youtube.com') || host === 'youtu.be') return url.searchParams.get('v') || 'ytid';
      if (host.endsWith('bilibili.com')) return 'bvid';
    } catch (_) {}
    return '';
  };
  const videoReplaySourceUrl = new Function('videoKeyFromUrl', `${sidepanel.slice(sidepanel.indexOf('const videoReplaySourceUrl = (item) => {'), sidepanel.indexOf('const sameGenericPostUrl = (a, b) => {'))}; return videoReplaySourceUrl;`)(videoKeyFromUrl);

  const xItem = { url: 'https://x.com/NASA/status/1838123456789012345', time: 42.5 };
  assert.strictEqual(videoReplaySourceUrl(xItem), 'https://x.com/NASA/status/1838123456789012345', 'X replay URL must NOT have ?t=');

  const ytItem = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', time: 65 };
  assert.strictEqual(videoReplaySourceUrl(ytItem), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60', 'YouTube replay URL must retain ?t= with 5s preroll');
}

console.log('generic-video-mark.test.js: all assertions passed');
