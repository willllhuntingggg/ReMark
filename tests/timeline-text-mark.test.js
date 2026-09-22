const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const content = read('content/content.js');
const sidepanel = read('sidepanel/sidepanel.js');
const storageSrc = read('lib/storage.js');

// 1. Static contract assertions
assert.match(storageSrc, /postUrl: clipData\.postUrl \|\| null,/);
assert.match(content, /function extractNodePostUrl\(/);
assert.match(content, /function extractNodePostTitle\(/);
assert.match(content, /postUrl,/);
assert.match(sidepanel, /postUrl: raw\.postUrl \|\| ''/);
assert.match(sidepanel, /const targetUrl = \(item\.type === 'highlight' && item\.postUrl\) \? item\.postUrl : pageUrl;/);

// Helper to extract function from content.js
const extractFunc = (source, name) => {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) start = source.indexOf(`const ${name} =`);
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
const sameGenericPostUrl = extractFunc(sidepanel, 'sameGenericPostUrl');
const samePageUrl = extractFunc(content, 'samePageUrl');

const extractVideoPostUrl = new Function('findClosestContainer', `${content.slice(content.indexOf('function extractVideoPostUrl('), content.indexOf('function extractVideoPostTitle('))}; return extractVideoPostUrl;`)(findClosestContainer);
const extractVideoPostTitle = new Function('findClosestContainer', `${content.slice(content.indexOf('function extractVideoPostTitle('), content.indexOf('function findGenericVideoElement('))}; return extractVideoPostTitle;`)(findClosestContainer);

// 2. Test X.com Feed text mark detection
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
    getAttribute: (attr) => attr === 'href' ? '/karpathy/status/1838999999999999999?s=20' : null
  };
  const mockTime = {
    closest: (sel) => sel.includes('/status/') ? timeLink : null,
    parentElement: {
      closest: (sel) => sel.includes('/status/') ? timeLink : null
    }
  };
  const mockArticle = {
    tagName: 'ARTICLE',
    querySelector: (sel) => {
      if (sel === 'time') return mockTime;
      if (sel === '[data-testid="tweetText"]') return { textContent: 'Building autoregressive models from scratch' };
      if (sel === '[data-testid="User-Name"]') return { textContent: 'Andrej Karpathy @karpathy' };
      return null;
    },
    querySelectorAll: (sel) => sel === 'a[href*="/status/"]' ? [timeLink] : []
  };
  const mockTextNode = {
    nodeType: 3, // Node.TEXT_NODE
    parentElement: {
      tagName: 'SPAN',
      closest: (sel) => sel.includes('article') ? mockArticle : null,
      getRootNode: () => null
    }
  };

  const postUrl = extractVideoPostUrl(mockTextNode);
  assert.strictEqual(postUrl, 'https://x.com/karpathy/status/1838999999999999999', 'Should extract clean post URL from tweet article containing text');

  const title = extractVideoPostTitle(mockTextNode);
  assert.strictEqual(title, 'Andrej Karpathy @karpathy: Building autoregressive models from scratch', 'Should extract author and tweet text for title');
}

// 3. Test Reddit Feed text mark detection (shadow DOM traversal)
{
  global.window = {
    location: {
      hostname: 'reddit.com',
      origin: 'https://www.reddit.com',
      pathname: '/r/programming',
      href: 'https://www.reddit.com/r/programming'
    }
  };

  const mockPost = {
    tagName: 'SHREDDIT-POST',
    getAttribute: (attr) => {
      if (attr === 'permalink') return '/r/programming/comments/def456/why_clean_code_matters/?utm_source=share';
      if (attr === 'post-title') return 'Why clean code matters';
      return null;
    }
  };
  const mockParagraphInsidePost = {
    tagName: 'P',
    nodeType: 1,
    closest: (sel) => sel.includes('shreddit-post') ? mockPost : null,
    getRootNode: () => null
  };

  const postUrl = extractVideoPostUrl(mockParagraphInsidePost);
  assert.strictEqual(postUrl, 'https://www.reddit.com/r/programming/comments/def456', 'Should extract clean Reddit post URL');

  const title = extractVideoPostTitle(mockParagraphInsidePost);
  assert.strictEqual(title, 'Why clean code matters', 'Should extract Reddit post title');
}

