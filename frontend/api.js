import { batchProgress, firstPending } from './core.js';
import { equipmentKey, equipmentOptions, matchesEquipment } from './equipment-filters.js';

export class ApiClient {
  constructor(base = './api/') { this.base = base; this.token = null; }

  async session() {
    const data = await this.request('session');
    this.token = data.token;
    return data;
  }

  async request(path, body) {
    if (body !== undefined && !this.token) await this.session();
    let response;
    try {
      response = await fetch(this.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-OnScreen-Token': this.token },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch { throw new Error('Backend nije dostupan. Proveri da li je lokalna aplikacija pokrenuta.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Zahtev nije uspeo. Proveri backend i Excel fajl.');
    if (!data) throw new Error('Backend nije vratio očekivane JSON podatke.');
    return data;
  }

  async openProject(settings) { return settings ? this.request('project/open', settings) : (await this.session()).project; }
  browse(kind, start) { return this.request('browse', { kind, start }); }
  getBatch(batch, filters = {}, focus = '') {
    const query = new URLSearchParams(Object.entries({ ...filters, focus }).filter(([, value]) => value));
    return this.request(`batches/${encodeURIComponent(batch)}/current${query.size ? '?' + query : ''}`);
  }
  getCaptureRecords() { return this.request('reports/captures'); }
  swapDevice(batch, oldDevice, deviceOs, model, filters = {}) { return this.request('devices/swap', { batch, old_device: oldDevice, device_os: deviceOs, model, ...(Object.values(filters).some(Boolean) ? { filters } : {}) }); }
  complete(task, filters = {}) { return this.request(`tasks/${encodeURIComponent(task.task_id)}/complete`, { batch: task.batch, revision: task.revision, ...(Object.values(filters).some(Boolean) ? { filters } : {}) }); }
  undo(task, filters = {}) { return this.request(`tasks/${encodeURIComponent(task.task_id)}/undo`, { batch: task.batch, revision: task.revision, ...(Object.values(filters).some(Boolean) ? { filters } : {}) }); }
  skip(task, filters = {}) { return this.request(`tasks/${encodeURIComponent(task.task_id)}/skip`, { batch: task.batch, ...(Object.values(filters).some(Boolean) ? { filters } : {}) }); }
}

const STORAGE_KEY = 'onscreen.demo.progress.v1';
const samples = [
  ['3146', 'batch_10', 'usa', 'driver_license', '048589ff-fa1d-4935-a89f-286a5ad1bb8d-front', 'Portrait'],
  ['3148', 'batch_10', 'usa', 'driver_license', '048589ff-fa1d-4935-a89f-286a5ad1bb8d-back', 'Portrait'],
  ['3170', 'batch_10', 'usa', 'driver_license', '048589ff-fa1d-4935-a89f-286a5ad1bb8d-front', 'Landscape'],
  ['3194', 'batch_10', 'canada', 'driver_license', '18e1c17f-7239-432d-a942-8365b244a3f6-front', 'Portrait'],
  ['3242', 'batch_10', 'malaysia', 'id_card', '2ad80b74-8d03-48ea-8820-071e50ed2974-front', 'Portrait'],
  ['3290', 'batch_10', 'philippines', 'passport', '429bd78b-8028-49d5-9b3e-5c532e0368f1-bio', 'Portrait'],
  ['3500', 'batch_11', 'italy', 'id_card', 'afe664fd-1ef9-4dc9-a969-2284db418860-front', 'Landscape'],
  ['3502', 'batch_11', 'italy', 'id_card', 'afe664fd-1ef9-4dc9-a969-2284db418860-back', 'Portrait'],
];

function demoImage(country, type, back) {
  const title = `${country.toUpperCase().replaceAll('_', ' ')} · ${type.replaceAll('_', ' ').toUpperCase()}`;
  const content = back
    ? '<rect x="55" y="105" width="850" height="80" fill="#34465d"/><text x="60" y="245" font-size="24">DOCUMENT REVERSE · SYNTHETIC SAMPLE</text><path d="M60 300h700m-700 35h810m-810 35h570" stroke="#bdcbd5" stroke-width="12"/>'
    : '<rect x="55" y="115" width="220" height="265" rx="12" fill="#d5e0e6"/><circle cx="165" cy="200" r="44" fill="#a7bbc6"/><path d="M90 340c0-100 150-100 150 0" fill="#a7bbc6"/><text x="320" y="160" font-size="14" fill="#788e9d">SURNAME / NAME</text><text x="320" y="198" font-size="30">DEMO PERSON</text><text x="320" y="255" font-size="14" fill="#788e9d">DOCUMENT NUMBER</text><text x="320" y="292" font-size="27">SAMPLE 000000</text><path d="M320 340h400m-400 35h280" stroke="#bdcbd5" stroke-width="10"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="bg"><stop stop-color="#f3f5e9"/><stop offset="1" stop-color="#e4edf5"/></linearGradient><pattern id="lines" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M0 35L35 0" stroke="#a0c5bf" opacity=".15"/></pattern></defs><rect width="960" height="540" rx="20" fill="url(#bg)"/><rect width="960" height="540" rx="20" fill="url(#lines)"/><g font-family="Arial,sans-serif" fill="#30495c"><text x="55" y="65" font-size="22" font-weight="bold">${title}</text>${content}<text x="55" y="466" font-size="18" fill="#788e9d">NOT A REAL DOCUMENT · FRONTEND DEMO</text><text x="55" y="502" font-size="12" fill="#95a6b0">ONSCREEN / SAMPLE DATA ONLY</text></g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export class DemoClient {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.skipped = [];
    let saved;
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}'); }
    catch { saved = {}; }
    this.tasks = samples.map(([index, batch, country, type, name, orientation]) => ({
      task_id: `demo-${index}`, unique_capture_index: index, batch,
      issuing_country: country, doc_type: type, 'user_id-document_view': name,
      orientation, device_os: ['3242', '3290'].includes(index) ? 'iOS' : 'Android',
      operational_device_model: ['3242', '3290'].includes(index) ? 'iPhone 15' : 'Google Pixel 8a',
      replay_device_type: index === '3290' ? 'Tablet' : batch === 'batch_11' ? 'Laptop' : 'Monitor',
      replay_device_model: index === '3290' ? 'iPad Air' : batch === 'batch_11' ? 'DELL Latitude 5530' : 'DELL P2722H',
      image_url: demoImage(country, type, name.endsWith('-back')),
      status: saved?.[index]?.status === 'DONE' ? 'DONE' : 'TO DO',
      timestamp: saved?.[index]?.timestamp ?? '', revision: 1,
    }));
  }

