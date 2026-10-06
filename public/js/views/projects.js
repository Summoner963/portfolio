// ═══════════════════════════════════════════════════════════════════════════
//  js/views/projects.js
//
//  Exports:
//    renderProjects() — fetches /api/data?sheet=projects and renders the
//                       projects grid into #projectsGrid.
//
//  Sheet columns expected:
//    title, desc, bullets (pipe-separated), stack (comma-separated),
//    link, featured ("true"/"false"), wide ("true"/"false"),
//    visual (emoji or leave blank), note
//
//  Card layout variants:
//    .feat  — spans 2 columns, shows a visual panel on the right
//    .wide  — spans 2 columns, no visual panel
//    default — single column
//
//  Open/Closed: adding a project = adding a sheet row. Zero JS changes.
// ═══════════════════════════════════════════════════════════════════════════

import { fetchSheet, CFG }          from '../api.js';
import { esc, loadCSS, watchReveals } from '../utils.js';

// ── Lazy CSS ───────────────────────────────────────────────────────────────
const CSS_LOADED = loadCSS('/css/projects.css');

// ── Skeleton ───────────────────────────────────────────────────────────────
const SKELETON_HTML = '<div class="skel skel-card"></div>'.repeat(4);

// ── Fallback (offline / API unavailable) ──────────────────────────────────
// Mirrors the monolith FB.projects exactly.
const FALLBACK_HTML =
  `<article class="proj-card feat reveal">` +
    `<div>` +
      `<div class="proj-num">01 / Featured</div>` +
      `<h3 class="proj-title">Django E-commerce Platform</h3>` +
      `<p class="proj-desc">Full-stack product listing, cart, and checkout using Django's MVT architecture.</p>` +
      `<ul class="proj-bullets">` +
        `<li>Verified 100% of CRUD operations across relational SQLite database</li>` +
        `<li>Wrote edge-case &amp; error-handling test suites; prevented SQL injection</li>` +
        `<li>Resolved all frontend-to-backend data discrepancies found in testing</li>` +
      `</ul>` +
      `<div class="proj-stack">` +
        `<span class="tag">Django</span>` +
        `<span class="tag">Python</span>` +
        `<span class="tag">SQLite</span>` +
        `<span class="tag">Django REST</span>` +
        `<span class="tag">Manual Testing</span>` +
      `</div>` +
      `<p class="proj-note">⚠️ ~60s cold start on free Render hosting</p>` +
      `<div class="proj-links">` +
        `<a href="https://ecommerce-ksmw.onrender.com/" class="btn btn-solid"` +
           ` target="_blank" rel="noopener noreferrer">View Project ↗</a>` +
      `</div>` +
    `</div>` +
    `<div class="proj-visual" aria-hidden="true">🛒</div>` +
  `</article>` +

  `<article class="proj-card reveal">` +
    `<div class="proj-num">02</div>` +
    `<h3 class="proj-title">College Library Management System</h3>` +
    `<p class="proj-desc">PHP OOP application managing book inventory and student borrowing records.</p>` +
    `<ul class="proj-bullets">` +
      `<li>100% accuracy in book-to-student mapping</li>` +
      `<li>Resolved edge-case bugs in borrow/return logic</li>` +
      `<li>SQL-safe input handling throughout</li>` +
    `</ul>` +
    `<div class="proj-stack">` +
      `<span class="tag">PHP</span>` +
      `<span class="tag">MariaDB</span>` +
      `<span class="tag">MySQL</span>` +
      `<span class="tag">OOP</span>` +
    `</div>` +
    `<div class="proj-links">` +
      `<a href="https://collglibsys.free.nf/" class="btn btn-solid"` +
         ` target="_blank" rel="noopener noreferrer">View Project ↗</a>` +
    `</div>` +
  `</article>` +

  `<article class="proj-card reveal">` +
    `<div class="proj-num">03</div>` +
    `<h3 class="proj-title">Bluetooth Messaging App</h3>` +
    `<p class="proj-desc">Android app enabling peer-to-peer Bluetooth messaging with local data persistence.</p>` +
    `<ul class="proj-bullets">` +
      `<li>Tested connectivity across multiple device combos</li>` +
      `<li>Resolved stability issues for consistent delivery</li>` +
    `</ul>` +
    `<div class="proj-stack">` +
      `<span class="tag">Java</span>` +
      `<span class="tag">Android Studio</span>` +
      `<span class="tag">Bluetooth API</span>` +
      `<span class="tag">XML</span>` +
    `</div>` +
  `</article>` +

  `<article class="proj-card wide reveal">` +
    `<div class="proj-num">04</div>` +
    `<h3 class="proj-title">Book E-commerce Platform</h3>` +
    `<p class="proj-desc">Full-stack PHP app with authentication, product management, sandbox payment, and order tracking.</p>` +
    `<div class="proj-stack">` +
      `<span class="tag">PHP</span>` +
      `<span class="tag">MariaDB</span>` +
      `<span class="tag">HTML</span>` +
      `<span class="tag">CSS</span>` +
      `<span class="tag">JavaScript</span>` +
      `<span class="tag">Authentication</span>` +
    `</div>` +
    `<div class="proj-links">` +
      `<a href="https://bookecom.free.nf/" class="btn btn-solid"` +
         ` target="_blank" rel="noopener noreferrer">View Project ↗</a>` +
    `</div>` +
  `</article>`;

