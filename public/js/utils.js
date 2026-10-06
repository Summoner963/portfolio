// js/utils.js
// ═══════════════════════════════════════════════════════════════════════════
//  Browser-side shared utilities.
//  Imported by js/api.js, js/seo.js, js/router.js, and all view modules.
//
//  Rules:
//   - Only imports js/shared/render.js (pure, shared with the worker).
//   - No side effects at module level except the IntersectionObserver setup
//     (which is deferred until watchReveals() is first called).
//   - All DOM output goes through esc() before innerHTML insertion.
//   - Pure functions where possible; stateful helpers are clearly marked.
// ═══════════════════════════════════════════════════════════════════════════

import { esc, fixImgUrl, md, safeUrl } from './shared/render.js';

// Escaping, image URLs and markdown live in the shared module (also used by
// the worker); re-exported so existing imports keep working.
export { esc, fixImgUrl, md, safeUrl };

/**
 * True once per element when the server already rendered it for `key`
 * (data-ssr attribute set by the worker). The view then keeps that DOM
 * instead of re-rendering: no flash, and crawlers see the same content.
 * @param {HTMLElement|null} el
 * @param {string} key  route key, e.g. '/blog' or '/blog?page=2'
 */
export function takeSSR(el, key) {
  if (!el || el.dataset.ssr !== key) return false;
  delete el.dataset.ssr;
  return true;
}


// ─────────────────────────────────────────────────────────────────────────
//  HTML sanitiser
//  For sheet cells that contain trusted HTML (e.g. Table_HTML column).
//  Strips any tag/attribute not in the safe list.
//  Uses DOMParser (available in all modern browsers).
// ─────────────────────────────────────────────────────────────────────────

const _SAFE_TAGS = new Set([
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'strong', 'em', 'b', 'i', 'br', 'p',
  'ul', 'ol', 'li',
  'a', 'span', 'code', 'pre', 'blockquote',
]);

/**
 * Strip unsafe tags and attributes from an HTML string.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeHTML(raw) {
  if (!raw) return '';
  const doc = new DOMParser().parseFromString(raw, 'text/html');

  (function strip(node) {
    [...node.childNodes].forEach(kid => {
      if (kid.nodeType !== 1) return;   // keep text nodes
      const tag = kid.tagName.toLowerCase();
      if (!_SAFE_TAGS.has(tag)) {
        kid.replaceWith(document.createTextNode(kid.textContent));
        return;
      }
      // Strip disallowed attributes
      [...kid.attributes].forEach(a => {
        const ok =
          (tag === 'a'  && a.name === 'href') ||
          (['th', 'td'].includes(tag) && ['colspan', 'rowspan', 'scope'].includes(a.name));
        if (!ok) kid.removeAttribute(a.name);
      });
      // Force safe link behaviour
      if (tag === 'a') {
        kid.setAttribute('target', '_blank');
        kid.setAttribute('rel', 'noopener noreferrer');
        // Only http(s) links survive (blocks javascript:, data:, vbscript:…)
        const href = safeUrl(kid.getAttribute('href'));
        if (/^https?:/i.test(href)) kid.setAttribute('href', href);
        else kid.removeAttribute('href');
      }
      strip(kid);
    });
  })(doc.body);

  return doc.body.innerHTML;
}


// ─────────────────────────────────────────────────────────────────────────
//  Progress bar
//  Drives the #nprogress element at the top of every page transition.
//  Stateful — one timer at a time; safe to call pStart/pEnd rapidly.
// ─────────────────────────────────────────────────────────────────────────

let _pTimer = null;
let _pVal   = 0;

/**
 * Start the progress bar (called at the beginning of a navigation).
 */
export function pStart() {
  const bar = document.getElementById('nprogress');
  if (!bar) return;
  if (_pTimer) clearInterval(_pTimer);
  _pVal = 0;
  bar.style.width   = '0%';
  bar.style.opacity = '1';
  _pTimer = setInterval(() => {
    _pVal = Math.min(_pVal + Math.random() * 14, 82);
    bar.style.width = _pVal + '%';
  }, 160);
}

/**
 * Complete the progress bar (called when navigation finishes).
 */
export function pEnd() {
  const bar = document.getElementById('nprogress');
  if (!bar) return;
  if (_pTimer) { clearInterval(_pTimer); _pTimer = null; }
  bar.style.width = '100%';
  setTimeout(() => { bar.style.opacity = '0'; }, 380);
}


// ─────────────────────────────────────────────────────────────────────────
//  Reveal-on-scroll
//  Uses a single shared IntersectionObserver for the whole app.
//  Call watchReveals() after injecting new .reveal elements into the DOM.
// ─────────────────────────────────────────────────────────────────────────

let _rvObserver = null;

function _getObserver() {
  if (_rvObserver) return _rvObserver;

  const queue     = [];
  let   scheduled = false;

  _rvObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      queue.push(e.target);
      _rvObserver.unobserve(e.target);
    });
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      // Stagger delay: each newly-revealed element gets +55ms
      queue.forEach((el, i) => { el.style.transitionDelay = `${i * 55}ms`; });
      queue.forEach(el => el.classList.add('in'));
      queue.length = 0;
      scheduled    = false;
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -40px 0px' });

  return _rvObserver;
}

