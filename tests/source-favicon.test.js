const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.css'), 'utf8');

assert.match(script, /const faviconUrl = \(value\)/);
assert.match(script, /new URL\('\/favicon\.ico', page\.origin\)\.href/);
assert.match(script, /\['http:', 'https:'\]\.includes\(page\.protocol\)/);
assert.match(script, /sourceIconHtml\(item\.url, 'mark-source-favicon', 'mark-source-fallback'\)/);
assert.match(script, /icon\.matches\?\.\('\.mark-source-favicon, \.source-collection-favicon'\)/);
assert.match(script, /sourceIconHtml\(sourceUrl, 'source-collection-favicon', 'source-collection-fallback'\)/);
assert.match(script, /clipsPanel\.addEventListener\('error'/);
assert.match(script, /SOURCE_FALLBACK_SVG/);
assert.match(script, /viewBox="0 0 512 512"/);
assert.match(script, /fa-globe/);
assert.match(script, /mark-source-fallback/);
assert.match(script, /source-collection-fallback/);
assert.match(script, /data-action="source"[\s\S]*sourceIcon/);
assert.match(css, /\.mark-source-favicon \{[\s\S]*width: 13px;[\s\S]*height: 13px;/);
assert.match(css, /\.source-collection-favicon \{[\s\S]*width: 13px;[\s\S]*height: 13px;/);
assert.match(css, /\.mark-source-fallback,[\s\S]*\.source-collection-fallback/);
assert.match(css, /\.mark-source-favicon,[\s\S]*\.mark-source-fallback \{[\s\S]*opacity: \.62/);

console.log('source-favicon.test.js: all assertions passed');
const sourceDefinition = script.indexOf('const source =');
const sourceControl = script.indexOf('const sourceControl =');
assert.ok(sourceDefinition >= 0 && sourceDefinition < sourceControl, 'source text must be defined before card rendering');
assert.match(script, /const source = item\.title \|\| host\(item\.url\) \|\| item\.url/);
assert.match(script, /mark-source-arrow/);
assert.match(script, /<div class="mark-card-tools"><div class="mark-actions">/);
assert.match(script, /<div class="mark-content">[\s\S]*<div class="mark-card-tools">/);
assert.match(script, /<footer class="mark-footer">\$\{sourceControl \|\| '<span class="mark-source-slot"><\/span>'\}<time class="mark-created"/);
assert.match(css, /\.mark-source:hover \.mark-source-arrow,[\s\S]*opacity: 1;/);
assert.match(css, /\.mark-card-tools \{[\s\S]*position: absolute;/);
assert.match(css, /\.mark-card \{[\s\S]*width: calc\(100% \+ 36px\);[\s\S]*margin: 0 -18px;/);
assert.match(css, /\.mark-card-tools \{[\s\S]*top: 50%;[\s\S]*transform: translateY\(-50%\);/);
