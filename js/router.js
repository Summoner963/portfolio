/**
 * js/router.js — Suman Dangal SPA Router
 *
 * Public API (all named exports):
 *   registerRoute(path, handler)          — exact path match, e.g. '/blog'
 *   registerPrefix(prefix, handler)       — prefix match, e.g. '/blog' catches '/blog/my-slug'
 *   navigate(rawPath, push?)              — programmatic navigation
 *
 * Internal wiring (called once at module load):
 *   - document 'click' listener for [data-link] anchors
 *   - window 'popstate' listener
 *   - mobile burger open/close
 *
 * Design rules:
 *   - This file knows ZERO view names. All routing logic lives in js/main.js.
 *   - Handlers receive a context object: { path, parts, slug, params, searchParams }
 *   - Progress bar (pStart / pEnd) imported from js/utils.js
 *   - updateSEO NOT called here — each handler is responsible for its own SEO
 *   - 404 fallback renders into #heroSection overlay (preserves existing pattern)
 */

import { pStart, pEnd, esc, watchReveals } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────
//  Route registry
// ─────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ path: string, parts: string[], slug: string, params: Record<string,string>, searchParams: URLSearchParams }} RouteContext
 * @typedef {(ctx: RouteContext) => void | Promise<void>} RouteHandler
 */

/** @type {Map<string, RouteHandler>} — exact path → handler */
const _exactRoutes = new Map();

/** @type {Array<{ prefix: string, handler: RouteHandler }>} — ordered by registration */
const _prefixRoutes = [];

/**
 * Register an exact-path route.
 * @param {string} path        e.g. '/', '/skills', '/blog'
 * @param {RouteHandler} handler
 */
export function registerRoute(path, handler) {
  _exactRoutes.set(path, handler);
}

/**
 * Register a prefix route (catches the prefix itself and any deeper path).
 * Used for /blog (catches /blog and /blog/:slug) and /chords.
 * Registration order matters — first match wins when prefixes overlap.
 * @param {string} prefix      e.g. '/blog', '/chords'
 * @param {RouteHandler} handler
 */
export function registerPrefix(prefix, handler) {
  _prefixRoutes.push({ prefix, handler });
}

// ─────────────────────────────────────────────────────────────────────────
//  DOM references (resolved lazily so router.js can be imported before DOM ready)
// ─────────────────────────────────────────────────────────────────────────

/** @returns {HTMLElement|null} */
const el = id => document.getElementById(id);

// ─────────────────────────────────────────────────────────────────────────
//  Active nav link management
// ─────────────────────────────────────────────────────────────────────────

/**
 * Set aria-current="page" on the nav link whose href matches the current route.
 * @param {string} route  — first path segment, e.g. '' | 'skills' | 'blog'
 */
