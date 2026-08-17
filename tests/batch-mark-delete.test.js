const assert = require('assert').strict;

const values = new Map();
global.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); }
};

const ReMarkStorage = require('../lib/storage.js');

async function run() {
  const clips = [{ id: 'clip-1' }, { id: 'clip-2' }, { id: 'clip-3' }];
  const videoMarks = [{ id: 'video-1' }, { id: 'video-2' }];
  await ReMarkStorage.set(ReMarkStorage.KEYS.CLIPS, clips);
  await ReMarkStorage.set(ReMarkStorage.KEYS.VIDEO_MARKS, videoMarks);

  const removedClips = await ReMarkStorage.deleteClips(['clip-1', 'clip-3']);
  const removedVideoMarks = await ReMarkStorage.deleteVideoMarks(['video-2']);
  assert.deepEqual(removedClips.map((item) => item.id), ['clip-1', 'clip-3']);
  assert.deepEqual(removedVideoMarks.map((item) => item.id), ['video-2']);
  assert.deepEqual((await ReMarkStorage.getClips()).map((item) => item.id), ['clip-2']);
  assert.deepEqual((await ReMarkStorage.getVideoMarks()).map((item) => item.id), ['video-1']);

  await ReMarkStorage.pushUndo({ type: 'delete_marks', clips: removedClips, videoMarks: removedVideoMarks });
  assert.equal(await ReMarkStorage.undoLast(), true);
  assert.deepEqual((await ReMarkStorage.getClips()).map((item) => item.id).sort(), ['clip-1', 'clip-2', 'clip-3']);
  assert.deepEqual((await ReMarkStorage.getVideoMarks()).map((item) => item.id).sort(), ['video-1', 'video-2']);
  console.log('batch-mark-delete.test.js: all assertions passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
