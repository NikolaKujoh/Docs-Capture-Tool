const source = [
  [264,152,0], [288,83,6], [432,365,360], [432,0,0], [288,216,0],
  [288,240,0], [432,90,0], [432,0,0], [288,132,1], [312,155,48],
  [432,308,0], [468,0,0], [288,0,0], [288,0,0], [468,0,0],
  [360,0,0], [240,0,0], [96,0,0], [144,0,0], [144,0,0],
];

export const batches = source.map(([total, captured, labelled], index) => ({
  name: `batch_${String(index + 1).padStart(2, '0')}`,
  total, captured, labelled, validated: 0, recaptures: 0,
}));

export function totals(rows) {
  return rows.reduce((sum, row) => {
    for (const key of Object.keys(sum)) sum[key] = sum[key] === null || row[key] === null ? null : sum[key] + row[key];
    return sum;
  }, { total: 0, captured: 0, labelled: 0, validated: 0, recaptures: 0 });
}

export const STATUSES = ['not-started', 'active', 'completed'];

export function statusOf(row) {
  return row.captured === 0 ? 'not-started' : row.captured < row.total ? 'active' : 'completed';
}

export function filterBatches(rows, query, status) {
  const search = query.trim().toLowerCase();
  return rows.filter(row => row.name.toLowerCase().includes(search) && (status === 'all' || statusOf(row) === status));
}

export function percentage(value, total) {
  return total ? value / total * 100 : 0;
}

// Columns that are computed rather than stored on the row.
const sortValue = {
  name: row => row.name,
  status: row => STATUSES.indexOf(statusOf(row)),
  remaining: row => row.total - row.captured,
  progress: row => percentage(row.captured, row.total),
  labelledPct: row => row.labelled === null ? null : percentage(row.labelled, row.total),
  validatedPct: row => row.validated === null ? null : percentage(row.validated, row.total),
};

// Unknown values (null) always sort last, whichever direction is chosen.
export function sortBatches(rows, key, direction = 'asc') {
  const get = sortValue[key] ?? (row => row[key]);
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const [x, y] = [get(a), get(b)];
    if (x === null || y === null) return (x === null) - (y === null);
    return sign * (typeof x === 'string' ? x.localeCompare(y, undefined, { numeric: true }) : x - y);
  });
}