// ── Visual emoji map ───────────────────────────────────────────────────────
// Featured cards show a decorative visual panel. The sheet can supply
// an emoji in a "visual" column; if blank we pick from this map by
// inspecting the stack tags, with a generic fallback.
const VISUAL_FALLBACK_MAP = [
  { keywords: ['django', 'python'],                  emoji: '🐍' },
  { keywords: ['android', 'bluetooth', 'java'],      emoji: '📱' },
  { keywords: ['php', 'mysql', 'mariadb'],           emoji: '🐘' },
  { keywords: ['react', 'vue', 'next', 'svelte'],    emoji: '⚛️'  },
  { keywords: ['node', 'express', 'deno'],           emoji: '🟢' },
  { keywords: ['wordpress', 'cms'],                  emoji: '📝' },
  { keywords: ['shop', 'ecommerce', 'cart', 'store'],emoji: '🛒' },
  { keywords: ['library', 'book', 'edu'],            emoji: '📚' },
  { keywords: ['api', 'rest', 'graphql'],            emoji: '🔌' },
];

/**
 * Picks a decorative emoji for the featured card visual panel.
 * Uses the sheet "visual" column first, then keyword-matches the stack,
 * then falls back to a generic rocket.
 *
 * @param {string} sheetVisual  — value of row.visual from the sheet
 * @param {string} stackStr     — raw comma-separated stack string
 * @param {string} titleStr     — project title
 * @returns {string}
 */
function pickVisual(sheetVisual, stackStr, titleStr) {
  if (sheetVisual && sheetVisual.trim()) return sheetVisual.trim();
  const haystack = `${stackStr} ${titleStr}`.toLowerCase();
  for (const { keywords, emoji } of VISUAL_FALLBACK_MAP) {
    if (keywords.some(k => haystack.includes(k))) return emoji;
  }
  return '🚀';
}

/**
 * Builds a single project card <article> element from a sheet row.
 * Uses createElement + appendChild throughout — no innerHTML on sheet data.
 *
 * @param {object} row   — sheet row object
 * @param {number} index — 0-based position (used for numbering label)
 * @returns {HTMLElement}
 */
