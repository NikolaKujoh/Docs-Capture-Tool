import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, DemoClient } from '../api.js';
import { equipmentKey } from '../equipment-filters.js';

const client = () => new DemoClient({ getItem: () => null, setItem: () => {} });
const ios = equipmentKey('iOS', 'iPhone 15');
const tablet = equipmentKey('Tablet', 'iPad Air');

test('combined filters preserve order and NEXT leaves other equipment pending', async () => {
  const demo = client();
  const filters = { capture_device: ios };
  const current = await demo.getBatch('batch_10', filters);
  assert.equal(current.task.unique_capture_index, '3242');
  assert.equal(current.progress.total, 2);
  assert.equal(current.filter_options.capture_devices.length, 2);
  assert.equal(current.filter_options.replay_screens.length, 2);
  const next = await demo.complete(current.task, filters);
  assert.equal(next.task.unique_capture_index, '3290');
  assert.equal(next.progress.done, 1);
  assert.equal((await demo.getBatch('batch_10')).task.unique_capture_index, '3146');
  const finished = await demo.complete(next.task, filters);
  assert.equal(finished.task, null);
  assert.equal(finished.progress.total, 2);
  assert.equal(finished.filter_options.capture_devices.length, 2);
});

test('incompatible equipment returns empty selection without modifying tasks', async () => {
  const demo = client();
  const result = await demo.getBatch('batch_10', {
    capture_device: equipmentKey('Android', 'Google Pixel 8a'), replay_screen: tablet,
  });
  assert.equal(result.task, null);
  assert.equal(result.progress.total, 0);
  assert.equal((await demo.getBatch('batch_10')).progress.pending, 6);
  assert.equal((await demo.getBatch('batch_10', { capture_device: ios, replay_screen: tablet })).task.unique_capture_index, '3290');
});

test('API encodes filters for current task and sends same filters with completion', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({}) };
  };
  try {
    const api = new ApiClient();
    api.token = 'test-token';
    const filters = { capture_device: ios, replay_screen: tablet };
    await api.getBatch('batch_10', filters);
    assert.equal(new URL(calls[0].url, 'http://localhost').searchParams.get('capture_device'), ios);
    await api.complete({ task_id: 'task', batch: 'batch_10', revision: 'r1' }, filters);
    assert.deepEqual(JSON.parse(calls[1].options.body).filters, filters);
  } finally { globalThis.fetch = previous; }
});
