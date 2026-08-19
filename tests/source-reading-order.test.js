const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'sidepanel/sidepanel.js'), 'utf8');
const start = source.indexOf('const READING_ORDER_ROW_TOLERANCE');
const end = source.indexOf('function visible()', start);
assert.ok(start >= 0 && end > start, 'spatial ordering helper must be defined before visible()');

const context = { Map };
vm.runInNewContext(`${source.slice(start, end)}; result = sortSourceRows;`, context);
const sortSourceRows = context.result;

const readingOrder = sortSourceRows([
  { key: 'right', type: 'highlight', position: 104, posX: 420, createdAt: 2 },
  { key: 'left', type: 'highlight', position: 100, posX: 24, createdAt: 4 },
  { key: 'next-row', type: 'highlight', position: 118, posX: 12, createdAt: 1 },
  { key: 'missing-position', type: 'highlight', position: null, posX: null, createdAt: 0 }
]);
assert.deepEqual(Array.from(readingOrder, (item) => item.key), ['left', 'right', 'next-row', 'missing-position']);

const videoOrder = sortSourceRows([
  { key: 'late', type: 'video', time: 30, createdAt: 1 },
  { key: 'early', type: 'video', time: 8, createdAt: 2 }
]);
assert.deepEqual(Array.from(videoOrder, (item) => item.key), ['early', 'late']);

console.log('source-reading-order.test.js: all assertions passed');

const content = fs.readFileSync(path.resolve(__dirname, '..', 'content/content.js'), 'utf8');
assert.match(content, /computeClipPositionsForPage\(options = \{\}\)[\s\S]*const force = Boolean\(options\.force\);/);
assert.match(content, /if \(!force && Number\.isFinite\(Number\(clip\.sourcePosition\)\) && Number\.isFinite\(Number\(clip\.sourcePositionX\)\)\) continue;/);
assert.match(source, /const contentArea = document\.querySelector\('\.content-area'\);/);
assert.match(source, /contentArea\.scrollTop = 0;[\s\S]*syncSourcePositions\(sourceUrl\)/);
assert.match(source, /COMPUTE_CLIP_POSITIONS', url: pageUrl, forcePositions: true/);
