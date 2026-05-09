// js/views/chords.js
/**
 * js/views/chords.js
 *
 * Renders the Chords section: list page (/chords) and detail page (/chords/:slug).
 *
 * Exports:
 *   renderChords()          — list page, called by router for /chords
 *   renderChordDetail(slug) — detail page, called by router for /chords/:slug
 *
 * Features:
 *   - Search (title + artist + tags), filter by category, difficulty, key
 *   - Sort: newest, A–Z, by artist
 *   - Pagination (CFG.chordsPerPage per page)
 *   - Featured strip
 *   - Recently Played strip (last 10 songs, localStorage-persisted)
 *   - Transpose ±6 semitones with enharmonic-aware chord name rewriting
 *   - Capo suggestion banner (zero-height collapsible, no layout shift)
 *   - Multi-instrument support: Guitar / Ukulele / Piano
 *   - Chord Popup: inline tooltip card; on mobile routes to bottom sheet
 *   - Chord Variant Navigation: prev/next voicings per chord (session-scoped)
 *   - Pinned Chords Row: horizontal strip on desktop; right-side drawer on mobile
 *   - Floating FAB (mobile): shows transpose value + ⚙; opens bottom sheet
 *   - Bottom sheet drawer (mobile): all controls in a vertical layout
 *   - Chord-above-lyric layout
 *   - Font-size A−/A+ with localStorage persistence
 *   - Auto-scroll toggle with speed slider (localStorage persistence)
 *   - Print + Share buttons
 *   - SEO: updateSEO with chordMeta for MusicComposition schema
 *   - Lazy-loads css/chords.css before first render
 *
 * Bug Fixes vs. previous version:
 *   [Bug 1] Chords-Used pills now transpose correctly via refreshChordsUsed()
 *   [Bug 2] Capo suggestion moved to .chord-capo-banner-wrap outside header
 *   [Bug 3] Pinned card SVG uses size:'small' — no transform:scale hacks
 *
 * Dependencies:
 *   js/api.js        → fetchSheet, CFG
 *   js/seo.js        → updateSEO, removeSchemas
 *   js/utils.js      → esc, fixImgUrl, loadCSS, watchReveals, showToast
 *   js/data/chord-shapes.js → GUITAR_SHAPES, UKULELE_SHAPES, PIANO_SHAPES, getShape, getVariantCount
 */

import { fetchSheet, CFG }                from '../api.js';
import { updateSEO, removeSchemas }       from '../seo.js';
import { esc, fixImgUrl, loadCSS, watchReveals, showToast } from '../utils.js';
import {
  GUITAR_SHAPES, UKULELE_SHAPES, PIANO_SHAPES,
  getShape, getVariantCount,
} from '../data/chord-shapes.js';

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
//  RECENTLY PLAYED — localStorage persistence, max 10 entries
// ─────────────────────────────────────────────────────────────────────────

const LS_RECENT_KEY = 'sd5_chords_recent';
const RECENT_MAX    = 10;

