const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const content = read('content/content.js');
const sidepanel = read('sidepanel/sidepanel.js');
const background = read('background.js');
const manifest = JSON.parse(read('manifest.json'));
const i18n = read('lib/i18n.js');

assert.match(sidepanel, /await notifySourceTabs\(item, \{ action: 'DELETE_CLIP_FROM_PAGE', clipId: item\.id \}\)/);
assert.match(sidepanel, /async function notifySourceTabs[\s\S]*Promise\.all/);
assert.match(sidepanel, /action: 'RESTORE_HIGHLIGHTS'/);
assert.match(content, /function schedulePageHighlightRestore\(\)[\s\S]*DOMContentLoaded[\s\S]*window\.setTimeout\(restore, 2200\)/);
assert.match(content, /const textSegments = \[\];[\s\S]*let startIndex = text\.indexOf\(clip\.text\)[\s\S]*highlightDOMRange\(range, clip\)/);
assert.match(content, /function reportSourceUnavailable\(clipId\)[\s\S]*action: 'SOURCE_MARK_UNAVAILABLE'/);
assert.match(sidepanel, /SOURCE_MARK_UNAVAILABLE[\s\S]*source_unavailable/);
assert.match(sidepanel, /action: 'TRACK_SOURCE_NAVIGATION'/);
assert.match(background, /chrome\.webNavigation\.onErrorOccurred\.addListener/);
assert.ok(manifest.permissions.includes('webNavigation'));
assert.match(i18n, /source_unavailable: '无法找到原网页或对应内容/);
assert.match(i18n, /source_unavailable: 'The original page or marked content could not be found/);
console.log('page-sync.test.js: all assertions passed');

assert.match(content, /let selectedHighlight = null/);
assert.match(content, /event\.key === 'Enter' && event\.shiftKey && selectedHighlight/);
assert.match(content, /initialValue: item\?\.note \|\| ''/);
assert.match(content, /function openQuickNoteInput\(\{ rect, onSave, initialValue = '' \}\)/);
assert.match(content, /input\.value = initialValue/);
assert.match(content, /setActiveClip\(clip\.id\);[\s\S]*selectedHighlight = element/);
const clickHandler = content.slice(content.indexOf('function bindHighlightClick'), content.indexOf('function notifyStorageUpdated'));
assert.doesNotMatch(clickHandler, /OPEN_SIDE_PANEL/);
assert.match(content, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*setActiveClip\(clip\.id\);[\s\S]*selectedHighlight = element/);
assert.match(read('content/content.css'), /remark-selected \{[\s\S]*inset 0 -2px 0 rgba\(111, 85, 13, \.82\)/);
console.log('page-mark-interaction assertions passed');

assert.match(content, /event\.button !== 0 \|\| !\(event\.metaKey \|\| event\.ctrlKey\)/);
assert.match(content, /async function undoPageAction\(\)[\s\S]*ReMarkStorage\.get\(ReMarkStorage\.KEYS\.UNDO\)[\s\S]*ReMarkStorage\.undoLast\(\)/);
assert.match(content, /action\.type === 'restore_clip'[\s\S]*removeClipHighlightFromDOM\(action\.id, \{ immediate: true \}\)/);
assert.match(content, /function cancelClipHighlightRemoval\(clipId\)[\s\S]*remarkRemovalPending/);
assert.match(content, /event\.key\.toLowerCase\(\) !== 'z'[\s\S]*await undoPageAction\(\)/);
console.log('page-highlight-undo assertions passed');

assert.match(content, /function attachNoteControl\(mark, clip\)[\s\S]*className = 'remark-note-control'/);
assert.match(content, /control\.addEventListener\('click'[\s\S]*openQuickNoteInput\([\s\S]*initialValue: note/);
assert.match(content, /const showNote = Boolean\(clip\.note && segment === textSegments\[0\]\)/);
assert.match(content, /async function setClipNoteIndicator\(clipId\)[\s\S]*marks\.at\(0\)/);
console.log('page-note-control assertions passed');

assert.match(sidepanel, /action: 'RESTORE_HIGHLIGHTS'[\s\S]*action: 'LOCATE_CLIP'/);
assert.match(content, /const normalizedClipText = String\(clip\.text\)\.replace\(\/\\s\+\/g, ''\)/);
assert.match(content, /originalIndexes\.push\(index\)[\s\S]*normalizedPageText\.indexOf\(normalizedClipText\)/);
console.log('sidepanel-locate-recovery assertions passed');

assert.match(sidepanel, /if \(action === 'jump'\) \{ setActive\(key\); void jump\(itemFor\(key\)\); return; \}/);
assert.doesNotMatch(sidepanel.slice(sidepanel.indexOf("list.addEventListener('click'", sidepanel.indexOf('function isGlyphHit')), sidepanel.indexOf("list.addEventListener('click'", sidepanel.indexOf('function isGlyphHit')) + 1200), /isGlyphHit\(event, control\)/);
assert.match(content, /if \(mark\) \{[\s\S]*setActiveClip\(clipId\);[\s\S]*performLocateAnimation\(mark\)/);
assert.match(content, /mark\.scrollIntoView\(\{ behavior: 'smooth', block: 'center', inline: 'nearest' \}\)/);
console.log('viewport-mark-locate assertions passed');
