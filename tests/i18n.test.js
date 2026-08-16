const assert = require('assert').strict;
const path = require('path');
const modulePath = path.resolve(__dirname, '../lib/i18n.js');

function load(language) {
  Object.defineProperty(global, 'navigator', {
    value: { language },
    configurable: true,
    writable: true
  });
  delete require.cache[modulePath];
  return require(modulePath);
}

let i18n = load('en-US');
assert.equal(i18n.locale, 'en');
assert.equal(i18n.t('settings'), 'Settings');
assert.equal(i18n.t('backup_imported', { added: 2, updated: 1 }), 'Backup imported successfully. 2 added; 1 updated.');
assert.equal(i18n.t('onboarding_title'), 'Try ReMark');
assert.equal(i18n.t('onboarding_try_youtube'), 'Try on YouTube');
assert.equal(i18n.t('help_replay_tutorial'), 'Replay the tutorial');

i18n = load('zh-CN');
assert.equal(i18n.locale, 'zh');
assert.equal(i18n.t('settings'), '设置');
assert.equal(i18n.t('export_backup'), '导出备份');
assert.equal(i18n.t('onboarding_title'), '试试 ReMark');
assert.equal(i18n.t('help_replay_tutorial'), '重新播放教学');


i18n = load('zh-TW');
assert.equal(i18n.locale, 'zh');
assert.equal(i18n.t('settings'), '设置');
i18n = load('zh-HK');
assert.equal(i18n.locale, 'zh');
assert.equal(i18n.t('import_backup'), '导入备份');

i18n = load('de-DE');
assert.equal(i18n.locale, 'en');
assert.equal(i18n.t('open_settings'), 'Open settings');

console.log('i18n.test.js: all assertions passed');
i18n = load('en-US');
i18n.setLocale('zh');
assert.equal(i18n.locale, 'zh');
assert.equal(i18n.t('more'), '更多');
i18n.setLocale('en');
assert.equal(i18n.locale, 'en');
assert.equal(i18n.t('language_system'), 'System default');
i18n.setLocale('system');
assert.equal(i18n.locale, 'en');