function buildProjectCard(row, index) {
  const isFeatured = row.featured === 'true';
  const isWide     = row.wide     === 'true';

  // ── Article wrapper ──────────────────────────────────────────────────
  const art = document.createElement('article');
  art.className =
    'proj-card reveal' +
    (isFeatured ? ' feat' : '') +
    (isWide     ? ' wide' : '');

  // Featured layout: content div + visual div side by side
  // Non-featured: content directly in <article>
  const content = document.createElement('div');

  // ── Project number label ─────────────────────────────────────────────
  const numEl = document.createElement('div');
  numEl.className = 'proj-num';
  numEl.textContent =
    String(index + 1).padStart(2, '0') + (isFeatured ? ' / Featured' : '');
  content.appendChild(numEl);

  // ── Title ────────────────────────────────────────────────────────────
  const titleEl = document.createElement('h3');
  titleEl.className = 'proj-title';
  titleEl.textContent = row.title || '';
  content.appendChild(titleEl);

  // ── Description ──────────────────────────────────────────────────────
  if (row.desc && row.desc.trim()) {
    const descEl = document.createElement('p');
    descEl.className = 'proj-desc';
    descEl.textContent = row.desc.trim();
    content.appendChild(descEl);
  }

  // ── Bullet points (pipe-separated in sheet) ──────────────────────────
  const bullets = (row.bullets || '')
    .split('|')
    .map(b => b.trim())
    .filter(Boolean);

  if (bullets.length) {
    const ul = document.createElement('ul');
    ul.className = 'proj-bullets';
    bullets.forEach(b => {
      const li = document.createElement('li');
      li.textContent = b;
      ul.appendChild(li);
    });
    content.appendChild(ul);
  }

  // ── Tech stack tags (comma-separated in sheet) ───────────────────────
  const stackTags = (row.stack || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  if (stackTags.length) {
    const stackEl = document.createElement('div');
    stackEl.className = 'proj-stack';
    stackTags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      stackEl.appendChild(span);
    });
    content.appendChild(stackEl);
  }

  // ── Optional note (e.g. cold-start warning) ──────────────────────────
  if (row.note && row.note.trim()) {
    const noteEl = document.createElement('p');
    noteEl.className = 'proj-note';
    noteEl.textContent = row.note.trim();
    content.appendChild(noteEl);
  }

  // ── External link button ─────────────────────────────────────────────
  if (row.link && row.link.trim()) {
    // Validate: only allow http/https links
    let safeLink = '';
    try {
      const parsed = new URL(row.link.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        safeLink = parsed.href;
      }
    } catch { /* invalid URL — skip link */ }

    if (safeLink) {
      const linksDiv = document.createElement('div');
      linksDiv.className = 'proj-links';
      const a = document.createElement('a');
      a.href      = safeLink;
      a.className = 'btn btn-solid';
      a.target    = '_blank';
      a.rel       = 'noopener noreferrer';
      a.textContent = 'View Project ↗';
      linksDiv.appendChild(a);
      content.appendChild(linksDiv);
    }
  }

  // ── Assemble card ────────────────────────────────────────────────────
  art.appendChild(content);

  // Featured cards get a decorative visual panel on the right
  if (isFeatured) {
    const visual = document.createElement('div');
    visual.className = 'proj-visual';
    visual.setAttribute('aria-hidden', 'true');
    visual.textContent = pickVisual(row.visual || '', row.stack || '', row.title || '');
    art.appendChild(visual);
  }

  return art;
}

/**
 * Renders rows into the grid element using a DocumentFragment.
 * Extracted so both the initial render and the onRevalidate callback
 * share the exact same code path.
 *
 * @param {HTMLElement} grid
 * @param {object[]}    rows
 */
function renderFromRows(grid, rows) {
  const frag = document.createDocumentFragment();
  rows.forEach((row, i) => frag.appendChild(buildProjectCard(row, i)));
  grid.innerHTML = '';
  grid.appendChild(frag);
}

/**
 * Fetches projects data and renders the grid.
 * Safe to call on every navigation — uses stale-while-revalidate caching.
 * Falls back to hardcoded content when the API is unavailable.
 *
 * @returns {Promise<void>}
 */
export async function renderProjects() {
  await CSS_LOADED;

  const grid = document.getElementById('projectsGrid');
  if (!grid) return;

  // Show skeleton while fetching
  grid.innerHTML = SKELETON_HTML;

  let rows;
  try {
    rows = await fetchSheet(
      CFG.api.projects,
      'projects',
      // onRevalidate: fresh data arrived after stale cache was returned
      (fresh) => {
        if (document.getElementById('view-projects')?.classList.contains('active')) {
          renderFromRows(grid, fresh);
          watchReveals();
        }
      },
    );
  } catch (e) {
    console.warn('[renderProjects] fetch error:', e.message);
    rows = null;
  }

  if (!rows?.length) {
    grid.innerHTML = FALLBACK_HTML;
    return;
  }

  renderFromRows(grid, rows);
}