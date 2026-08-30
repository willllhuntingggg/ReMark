const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const background = read('background.js');
const sidepanel = read('sidepanel/sidepanel.js');
const storage = read('lib/storage.js');
const content = read('content/content.js');
const manifest = JSON.parse(read('manifest.json'));

// The Side Panel follows the active browser tab: when the panel is open and
// the user switches to another tab that has Marks, the panel should switch to
// that page's Source collection (and leave the collection when the new tab has
// no Marks). The background service worker is the event source; the panel
// applies the change.

// --- Background: event source for the active-page collection ---
assert.match(background, /async function syncActivePagePanel\(tabId, url\)/);
assert.match(background, /if \(!tab\.active \|\| !isNavigablePageUrl\(url \|\| tab\.url\)\) return;/);
assert.match(background, /const normalizedUrl = String\(url \|\| tab\.url\)\.split\('#'\)\[0\];/);
assert.match(background, /hasMarks = await markedUrlHasReMarkMarks\(normalizedUrl\);/);
assert.match(background, /chrome\.runtime\.sendMessage\(\{[\s\S]*?action: 'ACTIVE_PAGE_COLLECTION_CHANGED',[\s\S]*?windowId: tab\.windowId,[\s\S]*?url: hasMarks \? normalizedUrl : null[\s\S]*?\}\)\.catch/);
// Marks presence is decided by the same page grouping the panel uses.
assert.match(background, /async function markedUrlHasReMarkMarks\(url\)[\s\S]*?if \(!isNavigablePageUrl\(url\)\) return false;[\s\S]*?const pages = await ReMarkStorage\.getPages\(\);[\s\S]*?pages\.some\(\(page\) => sameReMarkPageUrl\(page\?\.url, url\)\)/);
assert.match(background, /function sameReMarkPageUrl\(a, b\)[\s\S]*?String\(a \|\| ''\)\.split\('#'\)\[0\] === String\(b \|\| ''\)\.split\('#'\)\[0\]/);
assert.match(background, /function isNavigablePageUrl\(url\)[\s\S]*?\/\^https\?:\/i\.test/);
// Fired on tab activation, navigation completion, history-state updates and URL changes.
assert.match(background, /chrome\.tabs\.onActivated\.addListener\(\(\{ tabId \}\) => \{[\s\S]*?void syncActivePagePanel\(tabId, tab\.url\);[\s\S]*?\}\);/);
assert.match(background, /chrome\.webNavigation\.onCompleted\.addListener\(\(details\) => \{[\s\S]*?if \(details\.frameId !== 0\) return;[\s\S]*?void syncActivePagePanel\(details\.tabId, details\.url\);/);
assert.match(background, /chrome\.webNavigation\.onHistoryStateUpdated\.addListener\(\(details\) => \{[\s\S]*?void syncActivePagePanel\(details\.tabId, details\.url\);/);
assert.match(background, /chrome\.tabs\.onUpdated\.addListener\(\(tabId, changeInfo, tab\) => \{[\s\S]*?if \(!changeInfo\.url\) return;[\s\S]*?void syncActivePagePanel\(tabId, url\);/);
// When stored Marks change, refresh the active page's panel state too.
assert.match(background, /if \(changes\?\.\[ReMarkStorage\.KEYS\.CLIPS\] \|\| changes\?\.\[ReMarkStorage\.KEYS\.VIDEO_MARKS\]\) \{[\s\S]*?void syncActivePagePanel\(tabs\[0\]\.id, tabs\[0\]\.url\);/);
console.log('page-sync background assertions passed');

// --- Side Panel: applies the active-page collection change ---
// On open the panel already selects the current page's Source collection.
assert.match(sidepanel, /async function showCurrentPageCollectionOnPanelOpen\(\)[\s\S]*?chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)[\s\S]*?const collectionUrl = all\(\)\.find\(\(item\) => sameSource\(item, tab\?\.url\)\)\?\.url;[\s\S]*?if \(collectionUrl\) showSourceCollection\(collectionUrl\);/);
// On tab switch the panel follows the active page.
assert.match(sidepanel, /async function followActivePageCollection\(url, windowId\)/);
assert.match(sidepanel, /if \(windowId !== undefined && tab\?\.windowId !== undefined && tab\.windowId !== windowId\) return;/);
assert.match(sidepanel, /const collectionUrl = all\(\)\.find\(\(item\) => sameSource\(item, url\)\)\?\.url;/);
assert.match(sidepanel, /if \(collectionUrl\) \{[\s\S]*?if \(exitedSourceUrl !== null && sameCollectionSource\(exitedSourceUrl, url\)\) return;[\s\S]*?showSourceCollection\(collectionUrl\);/);
assert.match(sidepanel, /else if \(sourceUrl !== null\) \{[\s\S]*?sourceUrl = null;[\s\S]*?render\(true\);/);
assert.match(sidepanel, /if \(message\?\.action === 'ACTIVE_PAGE_COLLECTION_CHANGED'\) void followActivePageCollection\(message\.url, message\.windowId\);/);
// A deliberate "back to timeline" choice is remembered per page, so same-page
// storage refreshes (e.g. highlight position backfill) cannot yank the panel
// back into the Source collection; switching pages clears the choice.
assert.match(sidepanel, /let exitedSourceUrl = null;/);
assert.match(sidepanel, /function leaveSourceCollection\(\) \{[\s\S]*?exitedSourceUrl = sourceUrl;[\s\S]*?sourceUrl = null;/);
assert.match(sidepanel, /function showSourceCollection\(url\) \{[\s\S]*?exitedSourceUrl = null;[\s\S]*?sourceUrl = url;/);
assert.match(sidepanel, /else if \(exitedSourceUrl !== null && !sameCollectionSource\(exitedSourceUrl, url \|\| ''\)\) \{[\s\S]*?exitedSourceUrl = null;/);
assert.match(sidepanel, /back\.addEventListener\('click', \(\) => \{ leaveSourceCollection\(\); \}\)/);
assert.match(sidepanel, /event\.key === 'Escape' && sourceUrl !== null\) \{ leaveSourceCollection\(\); \}/);
// Video Mark collections are keyed by platform video id, so player time and
// tracking params never split one video's Marks across views — and a video
// tab counts as "marked" for the follow message even with those params.
assert.match(sidepanel, /const sameCollectionSource = \(a, b\) => \{[\s\S]*?const keyA = videoKeyFromUrl\(a\);[\s\S]*?const keyB = videoKeyFromUrl\(b\);[\s\S]*?if \(keyA \|\| keyB\) return Boolean\(keyA && keyB && keyA === keyB\);[\s\S]*?return sameUrl\(a, b\);/);
assert.match(sidepanel, /const sameSource = \(item, url\) => \{[\s\S]*?if \(item\?\.type === 'video'\) \{[\s\S]*?const key = videoKeyFromUrl\(url\);[\s\S]*?return Boolean\(key\) && Boolean\(item\.raw\?\.videoKey\) && item\.raw\.videoKey === key;[\s\S]*?\}[\s\S]*?return sameUrl\(item\.url, url\);/);
assert.match(background, /function videoKeyFromUrl\(value\)[\s\S]*?if \(host\.endsWith\('youtube\.com'\) \|\| host === 'youtu\.be'\)[\s\S]*?if \(host\.endsWith\('bilibili\.com'\)\)/);
assert.match(background, /if \(pages\.some\(\(page\) => sameReMarkPageUrl\(page\?\.url, url\)\)\) return true;[\s\S]*?const videoKey = videoKeyFromUrl\(url\);[\s\S]*?const marks = await ReMarkStorage\.getVideoMarks\(\);[\s\S]*?marks\.some\(\(mark\) => mark\?\.videoKey === videoKey\)/);
// The URL comparison strips fragments on both sides of the wire.
assert.match(sidepanel, /const sameUrl = \(a, b\) => String\(a \|\| ''\)\.split\('#'\)\[0\] === String\(b \|\| ''\)\.split\('#'\)\[0\];/);
assert.match(sidepanel, /function showSourceCollection\(url\)[\s\S]*?sourceUrl = url;[\s\S]*?render\(\);/);
// A selection survives the jump round-trip (timeline -> source -> back): the
// jumped-to Mark stays selected in its collection and back on the timeline.
const showSourceBody = sidepanel.slice(sidepanel.indexOf('function showSourceCollection(url) {'), sidepanel.indexOf('function leaveSourceCollection()'));
const leaveSourceBody = sidepanel.slice(sidepanel.indexOf('function leaveSourceCollection() {'), sidepanel.indexOf('async function showCurrentPageCollectionOnPanelOpen'));
assert.doesNotMatch(showSourceBody, /clearSelection\(\)/);
assert.doesNotMatch(leaveSourceBody, /clearSelection\(\)/);
assert.match(sidepanel, /const selectedItem = selected \? itemFor\(selected\) : null;[\s\S]*?if \(selectedItem && !sameCollectionSource\(selectedItem\.url, url \|\| ''\)\) clearSelection\(\);/);
// Storage exposes the page grouping both sides rely on.
assert.match(storage, /async getPages\(\)[\s\S]*?const urlKey = item\.url \|\| 'other';/);
// The content script's position backfill must not rewrite unchanged values,
// which would churn storage and re-trigger the panel-follow message loop.
assert.match(content, /async function computeClipPositionsForPage\(options = \{\}\)[\s\S]*?const unchanged = Number\.isFinite\(Number\(clip\.sourcePosition\)\) && Number\.isFinite\(Number\(clip\.sourcePositionX\)\) && Number\(clip\.sourcePosition\) === nextPosition && Number\(clip\.sourcePositionX\) === nextPositionX;[\s\S]*?if \(unchanged\) continue;/);
console.log('page-sync sidepanel assertions passed');

// --- Card interaction: whole card jumps, Select mode only selects ---
assert.doesNotMatch(sidepanel, /data-action="jump"/);
assert.doesNotMatch(sidepanel, /data-action="source"/);
assert.doesNotMatch(sidepanel, /mark-source-arrow/);
assert.match(sidepanel, /<span class="mark-content-text">\$\{content\}<\/span>/);
assert.match(sidepanel, /const card = event\.target\.closest\('\.mark-card'\);[\s\S]*?if \(selectMode && !event\.shiftKey && !event\.metaKey && !event\.ctrlKey\) \{[\s\S]*?selectCard\(key, \{ shiftKey: false, metaKey: true, ctrlKey: true \}\)/);
assert.match(sidepanel, /if \(selectMode \|\| event\.shiftKey \|\| event\.metaKey \|\| event\.ctrlKey\) \{[\s\S]*?selectCard\(key, event\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?selectCard\(key, event\);[\s\S]*?void jump\(itemFor\(key\)\);/);
assert.match(sidepanel, /event\.key === 'Enter' && !event\.shiftKey && !event\.metaKey && !event\.ctrlKey && selected/);
console.log('page-sync card-interaction assertions passed');

// --- Controls: magnifier toggle search; Select button gates multi-select ---
const html = read('sidepanel/sidepanel.html');
assert.match(html, /id="search-toggle"/);
assert.match(html, /id="search-box"/);
assert.match(html, /id="select-mode"/);
assert.match(sidepanel, /function collapseSearch\(\)[\s\S]*?searchBox\.hidden = true;[\s\S]*?searchToggle\.hidden = false;[\s\S]*?selectModeButton\.hidden = false;/);
assert.match(sidepanel, /function expandSearch\(\)[\s\S]*?searchBox\.hidden = false;[\s\S]*?searchToggle\.hidden = true;[\s\S]*?selectModeButton\.hidden = true;/);
assert.match(sidepanel, /selectModeButton\.addEventListener\('click', \(\) => \{[\s\S]*?selectMode = !selectMode;[\s\S]*?selectModeButton\.textContent = t\(selectMode \? 'cancel' : 'select_mode'\);[\s\S]*?if \(!selectMode\) clearSelection\(\);/);
assert.match(sidepanel, /let clips = \[\], videos = \[\], sourceUrl = null, query = '', selected = null, selectedKeys = new Set\(\), selectionAnchor = null, keyboardFocus = false, selectMode = false;/);
console.log('page-sync controls assertions passed');

// --- Permissions and wiring ---
assert.ok(manifest.permissions.includes('tabs'));
assert.ok(manifest.permissions.includes('webNavigation'));
assert.ok(manifest.permissions.includes('sidePanel'));
assert.ok(manifest.permissions.includes('storage'));
console.log('page-sync manifest assertions passed');
console.log('page-sync.test.js: all assertions passed');
