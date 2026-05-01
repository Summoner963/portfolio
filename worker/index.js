// ═══════════════════════════════════════════════════════════════════════════
//  worker/index.js — Thin fetch() router
//
//  Responsibilities:
//    • Rate limiting (in-memory, 120 req/min per IP)
//    • Security headers on every response
//    • Route dispatch — delegates 100% to imported handlers
//    • Asset pass-through
//    • /api/data?sheet=<name>  — proxies named sheets (GIDs server-side only)
//    • /sitemap.xml, /robots.txt, /llms.txt
//    • /blog/:slug  — SSR prerender
//    • /chords/:slug — SSR prerender
//    • Known SPA routes — meta-tag injection
//    • Everything else — bare SPA shell
//
//  Open/Closed:
//    Adding a new section = one new import + one new route block here.
//    Zero changes to any other file.
//
//  Security (non-negotiable):
//    • Sheet IDs/GIDs never reach the browser — only /api/data?sheet=<name>
//    • All sheet names whitelisted in worker/sheets.js
//    • CORS: Access-Control-Allow-Origin: same-origin on /api/data
//    • CSP: connect-src 'self' only
//    • Rate limit: 120 req/min per IP (in-memory, resets on Worker cold start)
// ═══════════════════════════════════════════════════════════════════════════

import { getSheetGids }        from './sheets.js';
import {
  escHtml, parseCSV, fixImgUrl, formatDate,
  SECURITY_HEADERS, applySecurityHeaders,
}                              from './utils.js';
import { prerenderBlogPost }   from './ssr/blog.js';
import { prerenderChord }      from './ssr/chords.js';
import {
  SITE_URL,
  ROUTE_META,
  buildSSRHead,
  preNavHTML,
  preFooterHTML,
  hydrationScript,
  serveIndex,
  serveIndexWithMeta,
  generateSitemap,
  htmlCacheHeaders,
}                              from './ssr/meta.js';

// ─────────────────────────────────────────────────────────────────────────
//  In-memory caches (per Worker instance lifetime)
// ─────────────────────────────────────────────────────────────────────────

/** @type {Record<string, {data: string, exp: number}>} */
const _memCache = {};

const CACHE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Retrieve a value from the in-memory cache.
 * @param {string} key
 * @returns {string|null}
 */
function memGet(key) {
  const it = _memCache[key];
  if (!it) return null;
  if (Date.now() > it.exp) { delete _memCache[key]; return null; }
  return it.data;
}

/**
 * Store a value in the in-memory cache.
 * @param {string} key
 * @param {string} data
 */
function memSet(key, data) {
  _memCache[key] = { data, exp: Date.now() + CACHE_MS };
}

// ─────────────────────────────────────────────────────────────────────────
//  Rate limiting (in-memory, per IP, 120 req/min)
// ─────────────────────────────────────────────────────────────────────────

const RL_WINDOW_MS = 60_000; // 1 minute
const RL_MAX       = 120;    // requests per window

/** @type {Record<string, {count: number, windowStart: number}>} */
const _rl = {};

/**
 * Returns true if this IP has exceeded the rate limit.
 * @param {string} ip
 * @returns {boolean}
 */
function isRateLimited(ip) {
  const now   = Date.now();
  const entry = _rl[ip];
  if (!entry || now - entry.windowStart > RL_WINDOW_MS) {
    _rl[ip] = { count: 1, windowStart: now };
    return false;
  }
  entry.count++;
  return entry.count > RL_MAX;
}

// applySecurityHeaders and SECURITY_HEADERS imported from ./utils.js above.

// ─────────────────────────────────────────────────────────────────────────
//  Internal sheet fetcher (used by /api/data and by SSR handlers
//  via the fetchSheetData parameter pattern)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fetches a named sheet, parses CSV, returns array of row objects.
 * Results are cached in-memory for CACHE_MS.
 * Sheet URLs and GIDs never leave this file.
 *
 * @param {string} sheetName  — key from getSheetGids()
 * @param {object} env        — Cloudflare Worker env bindings
 * @returns {Promise<object[]>}
 */
