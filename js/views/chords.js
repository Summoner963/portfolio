/**
 * js/views/chords.js
 *
 * Renders the Chords section: list page (/chords) and detail page (/chords/:slug).
 *
 * Exports:
 *   renderChords()       — list page, called by router for /chords
 *   renderChordDetail(slug) — detail page, called by router for /chords/:slug
 *
 * Features:
 *   - Search (title + artist + tags), filter by category, difficulty, key
 *   - Sort: newest, A–Z, by artist
 *   - Pagination (CFG.chordsPerPage per page)
 *   - Featured strip (Featured === 'true' rows)
 *   - Transpose ±6 semitones with enharmonic-aware chord name rewriting
 *   - Capo suggestion when transposed key has a simpler open-position equivalent
 *   - SVG chord diagram generated inline for every chord token
 *   - Popover on hover (desktop) / tap (mobile) — no hover-only interactions
 *   - Font-size A−/A+ with localStorage persistence
 *   - Auto-scroll toggle with speed slider (localStorage persistence)
 *   - Print button (window.print()) + Share button (clipboard toast)
 *   - SEO: updateSEO with chordMeta for MusicComposition schema
 *   - Lazy-loads css/chords.css before first render
 *
 * Dependencies (all already built):
 *   js/api.js        → fetchSheet, CFG
 *   js/seo.js        → updateSEO, removeSchemas
 *   js/utils.js      → esc, fixImgUrl, loadCSS, watchReveals, showToast, pStart, pEnd
 *   js/data/chord-shapes.js → CHORD_SHAPES (default export)
 */

import { fetchSheet, CFG }                from '../api.js';
import { updateSEO, removeSchemas }       from '../seo.js';
import { esc, fixImgUrl, loadCSS, watchReveals, showToast } from '../utils.js';
import CHORD_SHAPES                       from '../data/chord-shapes.js';

// ─────────────────────────────────────────────────────────────────────────
//  CSS — lazy-loaded once
// ─────────────────────────────────────────────────────────────────────────
let _cssLoaded = false;
async function ensureCSS() {
  if (_cssLoaded) return;
  await loadCSS('/css/chords.css');
  _cssLoaded = true;
}

// ─────────────────────────────────────────────────────────────────────────
//  CHROMATIC / TRANSPOSE ENGINE
// ─────────────────────────────────────────────────────────────────────────

