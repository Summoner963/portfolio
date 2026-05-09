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
 *   - Capo suggestion when transposed key has a simpler open-position equivalent
 *   - Multi-instrument support: Guitar / Ukulele / Piano
 *     · Guitar: 6-string fretboard SVG (tape-label aesthetic)
 *     · Ukulele: 4-string fretboard SVG
 *     · Piano: 1-octave keyboard SVG with highlighted keys
 *   - Diagram Drawer: right-side slide-in panel (desktop), bottom sheet (mobile)
 *     with per-instrument tabs — replaces the old popover
 *   - Chord Dock: pinned chord reference bar with flight animation, position cycling,
 *     minimize/expand, auto-hide on scroll, ghost on active scroll, localStorage persist
 *   - Chord-above-lyric layout: chords rendered on their own line above lyrics
 *   - Font-size A−/A+ with localStorage persistence
 *   - Auto-scroll toggle with speed slider (localStorage persistence)
 *   - Print button + Share button (clipboard toast)
 *   - SEO: updateSEO with chordMeta for MusicComposition schema
 *   - Lazy-loads css/chords.css before first render
 *
 * Dependencies (all already built):
 *   js/api.js        → fetchSheet, CFG
 *   js/seo.js        → updateSEO, removeSchemas
 *   js/utils.js      → esc, fixImgUrl, loadCSS, watchReveals, showToast
 *   js/data/chord-shapes.js → GUITAR_SHAPES, UKULELE_SHAPES, PIANO_SHAPES (named exports)
 */

import { fetchSheet, CFG }                from '../api.js';
import { updateSEO, removeSchemas }       from '../seo.js';
import { esc, fixImgUrl, loadCSS, watchReveals, showToast } from '../utils.js';
import { GUITAR_SHAPES, UKULELE_SHAPES, PIANO_SHAPES } from '../data/chord-shapes.js';

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
//  SVG DIAGRAM GENERATORS
// ─────────────────────────────────────────────────────────────────────────

const D = {
  bg:         '#19160f',
  string:     'rgba(200,170,100,.35)',
  fret:       'rgba(200,150,42,.2)',
  nut:        'rgba(200,150,42,.7)',
  dot:        '#c8962a',
  dotText:    '#fff',
  openCircle: 'rgba(200,150,42,.6)',
  muted:      'rgba(200,150,42,.35)',
  barre:      '#c8962a',
  text:       'rgba(200,170,100,.55)',
  label:      '#e0b050',
};

// ── Guitar SVG (6 strings) ────────────────────────────────────────────────
function buildGuitarSVG(chordName, shape) {
  if (!shape) return _noShapeSVG(chordName, 6);

  const { frets, fingers, barre, baseFret = 1 } = shape;

  const LEFT  = 18, TOP = 28, W = 56, H = 64;
  const NS    = 6, NF = 5;
  const SG    = W / (NS - 1);
  const FG    = H / NF;
  const DR    = 6;

  const sx = i => LEFT + (NS - 1 - i) * SG;
  const fy = f => TOP + (f - 0.5) * FG;

  const p = [];

  if (baseFret === 1) {
    p.push(`<line x1="${LEFT}" y1="${TOP}" x2="${LEFT + W}" y2="${TOP}" stroke="${D.nut}" stroke-width="3" stroke-linecap="round"/>`);
  } else {
    p.push(`<text x="${LEFT - 5}" y="${TOP + FG * 0.55}" text-anchor="end" font-family="monospace" font-size="7.5" fill="${D.text}" dominant-baseline="middle">${baseFret}</text>`);
  }

  for (let s = 0; s < NS; s++) {
    const x = sx(s);
    p.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + H}" stroke="${D.string}" stroke-width="1.2"/>`);
  }

  for (let f = 1; f <= NF; f++) {
    const y = TOP + f * FG;
    p.push(`<line x1="${LEFT}" y1="${y}" x2="${LEFT + W}" y2="${y}" stroke="${D.fret}" stroke-width="0.8"/>`);
  }

  if (barre) {
    const lf = barre.fret - baseFret + 1;
    if (lf >= 1 && lf <= NF) {
      const x1 = sx(barre.to), x2 = sx(barre.from), by = fy(lf);
      p.push(`<rect x="${x1 - DR}" y="${by - DR}" width="${x2 - x1 + DR * 2}" height="${DR * 2}" rx="${DR}" fill="${D.barre}" opacity="0.88"/>`);
    }
  }

  for (let s = 0; s < NS; s++) {
    const f = frets[s], x = sx(s), y = TOP - 11;
    if (f === -1) {
      const d = 3.5;
      p.push(
        `<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}" stroke="${D.muted}" stroke-width="1.5" stroke-linecap="round"/>` +
        `<line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}" stroke="${D.muted}" stroke-width="1.5" stroke-linecap="round"/>`
      );
    } else if (f === 0) {
      p.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="none" stroke="${D.openCircle}" stroke-width="1.4"/>`);
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
      p.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="7" fill="${D.dotText}" font-weight="700" pointer-events="none">${finger}</text>`);
    }
  }

  return _wrapSVG(chordName, p, 100, 122);
}