async function fetchSheetData(sheetName, env) {
  const cacheKey = `sheet_${sheetName}`;
  const cached   = memGet(cacheKey);
  if (cached) return parseCSV(cached);

  const gids = getSheetGids(env);
  const gid  = gids[sheetName];
  if (!gid) return [];

  const sheetBase = env.SHEET_BASE || 'https://docs.google.com/spreadsheets/d/e';
  const sheetId   = env.SHEET_ID   || '';
  if (!sheetId) {
    console.warn('[fetchSheetData] SHEET_ID env var not set');
    return [];
  }

  const sheetUrl = `${sheetBase}/${sheetId}/pub?gid=${gid}&single=true&output=csv`;
  try {
    const resp = await fetch(sheetUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Suman-Dangal-Worker/2.0' },
    });
    if (!resp.ok) throw new Error(`Google Sheets HTTP ${resp.status}`);
    const text = await resp.text();
    memSet(cacheKey, text);
    return parseCSV(text);
  } catch (e) {
    console.warn('[fetchSheetData]', sheetName, e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  /api/data?sheet=<name>  handler
// ─────────────────────────────────────────────────────────────────────────

/**
 * Secure named-sheet proxy. Sheet URLs and GIDs never reach the browser.
 * Unknown sheet names → 404. Never proxies arbitrary URLs.
 *
 * @param {URL}    url
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleDataEndpoint(url, env) {
  const sheetName = (url.searchParams.get('sheet') || '').toLowerCase().trim();
  const gids      = getSheetGids(env);

  // Whitelist check — unknown names return 404, not a proxy
  if (!gids[sheetName]) {
    return new Response('Not found', { status: 404 });
  }

  // Serve from cache if fresh
  const cacheKey = `sheet_${sheetName}`;
  const cached   = memGet(cacheKey);
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        'Content-Type':                'text/csv;charset=UTF-8',
        'Cache-Control':               'public, max-age=600, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': 'same-origin',
        'X-Served-From':               'worker-cache',
      },
    });
  }

  const sheetBase = env.SHEET_BASE || 'https://docs.google.com/spreadsheets/d/e';
  const sheetId   = env.SHEET_ID   || '';

  if (!sheetId) {
    console.warn('[/api/data] SHEET_ID env var not set');
    return new Response('Temporarily unavailable', { status: 503 });
  }

  const sheetUrl = `${sheetBase}/${sheetId}/pub?gid=${gids[sheetName]}&single=true&output=csv`;

  try {
    const resp = await fetch(sheetUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Suman-Dangal-Worker/2.0' },
    });
    if (!resp.ok) throw new Error(`Google Sheets HTTP ${resp.status}`);
    const text = await resp.text();
    memSet(cacheKey, text);
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type':                'text/csv;charset=UTF-8',
        'Cache-Control':               'public, max-age=600, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': 'same-origin',
        'X-Served-From':               'google-sheets',
      },
    });
  } catch (e) {
    console.warn('[/api/data]', sheetName, e.message);
    return new Response('Temporarily unavailable', { status: 503 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  /robots.txt
// ─────────────────────────────────────────────────────────────────────────

function handleRobotsTxt() {
  const body =
    `User-agent: *\n` +
    `Allow: /\n` +
    `Disallow: /api/\n` +
    `Sitemap: ${SITE_URL}/sitemap.xml\n`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':  'text/plain;charset=UTF-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  /llms.txt
// ─────────────────────────────────────────────────────────────────────────

function handleLlmsTxt() {
  const body =
`# Suman Dangal — Dev & QA Engineer
# ${SITE_URL}/

> Final-year BCA student building and testing full-stack web and mobile applications.
> Open to Dev and QA internship opportunities in Nepal.

## About

Suman Dangal is a final-year BCA student at Tribhuvan University, Bhaktapur, Nepal.
He specializes in full-stack development (Django, PHP, Java Android) and QA/manual testing.

## Pages

- [Home](${SITE_URL}/)
- [Skills](${SITE_URL}/skills/)
- [Projects](${SITE_URL}/projects/)
- [Blog](${SITE_URL}/blog/)
- [Experience](${SITE_URL}/experience/)
- [About](${SITE_URL}/about/)
- [Contact](${SITE_URL}/contact/)
- [Chord Sheets](${SITE_URL}/chords/)

## Chord Sheets

A curated collection of guitar chord sheets with interactive transpose,
chord diagrams, and auto-scroll. Covers Nepali, devotional, folk, pop,
rock, and classical songs.

## Contact

- Email: sumandangal888@gmail.com
- LinkedIn: https://linkedin.com/in/sumandangal963
`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':  'text/plain;charset=UTF-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Static asset pass-through
// ─────────────────────────────────────────────────────────────────────────

const STATIC_EXT_RE = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot|css|js|txt|json|xml|map)$/i;
const FONT_EXT_RE   = /\.(woff2?|ttf|eot)$/i;

/**
 * Serves a static asset from Cloudflare Pages ASSETS binding.
 * Applies security headers and long-lived caching for fonts.
 *
 * @param {Request} request
 * @param {string}  path
 * @param {object}  env
 * @returns {Promise<Response>}
 */
async function handleStaticAsset(request, path, env) {
  try {
    const assetResp = await env.ASSETS.fetch(request);
    const headers   = applySecurityHeaders(new Headers(assetResp.headers));
    if (FONT_EXT_RE.test(path)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
    return new Response(assetResp.body, { status: assetResp.status, headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Main fetch handler (Cloudflare Worker entry point)
// ─────────────────────────────────────────────────────────────────────────

export default {
  /**
   * @param {Request} request
   * @param {object}  env      — Cloudflare env bindings from wrangler.toml
   * @param {object}  ctx      — ExecutionContext (waitUntil etc.)
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // ── Only allow GET / HEAD ────────────────────────────────────────────
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    // ── Rate limiting ────────────────────────────────────────────────────
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(clientIP)) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After':   '60',
          'Content-Type':  'text/plain',
        },
      });
    }

    // ── /api/data?sheet=<name>  (secure named sheet proxy) ──────────────
    if (path === '/api/data') {
      const resp    = await handleDataEndpoint(url, env);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Legacy endpoint — permanently gone ──────────────────────────────
    if (path === '/api/sheet') {
      return new Response(
        'This endpoint has been removed. Use /api/data?sheet=<name>',
        { status: 410 },
      );
    }

    // ── /sitemap.xml ─────────────────────────────────────────────────────
    if (path === '/sitemap.xml') {
      // generateSitemap needs to fetch blog + chord slugs.
      // Pass fetchSheetData as a parameter to avoid circular imports
      // (meta.js must not import from index.js).
      return await generateSitemap(env, fetchSheetData);
    }

    // ── /robots.txt ──────────────────────────────────────────────────────
    if (path === '/robots.txt') return handleRobotsTxt();

    // ── /llms.txt ────────────────────────────────────────────────────────
    if (path === '/llms.txt') return handleLlmsTxt();

    // ── Static assets ────────────────────────────────────────────────────
    if (STATIC_EXT_RE.test(path)) {
      return await handleStaticAsset(request, path, env);
    }

    // ── Blog post SSR — /blog/:slug ──────────────────────────────────────
    // Full HTML prerender for crawlers & social sharing bots.
    // Real users are redirected to the SPA via the hydration script.
    const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) {
      const slug = decodeURIComponent(blogMatch[1]);
      const resp = await prerenderBlogPost(slug, env, request, fetchSheetData);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Chord detail SSR — /chords/:slug ─────────────────────────────────
    // Same pattern as blog SSR. Renders MusicComposition schema + full tab.
    const chordMatch = path.match(/^\/chords\/([^/]+)\/?$/);
    if (chordMatch) {
      const slug = decodeURIComponent(chordMatch[1]);
      const resp = await prerenderChord(slug, env, request, fetchSheetData);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Chord list page — /chords ─────────────────────────────────────────
    // Treated as a known SPA route with meta injection.
    // (ROUTE_META['/chords'] is defined in worker/ssr/meta.js)
    if (path === '/chords' || path === '/chords/') {
      const normPath = '/chords';
      const resp     = await serveIndexWithMeta(env, request, normPath);
      const headers  = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Known SPA routes — inject per-route meta tags ────────────────────
    // Social crawlers (Facebook, Twitter, LinkedIn, Slack, Discord, etc.)
    // send requests with no JS. They receive an index.html with correct
    // og:title / og:description / canonical already set in the HTML.
    const normPath = path === '/' ? '/' : path.replace(/\/$/, '');
    if (ROUTE_META[normPath]) {
      const resp    = await serveIndexWithMeta(env, request, normPath);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Everything else — bare SPA shell ─────────────────────────────────
    // The client-side router handles unknown paths (shows 404 overlay).
    const resp    = await serveIndex(env, request);
    const headers = applySecurityHeaders(new Headers(resp.headers));
    return new Response(resp.body, { status: resp.status, headers });
  },
};