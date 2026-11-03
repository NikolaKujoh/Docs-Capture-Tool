import { ApiClient } from './api.js';
import { applyFilters, demoCube, demoDays, deviceLabel, filterBatch, group, heat, lastDays, pace } from './stats-data.js';

const $ = id => document.getElementById(id);
const fmt = value => new Intl.NumberFormat('sr-Latn-RS').format(Math.round(value));
const pct = (done, total) => total ? Math.round(done / total * 100) : 0;
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const osColor = key => key.startsWith('Android') ? 'var(--series-1)' : key.startsWith('iOS') ? 'var(--series-2)' : 'var(--muted)';
const teal = () => 'var(--primary)';
const DIM_NAMES = { device_os: 'OS', orientation: 'Položaj', replay_type: 'Replay', device: 'Uređaj', country: 'Država', doc_type: 'Dokument' };
let data = { cube: demoCube, days: demoDays() };
let filters = {};

// One row per group: the track length shows how many tasks exist, the solid part how many are captured.
// Clicking a row filters every other chart (Power BI style); the picked row stays bright, the rest dim.
function bars(groups, dim, color = teal) {
  const max = Math.max(1, ...groups.map(item => item.total));
  const picked = filters[dim];
  return `<div class="bars">${groups.map(item => {
    const text = `${item.key}: ${fmt(item.done)} od ${fmt(item.total)} (${pct(item.done, item.total)}%)` + (item.key === 'Ostalo' ? '' : ' · klikni za filter');
    const state = picked === undefined ? '' : picked === item.key ? ' on' : ' dim';
    const attrs = item.key === 'Ostalo' ? '' : ` data-dim="${dim}" data-key="${esc(item.key)}" role="button" tabindex="0" aria-pressed="${picked === item.key}"`;
    return `<div class="bar-row${state}"${attrs} title="${esc(text)}"><span class="bar-label">${esc(item.key)}</span><div class="bar-area"><div class="bar-track" style="width:${item.total / max * 100}%"><div class="bar-fill" style="width:${pct(item.done, item.total)}%;background:${color(item.key)}"></div></div></div><span class="bar-value">${fmt(item.done)} / ${fmt(item.total)} <b>${pct(item.done, item.total)}%</b></span></div>`;
  }).join('')}</div>`;
}

const legend = items => `<div class="legend">${items.map(([name, color]) => `<span><i style="background:${color}"></i>${name}</span>`).join('')}<span class="legend-note">puna boja = snimljeno · svetla pozadina = preostalo</span></div>`;
const card = (title, note, body, span = '') => `<article class="card ${span}"><header><h2>${title}</h2><p class="muted">${note}</p></header>${body}</article>`;