  async openProject() { return { batches: [...new Set(this.tasks.map(task => task.batch))] }; }

  async getCaptureRecords() {
    return { records: this.tasks.map(({ task_id, batch, status, timestamp }) => ({ task_id, batch, status, timestamp })) };
  }

  async getBatch(batch, filters = {}, focus = '') {
    const rows = this.tasks.filter(task => matchesEquipment(task, filters));
    const task = focus ? rows.find(row => row.task_id === focus && row.batch === batch) : firstPending(rows, batch, this.skipped);
    if (focus && !task) throw new Error('Capture zadatak nije u izabranom skupu.');
    return { task: task && { ...task, skipped: this.skipped.includes(task.task_id) }, progress: batchProgress(rows, batch),
      filter_options: equipmentOptions(this.tasks.filter(task => task.batch === batch)) };
  }

  async skip(task, filters = {}) {
    const current = this.tasks.find(row => row.task_id === task.task_id);
    if (!current || current.status !== 'TO DO') throw new Error('Samo zadatak sa statusom TO DO može da se preskoči.');
    // ponytail: skips live in memory only, like the backend.
    this.skipped = this.skipped.filter(id => id !== current.task_id).concat(current.task_id);
    return this.getBatch(task.batch, filters);
  }

  // Writes the status, then the DONE map; a failed save leaves the row untouched.
  #set(row, status, timestamp) {
    const previous = { status: row.status, timestamp: row.timestamp };
    Object.assign(row, { status, timestamp });
    const saved = Object.fromEntries(this.tasks.filter(item => item.status === 'DONE')
      .map(item => [item.unique_capture_index, { status: 'DONE', timestamp: item.timestamp }]));
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(saved)); }
    catch {
      Object.assign(row, previous);
      throw new Error('Browser ne dozvoljava čuvanje demo napretka. Omogući lokalno skladištenje i pokušaj ponovo.');
    }
  }

  async undo(task, filters = {}) {
    const current = this.tasks.find(row => row.task_id === task.task_id);
    if (!current) throw new Error('Demo zadatak ne postoji.');
    if (current.status === 'DONE') this.#set(current, 'TO DO', '');
    return this.getBatch(task.batch, filters, current.task_id);
  }

  async swapDevice(batch, oldDevice, deviceOs, model, filters = {}) {
    // ponytail: demo swaps live in memory only, lost on reload.
    const rows = this.tasks.filter(t => t.batch === batch && t.status === 'TO DO' && equipmentKey(t.device_os, t.operational_device_model) === oldDevice);
    if (!rows.length) throw new Error('Nema preostalih TO DO zadataka za izabrani uređaj.');
    for (const row of rows) { row.device_os = deviceOs; row.operational_device_model = model; }
    return this.getBatch(batch, filters);
  }

  async complete(task, filters = {}) {
    const current = this.tasks.find(row => row.task_id === task.task_id);
    if (!current) throw new Error('Demo zadatak ne postoji.');
    this.#set(current, 'DONE', current.timestamp || new Date().toISOString());
    this.skipped = this.skipped.filter(id => id !== current.task_id);
    return this.getBatch(task.batch, filters);
  }
}
