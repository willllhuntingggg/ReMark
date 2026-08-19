const assert = require('assert').strict;

const values = new Map();
global.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const storage = require('../lib/storage.js');

async function expectReject(task, message) {
  await assert.rejects(task, (error) => error?.message === message);
}

async function main() {
  await storage.set(storage.KEYS.CLIPS, [{ id: 'clip_keep', text: 'local', createdAt: 10, updatedAt: 10 }]);
  await storage.set(storage.KEYS.VIDEO_MARKS, [{ id: 'vmark_keep', time: 4, createdAt: 10 }]);
  await storage.set(storage.KEYS.SETTINGS, { defaultColor: '#111111', theme: 'dark', onboardingSeen: true });

  const exported = await storage.createBackup();
  assert.equal(exported.version, 1);
  assert.ok(!Number.isNaN(Date.parse(exported.exportedAt)));
  assert.deepEqual(Object.keys(exported.data).sort(), [storage.KEYS.CLIPS, storage.KEYS.SETTINGS, storage.KEYS.VIDEO_MARKS].sort());
  assert.equal(exported.data[storage.KEYS.SETTINGS].onboardingSeen, undefined);
  assert.equal(exported.data[storage.KEYS.SETTINGS].onboardingStatus, undefined);
  // Legacy `onboardingSeen` installs are treated as skipped.
  assert.equal(await storage.getOnboardingStatus(), 'skipped');
  await storage.setOnboardingStatus('not_started');
  assert.equal(await storage.getOnboardingStatus(), 'not_started');
  await storage.setOnboardingStatus('completed');
  assert.equal(await storage.getOnboardingStatus(), 'completed');
  await storage.setOnboardingStatus('skipped');
  assert.equal(await storage.getOnboardingStatus(), 'skipped');
  await expectReject(() => storage.setOnboardingStatus('other'), 'INVALID_ONBOARDING_STATUS');

  const importable = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      [storage.KEYS.CLIPS]: [
        { id: 'clip_keep', text: 'newer imported value', createdAt: 10, updatedAt: 20 },
        { id: 'clip_added', text: 'added', createdAt: 30 }
      ],
      [storage.KEYS.VIDEO_MARKS]: [
        { id: 'vmark_keep', time: 4, createdAt: 10 },
        { id: 'vmark_added', time: 12, createdAt: 30 }
      ],
      [storage.KEYS.SETTINGS]: { defaultColor: '#222222', theme: 'light' }
    }
  };

  const first = await storage.importBackup(importable);
  assert.deepEqual(first, { added: 2, updated: 1 });
  assert.equal((await storage.getClips()).length, 2);
  assert.equal((await storage.getVideoMarks()).length, 2);
  assert.equal((await storage.getClips()).find((item) => item.id === 'clip_keep').text, 'newer imported value');
  assert.equal((await storage.getSettings()).defaultColor, '#111111');

  const second = await storage.importBackup(importable);
  assert.deepEqual(second, { added: 0, updated: 0 });
  assert.equal((await storage.getClips()).length, 2);
  assert.equal((await storage.getVideoMarks()).length, 2);

  const beforeFailure = JSON.stringify(await storage.getBackupData());
  await expectReject(() => storage.importBackup({ version: 1, exportedAt: 'not a date', data: {} }), 'INVALID_BACKUP');
  await expectReject(() => storage.importBackup({ ...importable, version: 2 }), 'UNSUPPORTED_BACKUP_VERSION');
  assert.equal(JSON.stringify(await storage.getBackupData()), beforeFailure);

  console.log('storage-backup.test.js: all assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
