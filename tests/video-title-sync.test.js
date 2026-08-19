const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.resolve(__dirname, '..', 'content/content.js'), 'utf8');
const youtube = content.slice(content.indexOf('youtube: {'), content.indexOf('findVideoElement()', content.indexOf('youtube: {')));

assert.ok(
  youtube.indexOf("fromText('h1.ytd-watch-metadata yt-formatted-string')") < youtube.indexOf("fromMeta('meta[property=\"og:title\"]')"),
  'YouTube title DOM must take precedence over potentially stale metadata'
);
assert.match(content, /async function refreshVideoMarkTitle\(markId, videoKey, initialTitle\)/);
assert.match(content, /if \(getVideoKey\(\) !== videoKey\) return;/);
assert.match(content, /const currentTitle = getVideoTitle\(\);[\s\S]*title: currentTitle[\s\S]*refreshVideoMarkTitle\(savedMark\.id, vkey, currentTitle\)/);

console.log('video-title-sync.test.js: all assertions passed');
