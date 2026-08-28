const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../content/content.js'), 'utf8');
const start = source.indexOf('function getSelectionSourceUrl(range)');
const end = source.indexOf('// Listen for messages from sidepanel / background', start);
const block = source.slice(start, end);

assert.ok(start >= 0, '链接来源解析函数必须存在');
assert.ok(end > start, '链接来源解析函数边界必须存在');
assert.match(block, /const startAnchor = getAnchor\(range\.startContainer\);/);
assert.match(block, /const endAnchor = getAnchor\(range\.endContainer\);/);
assert.match(block, /!startAnchor \|\| startAnchor !== endAnchor/);
assert.match(block, /startAnchor\.contains\(range\.commonAncestorContainer\)/);
assert.match(block, /new URL\(startAnchor\.getAttribute\('href'\), document\.baseURI\)/);
assert.match(block, /url\.protocol === 'http:' \|\| url\.protocol === 'https:'/);
assert.match(block, /return window\.location\.href;/);

assert.match(source, /sourceUrl: getSelectionSourceUrl\(range\)/);
assert.match(source, /url: sourceUrl \|\| window\.location\.href/);
assert.match(source, /pageUrl: window\.location\.href/);
assert.match(source, /sourceUrl: ctx\.sourceUrl/);

const storage = fs.readFileSync(path.resolve(__dirname, '../lib/storage.js'), 'utf8');
const sidepanel = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
assert.match(storage, /pageUrl: clipData\.pageUrl \|\| clipData\.url \|\| window\.location\.href/);
assert.match(source, /clip\.pageUrl \|\| clip\.url/);
assert.match(sidepanel, /pageUrl: raw\.pageUrl \|\| raw\.url \|\| ''/);
assert.match(sidepanel, /const pageUrl = item\.type === 'highlight' \? \(item\.pageUrl \|\| item\.url\) : item\.url;/);
assert.match(source, /const linkedMark = event\.target\.closest\('a\[href\]'\);/);
assert.match(source, /if \(linkedMark && isLinkedSource\) return;/);
assert.match(sidepanel, /const isLinkedSource = item\.type === 'highlight' && item\.url && pageUrl && !sameUrl\(item\.url, pageUrl\);/);
assert.match(sidepanel, /if \(isLinkedSource\) \{/);
assert.match(sidepanel, /action: 'OPEN_MARK_NAVIGATION',[\s\S]*url: item\.url,[\s\S]*locateClip: false/);
assert.match(sidepanel, /Font Awesome Free 6\.7\.2 — fa-link/);
assert.match(sidepanel, /const isLinkedSource = item\.type === 'highlight' && item\.url && item\.pageUrl && !sameUrl\(item\.url, item\.pageUrl\);/);
assert.match(sidepanel, /class="mark-link-source"/);
assert.match(sidepanel, /item\.type === 'highlight'[\s\S]*mark-quote--video/);

const styles = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.css'), 'utf8');
assert.match(styles, /\.mark-link-source \{/);
assert.match(styles, /\.mark-link-source svg \{/);

console.log('link-source-detection.test.js: all assertions passed');
