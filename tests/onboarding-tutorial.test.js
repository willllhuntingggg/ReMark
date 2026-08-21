const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.resolve(__dirname, '../content/content.js'), 'utf8');
const sidepanel = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const storage = fs.readFileSync(path.resolve(__dirname, '../lib/storage.js'), 'utf8');
const i18n = fs.readFileSync(path.resolve(__dirname, '../lib/i18n.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../content/content.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));

// Three onboarding pages with carousel navigation and a replay entry point.
assert.match(content, /data-onboarding-page="text"/);
assert.match(content, /data-onboarding-page="video"/);
assert.match(content, /data-onboarding-page="find"/);
assert.match(content, /data-onboarding-text/);
assert.match(content, /onboardingFindPage\(\)/);
assert.match(content, /ob-find-panel/);
assert.match(content, /ob-find-mark-card/);
assert.match(content, /onboarding_page_dot', \{ page: 3 \}/);
assert.match(content, /showFirstUseGuide\(\{ manual: true \}\)/);
assert.match(content, /sendResponse\(\{ shown: Boolean\(shown\) \}\)/);
assert.match(content, /return true;\s*\}\s*else if \(msg\.action === 'RESTORE_HIGHLIGHTS'/);
assert.match(content, /remark-onboarding-prev/);
assert.match(content, /remark-onboarding-next/);
assert.match(content, /remark-onboarding-skip/);
assert.match(content, /remark-onboarding-done/);
assert.match(content, /dots\.forEach\(\(dot, i\) => dot\.addEventListener\('click', \(\) => showPage\(i\)\)\)/);
assert.match(content, /\{ mod: '⌘', mark: '⌘M', note: '⌘⇧\+M' \}/);
assert.match(content, /ob-mark-btn/);
assert.match(content, /ob-hand/);
assert.doesNotMatch(content, /ONBOARDING_CURSOR_DRAG_ICON/);
assert.match(content, /ONBOARDING_CURSOR_CLICK_ICON/);
assert.match(content, /class="ob-fa-icon"/);
assert.match(content, /class="ob-mark-pill remark-mark-actions is-visible"/);
assert.match(content, /class="remark-mark-action remark-mark-action--mark ob-mark-btn"/);
assert.match(content, /\$\{ONBOARDING_BLACK_MARK_PILL_ICON\}/);
assert.match(content, /ONBOARDING_BLACK_MARK_PILL_ICON = MARK_PILL_ICON\.replace/);
assert.match(content, /ob-click-ring/);
assert.match(content, /class="remark-mark-actions-anchor ob-text-action-anchor"/);
assert.match(content, /ONBOARDING_CURSOR_CLICK_ICON}<\/span>`/);
assert.match(content, /'<i class="ob-click-ring" aria-hidden="true"><\/i>'/);
assert.match(content, /viewBox="0 0 448 512"/); // Font Awesome hand-pointer
assert.doesNotMatch(content, /M302\.189 329\.126/);
assert.match(content, /M448 240v96/);
const onboardingHandSvg = content.slice(content.indexOf('const ONBOARDING_CURSOR_CLICK_ICON'), content.indexOf('function onboardingTextPage'));
assert.match(onboardingHandSvg, /fill="#ffffff" stroke="#000000"/);
assert.match(onboardingHandSvg, /style="fill:#ffffff!important;stroke:#000000!important"/);
assert.match(onboardingHandSvg, /stroke-width="18"/);
assert.doesNotMatch(onboardingHandSvg, /currentColor/);
assert.doesNotMatch(content, /ob-pill/);
assert.match(content, /close\('skipped'\)/);
assert.match(content, /close\('completed'\)/);
assert.match(sidepanel, /action: 'REPLAY_ONBOARDING'/);
assert.match(sidepanel, /REPLAY_CONTENT_SCRIPT_FILES = \['lib\/i18n\.js', 'lib\/storage\.js', 'content\/content\.js'\]/);
assert.match(sidepanel, /isReplayReceiverUnavailable/);
assert.match(sidepanel, /chrome\.scripting\.executeScript/);
assert.match(sidepanel, /for \(const delay of \[0, 120, 360\]\)/);
assert.match(sidepanel, /result\?\.shown === false/);
assert.match(storage, /getOnboardingStatus/);
assert.match(storage, /setOnboardingStatus/);
assert.match(storage, /\['not_started', 'completed', 'skipped'\]/);

// The onboarding must be instructional only: it never persists Marks and
// never intercepts real Mark interactions anymore.
const onboardingRegion = content.slice(content.indexOf('function onboardingTextPage'), content.indexOf('function isInsideOnboardingModal'));
assert.doesNotMatch(onboardingRegion, /ReMarkStorage\.(addClip|addVideoMark|pushUndo|updateClip|updateVideoMark)/);
assert.doesNotMatch(content, /markOnboardingStep/);
assert.doesNotMatch(content, /isTutorialTextRange/);
assert.doesNotMatch(content, /options\.tutorialStep/);
assert.doesNotMatch(content, /onboardingTutorial && isVideoPage\(\)/);

// Copy uses "Select" (the user goal), never "Drag", and follows the spec.
const enOnboardingCopy = i18n.slice(i18n.indexOf("onboarding_text_title: 'Mark what matters'"), i18n.indexOf("onboarding_marked: 'Marked'"));
assert.match(enOnboardingCopy, /Select text, then click Mark\./);
assert.match(enOnboardingCopy, /Hold %%mod%% while selecting for faster marking\./);
assert.match(enOnboardingCopy, /Press %%mark%% on YouTube or Bilibili\./);
assert.match(enOnboardingCopy, /Add a note with %%note%%\./);
assert.doesNotMatch(enOnboardingCopy, /Drag/);
assert.match(i18n, /onboarding_text_sample_before: 'ReMark is '/);
assert.match(i18n, /onboarding_text_sample: 'a lightweight capture tool for people who encounter something worth remembering'/);
assert.match(i18n, /onboarding_text_sample_after: ' while reading webpages or watching videos\.'/);
const enFindCopy = i18n.slice(i18n.indexOf("onboarding_find_title: 'Find your Marks'"), i18n.indexOf("onboarding_marked: 'Marked'"));
assert.match(enFindCopy, /Open ReMark from the extension icon to see all your Marks\./);
assert.match(enFindCopy, /Click a Mark to jump back to where you found it\./);

// Title and description sit above the animation; only the hint stays below.
const textPageMarkup = content.slice(content.indexOf('function onboardingTextPage'), content.indexOf('function onboardingVideoPage'));
assert.ok(textPageMarkup.indexOf('<h2>') < textPageMarkup.indexOf('remark-onboarding-anim'));
assert.ok(textPageMarkup.indexOf('remark-onboarding-anim') < textPageMarkup.indexOf('remark-onboarding-hint'));
assert.ok(textPageMarkup.indexOf('ob-target-ink') < textPageMarkup.indexOf('ob-text-action-anchor'));
assert.ok(textPageMarkup.indexOf('ob-text-action-anchor') < textPageMarkup.indexOf('onboarding_text_sample_after'));
const videoPageMarkup = content.slice(content.indexOf('function onboardingVideoPage'), content.indexOf('async function showFirstUseGuide'));
assert.ok(videoPageMarkup.indexOf('<h2>') < videoPageMarkup.indexOf('remark-onboarding-anim'));
assert.ok(videoPageMarkup.indexOf('remark-onboarding-anim') < videoPageMarkup.indexOf('remark-onboarding-hint'));
const findPageMarkup = content.slice(content.indexOf('function onboardingFindPage'), content.indexOf('async function showFirstUseGuide'));
assert.ok(findPageMarkup.indexOf('<h2>') < findPageMarkup.indexOf('remark-onboarding-anim'));
assert.ok(findPageMarkup.indexOf('remark-onboarding-anim') < findPageMarkup.indexOf('remark-onboarding-hint'));
assert.match(findPageMarkup, /style="background-image:url\('\$\{chrome\.runtime\.getURL\('assets\/icons\/icon48\.png'\)\}'\)"/);
assert.match(findPageMarkup, /ob-find-extension/);
assert.match(findPageMarkup, /ob-find-panel-header/);
assert.deepEqual(manifest.web_accessible_resources, [{
  resources: ['assets/icons/icon48.png'],
  matches: ['<all_urls>']
}]);

// Both looping animations exist and reuse real ReMark visual language.
assert.doesNotMatch(css, /ob-text-cursor/);
assert.match(css, /animation: ob-video-flag 6\.5s linear infinite/);
assert.match(css, /@keyframes ob-text-ink/);
assert.match(css, /@keyframes ob-text-hand/);
assert.match(css, /@keyframes ob-mark-pill/);
assert.match(css, /@keyframes ob-text-click-ring/);
assert.match(css, /@keyframes ob-video-keypress/);
assert.match(css, /@keyframes ob-video-flag/);
assert.match(css, /\.remark-onboarding-anim--find\s*\{/);
assert.match(css, /\.ob-find-extension\s*\{[\s\S]*?animation: ob-find-extension 7\.5s linear infinite/);
assert.match(css, /\.ob-find-extension\s*\{[\s\S]*?background-color: transparent;[\s\S]*?background-size: 100% 100%/);
assert.doesNotMatch(css, /\.ob-find-extension img/);
assert.match(css, /\.ob-find-panel\s*\{[\s\S]*?animation: ob-find-panel 7\.5s/);
assert.match(css, /\.ob-find-mark-card\s*\{[\s\S]*?animation: ob-find-mark-card 7\.5s/);
assert.match(css, /@keyframes ob-find-document-scroll/);
assert.match(css, /@keyframes ob-find-source-highlight/);
assert.match(css, /\.ob-mark-pill\.remark-mark-actions\s*\{[\s\S]*?animation: ob-mark-pill/);
assert.match(css, /\.ob-mark-pill \.ob-mark-btn\s*\{[\s\S]*?pointer-events: none/);
assert.match(css, /\.ob-click-ring\s*\{[\s\S]*?animation: ob-text-click-ring/);
const tutorialPillBlock = css.slice(css.indexOf('.ob-mark-pill.remark-mark-actions {'), css.indexOf('.ob-mark-pill .ob-mark-btn'));
assert.match(tutorialPillBlock, /top: calc\(100% \+ \.1em\)/);
assert.match(tutorialPillBlock, /right: -\.1em/);
assert.match(tutorialPillBlock, /font-size: 15px/);
assert.match(tutorialPillBlock, /z-index: 12/);
assert.match(tutorialPillBlock, /border: 0/);
assert.match(css, /\.ob-mark-pill \.ob-mark-btn svg\s*\{[\s\S]*?width: 1\.36em/);
assert.match(css, /\.ob-mark-pill \.ob-mark-btn\s*\{[\s\S]*?background: rgb\(241, 222, 117\)/);
assert.match(css, /\.ob-mark-pill \.ob-mark-btn\s*\{[\s\S]*?color: #000/);
assert.match(css, /\.ob-mark-pill \.ob-mark-btn\s*\{[\s\S]*?box-shadow: none/);
assert.match(css, /\.ob-mark-pill \.ob-mark-btn svg\s*\{[\s\S]*?opacity: 1[\s\S]*?visibility: visible[\s\S]*?stroke: #000 !important/);
assert.match(css, /\.ob-mark-pill \.ob-mark-btn svg path\s*\{[\s\S]*?fill: #000 !important[\s\S]*?stroke: #000 !important/);
const pointerBlock = css.slice(css.indexOf('.ob-hand {'), css.indexOf('.ob-mark-pill.remark-mark-actions'));
assert.match(pointerBlock, /left: -20px/);
assert.match(pointerBlock, /top: 16px/);
assert.match(pointerBlock, /\.ob-hand \{[\s\S]*?color: #000/);
assert.match(css, /\.ob-hand svg path\s*\{[\s\S]*?fill: #fff !important[\s\S]*?stroke: #000 !important[\s\S]*?stroke-width: 18px !important/);
assert.match(pointerBlock, /\.ob-click-ring\s*\{[\s\S]*?left: -13px[\s\S]*?top: 16px/);
assert.match(pointerBlock, /\.ob-click-ring\s*\{[\s\S]*?border: 1\.5px solid var\(--remark-brand\)/);
assert.match(css, /30%, 40% \{ opacity: 1; transform: scale\(1\); \}/);
assert.match(css, /@keyframes ob-text-hand[\s\S]*?0%, 27% \{ opacity: 0; transform: scale\(1\); \}[\s\S]*?30%, 40% \{ opacity: 1; transform: scale\(1\); \}/);
assert.match(css, /@keyframes ob-mark-pill[\s\S]*?19%, 40% \{ opacity: 1/);
assert.match(css, /@keyframes ob-text-click-ring[\s\S]*?42% \{ opacity: 1/);
const textInkBlock = css.slice(css.indexOf('@keyframes ob-text-ink'), css.indexOf('@keyframes ob-text-hand'));
assert.match(textInkBlock, /13%, 42% \{ background: rgba\(86, 145, 255, \.34\)/);
assert.match(textInkBlock, /44%, 84% \{\s*background: var\(--remark-brand\);\s*color: #fff;\s*box-shadow: none/);
assert.match(css, /\.ob-context\s*\{\s*color: #3d4147;/);
assert.match(css, /\.ob-hand svg\s*\{[\s\S]*?width: 22px;/);
assert.match(css, /\.remark-onboarding-dots button\s*\{[\s\S]*?cursor: pointer/);
const closeBlock = css.slice(css.indexOf('.remark-onboarding-close {'), css.indexOf('.remark-onboarding-close:hover'));
assert.match(closeBlock, /z-index: 20/);

console.log('onboarding-tutorial.test.js: all assertions passed');
