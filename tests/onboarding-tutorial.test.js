const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.resolve(__dirname, '../content/content.js'), 'utf8');
const sidepanel = fs.readFileSync(path.resolve(__dirname, '../sidepanel/sidepanel.js'), 'utf8');
const storage = fs.readFileSync(path.resolve(__dirname, '../lib/storage.js'), 'utf8');

assert.match(content, /data-onboarding-text/);
assert.match(content, /showFirstUseGuide\(\{ manual: true \}\)/);
assert.match(sidepanel, /action: 'REPLAY_ONBOARDING'/);
assert.match(storage, /getOnboardingStatus/);
assert.match(storage, /setOnboardingStatus/);
const textSandbox = content.slice(content.indexOf('if (options.tutorialStep)'), content.indexOf('const clipData'));
assert.match(textSandbox, /markOnboardingStep\(options\.tutorialStep\)/);
assert.doesNotMatch(textSandbox, /ReMarkStorage\.(addClip|pushUndo|updateClip)/);
const videoSandbox = content.slice(content.indexOf('if (onboardingTutorial && isVideoPage())'), content.indexOf('const marks = await ReMarkStorage.getVideoMarks'));
assert.match(videoSandbox, /markOnboardingStep\('video'\)/);
assert.doesNotMatch(videoSandbox, /ReMarkStorage\.(addVideoMark|pushUndo|updateVideoMark)/);

console.log('onboarding-tutorial.test.js: all assertions passed');
