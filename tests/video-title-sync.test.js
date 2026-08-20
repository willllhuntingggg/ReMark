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

assert.ok(youtube.includes('if (/\\/shorts\\//.test(p)) return true;'));
assert.ok(youtube.includes('pathname.match(/\\/(?:shorts|embed|e|live)\\/([\\w-]{6,})/)'));
assert.match(youtube, /fromText\('ytd-reel-video-renderer\[is-active\] h2'\)/);
assert.match(content, /const activeShort = document\.querySelector\('ytd-reel-video-renderer\[is-active\] video\.html5-main-video'\);[\s\S]*?if \(activeShort\) return activeShort;/);
assert.match(content, /const activeShort = document\.querySelector\('ytd-reel-video-renderer\[is-active\]'\);[\s\S]*?activeShort\.querySelector\('\.ytp-progress-bar, \.ytp-progress-container'\)/);
assert.match(content, /const shortsRails = \[[\s\S]*?ytPlayerProgressBarDragContainer[\s\S]*?for \(const selector of shortsRails\)[\s\S]*?rail\.getBoundingClientRect\(\)\.width > 0\) return rail;/);
assert.match(content, /document\.addEventListener\('keydown', onVideoMarkKeydown, true\)/);
assert.match(content, /function onVideoMarkKeydown\(e\)[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopImmediatePropagation\(\);[\s\S]*?recordVideoMark\(\{ withNote: e\.shiftKey \}\)/);
assert.ok(content.includes("return detectVideoPlatform() === 'youtube' && /\\/shorts\\//.test(window.location.pathname);"));
assert.match(content, /function getVideoMarkerHost\(bar, video\) \{[\s\S]*?isYouTubeShortsPage\(\)[\s\S]*?remark-video-marker-layer[\s\S]*?return layer;/);
assert.match(content, /const sig = bar \? `\$\{markerNodeId\(video\)\}:\$\{markerNodeId\(bar\)\}/);
assert.match(content, /const host = getVideoMarkerHost\(bar, video\);/);
assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'content/content.css'), 'utf8'), /\.remark-video-marker-layer \{[\s\S]*?z-index: 71;[\s\S]*?pointer-events: none;/);
assert.match(content, /function markCreationGeometry\(video, time\)[\s\S]*?const rect = video\.getBoundingClientRect\(\);[\s\S]*?lineTop = rect\.bottom - Math\.max\(30, rect\.height \* 0\.075\)/);
console.log('youtube-shorts-mark assertions passed');

console.log('video-title-sync.test.js: all assertions passed');
