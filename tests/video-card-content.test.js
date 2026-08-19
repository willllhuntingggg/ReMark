const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sidepanel = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.css'), 'utf8');

assert.match(sidepanel, /const videoPrimary = item\.type === 'video'[\s\S]*videoMarkedText \|\| item\.chapter\?\.text\?\.trim\(\) \|\| item\.caption\?\.text\?\.trim\(\) \|\| item\.note\?\.trim\(\) \|\| item\.title\?\.trim\(\) \|\| t\('untitled_video'\)/);
assert.match(sidepanel, /<span class="video-timestamp">\$\{clock\(item\.time\)\}<\/span>[\s\S]*<span class="video-primary">\$\{esc\(videoPrimary\)\}<\/span>/);
assert.doesNotMatch(sidepanel, /video-duration/);
assert.match(sidepanel, /const videoUsesChapter[\s\S]*const videoUsesCaption[\s\S]*const videoUsesNote/);
assert.match(sidepanel, /item\.caption\?\.text && !videoUsesCaption/);
assert.match(sidepanel, /item\.chapter\?\.text && !videoUsesChapter/);
assert.match(sidepanel, /const note = item\.note && !videoUsesNote/);
assert.match(sidepanel, /const footer = sourceUrl === null[\s\S]*: '';/);
assert.match(css, /\.video-primary \{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;/);
assert.doesNotMatch(css, /\.video-duration/);

console.log('video-card-content.test.js: all assertions passed');
