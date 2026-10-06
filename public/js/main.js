/**
 * js/main.js
 *
 * Entry point for the Suman Dangal SPA.
 *
 * Responsibilities:
 *   - Import every view module (lazy where possible via dynamic import)
 *   - Import router helpers (registerRoute, registerPrefix, boot)
 *   - Register every route / prefix — ONE place, full list
 *   - Boot the router (reads location.pathname on first load)
 *
 * Open/Closed principle:
 *   Adding a new section = import its view + one registerRoute() call here.
 *   Zero changes to router.js, zero changes to any other view file.
 *
 * Dynamic imports:
 *   Views are loaded only when their route is first visited.
 *   The router passes a lazy loader to registerRoute(); the loader is
 *   called once and the result is cached by the router.
 *
 * Static imports (always loaded):
 *   - router.js  — tiny, needed before first navigation
 *   - api.js     — needed by every view; pre-warm the cache early
 *   - seo.js     — called immediately on every route change
 *   - utils.js   — shared helpers used by router + views
 *
 * Dependencies (must already exist):
 *   js/router.js        → registerRoute, registerPrefix, boot
 *   js/api.js           → fetchSheet, CFG (pre-warm)
 *   js/seo.js           → updateSEO
 *   js/utils.js         → watchReveals, pStart, pEnd
 *   js/views/home.js        → renderHome, renderFeaturedPosts
 *   js/views/blog.js        → renderBlogList, renderArticle
 *   js/views/skills.js      → renderSkills
 *   js/views/projects.js    → renderProjects
 *   js/views/about.js       → renderAbout
 *   js/views/experience.js  → renderExperience
 *   js/views/contact.js     → renderContact
 */

// ─── Static imports (always needed, zero lazy overhead) ───────────────────
import { registerRoute, registerPrefix, boot } from './router.js';
import { fetchSheet, CFG }                     from './api.js';
import { updateSEO }                            from './seo.js';
import { ROUTES, SITE_URL }                     from './shared/render.js';

// Apply the font stylesheet that index.html loads with media="print"
// (non-blocking without an inline onload handler — keeps the CSP strict).
const fontCss = document.getElementById('font-css');
if (fontCss) fontCss.media = 'all';

// ─────────────────────────────────────────────────────────────────────────
//  ROUTE REGISTRATIONS
//
//  registerRoute(path, handler)
//    Exact match on pathname. handler(params) is called on every visit.
//
//  registerPrefix(prefix, handler)
//    Matches any path that starts with prefix.
//    handler receives { slug } where slug = path segment after prefix.
//
//  Route priority: exact routes are checked before prefix routes.
//  The router calls the first match it finds (in registration order).
// ─────────────────────────────────────────────────────────────────────────

// Head metadata for list routes comes from the shared ROUTES table, so the
// SPA sets exactly what the worker rendered for the same URL.
const sectionSEO = path => updateSEO({
  path, crumbs: [{ name: ROUTES[path].heading, url: SITE_URL + path }],
});

// ── Home (/) ───────────────────────────────────────────────────────────────
registerRoute('/', async () => {
  const { renderHome } = await import('./views/home.js');
  updateSEO({ path: '/' });
  await renderHome();
});

// ── Sections ───────────────────────────────────────────────────────────────
const SECTIONS = {
  '/skills':     () => import('./views/skills.js').then(m => m.renderSkills()),
  '/projects':   () => import('./views/projects.js').then(m => m.renderProjects()),
  '/experience': () => import('./views/experience.js').then(m => m.renderExperience()),
  '/about':      () => import('./views/about.js').then(m => m.renderAbout()),
  '/contact':    () => import('./views/contact.js').then(m => m.renderContact()),
  '/privacy':    async () => {},  // static HTML in index.html
};
for (const [path, render] of Object.entries(SECTIONS)) {
  registerRoute(path, async () => {
    sectionSEO(path);
    await render();
  });
}

// ── Blog list (/blog, /blog?page=N) ────────────────────────────────────────
registerRoute('/blog', async ({ searchParams } = {}) => {
  const { renderBlogList } = await import('./views/blog.js');
  const page = Math.max(1, parseInt(searchParams?.get?.('page') || '1', 10) || 1);
  const path = page > 1 ? `/blog?page=${page}` : '/blog';
  updateSEO({
    path,
    title: page > 1 ? `Blog — Page ${page} | Suman Dangal` : undefined,
    crumbs: [{ name: 'Blog', url: `${SITE_URL}/blog` }],
  });
  await renderBlogList(page);
});

// ── Blog article (/blog/:slug) — SEO is set by renderArticle ───────────────
registerPrefix('/blog/', async ({ slug }) => {
  const { renderArticle } = await import('./views/blog.js');
  await renderArticle(slug);
});

// ── Admin (never indexed; the worker also sends X-Robots-Tag) ──────────────
registerRoute('/back-lab', async () => {
  const { renderCMS } = await import('./views/cms.js');
  updateSEO({ path: '/back-lab', title: 'Content Studio | Suman Dangal', desc: 'Private content management.', noindex: true });
  await renderCMS();
});

// ─────────────────────────────────────────────────────────────────────────
//  BOOT
//  Must come AFTER all registerRoute / registerPrefix calls.
//  Reads location.pathname + location.search and dispatches the first route.
// ─────────────────────────────────────────────────────────────────────────
boot();

// ─────────────────────────────────────────────────────────────────────────
//  OFFLINE BANNER
//  Wired here so it's available from first load regardless of which view
//  is active.  The banner element lives in index.html.
// ─────────────────────────────────────────────────────────────────────────
(function initOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  const show = () => { banner.style.display = 'block'; };
  const hide = () => { banner.style.display = 'none';  };
  window.addEventListener('online',  hide);
  window.addEventListener('offline', show);
  if (!navigator.onLine) show();
})();

// Mobile nav burger is wired in js/router.js — no duplicate needed here.

// ─────────────────────────────────────────────────────────────────────────
//  CACHE PRE-WARM  (optional — fires after first route settles)
//  Kick off blog + skills fetches in the background after 2 s so that
//  subsequent navigation to those routes feels instant.
//  Uses requestIdleCallback when available; falls back to setTimeout.
// ─────────────────────────────────────────────────────────────────────────
(function prewarm() {
  const warm = () => {
    // Only pre-warm if we're on the home page — avoids redundant fetches
    // when the user landed directly on /blog or /skills.
    if (location.pathname !== '/') return;
    fetchSheet(CFG.api.blog,   'blog').catch(() => {});
    fetchSheet(CFG.api.skills, 'skills').catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(warm, { timeout: 3000 });
  } else {
    setTimeout(warm, 2000);
  }
})();