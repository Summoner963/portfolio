// worker/utils.js — worker-only helpers. Escaping, markdown and templates
// live in ../public/js/shared/render.js (shared with the browser).

/**
 * Parse CSV (quoted fields, "" escapes, CRLF/LF) into row objects keyed by
 * the trimmed header row. Blank rows are dropped; values are trimmed.
 * @param {string} raw
 * @returns {Array<Record<string,string>>}
 */
export function parseCSV(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const rows = [];
  let cur = '', inQ = false, row = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (inQ && raw[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || (c === '\r' && raw[i + 1] === '\n')) && !inQ) {
      if (c === '\r') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .map(vals => Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()])))
    .filter(r => Object.values(r).some(Boolean));
}
