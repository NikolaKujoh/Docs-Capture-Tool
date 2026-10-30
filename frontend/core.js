export function isTodo(status) {
  return String(status ?? '').trim().toUpperCase() === 'TO DO';
}

export function firstPending(tasks, batch) {
  return tasks.find(task => task.batch === batch && isTodo(task.status)) ?? null;
}

export function batchProgress(tasks, batch) {
  const rows = tasks.filter(task => task.batch === batch);
  return {
    total: rows.length,
    done: rows.filter(task => String(task.status).trim().toUpperCase() === 'DONE').length,
    pending: rows.filter(task => isTodo(task.status)).length,
  };
}

export function readable(value) {
  if (!value) return '—';
  const text = String(value).replaceAll('_', ' ');
  if (text.toLowerCase() === 'usa') return 'USA';
  if (text.toLowerCase() === 'ios') return 'iOS';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function fitSize(imageWidth, imageHeight, viewportWidth, viewportHeight) {
  const ratio = Math.min((viewportWidth - 64) / imageWidth, (viewportHeight - 64) / imageHeight);
  return { width: imageWidth * Math.max(ratio, 0.01), height: imageHeight * Math.max(ratio, 0.01) };
}

export function zoomAt(view, requestedScale, point) {
  const scale = Math.min(5, Math.max(0.5, requestedScale));
  const ratio = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

export class CompletionGate {
  #busy = false;

  async run(action) {
    if (this.#busy) return null;
    this.#busy = true;
    try { return await action(); }
    finally { this.#busy = false; }
  }
}
