// ═══════════════════════════════════════════════════════════════════════════
//  worker/index.js — Cloudflare Pages advanced-mode entry (via public/_worker.js)
//
//  Order of decisions for every request:
//    1. Host policy   — pages.dev / www → 301 custom domain; previews noindex
//    2. Method check  — GET/HEAD (+ POST on CMS endpoints only)
//    3. Rate limit    — per-isolate, crawlers exempt
//    4. API + files   — /api/data, CMS API, sitemap, robots, feed, llms,
//                       /blog/<slug>.md, IndexNow key file
//    5. Static assets — anything with a file extension → env.ASSETS
//    6. Canonical URL — trailing slash, //, /index.html, legacy slugs → 301
//    7. Pages         — index.html + HTMLRewriter (worker/shell.js)
//  Security headers are added to every response in finalize().
// ═══════════════════════════════════════════════════════════════════════════

import { ROUTES, siteMap, LIST_REQUIRED } from '../public/js/shared/render.js';
import { finalize, hostPolicy, canonicalPath, redirect, isRateLimited, isSearchCrawler } from './http.js';
import { getSheetGids, getSheetCSV, getRows, toCSV, invalidateSheet } from './sheets.js';
import { rewriteShell } from './shell.js';
import { homePage, sectionPage, blogListPage, blogPostPage, adminPage, notFoundPage } from './pages.js';
import { robotsTxt, sitemapXml, feedXml, llmsTxt, llmsFullTxt, postMarkdownFile, liveUrls } from './seo-files.js';
import { keyFileResponse, handleIndexNow } from './indexnow.js';
import { handleCMSRead, handleCMSWrite } from './cms-proxy.js';
import {
  checkCredentials, issueSession, clearSessionCookie, getSession,
  isSameOriginJson, csrfOk, isLockedOut, recordFailure, clearFailures,
} from './auth.js';

const ADMIN_PATH = '/back-lab';
const CMS_POST = new Set(['/api/cms/login', '/api/cms/logout', '/api/cms/read', '/api/cms/write', '/api/cms/indexnow']);
const CMS_GET  = new Set(['/api/cms/session']);
const _cmsRl = new Map();
const json = (obj, status, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = hostPolicy(url);
    if (host.redirectTo) return finalize(redirect(host.redirectTo));
    const res = await route(request, env, ctx, url);
    return finalize(res, { noindex: host.noindex });
  },
};

async function route(request, env, ctx, url) {
  const path = url.pathname;
  const method = request.method;

  if (method !== 'GET' && method !== 'HEAD' && !(method === 'POST' && CMS_POST.has(path))) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!isSearchCrawler(request.headers.get('User-Agent')) && isRateLimited(ip)) {
    return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60', 'Content-Type': 'text/plain' } });
  }

  // ── API ──────────────────────────────────────────────────────────────
  if (path === '/api/data') return dataEndpoint(url, env, ctx);
  if (path.startsWith('/api/cms/')) return cmsEndpoint(path, request, env, ctx, ip);
  if (path === '/api/sheet') return new Response('Gone', { status: 410 });
  if (path.startsWith('/api/')) return new Response('Not found', { status: 404 });

  // ── Generated files ──────────────────────────────────────────────────
  if (path === '/sitemap.xml')   return sitemapXml(env, ctx);
  if (path === '/robots.txt')    return robotsTxt();
  if (path === '/feed.xml')      return feedXml(env, ctx);
  if (path === '/llms.txt')      return llmsTxt(env, ctx);
  if (path === '/llms-full.txt') return llmsFullTxt(env, ctx);
  const mdPost = path.match(/^\/blog\/([^/]+)\.md$/);
  if (mdPost) return postMarkdownFile(safeDecode(mdPost[1]), env, ctx);
  const keyFile = keyFileResponse(path, env);
  if (keyFile) return keyFile;

  // ── Static assets (Phase 6 moves most of these out via _routes.json) ─
  // Slugs may contain dots, so /blog/<slug> is always a page
  const isAsset = /\.[a-z0-9]{1,12}$/i.test(path) && !/^\/blog\/[^/]+$/.test(path) && !/\/index\.html?$/i.test(path);
  if (isAsset) return staticAsset(request, env, path);

  // ── Canonical URL ────────────────────────────────────────────────────
  const canon = canonicalPath(url);
  if (canon) return redirect(canon);

  return renderPage(request, env, ctx, url);
}

async function staticAsset(request, env, path) {
  const res = await env.ASSETS.fetch(request);
  // Without a matching file, Pages answers with the SPA shell (200 text/html).
  // A missing .js/.png/… must be a real 404, not a soft-404 page.
  if (res.ok && /text\/html/i.test(res.headers.get('Content-Type') || '') && !/\.html?$/i.test(path)) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  }
  return res;
}

