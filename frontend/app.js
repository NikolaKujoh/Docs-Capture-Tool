import { ApiClient, DemoClient } from './api.js';
import { CompletionGate, isTodo, readable } from './core.js';
import { ImageViewer } from './viewer.js';
import { createDailyReport } from './daily-report.js';

const $ = id => document.getElementById(id);
const state = { client: null, task: null, batch: '', busy: false, ready: false, demo: false, retry: null, reporting: false, filters: {}, filterOptions: null, history: [], pending: 0 };
const gate = new CompletionGate();
const viewer = new ImageViewer({
  viewport: $('viewer'), image: $('document-image'), layer: $('image-layer'),
  message: $('viewer-message'), overlay: $('index-overlay'), zoomLabel: $('zoom-level'),
  onReady(ready, error) {
    state.ready = ready;
    updateControls();
    if (error) showError(error, () => viewer.load(state.task));
  },
});

function updateControls() {
  const enabled = state.ready && !state.busy && Boolean(state.task);
  $('index-size').disabled = !enabled;
  for (const id of ['next-task', 'toggle-index', 'zoom-in', 'zoom-out', 'fit-image', 'fullscreen']) $(id).disabled = !enabled;
  // Skip is for TO DO tasks, Undo for DONE ones (reached with Back); neither needs the image to be loaded.
  const idle = !state.busy && Boolean(state.task);
  $('skip-task').hidden = Boolean(state.task) && !isTodo(state.task.status);
  $('undo-task').hidden = !state.task || isTodo(state.task.status);
  $('skip-task').disabled = !idle || state.pending < 2;
  $('undo-task').disabled = !idle;
  document.querySelectorAll('[data-back]').forEach(button => { button.disabled = state.busy || !state.history.length; });
  $('batch-select').disabled = state.busy || !state.client;
  $('open-project').disabled = state.busy;
  $('retry').disabled = state.busy;
  $('copy-daily-report').disabled = !state.client || state.busy || state.reporting;
  for (const id of ['capture-device-select', 'replay-screen-select']) $(id).disabled = state.busy || !state.client || !state.filterOptions;
  $('swap-device').disabled = state.busy || !state.client || !state.filterOptions?.capture_devices?.length;
  $('clear-filters').disabled = state.busy || !Object.values(state.filters).some(Boolean);
}

function setBusy(busy) { state.busy = busy; updateControls(); }
function clearError() { $('error-banner').hidden = true; state.retry = null; }
function showError(error, retry) {
  $('error-message').textContent = error.message || 'Došlo je do greške.';
  $('error-banner').hidden = false;
  state.retry = retry;
  $('retry').hidden = !retry;
}

function renderBatch(data) {
  if (!data?.progress || !('task' in data)) throw new Error('Neispravan odgovor backend-a: nedostaju task/progress.');
  clearError();
  state.task = data.task;
  const { done, total, pending } = data.progress;
  const filtered = Object.values(state.filters).some(Boolean);
  state.filterOptions = data.filter_options ?? null;
  for (const [id, key, allLabel, selected] of [
    ['capture-device-select', 'capture_devices', 'Svi uređaji', state.filters.capture_device],
    ['replay-screen-select', 'replay_screens', 'Svi ekrani', state.filters.replay_screen],
  ]) {
    $(id).replaceChildren(new Option(allLabel, ''), ...(state.filterOptions?.[key] ?? []).map(option => new Option(option.label, option.value)));
    $(id).value = selected || '';
  }
  $('batch-name').textContent = state.batch;
  $('progress-label').textContent = `${done} / ${total} završeno · ${pending} preostalo${filtered ? ' · izabrana oprema' : ''}`;
  $('batch-progress').max = total || 1;
  $('batch-progress').value = done;
  state.pending = pending;
  $('task-position').textContent = !state.task ? 'Nema TO DO zadataka' : !isTodo(state.task.status) ? 'Završen capture · pregled' : state.task.skipped ? 'Preskočen capture' : 'Capture u toku';
  $('capture-workspace').hidden = !state.task;
  $('completed-panel').hidden = Boolean(state.task);
  $('completed-title').textContent = total === 0 ? 'Nema zadataka za ovu kombinaciju.' : 'Nema preostalih TO DO zadataka.';
  $('completed-description').textContent = filtered ? 'Promeni filtere ili izaberi drugi batch. Ostatak batch-a može imati nezavršene zadatke.' : 'Nema više zadataka sa statusom TO DO u ovom batch-u.';
  $('save-status').textContent = state.demo ? 'Demo · čuvanje u browseru' : 'Spremno za capture';
  $('toggle-index').textContent = 'Show index';
  $('toggle-index').setAttribute('aria-pressed', 'false');
  if (!state.task) { viewer.clear(); return; }
  const task = state.task;
  $('image-name').textContent = task['user_id-document_view'];
  $('capture-index').textContent = task.unique_capture_index;
  $('overlay-value').textContent = task.unique_capture_index;
  $('orientation').textContent = readable(task.orientation);
  $('device-os').textContent = readable(task.device_os);
  $('device-model').textContent = task.operational_device_model || '—';
  $('country').textContent = readable(task.issuing_country);
  $('document-type').textContent = readable(task.doc_type);
  $('replay-type').textContent = readable(task.replay_device_type);
  $('replay-model').textContent = task.replay_device_model || '—';
  viewer.load(task);
}

