import { batches as demoBatches, totals, filterBatches, percentage } from './dashboard-data.js';
import { createTextReport } from './dashboard-report.js';
import { ApiClient } from './api.js';

const $ = id => document.getElementById(id);
const number = value => value === null ? '—' : new Intl.NumberFormat('sr-Latn-RS').format(value);
const percent = (value, total) => value === null ? 'Nije dostupno' : `${percentage(value, total).toFixed(2).replace('.', ',')}%`;
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let batches = demoBatches;
let demo = true;

function progress(value, total) {
  return `<div class="capture-progress"><progress value="${value}" max="${total || 1}" aria-label="Capture napredak"></progress><span>${percent(value, total)}</span></div>`;
}

function rowCells(row) {
  return `<td>${number(row.total)}</td><td>${number(row.captured)}</td><td>${number(row.labelled)}</td><td>${number(row.validated)}</td><td>${number(row.recaptures)}</td><td>${progress(row.captured, row.total)}</td><td>${percent(row.labelled, row.total)}</td><td>${percent(row.validated, row.total)}</td>`;
}

function renderSummary() {
const project = totals(batches);
const metrics = [
  ['Ukupno zadataka', project.total, `${batches.length} batch-eva`, 'neutral', null],
  ['Captured', project.captured, `${percent(project.captured, project.total)} ukupnih zadataka`, 'purple', 'captured'],
  ['Labelled', project.labelled, `${percent(project.labelled, project.total)} ukupnih zadataka`, 'blue', 'labelled'],
  ['Validated', project.validated, `${percent(project.validated, project.total)} ukupnih zadataka`, 'green', 'validated'],
];
$('summary').innerHTML = metrics.map(([label, value, note, color, key]) => `<article class="metric ${color}"><p>${label}</p><strong>${number(value)}</strong><span>${note}</span>${key && value !== null ? `<progress value="${value}" max="${project.total}" aria-label="${label}"></progress>` : '<div class="metric-placeholder"></div>'}</article>`).join('');
$('active-count').textContent = `${batches.filter(row => row.captured > 0 && row.captured < row.total).length} batch-eva u toku`;
}

function render() {
  const rows = filterBatches(batches, $('search').value, $('status-filter').value);
  $('result-count').textContent = `${rows.length} od ${batches.length} batch-eva`;
  $('batch-rows').innerHTML = rows.map(row => `<tr><th scope="row"><span class="batch-dot ${row.captured ? 'started' : ''}"></span>${escape(row.name)}</th>${rowCells(row)}</tr>`).join('');
  $('batch-totals').innerHTML = rows.length ? `<tr><th scope="row">Ukupno prikazano</th>${rowCells(totals(rows))}</tr>` : '';
  $('empty-state').hidden = rows.length > 0;
}

$('search').addEventListener('input', render);
$('status-filter').addEventListener('change', render);
$('copy-report').addEventListener('click', async () => {
  const button = $('copy-report');
  button.disabled = true;
  $('report-status').hidden = false;
  try {
    await navigator.clipboard.writeText(createTextReport(batches, { demo }));
    $('report-status').textContent = 'Izveštaj za ceo projekat je kopiran. Nalepi ga pomoću Ctrl+V.';
  } catch {
    $('report-status').textContent = 'Kopiranje nije uspelo. Dozvoli pristup clipboard-u i otvori dashboard preko localhost adrese.';
  } finally { button.disabled = false; }
});
async function initialize() {
  let mode;
  try { mode = sessionStorage.getItem('onscreen.mode'); } catch { /* Optional preference. */ }
  if (mode === 'api') {
    demo = false;
    batches = [];
    document.querySelector('.demo-badge').textContent = 'LOKALNI EXCEL';
    try {
      const data = await new ApiClient().request('reports/dashboard');
      batches = data.batches;
      document.querySelector('.notice').textContent = `Izvor: ${data.workbook_path} · Učitano: ${new Date(data.updated_at).toLocaleString('sr-Latn-RS')}. Za nove podatke osveži stranicu.`;
    } catch (error) {
      document.querySelector('.notice').textContent = error.message;
      $('copy-report').disabled = true;
    }
  }
  renderSummary();
  render();
}
initialize();