async function renderPage(request, env, ctx, url) {
  const path = url.pathname;
  let page;
  const post = path.match(/^\/blog\/([^/]+)$/);
  const site = siteMap(await getRows('site', env, ctx)); // {} if the tab is missing/unreachable
  if (path === '/')                 page = await homePage(env, ctx, site);
  else if (path === '/blog')        page = await blogListPage(url, env, ctx, site);
  else if (post)                    page = await blogPostPage(safeDecode(post[1]), env, ctx);
  else if (ROUTES[path])            page = await sectionPage(path, env, ctx, site);
  else if (path === ADMIN_PATH)     page = adminPage(); // login form; data needs a session
  else                              page = notFoundPage(path);

  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: { Accept: 'text/html' } }));
  const headers = {
    'Content-Type': 'text/html;charset=UTF-8',
    'Cache-Control': page.status === 200 && page.robots !== 'noindex, nofollow'
      ? 'public, max-age=300, stale-while-revalidate=86400' : 'no-store',
    ...(page.status === 503 ? { 'Retry-After': '120' } : {}),
    ...(page.robots === 'noindex, nofollow' ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  };
  page.site = site;
  return rewriteShell(page).transform(new Response(shell.body, { status: page.status, headers }));
}

// ── /api/data?sheet=<name> — allow-listed, drafts removed ──────────────
async function dataEndpoint(url, env, ctx) {
  const name = (url.searchParams.get('sheet') || '').toLowerCase().trim();
  if (!getSheetGids(env)[name]) return new Response('Not found', { status: 404 });

  let body;
  if (name === 'blog' || name === 'faq' || name === 'images') {
    const [rows, blog] = await Promise.all([getRows(name, env, ctx), name === 'blog' ? null : getRows('blog', env, ctx)]);
    if (rows == null || (name !== 'blog' && blog == null)) body = null;
    else if (name === 'blog') body = toCSV(rows);
    else {
      // FAQ/images rows of unpublished posts never leave the worker ('contact' FAQ is page-level)
      const live = new Set([...blog.map(p => p.Slug), 'contact']);
      body = toCSV(rows.filter(r => live.has(String(r.Blog_Slug || '').trim())));
    }
  } else if (LIST_REQUIRED[name]) {
    const rows = await getRows(name, env, ctx); // hidden/empty rows removed, sorted by Order
    body = rows == null ? null : toCSV(rows);
  } else {
    body = await getSheetCSV(name, env, ctx);
  }
  if (body == null) return new Response('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '60' } });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv;charset=UTF-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'X-Robots-Tag': 'noindex', // crawlable for rendering, never indexed itself
    },
  });
}

// ── CMS API — session cookie + CSRF token + same-origin JSON ───────────
async function cmsEndpoint(path, request, env, ctx, ip) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  const reply = (obj, status = 200, extra = {}) => json(obj, status, { ...headers, ...extra });
  const known = (request.method === 'POST' && CMS_POST.has(path)) || (request.method === 'GET' && CMS_GET.has(path));
  if (!known) return reply({ ok: false, error: 'Not found' }, 404);
  if (isRateLimited(ip, 60, 60_000, _cmsRl)) return reply({ ok: false, error: 'Too many requests' }, 429, { 'Retry-After': '60' });

  if (path === '/api/cms/session') {
    const session = await getSession(request, env);
    if (!session) return reply({ ok: false, error: 'Signed out' }, 401);
    return reply({ ok: true, user: session.user, csrf: session.csrf },
      200, session.rotateCookie ? { 'Set-Cookie': session.rotateCookie } : {});
  }
  if (!isSameOriginJson(request)) return reply({ ok: false, error: 'Forbidden' }, 403);

  if (path === '/api/cms/login') {
    if (await isLockedOut(ip)) return reply({ ok: false, error: 'Too many attempts — try again in 15 minutes' }, 429, { 'Retry-After': '900' });
    const text = await request.text();
    let body = null;
    if (text.length <= 2048) { try { body = JSON.parse(text); } catch {} }
    const ok = body && await checkCredentials(body.username, body.password, env);
    if (!ok) {
      await recordFailure(ip, ctx);
      return reply({ ok: false, error: 'Invalid username or password' }, 401);
    }
    await clearFailures(ip);
    const { cookie } = await issueSession(env, String(body.username));
    const session = await getSession(new Request(request.url, { headers: { Cookie: cookie.split(';')[0] } }), env);
    return reply({ ok: true, csrf: session?.csrf }, 200, { 'Set-Cookie': cookie });
  }
  if (path === '/api/cms/logout') return reply({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });

  // read / write
  const session = await getSession(request, env);
  if (!session) return reply({ ok: false, error: 'Signed out' }, 401);
  if (!csrfOk(request, session)) return reply({ ok: false, error: 'Forbidden' }, 403);

  let res;
  if (path === '/api/cms/read') {
    res = await handleCMSRead(request, env);
  } else if (path === '/api/cms/indexnow') {
    const [obj, status] = await handleIndexNow(request, env, await liveUrls(env, ctx));
    res = json(obj, status);
  } else {
    const out = await handleCMSWrite(request, env);
    res = out.res;
    if (out.sheet) ctx.waitUntil(invalidateSheet(out.sheet));
  }
  const final = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) final.headers.set(k, v);
  if (session.rotateCookie) {
    final.headers.append('Set-Cookie', session.rotateCookie);
    final.headers.set('X-CSRF-Token', session.csrf); // new session id ⇒ new token
  }
  return final;
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}
