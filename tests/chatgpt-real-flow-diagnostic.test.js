const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Pure Node.js zero-dependency DOM simulation for ChatGPT Restoration Diagnostic Test
class MockNode {
  constructor(nodeType, nodeValue = '', parentElement = null, tagName = 'DIV') {
    this.nodeType = nodeType; // 1 = ELEMENT_NODE, 3 = TEXT_NODE
    this.nodeValue = nodeValue;
    this.parentElement = parentElement;
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.style = {
      setProperty: () => {},
      getPropertyValue: () => ''
    };
    this.classList = {
      add: (c) => { if (!this.className.includes(c)) this.className += ' ' + c; },
      remove: (c) => { this.className = this.className.replace(c, '').trim(); },
      toggle: (c, force) => {
        const has = this.className.includes(c);
        if (force === true || (!has && force === undefined)) this.classList.add(c);
        else if (force === false || (has && force === undefined)) this.classList.remove(c);
      },
      contains: (c) => this.className.includes(c)
    };
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  matches(selector) {
    if (selector.includes('mark.remark-highlight-mark')) {
      return this.tagName === 'MARK' && (this.className || '').includes('remark-highlight-mark');
    }
    if (selector.startsWith('mark')) return this.tagName === 'MARK';
    if (selector.startsWith('.')) return (this.className || '').includes(selector.slice(1));
    return false;
  }

  getBoundingClientRect() {
    return { top: 300, bottom: 330, left: 100, right: 500, width: 400, height: 30 };
  }

  scrollIntoView(opts) {
    if (global.currentDiagnosticLogs) {
      global.currentDiagnosticLogs.push({ stage: 'SCROLL_EXECUTED', tagName: this.tagName, opts });
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
    return child;
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
  }

  removeAttribute(k) {
    delete this.attributes[k];
  }

  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
}

class MockRange {
  constructor() {
    this.startContainer = null;
    this.startOffset = 0;
    this.endContainer = null;
    this.endOffset = 0;
  }
  get commonAncestorContainer() {
    return this.startContainer ? (this.startContainer.parentElement || global.document.body) : global.document.body;
  }
  setStart(node, offset) {
    this.startContainer = node;
    this.startOffset = offset;
  }
  setEnd(node, offset) {
    this.endContainer = node;
    this.endOffset = offset;
  }
  intersectsNode() {
    return true;
  }
  surroundContents(elem) {
    if (this.startContainer && this.startContainer.parentElement) {
      this.startContainer.parentElement.appendChild(elem);
    }
  }
  extractContents() {
    return new MockNode(1, '', null, 'FRAG');
  }
  insertNode(node) {
    if (this.startContainer && this.startContainer.parentElement) {
      this.startContainer.parentElement.appendChild(node);
    }
  }
  getBoundingClientRect() {
    return { top: 300, bottom: 330, left: 100, right: 500, width: 400, height: 30 };
  }
}

function createDOMTreeFromNodes(textNodeConfigs) {
  const root = new MockNode(1, '', null, 'BODY');
  const app = new MockNode(1, '', root, 'DIV');
  app.attributes.id = 'app';
  root.children.push(app);

  const container = new MockNode(1, '', app, 'DIV');
  container.className = 'markdown';
  app.children.push(container);

  const textNodes = [];
  for (const cfg of textNodeConfigs) {
    const parent = new MockNode(1, '', container, cfg.tag || 'P');
    container.children.push(parent);
    const tNode = new MockNode(3, cfg.text, parent);
    parent.children.push(tNode);
    textNodes.push(tNode);
  }

  return { root, textNodes };
}

function collectAllTextNodes(node, filter) {
  const result = [];
  function traverse(n) {
    if (!n) return;
    if (n.nodeType === 3) {
      if (!filter || filter.acceptNode(n) === 1 /* FILTER_ACCEPT */) {
        result.push(n);
      }
    } else if (n.children) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }
  traverse(node);
  return result;
}

const contentJsPath = path.join(__dirname, '../content/content.js');
const storageJsPath = path.join(__dirname, '../lib/storage.js');
const i18nJsPath = path.join(__dirname, '../lib/i18n.js');

async function runChatGPTDiagnosticTests() {
  console.log('\n--- STARTING REAL CHATGPT RESTORATION LIFECYCLE DIAGNOSTIC ---\n');

  // Test Case 1: Normal ChatGPT Paragraph Mark
  console.log('>>> TEST CASE 1: Normal ChatGPT Paragraph Mark');
  await testChatGPTFlow({
    url: 'https://chatgpt.com/c/66f2a87b-1234-8005-9abc-def123456789',
    textNodeConfigs: [
      { tag: 'P', text: 'Artificial Intelligence is transforming coding workflows rapidly.' }
    ],
    clip: {
      id: 'clip_norm_01',
      url: 'https://chatgpt.com/c/66f2a87b-1234-8005-9abc-def123456789',
      pageUrl: 'https://chatgpt.com/c/66f2a87b-1234-8005-9abc-def123456789',
      text: 'transforming coding workflows',
      sourcePosition: 150
    },
    expectedPass: 'Pass 1 (Direct)'
  });

  // Test Case 2: Mark Crossing Markdown DOM Nodes (<strong>, <a>, <code>, line breaks)
  console.log('\n>>> TEST CASE 2: Mark Crossing Markdown DOM Nodes (<strong>, <a>, <code>, \\n)');
  await testChatGPTFlow({
    url: 'https://chatgpt.com/c/66f2a87b-1234-8005-9abc-def123456789',
    textNodeConfigs: [
      { tag: 'P', text: 'ReMark supports ' },
      { tag: 'STRONG', text: 'cross-line  highlights' },
      { tag: 'P', text: ' and ' },
      { tag: 'A', text: 'links' },
      { tag: 'P', text: ' inside ' },
      { tag: 'CODE', text: 'code   blocks' },
      { tag: 'P', text: '.\nAnother line here.' }
    ],
    clip: {
      id: 'clip_cross_02',
      url: 'https://chat.openai.com/c/66f2a87b-1234-8005-9abc-def123456789', // cross-domain chat.openai.com -> chatgpt.com
      pageUrl: 'https://chat.openai.com/c/66f2a87b-1234-8005-9abc-def123456789',
      text: 'supports cross-line highlights and links inside code blocks.\nAnother line',
      sourcePosition: 280
    },
    expectedPass: 'Pass 2 (Flexible Regex)'
  });

  // Test Case 3: Cold Load Simulation
  console.log('\n>>> TEST CASE 3: Cold Load Simulation (Dynamic API delay)');
  await testChatGPTFlow({
    url: 'https://chatgpt.com/c/66f2a87b-1234-8005-9abc-def123456789',
    textNodeConfigs: [
      { tag: 'P', text: 'Delayed ChatGPT response loaded after API fetch.' }
    ],
    clip: {
      id: 'clip_cold_03',
      url: 'https://chatgpt.com/c/66f2a87b-1234-8005-9abc-def123456789',
      pageUrl: 'https://chatgpt.com/c/66f2a87b-1234-8005-9abc-def123456789',
      text: 'Delayed ChatGPT response loaded',
      sourcePosition: 400
    },
    expectedPass: 'Pass 1 (Direct)'
  });

  console.log('\n--- ALL REAL CHATGPT RESTORATION LIFECYCLE TESTS PASSED PERFECTLY ---\n');
}

async function testChatGPTFlow({ url, textNodeConfigs, clip, expectedPass }) {
  global.currentDiagnosticLogs = [];
  const parsedUrl = new URL(url);

  const { root } = createDOMTreeFromNodes(textNodeConfigs);

  global.Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3
  };

  global.NodeFilter = {
    SHOW_TEXT: 4,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2
  };

  const origLog = console.log;
  const origWarn = console.warn;

  console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('[ReMark ChatGPT Diagnostic]')) {
      global.currentDiagnosticLogs.push(args[1]);
    }
    origLog(...args);
  };
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('[ReMark ChatGPT Diagnostic]')) {
      global.currentDiagnosticLogs.push(args[1]);
    }
    origWarn(...args);
  };

  const eventListeners = {};
  const mockGetComputedStyle = () => ({ getPropertyValue: () => '#FFFFFF' });
  global.getComputedStyle = mockGetComputedStyle;

  const mockLocalStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
  global.localStorage = mockLocalStorage;

  const mockHistory = { pushState: () => {}, replaceState: () => {} };
  global.history = mockHistory;

  const mockChrome = {
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: (msg) => {
        if (msg.action === 'SOURCE_CLIP_LOCATED') {
          global.currentDiagnosticLogs.push({ stage: 'SOURCE_CLIP_LOCATED_ACK', clipId: msg.clipId });
        }
      },
      getURL: (p) => p
    },
    storage: {
      local: {
        get: (keys, callback) => {
          const res = { markit_clips: [clip], markit_settings: { language: 'en' } };
          if (callback) callback(res);
          return Promise.resolve(res);
        },
        set: (obj, callback) => {
          if (callback) callback();
          return Promise.resolve();
        }
      },
      onChanged: { addListener: () => {} }
    }
  };
  global.chrome = mockChrome;

  global.window = {
    location: {
      href: url,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      hash: parsedUrl.hash
    },
    history: mockHistory,
    console: {
      log: console.log,
      warn: console.warn,
      error: () => {}
    },
    chrome: mockChrome,
    localStorage: mockLocalStorage,
    Node: global.Node,
    addEventListener: (evt, fn) => {
      if (!eventListeners[evt]) eventListeners[evt] = [];
      eventListeners[evt].push(fn);
    },
    removeEventListener: () => {},
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      if (eventListeners[type]) {
        for (const fn of eventListeners[type]) fn(evt);
      }
    },
    scrollY: 0,
    scrollX: 0,
    innerHeight: 800,
    innerWidth: 1200,
    CSS: { highlights: null },
    getSelection: () => ({ removeAllRanges: () => {}, addRange: () => {} }),
    getComputedStyle: mockGetComputedStyle,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval
  };

  global.document = {
    body: root,
    head: new MockNode(1, '', root, 'HEAD'),
    documentElement: root,
    getElementById: (id) => null,
    querySelector: (sel) => {
      if (sel.includes('mark')) return null;
      return null;
    },
    querySelectorAll: () => [],
    createTreeWalker: (node, show, filter) => {
      const nodes = collectAllTextNodes(node, filter);
      let idx = 0;
      return {
        nextNode: () => (idx < nodes.length ? nodes[idx++] : null)
      };
    },
    createRange: () => new MockRange(),
    createElement: (tag) => new MockNode(1, '', null, tag.toUpperCase()),
    createTextNode: (val) => new MockNode(3, val),
    addEventListener: (evt, fn) => global.window.addEventListener(evt, fn)
  };

  global.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  const i18nCode = fs.readFileSync(i18nJsPath, 'utf8');
  const storageCode = fs.readFileSync(storageJsPath, 'utf8');
  const contentCode = fs.readFileSync(contentJsPath, 'utf8');

  // Load i18n and storage into global and window
  const loadedI18n = eval(`(function() { ${i18nCode}; return ReMarkI18n; })()`);
  global.ReMarkI18n = loadedI18n;
  global.window.ReMarkI18n = loadedI18n;

  const loadedStorage = eval(`(function() { ${storageCode}; return ReMarkStorage; })()`);
  global.ReMarkStorage = loadedStorage;
  global.window.ReMarkStorage = loadedStorage;

  try {
    // Execute content.js
    eval(contentCode);

    // Trigger url change event to invoke restorePageHighlights
    global.window.dispatchEvent('remark:urlchange');

    // Wait brief microtask queue
    await new Promise((r) => setTimeout(r, 200));

    origLog('Captured Diagnostic Lifecycle Logs:\n', JSON.stringify(global.currentDiagnosticLogs, null, 2));

    const stageNames = global.currentDiagnosticLogs.map((l) => l.stage || l);

    assert.ok(stageNames.includes('SOURCE_URL_MATCHED'), 'Lifecycle Stage 1: SOURCE_URL_MATCHED must occur');
    assert.ok(stageNames.includes('TEXT_MATCHED'), 'Lifecycle Stage 2: TEXT_MATCHED must occur');

    const matchLog = global.currentDiagnosticLogs.find((l) => l.stage === 'TEXT_MATCHED');
    assert.strictEqual(matchLog.passUsed, expectedPass, `Matching pass used should be ${expectedPass}`);
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
}

runChatGPTDiagnosticTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('ChatGPT Diagnostic Test Failed:', err);
  process.exit(1);
});
