const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../content/content.js'), 'utf8');
const start = source.indexOf('function isMarkNoteDragStart');
const end = source.indexOf('function suppressSelectionFollowupClick', start);
const gestureBlock = source.slice(start, end);

assert.ok(start >= 0, 'Mark + Note drag predicate must exist');
assert.ok(end > start, 'Mark + Note drag handler must exist');
assert.match(gestureBlock, /event\.button === 0/);
assert.match(gestureBlock, /event\.shiftKey/);
assert.match(gestureBlock, /event\.metaKey \|\| event\.ctrlKey/);
assert.match(gestureBlock, /if \(!isMarkNoteDragStart\(event\)\) return;/);
assert.match(gestureBlock, /selection\?\.rangeCount\) selection\.removeAllRanges\(\)/);
assert.doesNotMatch(gestureBlock, /preventDefault|stopPropagation|stopImmediatePropagation/);

console.log('mark-note-gesture.test.js: all assertions passed');
