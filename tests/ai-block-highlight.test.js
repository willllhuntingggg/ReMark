const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../content/content.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../content/content.css'), 'utf8');
const start = source.indexOf('const AI_GENERATED_BLOCK_SELECTOR');
const end = source.indexOf('document.addEventListener(\'mouseup\'', start);
const editableBlock = source.slice(start, end);

assert.ok(start >= 0, 'AI_GENERATED_BLOCK_SELECTOR must exist');
assert.ok(end > start, 'isEditableSelection must be closed');

// ChatGPT writing blocks and code blocks are editable editors inside
// assistant replies; ReMark must still allow marking them.
assert.match(editableBlock, /AI_GENERATED_BLOCK_SELECTOR/);
assert.match(editableBlock, /data-testid="writing-block-container"/);
assert.match(editableBlock, /data-writing-block="true"/);
assert.match(editableBlock, /data-writing-block-fullscreen-editor-region="true"/);
assert.match(editableBlock, /\[data-message-author-role\] \.cm-editor/);
assert.match(editableBlock, /\[data-message-author-role\] \.cm-content/);
assert.match(editableBlock, /\[data-message-author-role\] \.ProseMirror/);
assert.match(editableBlock, /\.agent-turn \.cm-editor/);

// Real inputs stay blocked, while contenteditable AI blocks are allowed.
assert.match(editableBlock, /parent\.closest\('input, textarea'\)/);
assert.match(editableBlock, /parent\.closest\('\[contenteditable\]'\)/);
assert.match(editableBlock, /!editable\.closest\(AI_GENERATED_BLOCK_SELECTOR\)/);

// AI editors (ProseMirror / CodeMirror) own their content DOM, so no page
// highlight is painted there — the clip is recorded and restored as a record
// only. highlightDOMRange must skip those ranges entirely.
assert.match(source, /function isAiEditorRange\(/);
assert.match(source, /el\.closest\('\[contenteditable\], \.cm-editor, \.cm-content, \.ProseMirror'\)/);
assert.match(source, /function highlightDOMRange\(range, clip, fresh = false\) \{[\s\S]*if \(isAiEditorRange\(range\)\) return;/);
assert.doesNotMatch(source, /remark-overlay-mark/);
assert.doesNotMatch(css, /remark-overlay-mark/);
assert.doesNotMatch(css, /remark-overlay-seg/);

console.log('ai-block-highlight.test.js: all assertions passed');
