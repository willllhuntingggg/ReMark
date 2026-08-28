const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const background = read('background.js');
const sidepanel = read('sidepanel/sidepanel.js');
const storage = read('lib/storage.js');
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
assert.match(sidepanel, /async function showCurrentPageCollectionOnPanelOpen\(\)[\s\S]*?chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)[\s\S]*?const collectionUrl = all\(\)\.find\(\(item\) => sameUrl\(item\.url, tab\?\.url\)\)\?\.url;[\s\S]*?if \(collectionUrl\) showSourceCollection\(collectionUrl\);/);
// On tab switch the panel follows the active page.
assert.match(sidepanel, /async function followActivePageCollection\(url, windowId\)/);
assert.match(sidepanel, /if \(windowId !== undefined && tab\?\.windowId !== undefined && tab\.windowId !== windowId\) return;/);
assert.match(sidepanel, /const collectionUrl = all\(\)\.find\(\(item\) => sameUrl\(item\.url, url\)\)\?\.url;/);
assert.match(sidepanel, /if \(collectionUrl\) showSourceCollection\(collectionUrl\);/);
assert.match(sidepanel, /else if \(sourceUrl !== null\) \{ sourceUrl = null; clearSelection\(\); render\(true\); \}/);
assert.match(sidepanel, /if \(message\?\.action === 'ACTIVE_PAGE_COLLECTION_CHANGED'\) void followActivePageCollection\(message\.url, message\.windowId\);/);
// The URL comparison strips fragments on both sides of the wire.
assert.match(sidepanel, /const sameUrl = \(a, b\) => String\(a \|\| ''\)\.split\('#'\)\[0\] === String\(b \|\| ''\)\.split\('#'\)\[0\];/);
assert.match(sidepanel, /function showSourceCollection\(url\)[\s\S]*?sourceUrl = url;[\s\S]*?render\(\);/);
// Storage exposes the page grouping both sides rely on.
assert.match(storage, /async getPages\(\)[\s\S]*?const urlKey = item\.url \|\| 'other';/);
console.log('page-sync sidepanel assertions passed');

// --- Permissions and wiring ---
assert.ok(manifest.permissions.includes('tabs'));
assert.ok(manifest.permissions.includes('webNavigation'));
assert.ok(manifest.permissions.includes('sidePanel'));
assert.ok(manifest.permissions.includes('storage'));
console.log('page-sync manifest assertions passed');
console.log('page-sync.test.js: all assertions passed');
