// ═══════════════════════════════════════════════════════════════════════════
//  js/views/experience.js
//
//  Exports:
//    renderExperience() — fetches /api/data?sheet=exp and renders the
//                         timeline into #expTimeline.
//
//  Sheet columns expected:
//    role, org, date, datetime (ISO date for <time> element),
//    bullets (pipe-separated), type (work|project|volunteer — optional,
//    used for the dot color accent; defaults to "work")
//
//  Open/Closed: adding an experience entry = adding a sheet row.
//  Zero JS changes needed.
// ═══════════════════════════════════════════════════════════════════════════

import { fetchSheet, CFG }            from '../api.js';
import { esc, loadCSS, watchReveals } from '../utils.js';

// ── Lazy CSS ───────────────────────────────────────────────────────────────
const CSS_LOADED = loadCSS('/css/about.css');
// Experience shares about.css (timeline styles live there alongside
// .about-grid, .edu-card etc.) — one fewer network request.

// ── Skeleton ───────────────────────────────────────────────────────────────
const SKELETON_HTML = '<div class="skel skel-card"></div>'.repeat(3);

// ── Fallback (offline / API unavailable) ──────────────────────────────────
// Mirrors the monolith FB.experience exactly so offline users see real data.
const FALLBACK_HTML =
  `<div class="tl-item reveal">` +
    `<div class="tl-dot" aria-hidden="true"></div>` +
    `<time class="tl-date" datetime="2025-09">SEP 2025 – DEC 2025</time>` +
    `<h3 class="tl-role">SEO Intern</h3>` +
    `<div class="tl-org">Sathi Edtech Pvt. Ltd. · Kathmandu</div>` +
    `<ul class="tl-list">` +
      `<li>Monitored traffic with Google Search Console; produced keyword reports</li>` +
      `<li>Corrected metadata errors, improving crawl efficiency</li>` +
      `<li>Optimized 10+ blog posts with high-ranking keywords</li>` +
    `</ul>` +
  `</div>` +

  `<div class="tl-item reveal">` +
    `<div class="tl-dot" aria-hidden="true"></div>` +
    `<time class="tl-date" datetime="2026-01">JAN 2026</time>` +
    `<h3 class="tl-role">Data Validation &amp; Testing</h3>` +
    `<div class="tl-org">Personal Project · Django E-commerce Platform</div>` +
    `<ul class="tl-list">` +
      `<li>Verified pricing, inventory, and user data across all CRUD ops</li>` +
      `<li>Wrote test cases covering edge cases and error-handling routines</li>` +
      `<li>Resolved 100% of data discrepancies found during testing</li>` +
    `</ul>` +
  `</div>` +

  `<div class="tl-item reveal">` +
    `<div class="tl-dot" aria-hidden="true"></div>` +
    `<time class="tl-date" datetime="2023-01">JAN 2023</time>` +
    `<h3 class="tl-role">System Logic Testing</h3>` +
    `<div class="tl-org">Personal Project · PHP College Library System</div>` +
    `<ul class="tl-list">` +
      `<li>Manual testing on library database logic</li>` +
      `<li>100% accuracy in book-to-student mapping</li>` +
      `<li>Resolved edge-case bugs using PHP OOP</li>` +
    `</ul>` +
  `</div>`;

// ── Valid type values (used for future dot-color theming) ──────────────────
const VALID_TYPES = new Set(['work', 'project', 'volunteer', 'education']);

/**
 * Builds a single timeline item <div> from a sheet row.
 * Uses createElement + textContent throughout — no innerHTML on sheet data.
 *
 * @param {object} row — sheet row object
 * @returns {HTMLElement}
 */
function buildTimelineItem(row) {
  // Whitelist the type value so it can safely become a data-attribute
  const type = VALID_TYPES.has((row.type || '').trim().toLowerCase())
    ? row.type.trim().toLowerCase()
    : 'work';

  const item = document.createElement('div');
  item.className = 'tl-item reveal';
  item.dataset.type = type; // allows future CSS theming: [data-type="project"] .tl-dot { … }

  // ── Dot (decorative, aria-hidden) ────────────────────────────────────
  const dot = document.createElement('div');
  dot.className = 'tl-dot';
  dot.setAttribute('aria-hidden', 'true');
  item.appendChild(dot);

  // ── Date label ───────────────────────────────────────────────────────
  // "datetime" column holds the machine-readable ISO value (e.g. "2025-09")
  // "date" column holds the human-readable display string (e.g. "SEP 2025 – DEC 2025")
  // If datetime is absent, fall back to the display date for the attribute.
  const timeEl = document.createElement('time');
  timeEl.className = 'tl-date';
  const datetimeAttr = (row.datetime || row.date || '').trim();
  if (datetimeAttr) timeEl.setAttribute('datetime', datetimeAttr);
  timeEl.textContent = (row.date || '').trim();
  item.appendChild(timeEl);

  // ── Role / position title ─────────────────────────────────────────────
  const roleEl = document.createElement('h3');
  roleEl.className = 'tl-role';
  roleEl.textContent = (row.role || '').trim();
  item.appendChild(roleEl);

  // ── Organisation / context ────────────────────────────────────────────
  if ((row.org || '').trim()) {
    const orgEl = document.createElement('div');
    orgEl.className = 'tl-org';
    orgEl.textContent = row.org.trim();
    item.appendChild(orgEl);
  }

  // ── Bullet points (pipe-separated in sheet) ───────────────────────────
  const bullets = (row.bullets || '')
    .split('|')
    .map(b => b.trim())
    .filter(Boolean);

  if (bullets.length) {
    const ul = document.createElement('ul');
    ul.className = 'tl-list';
    ul.setAttribute('aria-label', `Responsibilities at ${(row.org || row.role || '').trim()}`);
    bullets.forEach(b => {
      const li = document.createElement('li');
      li.textContent = b;
      ul.appendChild(li);
    });
    item.appendChild(ul);
  }

  return item;
}

/**
 * Renders timeline rows into the container element.
 * Extracted so initial render and onRevalidate share the same code path.
 *
 * @param {HTMLElement} container
 * @param {object[]}    rows
 */
function renderFromRows(container, rows) {
  const frag = document.createDocumentFragment();
  rows.forEach(row => frag.appendChild(buildTimelineItem(row)));
  container.innerHTML = '';
  container.appendChild(frag);
}

/**
 * Fetches experience data and renders the timeline.
 * Safe to call on every navigation — uses stale-while-revalidate caching.
 * Falls back to hardcoded content when the API is unavailable.
 *
 * @returns {Promise<void>}
 */
export async function renderExperience() {
  await CSS_LOADED;

  const container = document.getElementById('expTimeline');
  if (!container) return;

  // Show skeleton immediately
  container.innerHTML = SKELETON_HTML;

  let rows;
  try {
    rows = await fetchSheet(
      CFG.api.exp,
      'exp',
      // onRevalidate: fresh data arrived after stale cache was returned
      (fresh) => {
        if (document.getElementById('view-experience')?.classList.contains('active')) {
          renderFromRows(container, fresh);
          watchReveals();
        }
      },
    );
  } catch (e) {
    console.warn('[renderExperience] fetch error:', e.message);
    rows = null;
  }

  if (!rows?.length) {
    container.innerHTML = FALLBACK_HTML;
    return;
  }

  renderFromRows(container, rows);
}