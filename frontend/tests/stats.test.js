import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, demoCube, demoDays, deviceLabel, filterBatch, group, heat, lastDays, pace } from '../stats-data.js';
import { totals, batches } from '../dashboard-data.js';

test('demo cube agrees with the dashboard demo totals', () => {
  const sum = demoCube.reduce((s, row) => ({ total: s.total + row.total, done: s.done + row.done }), { total: 0, done: 0 });
  assert.ok(Math.abs(sum.total - totals(batches).total) < 60);
  assert.ok(Math.abs(sum.done - totals(batches).captured) < 60);
  assert.ok(demoCube.every(row => row.done <= row.total));
  assert.deepEqual([...new Set(demoCube.map(row => row.device_os))].sort(), ['Android', 'iOS']);
});

test('group sums, sorts and folds the tail into Ostalo', () => {
  const rows = [{ k: 'a', total: 5, done: 1 }, { k: 'b', total: 9, done: 9 }, { k: 'a', total: 1, done: 0 }, { k: 'c', total: 2, done: 1 }, { k: 'd', total: 1, done: 1 }];
  assert.deepEqual(group(rows, 'k').map(g => [g.key, g.total, g.done]), [['b', 9, 9], ['a', 6, 1], ['c', 2, 1], ['d', 1, 1]]);
  assert.deepEqual(group(rows, 'k', 2).map(g => [g.key, g.total, g.done]), [['b', 9, 9], ['Ostalo', 9, 3]]);
  assert.equal(filterBatch(demoCube, 'batch_03').every(row => row.batch === 'batch_03'), true);
});

test('heat grid keeps batches, folds extra devices, leaves missing cells empty', () => {
  const grid = heat(demoCube, 3);
  assert.equal(grid.batches.length, 20);
  assert.equal(grid.devices.length, 3);
  assert.ok(grid.devices.includes('Ostalo'));
  assert.ok(grid.cell('batch_01', grid.devices[0]).total > 0);
  assert.equal(grid.cell('nope', 'nope'), undefined);
  assert.equal(deviceLabel({ device_os: 'iOS', device: 'iPhone 15' }), 'iOS · iPhone 15');
});

test('daily series is continuous and pace averages only active days', () => {
  const days = [{ date: '2026-11-01', batch: 'a', count: 10 }, { date: '2026-11-03', batch: 'a', count: 20 }, { date: '2026-11-03', batch: 'b', count: 5 }];
  const series = lastDays(days, 'all', 5);
  assert.deepEqual(series.map(d => d.count), [0, 0, 10, 0, 25]);
  assert.equal(series.at(-1).date, '2026-11-03');
  assert.deepEqual(lastDays(days, 'b', 3).map(d => d.count), [0, 0, 5]);
  assert.deepEqual(pace(days, 'all', '2026-11-03'), { today: 25, average: 17.5, activeDays: 2 });
  assert.deepEqual(lastDays([], 'all'), []);
  assert.equal(demoDays().reduce((s, d) => s + d.count, 0), totals(batches).captured);
});

test('cross-filters narrow rows but skip the chart being filtered', () => {
  const rows = [
    { device_os: 'Android', device: 'Pixel', orientation: 'Portrait', replay_type: 'Monitor', country: 'usa', doc_type: 'id', total: 4, done: 1 },
    { device_os: 'iOS', device: 'iPhone', orientation: 'Landscape', replay_type: 'Monitor', country: 'usa', doc_type: 'id', total: 2, done: 2 },
  ];
  assert.equal(applyFilters(rows, {}, null).length, 2);
  assert.equal(applyFilters(rows, { device_os: 'iOS' }, null).length, 1);
  assert.equal(applyFilters(rows, { device_os: 'iOS' }, 'device_os').length, 2);
  assert.equal(applyFilters(rows, { device_os: 'iOS', orientation: 'Portrait' }, null).length, 0);
  assert.equal(applyFilters(rows, { device: 'Android · Pixel' }, null).length, 1);
});