function heatmap(rows) {
  const grid = heat(rows);
  const head = grid.devices.map(device => `<th scope="col">${esc(device)}</th>`).join('');
  const body = grid.batches.map(batch => `<tr><th scope="row">${esc(batch)}</th>${grid.devices.map(device => {
    const cell = grid.cell(batch, device);
    if (!cell?.total) return '<td class="empty" title="Nema zadataka">·</td>';
    const p = pct(cell.done, cell.total);
    return `<td class="${p > 55 ? 'strong' : ''}" style="--p:${p}" title="${esc(`${batch} · ${device}: ${fmt(cell.done)} od ${fmt(cell.total)}`)}">${p}%</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="heat-scroll" tabindex="0" role="region" aria-label="Batch po uređaju, horizontalno pomeranje"><table class="heat"><thead><tr><th scope="col">Batch</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function daysChart(series) {
  if (!series.length) return '<p class="muted">Još nema završenih capture-a sa upisanim vremenom.</p>';
  const [W, H, left, bottom, top] = [720, 190, 36, 24, 10];
  const peak = Math.max(1, ...series.map(item => item.count));
  const step = 10 ** Math.floor(Math.log10(peak));
  const max = Math.ceil(peak / step) * step;
  const slot = (W - left) / series.length;
  const y = value => H - bottom - value / max * (H - bottom - top);
  const label = date => date.slice(8) + '.' + date.slice(5, 7) + '.';
  const grid = [0, max / 2, max].map(value => `<line x1="${left}" x2="${W}" y1="${y(value)}" y2="${y(value)}" class="grid"/><text x="${left - 6}" y="${y(value) + 4}" text-anchor="end">${fmt(value)}</text>`).join('');
  const columns = series.map((item, index) => item.count ? `<rect x="${left + index * slot + 2}" y="${y(item.count)}" width="${Math.max(2, slot - 4)}" height="${H - bottom - y(item.count)}" rx="3"><title>${label(item.date)}: ${fmt(item.count)} capture-a</title></rect>` : '').join('');
  const ticks = [0, Math.floor(series.length / 2), series.length - 1].map((index, i) => `<text x="${left + index * slot + slot / 2}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${label(series[index].date)}</text>`).join('');
  return `<svg class="days" viewBox="0 0 ${W} ${H}" role="img" aria-label="Broj capture-a po danu, poslednjih ${series.length} dana">${grid}${columns}${ticks}</svg>`;
}

// Tiny trend line for a KPI tile; no axes, the number beside it is the message.
function spark(series) {
  const peak = Math.max(1, ...series.map(item => item.count));
  const points = series.map((item, index) => `${(index / Math.max(1, series.length - 1) * 100).toFixed(1)},${(26 - item.count / peak * 24).toFixed(1)}`).join(' ');
  return series.length ? `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label="Capture po danu, poslednjih ${series.length} dana"><polyline points="${points}"/></svg>` : '';
}

function kpis(rows, batch) {
  const done = rows.reduce((sum, row) => sum + row.done, 0), total = rows.reduce((sum, row) => sum + row.total, 0);
  const speed = pace(data.days, batch, new Date().toLocaleDateString('sv-SE'));
  const left = total - done;
  const tiles = [
    ['Snimljeno', `${fmt(done)} <small>/ ${fmt(total)}</small>`, `<progress value="${done}" max="${total || 1}" aria-label="Snimljeno"></progress>`, 'hero'],
    ['Završeno', `${pct(done, total)}%`, `${fmt(left)} preostalo`],
    ['Danas', fmt(speed.today), 'capture-a od ponoći'],
    ['Prosek po danu', fmt(speed.average), `${speed.activeDays} radnih dana sa capture-om` + spark(lastDays(data.days, batch, 14))],
    ['Procena do kraja', speed.average ? `~${fmt(Math.ceil(left / speed.average))}` : '—', speed.average ? 'radnih dana tekućim tempom' : 'nema dovoljno podataka'],
  ];
  $('kpis').innerHTML = tiles.map(([label, value, note, kind = '']) => `<article class="kpi ${kind}"><p>${label}</p><strong>${value}</strong><span>${note}</span></article>`).join('');
}

function render() {
  const batch = $('batch-filter').value;
  const base = filterBatch(data.cube, batch);
  const view = skip => applyFilters(base, filters, skip);   // every chart ignores only its own filter
  const scope = batch === 'all' ? 'svi batchevi' : batch;
  kpis(view(), batch);
  const chosen = Object.entries(filters);
  $('chips').hidden = !chosen.length;
  $('chips').innerHTML = chosen.map(([dim, value]) => `<button type="button" class="chip-filter" data-clear="${dim}" aria-label="Ukloni filter ${DIM_NAMES[dim]} ${esc(value)}">${DIM_NAMES[dim]}: <b>${esc(value)}</b> ✕</button>`).join('') + '<button type="button" class="button" data-clear="all">Poništi filtere</button>';
  const osLegend = legend([['Android', 'var(--series-1)'], ['iOS', 'var(--series-2)']]);
  $('cards').innerHTML = [
    card('Po operativnom sistemu', `Samo Android i iOS · ${scope}`, osLegend + bars(group(view('device_os'), 'device_os'), 'device_os', osColor), 'third'),
    card('Položaj telefona', `Portrait i Landscape · ${scope}`, bars(group(view('orientation'), 'orientation'), 'orientation'), 'third'),
    card('Replay ekran', `Monitor, laptop, tablet · ${scope}`, bars(group(view('replay_type'), 'replay_type'), 'replay_type'), 'third'),
    card('Po uređaju', `Svaki capture uređaj · ${scope}`, osLegend + bars(group(view('device'), deviceLabel), 'device', osColor), 'full'),
    card('Po državi', `Prvih 8 · ${scope}`, bars(group(view('country'), 'country', 8), 'country'), 'half'),
    card('Po tipu dokumenta', `Prvih 8 · ${scope}`, bars(group(view('doc_type'), 'doc_type', 8), 'doc_type'), 'half'),
    ...(batch === 'all' ? [card('Batch po uređaju', 'Tamnija boja = veći deo snimljen. Prazno mesto = batch nema taj uređaj.', heatmap(view()), 'full')] : []),
    card('Capture po danu', `Poslednjih 30 dana · ${scope} · prati samo batch filter`, daysChart(lastDays(data.days, batch)), 'full'),
  ].join('');
}

// One delegated listener: click or Enter/Space on a bar toggles its filter; chips remove them.
function toggle(target) {
  const row = target.closest('[data-dim]'), clear = target.closest('[data-clear]');
  if (row) {
    const { dim, key } = row.dataset;
    if (filters[dim] === key) delete filters[dim]; else filters[dim] = key;
  } else if (clear) {
    if (clear.dataset.clear === 'all') filters = {}; else delete filters[clear.dataset.clear];
  } else return false;
  render();
  if (row) document.querySelector(`[data-dim="${row.dataset.dim}"][data-key="${CSS.escape(row.dataset.key)}"]`)?.focus();   // re-render drops focus
  return true;
}
document.addEventListener('click', event => toggle(event.target));
document.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('[data-dim]') && toggle(event.target)) event.preventDefault();
});

async function initialize() {
  let mode;
  try { mode = sessionStorage.getItem('onscreen.mode'); } catch { /* Optional preference. */ }
  if (mode === 'api') {
    document.querySelector('.demo-badge').textContent = 'LOKALNI EXCEL';
    try {
      const stats = await new ApiClient().request('reports/stats');
      data = stats;
      $('notice').textContent = `Izvor: ${stats.workbook_path} · Učitano: ${new Date(stats.updated_at).toLocaleString('sr-Latn-RS')}. Za nove podatke osveži stranicu.`;
    } catch (error) {
      data = { cube: [], days: [] };
      $('notice').textContent = error.message;
    }
  }
  const names = [...new Set(data.cube.map(row => row.batch))];
  $('batch-filter').innerHTML = '<option value="all">Svi batchevi</option>' + names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  $('batch-filter').addEventListener('change', render);
  render();
}
initialize();
