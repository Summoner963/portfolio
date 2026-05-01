// ═══════════════════════════════════════════════════════════════════════════
//  js/views/skills.js
//
//  Exports:
//    renderSkills() — fetches /api/data?sheet=skills and renders the
//                     skills grid into #skillsGrid.
//
//  Design system: matches existing CSS custom properties, card classes,
//  and tag patterns exactly. Lazy-loads css/skills.css on first call.
//
//  Sheet columns expected:
//    title, icon, color (c-green | c-blue | c-amber), tags (comma-separated)
//
//  Open/Closed: adding a new skill category = adding a row to the sheet.
//  Zero JS changes needed.
// ═══════════════════════════════════════════════════════════════════════════

import { fetchSheet, CFG }  from '../api.js';
import { esc, loadCSS, watchReveals } from '../utils.js';

// ── Lazy CSS ───────────────────────────────────────────────────────────────
// Injected once; subsequent calls are no-ops (loadCSS guards with a Set).
const CSS_LOADED = loadCSS('/css/skills.css');

// ── Fallback content (shown when API is unavailable) ──────────────────────
// Mirrors the monolith's FB.skills exactly so offline users see real data.
const FALLBACK_HTML =
  `<div class="skill-card c-green reveal">` +
    `<div class="skill-icon" aria-hidden="true">🐍</div>` +
    `<div class="skill-name">Languages</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Python</span>` +
      `<span class="tag">Java</span>` +
      `<span class="tag">PHP</span>` +
      `<span class="tag">JavaScript</span>` +
      `<span class="tag">HTML5</span>` +
      `<span class="tag">CSS3</span>` +
    `</div>` +
  `</div>` +
  `<div class="skill-card c-blue reveal">` +
    `<div class="skill-icon" aria-hidden="true">⚙️</div>` +
    `<div class="skill-name">Frameworks &amp; Backend</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Django</span>` +
      `<span class="tag">Django REST</span>` +
      `<span class="tag">PHP OOP</span>` +
      `<span class="tag">SQLite</span>` +
      `<span class="tag">MySQL</span>` +
      `<span class="tag">MariaDB</span>` +
    `</div>` +
  `</div>` +
  `<div class="skill-card c-amber reveal">` +
    `<div class="skill-icon" aria-hidden="true">📱</div>` +
    `<div class="skill-name">Mobile &amp; Tools</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Android Studio</span>` +
      `<span class="tag">Java (Android)</span>` +
      `<span class="tag">XML Layouts</span>` +
      `<span class="tag">Git</span>` +
      `<span class="tag">Bluetooth APIs</span>` +
    `</div>` +
  `</div>` +
  `<div class="skill-card c-green reveal">` +
    `<div class="skill-icon" aria-hidden="true">🧪</div>` +
    `<div class="skill-name">QA &amp; Concepts</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Manual Testing</span>` +
      `<span class="tag">Test Case Writing</span>` +
      `<span class="tag">REST APIs</span>` +
      `<span class="tag">OOP</span>` +
      `<span class="tag">SDLC</span>` +
      `<span class="tag">SQL Injection Prevention</span>` +
      `<span class="tag">Prompt Engineering</span>` +
    `</div>` +
  `</div>`;

// ── Skeleton HTML (shown while fetching) ──────────────────────────────────
const SKELETON_HTML = '<div class="skel skel-card"></div>'.repeat(4);

// ── Valid color modifier classes (whitelist — never trust sheet data raw) ──
const VALID_COLORS = new Set(['c-green', 'c-blue', 'c-amber']);

/**
 * Renders a single skill card DOM element from a sheet row.
 *
 * @param {object} row — { title, icon, color, tags }
 * @returns {HTMLElement}
 */
function buildSkillCard(row) {
  const colorClass = VALID_COLORS.has((row.color || '').trim())
    ? row.color.trim()
    : 'c-green'; // safe default

  const tagNames = (row.tags || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const card = document.createElement('div');
  card.className = `skill-card ${colorClass} reveal`;

  // Icon — decorative, aria-hidden
  const iconEl = document.createElement('div');
  iconEl.className = 'skill-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = row.icon || '💡';

  // Category name
  const nameEl = document.createElement('div');
  nameEl.className = 'skill-name';
  nameEl.textContent = row.title || '';

  // Tag row
  const tagRow = document.createElement('div');
  tagRow.className = 'tag-row';
  tagNames.forEach(t => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = t;
    tagRow.appendChild(span);
  });

  card.appendChild(iconEl);
  card.appendChild(nameEl);
  card.appendChild(tagRow);

  return card;
}

/**
 * Fetches skills data and renders the grid.
 * Safe to call multiple times — uses stale-while-revalidate caching.
 * If API is unavailable, falls back to hardcoded content.
 *
 * @returns {Promise<void>}
 */
export async function renderSkills() {
  // Ensure CSS is loaded before any DOM insertion
  await CSS_LOADED;

  const grid = document.getElementById('skillsGrid');
  if (!grid) return;

  // Show skeleton immediately
  grid.innerHTML = SKELETON_HTML;

  let rows;
  try {
    rows = await fetchSheet(
      CFG.api.skills,
      'skills',
      // onRevalidate: called if stale cache was returned and fresh data arrived
      (fresh) => {
        if (document.getElementById('view-skills')?.classList.contains('active')) {
          renderFromRows(grid, fresh);
          watchReveals();
        }
      },
    );
  } catch (e) {
    console.warn('[renderSkills] fetch error:', e.message);
    rows = null;
  }

  if (!rows?.length) {
    // API unavailable — show fallback so users always see content
    grid.innerHTML = FALLBACK_HTML;
    return;
  }

  renderFromRows(grid, rows);
}

/**
 * Builds and inserts skill cards into the grid from an array of row objects.
 * Extracted so both the initial render and the revalidation callback
 * use the exact same code path.
 *
 * @param {HTMLElement} grid
 * @param {object[]}    rows
 */
function renderFromRows(grid, rows) {
  const frag = document.createDocumentFragment();
  rows.forEach(row => frag.appendChild(buildSkillCard(row)));
  grid.innerHTML = '';
  grid.appendChild(frag);
}