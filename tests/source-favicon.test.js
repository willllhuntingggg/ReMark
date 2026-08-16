const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.css'), 'utf8');

assert.match(script, /const faviconUrl = \(value\)/);
assert.match(script, /new URL\('\/favicon\.ico', page\.origin\)\.href/);
assert.match(script, /\['http:', 'https:'\]\.includes\(page\.protocol\)/);
assert.match(script, /class="mark-source-favicon"/);
assert.match(script, /event\.target\.matches\?\.\('\.mark-source-favicon'\)/);
assert.match(script, /data-action="source"[\s\S]*sourceIcon/);
assert.match(css, /\.mark-source-favicon \{[\s\S]*width: 13px;[\s\S]*height: 13px;/);

console.log('source-favicon.test.js: all assertions passed');
const sourceDefinition = script.indexOf('const source =');
const sourceControl = script.indexOf('const sourceControl =');
assert.ok(sourceDefinition >= 0 && sourceDefinition < sourceControl, 'source text must be defined before card rendering');