async function loadBatch(batch, filters = {}) {
  if (state.busy) return;
  const previous = state.batch;
  setBusy(true);
  clearError();
  try {
    const data = await state.client.getBatch(batch, filters);
    state.batch = batch;
    state.filters = { ...filters };
    state.history = [];
    $('batch-select').value = batch;
    renderBatch(data);
  } catch (error) {
    $('batch-select').value = previous;
    $('capture-device-select').value = state.filters.capture_device || '';
    $('replay-screen-select').value = state.filters.replay_screen || '';
    showError(error, () => loadBatch(batch, filters));
  } finally { setBusy(false); }
}

async function openProject(client, settings, demo) {
  setBusy(true);
  $('connect-project').disabled = true;
  $('start-demo').disabled = true;
  $('project-error').textContent = '';
  try {
    const project = await client.openProject(settings);
    if (!Array.isArray(project.batches) || !project.batches.length) throw new Error('Projekat nema dostupne batcheve.');
    const batch = project.batches[0];
    const data = await client.getBatch(batch);
    state.client = client;
    state.demo = demo;
    try { sessionStorage.setItem('onscreen.mode', demo ? 'demo' : 'api'); } catch { /* Optional preference. */ }
    state.batch = batch;
    state.filters = {};
    state.history = [];
    $('batch-select').replaceChildren(...project.batches.map(name => new Option(name, name)));
    $('daily-report-status').hidden = true;
    $('mode-badge').textContent = demo ? 'DEMO' : 'EXCEL';
    $('demo-notice').hidden = !demo;
    $('connection-status').textContent = demo ? 'Lokalni demo' : 'Lokalni backend';
    renderBatch(data);
    $('project-dialog').close();
  } catch (error) {
    $('project-error').textContent = error.message;
    if (!$('project-dialog').open) showError(error, () => openProject(client, settings, demo));
  } finally {
    setBusy(false);
    $('connect-project').disabled = false;
    $('start-demo').disabled = false;
  }
}

// One step of NEXT / Skip / Undo / Back. `history`: 'push' remembers the task we leave, 'pop' returns to the last one.
async function move(status, call, history, retry) {
  const from = state.task?.task_id;
  await gate.run(async () => {
    setBusy(true);
    clearError();
    $('save-status').textContent = status;
    try {
      const data = await call();
      renderBatch(data);
      if (history === 'push') state.history.push(from);
      if (history === 'pop') state.history.pop();
      if (state.task) $('viewer').focus({ preventScroll: true });
      else $('choose-batch').focus({ preventScroll: true });
    } catch (error) {
      $('save-status').textContent = 'Nije sačuvano';
      showError(error, retry);
    } finally { setBusy(false); }
  });
}

function completeTask() {
  if (state.busy || !state.ready || !state.task) return;
  return move(state.demo ? 'Čuvanje demo napretka…' : 'Čuvanje u Excel…', () => state.client.complete(state.task, state.filters), 'push', completeTask);
}

function skipTask() {
  if (state.busy || !state.task) return;
  return move('Preskakanje…', () => state.client.skip(state.task, state.filters), 'push', skipTask);
}

function undoTask() {
  if (state.busy || !state.task) return;
  return move(state.demo ? 'Vraćanje u demo…' : 'Vraćanje u Excel…', () => state.client.undo(state.task, state.filters), null, undoTask);
}

function backTask() {
  if (state.busy || !state.history.length) return;
  const id = state.history.at(-1);
  return move('Učitavanje prethodnog…', () => state.client.getBatch(state.batch, state.filters, id), 'pop', backTask);
}

async function swapDevice(event) {
  event.preventDefault();
  const old = $('swap-old').value, os = $('swap-os').value, model = $('swap-model').value.trim();
  const filters = { ...state.filters };
  // Keep the capture filter pointing at the swapped device.
  if (filters.capture_device === old) filters.capture_device = JSON.stringify([os, model]);
  setBusy(true);
  $('swap-error').textContent = '';
  try {
    const data = await state.client.swapDevice(state.batch, old, os, model, filters);
    state.filters = filters;
    state.history = []; // finished tasks keep the old device, so they may fall out of the filter
    renderBatch(data);
    $('swap-dialog').close();
  } catch (error) { $('swap-error').textContent = error.message; }
  finally { setBusy(false); }
}

function toggleIndex() {
  if (!state.ready || state.busy) return;
  const visible = $('index-overlay').hidden;
  $('index-overlay').hidden = !visible;
  $('toggle-index').textContent = visible ? 'Hide index' : 'Show index';
  $('toggle-index').setAttribute('aria-pressed', String(visible));
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('viewer').requestFullscreen();
  } catch { showError(new Error('Browser nije dozvolio fullscreen. Koristi fullscreen opciju browsera.')); }
}

