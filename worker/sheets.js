// worker/sheets.js
// ═══════════════════════════════════════════════════════════════════════════
//  Google Sheets ("Publish to web" CSV) — the only place sheet IDs are used.
//
//  Cache layers (Phase 3, option A):
//   1. isolate memory — parsed rows, MEM_TTL_MS
//   2. Cache API (per data centre) — raw CSV; fresh FRESH_MS, then served
//      stale while a background refresh runs; last-good copy kept STALE_KEEP_S
//   3. Google — with a timeout; HTML responses (unpublished sheet) rejected
//  Returns null only when Google fails AND nothing is cached.
// ═══════════════════════════════════════════════════════════════════════════

import { cleanBlogRows, cleanListRows, LIST_REQUIRED } from '../public/js/shared/render.js';
import { parseCSV } from './utils.js';

/** Logical sheet name → GID. GIDs are not secrets; SHEET_ID is. */
export function getSheetGids(env) {
  return {
    blog:     env.BLOG_GID     || '1132024800',
    skills:   env.SKILLS_GID   || '302402061',
    projects: env.PROJECTS_GID || '0',
    exp:      env.EXP_GID      || '245982630',
    about:    env.ABOUT_GID    || '1066410604',
    faq:      env.FAQ_GID      || '303688554',
    images:   env.IMAGES_GID   || '1267436347',
    featured: env.FEATURED_GID || '980532084',
    site:     env.SITE_GID     || '1953062973', // Key | Value: all one-off site text
  };
}

const MEM_TTL_MS       = 60 * 1000;
const FRESH_MS         = 5 * 60 * 1000;
const STALE_KEEP_S     = 7 * 24 * 60 * 60;
const SHEET_TIMEOUT_MS = 4000;
const CACHE_ORIGIN     = 'https://sheet-cache.invalid'; // synthetic Cache API key space

const _mem = new Map();      // name → { text, rows, at: fetched, checked: last validated }
const _inflight = new Map(); // name → Promise<string|null> (dedupe concurrent refreshes)

function sheetUrl(name, env) {
  const id = env.SHEET_ID || '';
  if (!id) return null;
  const base = env.SHEET_BASE || 'https://docs.google.com/spreadsheets/d/e';
  return `${base}/${encodeURIComponent(id)}/pub?gid=${encodeURIComponent(getSheetGids(env)[name])}&single=true&output=csv`;
}

async function fetchFromGoogle(name, env, ctx) {
  const url = sheetUrl(name, env);
  if (!url) { console.warn('[sheets] SHEET_ID secret not set'); return null; }
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal:   AbortSignal.timeout(SHEET_TIMEOUT_MS),
      headers:  { 'User-Agent': 'Suman-Dangal-Worker/3.0' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('not CSV (sheet unpublished?)');
    const at = Date.now();
    _mem.set(name, { text, rows: null, at, checked: at });
    const put = caches.default.put(new Request(`${CACHE_ORIGIN}/${name}`), new Response(text, {
      headers: { 'Cache-Control': `public, max-age=${STALE_KEEP_S}`, 'X-Fetched-At': String(at) },
    })).catch(() => {});
    ctx?.waitUntil?.(put);
    return text;
  } catch (e) {
    console.warn('[sheets]', name, e.message); // never logs the URL (contains SHEET_ID)
    return null;
  }
}

function refresh(name, env, ctx) {
  if (!_inflight.has(name)) {
    const p = fetchFromGoogle(name, env, ctx).finally(() => _inflight.delete(name));
    _inflight.set(name, p);
  }
  return _inflight.get(name);
}

/** Raw CSV text or null. */
export async function getSheetCSV(name, env, ctx) {
  if (!getSheetGids(env)[name]) return null;
  const now = Date.now();

  let mem = _mem.get(name);
  if (mem && now - mem.checked < MEM_TTL_MS) return mem.text;

  // Newest of: this isolate's copy, the data-centre cache
  try {
    const hit = await caches.default.match(new Request(`${CACHE_ORIGIN}/${name}`));
    const at = hit ? Number(hit.headers.get('X-Fetched-At')) || 0 : 0;
    if (hit && (!mem || at > mem.at)) mem = { text: await hit.text(), rows: null, at };
  } catch {} // Cache API unavailable in some contexts

  if (mem) {
    mem.checked = now;
    _mem.set(name, mem);
    if (now - mem.at >= FRESH_MS) ctx?.waitUntil?.(refresh(name, env, ctx)); // stale-while-revalidate
    return mem.text;
  }
  return refresh(name, env, ctx);
}

/** Parsed rows (blog rows cleaned) or null when unavailable. */
export async function getRows(name, env, ctx) {
  const text = await getSheetCSV(name, env, ctx);
  if (text == null) return null;
  const mem = _mem.get(name);
  if (mem && mem.text === text && mem.rows) return mem.rows;
  const parsed = parseCSV(text);
  const rows = name === 'blog' ? cleanBlogRows(parsed)
             : LIST_REQUIRED[name] ? cleanListRows(parsed, LIST_REQUIRED[name]) // Status, Order, empty rows
             : parsed;
  if (mem && mem.text === text) mem.rows = rows;
  return rows;
}

/** Rows → CSV (used to re-serialise filtered sheets for /api/data). */
export function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(cell).join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n');
}

/**
 * After a CMS save: drop this isolate's copy and this data centre's cached CSV
 * so the editor sees the change soonest. Other data centres refresh on their
 * normal TTL (Phase 3 option A); Google's own republish delay still applies.
 */
export async function invalidateSheet(name) {
  _mem.delete(name);
  try { await caches.default.delete(new Request(`${CACHE_ORIGIN}/${name}`)); } catch {}
}
