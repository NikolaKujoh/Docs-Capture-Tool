import { totals } from './dashboard-data.js';

export function createTextReport(rows, { demo = true } = {}) {
  const sum = totals(rows);
  return [
    'OnScreen — Izveštaj statusa',
    demo ? 'DEMO — podaci nisu ažurirani uživo.' : 'Izvor: otvoreni lokalni Excel projekat.',
    '',
    `Trenutno capture-ovano: ${sum.captured}/${sum.total}`,
    `Labelovano: ${sum.labelled === null ? 'Nije dostupno' : sum.labelled + '/' + sum.captured + ' capture-ovanih'}`,
    `Validirano: ${sum.validated === null ? 'Nije dostupno' : sum.validated + '/' + sum.labelled + ' labelovanih'}`,
    `Recaptures: ${sum.recaptures ?? 'Nije dostupno'}`,
    '',
    'Po batchevima:',
    ...rows.map(row => `${row.name}: capture ${row.captured}/${row.total} | labelovano ${row.labelled === null ? '—' : row.labelled + '/' + row.captured} | validirano ${row.validated === null ? '—' : row.validated + '/' + row.labelled} | recaptures ${row.recaptures ?? '—'}`),
  ].join('\n');
}