async function copyDailyReport() {
  if (!state.client || state.busy || state.reporting) return;
  const client = state.client;
  const demo = state.demo;
  const now = new Date();
  state.reporting = true;
  updateControls();
  $('daily-report-status').hidden = false;
  $('daily-report-status').textContent = 'Priprema dnevnog izveštaja…';
  try {
    const data = await client.getCaptureRecords();
    const report = createDailyReport(data.records, { now, demo });
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard nije dostupan. Otvori aplikaciju preko localhost ili HTTPS adrese.');
    await navigator.clipboard.writeText(report);
    $('daily-report-status').textContent = 'Dnevni izveštaj je kopiran. Nalepi ga pomoću Ctrl+V.';
  } catch (error) {
    $('daily-report-status').textContent = `Izveštaj nije kopiran. ${error.message}`;
  } finally { state.reporting = false; updateControls(); }
}

$('copy-daily-report').addEventListener('click', copyDailyReport);
$('next-task').addEventListener('click', completeTask);
$('skip-task').addEventListener('click', skipTask);
$('undo-task').addEventListener('click', undoTask);
document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', backTask));
$('toggle-index').addEventListener('click', toggleIndex);
$('index-size').addEventListener('input', event => {
  viewer.setIndexSize(event.target.value);
  $('index-size-value').value = `${Math.round(viewer.indexSize * 100)}%`;
});
$('zoom-in').addEventListener('click', () => viewer.zoom(viewer.view.scale * 1.2));
$('zoom-out').addEventListener('click', () => viewer.zoom(viewer.view.scale / 1.2));
$('fit-image').addEventListener('click', () => viewer.fit());
$('fullscreen').addEventListener('click', toggleFullscreen);
$('exit-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => { $('exit-fullscreen').hidden = !document.fullscreenElement; });
$('batch-select').addEventListener('change', event => loadBatch(event.target.value));
for (const id of ['capture-device-select', 'replay-screen-select']) {
  $(id).addEventListener('change', () => loadBatch(state.batch, {
    capture_device: $('capture-device-select').value,
    replay_screen: $('replay-screen-select').value,
  }));
}
$('swap-device').addEventListener('click', () => {
  $('swap-old').replaceChildren(...state.filterOptions.capture_devices.map(option => new Option(option.label, option.value)));
  $('swap-old').value = state.filters.capture_device || $('swap-old').options[0].value;
  $('swap-model').value = '';
  $('swap-error').textContent = '';
  $('swap-dialog').showModal();
});
$('close-swap').addEventListener('click', () => { if (!state.busy) $('swap-dialog').close(); });
$('swap-form').addEventListener('submit', swapDevice);
$('clear-filters').addEventListener('click', () => loadBatch(state.batch));
$('choose-batch').addEventListener('click', () => $('batch-select').focus());
$('retry').addEventListener('click', () => state.retry?.());
$('open-project').addEventListener('click', () => $('project-dialog').showModal());
$('close-dialog').addEventListener('click', () => { if (!state.busy) $('project-dialog').close(); });
$('project-dialog').addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
$('start-demo').addEventListener('click', () => openProject(new DemoClient(), {}, true));
$('project-form').addEventListener('submit', event => {
  event.preventDefault();
  openProject(new ApiClient(), {
    workbook_path: $('workbook-path').value.trim(), image_root: $('image-root').value.trim(),
    sheet_name: $('sheet-name').value.trim() || null,
  }, false);
});
document.querySelectorAll('[data-browse]').forEach(button => button.addEventListener('click', async () => {
  const input = $(button.dataset.browse);
  button.disabled = true;
  $('project-error').textContent = '';
  try {
    const { path } = await new ApiClient().browse(button.dataset.kind, input.value.trim());
    if (path) input.value = path;
  } catch (error) { $('project-error').textContent = error.message; }
  finally { button.disabled = false; }
}));
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey || !state.ready || state.busy) return;
  if (event.key === '+' || event.key === '=') { event.preventDefault(); viewer.zoom(viewer.view.scale * 1.2); }
  if (event.key === '-') { event.preventDefault(); viewer.zoom(viewer.view.scale / 1.2); }
  if (event.key === '0') viewer.fit();
  if (event.key.toLowerCase() === 'i') toggleIndex();
  if (event.key.toLowerCase() === 'f') toggleFullscreen();
});
window.addEventListener('beforeunload', event => { if (state.busy) { event.preventDefault(); event.returnValue = ''; } });

async function initialize() {
const mode = new URLSearchParams(location.search).get('mode');
let previousMode;
try { previousMode = sessionStorage.getItem('onscreen.mode'); } catch { /* Optional preference. */ }
if (mode === 'api' || (mode !== 'demo' && previousMode === 'api')) {
  updateControls();
  $('demo-notice').hidden = true;
  $('mode-badge').textContent = 'EXCEL';
  $('viewer-message').textContent = 'Otvori projekat za početak rada.';
  const client = new ApiClient();
  try {
    const session = await client.session();
    if (session.project) {
      await openProject(client, undefined, false);
      return;
    }
  } catch { /* Open dialog allows retry when backend is unavailable. */ }
  $('project-dialog').showModal();
} else {
  openProject(new DemoClient(), {}, true);
}
}
initialize();
