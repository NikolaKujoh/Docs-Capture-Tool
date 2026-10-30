import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyReport, dailySummary } from '../daily-report.js';
import { DemoClient } from '../api.js';

const now = new Date(2026, 9, 29, 18);
const row = (hour, minute, batch = 'batch_10') => ({ batch, status: 'DONE', timestamp: new Date(2026, 9, 29, hour, minute).toISOString() });

test('daily report counts saved DONE across batches and sorts timestamps', () => {
  const records = [row(14, 45, 'batch_11'), row(9, 15), row(10, 30),
    { ...row(11, 0), status: 'TO DO' },
    { batch: 'batch_10', status: 'DONE', timestamp: new Date(2026, 9, 28, 15).toISOString() }];
  const summary = dailySummary(records, now);
  assert.equal(summary.count, 3);
  assert.equal(summary.elapsedSeconds, 19800);
  assert.equal(summary.first.getHours(), 9);
  assert.equal(summary.last.getHours(), 14);
  assert.equal(summary.byBatch.get('batch_10'), 2);
  const report = createDailyReport(records, { now });
  assert.match(report, /5 h 30 min 0 s \(5,50 sati\)/);
  assert.match(report, /batch_11: 1/);
});

test('empty day, single capture and invalid timestamps are explicit', () => {
  assert.match(createDailyReport([], { now }), /Danas nema sačuvanih capture-a/);
  assert.match(createDailyReport([row(9, 0)], { now }), /Za jedan capture/);
  const report = createDailyReport([{ status: 'DONE', timestamp: '' }, { status: 'DONE', timestamp: 46000 }], { now, demo: true });
  assert.match(report, /nisu uračunati\): 2/);
  assert.match(report, /DEMO/);
  assert.throws(() => createDailyReport(undefined), /nedostaju podaci/);
});

test('timestamps follow local day boundaries rather than their UTC date', () => {
  const midnight = new Date(2026, 9, 29, 0, 0);
  const previous = new Date(midnight.getTime() - 1);
  const summary = dailySummary([
    { ...row(0, 0), timestamp: midnight.toISOString() },
    { ...row(0, 0), timestamp: previous.toISOString() },
  ], now);
  assert.equal(summary.count, 1);
});

test('demo report reads persisted completion times after reopening', async () => {
  let saved = null;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const client = new DemoClient(storage);
  await client.complete((await client.getBatch('batch_10')).task);
  const { records } = await new DemoClient(storage).getCaptureRecords();
  assert.equal(dailySummary(records).count, 1);
});
