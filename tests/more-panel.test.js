const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.html'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const i18n = fs.readFileSync(path.resolve(__dirname, '../lib/i18n.js'), 'utf8');

assert.match(html, /data-i18n-aria-label="open_more"/);
assert.match(html, /id="language-setting"/);
assert.match(html, /id="replay-tutorial"/);
assert.match(script, /ReMarkI18n\.setLocale\(normalized\)/);
assert.match(script, /updateSettings\(\{ language: preference \}\)/);
assert.match(i18n, /more: 'More'/);
assert.match(i18n, /language_system: 'System default'/);
const sourceSummary = script.slice(script.indexOf("if (inSource)"), script.indexOf("} else {", script.indexOf("if (inSource)")));
assert.doesNotMatch(sourceSummary, /source_summary|host\(sourceUrl\)/);

console.log('more-panel.test.js: all assertions passed');
const moreHeader = html.slice(html.indexOf('id="panel-settings"'), html.indexOf('class="language-section"'));
assert.doesNotMatch(moreHeader, /<h1/);
assert.match(script, /viewIdentity\.hidden = true/);
assert.match(script, /viewIdentity\.hidden = false/);
const css = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.css'), 'utf8');
assert.match(css, /\.app-container\.is-more-open #panel-clips \{ display: none !important; \}/);
assert.match(css, /\.settings-panel \{ position: absolute; z-index: 20; inset: 0;/);
assert.match(script, /appContainer\.classList\.add\('is-more-open'\)/);
assert.match(script, /appContainer\.classList\.remove\('is-more-open'\)/);
const sourceView = script.slice(script.indexOf('if (inSource)'), script.indexOf("let previous = ''"));
assert.match(sourceView, /const title = sourceRows\[0\]\?\.title/);
assert.match(sourceView, /subtitle\.textContent = title/);
assert.doesNotMatch(sourceView, /subtitle\.hidden = true/);
assert.match(script, /const sourceControl = sourceUrl === null/);
assert.match(script, /<footer class="mark-footer">\$\{sourceControl\}/);
console.log('more-panel.test.js: all assertions passed');
