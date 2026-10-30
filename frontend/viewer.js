import { fitSize, zoomAt } from './core.js';

export class ImageViewer {
  constructor({ viewport, image, layer, message, overlay, zoomLabel, onReady }) {
    Object.assign(this, { viewport, image, layer, message, overlay, zoomLabel, onReady });
    this.view = { x: 0, y: 0, scale: 1 };
    this.ready = false;
    this.loadId = 0;
    this.indexPosition = { x: 0.95, y: 0.07 };
    this.indexSize = 1;
    overlay.title = 'Prevuci indeks na željeno mesto na slici';
    overlay.addEventListener('pointerdown', event => {
      if (!this.ready || event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      const rect = overlay.getBoundingClientRect();
      this.indexDrag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      overlay.setPointerCapture(event.pointerId);
      overlay.classList.add('index-dragging');
    });
    overlay.addEventListener('pointermove', event => {
      if (this.indexDrag?.id !== event.pointerId) return;
      const rect = layer.getBoundingClientRect();
      const label = overlay.getBoundingClientRect();
      const clamp = value => Math.max(0, Math.min(1, value));
      this.indexPosition = {
        x: clamp((event.clientX - rect.left - this.indexDrag.x) / Math.max(1, rect.width - label.width)),
        y: clamp((event.clientY - rect.top - this.indexDrag.y) / Math.max(1, rect.height - label.height)),
      };
      this.positionIndex();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      overlay.addEventListener(name, () => { this.indexDrag = null; overlay.classList.remove('index-dragging'); });
    }
    viewport.addEventListener('wheel', event => {
      if (!this.ready) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      this.zoom(this.view.scale * Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
    }, { passive: false });
    viewport.addEventListener('pointerdown', event => {
      if (!this.ready || event.button !== 0 || event.target.closest('button')) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('dragging');
    });
    viewport.addEventListener('pointermove', event => {
      if (this.drag?.id !== event.pointerId) return;
      this.view.x += event.clientX - this.drag.x;
      this.view.y += event.clientY - this.drag.y;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.render();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      viewport.addEventListener(name, () => { this.drag = null; viewport.classList.remove('dragging'); });
    }
    viewport.addEventListener('dblclick', event => { if (!event.target.closest('button') && !overlay.contains(event.target)) this.fit(); });
    this.observer = new ResizeObserver(() => { if (this.ready) this.fit(); });
    this.observer.observe(viewport);
  }

  async load(task) {
    const id = ++this.loadId;
    this.ready = false;
    this.onReady(false);
    this.layer.hidden = true;
    this.overlay.hidden = true;
    this.indexDrag = null;
    this.indexPosition = { x: 0.95, y: 0.07 };
    this.positionIndex();
    this.message.textContent = 'Učitavanje slike…';
    this.message.hidden = false;
    this.image.alt = `${task.issuing_country} · ${task.doc_type} · ${task['user_id-document_view']}`;
    this.image.src = task.image_url;
    try {
      await this.image.decode();
      if (id !== this.loadId) return;
      this.ready = true;
      this.message.hidden = true;
      this.layer.hidden = false;
      this.fit();
      this.onReady(true);
    } catch {
      if (id !== this.loadId) return;
      this.message.textContent = 'Slika nije učitana. Proveri fajl i pokušaj ponovo.';
      this.onReady(false, new Error('Slika nije dostupna. Zadatak nije moguće završiti dok se slika ne učita.'));
    }
  }

  clear() {
    this.loadId++;
    this.ready = false;
    this.layer.hidden = true;
    this.overlay.hidden = true;
    this.onReady(false);
  }

  fit() {
    if (!this.ready) return;
    const size = fitSize(this.image.naturalWidth, this.image.naturalHeight, this.viewport.clientWidth, this.viewport.clientHeight);
    this.layer.style.width = `${size.width}px`;
    this.layer.style.height = `${size.height}px`;
    this.sizeIndex(size.width);
    this.view = { x: 0, y: 0, scale: 1 };
    this.render();
  }

  zoom(scale, point = { x: 0, y: 0 }) {
    if (!this.ready) return;
    this.view = zoomAt(this.view, scale, point);
    this.render();
  }

  setIndexSize(percent) {
    const value = Number(percent);
    if (!Number.isFinite(value)) return;
    this.indexSize = Math.min(2, Math.max(.5, value / 100));
    this.sizeIndex(parseFloat(this.layer.style.width) || 0);
  }

  sizeIndex(width) {
    if (!width) return;
    this.overlay.style.fontSize = `${Math.max(12, Math.min(60, width * .075)) * this.indexSize}px`;
    this.overlay.style.padding = `${width * .015 * this.indexSize}px ${width * .025 * this.indexSize}px`;
    this.positionIndex();
  }

  positionIndex() {
    const { x, y } = this.indexPosition;
    this.overlay.style.right = 'auto';
    this.overlay.style.left = `${x * 100}%`;
    this.overlay.style.top = `${y * 100}%`;
    this.overlay.style.transform = `translate(${-x * 100}%, ${-y * 100}%)`;
  }

  render() {
    const { x, y, scale } = this.view;
    this.layer.style.transform = `translate(${x}px, ${y}px) scale(${scale}) translate(-50%, -50%)`;
    this.zoomLabel.value = `${Math.round(scale * 100)}%`;
  }
}
