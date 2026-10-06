// ═══════════════════════════════════════════════════════════════════════════
//  js/views/about.js
//
//  Exports:
//    renderAbout() — fetches /api/data?sheet=about and renders the
//                    about text block into #aboutText.
//
//  Sheet columns expected:
//    bio1, bio2, bio3, bio4  (plain text paragraphs, any can be empty)
//
//  Static content (location, availability, languages, focus, email,
//  education card) lives in index.html and is never touched by JS —
//  only the bio text block is dynamic.
//
//  Also adds the chord sheets callout link per Section 4 of the master
//  prompt: "I also maintain a chord sheet collection →" linking to /chords.
//
//  Open/Closed: bio text updated via sheet. Zero JS changes needed.
// ═══════════════════════════════════════════════════════════════════════════

import { fetchSheet, CFG }            from '../api.js';
import { loadCSS, watchReveals }      from '../utils.js';

// ── Lazy CSS ───────────────────────────────────────────────────────────────
// about.css is shared by experience.js and contact.js — loadCSS() guards
// against double-injection internally so calling it from all three is safe.
const CSS_LOADED = loadCSS('/css/about.css');

// ── Skeleton ───────────────────────────────────────────────────────────────
// Four skeleton lines mirror the four bio paragraph columns in the sheet.
const SKELETON_HTML =
  `<div class="skel skel-line" style="margin-bottom:1rem"></div>`.repeat(2) +
  `<div class="skel skel-line m" style="margin-bottom:1rem"></div>` +
  `<div class="skel skel-line" style="margin-bottom:1rem"></div>`;

// ── Fallback bio (offline / API unavailable) ───────────────────────────────
// Plain text paragraphs — no HTML in the fallback, so no escaping needed.
const FALLBACK_PARAS = [
  `I'm a final-year BCA student at Tribhuvan University, Nepal, passionate about building reliable software and catching bugs before users do.`,
  `I have hands-on experience across the full stack — from Django REST APIs and PHP backends to Android mobile apps.`,
  `I bring a testing mindset to everything I build — writing edge-case test suites, validating data across all operations, and ensuring frontend and backend always agree.`,
  `Looking for a Dev or QA Internship where I can grow fast, ship real features, and work with a team that cares about quality.`,
];

// ── Chord sheets callout ───────────────────────────────────────────────────
// Per Section 4 of the master prompt: the about page must link to /chords.
// Built as a DOM element (not an innerHTML string) so the data-link
// attribute is reliably present for the router's click-delegation handler.
function buildChordCallout() {
  const p = document.createElement('p');
  p.className = 'about-chord-callout';
  p.style.cssText =
    'margin-top:1.6rem;padding-top:1.4rem;' +
    'border-top:1px solid var(--border);' +
    'font-size:.88rem;color:var(--muted);';

  const textNode = document.createTextNode('I also maintain a ');
  p.appendChild(textNode);

  const a = document.createElement('a');
  a.href      = '/chords';
  a.setAttribute('data-link', '');          // SPA router intercepts this
  a.style.cssText = 'color:var(--accent);text-underline-offset:3px;';
  a.textContent   = 'chord sheet collection';
  a.setAttribute('aria-label', 'View chord sheet collection');
  p.appendChild(a);

  p.appendChild(document.createTextNode(' — guitar tabs with transpose, chord diagrams, and auto-scroll. →'));

  return p;
}

/**
 * Renders bio paragraphs and the chord callout into the #aboutText element.
 * Extracted so initial render and onRevalidate share the same code path.
 *
 * @param {HTMLElement} el      — #aboutText container
 * @param {string[]}    paras   — array of plain-text paragraph strings
 */
function renderFromParas(el, paras) {
  const frag = document.createDocumentFragment();

  paras.forEach(text => {
    if (!text.trim()) return;
    const p = document.createElement('p');
    p.textContent = text.trim(); // textContent — never innerHTML on sheet data
    frag.appendChild(p);
  });

  // Always append the chord callout as the final element in the bio block
  frag.appendChild(buildChordCallout());

  el.innerHTML = '';
  el.appendChild(frag);
}

/**
 * Extracts up to four bio paragraph strings from a sheet row object.
 * Handles both the expected multi-column format (bio1…bio4) and a
 * single-column fallback (bio) for forward compatibility.
 *
 * @param {object[]} rows — parsed sheet rows
 * @returns {string[]}    — array of non-empty paragraph strings
 */
function extractParas(rows) {
  if (!rows?.length) return [];
  const row = rows[0]; // About sheet is single-row

  // Primary format: bio1, bio2, bio3, bio4 columns
  const multiCol = ['bio1', 'bio2', 'bio3', 'bio4']
    .map(k => (row[k] || '').trim())
    .filter(Boolean);
  if (multiCol.length) return multiCol;

  // Fallback: single "bio" column (pipe-separated paragraphs)
  const single = (row.bio || row.Bio || '').trim();
  if (single) return single.split('|').map(s => s.trim()).filter(Boolean);

  return [];
}

/**
 * Fetches about data and renders the bio text block.
 * Safe to call on every navigation — uses stale-while-revalidate caching.
 * Falls back to hardcoded content when the API is unavailable.
 * Always appends the chord sheets callout regardless of data source.
 *
 * @returns {Promise<void>}
 */
export async function renderAbout() {
  await CSS_LOADED;

  const el = document.getElementById('aboutText');
  if (!el) return;

  // Show skeleton immediately
  el.innerHTML = SKELETON_HTML;

  let rows;
  try {
    rows = await fetchSheet(
      CFG.api.about,
      'about',
      // onRevalidate: fresh data arrived after stale cache was returned
      (fresh) => {
        if (document.getElementById('view-about')?.classList.contains('active')) {
          const paras = extractParas(fresh);
          renderFromParas(el, paras.length ? paras : FALLBACK_PARAS);
          watchReveals();
        }
      },
    );
  } catch (e) {
    console.warn('[renderAbout] fetch error:', e.message);
    rows = null;
  }

  const paras = extractParas(rows);
  renderFromParas(el, paras.length ? paras : FALLBACK_PARAS);
}