function recentGet() {
  try {
    const raw = localStorage.getItem(LS_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function recentPush(entry) {
  try {
    let list = recentGet().filter(e => e.slug !== entry.slug);
    list.unshift({ ...entry, ts: Date.now() });
    if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
    localStorage.setItem(LS_RECENT_KEY, JSON.stringify(list));
  } catch {}
}

function recentClear() {
  try { localStorage.removeItem(LS_RECENT_KEY); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────
//  CHROMATIC / TRANSPOSE ENGINE
// ─────────────────────────────────────────────────────────────────────────

const SHARPS    = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb']);
const TO_FLAT   = { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb' };
const TO_SHARP  = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#' };

function toSharp(root) { return TO_SHARP[root] || root; }

function transposeRoot(root, semitones) {
  if (!semitones) return root;
  const sharp = toSharp(root);
  const idx   = SHARPS.indexOf(sharp);
  if (idx === -1) return root;
  const newSharp = SHARPS[(idx + semitones + 12) % 12];
  if (FLAT_KEYS.has(newSharp) || TO_FLAT[newSharp]) {
    const flat = TO_FLAT[newSharp];
    if (flat && FLAT_KEYS.has(flat)) return flat;
  }
  return newSharp;
}

function parseChord(name) {
  const m = name.match(/^([A-G][#b]?)(.*)/);
  if (!m) return null;
  return { root: m[1], suffix: m[2] };
}

function transposeChord(name, semitones) {
  if (!semitones) return name;
  const parsed = parseChord(name);
  if (!parsed) return name;
  return transposeRoot(parsed.root, semitones) + parsed.suffix;
}

function transposeKey(keyStr, semitones) {
  if (!keyStr || !semitones) return keyStr;
  const parsed = parseChord(keyStr);
  if (!parsed) return keyStr;
  return transposeRoot(parsed.root, semitones) + parsed.suffix;
}

function capoSuggestion(originalKey, originalCapo, semitones) {
  if (!semitones || semitones < 0 || semitones > 5) return null;
  const origCapoNum = parseInt(originalCapo) || 0;
  const newCapo     = origCapoNum + semitones;
  if (newCapo > 7) return null;
  return {
    playKey:  originalKey,
    capoFret: newCapo,
    soundsIn: transposeKey(originalKey, semitones),
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD VARIANT INDEX — session-scoped (resets per page load)
// ─────────────────────────────────────────────────────────────────────────

/** @type {Map<string, number>} chord name → variant index */
const chordVariantIndex = new Map();

function getVariantIdx(chordName) {
  return chordVariantIndex.get(chordName) || 0;
}

function setVariantIdx(chordName, idx) {
  chordVariantIndex.set(chordName, idx);
}

// ─────────────────────────────────────────────────────────────────────────
//  SVG DIAGRAM GENERATORS
// ─────────────────────────────────────────────────────────────────────────

const D = {
  bg:         '#ffffff',
  string:     'rgba(45,106,79,.3)',
  fret:       'rgba(45,106,79,.15)',
  nut:        'rgba(45,106,79,.8)',
  dot:        '#2d6a4f',
  dotText:    '#fff',
  openCircle: 'rgba(45,106,79,.6)',
  muted:      'rgba(45,106,79,.3)',
  barre:      '#2d6a4f',
  text:       'rgba(45,106,79,.5)',
  label:      '#2d6a4f',
};

/**
 * Build guitar SVG.
 * @param {string} chordName
 * @param {object|null} shape
 * @param {'normal'|'small'} [size='normal']
 */
function buildGuitarSVG(chordName, shape, size = 'normal') {
  const isSmall = size === 'small';
  // Small: 52×62, Normal: 100×122
  const W_FULL = isSmall ? 52 : 100;
  const H_FULL = isSmall ? 62 : 122;

  if (!shape) return _noShapeSVG(chordName, 6, W_FULL, H_FULL);

  const { frets, fingers, barre, baseFret = 1 } = shape;

  // Scale coordinates proportionally
  const scale  = isSmall ? 0.52 : 1;
  const LEFT   = 18  * scale;
  const TOP    = 28  * scale;
  const W      = 56  * scale;
  const H      = 64  * scale;
  const NS     = 6, NF = 5;
  const SG     = W / (NS - 1);
  const FG     = H / NF;
  const DR     = 6  * scale;

  const sx = i => LEFT + (NS - 1 - i) * SG;
  const fy = f => TOP + (f - 0.5) * FG;

  const p = [];

  if (baseFret === 1) {
    p.push(`<line x1="${LEFT}" y1="${TOP}" x2="${LEFT + W}" y2="${TOP}" stroke="${D.nut}" stroke-width="${3*scale}" stroke-linecap="round"/>`);
  } else {
    p.push(`<text x="${LEFT - 5*scale}" y="${TOP + FG * 0.55}" text-anchor="end" font-family="monospace" font-size="${7.5*scale}" fill="${D.text}" dominant-baseline="middle">${baseFret}</text>`);
  }

  for (let s = 0; s < NS; s++) {
    const x = sx(s);
    p.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + H}" stroke="${D.string}" stroke-width="${1.2*scale}"/>`);
  }

  for (let f = 1; f <= NF; f++) {
    const y = TOP + f * FG;
    p.push(`<line x1="${LEFT}" y1="${y}" x2="${LEFT + W}" y2="${y}" stroke="${D.fret}" stroke-width="${0.8*scale}"/>`);
  }

  if (barre) {
    const lf = barre.fret - baseFret + 1;
    if (lf >= 1 && lf <= NF) {
      const x1 = sx(barre.to), x2 = sx(barre.from), by = fy(lf);
      p.push(`<rect x="${x1 - DR}" y="${by - DR}" width="${x2 - x1 + DR * 2}" height="${DR * 2}" rx="${DR}" fill="${D.barre}" opacity="0.88"/>`);
    }
  }

  for (let s = 0; s < NS; s++) {
    const f = frets[s], x = sx(s), y = TOP - 11 * scale;
    if (f === -1) {
      const d = 3.5 * scale;
      p.push(
        `<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}" stroke="${D.muted}" stroke-width="${1.5*scale}" stroke-linecap="round"/>` +
        `<line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}" stroke="${D.muted}" stroke-width="${1.5*scale}" stroke-linecap="round"/>`
      );
    } else if (f === 0) {
      p.push(`<circle cx="${x}" cy="${y}" r="${3.5*scale}" fill="none" stroke="${D.openCircle}" stroke-width="${1.4*scale}"/>`);
    }
  }

  for (let s = 0; s < NS; s++) {
    const fretNum = frets[s], finger = fingers[s];
    if (fretNum <= 0) continue;
    const lf = fretNum - baseFret + 1;
    if (lf < 1 || lf > NF) continue;
    const x = sx(s), y = fy(lf);
    const onBarre = barre && fretNum === barre.fret &&
      s >= Math.min(barre.from, barre.to) && s <= Math.max(barre.from, barre.to);
    if (!onBarre) {
      p.push(`<circle cx="${x}" cy="${y}" r="${DR}" fill="${D.dot}"/>`);
    }
    if (finger && finger > 0) {
      p.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${7*scale}" fill="${D.dotText}" font-weight="700" pointer-events="none">${finger}</text>`);
    }
  }

  return _wrapSVG(chordName, p, W_FULL, H_FULL, 'chord diagram');
}

/**
 * Build ukulele SVG.
 * @param {string} chordName
 * @param {object|null} shape
 * @param {'normal'|'small'} [size='normal']
 */
function buildUkuleleSVG(chordName, shape, size = 'normal') {
  const isSmall = size === 'small';
  const W_FULL = isSmall ? 44 : 82;
  const H_FULL = isSmall ? 66 : 128;

  if (!shape) return _noShapeSVG(chordName, 4, W_FULL, H_FULL);

  const { frets, fingers, barre, baseFret = 1 } = shape;

  const scale  = isSmall ? 0.537 : 1;
  const LEFT   = 18 * scale;
  const TOP    = 28 * scale;
  const W      = 42 * scale;
  const H      = 64 * scale;
  const NS     = 4, NF = 5;
  const SG     = W / (NS - 1);
  const FG     = H / NF;
  const DR     = 6 * scale;

  const sx = i => LEFT + (NS - 1 - i) * SG;
  const fy = f => TOP + (f - 0.5) * FG;

  const p = [];

  if (baseFret === 1) {
    p.push(`<line x1="${LEFT}" y1="${TOP}" x2="${LEFT + W}" y2="${TOP}" stroke="${D.nut}" stroke-width="${3*scale}" stroke-linecap="round"/>`);
  } else {
    p.push(`<text x="${LEFT - 5*scale}" y="${TOP + FG * 0.55}" text-anchor="end" font-family="monospace" font-size="${7.5*scale}" fill="${D.text}" dominant-baseline="middle">${baseFret}</text>`);
  }

  for (let s = 0; s < NS; s++) {
    const x = sx(s);
    p.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + H}" stroke="${D.string}" stroke-width="${1.2*scale}"/>`);
  }

  for (let f = 1; f <= NF; f++) {
    const y = TOP + f * FG;
    p.push(`<line x1="${LEFT}" y1="${y}" x2="${LEFT + W}" y2="${y}" stroke="${D.fret}" stroke-width="${0.8*scale}"/>`);
  }

  if (barre) {
    const lf = barre.fret - baseFret + 1;
    if (lf >= 1 && lf <= NF) {
      const x1 = sx(barre.to), x2 = sx(barre.from), by = fy(lf);
      p.push(`<rect x="${x1 - DR}" y="${by - DR}" width="${x2 - x1 + DR * 2}" height="${DR * 2}" rx="${DR}" fill="${D.barre}" opacity="0.88"/>`);
    }
  }

  for (let s = 0; s < NS; s++) {
    const f = frets[s], x = sx(s), y = TOP - 11 * scale;
    if (f === -1) {
      const d = 3.5 * scale;
      p.push(
        `<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}" stroke="${D.muted}" stroke-width="${1.5*scale}" stroke-linecap="round"/>` +
        `<line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}" stroke="${D.muted}" stroke-width="${1.5*scale}" stroke-linecap="round"/>`
      );
    } else if (f === 0) {
      p.push(`<circle cx="${x}" cy="${y}" r="${3.5*scale}" fill="none" stroke="${D.openCircle}" stroke-width="${1.4*scale}"/>`);
    }
  }

  for (let s = 0; s < NS; s++) {
    const fretNum = frets[s], finger = fingers[s];
    if (fretNum <= 0) continue;
    const lf = fretNum - baseFret + 1;
    if (lf < 1 || lf > NF) continue;
    const x = sx(s), y = fy(lf);
    const onBarre = barre && fretNum === barre.fret &&
      s >= Math.min(barre.from, barre.to) && s <= Math.max(barre.from, barre.to);
    if (!onBarre) {
      p.push(`<circle cx="${x}" cy="${y}" r="${DR}" fill="${D.dot}"/>`);
    }
    if (finger && finger > 0) {
      p.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${7*scale}" fill="${D.dotText}" font-weight="700" pointer-events="none">${finger}</text>`);
    }
  }

  if (!isSmall) {
    const labels = ['A','E','C','G'];
    for (let s = 0; s < NS; s++) {
      const x = sx(s);
      p.push(`<text x="${x}" y="${TOP + H + 12}" text-anchor="middle" font-family="monospace" font-size="${6.5*scale}" fill="${D.text}">${labels[s]}</text>`);
    }
  }

  return _wrapSVG(chordName, p, W_FULL, H_FULL, 'chord diagram');
}

// ── Piano SVG ─────────────────────────────────────────────────────────────
const PIANO_WHITE_KEYS = ['C','D','E','F','G','A','B'];
const PIANO_BLACK_KEYS = {
  'C#': { between: [0, 1] },
  'D#': { between: [1, 2] },
  'F#': { between: [3, 4] },
  'G#': { between: [4, 5] },
  'A#': { between: [5, 6] },
};
const PIANO_FLAT_MAP = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#' };

function normPianoNote(n) { return PIANO_FLAT_MAP[n] || n; }

/**
 * Build piano SVG.
 * @param {string} chordName
 * @param {object|null} shape
 * @param {'normal'|'small'} [size='normal']
 */
function buildPianoSVG(chordName, shape, size = 'normal') {
  const isSmall = size === 'small';
  const W = isSmall ? 80 : 140;
  const H = isSmall ? 46 : 80;
  const WKW = W / 7;
  const WKH = H;
  const BKW = WKW * 0.6;
  const BKH = H * 0.58;

  const highlighted = new Set((shape?.notes || []).map(normPianoNote));
  const p = [];

  p.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="3" fill="#f8faf9" stroke="rgba(45,106,79,.2)" stroke-width="1"/>`);

  PIANO_WHITE_KEYS.forEach((note, i) => {
    const x   = i * WKW;
    const lit = highlighted.has(note);
    p.push(
      `<rect x="${x + 0.8}" y="0" width="${WKW - 1.6}" height="${WKH - 1}" rx="2"` +
      ` fill="${lit ? '#2d6a4f' : '#fff'}"` +
      ` stroke="${lit ? '#2d6a4f' : 'rgba(45,106,79,.2)'}"` +
      ` stroke-width="${lit ? '1.5' : '0.6'}"/>`
    );
    if (lit) {
      p.push(
        `<text x="${x + WKW / 2}" y="${WKH - 5}" text-anchor="middle"` +
        ` font-family="monospace" font-size="${isSmall ? 4 : 6.5}" font-weight="700"` +
        ` fill="#fff" opacity="0.9">${note}</text>`
      );
    }
  });

  Object.entries(PIANO_BLACK_KEYS).forEach(([note, { between }]) => {
    const [l] = between;
    const x   = (l + 1) * WKW - BKW / 2;
    const lit = highlighted.has(note);
    p.push(
      `<rect x="${x}" y="0" width="${BKW}" height="${BKH}" rx="2"` +
      ` fill="${lit ? '#2d6a4f' : '#1a2e1f'}"` +
      ` stroke="${lit ? '#52b788' : 'rgba(45,106,79,.3)'}"` +
      ` stroke-width="${lit ? '1.5' : '0.6'}"/>`
    );
    if (lit) {
      const label = note.replace('#', '♯');
      p.push(
        `<text x="${x + BKW / 2}" y="${BKH - 4}" text-anchor="middle"` +
        ` font-family="monospace" font-size="${isSmall ? 3.5 : 5.5}" font-weight="700"` +
        ` fill="#fff" opacity="0.9">${label}</text>`
      );
    }
  });

  return (
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"` +
    ` xmlns="http://www.w3.org/2000/svg"` +
    ` aria-label="${esc(chordName)} piano voicing"` +
    ` class="chord-diagram-svg" role="img">` +
    p.join('') +
    `</svg>`
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _wrapSVG(label, parts, w, h, ariaLabel) {
  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"` +
    ` xmlns="http://www.w3.org/2000/svg"` +
    ` aria-label="${esc(label)} ${ariaLabel || 'chord diagram'}"` +
    ` class="chord-diagram-svg" role="img">` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="transparent"/>` +
    parts.join('') +
    `</svg>`
  );
}

function _noShapeSVG(label, strings, w, h) {
  if (w == null) w = strings === 4 ? 82 : 100;
  if (h == null) h = 122;
  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"` +
    ` xmlns="http://www.w3.org/2000/svg" aria-label="${esc(label)}" class="chord-diagram-svg">` +
    `<text x="${w/2}" y="${h/2}" text-anchor="middle" font-family="monospace" font-size="9"` +
    ` fill="rgba(45,106,79,.35)">No diagram</text>` +
    `</svg>`
  );
}

/**
 * Build diagram SVG for a chord + instrument.
 * @param {string}          chordName
 * @param {string}          instrument  'guitar' | 'ukulele' | 'piano'
 * @param {number}          [variantIdx=0]
 * @param {'normal'|'small'} [size='normal']
 */
function buildDiagramSVG(chordName, instrument, variantIdx = 0, size = 'normal') {
  switch (instrument) {
    case 'ukulele': {
      const shape = getShape(UKULELE_SHAPES, chordName, variantIdx);
      return buildUkuleleSVG(chordName, shape, size);
    }
    case 'piano': {
      const shape = getShape(PIANO_SHAPES, chordName, variantIdx);
      return buildPianoSVG(chordName, shape, size);
    }
    default: {
      const shape = getShape(GUITAR_SHAPES, chordName, variantIdx);
      return buildGuitarSVG(chordName, shape, size);
    }
  }
}

/** Get the correct shape map for an instrument */
function _shapeMap(instrument) {
  switch (instrument) {
    case 'ukulele': return UKULELE_SHAPES;
    case 'piano':   return PIANO_SHAPES;
    default:        return GUITAR_SHAPES;
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  TAB RENDERER — [G] notation → chord-above-lyric HTML
// ─────────────────────────────────────────────────────────────────────────

const CHORD_NAME_RE = /^[A-G][#b]?(maj7|maj|min7|min|m7|m|7|sus2|sus4|add9|dim7|dim|aug|5)?$/;

function isChordName(s) { return CHORD_NAME_RE.test(s); }

function parseLineSegments(line) {
  const TOKEN_RE = /(\[[^\]]+\])/g;
  const parts    = line.split(TOKEN_RE);
  if (parts.length === 1) return null;
  let hasChord = false;
  const segs = parts.map(part => {
    const m = part.match(/^\[([^\]]+)\]$/);
    if (m && isChordName(m[1])) { hasChord = true; return { type: 'chord', value: m[1] }; }
    return { type: 'text', value: part };
  });
  return hasChord ? segs : null;
}

function chordTokenHTML(chordName, semitones) {
  const transposed = transposeChord(chordName, semitones);
  return (
    `<button class="chord-token" data-chord="${esc(transposed)}" ` +
    `aria-label="${esc(transposed)} chord" type="button">${esc(transposed)}</button>`
  );
}

function renderTab(raw, semitones = 0) {
  if (!raw) {
    return '<span style="color:var(--muted);font-family:var(--mono);font-size:.85rem">No tab content available.</span>';
  }

  const lines  = raw.split('|');
  const parsed = lines.map(rawLine => {
    const trimmed = rawLine.trim();
    if (!trimmed) return { kind: 'gap' };

    const bracketMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (bracketMatch && !isChordName(bracketMatch[1])) {
      return { kind: 'section', label: bracketMatch[1] };
    }

    const segs = parseLineSegments(rawLine);
    if (!segs) return { kind: 'lyric', text: rawLine };

    const textContent = segs.filter(s => s.type === 'text').map(s => s.value).join('');
    if (textContent.trim() === '') return { kind: 'chord-only', segs };
    return { kind: 'mixed', segs, rawLine };
  });

  const output = [];
  let i = 0, inSection = false;

  const openSection  = () => { if (!inSection) { output.push('<div class="tab-section">'); inSection = true; } };
  const closeSection = () => { if (inSection)  { output.push('</div>'); inSection = false; } };

  while (i < parsed.length) {
    const item = parsed[i];

    if (item.kind === 'gap') {
      if (inSection) output.push('<span class="tab-line-gap"></span>');
      i++; continue;
    }

    if (item.kind === 'section') {
      closeSection();
      output.push('<div class="tab-section">');
      output.push(`<span class="tab-section-label">${esc(item.label)}</span>`);
      inSection = true;
      i++; continue;
    }

    if (item.kind === 'chord-only') {
      openSection();
      const chordLineHTML = item.segs.map(seg =>
        seg.type === 'chord' ? chordTokenHTML(seg.value, semitones) : esc(seg.value)
      ).join('');

      let j = i + 1;
      while (j < parsed.length && parsed[j].kind === 'gap') j++;

      if (j < parsed.length && parsed[j].kind === 'lyric') {
        output.push('<div class="tab-pair">');
        output.push(`<span class="tab-chord-line">${chordLineHTML}</span>`);
        output.push(`<span class="tab-lyric-line">${esc(parsed[j].text)}</span>`);
        output.push('</div>');
        i = j + 1;
      } else {
        output.push('<div class="tab-pair">');
        output.push(`<span class="tab-chord-line">${chordLineHTML}</span>`);
        output.push('</div>');
        i++;
      }
      continue;
    }

    if (item.kind === 'mixed') {
      openSection();
      let chordLine = '', lyricLine = '';
      item.segs.forEach(seg => {
        if (seg.type === 'chord') {
          const t = transposeChord(seg.value, semitones);
          chordLine += `<button class="chord-token" data-chord="${esc(t)}" aria-label="${esc(t)} chord" type="button">${esc(t)}</button>`;
          lyricLine += `<span style="display:inline-block;min-width:${Math.max(t.length, 2)}ch"> </span>`;
        } else {
          chordLine += `<span style="display:inline-block;min-width:${seg.value.length}ch"> </span>`;
          lyricLine += esc(seg.value);
        }
      });
      output.push('<div class="tab-pair">');
      output.push(`<span class="tab-chord-line">${chordLine}</span>`);
      output.push(`<span class="tab-lyric-line">${lyricLine}</span>`);
      output.push('</div>');
      i++; continue;
    }

    if (item.kind === 'lyric') {
      openSection();
      output.push(`<div class="tab-pair"><span class="tab-lyric-line">${esc(item.text)}</span></div>`);
      i++; continue;
    }

    i++;
  }

  closeSection();
  return output.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD POPUP — inline tooltip card (desktop) / bottom sheet (mobile)
// ─────────────────────────────────────────────────────────────────────────

let _popup         = null;
let _popupInstr    = 'guitar';
let _popupChord    = null;
let _popupAnchor   = null;
let _popupCloseTimer = null;

function isMobileView() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function _createPopup() {
  if (_popup) return _popup;

  _popup = document.createElement('div');
  _popup.className = 'chord-popup';
  _popup.setAttribute('role', 'dialog');
  _popup.setAttribute('aria-modal', 'false');
  _popup.setAttribute('aria-label', 'Chord diagram');

  _popup.innerHTML =
    `<span class="chord-popup-name" id="popupChordName">—</span>
    <div class="chord-popup-tabs" role="tablist">
      <button class="chord-popup-tab active" data-instr="guitar"  role="tab" aria-selected="true">Guitar</button>
      <button class="chord-popup-tab"        data-instr="ukulele" role="tab" aria-selected="false">Uke</button>
      <button class="chord-popup-tab"        data-instr="piano"   role="tab" aria-selected="false">Piano</button>
    </div>
    <div class="chord-popup-diagram" id="popupDiagram"></div>
    <div class="chord-variant-nav" id="popupVariantNav">
      <button class="chord-variant-btn" id="popupVariantPrev" aria-label="Previous voicing">‹</button>
      <div class="chord-variant-info">
        <span class="chord-variant-label" id="popupVariantLabel"></span>
        <span class="chord-variant-count" id="popupVariantCount"></span>
      </div>
      <button class="chord-variant-btn" id="popupVariantNext" aria-label="Next voicing">›</button>
    </div>
    <div class="chord-popup-actions">
      <button class="chord-popup-pin" id="popupPinBtn" type="button">📌 Pin</button>
      <button class="chord-popup-close" id="popupCloseBtn" type="button" aria-label="Close">✕</button>
    </div>`;

  // Tab switching
  _popup.querySelector('.chord-popup-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.chord-popup-tab');
    if (!btn) return;
    _popupInstr = btn.dataset.instr;
    _popup.querySelectorAll('.chord-popup-tab').forEach(b => {
      const active = b.dataset.instr === _popupInstr;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    if (_popupChord) _renderPopupDiagram(_popupChord);
  });

  // Variant prev/next
  _popup.querySelector('#popupVariantPrev').addEventListener('click', e => {
    e.stopPropagation();
    if (!_popupChord) return;
    const map   = _shapeMap(_popupInstr);
    const total = getVariantCount(map, _popupChord);
    if (total <= 1) return;
    const cur = getVariantIdx(_popupChord);
    setVariantIdx(_popupChord, (cur - 1 + total) % total);
    _renderPopupDiagram(_popupChord);
    _updatePinnedCardDiagram(_popupChord);
  });

  _popup.querySelector('#popupVariantNext').addEventListener('click', e => {
    e.stopPropagation();
    if (!_popupChord) return;
    const map   = _shapeMap(_popupInstr);
    const total = getVariantCount(map, _popupChord);
    if (total <= 1) return;
    const cur = getVariantIdx(_popupChord);
    setVariantIdx(_popupChord, (cur + 1) % total);
    _renderPopupDiagram(_popupChord);
    _updatePinnedCardDiagram(_popupChord);
  });

  // Pin button
  _popup.querySelector('#popupPinBtn').addEventListener('click', e => {
    e.stopPropagation();
    if (_popupChord) {
      pinnedPin(_popupChord);
      _updatePopupPinBtn();
    }
  });

  // Close button
  _popup.querySelector('#popupCloseBtn').addEventListener('click', e => {
    e.stopPropagation();
    hidePopup();
  });

  // Keep popup open while hovering it
  _popup.addEventListener('mouseenter', () => clearTimeout(_popupCloseTimer));
  _popup.addEventListener('mouseleave', () => {
    _popupCloseTimer = setTimeout(hidePopup, 250);
  });

  document.body.appendChild(_popup);
  return _popup;
}

function _renderPopupDiagram(chordName) {
  const area = _popup.querySelector('#popupDiagram');
  if (!area) return;
  const idx = getVariantIdx(chordName);
  area.innerHTML = buildDiagramSVG(chordName, _popupInstr, idx, 'normal');
  _updatePopupVariantNav(chordName);
}

function _updatePopupVariantNav(chordName) {
  const nav        = _popup?.querySelector('#popupVariantNav');
  const labelEl    = _popup?.querySelector('#popupVariantLabel');
  const countEl    = _popup?.querySelector('#popupVariantCount');
  const prevBtn    = _popup?.querySelector('#popupVariantPrev');
  const nextBtn    = _popup?.querySelector('#popupVariantNext');
  if (!nav) return;

  const map   = _shapeMap(_popupInstr);
  const total = getVariantCount(map, chordName);
  const idx   = getVariantIdx(chordName);

  if (total <= 1) {
    nav.style.display = 'none';
    return;
  }

  nav.style.display = '';
  const shape = getShape(map, chordName, idx);
  if (labelEl) labelEl.textContent = shape?.label || '';
  if (countEl) countEl.textContent = `${idx + 1} / ${total}`;
  if (prevBtn) prevBtn.disabled = false;
  if (nextBtn) nextBtn.disabled = false;
}

/** Update the pinned card diagram after variant change */
function _updatePinnedCardDiagram(chordName) {
  if (!_pinnedWrap) return;
  const card = _pinnedWrap.querySelector(`.pinned-chord-card[data-chord="${CSS.escape(chordName)}"]`);
  if (!card) return;
  const diagramWrap = card.querySelector('.pinned-chord-diagram');
  if (!diagramWrap) return;
  const idx = getVariantIdx(chordName);
  diagramWrap.innerHTML = buildDiagramSVG(chordName, _pinnedInstr, idx, 'small');
}

function _updatePopupPinBtn() {
  const btn = _popup?.querySelector('#popupPinBtn');
  if (!btn || !_popupChord) return;
  const isPinned = pinnedIsPinned(_popupChord);
  btn.textContent = isPinned ? '📍 Pinned' : '📌 Pin';
  btn.classList.toggle('pinned', isPinned);
}

function showPopup(chordName, anchorEl) {
  // On mobile: route to bottom sheet chord viewer instead
  if (isMobileView()) {
    _showChordBottomSheet(chordName);
    return;
  }

  clearTimeout(_popupCloseTimer);
  _createPopup();

  _popupChord  = chordName;
  _popupAnchor = anchorEl;

  const nameEl = _popup.querySelector('#popupChordName');
  if (nameEl) nameEl.textContent = chordName;

  // Sync instrument tabs
  _popup.querySelectorAll('.chord-popup-tab').forEach(b => {
    const active = b.dataset.instr === _popupInstr;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });

  _renderPopupDiagram(chordName);
  _updatePopupPinBtn();

  // Attach popup to the anchor's parent so it's in flow
  const parent = anchorEl.offsetParent || anchorEl.parentElement;
  if (_popup.parentElement !== parent) {
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(_popup);
  }

  _popup.style.visibility = 'hidden';
  _popup.classList.remove('open', 'popup-below');
  _popup.style.left = '0px';
  _popup.style.bottom = '0px';

  requestAnimationFrame(() => {
    const popupH = _popup.offsetHeight;
    const popupW = _popup.offsetWidth;

    const anchorRect  = anchorEl.getBoundingClientRect();
    const parentRect  = parent.getBoundingClientRect();

    const relLeft   = anchorRect.left - parentRect.left + anchorEl.offsetWidth / 2;
    const relBottom = parentRect.bottom - anchorRect.top + 8;

    const spaceAbove = anchorRect.top;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const goBelow    = spaceAbove < popupH + 16 && spaceBelow >= popupH + 16;

    _popup.classList.toggle('popup-below', goBelow);

    const halfW     = popupW / 2;
    const minLeft   = halfW + 8 - parentRect.left;
    const maxLeft   = window.innerWidth - halfW - 8 - parentRect.left;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, relLeft));

    _popup.style.left   = `${clampedLeft}px`;
    _popup.style.bottom = goBelow ? 'auto' : `${relBottom}px`;
    _popup.style.top    = goBelow ? `${anchorRect.bottom - parentRect.top + 8}px` : 'auto';

    _popup.style.visibility = '';
    _popup.classList.add('open');
  });

  anchorEl.classList.add('active');
}

function hidePopup(immediate = false) {
  clearTimeout(_popupCloseTimer);
  if (!_popup) return;

  if (immediate) {
    _popup.classList.remove('open');
    if (_popupAnchor) _popupAnchor.classList.remove('active');
    _popupAnchor = null;
    _popupChord  = null;
    return;
  }

  _popupCloseTimer = setTimeout(() => {
    _popup.classList.remove('open');
    if (_popupAnchor) _popupAnchor.classList.remove('active');
    _popupAnchor = null;
    _popupChord  = null;
  }, 120);
}

function setPopupInstrument(instr) {
  _popupInstr = instr;
  if (_popup && _popupChord && _popup.classList.contains('open')) {
    _popup.querySelectorAll('.chord-popup-tab').forEach(b => {
      const active = b.dataset.instr === instr;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    _renderPopupDiagram(_popupChord);
  }
}

function destroyPopup() {
  hidePopup(true);
  if (_popup) { _popup.remove(); _popup = null; }
}

// ─────────────────────────────────────────────────────────────────────────
//  MOBILE CHORD BOTTOM SHEET — shows chord diagram on mobile chord tap
// ─────────────────────────────────────────────────────────────────────────

let _chordSheet     = null;
let _chordSheetInstr = 'guitar';

function _ensureChordSheet() {
  if (_chordSheet) return _chordSheet;

  const backdrop = document.createElement('div');
  backdrop.className = 'chord-drawer-backdrop';
  backdrop.id = 'chordSheetBackdrop';

  _chordSheet = document.createElement('div');
  _chordSheet.className = 'chord-bottom-sheet';
  _chordSheet.id = 'chordSheetPanel';
  _chordSheet.setAttribute('role', 'dialog');
  _chordSheet.setAttribute('aria-modal', 'true');
  _chordSheet.setAttribute('aria-label', 'Chord diagram');

  _chordSheet.innerHTML =
    `<div class="chord-sheet-handle" id="chordSheetHandle"></div>
    <span class="chord-popup-name" id="chordSheetName" style="font-size:1rem;display:block;text-align:center;margin-bottom:.5rem">—</span>
    <div class="chord-popup-tabs" role="tablist" style="margin-bottom:.75rem">
      <button class="chord-popup-tab active" data-instr="guitar"  role="tab" aria-selected="true">Guitar</button>
      <button class="chord-popup-tab"        data-instr="ukulele" role="tab" aria-selected="false">Uke</button>
      <button class="chord-popup-tab"        data-instr="piano"   role="tab" aria-selected="false">Piano</button>
    </div>
    <div class="chord-popup-diagram" id="chordSheetDiagram" style="justify-content:center;display:flex;margin-bottom:.5rem"></div>
    <div class="chord-variant-nav" id="chordSheetVariantNav" style="margin-bottom:.75rem">
      <button class="chord-variant-btn" id="chordSheetPrev" aria-label="Previous voicing">‹</button>
      <div class="chord-variant-info">
        <span class="chord-variant-label" id="chordSheetVarLabel"></span>
        <span class="chord-variant-count" id="chordSheetVarCount"></span>
      </div>
      <button class="chord-variant-btn" id="chordSheetNext" aria-label="Next voicing">›</button>
    </div>
    <div class="chord-popup-actions" style="justify-content:center">
      <button class="chord-popup-pin" id="chordSheetPinBtn" type="button">📌 Pin</button>
      <button class="chord-popup-close" id="chordSheetCloseBtn" type="button" aria-label="Close">✕ Close</button>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(_chordSheet);

  // Tab switching
  _chordSheet.querySelector('.chord-popup-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.chord-popup-tab');
    if (!btn) return;
    _chordSheetInstr = btn.dataset.instr;
    _chordSheet.querySelectorAll('.chord-popup-tab').forEach(b => {
      const active = b.dataset.instr === _chordSheetInstr;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    const name = _chordSheet.querySelector('#chordSheetName')?.textContent;
    if (name && name !== '—') _renderChordSheetDiagram(name);
  });

  // Variant nav
  _chordSheet.querySelector('#chordSheetPrev').addEventListener('click', e => {
    e.stopPropagation();
    const name = _chordSheet.querySelector('#chordSheetName')?.textContent;
    if (!name || name === '—') return;
    const map   = _shapeMap(_chordSheetInstr);
    const total = getVariantCount(map, name);
    if (total <= 1) return;
    setVariantIdx(name, (getVariantIdx(name) - 1 + total) % total);
    _renderChordSheetDiagram(name);
    _updatePinnedCardDiagram(name);
  });

  _chordSheet.querySelector('#chordSheetNext').addEventListener('click', e => {
    e.stopPropagation();
    const name = _chordSheet.querySelector('#chordSheetName')?.textContent;
    if (!name || name === '—') return;
    const map   = _shapeMap(_chordSheetInstr);
    const total = getVariantCount(map, name);
    if (total <= 1) return;
    setVariantIdx(name, (getVariantIdx(name) + 1) % total);
    _renderChordSheetDiagram(name);
    _updatePinnedCardDiagram(name);
  });

  // Pin
  _chordSheet.querySelector('#chordSheetPinBtn').addEventListener('click', e => {
    e.stopPropagation();
    const name = _chordSheet.querySelector('#chordSheetName')?.textContent;
    if (name && name !== '—') {
      pinnedPin(name);
      _updateChordSheetPinBtn(name);
    }
  });

  // Close
  _chordSheet.querySelector('#chordSheetCloseBtn').addEventListener('click', () => _hideChordBottomSheet());
  backdrop.addEventListener('click', () => _hideChordBottomSheet());

  return _chordSheet;
}

function _renderChordSheetDiagram(chordName) {
  const area = _chordSheet?.querySelector('#chordSheetDiagram');
  if (!area) return;
  const idx = getVariantIdx(chordName);
  area.innerHTML = buildDiagramSVG(chordName, _chordSheetInstr, idx, 'normal');

  const nav      = _chordSheet.querySelector('#chordSheetVariantNav');
  const labelEl  = _chordSheet.querySelector('#chordSheetVarLabel');
  const countEl  = _chordSheet.querySelector('#chordSheetVarCount');
  const map      = _shapeMap(_chordSheetInstr);
  const total    = getVariantCount(map, chordName);

  if (nav) nav.style.display = total <= 1 ? 'none' : '';
  if (total > 1) {
    const shape = getShape(map, chordName, idx);
    if (labelEl) labelEl.textContent = shape?.label || '';
    if (countEl) countEl.textContent = `${idx + 1} / ${total}`;
  }
}

function _updateChordSheetPinBtn(chordName) {
  const btn = _chordSheet?.querySelector('#chordSheetPinBtn');
  if (!btn) return;
  const isPinned = pinnedIsPinned(chordName);
  btn.textContent = isPinned ? '📍 Pinned' : '📌 Pin';
  btn.classList.toggle('pinned', isPinned);
}

function _showChordBottomSheet(chordName) {
  _ensureChordSheet();
  _chordSheetInstr = _popupInstr; // sync with current instrument

  const nameEl = _chordSheet.querySelector('#chordSheetName');
  if (nameEl) nameEl.textContent = chordName;

  // Sync tabs
  _chordSheet.querySelectorAll('.chord-popup-tab').forEach(b => {
    const active = b.dataset.instr === _chordSheetInstr;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });

  _renderChordSheetDiagram(chordName);
  _updateChordSheetPinBtn(chordName);

  const backdrop = document.getElementById('chordSheetBackdrop');
  if (backdrop) {
    backdrop.style.display = 'block';
    requestAnimationFrame(() => backdrop.classList.add('backdrop-open'));
  }

  _chordSheet.style.display = 'block';
  requestAnimationFrame(() => _chordSheet.classList.add('sheet-open'));
}

function _hideChordBottomSheet() {
  if (!_chordSheet) return;
  _chordSheet.classList.remove('sheet-open');

  const backdrop = document.getElementById('chordSheetBackdrop');
  if (backdrop) {
    backdrop.classList.remove('backdrop-open');
    setTimeout(() => { backdrop.style.display = ''; }, 320);
  }

  setTimeout(() => {
    if (_chordSheet) _chordSheet.style.display = '';
  }, 320);
}

// ─────────────────────────────────────────────────────────────────────────
//  PINNED CHORDS ROW — inline section (desktop) + drawer (mobile)
// ─────────────────────────────────────────────────────────────────────────

const LS_PINNED_KEY = 'sd5_chord_pinned';
const PINNED_MAX    = 18;

let _pinned      = [];
let _pinnedInstr = 'guitar';
let _pinnedWrap  = null;

// Mobile drawer elements
let _pinnedDrawer    = null;
let _pinnedTabStrip  = null;

function pinnedLoad() {
  try {
    const raw = localStorage.getItem(LS_PINNED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, PINNED_MAX) : [];
  } catch { return []; }
}

function pinnedSave() {
  try { localStorage.setItem(LS_PINNED_KEY, JSON.stringify(_pinned)); } catch {}
}

function pinnedIsPinned(chordName) {
  return _pinned.includes(chordName);
}

function pinnedPin(chordName) {
  if (pinnedIsPinned(chordName)) {
    // Flash existing card in both desktop and mobile
    [_pinnedWrap, _pinnedDrawer].forEach(container => {
      if (!container) return;
      const existing = container.querySelector(`.pinned-chord-card[data-chord="${CSS.escape(chordName)}"]`);
      if (existing) {
        existing.classList.add('card-flash');
        setTimeout(() => existing.classList.remove('card-flash'), 600);
      }
    });
    return;
  }

  if (_pinned.length >= PINNED_MAX) {
    const removed = _pinned.pop();
    [_pinnedWrap, _pinnedDrawer].forEach(container => {
      if (!container) return;
      container.querySelector(`.pinned-chord-card[data-chord="${CSS.escape(removed)}"]`)?.remove();
    });
  }

  _pinned.unshift(chordName);
  pinnedSave();

  // Add card to desktop row
  if (_pinnedWrap) {
    const list = _pinnedWrap.querySelector('.pinned-chords-body');
    if (list) {
      list.querySelector('.pinned-chords-empty')?.remove();
      const card = _buildPinnedCard(chordName, 'small');
      list.insertBefore(card, list.firstChild);
      requestAnimationFrame(() => card.classList.add('card-enter'));
    }
  }

  // Add card to mobile drawer body
  if (_pinnedDrawer) {
    const body = _pinnedDrawer.querySelector('.pinned-drawer-body');
    if (body) {
      body.querySelector('.pinned-drawer-empty')?.remove();
      const card = _buildPinnedCard(chordName, 'small');
      body.insertBefore(card, body.firstChild);
      requestAnimationFrame(() => card.classList.add('card-enter'));
    }
  }

  _pinnedUpdateCount();
  _updatePopupPinBtn();
}

function pinnedUnpin(chordName) {
  _pinned = _pinned.filter(c => c !== chordName);
  pinnedSave();

  [_pinnedWrap, _pinnedDrawer].forEach(container => {
    if (!container) return;
    const card = container.querySelector(`.pinned-chord-card[data-chord="${CSS.escape(chordName)}"]`);
    if (card) {
      card.classList.add('card-exit');
      setTimeout(() => {
        card.remove();
        _pinnedShowEmptyIfNeeded(container);
      }, 220);
    }
  });

  _pinnedUpdateCount();
  _updatePopupPinBtn();
}

function _pinnedUpdateCount() {
  const countText = _pinned.length
    ? `${_pinned.length} chord${_pinned.length !== 1 ? 's' : ''}`
    : '';

  if (_pinnedWrap) {
    const el = _pinnedWrap.querySelector('.pinned-chords-count');
    if (el) el.textContent = countText;
  }

  if (_pinnedTabStrip) {
    const el = _pinnedTabStrip.querySelector('.pinned-tab-strip-count');
    if (el) el.textContent = _pinned.length || '';
  }

  if (_pinnedDrawer) {
    const el = _pinnedDrawer.querySelector('.pinned-drawer-count');
    if (el) el.textContent = countText;
  }
}

function _pinnedShowEmptyIfNeeded(container) {
  if (!container) return;
  const body = container.querySelector('.pinned-chords-body, .pinned-drawer-body');
  if (!body || _pinned.length > 0) return;
  if (!body.querySelector('.pinned-chords-empty, .pinned-drawer-empty')) {
    const empty = document.createElement('span');
    empty.className   = container === _pinnedWrap ? 'pinned-chords-empty' : 'pinned-drawer-empty';
    empty.textContent = 'Click any chord token to pin it here for quick reference';
    body.appendChild(empty);
  }
}

/**
 * Build a single pinned chord card.
 * @param {string} chordName
 * @param {'small'|'normal'} [svgSize='small']
 */
function _buildPinnedCard(chordName, svgSize = 'small') {
  const card = document.createElement('div');
  card.className = 'pinned-chord-card';
  card.dataset.chord = chordName;
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${chordName} — pinned chord`);

  const diagramWrap = document.createElement('div');
  diagramWrap.className = 'pinned-chord-diagram';
  const idx = getVariantIdx(chordName);
  diagramWrap.innerHTML = buildDiagramSVG(chordName, _pinnedInstr, idx, svgSize);

  const nameEl = document.createElement('div');
  nameEl.className   = 'pinned-chord-name';
  nameEl.textContent = chordName;

  const unpinBtn = document.createElement('button');
  unpinBtn.className = 'pinned-chord-unpin';
  unpinBtn.type      = 'button';
  unpinBtn.setAttribute('aria-label', `Unpin ${chordName}`);
  unpinBtn.textContent = '×';
  unpinBtn.addEventListener('click', e => {
    e.stopPropagation();
    pinnedUnpin(chordName);
  });

  card.appendChild(diagramWrap);
  card.appendChild(nameEl);
  card.appendChild(unpinBtn);

  card.addEventListener('click', () => showPopup(chordName, card));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPopup(chordName, card); }
  });

  return card;
}

function _rebuildAllPinnedCards(container, bodySelector, emptyClass) {
  if (!container) return;
  const list = container.querySelector(bodySelector);
  if (!list) return;
  list.innerHTML = '';

  if (_pinned.length === 0) {
    const empty = document.createElement('span');
    empty.className   = emptyClass;
    empty.textContent = 'Click any chord token to pin it here for quick reference';
    list.appendChild(empty);
  } else {
    _pinned.forEach(chordName => {
      const card = _buildPinnedCard(chordName, 'small');
      card.classList.add('card-enter');
      list.appendChild(card);
    });
  }
  _pinnedUpdateCount();
}

function pinnedSetInstrument(instr) {
  _pinnedInstr = instr;
  [_pinnedWrap, _pinnedDrawer].forEach(container => {
    if (!container) return;
    container.querySelectorAll('.pinned-chord-card').forEach(card => {
      const chordName    = card.dataset.chord;
      const diagramWrap  = card.querySelector('.pinned-chord-diagram');
      if (diagramWrap && chordName) {
        const idx = getVariantIdx(chordName);
        diagramWrap.innerHTML = buildDiagramSVG(chordName, instr, idx, 'small');
      }
    });
  });
}

/** Build and insert the desktop pinned chords row before the given sibling. */
function buildPinnedRow(insertBefore) {
  if (_pinnedWrap) { _pinnedWrap.remove(); _pinnedWrap = null; }

  _pinnedWrap = document.createElement('div');
  _pinnedWrap.className = 'pinned-chords-wrap';
  _pinnedWrap.setAttribute('role', 'region');
  _pinnedWrap.setAttribute('aria-label', 'Pinned chords');

  _pinnedWrap.innerHTML =
    `<div class="pinned-chords-header">
      <span class="pinned-chords-label">Pinned Chords</span>
      <span class="pinned-chords-count"></span>
      <button class="pinned-chords-clear" type="button" aria-label="Clear all pinned chords">Clear all</button>
    </div>
    <div class="pinned-chords-body" role="list"></div>`;

  _pinnedWrap.querySelector('.pinned-chords-clear').addEventListener('click', () => {
    _pinned = [];
    pinnedSave();
    _rebuildAllPinnedCards(_pinnedWrap,   '.pinned-chords-body', 'pinned-chords-empty');
    _rebuildAllPinnedCards(_pinnedDrawer, '.pinned-drawer-body',  'pinned-drawer-empty');
  });

  insertBefore.parentElement.insertBefore(_pinnedWrap, insertBefore);
  _rebuildAllPinnedCards(_pinnedWrap, '.pinned-chords-body', 'pinned-chords-empty');
  return _pinnedWrap;
}

/** Build the mobile pinned chords tab strip + right-side drawer. */
function buildPinnedDrawer() {
  // Tab strip (thin right-edge button)
  if (_pinnedTabStrip) { _pinnedTabStrip.remove(); _pinnedTabStrip = null; }

  _pinnedTabStrip = document.createElement('button');
  _pinnedTabStrip.className = 'pinned-tab-strip';
  _pinnedTabStrip.setAttribute('aria-label', 'Open pinned chords');
  _pinnedTabStrip.setAttribute('aria-expanded', 'false');
  _pinnedTabStrip.innerHTML =
    `<span class="pinned-tab-strip-icon">📍</span>
    <span class="pinned-tab-strip-count"></span>`;
  document.body.appendChild(_pinnedTabStrip);

  // Drawer panel
  if (_pinnedDrawer) { _pinnedDrawer.remove(); _pinnedDrawer = null; }

  const drawerBackdrop = document.createElement('div');
  drawerBackdrop.className = 'chord-drawer-backdrop';
  drawerBackdrop.id = 'pinnedDrawerBackdrop';

  _pinnedDrawer = document.createElement('div');
  _pinnedDrawer.className = 'pinned-chords-drawer';
  _pinnedDrawer.setAttribute('role', 'dialog');
  _pinnedDrawer.setAttribute('aria-modal', 'true');
  _pinnedDrawer.setAttribute('aria-label', 'Pinned chords');

  _pinnedDrawer.innerHTML =
    `<div class="pinned-drawer-header">
      <span class="pinned-drawer-title">Pinned Chords <span class="pinned-drawer-count"></span></span>
      <div class="pinned-drawer-actions">
        <button class="pinned-drawer-clear" type="button" aria-label="Clear all">Clear</button>
        <button class="pinned-drawer-close" type="button" aria-label="Close pinned chords">✕</button>
      </div>
    </div>
    <div class="pinned-drawer-body" role="list"></div>`;

  document.body.appendChild(drawerBackdrop);
  document.body.appendChild(_pinnedDrawer);

  const openDrawer = () => {
    _pinnedDrawer.classList.add('drawer-open');
    drawerBackdrop.style.display = 'block';
    requestAnimationFrame(() => drawerBackdrop.classList.add('backdrop-open'));
    _pinnedTabStrip?.setAttribute('aria-expanded', 'true');
  };

  const closeDrawer = () => {
    _pinnedDrawer.classList.remove('drawer-open');
    drawerBackdrop.classList.remove('backdrop-open');
    setTimeout(() => { drawerBackdrop.style.display = ''; }, 320);
    _pinnedTabStrip?.setAttribute('aria-expanded', 'false');
  };

  _pinnedTabStrip.addEventListener('click', openDrawer);
  _pinnedDrawer.querySelector('.pinned-drawer-close').addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);

  _pinnedDrawer.querySelector('.pinned-drawer-clear').addEventListener('click', () => {
    _pinned = [];
    pinnedSave();
    _rebuildAllPinnedCards(_pinnedWrap,   '.pinned-chords-body', 'pinned-chords-empty');
    _rebuildAllPinnedCards(_pinnedDrawer, '.pinned-drawer-body',  'pinned-drawer-empty');
  });

  _rebuildAllPinnedCards(_pinnedDrawer, '.pinned-drawer-body', 'pinned-drawer-empty');
  _pinnedUpdateCount();
}

function destroyPinnedRow() {
  if (_pinnedWrap)     { _pinnedWrap.remove();     _pinnedWrap    = null; }
  if (_pinnedDrawer)   { _pinnedDrawer.remove();   _pinnedDrawer  = null; }
  if (_pinnedTabStrip) { _pinnedTabStrip.remove(); _pinnedTabStrip = null; }
  const pb = document.getElementById('pinnedDrawerBackdrop');
  if (pb) pb.remove();
  _pinned = [];
}

// ─────────────────────────────────────────────────────────────────────────
//  MOBILE FAB + BOTTOM SHEET CONTROLS DRAWER
// ─────────────────────────────────────────────────────────────────────────

let _fab          = null;
let _ctrlSheet    = null;
let _ctrlBackdrop = null;

/**
 * Build the floating action button (mobile).
 * @param {object} opts
 * @param {number}   opts.semitones
 * @param {Function} opts.openSheet
 */
function buildFAB(opts) {
  if (_fab) { _fab.remove(); _fab = null; }

  _fab = document.createElement('button');
  _fab.className = 'chord-fab';
  _fab.id        = 'chordFAB';
  _fab.setAttribute('aria-label', 'Open chord controls');
  _fab.setAttribute('aria-expanded', 'false');
  _fab.innerHTML =
    `<span class="chord-fab-transpose" id="fabTranspose">${opts.semitones > 0 ? '+' : ''}${opts.semitones || '0'}</span>` +
    `<span>⚙</span>`;
  _fab.addEventListener('click', opts.openSheet);
  document.body.appendChild(_fab);
  return _fab;
}

function updateFABTranspose(semitones) {
  const el = document.getElementById('fabTranspose');
  if (el) el.textContent = semitones > 0 ? `+${semitones}` : String(semitones);
}

/**
 * Build the controls bottom sheet (mobile).
 * Mirrors all controls from the desktop sticky bar.
 */
function buildControlsSheet({
  semitones, fontIdx, instrument, scrollSpeed, isScrolling,
  onTransposeDown, onTransposeUp,
  onFontDown, onFontUp,
  onScrollToggle, onSpeedChange,
  onInstrumentChange,
  onPrint, onShare,
  instrIcons,
}) {
  // Backdrop
  if (_ctrlBackdrop) { _ctrlBackdrop.remove(); _ctrlBackdrop = null; }
  _ctrlBackdrop = document.createElement('div');
  _ctrlBackdrop.className = 'chord-drawer-backdrop';
  _ctrlBackdrop.id = 'ctrlSheetBackdrop';
  document.body.appendChild(_ctrlBackdrop);

  // Sheet
  if (_ctrlSheet) { _ctrlSheet.remove(); _ctrlSheet = null; }
  _ctrlSheet = document.createElement('div');
  _ctrlSheet.className = 'chord-bottom-sheet';
  _ctrlSheet.id = 'ctrlSheet';
  _ctrlSheet.setAttribute('role', 'dialog');
  _ctrlSheet.setAttribute('aria-modal', 'true');
  _ctrlSheet.setAttribute('aria-label', 'Chord sheet controls');

  _ctrlSheet.innerHTML =
    `<div class="chord-sheet-handle"></div>
    <div class="chord-sheet-title">Controls</div>

    <div class="chord-sheet-section">
      <span class="chord-sheet-section-label">Transpose</span>
      <div class="chord-sheet-row">
        <button class="ctrl-btn" id="sheetTransposeDown" aria-label="Down">−</button>
        <span class="sheet-transpose-display" id="sheetTransposeDisplay" aria-live="polite">${semitones > 0 ? '+' : ''}${semitones}</span>
        <button class="ctrl-btn" id="sheetTransposeUp" aria-label="Up">+</button>
      </div>
    </div>

    <div class="chord-sheet-divider"></div>

    <div class="chord-sheet-section">
      <span class="chord-sheet-section-label">Instrument</span>
      <div class="chord-sheet-row instr-switcher" role="radiogroup" style="border:1.5px solid var(--border);border-radius:.35rem;overflow:hidden;background:var(--surface)">
        <button class="instr-btn${instrument === 'guitar'  ? ' active' : ''}" data-instr="guitar"  role="radio" aria-checked="${instrument === 'guitar'}">
          ${instrIcons.guitar} Guitar
        </button>
        <button class="instr-btn${instrument === 'ukulele' ? ' active' : ''}" data-instr="ukulele" role="radio" aria-checked="${instrument === 'ukulele'}">
          ${instrIcons.ukulele} Uke
        </button>
        <button class="instr-btn${instrument === 'piano'   ? ' active' : ''}" data-instr="piano"   role="radio" aria-checked="${instrument === 'piano'}">
          ${instrIcons.piano} Piano
        </button>
      </div>
    </div>

    <div class="chord-sheet-divider"></div>

    <div class="chord-sheet-section">
      <span class="chord-sheet-section-label">Font Size</span>
      <div class="chord-sheet-row">
        <button class="ctrl-btn" id="sheetFontDown" aria-label="Smaller">A−</button>
        <span class="sheet-fontsize-display" id="sheetFontDisplay" aria-live="polite"></span>
        <button class="ctrl-btn" id="sheetFontUp" aria-label="Larger">A+</button>
      </div>
    </div>

    <div class="chord-sheet-divider"></div>

    <div class="chord-sheet-section">
      <span class="chord-sheet-section-label">Auto-scroll</span>
      <div class="chord-sheet-row" style="flex-wrap:wrap;gap:.8rem">
        <button class="ctrl-scroll-toggle${isScrolling ? ' scrolling' : ''}" id="sheetScrollToggle" aria-pressed="${isScrolling}">
          ${isScrolling ? '⏸ Scrolling…' : '▶ Auto-scroll'}
        </button>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span class="ctrl-label">Speed</span>
          <input type="range" class="ctrl-speed" id="sheetScrollSpeed" min="1" max="10" value="${scrollSpeed}" aria-label="Scroll speed" style="width:100px">
        </div>
      </div>
    </div>

    <div class="chord-sheet-divider"></div>

    <div class="chord-sheet-section">
      <div class="chord-sheet-row">
        <button class="ctrl-action-btn" id="sheetPrintBtn" style="flex:1;justify-content:center">🖨 Print</button>
        <button class="ctrl-action-btn" id="sheetShareBtn" style="flex:1;justify-content:center">🔗 Share</button>
      </div>
    </div>`;

  document.body.appendChild(_ctrlSheet);

  const openSheet = () => {
    _ctrlSheet.style.display = 'block';
    _ctrlBackdrop.style.display = 'block';
    requestAnimationFrame(() => {
      _ctrlSheet.classList.add('sheet-open');
      _ctrlBackdrop.classList.add('backdrop-open');
    });
    _fab?.setAttribute('aria-expanded', 'true');
  };

  const closeSheet = () => {
    _ctrlSheet.classList.remove('sheet-open');
    _ctrlBackdrop.classList.remove('backdrop-open');
    setTimeout(() => {
      _ctrlSheet.style.display = '';
      _ctrlBackdrop.style.display = '';
    }, 320);
    _fab?.setAttribute('aria-expanded', 'false');
  };

  _ctrlBackdrop.addEventListener('click', closeSheet);

  // Wire transpose
  _ctrlSheet.querySelector('#sheetTransposeDown').addEventListener('click', () => {
    const newSt = onTransposeDown();
    const disp  = document.getElementById('sheetTransposeDisplay');
    if (disp) disp.textContent = newSt > 0 ? `+${newSt}` : String(newSt);
    updateFABTranspose(newSt);
  });

  _ctrlSheet.querySelector('#sheetTransposeUp').addEventListener('click', () => {
    const newSt = onTransposeUp();
    const disp  = document.getElementById('sheetTransposeDisplay');
    if (disp) disp.textContent = newSt > 0 ? `+${newSt}` : String(newSt);
    updateFABTranspose(newSt);
  });

  // Wire instrument
  _ctrlSheet.querySelectorAll('.instr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const instr = btn.dataset.instr;
      onInstrumentChange(instr);
      _ctrlSheet.querySelectorAll('.instr-btn').forEach(b => {
        const active = b.dataset.instr === instr;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', String(active));
      });
    });
  });

  // Wire font
  _ctrlSheet.querySelector('#sheetFontDown').addEventListener('click', () => {
    const { idx, display } = onFontDown();
    const disp = document.getElementById('sheetFontDisplay');
    if (disp) disp.textContent = display;
  });
  _ctrlSheet.querySelector('#sheetFontUp').addEventListener('click', () => {
    const { idx, display } = onFontUp();
    const disp = document.getElementById('sheetFontDisplay');
    if (disp) disp.textContent = display;
  });

  // Wire scroll toggle
  const sheetScrollToggle = _ctrlSheet.querySelector('#sheetScrollToggle');
  sheetScrollToggle.addEventListener('click', () => {
    const { scrolling } = onScrollToggle();
    sheetScrollToggle.classList.toggle('scrolling', scrolling);
    sheetScrollToggle.setAttribute('aria-pressed', String(scrolling));
    sheetScrollToggle.textContent = scrolling ? '⏸ Scrolling…' : '▶ Auto-scroll';
    // Also sync desktop toggle
    const desktopToggle = document.getElementById('scrollToggle');
    if (desktopToggle) {
      desktopToggle.classList.toggle('scrolling', scrolling);
      desktopToggle.setAttribute('aria-pressed', String(scrolling));
      desktopToggle.textContent = scrolling ? '⏸ Scrolling…' : '▶ Auto-scroll';
    }
  });

  _ctrlSheet.querySelector('#sheetScrollSpeed').addEventListener('input', e => {
    onSpeedChange(parseInt(e.target.value) || 3);
  });

  // Print/Share
  _ctrlSheet.querySelector('#sheetPrintBtn').addEventListener('click', onPrint);
  _ctrlSheet.querySelector('#sheetShareBtn').addEventListener('click', onShare);

  return { openSheet, closeSheet };
}

function destroyFABAndSheet() {
  if (_fab)          { _fab.remove();          _fab          = null; }
  if (_ctrlSheet)    { _ctrlSheet.remove();    _ctrlSheet    = null; }
  if (_ctrlBackdrop) { _ctrlBackdrop.remove(); _ctrlBackdrop = null; }
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD TOKEN EVENT DELEGATION
// ─────────────────────────────────────────────────────────────────────────

function attachChordEvents(container) {
  container.addEventListener('click', e => {
    const token = e.target.closest('.chord-token, .chord-used-pill');
    if (!token) {
      if (!e.target.closest('.chord-popup') && !isMobileView()) {
        hidePopup(true);
      }
      return;
    }

    e.stopPropagation();
    const chord = token.dataset.chord;
    if (!chord) return;

    if (!isMobileView() && _popupChord === chord && _popup?.classList.contains('open')) {
      hidePopup(true);
      return;
    }

    showPopup(chord, token);
  });

  // Desktop hover
  let hoverTimer = null;
  container.addEventListener('mouseenter', e => {
    if (isMobileView()) return;
    const token = e.target.closest('.chord-token, .chord-used-pill');
    if (!token) return;
    clearTimeout(hoverTimer);
    clearTimeout(_popupCloseTimer);
    hoverTimer = setTimeout(() => {
      const chord = token.dataset.chord;
      if (chord) showPopup(chord, token);
    }, 180);
  }, true);

  container.addEventListener('mouseleave', e => {
    if (isMobileView()) return;
    const token = e.target.closest('.chord-token, .chord-used-pill');
    if (!token) return;
    clearTimeout(hoverTimer);
    _popupCloseTimer = setTimeout(hidePopup, 280);
  }, true);
}

function _attachGlobalDismiss() {
  document.addEventListener('click', e => {
    if (!_popup?.classList.contains('open')) return;
    if (!e.target.closest('.chord-popup') &&
        !e.target.closest('.chord-token') &&
        !e.target.closest('.chord-used-pill') &&
        !e.target.closest('.pinned-chord-card')) {
      hidePopup(true);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (_popup?.classList.contains('open'))   hidePopup(true);
      if (_chordSheet?.classList.contains('sheet-open')) _hideChordBottomSheet();
      if (_ctrlSheet?.classList.contains('sheet-open'))  {
        _ctrlSheet.classList.remove('sheet-open');
        _ctrlBackdrop?.classList.remove('backdrop-open');
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  FONT SIZE CONTROL
// ─────────────────────────────────────────────────────────────────────────

const FONT_SIZES       = ['.70rem','.76rem','.82rem','.88rem','.94rem','1.0rem','1.06rem','1.12rem','1.2rem'];
const FONT_DEFAULT_IDX = 3;
const LS_FONT_KEY      = 'sd5_tab_font_size';

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
  const pct = `${Math.round((clamped / (FONT_SIZES.length - 1)) * 100)}%`;
  if (display) display.textContent = pct;
  try { localStorage.setItem(LS_FONT_KEY, String(clamped)); } catch {}
  return { idx: clamped, display: pct };
}

// ─────────────────────────────────────────────────────────────────────────
//  AUTO-SCROLL
// ─────────────────────────────────────────────────────────────────────────

const LS_SPEED_KEY  = 'sd5_scroll_speed';
let _scrollInterval = null;

function getScrollSpeed() {
  try {
    const v = parseInt(localStorage.getItem(LS_SPEED_KEY));
    if (v >= 1 && v <= 10) return v;
  } catch {}
  return 3;
}

function speedToInterval(speed) {
  return Math.round(80 - (speed - 1) * (80 - 16) / 9);
}

function startScroll(speed) {
  stopScroll();
  _scrollInterval = setInterval(
    () => window.scrollBy({ top: 1, behavior: 'instant' }),
    speedToInterval(speed)
  );
}

function stopScroll() {
  if (_scrollInterval) { clearInterval(_scrollInterval); _scrollInterval = null; }
}

// ─────────────────────────────────────────────────────────────────────────
//  INSTRUMENT PREFERENCE — localStorage
// ─────────────────────────────────────────────────────────────────────────

const LS_INSTR_KEY = 'sd5_chord_instrument';

function getSavedInstrument() {
  try {
    const v = localStorage.getItem(LS_INSTR_KEY);
    if (v === 'guitar' || v === 'ukulele' || v === 'piano') return v;
  } catch {}
  return 'guitar';
}

function saveInstrument(instr) {
  try { localStorage.setItem(LS_INSTR_KEY, instr); } catch {}
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

let _chordsRows = null;

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
      case 'newest': return parseDateMs(b.Date_Added) - parseDateMs(a.Date_Added);
      case 'az':     return (a.Title  || '').localeCompare(b.Title  || '');
      case 'artist': return (a.Artist || '').localeCompare(b.Artist || '');
      default:       return 0;
    }
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
//  BADGE HELPERS
// ─────────────────────────────────────────────────────────────────────────

function diffBadgeClass(diff) {
  switch ((diff || '').toLowerCase()) {
    case 'beginner':     return 'chord-badge-diff-beginner';
    case 'intermediate': return 'chord-badge-diff-intermediate';
    case 'advanced':     return 'chord-badge-diff-advanced';
    default:             return 'chord-badge-key';
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD CARD BUILDER
// ─────────────────────────────────────────────────────────────────────────

function buildChordCard(row) {
  const card = document.createElement('article');
  card.className = 'chord-card reveal';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${row.Title || 'Song'} by ${row.Artist || 'Unknown'}`);

  const imgUrl = fixImgUrl(row.Image_URL || '');

  const thumb = document.createElement('div');
  thumb.className = 'chord-card-thumb';
  if (imgUrl) {
    const img    = document.createElement('img');
    img.src      = imgUrl;
    img.alt      = row.Image_Alt || `${row.Title} thumbnail`;
    img.loading  = 'lazy';
    img.decoding = 'async';
    img.width    = 42;
    img.height   = 42;
    thumb.appendChild(img);
  } else {
    thumb.setAttribute('aria-hidden', 'true');
    thumb.textContent = '🎵';
  }
  card.appendChild(thumb);

  const body = document.createElement('div');
  body.className = 'chord-card-body';

  const artistParts = [row.Artist];
  if (row.Album) artistParts.push(row.Album);
  const artistLine = artistParts.filter(Boolean).map(p => esc(p)).join(' · ');

  body.innerHTML =
    `<div class="chord-card-title">${esc(row.Title || '')}</div>` +
    `<div class="chord-card-artist">
      <button class="chord-artist-link" data-artist="${esc(row.Artist || '')}"
        type="button" aria-label="Filter by ${esc(row.Artist || '')}">
        ${artistLine}
      </button>
    </div>`;
  card.appendChild(body);

  const badges = document.createElement('div');
  badges.className = 'chord-card-badges';

  const keyCapo = [
    row.Key  ? `Key ${esc(row.Key)}` : '',
    row.Capo && row.Capo !== '0' ? `Capo ${esc(row.Capo)}` : '',
  ].filter(Boolean).join(' · ');

  if (keyCapo) {
    badges.insertAdjacentHTML('beforeend',
      `<span class="chord-badge chord-badge-key">${keyCapo}</span>`);
  }
  if (row.Category) {
    badges.insertAdjacentHTML('beforeend',
      `<span class="chord-badge chord-badge-cat">${esc(row.Category)}</span>`);
  }
  if (row.Difficulty) {
    badges.insertAdjacentHTML('beforeend',
      `<span class="chord-badge ${diffBadgeClass(row.Difficulty)}">${esc(row.Difficulty)}</span>`);
  }
  card.appendChild(badges);

  const slug = (row.Slug || '').trim();
  const go   = () => import('../router.js').then(({ navigate }) => navigate(`/chords/${slug}`));
  card.addEventListener('click', e => {
    if (e.target.closest('.chord-artist-link')) return;
    go();
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });

  return card;
}

// ─────────────────────────────────────────────────────────────────────────
//  RECENTLY PLAYED STRIP BUILDER
// ─────────────────────────────────────────────────────────────────────────

function buildRecentStrip(container) {
  const recent = recentGet();

  const existing = container.querySelector('.chords-recent');
  if (existing) existing.remove();
  if (!recent.length) return;

  const section = document.createElement('div');
  section.className = 'chords-recent';
  section.setAttribute('aria-label', 'Recently played chord sheets');

  const heading = document.createElement('div');
  heading.className = 'chords-recent-heading';
  heading.innerHTML =
    `<span class="chords-recent-heading-label">🕐 Recently Played</span>` +
    `<button class="chords-recent-clear" type="button" aria-label="Clear recently played">Clear</button>`;
  section.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'chords-recent-row';
  row.setAttribute('role', 'list');

  recent.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'chord-recent-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${entry.title} by ${entry.artist}`);

    let meta = '';
    if (entry.key)        meta += `<span class="chord-recent-key-badge">Key ${esc(entry.key)}</span>`;
    if (entry.difficulty) meta += `<span class="chord-recent-key-badge">${esc(entry.difficulty)}</span>`;

    card.innerHTML =
      `<div class="chord-recent-title">${esc(entry.title || '')}</div>` +
      `<div class="chord-recent-artist">${esc(entry.artist || '')}</div>` +
      (meta ? `<div class="chord-recent-meta">${meta}</div>` : '');

    const go = () =>
      import('../router.js').then(({ navigate }) => navigate(`/chords/${entry.slug}`));
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });

    row.appendChild(card);
  });

  section.appendChild(row);

  heading.querySelector('.chords-recent-clear').addEventListener('click', () => {
    recentClear();
    section.remove();
  });

  container.insertBefore(section, container.firstChild);
}

// ─────────────────────────────────────────────────────────────────────────
//  FILTER CHIP BUILDER
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
    countEl.textContent = (
      chordsState.query ||
      chordsState.category !== 'all' ||
      chordsState.difficulty !== 'all' ||
      chordsState.key !== 'all'
    ) ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : '';
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

  if (paginationEl) {
    paginationEl.innerHTML = '';
    if (total > 1) {
      const prev = document.createElement('button');
      prev.className   = 'btn btn-ghost';
      prev.textContent = '← Prev';
      prev.setAttribute('aria-label', 'Previous page');
      prev.disabled    = page <= 1;

      const info = document.createElement('span');
      info.setAttribute('aria-live', 'polite');
      info.setAttribute('aria-atomic', 'true');
      info.textContent = `Page ${page} of ${total}`;

      const next = document.createElement('button');
      next.className   = 'btn btn-ghost';
      next.textContent = 'Next →';
      next.setAttribute('aria-label', 'Next page');
      next.disabled    = page >= total;

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

      if (page > 1)     paginationEl.appendChild(prev);
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

  destroyPopup();
  destroyPinnedRow();
  destroyFABAndSheet();

  updateSEO({
    title: 'Chord Sheets',
    desc:  'Guitar, ukulele & piano chord sheets with transpose, diagrams, and auto-scroll — curated by Suman Dangal.',
    path:  '/chords',
  });

  const view = document.getElementById('view-chords');
  if (!view) return;

  view.innerHTML =
    `<div class="chords-hero">
      <div class="chords-hero-inner">
        <div class="chords-hero-eyebrow">Music</div>
        <h2 class="chords-hero-title">Chord Sheets</h2>
        <p class="chords-hero-sub">
          Guitar, ukulele &amp; piano chord diagrams with real-time transpose and hands-free auto-scroll.
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
  const categories   = [...new Set(rows.map(r => r.Category).filter(Boolean))].sort();
  const difficulties = ['beginner', 'intermediate', 'advanced'].filter(d =>
    rows.some(r => (r.Difficulty || '').toLowerCase() === d)
  );
  const keys         = [...new Set(rows.map(r => r.Key).filter(Boolean))].sort();
  const featured     = rows.filter(r => (r.Featured || '').toLowerCase() === 'true');

  const featuredHTML = featured.length
    ? `<div class="chords-featured" id="chordsFeatured">
        <div class="chords-featured-heading">● Featured</div>
        <div class="chords-featured-grid" id="chordsFeaturedGrid"></div>
      </div>`
    : '';

  view.innerHTML =
    `<div class="chords-hero">
      <div class="chords-hero-inner">
        <div class="chords-hero-eyebrow">Music</div>
        <h2 class="chords-hero-title">Chord Sheets</h2>
        <p class="chords-hero-sub">
          Guitar, ukulele &amp; piano chord diagrams with real-time transpose and hands-free auto-scroll.
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
          <option value="newest"${chordsState.sort === 'newest' ? ' selected' : ''}>Newest first</option>
          <option value="az"${chordsState.sort === 'az' ? ' selected' : ''}>Title A → Z</option>
          <option value="artist"${chordsState.sort === 'artist' ? ' selected' : ''}>By artist</option>
        </select>
      </div>
      <span class="chords-results-count" id="chordsCount" aria-live="polite"></span>
    </div>
    <div class="chords-section" id="chordsSection">
      ${featuredHTML}
      <div class="chords-grid" id="chordsGrid" role="list" aria-live="polite" aria-label="Chord sheet list"></div>
      <div class="chords-pagination" id="chordsPagination" aria-label="Chord sheet pagination"></div>
    </div>`;

  const filterArea = document.getElementById('chordsFilterArea');
  const section    = document.getElementById('chordsSection');
  const grid       = document.getElementById('chordsGrid');
  const pagination = document.getElementById('chordsPagination');
  const countEl    = document.getElementById('chordsCount');

  const refresh = () => renderFilteredChords(grid, pagination, countEl);

  if (categories.length)   buildFilterGroup(filterArea, 'Category:',   categories,   'category',   refresh);
  if (difficulties.length) buildFilterGroup(filterArea, 'Difficulty:',  difficulties, 'difficulty', refresh);
  if (keys.length)         buildFilterGroup(filterArea, 'Key:',         keys,         'key',        refresh);

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

  view.addEventListener('click', e => {
    const btn = e.target.closest('.chord-artist-link');
    if (!btn) return;
    e.stopPropagation();
    chordsState.query = btn.dataset.artist;
    chordsState.page  = 1;
    const sEl = document.getElementById('chordsSearch');
    if (sEl) sEl.value = btn.dataset.artist;
    refresh();
  });

  const sortEl = document.getElementById('chordsSort');
  if (sortEl) {
    sortEl.addEventListener('change', e => {
      chordsState.sort = e.target.value;
      chordsState.page = 1;
      refresh();
    });
  }

  const featGrid = document.getElementById('chordsFeaturedGrid');
  if (featGrid && featured.length) {
    const frag = document.createDocumentFragment();
    featured.forEach(row => {
      const card = document.createElement('div');
      card.className = 'chord-feat-card reveal';
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${row.Title} by ${row.Artist}`);
      const diffBadge = row.Difficulty
        ? `<span class="chord-badge ${diffBadgeClass(row.Difficulty)}">${esc(row.Difficulty)}</span>` : '';
      const keyBadge  = row.Key
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

  buildRecentStrip(section);
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

  // Reset variant indices for a fresh page load
  chordVariantIndex.clear();

  view.innerHTML =
    `<div class="chord-detail-wrap">
      <div class="skel skel-line m" style="margin-bottom:1.5rem;width:80px;height:20px"></div>
      <div class="skel skel-line" style="height:42px;margin-bottom:.8rem"></div>
      <div class="skel skel-line m" style="height:18px;margin-bottom:2rem"></div>
      <div class="skel skel-card" style="height:220px;margin-bottom:2rem"></div>
      ${'<div class="skel skel-line"></div>'.repeat(5)}
    </div>`;

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

  // Record visit
  recentPush({
    slug:       (post.Slug       || '').trim(),
    title:      (post.Title      || '').trim(),
    artist:     (post.Artist     || '').trim(),
    key:        (post.Key        || '').trim(),
    difficulty: (post.Difficulty || '').trim(),
  });

  // ── Page state ──────────────────────────────────────────────────────────
  let semitones   = 0;
  let fontIdx     = getFontIdx();
  let isScrolling = false;
  let scrollSpeed = getScrollSpeed();
  let instrument  = getSavedInstrument();

  // ── SEO ─────────────────────────────────────────────────────────────────
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

  // ── Original chords used (for Bug 1 fix) ───────────────────────────────
  const originalChordsUsed = (post.Chords_Used || '')
    .split(',').map(c => c.trim()).filter(Boolean);

  // ── Build page HTML ──────────────────────────────────────────────────────
  const coverHTML = imgUrl
    ? `<img class="chord-detail-cover" src="${esc(imgUrl)}"
        alt="${esc(post.Image_Alt || post.Title + ' chord sheet cover')}"
        loading="eager" decoding="async" fetchpriority="high"
        width="1200" height="450">`
    : `<div class="chord-detail-cover-placeholder" aria-hidden="true">🎸</div>`;

  const diffBadge = post.Difficulty
    ? `<span class="chord-badge ${diffBadgeClass(post.Difficulty)}">${esc(post.Difficulty)}</span>` : '';
  const catBadge  = post.Category
    ? `<span class="chord-badge chord-badge-cat">${esc(post.Category)}</span>` : '';
  const tagBadges = tagList.map(t =>
    `<span class="chord-badge chord-badge-key">${esc(t)}</span>`).join('');

  const introHTML = post.Intro_Text
    ? `<p class="chord-detail-intro">${esc(post.Intro_Text)}</p>` : '';

  const metaCells = [
    post.Key            ? `<span data-label="Key"><strong id="currentKeyDisplay">${esc(post.Key)}</strong></span>` : '',
    post.Capo && post.Capo !== '0' ? `<span data-label="Capo"><strong>${esc(post.Capo)}</strong></span>` : '',
    post.BPM            ? `<span data-label="BPM"><strong>${esc(post.BPM)}</strong></span>` : '',
    post.Time_Signature ? `<span data-label="Time"><strong>${esc(post.Time_Signature)}</strong></span>` : '',
    post.Tuning         ? `<span data-label="Tuning"><strong>${esc(post.Tuning)}</strong></span>` : '',
    post.Date_Added     ? `<span data-label="Added"><strong>${esc(post.Date_Added)}</strong></span>` : '',
  ].filter(Boolean).join('');

  const instrIcons = {
    guitar:  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3L6 6M6 6L3 9M6 6C6 8.5 8 11 10.5 12M15 21L18 18M18 18L21 15M18 18C15.5 18 13 16 12 13.5M10.5 12C11.5 13.5 13 15.5 14.5 17L18 18M10.5 12L6 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
    ukulele: `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="5" ry="6" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="12" y1="10" x2="12" y2="4" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5"/></svg>`,
    piano:   `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="7" y1="4" x2="7" y2="14" stroke="currentColor" stroke-width="1"/><line x1="12" y1="4" x2="12" y2="14" stroke="currentColor" stroke-width="1"/><line x1="17" y1="4" x2="17" y2="14" stroke="currentColor" stroke-width="1"/><rect x="5" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/><rect x="15" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/></svg>`,
  };

  view.innerHTML =
    `<div class="chord-detail-wrap" id="chordDetailWrap">
      <button class="chord-detail-back" id="chordBack" aria-label="Back to chord sheets">
        ← Back to Chord Sheets
      </button>

      <div class="chord-detail-header">
        ${coverHTML}

        <div class="chord-detail-title-wrap">
          <h2 class="chord-detail-title" id="chordDetailTitle">${esc(post.Title || '')}</h2>
          <div class="chord-detail-artist">
            ${esc(post.Artist || '')}${post.Album ? ` · <em>${esc(post.Album)}</em>` : ''}${post.Year ? ` · ${esc(post.Year)}` : ''}
          </div>
        </div>

        ${metaCells ? `<div class="chord-detail-meta">${metaCells}</div>` : ''}

        <div class="chord-detail-badges">${catBadge}${diffBadge}${tagBadges}</div>

        ${introHTML}

        <!-- Bug 1 fix: chord-used-row rendered by refreshChordsUsed(), not static HTML -->
        <div class="chord-used-row" id="chordsUsedRow" style="${originalChordsUsed.length ? '' : 'display:none'}">
          <span class="chord-used-label">Chords:</span>
          <span id="chordsUsedPills"></span>
        </div>
      </div>

      <!-- Bug 2 fix: capo banner OUTSIDE header, zero-height collapsible -->
      <div class="chord-capo-banner-wrap" id="capoBannerWrap" aria-live="polite">
        <div class="chord-capo-banner" id="capoBanner"></div>
      </div>

      <!-- Controls bar — Smart Sticky wrapper -->
      <div class="chord-controls-outer" id="chordControlsOuter">
        <div class="chord-controls" id="chordControls" role="toolbar" aria-label="Chord sheet controls">

          <!-- Transpose -->
          <div class="ctrl-group" role="group" aria-label="Transpose">
            <span class="ctrl-label">Transpose</span>
            <button class="ctrl-btn" id="transposeDown" aria-label="Transpose down" title="Down one semitone">−</button>
            <span class="ctrl-transpose-display" id="transposeDisplay" aria-live="polite">0</span>
            <button class="ctrl-btn" id="transposeUp"   aria-label="Transpose up"   title="Up one semitone">+</button>
          </div>

          <!-- Instrument switcher -->
          <div class="ctrl-group" role="group" aria-label="Instrument">
            <span class="ctrl-label">Instrument</span>
            <div class="instr-switcher" role="radiogroup" aria-label="Choose instrument">
              <button class="instr-btn${instrument === 'guitar'  ? ' active' : ''}" data-instr="guitar"  role="radio" aria-checked="${instrument === 'guitar'}"  aria-label="Guitar">
                ${instrIcons.guitar} Guitar
              </button>
              <button class="instr-btn${instrument === 'ukulele' ? ' active' : ''}" data-instr="ukulele" role="radio" aria-checked="${instrument === 'ukulele'}" aria-label="Ukulele">
                ${instrIcons.ukulele} Uke
              </button>
              <button class="instr-btn${instrument === 'piano'   ? ' active' : ''}" data-instr="piano"   role="radio" aria-checked="${instrument === 'piano'}"   aria-label="Piano">
                ${instrIcons.piano} Piano
              </button>
            </div>
          </div>

          <!-- Font size -->
          <div class="ctrl-group ctrl-group-font" role="group" aria-label="Font size">
            <span class="ctrl-label">Size</span>
            <button class="ctrl-btn" id="fontDown" aria-label="Decrease font">A−</button>
            <span class="ctrl-fontsize-display" id="fontDisplay" aria-live="polite"></span>
            <button class="ctrl-btn" id="fontUp"   aria-label="Increase font">A+</button>
          </div>

          <!-- Auto-scroll -->
          <div class="ctrl-group ctrl-group-scroll" role="group" aria-label="Auto scroll">
            <button class="ctrl-scroll-toggle" id="scrollToggle" aria-pressed="false">
              ▶ Auto-scroll
            </button>
            <div class="ctrl-speed-wrap" aria-label="Scroll speed">
              <span class="ctrl-label">Speed</span>
              <input type="range" class="ctrl-speed" id="scrollSpeed"
                min="1" max="10" value="${scrollSpeed}"
                aria-label="Scroll speed">
            </div>
          </div>

          <!-- Actions -->
          <div class="ctrl-actions">
            <button class="ctrl-action-btn" id="printBtn" aria-label="Print">🖨 Print</button>
            <button class="ctrl-action-btn" id="shareBtn" aria-label="Share">🔗 Share</button>
          </div>

        </div>
      </div>

      <!-- Tab content (pinned row will be inserted before this) -->
      <div class="tab-container" id="tabContainer" role="region" aria-label="Tab content">
        <div class="tab-header-strip">
          <span class="tab-header-label">Tab / Lyrics</span>
          <span class="tab-key-display" id="tabKeyDisplay">${post.Key ? `Key of ${esc(post.Key)}` : ''}</span>
        </div>
        <div class="tab-body" id="tabBody"></div>
      </div>
    </div>`;

  // ── DOM refs ────────────────────────────────────────────────────────────
  const tabBody          = document.getElementById('tabBody');
  const transposeDisp    = document.getElementById('transposeDisplay');
  const keyDisp          = document.getElementById('currentKeyDisplay');
  const tabKeyDisp       = document.getElementById('tabKeyDisplay');
  const capoBannerWrap   = document.getElementById('capoBannerWrap');
  const capoBanner       = document.getElementById('capoBanner');
  const transposeDown    = document.getElementById('transposeDown');
  const transposeUp      = document.getElementById('transposeUp');
  const fontDown         = document.getElementById('fontDown');
  const fontUp           = document.getElementById('fontUp');
  const fontDisp         = document.getElementById('fontDisplay');
  const scrollToggle     = document.getElementById('scrollToggle');
  const scrollSpeedEl    = document.getElementById('scrollSpeed');
  const printBtn         = document.getElementById('printBtn');
  const shareBtn         = document.getElementById('shareBtn');
  const chordBack        = document.getElementById('chordBack');
  const tabContainer     = document.getElementById('tabContainer');
  const chordControls    = document.getElementById('chordControls');
  const chordControlsOuter = document.getElementById('chordControlsOuter');
  const wrap             = document.getElementById('chordDetailWrap');

  // ── Sticky "is-stuck" class via IntersectionObserver ───────────────────
  // The outer div is sticky top:0. We observe a sentinel above it.
  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'height:1px;margin-top:-1px;pointer-events:none;';
  wrap.insertBefore(sentinel, chordControlsOuter);

  const stickyObserver = new IntersectionObserver(
    ([entry]) => chordControlsOuter.classList.toggle('is-stuck', !entry.isIntersecting),
    { threshold: 0 }
  );
  stickyObserver.observe(sentinel);

  // ── Set up pinned chords row (above tab container) ───────────────────
  _pinned      = pinnedLoad();
  _pinnedInstr = instrument;
  buildPinnedRow(tabContainer);
  buildPinnedDrawer();

  // ── Set up popup instrument ──────────────────────────────────────────
  _popupInstr = instrument;

  // ── Attach global popup dismiss ──────────────────────────────────────
  _attachGlobalDismiss();

  // ── Bug 1 fix: refreshChordsUsed() rebuilds pills with transposed names ──
  function refreshChordsUsed() {
    const row      = document.getElementById('chordsUsedRow');
    const pillsEl  = document.getElementById('chordsUsedPills');
    if (!pillsEl || !originalChordsUsed.length) return;

    pillsEl.innerHTML = originalChordsUsed.map(originalChord => {
      const transposed = transposeChord(originalChord, semitones);
      return `<button class="chord-used-pill" data-chord="${esc(transposed)}" type="button"
        aria-label="Show ${esc(transposed)} chord diagram">${esc(transposed)}</button>`;
    }).join('');
  }

  // ── Bug 2 fix: capo banner update (no layout shift) ──────────────────
  function refreshCapoBanner() {
    const sug = capoSuggestion(post.Key || '', post.Capo || '0', semitones);
    if (sug) {
      capoBanner.innerHTML =
        `🎸 Play <strong>${esc(sug.playKey)}</strong> shapes with capo on fret ` +
        `<strong>${sug.capoFret}</strong> → sounds in <strong>${esc(sug.soundsIn)}</strong>`;
      capoBannerWrap.classList.add('capo-visible');
    } else {
      capoBannerWrap.classList.remove('capo-visible');
    }
  }

  // ── Tab refresh ──────────────────────────────────────────────────────
  function refreshTab() {
    if (!tabBody) return;
    tabBody.innerHTML = renderTab(post.Tab_Content || '', semitones);

    const displayKey = semitones
      ? transposeKey(post.Key || '', semitones)
      : (post.Key || '');

    if (keyDisp)    keyDisp.textContent    = displayKey;
    if (tabKeyDisp) tabKeyDisp.textContent = displayKey ? `Key of ${displayKey}` : '';

    const stDisplay = semitones > 0 ? `+${semitones}` : String(semitones);
    if (transposeDisp) transposeDisp.textContent = stDisplay;

    if (transposeDown) transposeDown.disabled = semitones <= -6;
    if (transposeUp)   transposeUp.disabled   = semitones >= 6;

    // Bug 1: refresh chords-used pills
    refreshChordsUsed();

    // Bug 2: refresh capo banner outside header
    refreshCapoBanner();

    // Re-attach chord events after re-render
    if (tabContainer) attachChordEvents(tabContainer);
  }

  // Init font
  const { display: initFontDisplay } = setFontIdx(tabBody, fontIdx, fontDisp);

  // Initial tab render
  refreshTab();

  // Attach chord events to the whole wrap (catches chord-used pills too)
  if (wrap) attachChordEvents(wrap);

  // ── Transpose ────────────────────────────────────────────────────────
  transposeDown?.addEventListener('click', () => {
    if (semitones > -6) { semitones--; refreshTab(); updateFABTranspose(semitones); }
  });
  transposeUp?.addEventListener('click', () => {
    if (semitones < 6)  { semitones++; refreshTab(); updateFABTranspose(semitones); }
  });

  // ── Instrument switcher (desktop) ─────────────────────────────────────
  chordControls?.addEventListener('click', e => {
    const btn = e.target.closest('.instr-btn');
    if (!btn) return;
    const instr = btn.dataset.instr;
    if (instr === instrument) return;
    instrument = instr;
    saveInstrument(instr);

    setPopupInstrument(instr);
    pinnedSetInstrument(instr);
    _pinnedInstr = instr;

    chordControls.querySelectorAll('.instr-btn').forEach(b => {
      const active = b.dataset.instr === instr;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
  });

  // ── Font size ─────────────────────────────────────────────────────────
  fontDown?.addEventListener('click', () => {
    fontIdx = setFontIdx(tabBody, fontIdx - 1, fontDisp).idx;
  });
  fontUp?.addEventListener('click', () => {
    fontIdx = setFontIdx(tabBody, fontIdx + 1, fontDisp).idx;
  });

  // ── Auto-scroll ───────────────────────────────────────────────────────
  scrollToggle?.addEventListener('click', () => {
    isScrolling = !isScrolling;
    scrollToggle.classList.toggle('scrolling', isScrolling);
    scrollToggle.setAttribute('aria-pressed', String(isScrolling));
    scrollToggle.textContent = isScrolling ? '⏸ Scrolling…' : '▶ Auto-scroll';
    if (isScrolling) startScroll(scrollSpeed); else stopScroll();
  });

  scrollSpeedEl?.addEventListener('input', e => {
    scrollSpeed = parseInt(e.target.value) || 3;
    try { localStorage.setItem(LS_SPEED_KEY, String(scrollSpeed)); } catch {}
    if (isScrolling) startScroll(scrollSpeed);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isScrolling) stopScroll();
  }, { once: false });

  // ── Print ─────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();
  printBtn?.addEventListener('click', handlePrint);

  // ── Share ─────────────────────────────────────────────────────────────
  const handleShare = async () => {
    const url = `${window.location.origin}/chords/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard!');
    } catch {
      const tmp = document.createElement('input');
      tmp.value = url;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      showToast('Link copied!');
    }
  };
  shareBtn?.addEventListener('click', handleShare);

  // ── Mobile FAB + Controls Bottom Sheet ──────────────────────────────
  const { openSheet, closeSheet } = buildControlsSheet({
    semitones,
    fontIdx,
    instrument,
    scrollSpeed,
    isScrolling,
    instrIcons,

    onTransposeDown: () => {
      if (semitones > -6) { semitones--; refreshTab(); }
      return semitones;
    },
    onTransposeUp: () => {
      if (semitones < 6)  { semitones++; refreshTab(); }
      return semitones;
    },

    onFontDown: () => {
      const result = setFontIdx(tabBody, fontIdx - 1, fontDisp);
      fontIdx = result.idx;
      return result;
    },
    onFontUp: () => {
      const result = setFontIdx(tabBody, fontIdx + 1, fontDisp);
      fontIdx = result.idx;
      return result;
    },

    onScrollToggle: () => {
      isScrolling = !isScrolling;
      if (isScrolling) startScroll(scrollSpeed); else stopScroll();
      return { scrolling: isScrolling };
    },
    onSpeedChange: (speed) => {
      scrollSpeed = speed;
      try { localStorage.setItem(LS_SPEED_KEY, String(scrollSpeed)); } catch {}
      if (isScrolling) startScroll(scrollSpeed);
    },

    onInstrumentChange: (instr) => {
      instrument = instr;
      saveInstrument(instr);
      setPopupInstrument(instr);
      pinnedSetInstrument(instr);
      _pinnedInstr = instr;
      // Sync desktop instrument buttons
      chordControls?.querySelectorAll('.instr-btn').forEach(b => {
        const active = b.dataset.instr === instr;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', String(active));
      });
    },

    onPrint:  handlePrint,
    onShare:  handleShare,
  });

  buildFAB({ semitones, openSheet });

  // ── Back — cleanup ───────────────────────────────────────────────────
  const cleanup = () => {
    stopScroll();
    hidePopup(true);
    stickyObserver.disconnect();
    destroyPinnedRow();
    destroyFABAndSheet();
    // Clean up chord sheet panel
    if (_chordSheet) {
      _chordSheet.classList.remove('sheet-open');
      const cb = document.getElementById('chordSheetBackdrop');
      if (cb) { cb.remove(); }
      _chordSheet.remove();
      _chordSheet = null;
    }
  };

  chordBack?.addEventListener('click', () => {
    cleanup();
    import('../router.js').then(({ navigate }) => navigate('/chords'));
  });

  window.addEventListener('popstate', cleanup, { once: true });

  watchReveals();
}