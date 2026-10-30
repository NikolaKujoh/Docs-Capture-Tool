export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dailySummary(records, now = new Date()) {
  const date = localDateKey(now);
  const captures = [];
  let invalidTimestamps = 0;
  for (const record of records) {
    if (String(record.status).trim().toUpperCase() !== 'DONE') continue;
    // Excel dates must be normalized by the backend, not guessed by the browser.
    const raw = record.timestamp;
    const timestamp = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)
      ? new Date(raw) : new Date(NaN);
    if (!Number.isFinite(timestamp.getTime())) { invalidTimestamps++; continue; }
    if (localDateKey(timestamp) === date) captures.push({ ...record, time: timestamp });
  }
  captures.sort((a, b) => a.time - b.time);
  const first = captures[0]?.time ?? null;
  const last = captures.at(-1)?.time ?? null;
  const byBatch = new Map();
  for (const capture of captures) byBatch.set(capture.batch, (byBatch.get(capture.batch) || 0) + 1);
  return { date, count: captures.length, first, last, elapsedSeconds: first ? Math.floor((last - first) / 1000) : 0, byBatch, invalidTimestamps };
}

export function createDailyReport(records, { now = new Date(), demo = false } = {}) {
  if (!Array.isArray(records)) throw new Error('Dnevni izveštaj nije dostupan: nedostaju podaci o završenim zadacima.');
  const summary = dailySummary(records, now);
  const formatTime = date => date ? new Intl.DateTimeFormat('sr-Latn-RS', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date) : '—';
  const hours = Math.floor(summary.elapsedSeconds / 3600);
  const minutes = Math.floor(summary.elapsedSeconds % 3600 / 60);
  const seconds = summary.elapsedSeconds % 60;
  const decimalHours = (summary.elapsedSeconds / 3600).toFixed(2).replace('.', ',');
  return [
    `OnScreen — Dnevni capture izveštaj · ${now.toLocaleDateString('sr-Latn-RS')}`,
    ...(demo ? ['DEMO — samo napredak sačuvan u ovom browseru.'] : []),
    'Obuhvat: svi batchevi otvorenog projekta.',
    `Vremenska zona: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    '',
    `Danas capture-ovano: ${summary.count}`,
    `Prvi capture: ${formatTime(summary.first)}`,
    `Poslednji capture: ${formatTime(summary.last)}`,
    `Raspon: ${hours} h ${minutes} min ${seconds} s (${decimalHours} sati)`,
    'Raspon je razlika između prvog i poslednjeg sačuvanog capture-a; uključuje pauze.',
    ...(summary.count === 0 ? ['Danas nema sačuvanih capture-a.'] : []),
    ...(summary.count === 1 ? ['Za jedan capture nije moguće izračunati trajanje rada.'] : []),
    '',
    'Po batchevima:',
    ...[...summary.byBatch.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([batch, count]) => `${batch}: ${count}`),
    ...(summary.invalidTimestamps ? ['', `DONE redovi bez ispravnog timestamp-a (nisu uračunati): ${summary.invalidTimestamps}`] : []),
  ].join('\n');
}
