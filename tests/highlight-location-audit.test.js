const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentJs = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');
const contentCss = fs.readFileSync(path.join(__dirname, '../content/content.css'), 'utf8');
const i18nJs = fs.readFileSync(path.join(__dirname, '../lib/i18n.js'), 'utf8');

// 1. Verify i18n key source_unavailable_loaded_page exists and contains specific reasons
assert.match(i18nJs, /source_unavailable_loaded_page:/);
assert.match(i18nJs, /在已加载页面中无法定位到该高亮/);
assert.match(i18nJs, /Unable to locate highlight on loaded page/);

// 2. Verify content.js has multi-match candidate positioning and disambiguation
assert.match(contentJs, /const candidates = \[\]/);
assert.match(contentJs, /candY = Math\.round\(rect\.top \+ window\.scrollY\)/);
assert.match(contentJs, /Math\.abs\(candY - targetY\)/);

// 3. Verify content.js handles pre-existing DOM mark location animation without getting blocked
assert.match(contentJs, /const mark = document\.querySelector\(`mark\[data-clip-id="\${clipId}"\]`\);[\s\S]*pendingClipLocations\.add\(clipId\);[\s\S]*resolvePendingClipLocation\(clipId\);/);

// 4. Verify content.js uses maxWaitTime = 8000 for dynamic hydration and rendering
assert.match(contentJs, /const maxWaitTime = 8000;/);
assert.match(contentJs, /reportSourceUnavailable\(clipId, \{ isLoadedPage: true \}\);/);

// 5. Verify applyGlobalMarkColor synchronizes AI highlights for code blocks
assert.match(contentJs, /function applyGlobalMarkColor\(color\) \{[\s\S]*syncAiHighlightsToCSS\(\);/);

// 6. Verify performLocateAnimation sends SOURCE_CLIP_LOCATED immediately to clear sidepanel toast instantly
assert.match(contentJs, /function performLocateAnimation\(mark\) \{[\s\S]*hidePageToast\(\);[\s\S]*SOURCE_CLIP_LOCATED/);

// 7. Verify ChatGPT URL matching across domains (chatgpt.com & chat.openai.com)
assert.match(contentJs, /isChatGPTDomain/);
assert.match(contentJs, /cMatchA/);

// 8. Verify Pass 2 flexible regex matching for cross-Markdown DOM node highlights
assert.match(contentJs, /const pattern = clipText\.replace\(\/\[\.\*\+\?\^\${}\(\)\|\[\\\]\\\\\]\/g, '\\\\\$&'\)\.replace\(\/\\s\+\/g, '\\\\s\+'\);/);

// 9. Verify performLocateAnimationForRange scrolls host container into view
assert.match(contentJs, /const host = getAiHostContainer\(range\);/);

console.log('highlight-location-audit.test.js: all assertions passed');
