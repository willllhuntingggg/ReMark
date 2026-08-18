const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const content = read('content/content.js');
const sidepanel = read('sidepanel/sidepanel.js');

assert.match(content, /function videoMarkSourceUrl\(mark\)[\s\S]*url\.searchParams\.set\('t', String\(time\)\)/);
assert.match(content, /async function copyVideoMark\(mark, button\)[\s\S]*const payload = videoMarkSourceUrl\(mark\)/);
assert.doesNotMatch(content.slice(content.indexOf('async function copyVideoMark'), content.indexOf('// Hovering a video mark')), /mark\.title|formatVideoTime\(mark\.time\)/);

assert.match(sidepanel, /const videoMarkSourceUrl = \(item\) => \{[\s\S]*url\.searchParams\.set\('t', String\(time\)\)/);
assert.match(sidepanel, /async function copyMark\(key, button\)[\s\S]*videoMarkSourceUrl\(item\)/);
assert.match(sidepanel, /window\.open\(item\.type === 'video' \? videoMarkSourceUrl\(item\) : pageUrl/);

console.log('video-copy-source-url.test.js: all assertions passed');
