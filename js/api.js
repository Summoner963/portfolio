// js/api.js
// ═══════════════════════════════════════════════════════════════════════════
//  Client-side data layer.
//
//  Responsibilities:
//   - CFG: single object listing every named API endpoint and site config.
//   - parseCSV: parse raw CSV text → array of row objects.
//   - cGet / cSet: localStorage cache (10-minute TTL, namespaced).
//   - fetchSheet: stale-while-revalidate fetch with fallback to cache.
//   - buildImgMap: resolve Img1_URL…ImgN_URL columns + images sheet rows
//     into the imgMap object consumed by md() in js/utils.js.
//   - buildFAQ: fetch FAQ rows for a blog slug, inject FAQPage schema,
//     return rendered HTML string.
//
//  Security:
//   - NO Google Sheet URLs or GIDs ever appear here.
//   - Every fetch goes to /api/data?sheet=<name> — the Worker proxies it.
//   - CSP connect-src 'self' enforces this at the browser level too.
// ═══════════════════════════════════════════════════════════════════════════

import { esc, fixImgUrl, md } from './utils.js';


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

  /** Chords per page (list view). */
  chordsPerPage: 12,

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
    chords:   '/api/data?sheet=chords',   // NEW — chord sheet
  },
};


// ─────────────────────────────────────────────────────────────────────────
//  CSV parser
//  Handles: quoted fields, escaped quotes (""), CRLF + LF, trailing commas.
//  Identical algorithm to worker/utils.js — kept in sync manually because
//  the two environments (browser / Worker) cannot share modules directly.
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
//  Namespace: 'sd5_' — bumped from sd4_ to clear stale cache on deploy.
//  TTL: CFG.cacheMins (10 minutes).
//  Errors are swallowed — private browsing / storage-full never throws.
// ─────────────────────────────────────────────────────────────────────────

const NS = 'sd5_';

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
//  buildImgMap
//  Resolves all inline image references for a blog post into a map of
//  "[imgN]" → full <figure>…</figure> HTML string consumed by md().
//
//  Sources (in priority order):
//   1. Img1_URL … ImgN_URL columns on the post row itself.
//   2. Rows from the "images" sheet where Blog_Slug matches post.Slug.
//      (Allows adding images without editing the main blog sheet.)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build an image map for a blog post.
 *
 * @param {Record<string, string>} post       — one blog row object
 * @param {Array<Record<string, string>>} [imageRows] — rows from images sheet
 * @returns {Record<string, string>}          — { '[img1]': '<figure>…</figure>', … }
 */
export function buildImgMap(post, imageRows) {
  const map = {};

  // ── Source 1: Img1_URL, Img2_URL … columns on the post row ─────────
  let n = 1;
  while (post[`Img${n}_URL`]) {
    const url = fixImgUrl(post[`Img${n}_URL`]);
    const alt = esc(post[`Img${n}_Alt`] || post.Title || '');
    if (url) {
      map[`[img${n}]`] =
        `<figure class="blog-figure">` +
          `<img class="blog-inline-img"` +
          ` src="${esc(url)}"` +
          ` alt="${alt}"` +
          ` loading="lazy"` +
          ` decoding="async"` +
          ` width="680"` +
          ` height="383">` +
          `<figcaption>${alt}</figcaption>` +
        `</figure>`;
    }
    n++;
  }

  // ── Source 2: separate images sheet (Blog_Slug + Img_Number columns) ─
  if (imageRows?.length) {
    const slug = (post.Slug || '').trim();
    imageRows
      .filter(r => (r.Blog_Slug || '').trim() === slug)
      .sort((a, b) => Number(a.Img_Number || 0) - Number(b.Img_Number || 0))
      .forEach(r => {
        const num = Number(r.Img_Number || 0);
        if (!num) return;
        const url = fixImgUrl((r.Img_URL || '').trim());
        const alt = esc((r.Img_Alt || post.Title || '').trim());
        if (!url) return;
        // Images sheet takes priority over inline columns for same index
        map[`[img${num}]`] =
          `<figure class="blog-figure">` +
            `<img class="blog-inline-img"` +
            ` src="${esc(url)}"` +
            ` alt="${alt}"` +
            ` loading="lazy"` +
            ` decoding="async"` +
            ` width="680"` +
            ` height="383">` +
            `<figcaption>${alt}</figcaption>` +
          `</figure>`;
      });
  }

  return map;
}


// ─────────────────────────────────────────────────────────────────────────
//  buildFAQ
//  Fetch FAQ rows for a given blog slug, inject FAQPage structured data
//  into <head>, and return a rendered HTML string for the article footer.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build and inject FAQ content for a blog article.
 *
 * @param {string} slug                          — blog post slug
 * @param {Array<Record<string,string>>} [prefetchedRows]
 *        — already-fetched FAQ rows (avoids a second network call when
 *          renderArticle() pre-fetched them in parallel)
 * @returns {Promise<string>}                    — FAQ HTML or empty string
 */
export async function buildFAQ(slug, prefetchedRows) {
  // Remove any schema injected by a previous article navigation
  const old = document.getElementById('faq-schema');
  if (old) old.remove();

  const allFaqs = prefetchedRows
    ?? await fetchSheet(CFG.api.faq, 'faq');

  if (!allFaqs?.length) return '';

  const pairs = allFaqs
    .filter(r => (r.Blog_Slug || '').trim() === slug)
    .sort((a, b) => Number(a.FAQ_Number || 0) - Number(b.FAQ_Number || 0))
    .map(r => ({
      q: (r.FAQ_Question || '').trim(),
      a: (r.FAQ_Answer   || '').trim(),
    }))
    .filter(p => p.q && p.a);

  if (!pairs.length) return '';

  // ── Inject FAQPage structured data ───────────────────────────────────
  const sd   = document.createElement('script');
  sd.id      = 'faq-schema';
  sd.type    = 'application/ld+json';
  sd.textContent = JSON.stringify({
    '@context':  'https://schema.org',
    '@type':     'FAQPage',
    mainEntity: pairs.map(p => ({
      '@type':         'Question',
      name:             p.q,
      acceptedAnswer: { '@type': 'Answer', text: p.a },
    })),
  });
  document.head.appendChild(sd);

  // ── Render accordion items ────────────────────────────────────────────
  const items = pairs.map(p => `
    <details class="faq-item">
      <summary class="faq-question">${esc(p.q)}</summary>
      <div class="faq-answer">${esc(p.a)}</div>
    </details>`).join('');

  return `
    <section class="faq-section" aria-label="Frequently Asked Questions">
      <h2>Frequently Asked Questions</h2>
      ${items}
    </section>`;
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