// ── Ukulele SVG (4 strings) ───────────────────────────────────────────────
function buildUkuleleSVG(chordName, shape) {
  if (!shape) return _noShapeSVG(chordName, 4);

  const { frets, fingers, barre, baseFret = 1 } = shape;

  const LEFT  = 18, TOP = 28, W = 42, H = 64;
  const NS    = 4, NF = 5;
  const SG    = W / (NS - 1);
  const FG    = H / NF;
  const DR    = 6;

  const sx = i => LEFT + (NS - 1 - i) * SG;
  const fy = f => TOP + (f - 0.5) * FG;

  const p = [];

  if (baseFret === 1) {
    p.push(`<line x1="${LEFT}" y1="${TOP}" x2="${LEFT + W}" y2="${TOP}" stroke="${D.nut}" stroke-width="3" stroke-linecap="round"/>`);
  } else {
    p.push(`<text x="${LEFT - 5}" y="${TOP + FG * 0.55}" text-anchor="end" font-family="monospace" font-size="7.5" fill="${D.text}" dominant-baseline="middle">${baseFret}</text>`);
  }

  for (let s = 0; s < NS; s++) {
    const x = sx(s);
    p.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + H}" stroke="${D.string}" stroke-width="1.2"/>`);
  }

  for (let f = 1; f <= NF; f++) {
    const y = TOP + f * FG;
    p.push(`<line x1="${LEFT}" y1="${y}" x2="${LEFT + W}" y2="${y}" stroke="${D.fret}" stroke-width="0.8"/>`);
  }

  if (barre) {
    const lf = barre.fret - baseFret + 1;
    if (lf >= 1 && lf <= NF) {
      const x1 = sx(barre.to), x2 = sx(barre.from), by = fy(lf);
      p.push(`<rect x="${x1 - DR}" y="${by - DR}" width="${x2 - x1 + DR * 2}" height="${DR * 2}" rx="${DR}" fill="${D.barre}" opacity="0.88"/>`);
    }
  }

  for (let s = 0; s < NS; s++) {
    const f = frets[s], x = sx(s), y = TOP - 11;
    if (f === -1) {
      const d = 3.5;
      p.push(
        `<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}" stroke="${D.muted}" stroke-width="1.5" stroke-linecap="round"/>` +
        `<line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}" stroke="${D.muted}" stroke-width="1.5" stroke-linecap="round"/>`
      );
    } else if (f === 0) {
      p.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="none" stroke="${D.openCircle}" stroke-width="1.4"/>`);
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
      p.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="7" fill="${D.dotText}" font-weight="700" pointer-events="none">${finger}</text>`);
    }
  }

  const labels = ['A','E','C','G'];
  for (let s = 0; s < NS; s++) {
    const x = sx(s);
    p.push(`<text x="${x}" y="${TOP + H + 12}" text-anchor="middle" font-family="monospace" font-size="6.5" fill="${D.text}">${labels[s]}</text>`);
  }

  return _wrapSVG(chordName, p, 82, 128);
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

function buildPianoSVG(chordName, shape) {
  const W = 140, H = 80;
  const WKW = W / 7;
  const WKH = H;
  const BKW = WKW * 0.6;
  const BKH = H * 0.58;

  const highlighted = new Set((shape?.notes || []).map(normPianoNote));

  const p = [];

  p.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="3" fill="#111009" stroke="rgba(200,150,42,.25)" stroke-width="1"/>`);

  PIANO_WHITE_KEYS.forEach((note, i) => {
    const x   = i * WKW;
    const lit = highlighted.has(note);
    p.push(
      `<rect x="${x + 0.8}" y="0" width="${WKW - 1.6}" height="${WKH - 1}" rx="2"` +
      ` fill="${lit ? '#c8962a' : 'rgba(232,220,190,.88)'}"` +
      ` stroke="${lit ? '#e0b050' : 'rgba(0,0,0,.4)'}"` +
      ` stroke-width="${lit ? '1.5' : '0.6'}"` +
      `${lit ? ' filter="url(#kglow)"' : ''}/>`
    );
    if (lit) {
      p.push(
        `<text x="${x + WKW / 2}" y="${WKH - 5}" text-anchor="middle"` +
        ` font-family="monospace" font-size="6.5" font-weight="700"` +
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
      ` fill="${lit ? '#c8962a' : '#0e0c08'}"` +
      ` stroke="${lit ? '#e0b050' : 'rgba(200,150,42,.2)'}"` +
      ` stroke-width="${lit ? '1.5' : '0.6'}"` +
      `${lit ? ' filter="url(#kglow)"' : ''}/>`
    );
    if (lit) {
      const label = note.replace('#', '♯');
      p.push(
        `<text x="${x + BKW / 2}" y="${BKH - 4}" text-anchor="middle"` +
        ` font-family="monospace" font-size="5.5" font-weight="700"` +
        ` fill="#fff" opacity="0.9">${label}</text>`
      );
    }
  });

  const defsBlock =
    `<defs><filter id="kglow" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feGaussianBlur stdDeviation="2" result="blur"/>` +
    `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter></defs>`;

  return (
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"` +
    ` xmlns="http://www.w3.org/2000/svg"` +
    ` aria-label="${esc(chordName)} piano voicing"` +
    ` class="chord-diagram-svg" role="img">` +
    defsBlock + p.join('') +
    `</svg>`
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _wrapSVG(label, parts, w, h) {
  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"` +
    ` xmlns="http://www.w3.org/2000/svg"` +
    ` aria-label="${esc(label)} chord diagram"` +
    ` class="chord-diagram-svg" role="img">` +
    parts.join('') +
    `</svg>`
  );
}