/** Chromatic scale using sharps (default) */
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
/** Keys that prefer flat spellings for display */
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb']);
/** Sharp → flat enharmonic map */
const TO_FLAT   = { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb' };
/** Flat → sharp (for lookup) */
const TO_SHARP  = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#' };

/**
 * Normalise a root string to its sharp equivalent for array indexing.
 * e.g. 'Db' → 'C#', 'Bb' → 'A#', 'C' → 'C'
 */
function toSharp(root) {
  return TO_SHARP[root] || root;
}

/**
 * Transpose a root note by `semitones` (±6).
 * Returns display name using flats if the resulting key is a flat key.
 */
function transposeRoot(root, semitones) {
  if (!semitones) return root;
  const sharp = toSharp(root);
  const idx   = SHARPS.indexOf(sharp);
  if (idx === -1) return root; // unknown root, pass through
  const newSharp = SHARPS[(idx + semitones + 12) % 12];
  // Use flat spelling if the new key prefers flats
  if (FLAT_KEYS.has(newSharp) || TO_FLAT[newSharp]) {
    const flat = TO_FLAT[newSharp];
    if (flat && FLAT_KEYS.has(flat)) return flat;
  }
  return newSharp;
}

/**
 * Parse a chord name into { root, suffix }.
 * Handles: C, C#, Db, Cm, C#m7, Cmaj7, Dsus4, Cadd9, A5, etc.
 */
function parseChord(name) {
  // Root: letter + optional # or b
  const m = name.match(/^([A-G][#b]?)(.*)/);
  if (!m) return null;
  return { root: m[1], suffix: m[2] };
}

/**
 * Transpose a full chord name string by `semitones`.
 * Returns the transposed chord name, or the original if it can't be parsed.
 */
function transposeChord(name, semitones) {
  if (!semitones) return name;
  const parsed = parseChord(name);
  if (!parsed) return name;
  const newRoot = transposeRoot(parsed.root, semitones);
  return newRoot + parsed.suffix;
}

/**
 * Given an original key string and a semitone offset, return the new key.
 */
function transposeKey(keyStr, semitones) {
  if (!keyStr || !semitones) return keyStr;
  // Key may be like "G", "Am", "C#m" — transpose just the root
  const parsed = parseChord(keyStr);
  if (!parsed) return keyStr;
  return transposeRoot(parsed.root, semitones) + parsed.suffix;
}

/**
 * Capo suggestion: given original key, capo, and semitone offset,
 * suggest a capo position that lets the player use open-chord shapes.
 *
 * Logic: if transposing UP, a capo can substitute. e.g. if song is in C
 * and user transposes +2 to D, they could play C shapes with capo 2.
 * Only suggest when offset is positive 1–5 (practical capo range).
 */
function capoSuggestion(originalKey, originalCapo, semitones) {
  if (!semitones || semitones < 0 || semitones > 5) return null;
  const origCapoNum = parseInt(originalCapo) || 0;
  const newCapo     = origCapoNum + semitones;
  if (newCapo > 7) return null; // impractical
  return {
    playKey:  originalKey,
    capoFret: newCapo,
    soundsIn: transposeKey(originalKey, semitones),
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  SVG CHORD DIAGRAM GENERATOR
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generate an inline SVG chord diagram from a CHORD_SHAPES entry.
 *
 * Layout:
 *   - 80px wide × 100px tall
 *   - 6 strings (vertical lines), 5 frets (horizontal lines)
 *   - String 0 (high-e) = rightmost, string 5 (low-E) = leftmost
 *   - baseFret === 1: draw nut (thick top line)
 *   - baseFret > 1: show fret number at top-left
 *   - Muted (-1): × above nut
 *   - Open (0): small circle above nut
 *   - Finger: filled circle at (string, fret), number inside
 *   - Barre: filled rounded rect spanning strings
 *
 * @param {string} chordName - for aria-label
 * @param {object} shape     - from CHORD_SHAPES
 * @returns {string}         - SVG markup string
 */
function buildDiagramSVG(chordName, shape) {
  if (!shape) {
    return `<svg width="80" height="100" viewBox="0 0 80 100"
      xmlns="http://www.w3.org/2000/svg" aria-label="${esc(chordName)} chord diagram"
      class="chord-diagram-svg">
      <text x="40" y="50" text-anchor="middle" font-family="var(--mono)"
        font-size="9" fill="var(--muted)">No diagram</text>
    </svg>`;
  }

  const { frets, fingers, barre, baseFret = 1 } = shape;

  // Grid geometry
  const LEFT    = 14;  // left edge (room for mute/open markers + fret num)
  const TOP     = 22;  // top edge (room for open/mute circles and fret label)
  const WIDTH   = 52;  // string span width
  const HEIGHT  = 62;  // fret span height
  const STRINGS = 6;
  const FRETS   = 5;
  const STR_GAP = WIDTH  / (STRINGS - 1);  // horizontal gap between strings
  const FRT_GAP = HEIGHT / FRETS;           // vertical gap between frets
  const DOT_R   = 6.5;  // finger dot radius

  // Positions
  const sx = i => LEFT + (STRINGS - 1 - i) * STR_GAP; // string i x coord (0=right)
  const fy = f => TOP + (f - 0.5) * FRT_GAP;           // fret f center y (1-based)

  let parts = [];

  // ── Nut / fret number ──────────────────────────────────────────────
  if (baseFret === 1) {
    // Nut: thick line at top
    parts.push(
      `<line x1="${LEFT}" y1="${TOP}" x2="${LEFT + WIDTH}" y2="${TOP}"
        stroke="var(--text)" stroke-width="3" stroke-linecap="round"/>`
    );
  } else {
    // Fret position label
    parts.push(
      `<text x="${LEFT - 4}" y="${TOP + FRT_GAP * 0.6}" text-anchor="end"
        font-family="var(--mono)" font-size="8" fill="var(--muted)"
        dominant-baseline="middle">${baseFret}</text>`
    );
  }

  // ── Strings (vertical lines) ───────────────────────────────────────
  for (let s = 0; s < STRINGS; s++) {
    const x = sx(s);
    parts.push(
      `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + HEIGHT}"
        stroke="var(--text)" stroke-width="1" opacity="0.45"/>`
    );
  }

  // ── Fret lines (horizontal) ────────────────────────────────────────
  for (let f = 1; f <= FRETS; f++) {
    const y = TOP + f * FRT_GAP;
    parts.push(
      `<line x1="${LEFT}" y1="${y}" x2="${LEFT + WIDTH}" y2="${y}"
        stroke="var(--border-dark,#c8d0c4)" stroke-width="0.8"/>`
    );
  }

  // ── Barre ──────────────────────────────────────────────────────────
  if (barre) {
    const { fret: bf, from, to } = barre;
    const localFret = bf - baseFret + 1;
    if (localFret >= 1 && localFret <= FRETS) {
      const x1  = sx(to);   // to is higher string index → leftmost
      const x2  = sx(from); // from is lower string index → rightmost
      const by  = fy(localFret);
      parts.push(
        `<rect x="${x1 - DOT_R}" y="${by - DOT_R}"
          width="${x2 - x1 + DOT_R * 2}" height="${DOT_R * 2}"
          rx="${DOT_R}" fill="var(--accent)" opacity="0.9"/>`
      );
    }
  }

  // ── Open / muted markers above nut ────────────────────────────────
  for (let s = 0; s < STRINGS; s++) {
    const f = frets[s];
    const x = sx(s);
    const y = TOP - 9;
    if (f === -1) {
      // Muted: × symbol
      const d = 4;
      parts.push(
        `<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}"
          stroke="var(--muted)" stroke-width="1.4" stroke-linecap="round"/>
         <line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}"
          stroke="var(--muted)" stroke-width="1.4" stroke-linecap="round"/>`
      );
    } else if (f === 0) {
      // Open: small circle
      parts.push(
        `<circle cx="${x}" cy="${y}" r="4"
          fill="none" stroke="var(--text)" stroke-width="1.3" opacity="0.6"/>`
      );
    }
  }

  // ── Finger dots ────────────────────────────────────────────────────
  for (let s = 0; s < STRINGS; s++) {
    const f    = frets[s];
    const fnum = fingers[s];
    if (f <= 0) continue; // open, muted, or zero handled above

    const localFret = f - baseFret + 1;
    if (localFret < 1 || localFret > FRETS) continue;

    const x = sx(s);
    const y = fy(localFret);

    // Skip dot at barre position (barre already drawn)
    const onBarre = barre &&
      (f === barre.fret) &&
      (s >= Math.min(barre.from, barre.to)) &&
      (s <= Math.max(barre.from, barre.to));

    if (!onBarre) {
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="var(--accent)"/>`
      );
    }

    // Finger number
    if (fnum && fnum > 0) {
      parts.push(
        `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"
          font-family="var(--mono)" font-size="7" fill="#fff" font-weight="600"
          pointer-events="none">${fnum}</text>`
      );
    }
  }

  return `<svg width="80" height="100" viewBox="0 0 80 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="${esc(chordName)} chord diagram"
    class="chord-diagram-svg"
    role="img">
    ${parts.join('\n    ')}
  </svg>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  TAB RENDERER — [G] notation → HTML with clickable chord tokens
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert raw tab content using [Chord] notation into HTML.
 *
 * Input lines:  "Amazing [G]grace how [Em]sweet the [C]sound [G]"
 * Output: chord names rendered as <button class="chord-token"> elements
 * appearing inline, colored --accent. The text following each chord
 * is rendered as a plain text node so whitespace is preserved perfectly.
 *
 * We render each "line" of the tab as a <div class="tab-line"> containing
 * interleaved chord tokens and lyric text.
 *
 * @param {string} raw      - raw Tab_Content string from sheet
 * @param {number} semitones - current transpose offset
 * @returns {string}         - HTML string for .tab-body innerHTML
 */
function renderTab(raw, semitones = 0) {
  if (!raw) return '<span style="color:var(--muted-light)">No tab content available.</span>';

  const CHORD_RE = /^[A-G][#b]?(maj7|m7|7|sus2|sus4|add9|m|5)?$/;

  const lines = raw.split('|');
  const htmlLines = lines.map(line => {
    const trimmed = line.trim();

    // Empty line — gap between sections
    if (!trimmed) {
      return '<div class="tab-line tab-line-gap"></div>';
    }

    // Section label — [Verse 1], [Chorus], [Bridge] etc
    // A section label is wrapped in [] but does NOT match a chord pattern
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch && !CHORD_RE.test(sectionMatch[1])) {
      return `<div class="tab-line tab-section-label">${esc(sectionMatch[1])}</div>`;
    }

    // Normal line — may contain [Chord] tokens inline with lyrics
    const parts = line.split(/(\[[^\]]+\])/);
    const spans = parts.map(part => {
      const m = part.match(/^\[([^\]]+)\]$/);
      if (m && CHORD_RE.test(m[1])) {
        // It is a chord token
        const original   = m[1];
        const transposed = transposeChord(original, semitones);
        return `<button class="chord-token" data-chord="${esc(transposed)}" ` +
               `aria-label="${esc(transposed)} chord" type="button">${esc(transposed)}</button>`;
      }
      // Plain text — escape but preserve spaces
      return esc(part);
    });

    return `<div class="tab-line">${spans.join('')}</div>`;
  });

  return htmlLines.join('');
}

/// ─────────────────────────────────────────────────────────────────────────
//  POPOVER MANAGER
// ─────────────────────────────────────────────────────────────────────────

let _popover = null;
let _popoverTimeout = null;
let _activeToken = null;

function ensurePopover() {
  if (_popover) return _popover;
  _popover = document.createElement('div');
  _popover.className  = 'chord-popover';
  _popover.id         = 'chordPopover';
  _popover.setAttribute('role', 'tooltip');
  _popover.setAttribute('aria-live', 'polite');
  document.body.appendChild(_popover);
  return _popover;
}

function showPopover(chordName, anchorEl) {
  const pop = ensurePopover();
  const shape      = CHORD_SHAPES[chordName];
  const diagramSVG = buildDiagramSVG(chordName, shape);

  pop.innerHTML =
    `<div class="chord-popover-name">${esc(chordName)}</div>` +
    (shape
      ? diagramSVG
      : `<div class="chord-popover-unknown">No diagram available</div>`);

  pop.classList.add('visible');

  // Position: desktop — above the token; mobile — CSS centres it
  const isMobile = window.matchMedia('(hover: none)').matches;
  if (!isMobile && anchorEl) {
    const rect     = anchorEl.getBoundingClientRect();
    const popW     = 120; // approximate; real width after paint
    const popH     = 130;
    let left = rect.left + rect.width / 2 - popW / 2;
    let top  = rect.top  - popH - 8 + window.scrollY;

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    if (top < window.scrollY + 8) {
      // Flip below if not enough room above
      top = rect.bottom + 8 + window.scrollY;
    }

    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;
  } else {
    // Mobile: CSS handles centering via translate(-50%,-50%)
    pop.style.left = '50%';
    pop.style.top  = '50%';
  }
}

function hidePopover() {
  if (_popover) _popover.classList.remove('visible');
  _activeToken = null;
}

/**
 * Attach popover events to all .chord-token elements inside `container`.
 * Desktop: mouseenter / mouseleave
 * Mobile:  click/tap to toggle
 */
function attachPopoverEvents(container) {
  const isTouchDevice = () => window.matchMedia('(hover: none)').matches;

  container.addEventListener('mouseenter', e => {
    if (isTouchDevice()) return;
    const token = e.target.closest('.chord-token');
    if (!token) return;
    clearTimeout(_popoverTimeout);
    showPopover(token.dataset.chord, token);
    _activeToken = token;
  }, true);

  container.addEventListener('mouseleave', e => {
    if (isTouchDevice()) return;
    const token = e.target.closest('.chord-token');
    if (!token) return;
    _popoverTimeout = setTimeout(hidePopover, 120);
  }, true);

  // Tap to toggle on mobile
  container.addEventListener('click', e => {
    if (!isTouchDevice()) return;
    const token = e.target.closest('.chord-token');
    if (!token) return;
    e.stopPropagation();
    if (_activeToken === token && _popover?.classList.contains('visible')) {
      hidePopover();
    } else {
      showPopover(token.dataset.chord, token);
      _activeToken = token;
    }
  });

  // Chord-used pills also trigger popover
  container.addEventListener('click', e => {
    const pill = e.target.closest('.chord-used-pill');
    if (!pill) return;
    e.stopPropagation();
    const name = pill.dataset.chord;
    if (_activeToken === pill && _popover?.classList.contains('visible')) {
      hidePopover();
    } else {
      showPopover(name, pill);
      _activeToken = pill;
    }
  });
}

// Close popover on outside click
document.addEventListener('click', e => {
  if (_popover?.classList.contains('visible') &&
      !e.target.closest('.chord-token') &&
      !e.target.closest('.chord-used-pill') &&
      !e.target.closest('#chordPopover')) {
    hidePopover();
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  FONT SIZE CONTROL
// ─────────────────────────────────────────────────────────────────────────

const FONT_SIZES  = ['.70rem','.76rem','.82rem','.88rem','.94rem','1.0rem','1.06rem','1.12rem','1.2rem'];
const FONT_DEFAULT_IDX = 3; // '.88rem'
const LS_FONT_KEY = 'sd_tab_font_size';

function getFontIdx() {
  try {
    const saved = localStorage.getItem(LS_FONT_KEY);
    if (saved !== null) {
      const idx = parseInt(saved);
      if (idx >= 0 && idx < FONT_SIZES.length) return idx;
    }
  } catch {}
  return FONT_DEFAULT_IDX;
}

function setFontIdx(tabBody, idx, display) {
  const clamped = Math.max(0, Math.min(FONT_SIZES.length - 1, idx));
  tabBody.style.setProperty('--tab-font-size', FONT_SIZES[clamped]);
  if (display) display.textContent = `${Math.round((clamped / (FONT_SIZES.length - 1)) * 100)}%`;
  try { localStorage.setItem(LS_FONT_KEY, String(clamped)); } catch {}
  return clamped;
}

// ─────────────────────────────────────────────────────────────────────────
//  AUTO-SCROLL
// ─────────────────────────────────────────────────────────────────────────

const LS_SPEED_KEY = 'sd_scroll_speed';
let _scrollInterval = null;

function getScrollSpeed() {
  try {
    const v = parseInt(localStorage.getItem(LS_SPEED_KEY));
    if (v >= 1 && v <= 10) return v;
  } catch {}
  return 3;
}

/** Speed 1–10 → interval ms (10 = fastest = 16ms, 1 = slowest = 80ms) */
function speedToInterval(speed) {
  return Math.round(80 - (speed - 1) * (80 - 16) / 9);
}

function startScroll(speed) {
  stopScroll();
  _scrollInterval = setInterval(() => window.scrollBy({ top: 1, behavior: 'instant' }), speedToInterval(speed));
}

function stopScroll() {
  if (_scrollInterval) { clearInterval(_scrollInterval); _scrollInterval = null; }
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD LIST STATE
// ─────────────────────────────────────────────────────────────────────────

const chordsState = {
  query:      '',
  category:   'all',
  difficulty: 'all',
  key:        'all',
  sort:       'newest',
  page:       1,
};

let _chordsRows = null; // cached sheet rows

function parseDateMs(s) {
  if (!s) return 0;
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function applyChordFilters(rows) {
  let result = [...rows];

  if (chordsState.query) {
    const q = chordsState.query.toLowerCase();
    result = result.filter(r =>
      (r.Title  || '').toLowerCase().includes(q) ||
      (r.Artist || '').toLowerCase().includes(q) ||
      (r.Tags   || '').toLowerCase().includes(q)
    );
  }
  if (chordsState.category !== 'all') {
    const cat = chordsState.category.toLowerCase();
    result = result.filter(r => (r.Category || '').toLowerCase() === cat);
  }
  if (chordsState.difficulty !== 'all') {
    const diff = chordsState.difficulty.toLowerCase();
    result = result.filter(r => (r.Difficulty || '').toLowerCase() === diff);
  }
  if (chordsState.key !== 'all') {
    result = result.filter(r => (r.Key || '').trim() === chordsState.key);
  }

  result.sort((a, b) => {
    switch (chordsState.sort) {
      case 'newest':   return parseDateMs(b.Date_Added) - parseDateMs(a.Date_Added);
      case 'az':       return (a.Title  || '').localeCompare(b.Title  || '');
      case 'artist':   return (a.Artist || '').localeCompare(b.Artist || '');
      default:         return 0;
    }
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD CARD BUILDER
// ─────────────────────────────────────────────────────────────────────────

function diffBadgeClass(diff) {
  switch ((diff || '').toLowerCase()) {
    case 'beginner':     return 'chord-badge-diff-beginner';
    case 'intermediate': return 'chord-badge-diff-intermediate';
    case 'advanced':     return 'chord-badge-diff-advanced';
    default:             return 'chord-badge-key';
  }
}

function buildChordCard(row) {
  const card = document.createElement('article');
  card.className = 'chord-card reveal';
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${row.Title || 'Song'} by ${row.Artist || 'Unknown'}`);

  const imgUrl = fixImgUrl(row.Image_URL || '');

  // Thumbnail
  const thumb = document.createElement('div');
  thumb.className = 'chord-card-thumb';
  if (imgUrl) {
    const img    = document.createElement('img');
    img.src      = imgUrl;
    img.alt      = row.Image_Alt || `${row.Title} chord sheet thumbnail`;
    img.loading  = 'lazy';
    img.decoding = 'async';
    img.width    = 290;
    img.height   = 163;
    thumb.appendChild(img);
  } else {
    thumb.setAttribute('aria-hidden', 'true');
    thumb.textContent = '🎵';
  }
  card.appendChild(thumb);

  // Body
  const body = document.createElement('div');
  body.className = 'chord-card-body';

  const keyStr  = row.Key   ? `<span class="chord-badge chord-badge-key">Key of ${esc(row.Key)}</span>` : '';
  const capoStr = row.Capo && row.Capo !== '0'
    ? `<span class="chord-badge chord-badge-key">Capo ${esc(row.Capo)}</span>` : '';
  const diffStr = row.Difficulty
    ? `<span class="chord-badge ${diffBadgeClass(row.Difficulty)}">${esc(row.Difficulty)}</span>` : '';
  const catStr  = row.Category
    ? `<span class="chord-badge chord-badge-cat">${esc(row.Category)}</span>` : '';

  body.innerHTML =
    `<div class="chord-card-meta">` +
      `<time datetime="${esc(row.Date_Added || '')}">${esc(row.Date_Added || '')}</time>` +
    `</div>` +
    `<h3 class="chord-card-title">${esc(row.Title || '')}</h3>` +
    `<div class="chord-card-artist">${esc(row.Artist || '')}</div>` +
    `<div class="chord-card-badges">${catStr}${diffStr}${keyStr}${capoStr}</div>`;

  card.appendChild(body);

  // Navigation
  const slug = (row.Slug || '').trim();
  const go   = () => import('../router.js').then(({ navigate }) => navigate(`/chords/${slug}`));
  card.addEventListener('click', go);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });

  return card;
}

// ─────────────────────────────────────────────────────────────────────────
//  FILTER CHIP BUILDER (category + difficulty + key)
// ─────────────────────────────────────────────────────────────────────────

function buildFilterGroup(container, label, items, stateKey, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'chords-filters';

  const lbl = document.createElement('span');
  lbl.className   = 'chords-filter-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);

  const allBtn = document.createElement('button');
  allBtn.className = 'chord-chip' + (chordsState[stateKey] === 'all' ? ' active' : '');
  allBtn.textContent = 'All';
  allBtn.setAttribute('aria-pressed', String(chordsState[stateKey] === 'all'));
  allBtn.dataset.val = 'all';
  wrap.appendChild(allBtn);

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'chord-chip' + (chordsState[stateKey] === item ? ' active' : '');
    btn.textContent = item;
    btn.setAttribute('aria-pressed', String(chordsState[stateKey] === item));
    btn.dataset.val = item;
    wrap.appendChild(btn);
  });

  wrap.addEventListener('click', e => {
    const btn = e.target.closest('.chord-chip');
    if (!btn) return;
    const val = btn.dataset.val;
    chordsState[stateKey] = val;
    chordsState.page = 1;
    wrap.querySelectorAll('.chord-chip').forEach(b => {
      const active = b.dataset.val === val;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    onChange();
  });

  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────────────────────────
//  RENDER FILTERED CHORDS LIST
// ─────────────────────────────────────────────────────────────────────────

function renderFilteredChords(grid, paginationEl, countEl) {
  if (!_chordsRows?.length) return;

  const filtered = applyChordFilters(_chordsRows);
  const perPage  = CFG.chordsPerPage || 12;
  const total    = Math.ceil(filtered.length / perPage);
  const page     = Math.max(1, Math.min(chordsState.page, total || 1));
  const slice    = filtered.slice((page - 1) * perPage, page * perPage);

  if (countEl) {
    countEl.textContent = (chordsState.query || chordsState.category !== 'all' ||
      chordsState.difficulty !== 'all' || chordsState.key !== 'all')
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : '';
  }

  grid.innerHTML = '';

  if (!slice.length) {
    grid.innerHTML = '<p class="empty-state">No chord sheets match your filters.</p>';
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const frag = document.createDocumentFragment();
  slice.forEach(row => frag.appendChild(buildChordCard(row)));
  grid.appendChild(frag);

  // Pagination
  if (paginationEl) {
    paginationEl.innerHTML = '';
    if (total > 1) {
      const prev = document.createElement('button');
      prev.className = 'btn btn-ghost';
      prev.textContent = '← Prev';
      prev.setAttribute('aria-label', 'Previous page');
      prev.disabled = page <= 1;

      const info = document.createElement('span');
      info.setAttribute('aria-live', 'polite');
      info.setAttribute('aria-atomic', 'true');
      info.textContent = `Page ${page} of ${total}`;

      const next = document.createElement('button');
      next.className = 'btn btn-ghost';
      next.textContent = 'Next →';
      next.setAttribute('aria-label', 'Next page');
      next.disabled = page >= total;

      prev.addEventListener('click', () => {
        chordsState.page = page - 1;
        renderFilteredChords(grid, paginationEl, countEl);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      next.addEventListener('click', () => {
        chordsState.page = page + 1;
        renderFilteredChords(grid, paginationEl, countEl);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      if (page > 1)    paginationEl.appendChild(prev);
      paginationEl.appendChild(info);
      if (page < total) paginationEl.appendChild(next);
    }
  }

  watchReveals();
}

// ─────────────────────────────────────────────────────────────────────────
//  RENDER CHORD LIST PAGE — /chords
// ─────────────────────────────────────────────────────────────────────────

export async function renderChords() {
  await ensureCSS();
  removeSchemas();

  updateSEO({
    title: 'Chord Sheets',
    desc:  'Guitar chord sheets with transpose, diagrams, and auto-scroll — curated by Suman Dangal.',
    path:  '/chords',
  });

  const view = document.getElementById('view-chords');
  if (!view) return;

  // Show skeleton while loading
  view.innerHTML =
    `<div class="chords-hero">
      <div class="chords-hero-inner">
        <div class="chords-hero-eyebrow">Music</div>
        <h2 class="chords-hero-title">Chord Sheets</h2>
        <p class="chords-hero-sub">
          Guitar chords with real-time transpose, diagrams on hover, and hands-free auto-scroll.
          Built for players, not just readers.
        </p>
      </div>
    </div>
    <div class="chords-toolbar" id="chordsToolbar" style="padding-top:1.4rem">
      <div class="skel skel-line" style="width:220px;height:38px;border-radius:.4rem"></div>
      <div class="skel skel-line" style="width:120px;height:38px;border-radius:.4rem"></div>
    </div>
    <div class="chords-section">
      <div class="chords-grid" id="chordsGrid">
        ${'<div class="skel skel-card"></div>'.repeat(6)}
      </div>
    </div>`;

  // Fetch
  const rows = await fetchSheet(CFG.api.chords, 'chords', fresh => {
    _chordsRows = fresh;
    rebuildList();
  });

  _chordsRows = rows;

  if (!rows?.length) {
    view.innerHTML =
      `<div class="chords-hero">
        <div class="chords-hero-inner">
          <div class="chords-hero-eyebrow">Music</div>
          <h2 class="chords-hero-title">Chord Sheets</h2>
          <p class="chords-hero-sub">No chord sheets yet — check back soon.</p>
        </div>
      </div>`;
    return;
  }

  rebuildList();

  function rebuildList() {
    if (!_chordsRows?.length) return;
    buildListUI(view, _chordsRows);
  }
}

function buildListUI(view, rows) {
  // Collect unique values for filters
  const categories   = [...new Set(rows.map(r => r.Category).filter(Boolean))].sort();
  const difficulties = ['beginner', 'intermediate', 'advanced'].filter(d =>
    rows.some(r => (r.Difficulty || '').toLowerCase() === d)
  );
  const keys = [...new Set(rows.map(r => r.Key).filter(Boolean))].sort();

  // Featured rows
  const featured = rows.filter(r => (r.Featured || '').toLowerCase() === 'true');

  const featuredHTML = featured.length
    ? `<div class="chords-featured" id="chordsFeatured">
        <div class="chords-featured-heading">⭐ Featured</div>
        <div class="chords-featured-grid" id="chordsFeaturedGrid"></div>
      </div>`
    : '';

  view.innerHTML =
    `<div class="chords-hero">
      <div class="chords-hero-inner">
        <div class="chords-hero-eyebrow">Music</div>
        <h2 class="chords-hero-title">Chord Sheets</h2>
        <p class="chords-hero-sub">
          Guitar chords with real-time transpose, diagrams on hover, and hands-free auto-scroll.
          Built for players, not just readers.
        </p>
      </div>
    </div>
    <div class="chords-toolbar" id="chordsToolbar">
      <div class="chords-search-wrap">
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input type="search" id="chordsSearch" placeholder="Search songs, artists…"
          autocomplete="off" aria-label="Search chord sheets"
          value="${esc(chordsState.query)}"/>
      </div>
      <div id="chordsFilterArea"></div>
      <div class="chords-sort-wrap">
        <label for="chordsSort" class="sr-only">Sort chord sheets</label>
        <select id="chordsSort" aria-label="Sort chord sheets">
          <option value="newest"${chordsState.sort==='newest'?' selected':''}>Newest first</option>
          <option value="az"${chordsState.sort==='az'?' selected':''}>Title A → Z</option>
          <option value="artist"${chordsState.sort==='artist'?' selected':''}>By artist</option>
        </select>
      </div>
      <span class="chords-results-count" id="chordsCount" aria-live="polite"></span>
    </div>
    <div class="chords-section">
      ${featuredHTML}
      <div class="chords-grid" id="chordsGrid" aria-live="polite" aria-label="Chord sheet list"></div>
      <div class="chords-pagination" id="chordsPagination" aria-label="Chord sheet pagination"></div>
    </div>`;

  const filterArea = document.getElementById('chordsFilterArea');
  const grid       = document.getElementById('chordsGrid');
  const pagination = document.getElementById('chordsPagination');
  const countEl    = document.getElementById('chordsCount');

  const refresh = () => renderFilteredChords(grid, pagination, countEl);

  // Build filter groups
  if (categories.length)   buildFilterGroup(filterArea, 'Category:',   categories,   'category',   refresh);
  if (difficulties.length) buildFilterGroup(filterArea, 'Difficulty:',  difficulties, 'difficulty', refresh);
  if (keys.length)         buildFilterGroup(filterArea, 'Key:',         keys,         'key',        refresh);

  // Search
  let searchDebounce;
  const searchEl = document.getElementById('chordsSearch');
  if (searchEl) {
    searchEl.addEventListener('input', e => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        chordsState.query = e.target.value.trim();
        chordsState.page  = 1;
        refresh();
      }, 260);
    });
  }

  // Sort
  const sortEl = document.getElementById('chordsSort');
  if (sortEl) {
    sortEl.addEventListener('change', e => {
      chordsState.sort = e.target.value;
      chordsState.page = 1;
      refresh();
    });
  }

  // Featured strip
  const featGrid = document.getElementById('chordsFeaturedGrid');
  if (featGrid && featured.length) {
    const frag = document.createDocumentFragment();
    featured.forEach(row => {
      const card = document.createElement('div');
      card.className = 'chord-feat-card reveal';
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${row.Title} by ${row.Artist}`);
      const diffBadge  = row.Difficulty
        ? `<span class="chord-badge ${diffBadgeClass(row.Difficulty)}">${esc(row.Difficulty)}</span>` : '';
      const keyBadge   = row.Key
        ? `<span class="chord-badge chord-badge-key">Key of ${esc(row.Key)}</span>` : '';
      card.innerHTML =
        `<div class="chord-feat-title">${esc(row.Title || '')}</div>` +
        `<div class="chord-feat-artist">${esc(row.Artist || '')}</div>` +
        `<div class="chord-feat-badges">${diffBadge}${keyBadge}</div>`;
      const slug = (row.Slug || '').trim();
      const go   = () => import('../router.js').then(({ navigate }) => navigate(`/chords/${slug}`));
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
      frag.appendChild(card);
    });
    featGrid.appendChild(frag);
  }

  // Initial render
  refresh();
  watchReveals();
}

// ─────────────────────────────────────────────────────────────────────────
//  RENDER CHORD DETAIL PAGE — /chords/:slug
// ─────────────────────────────────────────────────────────────────────────

export async function renderChordDetail(slug) {
  await ensureCSS();
  removeSchemas();

  const view = document.getElementById('view-chord-detail');
  if (!view) return;

  // Skeleton
  view.innerHTML =
    `<div class="chord-detail-wrap">
      <div class="skel skel-line m" style="margin-bottom:1.5rem;width:80px;height:20px"></div>
      <div class="skel skel-line" style="height:42px;margin-bottom:.8rem"></div>
      <div class="skel skel-line m" style="height:18px;margin-bottom:2rem"></div>
      <div class="skel skel-card" style="height:220px;margin-bottom:2rem"></div>
      ${'<div class="skel skel-line"></div>'.repeat(5)}
    </div>`;

  // Fetch — use cached rows if available, otherwise fetch
  const rows = _chordsRows ||
    await fetchSheet(CFG.api.chords, 'chords', fresh => { _chordsRows = fresh; });
  if (!_chordsRows && rows) _chordsRows = rows;

  const post = _chordsRows?.find(r => (r.Slug || '').trim() === slug);

  if (!post) {
    view.innerHTML =
      `<div class="chord-detail-wrap">
        <button class="chord-detail-back" id="chordBack">← Back to Chord Sheets</button>
        <div class="not-found-wrap">
          <span class="not-found-code" aria-hidden="true">404</span>
          <h2>Chord sheet not found</h2>
          <p>No chord sheet with slug <code style="font-family:var(--mono);color:var(--accent)">${esc(slug)}</code></p>
          <a href="/chords" class="btn btn-solid" data-link>← Browse all chord sheets</a>
        </div>
      </div>`;
    document.getElementById('chordBack')
      ?.addEventListener('click', () => import('../router.js').then(({ navigate }) => navigate('/chords')));
    updateSEO({ title: 'Not Found', desc: 'Chord sheet not found.', path: `/chords/${slug}` });
    return;
  }

  // ── State for this detail page ───────────────────────────────────────
  let semitones   = 0;
  let fontIdx     = getFontIdx();
  let isScrolling = false;
  let scrollSpeed = getScrollSpeed();

  // ── SEO ──────────────────────────────────────────────────────────────
  const tagList = (post.Tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const imgUrl  = fixImgUrl(post.Image_URL || '');

  updateSEO({
    title:     `${post.Title} — ${post.Artist} Chords`,
    desc:      post.Excerpt || `Guitar chords for ${post.Title} by ${post.Artist}. Key of ${post.Key}.`,
    path:      `/chords/${slug}`,
    ogImage:   imgUrl || '',
    chordMeta: {
      title:    post.Title,
      artist:   post.Artist,
      key:      post.Key,
      excerpt:  post.Excerpt,
      slug,
      imageUrl: imgUrl,
      tags:     tagList,
    },
  });

  // ── Compute chords used (for the pill row + hover diagrams) ───────────
  const chordsUsed = (post.Chords_Used || '')
    .split(',').map(c => c.trim()).filter(Boolean);

  // ── Build page HTML ───────────────────────────────────────────────────
  const coverHTML = imgUrl
    ? `<img class="chord-detail-cover" src="${esc(imgUrl)}"
        alt="${esc(post.Image_Alt || post.Title + ' chord sheet cover')}"
        loading="eager" decoding="async" fetchpriority="high"
        width="1200" height="450">`
    : '';

  const diffBadge  = post.Difficulty
    ? `<span class="chord-badge ${diffBadgeClass(post.Difficulty)}">${esc(post.Difficulty)}</span>` : '';
  const catBadge   = post.Category
    ? `<span class="chord-badge chord-badge-cat">${esc(post.Category)}</span>` : '';
  const tagBadges  = tagList.map(t =>
    `<span class="chord-badge chord-badge-key">${esc(t)}</span>`).join('');

  const chordsUsedHTML = chordsUsed.length
    ? `<div class="chord-used-row">
        <span class="chord-used-label">Chords:</span>
        ${chordsUsed.map(c =>
          `<button class="chord-used-pill" data-chord="${esc(c)}" type="button"
            aria-label="Show ${esc(c)} chord diagram">${esc(c)}</button>`
        ).join('')}
      </div>` : '';

  const introHTML = post.Intro_Text
    ? `<p class="chord-detail-intro">${esc(post.Intro_Text)}</p>` : '';

  view.innerHTML =
    `<div class="chord-detail-wrap" id="chordDetailWrap">
      <button class="chord-detail-back" id="chordBack" aria-label="Back to chord sheets">
        ← Back to Chord Sheets
      </button>

      <div class="chord-detail-header">
        <h2 class="chord-detail-title" id="chordDetailTitle">${esc(post.Title || '')}</h2>
        <div class="chord-detail-artist">${esc(post.Artist || '')}
          ${post.Album ? `· <em>${esc(post.Album)}</em>` : ''}
          ${post.Year  ? `· ${esc(post.Year)}` : ''}
        </div>

        ${coverHTML}

        <div class="chord-detail-meta">
          ${post.Key           ? `<span>Key <strong id="currentKeyDisplay">${esc(post.Key)}</strong></span>` : ''}
          ${post.Capo && post.Capo !== '0' ? `<span>Capo <strong>${esc(post.Capo)}</strong></span>` : ''}
          ${post.BPM           ? `<span>BPM <strong>${esc(post.BPM)}</strong></span>` : ''}
          ${post.Time_Signature ? `<span>Time <strong>${esc(post.Time_Signature)}</strong></span>` : ''}
          ${post.Tuning        ? `<span>Tuning <strong>${esc(post.Tuning)}</strong></span>` : ''}
        </div>

        <div class="chord-detail-badges">${catBadge}${diffBadge}${tagBadges}</div>

        ${introHTML}
        ${chordsUsedHTML}

        <div class="chord-capo-suggestion" id="capoSuggestion" hidden aria-live="polite"></div>
      </div>

      <!-- Controls bar -->
      <div class="chord-controls" id="chordControls" role="toolbar" aria-label="Chord sheet controls">

        <!-- Transpose -->
        <div class="ctrl-group" role="group" aria-label="Transpose">
          <span class="ctrl-label">Transpose</span>
          <button class="ctrl-btn" id="transposeDown" aria-label="Transpose down one semitone"
            title="Transpose down">−</button>
          <span class="ctrl-transpose-display" id="transposeDisplay" aria-live="polite">0</span>
          <button class="ctrl-btn" id="transposeUp"   aria-label="Transpose up one semitone"
            title="Transpose up">+</button>
        </div>

        <!-- Font size -->
        <div class="ctrl-group" role="group" aria-label="Font size">
          <span class="ctrl-label">Size</span>
          <button class="ctrl-btn" id="fontDown" aria-label="Decrease tab font size">A−</button>
          <span class="ctrl-fontsize-display" id="fontDisplay" aria-live="polite"></span>
          <button class="ctrl-btn" id="fontUp"   aria-label="Increase tab font size">A+</button>
        </div>

        <!-- Auto-scroll -->
        <div class="ctrl-group" role="group" aria-label="Auto scroll">
          <button class="ctrl-scroll-toggle" id="scrollToggle" aria-pressed="false">
            ▶ Auto-scroll
          </button>
          <div class="ctrl-speed-wrap" aria-label="Scroll speed">
            <span class="ctrl-label">Speed</span>
            <input type="range" class="ctrl-speed" id="scrollSpeed"
              min="1" max="10" value="${scrollSpeed}"
              aria-label="Scroll speed (1 slow, 10 fast)">
          </div>
        </div>

        <!-- Actions -->
        <div class="ctrl-actions">
          <button class="ctrl-action-btn" id="printBtn" aria-label="Print chord sheet">
            🖨 Print
          </button>
          <button class="ctrl-action-btn" id="shareBtn" aria-label="Copy link to clipboard">
            🔗 Share
          </button>
        </div>
      </div>

      <!-- Tab content -->
      <div class="tab-container" id="tabContainer" role="region" aria-label="Tab content">
        <div class="tab-body" id="tabBody"></div>
      </div>
    </div>`;

  // ── Grab all interactive elements ─────────────────────────────────────
  const tabBody         = document.getElementById('tabBody');
  const transposeDisp   = document.getElementById('transposeDisplay');
  const keyDisp         = document.getElementById('currentKeyDisplay');
  const capoSug         = document.getElementById('capoSuggestion');
  const transposeDown   = document.getElementById('transposeDown');
  const transposeUp     = document.getElementById('transposeUp');
  const fontDown        = document.getElementById('fontDown');
  const fontUp          = document.getElementById('fontUp');
  const fontDisp        = document.getElementById('fontDisplay');
  const scrollToggle    = document.getElementById('scrollToggle');
  const scrollSpeedEl   = document.getElementById('scrollSpeed');
  const printBtn        = document.getElementById('printBtn');
  const shareBtn        = document.getElementById('shareBtn');
  const chordBack       = document.getElementById('chordBack');
  const tabContainer    = document.getElementById('tabContainer');

  // ── Initial render of tab ─────────────────────────────────────────────
  function refreshTab() {
    if (!tabBody) return;
    tabBody.innerHTML = renderTab(post.Tab_Content || '', semitones);

    // Update key display
    if (keyDisp) {
      keyDisp.textContent = semitones
        ? transposeKey(post.Key || '', semitones)
        : (post.Key || '');
    }

    // Transpose offset display
    if (transposeDisp) {
      const sign = semitones > 0 ? '+' : '';
      transposeDisp.textContent = semitones ? `${sign}${semitones}` : '0';
    }

    // Disable +/− at limits
    if (transposeDown) transposeDown.disabled = semitones <= -6;
    if (transposeUp)   transposeUp.disabled   = semitones >= 6;

    // Capo suggestion
    if (capoSug) {
      const sug = capoSuggestion(post.Key || '', post.Capo || '0', semitones);
      if (sug) {
        capoSug.removeAttribute('hidden');
        capoSug.innerHTML =
          `🎸 Play <strong>${esc(sug.playKey)}</strong> shapes with capo on fret ` +
          `<strong>${sug.capoFret}</strong> → sounds in ` +
          `<strong>${esc(sug.soundsIn)}</strong>`;
      } else {
        capoSug.setAttribute('hidden', '');
        capoSug.innerHTML = '';
      }
    }

    // Re-attach popover events to newly rendered tokens
    if (tabContainer) attachPopoverEvents(tabContainer);
  }

  // Apply stored font size
  fontIdx = setFontIdx(tabBody, fontIdx, fontDisp);

  // Initial tab render
  refreshTab();

  // Attach popover to chord-used pills too
  const wrap = document.getElementById('chordDetailWrap');
  if (wrap) attachPopoverEvents(wrap);

  // ── Transpose buttons ─────────────────────────────────────────────────
  transposeDown?.addEventListener('click', () => {
    if (semitones > -6) { semitones--; refreshTab(); }
  });
  transposeUp?.addEventListener('click', () => {
    if (semitones < 6) { semitones++; refreshTab(); }
  });

  // ── Font-size buttons ─────────────────────────────────────────────────
  fontDown?.addEventListener('click', () => {
    fontIdx = setFontIdx(tabBody, fontIdx - 1, fontDisp);
  });
  fontUp?.addEventListener('click', () => {
    fontIdx = setFontIdx(tabBody, fontIdx + 1, fontDisp);
  });

  // ── Auto-scroll ───────────────────────────────────────────────────────
  scrollToggle?.addEventListener('click', () => {
    isScrolling = !isScrolling;
    scrollToggle.classList.toggle('scrolling', isScrolling);
    scrollToggle.setAttribute('aria-pressed', String(isScrolling));
    scrollToggle.textContent = isScrolling ? '⏸ Scrolling…' : '▶ Auto-scroll';
    if (isScrolling) {
      startScroll(scrollSpeed);
    } else {
      stopScroll();
    }
  });

  scrollSpeedEl?.addEventListener('input', e => {
    scrollSpeed = parseInt(e.target.value) || 3;
    try { localStorage.setItem(LS_SPEED_KEY, String(scrollSpeed)); } catch {}
    if (isScrolling) startScroll(scrollSpeed); // restart with new speed
  });

  // Stop scroll when leaving the page
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isScrolling) stopScroll();
  }, { once: false });

  // ── Print ─────────────────────────────────────────────────────────────
  printBtn?.addEventListener('click', () => window.print());

  // ── Share (copy URL to clipboard) ─────────────────────────────────────
  shareBtn?.addEventListener('click', async () => {
    const url = `${window.location.origin}/chords/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard!');
    } catch {
      // Fallback: select a temp input
      const tmp = document.createElement('input');
      tmp.value = url;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      showToast('Link copied!');
    }
  });

  // ── Back button ───────────────────────────────────────────────────────
  chordBack?.addEventListener('click', () => {
    stopScroll();
    import('../router.js').then(({ navigate }) => navigate('/chords'));
  });

  // Stop scroll on any internal navigation
  window.addEventListener('popstate', stopScroll, { once: true });

  watchReveals();
}