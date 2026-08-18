const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.css'), 'utf8');

assert.doesNotMatch(script, /mark-note-empty/);
assert.doesNotMatch(css, /mark-note-empty/);
assert.doesNotMatch(script, /mark-note-arrow/);
assert.doesNotMatch(css, /mark-note-arrow/);
assert.doesNotMatch(css, /mark-note-glyph/);
assert.match(script, /t\(item\.note \? 'edit_note' : 'add_note'\)/);
assert.match(script, /event\.key === 'Enter' && event\.shiftKey/);
assert.match(script, /event\.metaKey \|\| event\.ctrlKey/);
assert.match(script, /openNote\(selected\)/);

console.log('sidebar-note-entry.test.js: all assertions passed');
assert.match(css, /\.mark-note \{[\s\S]*border: 0;[\s\S]*background: transparent;/);
assert.doesNotMatch(css, /\.mark-note \{[\s\S]{0,300}border: 1px/);
