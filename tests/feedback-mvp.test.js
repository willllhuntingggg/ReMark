const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const html = read('sidepanel/sidepanel.html');
const sidepanel = read('sidepanel/sidepanel.js');
const css = read('sidepanel/sidepanel.css');
const i18n = read('lib/i18n.js');

assert.match(html, /id="feedback-open"[\s\S]*data-i18n="feedback"/);
assert.match(html, /id="feedback-modal"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
assert.match(html, /id="feedback-type"[\s\S]*feedback_type_bug[\s\S]*feedback_type_feature[\s\S]*feedback_type_other/);
assert.match(html, /id="feedback-message"[\s\S]*data-i18n-placeholder="feedback_placeholder"/);
assert.match(html, /id="feedback-submit"[\s\S]*data-i18n="feedback_send"/);
assert.match(html, /id="feedback-form"[\s\S]*novalidate/);
assert.match(html, /id="feedback-fallback"[\s\S]*id="feedback-recipient"[\s\S]*id="feedback-fallback-body"[\s\S]*id="feedback-copy-email"/);
assert.doesNotMatch(html, /feedback-open-email/);

assert.match(sidepanel, /const FEEDBACK_RECIPIENT = 'xuzijian2222@gmail\.com'/);
assert.match(sidepanel, /async function feedbackContext\(\)[\s\S]*chrome\.tabs\.query\(\{ active: true, lastFocusedWindow: true \}\)[\s\S]*chrome\.runtime\.getManifest\(\)\.version[\s\S]*navigator\.userAgent[\s\S]*domain[\s\S]*pageUrl/);
assert.match(sidepanel, /function feedbackEmailDraft\(type, message, context\)[\s\S]*feedback_context_version[\s\S]*feedback_context_browser[\s\S]*feedback_context_domain[\s\S]*feedback_context_url/);
assert.match(sidepanel, /function gmailComposeUrl\(draft\)[\s\S]*searchParams\.set\('to', FEEDBACK_RECIPIENT\)[\s\S]*searchParams\.set\('su', draft\.subject\)[\s\S]*searchParams\.set\('body', draft\.body\)[\s\S]*searchParams\.set\('tf', 'cm'\)/);
assert.match(sidepanel, /async function sendFeedback\(\)[\s\S]*feedbackFallbackBody\.value[\s\S]*feedbackFallback\.hidden = false[\s\S]*chrome\.tabs\.create\(\{ url: gmailComposeUrl\(draft\), active: true \}\)/);
assert.match(sidepanel, /const feedbackActions = \$\('\.feedback-actions', feedbackForm\)/);
assert.match(sidepanel, /function openFeedback\(\)[\s\S]*feedbackActions\.hidden = false/);
assert.match(sidepanel, /feedbackFallback\.hidden = false;[\s\S]*feedbackActions\.hidden = true/);
assert.match(sidepanel, /setFeedbackStatus\(t\('feedback_preparing'\)\)[\s\S]*feedbackFallback\.scrollIntoView[\s\S]*setFeedbackStatus\(t\('feedback_ready'\)\)/);
assert.doesNotMatch(sidepanel, /mailto:|feedbackOpenEmail/);
assert.match(sidepanel, /async function copyFeedbackEmail\(\)[\s\S]*copyText\(payload\)[\s\S]*feedback_copied/);
assert.doesNotMatch(html, /feedback_context_note|feedback_disclosure/);
assert.match(sidepanel, /feedbackModal\.addEventListener\('click'[\s\S]*event\.target === feedbackModal/);
assert.match(sidepanel, /event\.key === 'Escape' && !feedbackModal\.hidden/);

assert.match(i18n, /feedback_type_bug: '问题反馈'/);
assert.match(i18n, /feedback_type_feature: 'Feature request'/);
assert.match(i18n, /feedback_context_url: '当前 URL'/);
assert.match(i18n, /feedback_context_url: 'Current URL'/);
assert.match(i18n, /feedback_ready: 'Gmail 写信页已打开/);
assert.match(i18n, /feedback_ready: 'Gmail compose is open/);
assert.match(css, /\.feedback-modal \{/);
assert.match(css, /\.feedback-dialog \{/);
assert.match(css, /\.feedback-fallback \{/);
assert.match(css, /\.feedback-actions\[hidden\] \{[\s\S]*display: none/);
assert.match(css, /\.feedback-modal \{[\s\S]*overflow-y: auto/);
assert.match(css, /\.feedback-dialog \{[\s\S]*max-height: calc\(100dvh - 28px\)[\s\S]*overflow-y: auto/);

console.log('feedback-mvp.test.js: all assertions passed');
