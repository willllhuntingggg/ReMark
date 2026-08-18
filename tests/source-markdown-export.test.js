const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const i18n = fs.readFileSync(path.resolve(__dirname, '../lib/i18n.js'), 'utf8');

assert.match(source, /function sourceRowsFor\(url\)/);
assert.match(source, /function quoteMarkdown\(value\)/);
assert.match(source, /function sourceMarkdown\(rows, url\)/);
assert.match(source, /function copySourceMarkdown\(button\)/);
assert.match(source, /data-action="copy-source-markdown"/);
assert.match(source, /context\.addEventListener\('click'/);
assert.match(source, /navigator\.clipboard\.writeText\(value\)/);
assert.match(source, /document\.execCommand\('copy'\)/);
assert.match(source, /const COPY_BTN_ICON/);
assert.match(source, /const COPIED_BTN_ICON/);
assert.match(source, /function showCopyFeedback\(button\)/);
assert.match(source, /source-collection-copy[\s\S]{0,300}\$\{COPY_BTN_ICON\}/);
assert.doesNotMatch(source, /⧉/);
assert.match(source, /item\.caption\?\.text \|\| item\.chapter\?\.text/);
assert.match(source, /if \(item\.type === 'video'\) \{[\s\S]*const sourceUrl = videoMarkSourceUrl\(item\)[\s\S]*<\$\{sourceUrl\}>/);
assert.match(source, /\*\*\$\{t\('add_note'\)\}:\*\*/);
assert.match(i18n, /copy_source_markdown/);
assert.match(i18n, /source_marks_copied/);

console.log('source-markdown-export.test.js: all assertions passed');
