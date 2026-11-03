// Pure helpers for the statistics page. A "cube" row is one combination of
// batch / device / orientation / replay screen / country / document type with its task counts.
import { batches } from './dashboard-data.js';

export const filterBatch = (rows, batch) => batch === 'all' ? rows : rows.filter(row => row.batch === batch);
export const deviceLabel = row => `${row.device_os} · ${row.device}`;

// Cross-filter dimensions: clicking a bar sets filters[dimension] = that bar's key.
export const DIMS = { device_os: row => row.device_os, orientation: row => row.orientation, replay_type: row => row.replay_type,
  device: deviceLabel, country: row => row.country, doc_type: row => row.doc_type };
// `skip` leaves one dimension out, so a chart still shows its own alternatives while it is the one being filtered.
export const applyFilters = (rows, filters, skip) => rows.filter(row => Object.entries(filters).every(([dim, value]) => dim === skip || DIMS[dim](row) === value));

// Sum counts per key, biggest first. Anything past `limit` groups is folded into "Ostalo".
export function group(rows, key, limit = Infinity) {
  const sums = new Map();
  for (const row of rows) {
    const name = typeof key === 'function' ? key(row) : row[key];
    const sum = sums.get(name) ?? { key: name, total: 0, done: 0 };
    sum.total += row.total;
    sum.done += row.done;
    sums.set(name, sum);
  }
  const list = [...sums.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  if (list.length <= limit) return list;
  const tail = list.slice(limit - 1);
  return [...list.slice(0, limit - 1), { key: 'Ostalo', total: tail.reduce((s, g) => s + g.total, 0), done: tail.reduce((s, g) => s + g.done, 0) }];
}

// Batch x device grid for the heatmap. Devices past `top` share one "Ostalo" column.
export function heat(rows, top = 8) {
  const devices = group(rows, deviceLabel, top).map(item => item.key);
  const label = row => devices.includes(deviceLabel(row)) ? deviceLabel(row) : 'Ostalo';
  const names = [...new Set(rows.map(row => row.batch))];
  const cells = new Map();
  for (const item of group(rows, row => `${row.batch}\0${label(row)}`)) cells.set(item.key, item);
  return { batches: names, devices, cell: (batch, device) => cells.get(`${batch}\0${device}`) };
}

const addDays = (date, amount) => new Date(Date.parse(date + 'T00:00:00Z') + amount * 864e5).toISOString().slice(0, 10);

// Captures per calendar day for the last `count` days that end on the latest day with data.
export function lastDays(days, batch, count = 30) {
  const rows = days.filter(item => batch === 'all' || item.batch === batch);
  if (!rows.length) return [];
  const byDate = new Map();
  for (const item of rows) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.count);
  const end = [...byDate.keys()].sort().at(-1);
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(end, index - count + 1);
    return { date, count: byDate.get(date) ?? 0 };
  });
}

export function pace(days, batch, today) {
  const series = lastDays(days, batch, 3650).filter(item => item.count);
  const total = series.reduce((sum, item) => sum + item.count, 0);
  return { today: series.find(item => item.date === today)?.count ?? 0, average: series.length ? total / series.length : 0, activeDays: series.length };
}

// ---- Demo data (derived from the dashboard demo batches so both pages agree) ----
const SHARES = [.35, .3, .2, .15];
const DEVICES = [['Android', 'Google Pixel 8a'], ['Android', 'Samsung Galaxy S23'], ['iOS', 'iPhone 15'], ['iOS', 'iPhone 13']];
const ORIENTATIONS = ['Portrait', 'Landscape'], REPLAYS = ['Monitor', 'Laptop', 'Tablet'];
const COUNTRIES = ['usa', 'canada', 'italy', 'malaysia', 'philippines'], DOCS = ['driver_license', 'id_card', 'passport'];

export const demoCube = batches.flatMap((batch, i) => DEVICES.flatMap(([os, model], d) => ORIENTATIONS.map((orientation, o) => {
  const share = SHARES[(d + i) % 4] * (o ? .4 : .6);
  return { batch: batch.name, device_os: os, device: model, orientation, replay_type: REPLAYS[(i + d + o) % 3], country: COUNTRIES[(i + o) % 5],
    doc_type: DOCS[(d + o) % 3], total: Math.round(batch.total * share), done: Math.round(batch.captured * share) };
})));

export function demoDays(today = new Date()) {
  return batches.flatMap((batch, i) => {
    if (!batch.captured) return [];
    const length = 5 + i % 8;
    let left = batch.captured;
    return Array.from({ length }, (_, j) => {
      const count = j === length - 1 ? left : Math.min(left, Math.round(batch.captured / length * (.6 + (j * 7 + i) % 5 / 5)));
      left -= count;
      const date = new Date(today);
      date.setDate(date.getDate() - (length - 1 - j) - i % 3);
      return { date: date.toISOString().slice(0, 10), batch: batch.name, count };
    });
  });
}
