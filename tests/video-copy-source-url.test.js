const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const content = read('content/content.js');
const sidepanel = read('sidepanel/sidepanel.js');

assert.match(content, /function videoMarkSourceUrl\(mark\)[\s\S]*url\.searchParams\.set\('t', String\(time\)\)/);
assert.match(content, /async function copyVideoMark\(mark, button\)[\s\S]*const payload = videoMarkSourceUrl\(mark\)/);
assert.doesNotMatch(content.slice(content.indexOf('async function copyVideoMark'), content.indexOf('// Hovering a video mark')), /mark\.title|formatVideoTime\(mark\.time\)/);
assert.match(content, /const VIDEO_MARK_REPLAY_PREROLL_SECONDS = 5;/);
assert.match(content, /function seekVideoToMark\(time\)[\s\S]*video\.currentTime = Math\.max\(0, Number\(time\) - VIDEO_MARK_REPLAY_PREROLL_SECONDS\)/);
assert.match(content, /dot\.addEventListener\('click', \(e\) => \{[\s\S]*seekVideoToMark\(m\.time\);/);

assert.match(sidepanel, /const videoMarkSourceUrl = \(item\) => \{[\s\S]*url\.searchParams\.set\('t', String\(time\)\)/);
assert.match(sidepanel, /const videoReplaySourceUrl = \(item\) => \{[\s\S]*Math\.floor\(\(Number\(item\?\.time\) \|\| 0\) - 5\)[\s\S]*url\.searchParams\.set\('t', String\(time\)\)/);
assert.match(sidepanel, /async function copyMark\(key, button\)[\s\S]*videoMarkSourceUrl\(item\)/);
assert.match(sidepanel, /action: 'OPEN_MARK_NAVIGATION',[\s\S]*url: item\.type === 'video' \? videoReplaySourceUrl\(item\) : pageUrl,[\s\S]*locateClip: false/);

console.log('video-copy-source-url.test.js: all assertions passed');
