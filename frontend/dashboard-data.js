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

export function filterBatches(rows, query, status) {
  const search = query.trim().toLowerCase();
  return rows.filter(row => row.name.toLowerCase().includes(search) && (
    status === 'all' ||
    (status === 'active' && row.captured > 0 && row.captured < row.total) ||
    (status === 'not-started' && row.captured === 0) ||
    (status === 'completed' && row.captured === row.total)
  ));
}

export function percentage(value, total) {
  return total ? value / total * 100 : 0;
}
