import test from 'node:test';
import assert from 'node:assert/strict';
import { batchProgress, CompletionGate, firstPending, fitSize, zoomAt } from '../core.js';
import { ApiClient, DemoClient } from '../api.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
};

test('resume follows Excel order and ignores status case/whitespace within chosen batch', () => {
  const tasks = [
    { batch: 'a', status: 'DONE', id: 1 },
    { batch: 'b', status: 'TO DO', id: 2 },
    { batch: 'a', status: ' to do ', id: 3 },
    { batch: 'a', status: 'TO DO', id: 4 },
  ];
  assert.equal(firstPending(tasks, 'a').id, 3);
  assert.equal(firstPending(tasks, 'missing'), null);
  assert.deepEqual(batchProgress(tasks, 'a'), { total: 3, done: 1, pending: 2 });
});

test('demo completion persists and fresh client resumes at next task', async () => {
  const storage = memoryStorage();
  const first = new DemoClient(storage);
  const { task } = await first.getBatch('batch_10');
  assert.equal(task.unique_capture_index, '3146');
  const result = await first.complete(task);
  assert.equal(result.task.unique_capture_index, '3148');
  assert.equal((await new DemoClient(storage).getBatch('batch_10')).task.unique_capture_index, '3148');
  assert.equal((await first.getBatch('batch_11')).progress.done, 0);
});

test('failed save keeps original task pending', async () => {
  const client = new DemoClient({ getItem: () => null, setItem: () => { throw new Error('disk full'); } });
  const { task } = await client.getBatch('batch_10');
  await assert.rejects(client.complete(task), /čuvanje/);
  assert.equal((await client.getBatch('batch_10')).task.unique_capture_index, '3146');
  assert.equal(task.status, 'TO DO');
});

test('duplicate completion is idempotent and completed batch returns null', async () => {
  const client = new DemoClient(memoryStorage());
  const { task } = await client.getBatch('batch_11');
  await client.complete(task);
  const timestamp = task.timestamp;
  await client.complete(task);
  assert.equal(task.timestamp, timestamp);
  const next = await client.getBatch('batch_11');
  assert.equal(next.progress.done, 1);
  const final = await client.complete(next.task);
  assert.equal(final.task, null);
  assert.equal(final.progress.done, 2);
});

test('completion gate blocks overlapping calls and unlocks after failure', async () => {
  const gate = new CompletionGate();
  let release;
  let calls = 0;
  const action = gate.run(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  assert.equal(await gate.run(() => { calls++; }), null);
  assert.equal(calls, 1);
  release('saved');
  assert.equal(await action, 'saved');
  await assert.rejects(gate.run(() => { throw new Error('save failed'); }));
  assert.equal(await gate.run(() => 'retry'), 'retry');
});

test('image fitting preserves aspect ratio and zoom keeps pointed position anchored', () => {
  const size = fitSize(960, 540, 1000, 500);
  assert.ok(Math.abs(size.width / size.height - 960 / 540) < .00001);
  assert.ok(size.height <= 436 + 1e-9);
  const view = zoomAt({ x: 0, y: 0, scale: 1 }, 2, { x: 100, y: 50 });
  assert.deepEqual(view, { x: -100, y: -50, scale: 2 });
  assert.equal(zoomAt(view, 100, { x: 0, y: 0 }).scale, 5);
});

test('API sends task identity/revision and surfaces backend save errors', async () => {
  const previous = globalThis.fetch;
  let received;
  globalThis.fetch = async (url, options) => {
    received = { url, options };
    return { ok: false, json: async () => ({ detail: 'Excel je zaključan.' }) };
  };
  try {
    const api = new ApiClient();
    api.token = 'test-token';
    await assert.rejects(api.complete({ task_id: 'row/3146', batch: 'batch_10', revision: 'v1' }), /Excel je zaključan/);
    assert.equal(received.url, './api/tasks/row%2F3146/complete');
    assert.deepEqual(JSON.parse(received.options.body), { batch: 'batch_10', revision: 'v1' });
  } finally { globalThis.fetch = previous; }
});

test('firstPending puts skipped tasks last, oldest skip first', () => {
  const tasks = [1, 2, 3].map(id => ({ batch: 'a', status: 'TO DO', task_id: id }));
  assert.equal(firstPending(tasks, 'a', [1]).task_id, 2);
  assert.equal(firstPending(tasks, 'a', [2, 3, 1]).task_id, 2);
});

test('demo skip, back (focus) and undo', async () => {
  const storage = memoryStorage();
  const client = new DemoClient(storage);
  const first = (await client.getBatch('batch_10')).task;
  const skipped = await client.skip(first);
  assert.equal(skipped.task.unique_capture_index, '3148');
  assert.equal(skipped.progress.pending, 6);
  assert.equal((await client.getBatch('batch_10', {}, first.task_id)).task.skipped, true);
  await assert.rejects(client.getBatch('batch_10', {}, 'nope'), /izabranom skupu/);
  const done = await client.complete(skipped.task);
  assert.equal(done.progress.done, 1);
  await assert.rejects(client.skip(skipped.task), /TO DO/);
  const undone = await client.undo(skipped.task);
  assert.equal(undone.task.status, 'TO DO');
  assert.equal(undone.task.timestamp, '');
  assert.equal(undone.progress.done, 0);
  assert.equal((await new DemoClient(storage).getBatch('batch_10')).progress.done, 0);
});

test('API sends skip, undo and focus', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, body: options.body }); return { ok: true, json: async () => ({}) }; };
  try {
    const api = new ApiClient();
    api.token = 't';
    const task = { task_id: 'a', batch: 'b', revision: 'v' };
    await api.skip(task);
    await api.undo(task);
    await api.getBatch('b', { capture_device: 'x' }, 'a');
    assert.deepEqual(calls.map(call => call.url), ['./api/tasks/a/skip', './api/tasks/a/undo', './api/batches/b/current?capture_device=x&focus=a']);
    assert.deepEqual(JSON.parse(calls[0].body), { batch: 'b' });
    assert.deepEqual(JSON.parse(calls[1].body), { batch: 'b', revision: 'v' });
  } finally { globalThis.fetch = previous; }
});