// 4. Test Generic HTML5 Article with <time> bookmark link
{
  global.window = {
    location: {
      hostname: 'blog.example.com',
      origin: 'https://blog.example.com',
      pathname: '/feed',
      href: 'https://blog.example.com/feed'
    }
  };

  const bookmarkLink = {
    getAttribute: (attr) => attr === 'href' ? '/2026/09/universal-web-standards' : null
  };
  const mockTime = {
    closest: (sel) => sel === 'a[href]' ? bookmarkLink : null,
    parentElement: null
  };
  const mockArticle = {
    tagName: 'ARTICLE',
    getAttribute: () => null,
    querySelector: (sel) => {
      if (sel === 'time') return mockTime;
      if (sel === 'a[rel~="bookmark"]') return bookmarkLink;
      if (sel.includes('headline') || sel.includes('h1')) return { textContent: 'Universal Web Standards in 2026' };
      return null;
    }
  };
  const mockElement = {
    tagName: 'P',
    nodeType: 1,
    closest: (sel) => sel.includes('article') ? mockArticle : null,
    getRootNode: () => null
  };

  const postUrl = extractVideoPostUrl(mockElement);
  assert.strictEqual(postUrl, 'https://blog.example.com/2026/09/universal-web-standards');

  const title = extractVideoPostTitle(mockElement);
  assert.strictEqual(title, 'Universal Web Standards in 2026');
}

// 5. Test Non-Feed Normal Webpage Fallback (e.g. Wikipedia)
{
  global.window = {
    location: {
      hostname: 'en.wikipedia.org',
      origin: 'https://en.wikipedia.org',
      pathname: '/wiki/JavaScript',
      href: 'https://en.wikipedia.org/wiki/JavaScript'
    }
  };

  const mockNormalNode = {
    tagName: 'P',
    nodeType: 1,
    closest: () => null,
    getRootNode: () => null
  };

  const postUrl = extractVideoPostUrl(mockNormalNode);
  assert.strictEqual(postUrl, 'https://en.wikipedia.org/wiki/JavaScript', 'Normal webpage should return page URL');
}

// 6. Test Sidepanel jump targetUrl logic
{
  const itemFromFeed = {
    type: 'highlight',
    url: 'https://x.com/home',
    pageUrl: 'https://x.com/home',
    postUrl: 'https://x.com/karpathy/status/1838999999999999999'
  };

  const targetUrl = (itemFromFeed.type === 'highlight' && itemFromFeed.postUrl) ? itemFromFeed.postUrl : (itemFromFeed.pageUrl || itemFromFeed.url);
  assert.strictEqual(targetUrl, 'https://x.com/karpathy/status/1838999999999999999', 'jump targetUrl must use postUrl when present');

  const normalItem = {
    type: 'highlight',
    url: 'https://en.wikipedia.org/wiki/JavaScript',
    pageUrl: 'https://en.wikipedia.org/wiki/JavaScript',
    postUrl: ''
  };
  const normalTarget = (normalItem.type === 'highlight' && normalItem.postUrl) ? normalItem.postUrl : (normalItem.pageUrl || normalItem.url);
  assert.strictEqual(normalTarget, 'https://en.wikipedia.org/wiki/JavaScript');
}

// 7. Test restorePageHighlights filtering on post page
{
  const clips = [
    {
      id: 'clip_feed',
      url: 'https://x.com/home',
      pageUrl: 'https://x.com/home',
      postUrl: 'https://x.com/karpathy/status/1838999999999999999',
      text: 'Building autoregressive models'
    },
    {
      id: 'clip_other',
      url: 'https://x.com/other/status/111',
      pageUrl: 'https://x.com/other/status/111',
      postUrl: null,
      text: 'Other tweet'
    }
  ];

  const currentUrl = 'https://x.com/karpathy/status/1838999999999999999';
  const loadedClips = clips.filter((clip) => {
    if (clip.postUrl && (samePageUrl(clip.postUrl, currentUrl) || sameGenericPostUrl(clip.postUrl, currentUrl))) return true;
    return (clip.pageUrl || clip.url) && samePageUrl(clip.pageUrl || clip.url, currentUrl);
  });

  assert.strictEqual(loadedClips.length, 1);
  assert.strictEqual(loadedClips[0].id, 'clip_feed', 'Clip created on feed must be loaded when viewing the dedicated post page');
}