/**
 * Observe all .reveal elements that haven't animated yet.
 * Safe to call multiple times — already-animated elements are skipped.
 */
export function watchReveals() {
  const obs = _getObserver();
  document.querySelectorAll('.reveal:not(.in)').forEach(el => obs.observe(el));
}


// ─────────────────────────────────────────────────────────────────────────
//  Toast notification
//  Lightweight feedback for copy-to-clipboard, share, etc.
//  Self-removing after `duration` ms. Stacks safely (each gets its own el).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Show a brief toast message at the bottom of the screen.
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='success']
 * @param {number} [duration=2800]
 */
export function showToast(message, type = 'success', duration = 2800) {
  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.className = `sd-toast sd-toast--${type}`;
  toast.textContent = message;

  // Inline styles so the toast works before css/base.css defines .sd-toast
  // (base.css will override with the full design; this is the fallback.)
  Object.assign(toast.style, {
    position:      'fixed',
    bottom:        '1.5rem',
    left:          '50%',
    transform:     'translateX(-50%) translateY(20px)',
    background:    type === 'error' ? '#991b1b' : 'var(--accent2, #1b4332)',
    color:         '#fff',
    fontFamily:    'var(--mono, monospace)',
    fontSize:      '.78rem',
    letterSpacing: '.04em',
    padding:       '.55rem 1.4rem',
    borderRadius:  '2rem',
    zIndex:        '99999',
    boxShadow:     '0 4px 18px rgba(0,0,0,.18)',
    opacity:       '0',
    transition:    'opacity .22s, transform .22s',
    pointerEvents: 'none',
    whiteSpace:    'nowrap',
  });

  document.body.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
  });

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 280);
  }, duration);
}


// ─────────────────────────────────────────────────────────────────────────
//  Clipboard helper
// ─────────────────────────────────────────────────────────────────────────

/**
 * Copy text to clipboard. Returns true on success.
 * Falls back to execCommand for older browsers / iOS WKWebView.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────
//  Lazy CSS loader
//  Each view module calls loadCSS() for its own stylesheet.
//  If the <link> already exists it's a no-op — safe to call on every render.
// ─────────────────────────────────────────────────────────────────────────

const _loadedCSS = new Set();

/**
 * Inject a <link rel="stylesheet"> for a section's CSS file if not already present.
 * Returns a Promise that resolves when the stylesheet has loaded (or immediately
 * if it was already injected).
 *
 * @param {string} href  — e.g. '/css/blog.css'
 * @returns {Promise<void>}
 */
export function loadCSS(href) {
  if (_loadedCSS.has(href)) return Promise.resolve();
  // Already linked by the server-rendered page
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    _loadedCSS.add(href);
    return Promise.resolve();
  }
  _loadedCSS.add(href);

  return new Promise((resolve, reject) => {
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = href;
    link.onload = () => resolve();
    link.onerror = () => {
      // Non-fatal — page still works, just unstyled. Resolve anyway.
      console.warn('[loadCSS] failed to load', href);
      resolve();
    };
    document.head.appendChild(link);
  });
}


// ─────────────────────────────────────────────────────────────────────────
//  Skeleton HTML helpers
//  Generate consistent skeleton markup without repeating strings.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Return N repetitions of a skeleton card placeholder.
 * @param {number} n
 * @returns {string}
 */
export function skelCards(n = 4) {
  return '<div class="skel skel-card"></div>'.repeat(n);
}

/**
 * Return N repetitions of a skeleton line placeholder.
 * @param {number} n
 * @param {string} [extraStyle='']
 * @returns {string}
 */
export function skelLines(n = 4, extraStyle = '') {
  return Array.from({ length: n }, () =>
    `<div class="skel skel-line"${extraStyle ? ` style="${extraStyle}"` : ''}></div>`
  ).join('');
}


// ─────────────────────────────────────────────────────────────────────────
//  Debounce
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns a debounced version of `fn` that delays invocation by `wait` ms.
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @param {number} wait
 * @returns {T}
 */
export function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}


// ─────────────────────────────────────────────────────────────────────────
//  Date formatting (display)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Format a date string for display, e.g. "2025-04-10" → "April 10, 2025".
 * Returns the original string if unparseable (graceful degradation).
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}


// ─────────────────────────────────────────────────────────────────────────
//  Offline banner
//  Initialise once at app boot (called by js/main.js).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wire up the offline/online event listeners for the #offline-banner element.
 * Safe to call multiple times (idempotent via a module-level flag).
 */
let _offlineWired = false;
export function initOfflineBanner() {
  if (_offlineWired) return;
  _offlineWired = true;

  const banner = document.getElementById('offline-banner');
  if (!banner) return;

  const show = () => { banner.style.display = 'block'; };
  const hide = () => { banner.style.display = 'none';  };

  window.addEventListener('online',  hide);
  window.addEventListener('offline', show);
  if (!navigator.onLine) show();
}