function _noShapeSVG(label, strings) {
  const w = strings === 4 ? 82 : 100, h = 122;
  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"` +
    ` xmlns="http://www.w3.org/2000/svg" aria-label="${esc(label)}" class="chord-diagram-svg">` +
    `<text x="${w/2}" y="${h/2}" text-anchor="middle" font-family="monospace" font-size="9"` +
    ` fill="rgba(200,170,100,.3)">No diagram</text>` +
    `</svg>`
  );
}

function buildDiagramSVG(chordName, instrument) {
  switch (instrument) {
    case 'ukulele': return buildUkuleleSVG(chordName, UKULELE_SHAPES[chordName]);
    case 'piano':   return buildPianoSVG(chordName, PIANO_SHAPES[chordName]);
    default:        return buildGuitarSVG(chordName, GUITAR_SHAPES[chordName]);
  }
}

// ── Mini diagram for dock (scaled down) ──────────────────────────────────
function buildMiniDiagramSVG(chordName, instrument) {
  // Returns the same SVG but wrapped in a scaled container for the dock
  return buildDiagramSVG(chordName, instrument);
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
//  DIAGRAM DRAWER — slide-in panel
// ─────────────────────────────────────────────────────────────────────────

let _drawer     = null;
let _backdrop   = null;
let _activeChord = null;
let _drawerInstr = 'guitar';

function ensureDrawer() {
  if (_drawer) return _drawer;

  _backdrop = document.createElement('div');
  _backdrop.className = 'cdd-backdrop';
  _backdrop.setAttribute('aria-hidden', 'true');
  document.body.appendChild(_backdrop);

  _backdrop.addEventListener('click', hideDrawer);

  _drawer = document.createElement('div');
  _drawer.className = 'chord-diagram-drawer';
  _drawer.setAttribute('role', 'complementary');
  _drawer.setAttribute('aria-label', 'Chord diagram');

  _drawer.innerHTML =
    `<div class="cdd-header">
      <span class="cdd-chord-name" id="cddChordName">—</span>
      <div style="display:flex;align-items:center;gap:.5rem">
        <button class="cdd-pin-btn" id="cddPinBtn" aria-label="Pin chord to dock" title="Pin to dock">📌</button>
        <button class="cdd-close" id="cddClose" aria-label="Close chord diagram">✕</button>
      </div>
    </div>
    <div class="cdd-instr-tabs" role="tablist" aria-label="Instrument">
      <button class="cdd-tab active" data-instr="guitar" role="tab" aria-selected="true">
        <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:1.8" aria-hidden="true">
          <path d="M9 3L6 6M6 6L3 9M6 6C6 8.5 8 11 10.5 12M15 21L18 18M18 18L21 15M18 18C15.5 18 13 16 12 13.5M10.5 12C11.5 13.5 13 15.5 14.5 17L18 18M10.5 12L6 6"/>
        </svg>
        Guitar
      </button>
      <button class="cdd-tab" data-instr="ukulele" role="tab" aria-selected="false">
        <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:1.8" aria-hidden="true">
          <ellipse cx="12" cy="16" rx="5" ry="6"/>
          <line x1="12" y1="10" x2="12" y2="4"/>
          <line x1="10" y1="4" x2="14" y2="4"/>
        </svg>
        Uke
      </button>
      <button class="cdd-tab" data-instr="piano" role="tab" aria-selected="false">
        <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:1.8" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="1"/>
          <line x1="7" y1="4" x2="7" y2="14"/>
          <line x1="12" y1="4" x2="12" y2="14"/>
          <line x1="17" y1="4" x2="17" y2="14"/>
          <rect x="5" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/>
          <rect x="10" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/>
          <rect x="15" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/>
        </svg>
        Piano
      </button>
    </div>
    <div class="cdd-diagram-area" id="cddDiagramArea"></div>
    <div class="cdd-quality-label" id="cddQualityLabel"></div>`;

  document.body.appendChild(_drawer);

  _drawer.querySelector('#cddClose').addEventListener('click', hideDrawer);

  // Pin button in drawer
  _drawer.querySelector('#cddPinBtn').addEventListener('click', () => {
    if (_activeChord) dockPinChord(_activeChord);
  });

  _drawer.querySelector('.cdd-instr-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.cdd-tab');
    if (!btn) return;
    const instr = btn.dataset.instr;
    _drawerInstr = instr;
    _drawer.querySelectorAll('.cdd-tab').forEach(b => {
      const active = b.dataset.instr === instr;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    if (_activeChord) _renderDrawerDiagram(_activeChord);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _drawer.classList.contains('open')) hideDrawer();
  });

  return _drawer;
}