// 8. Test timeline marks get separate post sources and are NOT merged into homepage
{
  const postUrlA = 'https://x.com/userA/status/111111';
  const postUrlB = 'https://x.com/userB/status/222222';

  // Function simulating quickHighlightSelection clipData formation
  const formClipData = (sourceUrl, windowHref, postUrl, resolvedTitle, text) => {
    if (postUrl && (!sourceUrl || sourceUrl === windowHref)) {
      sourceUrl = postUrl;
    }
    const clipData = {
      url: sourceUrl || windowHref,
      pageUrl: windowHref,
      postUrl,
      feedUrl: postUrl ? windowHref : null,
      pageTitle: resolvedTitle,
      text
    };
    if (postUrl) clipData.pageUrl = postUrl;
    return clipData;
  };

  const clipA = formClipData(null, 'https://x.com/home', postUrlA, 'User A: Post A text', 'Text A');
  const clipB = formClipData(null, 'https://x.com/home', postUrlB, 'User B: Post B text', 'Text B');

  assert.strictEqual(clipA.url, postUrlA, 'Clip A url must be Post A URL');
  assert.strictEqual(clipA.pageUrl, postUrlA, 'Clip A pageUrl must be Post A URL');
  assert.strictEqual(clipA.feedUrl, 'https://x.com/home', 'Clip A feedUrl must record feed');

  assert.strictEqual(clipB.url, postUrlB, 'Clip B url must be Post B URL');
  assert.strictEqual(clipB.pageUrl, postUrlB, 'Clip B pageUrl must be Post B URL');

  // Verify getPages() groups them by individual post, NOT into x.com/home
  const pagesMap = new Map();
  const ensurePage = (item) => {
    const urlKey = item.url || 'other';
    if (!pagesMap.has(urlKey)) {
      pagesMap.set(urlKey, { url: item.url, clips: [] });
    }
    return pagesMap.get(urlKey);
  };
  [clipA, clipB].forEach(clip => ensurePage(clip).clips.push(clip));

  assert.strictEqual(pagesMap.size, 2, 'Must create 2 separate pages for 2 posts, NOT 1 merged homepage');
  assert.ok(pagesMap.has(postUrlA), 'Must have Page for Post A');
  assert.ok(pagesMap.has(postUrlB), 'Must have Page for Post B');
  assert.ok(!pagesMap.has('https://x.com/home'), 'Must NOT group posts into x.com/home');
}

// 9. Test Quora Feed div-based answer card detection
{
  global.window = {
    location: {
      hostname: 'www.quora.com',
      origin: 'https://www.quora.com',
      pathname: '/',
      href: 'https://www.quora.com/'
    }
  };

  const answerLink = {
    getAttribute: (attr) => attr === 'href' ? '/Why-is-the-sky-blue/answer/John-Doe?ch=10&share=1' : null
  };
  const mockCard = {
    tagName: 'DIV',
    querySelector: (sel) => {
      if (sel.includes('/answer/')) return answerLink;
      if (sel.includes('question') || sel.includes('h2')) return { textContent: 'Why is the sky blue?' };
      return null;
    }
  };
  const mockAnswerTextNode = {
    nodeType: 3,
    parentElement: {
      tagName: 'SPAN',
      parentElement: {
        tagName: 'DIV',
        parentElement: mockCard,
        closest: () => null,
        getRootNode: () => null
      },
      closest: () => null,
      getRootNode: () => null
    }
  };
  mockCard.parentElement = null;

  const contentFresh = read('content/content.js');
  const extractVideoPostUrlFresh = new Function('findClosestContainer', `${contentFresh.slice(contentFresh.indexOf('function extractVideoPostUrl('), contentFresh.indexOf('function extractVideoPostTitle('))}; return extractVideoPostUrl;`)(findClosestContainer);
  const extractVideoPostTitleFresh = new Function('findClosestContainer', `${contentFresh.slice(contentFresh.indexOf('function extractVideoPostTitle('), contentFresh.indexOf('function findGenericVideoElement('))}; return extractVideoPostTitle;`)(findClosestContainer);

  const postUrl = extractVideoPostUrlFresh(mockAnswerTextNode);
  assert.strictEqual(postUrl, 'https://www.quora.com/Why-is-the-sky-blue/answer/John-Doe', 'Quora answer card must extract clean permalink from /answer/ link');

  const title = extractVideoPostTitleFresh(mockAnswerTextNode);
  assert.ok(title.includes('John Doe') && title.includes('Why is the sky blue'), 'Quora title must include author and question');

  // Test sameGenericPostUrl with Quora answers
  const sidepanelFresh = read('sidepanel/sidepanel.js');
  const sameGenericPostUrlFresh = extractFunc(sidepanelFresh, 'sameGenericPostUrl');
  assert.ok(sameGenericPostUrlFresh('https://www.quora.com/Why-is-the-sky-blue/answer/John-Doe', 'https://www.quora.com/Why-is-the-sky-blue/answer/John-Doe?share=1'));
  assert.ok(!sameGenericPostUrlFresh('https://www.quora.com/Why-is-the-sky-blue/answer/John-Doe', 'https://www.quora.com/Why-is-the-sky-blue/answer/Jane-Smith'));
}

console.log('timeline-text-mark.test.js: all assertions passed');
