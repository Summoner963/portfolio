// js/api.js
// ═══════════════════════════════════════════════════════════════════════════
//  Client-side data layer.
//
//  Responsibilities:
//   - CFG: single object listing every named API endpoint and site config.
//   - parseCSV: parse raw CSV text → array of row objects.
//   - cGet / cSet: localStorage cache (10-minute TTL, namespaced).
//   - fetchSheet: stale-while-revalidate fetch with fallback to cache.
//   (Image maps, FAQ markup and schemas live in js/shared/render.js.)
//
//  Security:
//   - NO Google Sheet URLs or GIDs ever appear here.
//   - Every fetch goes to /api/data?sheet=<name> — the Worker proxies it.
//   - The worker strips draft posts (and their FAQ/image rows) before
//     anything reaches the browser.
// ═══════════════════════════════════════════════════════════════════════════



// ─────────────────────────────────────────────────────────────────────────
//  CFG — single source of truth for client-side configuration
// ─────────────────────────────────────────────────────────────────────────

export const CFG = {
  /** Canonical site origin — no trailing slash. */
  siteUrl: 'https://suman-dangal.com.np',

  /** localStorage cache TTL in minutes. */
  cacheMins: 10,

  /** Blog posts per page (list view). */
  postsPerPage: 6,

 

  /**
   * Named API endpoints.
   * Keys match the ?sheet= parameter accepted by worker/index.js.
   * Values are the full relative URL — the only place these strings live
   * on the client side.
   *
   * To add a new sheet: add one line here + one line in worker/sheets.js
   * + one env var in wrangler.toml. Zero other files change.
   */
  api: {
    blog:     '/api/data?sheet=blog',
    skills:   '/api/data?sheet=skills',
    projects: '/api/data?sheet=projects',
    exp:      '/api/data?sheet=exp',
    about:    '/api/data?sheet=about',
    faq:      '/api/data?sheet=faq',
    images:   '/api/data?sheet=images',
    featured: '/api/data?sheet=featured',
  },
};


// ─────────────────────────────────────────────────────────────────────────
//  CSV parser
//  Handles: quoted fields, escaped quotes (""), CRLF + LF, trailing commas.
//  Same algorithm as worker/utils.js parseCSV().
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw CSV string into an array of row objects.
 * Header row (row 0) becomes the object keys; all values are trimmed strings.
 * Completely blank rows are filtered out.
 *
 * @param {string} raw
 * @returns {Array<Record<string, string>>}
 */
export function parseCSV(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const rows = [];
  let cur = '', inQ = false, row = [];

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (c === '"') {
      if (inQ && raw[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
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
  // Flush final field / row
  row.push(cur);
  if (row.some(v => v.trim())) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());

  return rows
    .slice(1)
    .map(vals => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v));
}


// ─────────────────────────────────────────────────────────────────────────
//  localStorage cache
//  Namespace: 'sd6_' — bump to clear every visitor's cache on deploy.
//  TTL: CFG.cacheMins (10 minutes).
//  Errors are swallowed — private browsing / storage-full never throws.
// ─────────────────────────────────────────────────────────────────────────

const NS = 'sd6_'; // bumped: drafts are now filtered server-side

/**
 * Read a cached value from localStorage.
 * @param {string} key
 * @returns {{ data: Array|null, stale: boolean }}
 */
export function cGet(key) {
  try {
    const it = JSON.parse(localStorage.getItem(NS + key));
    if (!it) return { data: null, stale: true };
    return { data: it.data, stale: Date.now() > it.exp };
  } catch {
    return { data: null, stale: true };
  }
}

/**
 * Write a value to localStorage with a TTL expiry.
 * @param {string} key
 * @param {Array}  data
 */
export function cSet(key, data) {
  try {
    localStorage.setItem(
      NS + key,
      JSON.stringify({ data, exp: Date.now() + CFG.cacheMins * 60_000 })
    );
  } catch {
    // Storage full or private browsing — silently skip.
  }
}

/**
 * Invalidate a single cache entry.
 * @param {string} key
 */
export function cDel(key) {
  try { localStorage.removeItem(NS + key); } catch {}
}


// ─────────────────────────────────────────────────────────────────────────
//  fetchSheet — stale-while-revalidate data fetcher
//
//  Strategy:
//   1. If fresh cache exists → return it immediately (zero network).
//   2. If stale cache exists → return stale data immediately,
//      then revalidate in the background and call onRevalidate(fresh).
//   3. If no cache → await network, cache result, return it.
//   4. If network fails → return null (caller shows fallback content).
//
//  The Worker adds Cache-Control: max-age=600 on /api/data responses,
//  so the browser's HTTP cache also deduplicates rapid re-fetches.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Internal: perform the actual network fetch, parse, and cache.
 * Returns parsed rows or null on error.
 *
 * @param {string} endpoint  — e.g. '/api/data?sheet=blog'
 * @param {string} key       — localStorage cache key
 * @returns {Promise<Array|null>}
 */
async function _doFetch(endpoint, key) {
  try {
    const r = await fetch(endpoint, {
      credentials: 'same-origin',
      headers: { 'Accept': 'text/csv' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = parseCSV(await r.text());
    cSet(key, data);
    return data;
  } catch (e) {
    console.warn('[fetchSheet]', key, e.message);
    return null;
  }
}

/**
 * Fetch a named sheet with stale-while-revalidate caching.
 *
 * @param {string}   endpoint     — CFG.api.<name>
 * @param {string}   key          — cache key (use the sheet name, e.g. 'blog')
 * @param {Function} [onRevalidate] — called with fresh data after bg revalidation
 * @returns {Promise<Array|null>}
 */
export async function fetchSheet(endpoint, key, onRevalidate) {
  if (!endpoint) return null;

  const { data, stale } = cGet(key);

  if (data) {
    if (!stale) return data;                    // fresh — no network needed
    // Stale: serve immediately, revalidate in background
    _doFetch(endpoint, key).then(fresh => {
      if (fresh && onRevalidate) onRevalidate(fresh);
    });
    return data;
  }

  // No cache — must await network
  return _doFetch(endpoint, key);
}


// ─────────────────────────────────────────────────────────────────────────
//  prefetchSheets
//  Warm the cache for a list of sheet names in parallel.
//  Called opportunistically (e.g. on home page load) so subsequent
//  navigations feel instant.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget parallel prefetch for multiple sheets.
 * Results are written to localStorage cache; errors are silently ignored.
 *
 * @param {Array<string>} names — keys from CFG.api, e.g. ['blog', 'skills']
 */
export function prefetchSheets(names) {
  names.forEach(name => {
    const endpoint = CFG.api[name];
    if (!endpoint) return;
    const { stale } = cGet(name);
    if (!stale) return;   // already fresh — skip
    _doFetch(endpoint, name).catch(() => {});
  });
}