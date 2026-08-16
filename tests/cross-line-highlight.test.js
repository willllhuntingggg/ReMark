const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.resolve(__dirname, '../content/content.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../content/content.css'), 'utf8');

assert.match(script, /const textSegments = \[\];/);
assert.match(script, /if \(textSegments\.length\) \{/);
assert.match(script, /textSegments\.slice\(\)\.reverse\(\)\.forEach/);
assert.match(script, /document\.querySelectorAll\(`mark\[data-clip-id="\$\{clipId\}"\]`\)/);
assert.match(script, /function setClipNoteIndicator\(clipId\)/);
assert.match(script, /function setActiveClip\(clipId\)[\s\S]*querySelectorAll/);
assert.match(css, /-webkit-box-decoration-break: clone;/);
assert.match(css, /box-decoration-break: clone;/);
assert.match(css, /padding: 0;/);
assert.match(css, /remark-selected \{[\s\S]*outline: none;/);
assert.doesNotMatch(css.slice(0, 1200), /box-decoration-break: slice/);

console.log('cross-line-highlight.test.js: all assertions passed');
assert.match(css, /display: inline;/);
assert.match(css, /box-shadow: 0 \.08em 0 var\(--remark-highlight-bg\), 0 -\.08em 0 var\(--remark-highlight-bg\);/);
assert.match(css, /white-space: inherit;/);
assert.match(css, /letter-spacing: inherit;/);
assert.match(css, /word-spacing: inherit;/);
assert.match(css, /mark\.remark-highlight-mark\.has-note::after \{[\s\S]*position: absolute;/);
assert.doesNotMatch(css.slice(0, 1500), /padding: 0 1px/);