function _setActiveNav(route) {
  document.querySelectorAll('.nav-links a[data-link]').forEach(a => {
    const linkRoute = new URL(a.getAttribute('href') || '/', location.origin)
      .pathname.replace(/^\//, '').split('/')[0];
    a.setAttribute('aria-current', linkRoute === route ? 'page' : 'false');
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  View management — show one view, hide all others
// ─────────────────────────────────────────────────────────────────────────

/**
 * Activate a view element by id and deactivate all others.
 * Views must have class="view"; active view gains class="active".
 * @param {string} viewId  — e.g. 'view-home', 'view-blog'
 */
export function showView(viewId) {
  document.querySelectorAll('#app .view').forEach(v => {
    v.classList.toggle('active', v.id === viewId);
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  404 overlay
// ─────────────────────────────────────────────────────────────────────────

function _remove404() {
  const old = el('spa-404-overlay');
  if (old) old.remove();
}

function _show404(path) {
  _remove404();
  const heroSec = el('heroSection');
  if (!heroSec) return;
  heroSec.style.position = 'relative';
  const ov = document.createElement('div');
  ov.id = 'spa-404-overlay';
  ov.innerHTML =
    `<div class="not-found-wrap">` +
      `<span class="not-found-code" aria-hidden="true">404</span>` +
      `<h2>Page not found</h2>` +
      `<p>The path <code style="font-family:var(--mono);color:var(--accent)">${esc(path)}</code> doesn't exist.</p>` +
      `<a href="/" class="btn btn-solid" data-link>← Back to Home</a>` +
    `</div>`;
  heroSec.appendChild(ov);
}

// ─────────────────────────────────────────────────────────────────────────
//  Path normalisation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalise a raw URL path — strips legacy artefacts from old deployments,
 * collapses duplicate slashes, ensures root is '/'.
 * @param {string} raw
 * @returns {string}
 */
function _normalisePath(raw) {
  return (raw || '/')
    .replace(/\/portfolio-upload\/?/g, '/')
    .replace(/\/index\.html?$/i, '/')
    .replace(/\/+/g, '/')
    || '/';
}

// ─────────────────────────────────────────────────────────────────────────
//  View ID resolution
// ─────────────────────────────────────────────────────────────────────────

/**
 * Maps a normalized path to its corresponding view element ID.
 * This ensures the correct view div gets the .active class after routing.
 *
 * @param {string} path — normalized path (e.g. '/', '/skills', '/blog/my-post')
 * @returns {string|null} — view element ID, or null if no mapping exists
 */
function _getViewIdForPath(path) {
  // Exact route → view mappings
  const exactMap = {
    '/':           'view-home',
    '/skills':     'view-skills',
    '/projects':   'view-projects',
    '/blog':       'view-blog',
    '/experience': 'view-experience',
    '/about':      'view-about',
    '/contact':    'view-contact',
    '/chords':     'view-chords',
  };

  // Try exact match first
  if (exactMap[path]) return exactMap[path];

  // Prefix matches — article detail and chord detail pages
  if (path.startsWith('/blog/'))   return 'view-article';
  if (path.startsWith('/chords/')) return 'view-chord-detail';

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
//  Core navigate()
// ─────────────────────────────────────────────────────────────────────────

/** Tracks the path of the last completed navigation to avoid double-renders */
let _currentPath = null;

/**
 * Navigate to a path within the SPA.
 *
 * @param {string}  rawPath  — absolute path (with optional query string)
 * @param {boolean} [push=true] — push to history (false for popstate / boot)
 */
export async function navigate(rawPath, push = true) {
  // ── Parse ────────────────────────────────────────────────────────────
  const u = new URL(rawPath, location.origin);
  const path = _normalisePath(u.pathname);
  const searchParams = u.searchParams;

  // Avoid re-rendering the exact same path (but allow query string changes)
  const fullKey = path + u.search;
  if (fullKey === _currentPath && push) return;

  // ── Progress bar ─────────────────────────────────────────────────────
  pStart();

  // ── History push ─────────────────────────────────────────────────────
  if (push && fullKey !== (location.pathname + location.search)) {
    history.pushState({}, '', path + (u.search || ''));
  }

  // ── Decompose path ───────────────────────────────────────────────────
  const parts = path.replace(/^\//, '').split('/').filter(Boolean);
  // parts[0] = first segment ('' for root), parts[1] = slug etc.
  const route = parts[0] || '';    // '' = home
  const slug  = parts[1] ? decodeURIComponent(parts[1]) : '';

  /** @type {RouteContext} */
  const ctx = { path, parts, slug, params: {}, searchParams };

  // ── Update nav ───────────────────────────────────────────────────────
  _setActiveNav(route);

  // ── Remove stale overlays ────────────────────────────────────────────
  _remove404();

  // ── Scroll to top ─────────────────────────────────────────────────────
  window.scrollTo({ top: 0, behavior: 'instant' });

  // ── Resolve handler ──────────────────────────────────────────────────
  // 1. Exact match on normalised path (e.g. '/', '/skills', '/contact')
  // 2. Prefix match (e.g. '/blog' catches '/blog' and '/blog/slug')
  // 3. 404

  let handler = _exactRoutes.get(path);

  if (!handler) {
    // Try prefix routes in registration order
    for (const { prefix, handler: ph } of _prefixRoutes) {
      const p = prefix.endsWith('/') ? prefix : prefix + '/';
      if (path === prefix || path.startsWith(p)) {
        handler = ph;
        break;
      }
    }
  }

  if (handler) {
    try {
      await handler(ctx);
    } catch (err) {
      console.error('[router] handler error for', path, err);
    }
    // Show the appropriate view based on the route
    const viewId = _getViewIdForPath(path);
    if (viewId) showView(viewId);
    _currentPath = fullKey;
    watchReveals();
  } else {
    // 404 — show home view with overlay (matches existing pattern)
    const homeHandler = _exactRoutes.get('/');
    if (homeHandler) {
      try { 
        await homeHandler(ctx);
        showView('view-home');
      } catch {}
    } else {
      showView('view-home');
    }
    _show404(path);
    _currentPath = fullKey;
    watchReveals();
  }

  pEnd();
}

// ─────────────────────────────────────────────────────────────────────────
//  Global click delegation — [data-link] anchors
// ─────────────────────────────────────────────────────────────────────────

document.addEventListener('click', e => {
  const a = e.target.closest('[data-link]');
  if (!a) return;

  const href = a.getAttribute('href');
  // Let external, mailto, tel, and hash links pass through normally
  if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) return;

  e.preventDefault();
  _closeMobileNav();
  navigate(href);
});

// ─────────────────────────────────────────────────────────────────────────
//  Popstate — browser back / forward
// ─────────────────────────────────────────────────────────────────────────

window.addEventListener('popstate', () => {
  navigate(location.pathname + location.search, false);
});

// ─────────────────────────────────────────────────────────────────────────
//  Mobile nav burger
// ─────────────────────────────────────────────────────────────────────────

function _closeMobileNav() {
  const burger  = el('burger');
  const navList = el('navLinks');
  if (!burger || !navList) return;
  burger.classList.remove('open');
  navList.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
}

// Wire up burger once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const burger  = el('burger');
  const navList = el('navLinks');
  if (!burger || !navList) return;

  burger.addEventListener('click', () => {
    const open = !navList.classList.contains('open');
    burger.classList.toggle('open', open);
    navList.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (navList.classList.contains('open') &&
        !navList.contains(e.target) &&
        !burger.contains(e.target)) {
      _closeMobileNav();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && navList.classList.contains('open')) {
      _closeMobileNav();
      burger.focus();
    }
  });
}, { once: true });

// ─────────────────────────────────────────────────────────────────────────
//  Boot — called by js/main.js after all routes are registered
// ─────────────────────────────────────────────────────────────────────────

/**
 * Perform the initial navigation on page load.
 * Must be called by main.js AFTER all registerRoute / registerPrefix calls.
 */
export function boot() {
  navigate(location.pathname + location.search, false);
}