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
 *   js/views/chords.js      → renderChords, renderChordDetail
 */

// ─── Static imports (always needed, zero lazy overhead) ───────────────────
import { registerRoute, registerPrefix, boot } from './router.js';
import { fetchSheet, CFG }                     from './api.js';
import { updateSEO }                            from './seo.js';
import { watchReveals }                         from './utils.js';

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

// ── Home (/') ──────────────────────────────────────────────────────────────
registerRoute('/', async () => {
  const { renderHome } = await import('./views/home.js');
  updateSEO({ path: '/' });
  await renderHome();
  watchReveals();
  // renderFeaturedPosts is called inside renderHome() — no separate call needed.
});

// ── Skills (/skills) ───────────────────────────────────────────────────────
registerRoute('/skills', async () => {
  const { renderSkills } = await import('./views/skills.js');
  updateSEO({
    title: 'Skills & Stack',
    desc:  'Python, Django, PHP, Java, Android Studio, manual QA — skills of Suman Dangal.',
    path:  '/skills',
  });
  await renderSkills();
  watchReveals();
});

// ── Projects (/projects) ───────────────────────────────────────────────────
registerRoute('/projects', async () => {
  const { renderProjects } = await import('./views/projects.js');
  updateSEO({
    title: 'Projects',
    desc:  'Django e-commerce, PHP library system, Android Bluetooth app — projects by Suman Dangal.',
    path:  '/projects',
  });
  await renderProjects();
  watchReveals();
});

// ── Blog list (/blog) ──────────────────────────────────────────────────────
registerRoute('/blog', async ({ searchParams } = {}) => {
  const { renderBlogList } = await import('./views/blog.js');
  updateSEO({
    title: 'Blog',
    desc:  'Dev notes, QA tips, and tech writing by Suman Dangal — final-year BCA student.',
    path:  '/blog',
  });
  const page = parseInt(searchParams?.get?.('page') || '1') || 1;
  await renderBlogList(page);
  watchReveals();
});

// ── Blog article (/blog/:slug) ─────────────────────────────────────────────
// Must be registered AFTER /blog so the prefix match doesn't swallow /blog.
// The router checks exact routes first, so ordering here is just for clarity.
registerPrefix('/blog/', async ({ slug }) => {
  const { renderArticle } = await import('./views/blog.js');
  // SEO is set inside renderArticle once the post data is known
  await renderArticle(slug);
  watchReveals();
});

// ── Experience (/experience) ───────────────────────────────────────────────
registerRoute('/experience', async () => {
  const { renderExperience } = await import('./views/experience.js');
  updateSEO({
    title: 'Experience',
    desc:  'SEO Intern at Sathi Edtech and QA/testing projects — work experience of Suman Dangal.',
    path:  '/experience',
  });
  await renderExperience();
  watchReveals();
});

// ── About (/about) ─────────────────────────────────────────────────────────
registerRoute('/about', async () => {
  const { renderAbout } = await import('./views/about.js');
  updateSEO({
    title: 'About Suman Dangal',
    desc:  'BCA student at Tribhuvan University, Bhaktapur, Nepal. Full-stack dev and QA tester.',
    path:  '/about',
  });
  await renderAbout();
  watchReveals();
});

// ── Contact (/contact) ─────────────────────────────────────────────────────
registerRoute('/contact', async () => {
  const { renderContact } = await import('./views/contact.js');
  updateSEO({
    title: 'Contact',
    desc:  'Get in touch with Suman Dangal for Dev or QA internship opportunities in Nepal.',
    path:  '/contact',
  });
  await renderContact();
  watchReveals();
});

// ── Chord list (/chords) ───────────────────────────────────────────────────
// Not in the main nav — linked from hero + about page.
// Exact route registered before the prefix so /chords renders the list,
// not the detail handler.
registerRoute('/chords', async () => {
  const { renderChords } = await import('./views/chords.js');
  updateSEO({
    title: 'Chord Sheets',
    desc:  'Guitar chord sheets and tabs — Nepali, pop, folk, devotional songs by Suman Dangal.',
    path:  '/chords',
  });
  await renderChords();
  watchReveals();
});

// ── Chord detail (/chords/:slug) ───────────────────────────────────────────
registerPrefix('/chords/', async ({ slug }) => {
  const { renderChordDetail } = await import('./views/chords.js');
  // SEO is set inside renderChordDetail once row data is known
  await renderChordDetail(slug);
  watchReveals();
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