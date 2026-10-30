import test from 'node:test';
import assert from 'node:assert/strict';
import { batches, totals, filterBatches, percentage } from '../dashboard-data.js';
import { createTextReport } from '../dashboard-report.js';

test('clipboard report includes overall counts and all batches with stage denominators', () => {
  const text = createTextReport(batches);
  assert.ok(text.includes('Trenutno capture-ovano: 1741/6384'));
  assert.ok(text.includes('Labelovano: 415/1741 capture-ovanih'));
  assert.ok(text.includes('batch_20: capture 0/144'));
  assert.ok(text.includes('DEMO'));
});

test('dashboard totals match supplied project snapshot', () => {
  assert.equal(batches.length, 20);
  assert.deepEqual(totals(batches), { total: 6384, captured: 1741, labelled: 415, validated: 0, recaptures: 0 });
  assert.equal(percentage(1741, 6384).toFixed(2), '27.27');
});

test('search combines with capture filters and empty totals stay valid', () => {
  assert.equal(filterBatches(batches, ' BATCH_10 ', 'active').length, 1);
  assert.equal(filterBatches(batches, 'batch_10', 'not-started').length, 0);
  assert.equal(filterBatches(batches, '', 'completed').length, 0);
  assert.equal(filterBatches(batches, '', 'active').length, 9);
  assert.equal(percentage(0, 0), 0);
  assert.equal(totals([]).total, 0);
});