function _renderDrawerDiagram(chordName) {
  const area  = _drawer.querySelector('#cddDiagramArea');
  const qLabel= _drawer.querySelector('#cddQualityLabel');
  if (!area) return;

  area.innerHTML = buildDiagramSVG(chordName, _drawerInstr);

  if (_drawerInstr === 'piano') {
    const ps = PIANO_SHAPES[chordName];
    qLabel.textContent = ps ? `${ps.notes.join(' – ')}` : '';
  } else {
    qLabel.textContent = '';
  }

  // Update pin button state
  const pinBtn = _drawer.querySelector('#cddPinBtn');
  if (pinBtn) {
    const isPinned = dockIsPinned(chordName);
    pinBtn.textContent = isPinned ? '📍' : '📌';
    pinBtn.title = isPinned ? 'Already pinned' : 'Pin to dock';
  }
}

function showDrawer(chordName, originElement) {
  ensureDrawer();
  _activeChord = chordName;

  const nameEl = _drawer.querySelector('#cddChordName');
  if (nameEl) nameEl.textContent = chordName;

  _renderDrawerDiagram(chordName);

  _drawer.classList.add('open');
  _backdrop.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function hideDrawer() {
  if (!_drawer) return;
  _drawer.classList.remove('open');
  _backdrop.classList.remove('visible');
  document.body.style.overflow = '';
  _activeChord = null;
}

function setDrawerInstrument(instr) {
  _drawerInstr = instr;
  if (_drawer) {
    _drawer.querySelectorAll('.cdd-tab').forEach(b => {
      const active = b.dataset.instr === instr;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    if (_activeChord && _drawer.classList.contains('open')) {
      _renderDrawerDiagram(_activeChord);
    }
  }
}

function destroyDrawer() {
  hideDrawer();
  if (_drawer)   { _drawer.remove();   _drawer   = null; }
  if (_backdrop) { _backdrop.remove(); _backdrop = null; }
  _activeChord = null;
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD DOCK — pinning system
// ─────────────────────────────────────────────────────────────────────────

const LS_DOCK_KEY    = 'sd5_chord_dock';
const DOCK_MAX_PINS  = 18;

// Position cycle: 'bottom' → 'top' → 'sidebar' → 'bottom'
const DOCK_POSITIONS = ['bottom', 'top', 'sidebar'];

let _dock            = null;       // The dock DOM element
let _dockPinned      = [];         // Array of chord name strings (FIFO, newest first)
let _dockPosition    = 'bottom';   // Current position
let _dockMinimized   = false;      // Collapsed to badge
let _dockExpanded    = false;      // Show diagrams (tall mode)
let _dockInstr       = 'guitar';   // Mirrors page instrument
let _dockScrollY     = 0;          // Last known scroll Y
let _dockScrollDir   = 0;          // +1 down, -1 up
let _dockScrollTimer = null;
let _dockHidden      = false;      // Auto-hidden (scrolled down)
let _dockGhosted     = false;
let _dockScrolling   = false;

function dockLoad() {
  try {
    const raw = localStorage.getItem(LS_DOCK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, DOCK_MAX_PINS) : [];
  } catch { return []; }
}

function dockSave() {
  try { localStorage.setItem(LS_DOCK_KEY, JSON.stringify(_dockPinned)); } catch {}
}

function dockIsPinned(chordName) {
  return _dockPinned.includes(chordName);
}

/**
 * Pin a chord. Animates a "flight" clone from the token to the dock.
 * @param {string} chordName
 * @param {Element|null} originEl — source element for flight animation origin
 */
function dockPinChord(chordName, originEl) {
  if (!_dock) return;

  if (dockIsPinned(chordName)) {
    // Already pinned — just flash the card
    const existing = _dock.querySelector(`.dock-chord-card[data-chord="${CSS.escape(chordName)}"]`);
    if (existing) {
      existing.classList.add('dock-card-flash');
      setTimeout(() => existing.classList.remove('dock-card-flash'), 600);
    }
    return;
  }

  // FIFO: remove oldest if at limit
  if (_dockPinned.length >= DOCK_MAX_PINS) {
    const removed = _dockPinned.pop();
    const removedEl = _dock.querySelector(`.dock-chord-card[data-chord="${CSS.escape(removed)}"]`);
    if (removedEl) removedEl.remove();
  }

  _dockPinned.unshift(chordName);
  dockSave();

  // Flight animation
  if (originEl) {
    _dockFlightAnimate(chordName, originEl);
  }

  // Add card to dock
  const card = _dockBuildCard(chordName);
  const list = _dock.querySelector('.dock-chord-list');
  if (list) {
    list.insertBefore(card, list.firstChild);
    // Entrance animation
    requestAnimationFrame(() => card.classList.add('dock-card-enter'));
  }

  _dockUpdateBadge();
  _dockUpdatePinBtn(chordName);

  // Show dock if minimized
  if (_dockMinimized) dockRestore();
}

function dockUnpinChord(chordName) {
  _dockPinned = _dockPinned.filter(c => c !== chordName);
  dockSave();

  const card = _dock?.querySelector(`.dock-chord-card[data-chord="${CSS.escape(chordName)}"]`);
  if (card) {
    card.classList.add('dock-card-exit');
    setTimeout(() => card.remove(), 240);
  }

  _dockUpdateBadge();
  _dockUpdatePinBtn(chordName);
}

function _dockUpdatePinBtn(chordName) {
  // Update drawer pin button if open for this chord
  if (_drawer && _activeChord === chordName) {
    const pinBtn = _drawer.querySelector('#cddPinBtn');
    if (pinBtn) {
      const isPinned = dockIsPinned(chordName);
      pinBtn.textContent = isPinned ? '📍' : '📌';
      pinBtn.title = isPinned ? 'Already pinned' : 'Pin to dock';
    }
  }
}

function _dockFlightAnimate(chordName, originEl) {
  if (!originEl || !_dock) return;

  const srcRect  = originEl.getBoundingClientRect();
  const dockRect = _dock.getBoundingClientRect();

  // Destination: dock's list area (approximate)
  const destX = dockRect.left + 16;
  const destY = dockRect.top  + dockRect.height / 2;

  const clone = document.createElement('div');
  clone.className = 'dock-flight-clone';
  clone.textContent = chordName;
  clone.style.cssText = `
    position: fixed;
    z-index: 9999;
    left: ${srcRect.left}px;
    top: ${srcRect.top}px;
    width: ${srcRect.width}px;
    height: ${srcRect.height}px;
    font-family: var(--mono);
    font-size: .75rem;
    font-weight: 700;
    color: var(--accent);
    background: var(--card);
    border: 1.5px solid var(--accent);
    border-radius: .25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    opacity: 1;
    transform: translate(0, 0) scale(1);
    transition: transform 320ms cubic-bezier(.4,0,.2,1), opacity 320ms cubic-bezier(.4,0,.2,1);
    will-change: transform, opacity;
  `;

  document.body.appendChild(clone);

  const tx = destX - srcRect.left;
  const ty = destY - srcRect.top;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      clone.style.transform = `translate(${tx}px, ${ty}px) scale(0.6)`;
      clone.style.opacity   = '0';
    });
  });

  setTimeout(() => clone.remove(), 360);
}

