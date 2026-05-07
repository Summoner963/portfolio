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
import { handleCMSAuth }       from './cms-auth.js';
import { handleCMSRead, handleCMSWrite } from './cms-proxy.js';
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

function memGet(key) {
  const it = _memCache[key];
  if (!it) return null;
  if (Date.now() > it.exp) { delete _memCache[key]; return null; }
  return it.data;
}

function memSet(key, data) {
  _memCache[key] = { data, exp: Date.now() + CACHE_MS };
}

// ─────────────────────────────────────────────────────────────────────────
//  Rate limiting (in-memory, per IP, 120 req/min)
// ─────────────────────────────────────────────────────────────────────────

const RL_WINDOW_MS = 60_000;
const RL_MAX       = 120;

/** @type {Record<string, {count: number, windowStart: number}>} */
const _rl = {};

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

// ─────────────────────────────────────────────────────────────────────────
//  Internal sheet fetcher
// ─────────────────────────────────────────────────────────────────────────

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

async function handleDataEndpoint(url, env) {
  const sheetName = (url.searchParams.get('sheet') || '').toLowerCase().trim();
  const gids      = getSheetGids(env);

  if (!gids[sheetName]) {
    return new Response('Not found', { status: 404 });
  }

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
    `Disallow: /back-lab\n` +
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
//  Main fetch handler
// ─────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // ── Method check ──────────────────────────────────────────────────────
    const CMS_POST_PATHS = new Set(['/api/cms/auth', '/api/cms/read', '/api/cms/write']);

    if (method !== 'GET' && method !== 'HEAD') {
      if (method === 'POST' && CMS_POST_PATHS.has(path)) {
        // allowed — falls through to route handlers below
      } else {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(clientIP)) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60', 'Content-Type': 'text/plain' },
      });
    }

    // ── /api/data?sheet=<name> ─────────────────────────────────────────────
    if (path === '/api/data') {
      const resp    = await handleDataEndpoint(url, env);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── CMS auth ───────────────────────────────────────────────────────────
    if (path === '/api/cms/auth') {
      const resp    = await handleCMSAuth(request, env);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── CMS read ───────────────────────────────────────────────────────────
    if (path === '/api/cms/read') {
      const resp    = await handleCMSRead(request, env);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── CMS write ──────────────────────────────────────────────────────────
    if (path === '/api/cms/write') {
      const resp    = await handleCMSWrite(request, env);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Legacy endpoint ────────────────────────────────────────────────────
    if (path === '/api/sheet') {
      return new Response(
        'This endpoint has been removed. Use /api/data?sheet=<name>',
        { status: 410 },
      );
    }

    // ── /sitemap.xml ───────────────────────────────────────────────────────
    if (path === '/sitemap.xml') {
      return await generateSitemap(env, fetchSheetData);
    }

    // ── /robots.txt ────────────────────────────────────────────────────────
    if (path === '/robots.txt') return handleRobotsTxt();

    // ── /llms.txt ──────────────────────────────────────────────────────────
    if (path === '/llms.txt') return handleLlmsTxt();

    // ── Static assets ──────────────────────────────────────────────────────
    if (STATIC_EXT_RE.test(path)) {
      return await handleStaticAsset(request, path, env);
    }

    // ── Blog post SSR — /blog/:slug ────────────────────────────────────────
    const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) {
      const slug    = decodeURIComponent(blogMatch[1]);
      const resp    = await prerenderBlogPost(slug, env, request, fetchSheetData);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Chord detail SSR — /chords/:slug ──────────────────────────────────
    const chordMatch = path.match(/^\/chords\/([^/]+)\/?$/);
    if (chordMatch) {
      const slug    = decodeURIComponent(chordMatch[1]);
      const resp    = await prerenderChord(slug, env, request, fetchSheetData);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Chord list page — /chords ──────────────────────────────────────────
    if (path === '/chords' || path === '/chords/') {
      const normPath = '/chords';
      const resp     = await serveIndexWithMeta(env, request, normPath);
      const headers  = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Known SPA routes — inject per-route meta tags ──────────────────────
    const normPath = path === '/' ? '/' : path.replace(/\/$/, '');
    if (ROUTE_META[normPath]) {
      const resp    = await serveIndexWithMeta(env, request, normPath);
      const headers = applySecurityHeaders(new Headers(resp.headers));
      return new Response(resp.body, { status: resp.status, headers });
    }

    // ── Everything else — bare SPA shell ──────────────────────────────────
    const resp    = await serveIndex(env, request);
    const headers = applySecurityHeaders(new Headers(resp.headers));
    return new Response(resp.body, { status: resp.status, headers });
  },
};