function _dockBuildCard(chordName) {
  const card = document.createElement('div');
  card.className = 'dock-chord-card';
  card.dataset.chord = chordName;
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${chordName} chord — pinned`);

  const diagramWrap = document.createElement('div');
  diagramWrap.className = 'dock-card-diagram';
  diagramWrap.innerHTML = buildMiniDiagramSVG(chordName, _dockInstr);

  const nameEl = document.createElement('div');
  nameEl.className   = 'dock-card-name';
  nameEl.textContent = chordName;

  const unpinBtn = document.createElement('button');
  unpinBtn.className  = 'dock-card-unpin';
  unpinBtn.type       = 'button';
  unpinBtn.setAttribute('aria-label', `Unpin ${chordName}`);
  unpinBtn.textContent = '×';
  unpinBtn.addEventListener('click', e => {
    e.stopPropagation();
    dockUnpinChord(chordName);
  });

  card.appendChild(diagramWrap);
  card.appendChild(nameEl);
  card.appendChild(unpinBtn);

  // Click card → show drawer
  card.addEventListener('click', () => {
    showDrawer(chordName, card);
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDrawer(chordName, card); }
  });

  return card;
}

function _dockUpdateBadge() {
  if (!_dock) return;
  const badge = _dock.querySelector('.dock-badge');
  if (badge) badge.textContent = `${_dockPinned.length} chord${_dockPinned.length !== 1 ? 's' : ''}`;

  const emptyMsg = _dock.querySelector('.dock-empty');
  const list     = _dock.querySelector('.dock-chord-list');
  if (emptyMsg) emptyMsg.hidden = _dockPinned.length > 0;
  if (list)     list.hidden     = _dockPinned.length === 0;
}

function _dockRebuildAllCards() {
  if (!_dock) return;
  const list = _dock.querySelector('.dock-chord-list');
  if (!list) return;
  list.innerHTML = '';
  _dockPinned.forEach(chordName => {
    list.appendChild(_dockBuildCard(chordName));
  });
  _dockUpdateBadge();
}

/** Update all diagram SVGs when instrument changes */
function dockSetInstrument(instr) {
  _dockInstr = instr;
  if (!_dock) return;
  _dock.querySelectorAll('.dock-chord-card').forEach(card => {
    const chordName = card.dataset.chord;
    const diagramWrap = card.querySelector('.dock-card-diagram');
    if (diagramWrap && chordName) {
      diagramWrap.innerHTML = buildMiniDiagramSVG(chordName, instr);
    }
  });
}

function _dockCyclePosition() {
  const idx = DOCK_POSITIONS.indexOf(_dockPosition);
  _dockPosition = DOCK_POSITIONS[(idx + 1) % DOCK_POSITIONS.length];
  _dockApplyPosition();
}

function _dockApplyPosition() {
  if (!_dock) return;
  DOCK_POSITIONS.forEach(p => _dock.classList.remove(`dock-pos-${p}`));
  _dock.classList.add(`dock-pos-${_dockPosition}`);

  const posBtn = _dock.querySelector('.dock-pos-btn');
  const posLabels = { bottom: '⬆ Move to top', top: '➡ Move to sidebar', sidebar: '⬇ Move to bottom' };
  if (posBtn) posBtn.title = posLabels[_dockPosition] || 'Change position';
}

function dockMinimize() {
  if (!_dock) return;
  _dockMinimized = true;
  _dock.classList.add('dock-minimized');
}

function dockRestore() {
  if (!_dock) return;
  _dockMinimized = false;
  _dock.classList.remove('dock-minimized');
}

function dockToggleExpanded() {
  if (!_dock) return;
  _dockExpanded = !_dockExpanded;
  _dock.classList.toggle('dock-expanded', _dockExpanded);
  const expBtn = _dock.querySelector('.dock-expand-btn');
  if (expBtn) expBtn.textContent = _dockExpanded ? '▾' : '▸';
}

/** Build and attach the dock to the body */
function ensureDock() {
  if (_dock) return _dock;

  _dock = document.createElement('div');
  _dock.className = 'chord-dock';
  _dock.setAttribute('role', 'complementary');
  _dock.setAttribute('aria-label', 'Pinned chords dock');

  _dock.innerHTML =
    `<div class="dock-inner">
      <div class="dock-controls-bar">
        <button class="dock-badge" type="button" aria-label="Restore dock">0 chords</button>
        <div class="dock-toolbar-btns">
          <button class="dock-expand-btn" type="button" aria-label="Toggle expanded view" title="Show/hide diagrams">▸</button>
          <button class="dock-pos-btn"    type="button" aria-label="Cycle dock position"  title="Change position">⤢</button>
          <button class="dock-min-btn"    type="button" aria-label="Minimize dock"        title="Minimize">⌃</button>
          <button class="dock-clear-btn"  type="button" aria-label="Clear all pins"       title="Clear all">✕ Clear</button>
        </div>
      </div>
      <div class="dock-body">
        <div class="dock-empty" hidden>
          <span>Click any chord to pin it here for quick reference</span>
        </div>
        <div class="dock-chord-list" role="list" hidden></div>
      </div>
    </div>`;

  document.body.appendChild(_dock);

  // Controls
  _dock.querySelector('.dock-badge').addEventListener('click', dockRestore);
  _dock.querySelector('.dock-min-btn').addEventListener('click', dockMinimize);
  _dock.querySelector('.dock-expand-btn').addEventListener('click', dockToggleExpanded);
  _dock.querySelector('.dock-pos-btn').addEventListener('click', _dockCyclePosition);
  _dock.querySelector('.dock-clear-btn').addEventListener('click', () => {
    _dockPinned = [];
    dockSave();
    _dockRebuildAllCards();
  });

  _dockApplyPosition();

  // Scroll behaviour
  _dockScrollY = window.scrollY;
  const onScroll = () => {
    const y   = window.scrollY;
    const dy  = y - _dockScrollY;
    _dockScrollDir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    _dockScrollY   = y;

    // Ghost while scrolling
    if (!_dockScrolling) {
      _dockScrolling = true;
      _dock.classList.add('dock-ghosted');
    }

    // Auto-hide: down >60px → hide; any up → show
    if (_dockScrollDir > 0 && y > 60) {
      if (!_dockHidden) {
        _dockHidden = true;
        _dock.classList.add('dock-autohide');
      }
    } else if (_dockScrollDir < 0) {
      if (_dockHidden) {
        _dockHidden = false;
        _dock.classList.remove('dock-autohide');
      }
    }

    // Reset scroll timer
    clearTimeout(_dockScrollTimer);
    _dockScrollTimer = setTimeout(() => {
      _dockScrolling = false;
      _dock.classList.remove('dock-ghosted');
    }, 800);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  _dock._scrollHandler = onScroll;

  return _dock;
}

/** Clean up dock completely (called on route change) */
function destroyDock() {
  if (!_dock) return;
  if (_dock._scrollHandler) {
    window.removeEventListener('scroll', _dock._scrollHandler);
  }
  clearTimeout(_dockScrollTimer);
  _dock.remove();
  _dock = null;
  _dockPinned   = [];
  _dockMinimized = false;
  _dockExpanded  = false;
  _dockHidden    = false;
  _dockScrolling = false;
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD TOKEN EVENT DELEGATION
// ─────────────────────────────────────────────────────────────────────────

function attachChordEvents(container) {
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  container.addEventListener('click', e => {
    const token = e.target.closest('.chord-token');
    if (token) {
      e.stopPropagation();
      const chord = token.dataset.chord;

      if (isMobile()) {
        // Mobile: tap pins directly; already-pinned tap opens drawer
        if (dockIsPinned(chord)) {
          if (_activeChord === chord && _drawer?.classList.contains('open')) {
            hideDrawer();
          } else {
            showDrawer(chord, token);
          }
        } else {
          dockPinChord(chord, token);
        }
      } else {
        // Desktop: click pins chord (drawer already shown on hover via mouseenter)
        dockPinChord(chord, token);
        if (_activeChord === chord && _drawer?.classList.contains('open')) {
          hideDrawer();
        } else {
          showDrawer(chord, token);
        }
      }
      return;
    }

    const pill = e.target.closest('.chord-used-pill');
    if (pill) {
      e.stopPropagation();
      const chord = pill.dataset.chord;
      if (isMobile()) {
        if (dockIsPinned(chord)) {
          if (_activeChord === chord && _drawer?.classList.contains('open')) hideDrawer();
          else showDrawer(chord, pill);
        } else {
          dockPinChord(chord, pill);
        }
      } else {
        dockPinChord(chord, pill);
        if (_activeChord === chord && _drawer?.classList.contains('open')) hideDrawer();
        else showDrawer(chord, pill);
      }
    }
  });

  // Desktop hover → preview in drawer (no pinning)
  if (!isMobile()) {
    container.addEventListener('mouseenter', e => {
      const token = e.target.closest('.chord-token, .chord-used-pill');
      if (!token) return;
      const chord = token.dataset.chord;
      if (!chord) return;
      // Only preview if drawer is already open or chord is different
      if (!_drawer?.classList.contains('open') || _activeChord !== chord) {
        ensureDrawer();
        const nameEl = _drawer.querySelector('#cddChordName');
        if (nameEl) nameEl.textContent = chord;
        _activeChord = chord;
        _renderDrawerDiagram(chord);
        if (!_drawer.classList.contains('open')) {
          _drawer.classList.add('open', 'drawer-preview');
          // Don't lock scroll for preview-only hover
        }
      }
    }, true);

    container.addEventListener('mouseleave', e => {
      const token = e.target.closest('.chord-token, .chord-used-pill');
      if (!token) return;
      // If drawer is in preview mode (not pinned-open), close after short delay
      if (_drawer?.classList.contains('drawer-preview')) {
        setTimeout(() => {
          if (_drawer?.classList.contains('drawer-preview')) {
            _drawer.classList.remove('open', 'drawer-preview');
            _activeChord = null;
          }
        }, 300);
      }
    }, true);
  }
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
  if (display) display.textContent = `${Math.round((clamped / (FONT_SIZES.length - 1)) * 100)}%`;
  try { localStorage.setItem(LS_FONT_KEY, String(clamped)); } catch {}
  return clamped;
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

  // Clean up dock from any previous detail page
  destroyDock();

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

  // ── Page state ─────────────────────────────────────────────────────────
  let semitones   = 0;
  let fontIdx     = getFontIdx();
  let isScrolling = false;
  let scrollSpeed = getScrollSpeed();
  let instrument  = getSavedInstrument();

  // ── SEO ────────────────────────────────────────────────────────────────
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

  // ── Chords used ─────────────────────────────────────────────────────────
  const chordsUsed = (post.Chords_Used || '')
    .split(',').map(c => c.trim()).filter(Boolean);

  // ── Build page HTML ─────────────────────────────────────────────────────
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

  const metaCells = [
    post.Key            ? `<span data-label="Key"><strong id="currentKeyDisplay">${esc(post.Key)}</strong></span>` : '',
    post.Capo && post.Capo !== '0' ? `<span data-label="Capo"><strong>${esc(post.Capo)}</strong></span>` : '',
    post.BPM            ? `<span data-label="BPM"><strong>${esc(post.BPM)}</strong></span>` : '',
    post.Time_Signature ? `<span data-label="Time"><strong>${esc(post.Time_Signature)}</strong></span>` : '',
    post.Tuning         ? `<span data-label="Tuning"><strong>${esc(post.Tuning)}</strong></span>` : '',
    post.Date_Added     ? `<span data-label="Added"><strong>${esc(post.Date_Added)}</strong></span>` : '',
  ].filter(Boolean).join('');

  const instrIcons = {
    guitar:  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3L6 6M6 6L3 9M6 6C6 8.5 8 11 10.5 12M15 21L18 18M18 18L21 15M18 18C15.5 18 13 16 12 13.5M10.5 12C11.5 13.5 13 15.5 14.5 17L18 18M10.5 12L6 6"/></svg>`,
    ukulele: `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="5" ry="6"/><line x1="12" y1="10" x2="12" y2="4"/><line x1="10" y1="4" x2="14" y2="4"/></svg>`,
    piano:   `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="1"/><line x1="7" y1="4" x2="7" y2="14"/><line x1="12" y1="4" x2="12" y2="14"/><line x1="17" y1="4" x2="17" y2="14"/><rect x="5" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/><rect x="15" y="4" width="3" height="9" rx="1" fill="currentColor" stroke="none"/></svg>`,
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
        ${chordsUsedHTML}

        <div class="chord-capo-suggestion" id="capoSuggestion" hidden aria-live="polite"></div>
      </div>

      <!-- Controls bar -->
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
        <div class="ctrl-group" role="group" aria-label="Font size">
          <span class="ctrl-label">Size</span>
          <button class="ctrl-btn" id="fontDown" aria-label="Decrease font">A−</button>
          <span class="ctrl-fontsize-display" id="fontDisplay" aria-live="polite"></span>
          <button class="ctrl-btn" id="fontUp"   aria-label="Increase font">A+</button>
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
              aria-label="Scroll speed">
          </div>
        </div>

        <!-- Actions -->
        <div class="ctrl-actions">
          <button class="ctrl-action-btn" id="printBtn" aria-label="Print">🖨 Print</button>
          <button class="ctrl-action-btn" id="shareBtn" aria-label="Share">🔗 Share</button>
        </div>

      </div>

      <!-- Tab content -->
      <div class="tab-container" id="tabContainer" role="region" aria-label="Tab content">
        <div class="tab-header-strip">
          <span class="tab-header-label">Tab / Lyrics</span>
          <span class="tab-key-display" id="tabKeyDisplay">${post.Key ? `Key of ${esc(post.Key)}` : ''}</span>
        </div>
        <div class="tab-body" id="tabBody"></div>
      </div>
    </div>`;

  // ── DOM refs ───────────────────────────────────────────────────────────
  const tabBody       = document.getElementById('tabBody');
  const transposeDisp = document.getElementById('transposeDisplay');
  const keyDisp       = document.getElementById('currentKeyDisplay');
  const tabKeyDisp    = document.getElementById('tabKeyDisplay');
  const capoSug       = document.getElementById('capoSuggestion');
  const transposeDown = document.getElementById('transposeDown');
  const transposeUp   = document.getElementById('transposeUp');
  const fontDown      = document.getElementById('fontDown');
  const fontUp        = document.getElementById('fontUp');
  const fontDisp      = document.getElementById('fontDisplay');
  const scrollToggle  = document.getElementById('scrollToggle');
  const scrollSpeedEl = document.getElementById('scrollSpeed');
  const printBtn      = document.getElementById('printBtn');
  const shareBtn      = document.getElementById('shareBtn');
  const chordBack     = document.getElementById('chordBack');
  const tabContainer  = document.getElementById('tabContainer');
  const chordControls = document.getElementById('chordControls');
  const wrap          = document.getElementById('chordDetailWrap');

  // ── Set up Chord Dock ──────────────────────────────────────────────────
  _dockPinned  = dockLoad();
  _dockInstr   = instrument;
  ensureDock();
  _dockRebuildAllCards();

  // ── Tab refresh ─────────────────────────────────────────────────────────
  function refreshTab() {
    if (!tabBody) return;
    tabBody.innerHTML = renderTab(post.Tab_Content || '', semitones);

    const displayKey = semitones
      ? transposeKey(post.Key || '', semitones)
      : (post.Key || '');

    if (keyDisp)    keyDisp.textContent    = displayKey;
    if (tabKeyDisp) tabKeyDisp.textContent = displayKey ? `Key of ${displayKey}` : '';

    if (transposeDisp) {
      transposeDisp.textContent = semitones ? `${semitones > 0 ? '+' : ''}${semitones}` : '0';
    }

    if (transposeDown) transposeDown.disabled = semitones <= -6;
    if (transposeUp)   transposeUp.disabled   = semitones >= 6;

    if (capoSug) {
      const sug = capoSuggestion(post.Key || '', post.Capo || '0', semitones);
      if (sug) {
        capoSug.removeAttribute('hidden');
        capoSug.innerHTML =
          `🎸 Play <strong>${esc(sug.playKey)}</strong> shapes with capo on fret ` +
          `<strong>${sug.capoFret}</strong> → sounds in <strong>${esc(sug.soundsIn)}</strong>`;
      } else {
        capoSug.setAttribute('hidden', '');
        capoSug.innerHTML = '';
      }
    }

    if (tabContainer) attachChordEvents(tabContainer);
  }

  // Init font
  fontIdx = setFontIdx(tabBody, fontIdx, fontDisp);

  // Sync drawer with saved instrument preference
  setDrawerInstrument(instrument);

  // Initial render
  refreshTab();

  // Attach chord-used pills
  if (wrap) attachChordEvents(wrap);

  // ── Transpose ──────────────────────────────────────────────────────────
  transposeDown?.addEventListener('click', () => {
    if (semitones > -6) { semitones--; refreshTab(); }
  });
  transposeUp?.addEventListener('click', () => {
    if (semitones < 6)  { semitones++; refreshTab(); }
  });

  // ── Instrument switcher ────────────────────────────────────────────────
  chordControls?.addEventListener('click', e => {
    const btn = e.target.closest('.instr-btn');
    if (!btn) return;
    const instr = btn.dataset.instr;
    if (instr === instrument) return;
    instrument = instr;
    saveInstrument(instr);
    setDrawerInstrument(instr);
    dockSetInstrument(instr);

    chordControls.querySelectorAll('.instr-btn').forEach(b => {
      const active = b.dataset.instr === instr;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
  });

  // ── Font size ──────────────────────────────────────────────────────────
  fontDown?.addEventListener('click', () => {
    fontIdx = setFontIdx(tabBody, fontIdx - 1, fontDisp);
  });
  fontUp?.addEventListener('click', () => {
    fontIdx = setFontIdx(tabBody, fontIdx + 1, fontDisp);
  });

  // ── Auto-scroll ────────────────────────────────────────────────────────
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

  // ── Print ──────────────────────────────────────────────────────────────
  printBtn?.addEventListener('click', () => window.print());

  // ── Share ──────────────────────────────────────────────────────────────
  shareBtn?.addEventListener('click', async () => {
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
  });

  // ── Back — cleanup ─────────────────────────────────────────────────────
  const cleanup = () => {
    stopScroll();
    hideDrawer();
    destroyDock();
  };

  chordBack?.addEventListener('click', () => {
    cleanup();
    import('../router.js').then(({ navigate }) => navigate('/chords'));
  });

  window.addEventListener('popstate', cleanup, { once: true });

  watchReveals();
}