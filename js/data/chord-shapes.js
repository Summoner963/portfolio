/**
 * js/data/chord-shapes.js
 *
 * Chord shape / voicing data for three instruments.
 *
 * Exports (named):
 *   GUITAR_SHAPES   — { frets, fingers, barre?, baseFret }
 *   UKULELE_SHAPES  — { frets, fingers, barre?, baseFret }  (4 strings: G-C-E-A high→low)
 *   PIANO_SHAPES    — { notes: string[], label: string }    (MIDI-style note names)
 *
 * Default export:
 *   CHORD_SHAPES    — alias for GUITAR_SHAPES (backwards-compat)
 *
 * ─── Guitar array order ───────────────────────────────────────────────────
 * [e, B, G, D, A, E]  (index 0 = highest string = rightmost in standard tab)
 *
 * ─── Ukulele array order ─────────────────────────────────────────────────
 * [A, E, C, G]  (index 0 = highest = A4 string)
 * Standard reentrant tuning: G4-C4-E4-A4
 * Array stored high→low so index 0 is A, 1 is E, 2 is C, 3 is G
 *
 * ─── Piano notes ─────────────────────────────────────────────────────────
 * Notes are pitch-class strings: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
 * The SVG renderer maps them onto a one-octave keyboard (C–B).
 * Enharmonic flats are pre-resolved to sharps for rendering lookup.
 */

// ══════════════════════════════════════════════════════════════════════════
//  GUITAR SHAPES
//  Format: { frets:[e,B,G,D,A,E], fingers:[e,B,G,D,A,E], barre?, baseFret }
// ══════════════════════════════════════════════════════════════════════════

const GUITAR_SHAPES = {

  // ── C ──────────────────────────────────────────────────────────────────
  'C':      { frets:[0,1,0,2,3,-1], fingers:[0,1,0,2,3,0], baseFret:1 },
  'Cm':     { frets:[3,4,5,5,3,-1], fingers:[1,2,4,3,1,0], barre:{fret:3,from:0,to:4}, baseFret:3 },
  'C7':     { frets:[0,1,3,2,3,-1], fingers:[0,1,3,2,4,0], baseFret:1 },
  'Cmaj7':  { frets:[0,0,0,2,3,-1], fingers:[0,0,0,2,3,0], baseFret:1 },
  'Cm7':    { frets:[3,4,3,5,3,-1], fingers:[1,2,1,3,1,0], barre:{fret:3,from:0,to:4}, baseFret:3 },
  'Csus2':  { frets:[3,3,0,0,3,-1], fingers:[3,4,0,0,2,0], baseFret:1 },
  'Csus4':  { frets:[1,1,0,3,3,-1], fingers:[1,1,0,3,4,0], baseFret:1 },
  'Cadd9':  { frets:[0,3,0,2,3,-1], fingers:[0,4,0,2,3,0], baseFret:1 },
  'C5':     { frets:[-1,-1,5,5,3,-1], fingers:[0,0,3,2,1,0], baseFret:3 },

  // ── C# / Db ────────────────────────────────────────────────────────────
  'C#':     { frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#m':    { frets:[4,5,6,6,4,4], fingers:[1,2,4,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#7':    { frets:[4,4,6,4,4,4], fingers:[1,1,3,1,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#maj7': { frets:[4,4,5,6,4,4], fingers:[1,1,2,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#m7':   { frets:[4,4,6,4,4,4], fingers:[1,1,3,1,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#sus2': { frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#sus4': { frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#add9': { frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'C#5':    { frets:[-1,-1,6,6,4,4], fingers:[0,0,4,3,2,1], baseFret:4 },

  // ── D ──────────────────────────────────────────────────────────────────
  'D':      { frets:[2,3,2,0,-1,-1], fingers:[1,3,2,0,0,0], baseFret:1 },
  'Dm':     { frets:[1,3,2,0,-1,-1], fingers:[1,3,2,0,0,0], baseFret:1 },
  'D7':     { frets:[2,1,2,0,-1,-1], fingers:[2,1,3,0,0,0], baseFret:1 },
  'Dmaj7':  { frets:[2,2,2,0,-1,-1], fingers:[1,2,3,0,0,0], baseFret:1 },
  'Dm7':    { frets:[1,1,2,0,-1,-1], fingers:[1,1,2,0,0,0], baseFret:1 },
  'Dsus2':  { frets:[0,3,2,0,-1,-1], fingers:[0,3,2,0,0,0], baseFret:1 },
  'Dsus4':  { frets:[3,3,2,0,-1,-1], fingers:[3,4,2,0,0,0], baseFret:1 },
  'Dadd9':  { frets:[0,3,2,0,-1,-1], fingers:[0,3,2,0,0,0], baseFret:1 },
  'D5':     { frets:[-1,-1,-1,0,0,-1], fingers:[0,0,0,2,1,0], baseFret:1 },

  // ── D# / Eb ────────────────────────────────────────────────────────────
  'D#':     { frets:[3,4,3,1,1,1], fingers:[3,4,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#m':    { frets:[2,4,3,1,1,1], fingers:[2,4,3,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#7':    { frets:[3,2,3,1,1,1], fingers:[3,2,4,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#maj7': { frets:[3,3,3,1,1,1], fingers:[3,3,4,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#m7':   { frets:[2,2,3,1,1,1], fingers:[2,2,3,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#sus2': { frets:[4,4,3,1,1,1], fingers:[4,3,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#sus4': { frets:[4,4,3,1,1,1], fingers:[4,3,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#add9': { frets:[3,4,3,1,1,1], fingers:[3,4,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'D#5':    { frets:[-1,-1,-1,1,1,-1], fingers:[0,0,0,3,1,0], baseFret:1 },

  // ── E ──────────────────────────────────────────────────────────────────
  'E':      { frets:[0,0,1,2,2,0], fingers:[0,0,1,3,2,0], baseFret:1 },
  'Em':     { frets:[0,0,0,2,2,0], fingers:[0,0,0,2,3,0], baseFret:1 },
  'E7':     { frets:[0,3,1,2,2,0], fingers:[0,3,1,2,2,0], baseFret:1 },
  'Emaj7':  { frets:[0,0,1,1,2,0], fingers:[0,0,2,1,3,0], baseFret:1 },
  'Em7':    { frets:[0,3,0,2,2,0], fingers:[0,3,0,1,2,0], baseFret:1 },
  'Esus2':  { frets:[0,0,2,2,2,0], fingers:[0,0,2,3,4,0], baseFret:1 },
  'Esus4':  { frets:[0,0,2,2,2,0], fingers:[0,0,1,2,3,0], baseFret:1 },
  'Eadd9':  { frets:[0,0,1,4,2,0], fingers:[0,0,1,4,2,0], baseFret:1 },
  'E5':     { frets:[-1,-1,-1,2,2,0], fingers:[0,0,0,3,2,0], baseFret:1 },

  // ── F ──────────────────────────────────────────────────────────────────
  'F':      { frets:[1,1,2,3,3,1], fingers:[1,1,2,4,3,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'Fm':     { frets:[1,1,1,3,3,1], fingers:[1,1,1,4,3,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'F7':     { frets:[1,1,2,1,3,1], fingers:[1,1,2,1,3,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'Fmaj7':  { frets:[0,1,2,3,3,1], fingers:[0,1,2,4,3,1], baseFret:1 },
  'Fm7':    { frets:[1,1,1,1,3,1], fingers:[1,1,1,1,3,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'Fsus2':  { frets:[1,1,3,3,1,1], fingers:[1,1,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'Fsus4':  { frets:[1,1,3,3,1,1], fingers:[1,1,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'Fadd9':  { frets:[1,1,2,3,3,1], fingers:[1,1,2,4,3,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'F5':     { frets:[-1,-1,-1,3,3,1], fingers:[0,0,0,4,3,1], baseFret:1 },

  // ── F# / Gb ────────────────────────────────────────────────────────────
  'F#':     { frets:[2,2,3,4,4,2], fingers:[1,1,2,4,3,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#m':    { frets:[2,2,2,4,4,2], fingers:[1,1,1,4,3,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#7':    { frets:[2,2,3,2,4,2], fingers:[1,1,2,1,3,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#maj7': { frets:[2,2,3,3,4,2], fingers:[1,1,2,3,4,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#m7':   { frets:[2,2,2,2,4,2], fingers:[1,1,1,1,3,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#sus2': { frets:[2,2,4,4,2,2], fingers:[1,1,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#sus4': { frets:[2,2,4,4,2,2], fingers:[1,1,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#add9': { frets:[2,2,3,4,4,2], fingers:[1,1,2,4,3,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'F#5':    { frets:[-1,-1,-1,4,4,2], fingers:[0,0,0,4,3,1], baseFret:2 },

  // ── G ──────────────────────────────────────────────────────────────────
  'G':      { frets:[3,0,0,0,2,3], fingers:[3,0,0,0,1,4], baseFret:1 },
  'Gm':     { frets:[3,3,3,5,5,3], fingers:[1,1,1,4,3,1], barre:{fret:3,from:0,to:5}, baseFret:3 },
  'G7':     { frets:[1,0,0,0,2,3], fingers:[1,0,0,0,2,3], baseFret:1 },
  'Gmaj7':  { frets:[2,0,0,0,2,3], fingers:[2,0,0,0,1,3], baseFret:1 },
  'Gm7':    { frets:[3,3,3,3,5,3], fingers:[1,1,1,1,3,1], barre:{fret:3,from:0,to:5}, baseFret:3 },
  'Gsus2':  { frets:[3,0,0,0,0,3], fingers:[2,0,0,0,0,3], baseFret:1 },
  'Gsus4':  { frets:[3,1,0,0,0,3], fingers:[3,1,0,0,0,4], baseFret:1 },
  'Gadd9':  { frets:[3,0,2,0,0,3], fingers:[3,0,2,0,0,4], baseFret:1 },
  'G5':     { frets:[-1,-1,-1,0,2,3], fingers:[0,0,0,0,1,2], baseFret:1 },

  // ── G# / Ab ────────────────────────────────────────────────────────────
  'G#':     { frets:[4,4,5,6,6,4], fingers:[1,1,2,4,3,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#m':    { frets:[4,4,4,6,6,4], fingers:[1,1,1,4,3,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#7':    { frets:[4,4,5,4,6,4], fingers:[1,1,2,1,3,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#maj7': { frets:[4,4,5,5,6,4], fingers:[1,1,2,3,4,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#m7':   { frets:[4,4,4,4,6,4], fingers:[1,1,1,1,3,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#sus2': { frets:[4,4,6,6,4,4], fingers:[1,1,4,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#sus4': { frets:[4,4,6,6,4,4], fingers:[1,1,4,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#add9': { frets:[4,4,5,6,6,4], fingers:[1,1,2,4,3,1], barre:{fret:4,from:0,to:5}, baseFret:4 },
  'G#5':    { frets:[-1,-1,-1,6,6,4], fingers:[0,0,0,4,3,1], baseFret:4 },

  // ── A ──────────────────────────────────────────────────────────────────
  'A':      { frets:[0,2,2,2,0,-1], fingers:[0,2,3,1,0,0], baseFret:1 },
  'Am':     { frets:[0,1,2,2,0,-1], fingers:[0,1,3,2,0,0], baseFret:1 },
  'A7':     { frets:[0,2,0,2,0,-1], fingers:[0,2,0,3,0,0], baseFret:1 },
  'Amaj7':  { frets:[0,2,1,2,0,-1], fingers:[0,3,1,2,0,0], baseFret:1 },
  'Am7':    { frets:[0,1,0,2,0,-1], fingers:[0,1,0,2,0,0], baseFret:1 },
  'Asus2':  { frets:[0,0,2,2,0,-1], fingers:[0,0,2,3,0,0], baseFret:1 },
  'Asus4':  { frets:[0,3,2,2,0,-1], fingers:[0,4,2,1,0,0], baseFret:1 },
  'Aadd9':  { frets:[0,2,2,4,0,-1], fingers:[0,2,3,4,0,0], baseFret:1 },
  'A5':     { frets:[-1,-1,-1,2,0,-1], fingers:[0,0,0,2,0,0], baseFret:1 },

  // ── A# / Bb ────────────────────────────────────────────────────────────
  'A#':     { frets:[1,3,3,3,1,1], fingers:[1,3,4,2,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#m':    { frets:[1,2,3,3,1,1], fingers:[1,2,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#7':    { frets:[1,3,1,3,1,1], fingers:[1,3,1,4,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#maj7': { frets:[1,3,2,3,1,1], fingers:[1,3,2,4,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#m7':   { frets:[1,2,1,3,1,1], fingers:[1,2,1,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#sus2': { frets:[1,1,3,3,1,1], fingers:[1,1,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#sus4': { frets:[1,4,3,3,1,1], fingers:[1,4,3,2,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#add9': { frets:[1,3,3,3,1,1], fingers:[1,3,4,2,1,1], barre:{fret:1,from:0,to:5}, baseFret:1 },
  'A#5':    { frets:[-1,-1,-1,3,1,1], fingers:[0,0,0,4,2,1], baseFret:1 },

  // ── B ──────────────────────────────────────────────────────────────────
  'B':      { frets:[2,4,4,4,2,2], fingers:[1,3,4,2,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'Bm':     { frets:[2,3,4,4,2,2], fingers:[1,2,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'B7':     { frets:[0,2,1,2,2,-1], fingers:[0,3,1,2,2,0], baseFret:1 },
  'Bmaj7':  { frets:[2,4,3,4,2,2], fingers:[1,3,2,4,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'Bm7':    { frets:[2,3,2,4,2,2], fingers:[1,2,1,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'Bsus2':  { frets:[2,2,4,4,2,2], fingers:[1,1,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'Bsus4':  { frets:[2,5,4,4,2,2], fingers:[1,4,3,2,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'Badd9':  { frets:[2,4,4,4,2,2], fingers:[1,3,4,2,1,1], barre:{fret:2,from:0,to:5}, baseFret:2 },
  'B5':     { frets:[-1,-1,-1,4,2,2], fingers:[0,0,0,4,2,1], baseFret:2 },
};

// Guitar enharmonic aliases
const _GE = [
  ['Db','C#'],['Db7','C#7'],['Dbm','C#m'],['Dbmaj7','C#maj7'],['Dbm7','C#m7'],
  ['Dbsus2','C#sus2'],['Dbsus4','C#sus4'],['Dbadd9','C#add9'],['Db5','C#5'],
  ['Eb','D#'],['Eb7','D#7'],['Ebm','D#m'],['Ebmaj7','D#maj7'],['Ebm7','D#m7'],
  ['Ebsus2','D#sus2'],['Ebsus4','D#sus4'],['Ebadd9','D#add9'],['Eb5','D#5'],
  ['Gb','F#'],['Gb7','F#7'],['Gbm','F#m'],['Gbmaj7','F#maj7'],['Gbm7','F#m7'],
  ['Gbsus2','F#sus2'],['Gbsus4','F#sus4'],['Gbadd9','F#add9'],['Gb5','F#5'],
  ['Ab','G#'],['Ab7','G#7'],['Abm','G#m'],['Abmaj7','G#maj7'],['Abm7','G#m7'],
  ['Absus2','G#sus2'],['Absus4','G#sus4'],['Abadd9','G#add9'],['Ab5','G#5'],
  ['Bb','A#'],['Bb7','A#7'],['Bbm','A#m'],['Bbmaj7','A#maj7'],['Bbm7','A#m7'],
  ['Bbsus2','A#sus2'],['Bbsus4','A#sus4'],['Bbadd9','A#add9'],['Bb5','A#5'],
];
_GE.forEach(([alias, canonical]) => { GUITAR_SHAPES[alias] = GUITAR_SHAPES[canonical]; });

// ══════════════════════════════════════════════════════════════════════════
//  UKULELE SHAPES
//  Tuning: G4-C4-E4-A4 (reentrant)
//  Array order: [A, E, C, G]  (index 0 = A = highest-pitch string displayed left)
//  fret 0 = open, -1 = muted (unusual on uke but supported)
// ══════════════════════════════════════════════════════════════════════════

const UKULELE_SHAPES = {

  // ── C ──────────────────────────────────────────────────────────────────
  'C':      { frets:[0,0,0,3], fingers:[0,0,0,3], baseFret:1 },
  'Cm':     { frets:[3,3,3,5], fingers:[1,1,1,4], barre:{fret:3,from:0,to:2}, baseFret:3 },
  'C7':     { frets:[0,0,0,1], fingers:[0,0,0,1], baseFret:1 },
  'Cmaj7':  { frets:[0,0,0,2], fingers:[0,0,0,2], baseFret:1 },
  'Cm7':    { frets:[3,3,3,3], fingers:[1,1,1,1], barre:{fret:3,from:0,to:3}, baseFret:3 },
  'Csus2':  { frets:[0,2,0,0], fingers:[0,2,0,0], baseFret:1 },
  'Csus4':  { frets:[0,0,1,3], fingers:[0,0,1,3], baseFret:1 },
  'Cadd9':  { frets:[0,2,0,3], fingers:[0,2,0,3], baseFret:1 },
  'C5':     { frets:[0,-1,0,3], fingers:[0,0,0,3], baseFret:1 },

  // ── C# / Db ────────────────────────────────────────────────────────────
  'C#':     { frets:[1,1,1,4], fingers:[1,1,1,4], barre:{fret:1,from:0,to:2}, baseFret:1 },
  'C#m':    { frets:[4,4,4,6], fingers:[1,1,1,4], barre:{fret:4,from:0,to:2}, baseFret:4 },
  'C#7':    { frets:[1,1,1,2], fingers:[1,1,1,2], barre:{fret:1,from:0,to:2}, baseFret:1 },
  'C#maj7': { frets:[1,1,1,3], fingers:[1,1,1,3], barre:{fret:1,from:0,to:2}, baseFret:1 },
  'C#m7':   { frets:[4,4,4,4], fingers:[1,1,1,1], barre:{fret:4,from:0,to:3}, baseFret:4 },
  'C#sus2': { frets:[1,3,1,1], fingers:[1,3,1,1], baseFret:1 },
  'C#sus4': { frets:[1,1,2,4], fingers:[1,1,2,4], baseFret:1 },
  'C#add9': { frets:[1,1,1,4], fingers:[1,1,1,4], barre:{fret:1,from:0,to:2}, baseFret:1 },
  'C#5':    { frets:[1,-1,1,4], fingers:[1,0,1,4], baseFret:1 },

  // ── D ──────────────────────────────────────────────────────────────────
  'D':      { frets:[2,2,2,0], fingers:[1,2,3,0], baseFret:1 },
  'Dm':     { frets:[2,2,1,0], fingers:[2,3,1,0], baseFret:1 },
  'D7':     { frets:[2,2,2,3], fingers:[1,2,3,4], baseFret:1 },
  'Dmaj7':  { frets:[2,2,2,4], fingers:[1,2,3,4], baseFret:2 },
  'Dm7':    { frets:[2,2,1,3], fingers:[2,3,1,4], baseFret:1 },
  'Dsus2':  { frets:[2,2,0,0], fingers:[1,2,0,0], baseFret:1 },
  'Dsus4':  { frets:[0,2,3,0], fingers:[0,1,3,0], baseFret:1 },
  'Dadd9':  { frets:[2,4,2,0], fingers:[2,4,1,0], baseFret:2 },
  'D5':     { frets:[2,-1,2,0], fingers:[2,0,1,0], baseFret:1 },

  // ── D# / Eb ────────────────────────────────────────────────────────────
  'D#':     { frets:[3,3,3,1], fingers:[2,3,4,1], barre:{fret:1,from:3,to:3}, baseFret:1 },
  'D#m':    { frets:[3,3,2,1], fingers:[3,4,2,1], baseFret:1 },
  'D#7':    { frets:[3,3,3,4], fingers:[1,2,3,4], baseFret:3 },
  'D#maj7': { frets:[3,3,3,5], fingers:[1,2,3,4], baseFret:3 },
  'D#m7':   { frets:[3,3,2,4], fingers:[2,3,1,4], baseFret:3 },
  'D#sus2': { frets:[3,3,1,1], fingers:[2,3,1,1], barre:{fret:1,from:2,to:3}, baseFret:1 },
  'D#sus4': { frets:[1,3,4,1], fingers:[1,3,4,1], baseFret:1 },
  'D#add9': { frets:[3,3,3,1], fingers:[2,3,4,1], baseFret:1 },
  'D#5':    { frets:[3,-1,3,1], fingers:[3,0,2,1], baseFret:1 },

  // ── E ──────────────────────────────────────────────────────────────────
  'E':      { frets:[2,4,4,2], fingers:[1,3,4,1], barre:{fret:2,from:0,to:3}, baseFret:2 },
  'Em':     { frets:[0,4,3,2], fingers:[0,4,3,2], baseFret:2 },
  'E7':     { frets:[1,2,0,2], fingers:[1,3,0,2], baseFret:1 },
  'Emaj7':  { frets:[1,3,0,2], fingers:[1,3,0,2], baseFret:1 },
  'Em7':    { frets:[0,2,0,2], fingers:[0,2,0,3], baseFret:1 },
  'Esus2':  { frets:[2,4,2,2], fingers:[1,4,1,1], barre:{fret:2,from:0,to:3}, baseFret:2 },
  'Esus4':  { frets:[2,2,0,2], fingers:[2,3,0,1], baseFret:2 },
  'Eadd9':  { frets:[2,4,2,4], fingers:[1,3,1,4], baseFret:2 },
  'E5':     { frets:[2,-1,4,2], fingers:[1,0,4,1], baseFret:2 },

  // ── F ──────────────────────────────────────────────────────────────────
  'F':      { frets:[0,1,1,2], fingers:[0,1,1,2], barre:{fret:1,from:1,to:2}, baseFret:1 },
  'Fm':     { frets:[1,1,0,1], fingers:[2,3,0,1], barre:{fret:1,from:0,to:3}, baseFret:1 },
  'F7':     { frets:[0,1,1,0], fingers:[0,1,2,0], baseFret:1 },
  'Fmaj7':  { frets:[0,1,1,3], fingers:[0,1,1,3], baseFret:1 },
  'Fm7':    { frets:[1,1,0,3], fingers:[1,1,0,3], baseFret:1 },
  'Fsus2':  { frets:[0,3,1,0], fingers:[0,3,1,0], baseFret:1 },
  'Fsus4':  { frets:[0,1,3,0], fingers:[0,1,3,0], baseFret:1 },
  'Fadd9':  { frets:[0,1,1,2], fingers:[0,1,2,3], baseFret:1 },
  'F5':     { frets:[0,-1,1,2], fingers:[0,0,1,2], baseFret:1 },

  // ── F# / Gb ────────────────────────────────────────────────────────────
  'F#':     { frets:[1,2,2,3], fingers:[1,2,3,4], baseFret:1 },
  'F#m':    { frets:[2,2,1,2], fingers:[2,3,1,4], barre:{fret:2,from:0,to:3}, baseFret:2 },
  'F#7':    { frets:[1,2,2,0], fingers:[1,2,3,0], baseFret:1 },
  'F#maj7': { frets:[1,2,2,4], fingers:[1,2,3,4], baseFret:1 },
  'F#m7':   { frets:[2,2,1,0], fingers:[2,3,1,0], baseFret:2 },
  'F#sus2': { frets:[1,4,2,1], fingers:[1,4,2,1], baseFret:1 },
  'F#sus4': { frets:[1,2,4,1], fingers:[1,2,4,1], baseFret:1 },
  'F#add9': { frets:[1,2,2,3], fingers:[1,2,3,4], baseFret:1 },
  'F#5':    { frets:[1,-1,2,3], fingers:[1,0,2,4], baseFret:1 },

  // ── G ──────────────────────────────────────────────────────────────────
  'G':      { frets:[2,3,2,0], fingers:[2,3,1,0], baseFret:1 },
  'Gm':     { frets:[0,2,3,1], fingers:[0,2,4,1], baseFret:1 },
  'G7':     { frets:[2,1,2,0], fingers:[2,1,3,0], baseFret:1 },
  'Gmaj7':  { frets:[2,2,2,0], fingers:[2,3,1,0], baseFret:2 },
  'Gm7':    { frets:[0,2,1,1], fingers:[0,3,1,2], baseFret:1 },
  'Gsus2':  { frets:[0,2,2,0], fingers:[0,1,2,0], baseFret:1 },
  'Gsus4':  { frets:[0,2,3,3], fingers:[0,1,2,3], baseFret:1 },
  'Gadd9':  { frets:[2,3,2,2], fingers:[2,4,1,3], baseFret:2 },
  'G5':     { frets:[2,-1,2,0], fingers:[2,0,1,0], baseFret:1 },

  // ── G# / Ab ────────────────────────────────────────────────────────────
  'G#':     { frets:[3,4,3,1], fingers:[3,4,2,1], barre:{fret:1,from:3,to:3}, baseFret:1 },
  'G#m':    { frets:[1,3,4,2], fingers:[1,3,4,2], baseFret:1 },
  'G#7':    { frets:[3,2,3,1], fingers:[3,2,4,1], baseFret:1 },
  'G#maj7': { frets:[3,3,3,1], fingers:[2,3,4,1], baseFret:1 },
  'G#m7':   { frets:[1,3,2,2], fingers:[1,4,2,3], baseFret:1 },
  'G#sus2': { frets:[1,3,3,1], fingers:[1,3,4,1], barre:{fret:1,from:0,to:3}, baseFret:1 },
  'G#sus4': { frets:[1,3,4,4], fingers:[1,2,3,4], baseFret:1 },
  'G#add9': { frets:[3,4,3,1], fingers:[3,4,2,1], baseFret:1 },
  'G#5':    { frets:[3,-1,3,1], fingers:[3,0,2,1], baseFret:1 },

  // ── A ──────────────────────────────────────────────────────────────────
  'A':      { frets:[0,1,0,0], fingers:[0,1,0,0], baseFret:1 },
  'Am':     { frets:[0,0,0,2], fingers:[0,0,0,2], baseFret:1 },
  'A7':     { frets:[0,1,0,2], fingers:[0,1,0,2], baseFret:1 },
  'Amaj7':  { frets:[0,1,0,1], fingers:[0,1,0,2], baseFret:1 },
  'Am7':    { frets:[0,0,0,0], fingers:[0,0,0,0], baseFret:1 },
  'Asus2':  { frets:[2,1,0,0], fingers:[2,1,0,0], baseFret:1 },
  'Asus4':  { frets:[0,2,0,0], fingers:[0,2,0,0], baseFret:1 },
  'Aadd9':  { frets:[2,1,0,0], fingers:[2,1,0,0], baseFret:1 },
  'A5':     { frets:[0,-1,0,0], fingers:[0,0,0,0], baseFret:1 },

  // ── A# / Bb ────────────────────────────────────────────────────────────
  'A#':     { frets:[1,2,1,1], fingers:[1,3,2,1], barre:{fret:1,from:0,to:3}, baseFret:1 },
  'A#m':    { frets:[1,1,1,3], fingers:[1,1,1,3], barre:{fret:1,from:0,to:2}, baseFret:1 },
  'A#7':    { frets:[1,2,1,3], fingers:[1,2,1,3], baseFret:1 },
  'A#maj7': { frets:[1,2,1,0], fingers:[1,3,2,0], baseFret:1 },
  'A#m7':   { frets:[1,1,1,1], fingers:[1,1,1,1], barre:{fret:1,from:0,to:3}, baseFret:1 },
  'A#sus2': { frets:[3,2,1,1], fingers:[3,2,1,1], baseFret:1 },
  'A#sus4': { frets:[1,3,1,1], fingers:[1,3,1,1], barre:{fret:1,from:0,to:3}, baseFret:1 },
  'A#add9': { frets:[1,2,1,1], fingers:[1,3,2,1], barre:{fret:1,from:0,to:3}, baseFret:1 },
  'A#5':    { frets:[1,-1,1,1], fingers:[1,0,1,1], baseFret:1 },

  // ── B ──────────────────────────────────────────────────────────────────
  'B':      { frets:[2,3,2,2], fingers:[2,3,1,1], barre:{fret:2,from:0,to:3}, baseFret:2 },
  'Bm':     { frets:[2,2,2,4], fingers:[1,1,1,4], barre:{fret:2,from:0,to:2}, baseFret:2 },
  'B7':     { frets:[2,3,2,0], fingers:[2,3,1,0], baseFret:2 },
  'Bmaj7':  { frets:[2,3,2,1], fingers:[2,4,3,1], baseFret:2 },
  'Bm7':    { frets:[2,2,2,2], fingers:[1,1,1,1], barre:{fret:2,from:0,to:3}, baseFret:2 },
  'Bsus2':  { frets:[4,3,2,2], fingers:[4,3,1,1], baseFret:2 },
  'Bsus4':  { frets:[2,4,2,2], fingers:[1,4,1,1], barre:{fret:2,from:0,to:3}, baseFret:2 },
  'Badd9':  { frets:[2,3,2,2], fingers:[2,3,1,1], barre:{fret:2,from:0,to:3}, baseFret:2 },
  'B5':     { frets:[2,-1,2,2], fingers:[1,0,2,3], baseFret:2 },
};

// Ukulele enharmonic aliases
const _UE = [
  ['Db','C#'],['Dbm','C#m'],['Db7','C#7'],['Dbmaj7','C#maj7'],['Dbm7','C#m7'],
  ['Dbsus2','C#sus2'],['Dbsus4','C#sus4'],['Dbadd9','C#add9'],['Db5','C#5'],
  ['Eb','D#'],['Ebm','D#m'],['Eb7','D#7'],['Ebmaj7','D#maj7'],['Ebm7','D#m7'],
  ['Ebsus2','D#sus2'],['Ebsus4','D#sus4'],['Ebadd9','D#add9'],['Eb5','D#5'],
  ['Gb','F#'],['Gbm','F#m'],['Gb7','F#7'],['Gbmaj7','F#maj7'],['Gbm7','F#m7'],
  ['Gbsus2','F#sus2'],['Gbsus4','F#sus4'],['Gbadd9','F#add9'],['Gb5','F#5'],
  ['Ab','G#'],['Abm','G#m'],['Ab7','G#7'],['Abmaj7','G#maj7'],['Abm7','G#m7'],
  ['Absus2','G#sus2'],['Absus4','G#sus4'],['Abadd9','G#add9'],['Ab5','G#5'],
  ['Bb','A#'],['Bbm','A#m'],['Bb7','A#7'],['Bbmaj7','A#maj7'],['Bbm7','A#m7'],
  ['Bbsus2','A#sus2'],['Bbsus4','A#sus4'],['Bbadd9','A#add9'],['Bb5','A#5'],
];
_UE.forEach(([alias, canonical]) => { UKULELE_SHAPES[alias] = UKULELE_SHAPES[canonical]; });

// ══════════════════════════════════════════════════════════════════════════
//  PIANO SHAPES
//  notes: array of pitch-class strings (sharps only, for renderer lookup)
//  label: friendly chord name for display
//  Notes are the pitch classes that form the chord — renderer shows them
//  on a one-octave keyboard (C through B).
// ══════════════════════════════════════════════════════════════════════════

const PIANO_SHAPES = {
  // ── C ──────────────────────────────────────────────────────────────────
  'C':      { notes:['C','E','G'],              label:'C major' },
  'Cm':     { notes:['C','D#','G'],             label:'C minor' },
  'C7':     { notes:['C','E','G','A#'],         label:'C dominant 7th' },
  'Cmaj7':  { notes:['C','E','G','B'],          label:'C major 7th' },
  'Cm7':    { notes:['C','D#','G','A#'],        label:'C minor 7th' },
  'Csus2':  { notes:['C','D','G'],              label:'C sus2' },
  'Csus4':  { notes:['C','F','G'],              label:'C sus4' },
  'Cadd9':  { notes:['C','D','E','G'],          label:'C add9' },
  'C5':     { notes:['C','G'],                  label:'C power' },

  // ── C# / Db ────────────────────────────────────────────────────────────
  'C#':     { notes:['C#','F','G#'],            label:'C♯ major' },
  'C#m':    { notes:['C#','E','G#'],            label:'C♯ minor' },
  'C#7':    { notes:['C#','F','G#','B'],        label:'C♯ dominant 7th' },
  'C#maj7': { notes:['C#','F','G#','C'],        label:'C♯ major 7th' },
  'C#m7':   { notes:['C#','E','G#','B'],        label:'C♯ minor 7th' },
  'C#sus2': { notes:['C#','D#','G#'],           label:'C♯ sus2' },
  'C#sus4': { notes:['C#','F#','G#'],           label:'C♯ sus4' },
  'C#add9': { notes:['C#','D#','F','G#'],       label:'C♯ add9' },
  'C#5':    { notes:['C#','G#'],                label:'C♯ power' },

  // ── D ──────────────────────────────────────────────────────────────────
  'D':      { notes:['D','F#','A'],             label:'D major' },
  'Dm':     { notes:['D','F','A'],              label:'D minor' },
  'D7':     { notes:['D','F#','A','C'],         label:'D dominant 7th' },
  'Dmaj7':  { notes:['D','F#','A','C#'],        label:'D major 7th' },
  'Dm7':    { notes:['D','F','A','C'],          label:'D minor 7th' },
  'Dsus2':  { notes:['D','E','A'],              label:'D sus2' },
  'Dsus4':  { notes:['D','G','A'],              label:'D sus4' },
  'Dadd9':  { notes:['D','E','F#','A'],         label:'D add9' },
  'D5':     { notes:['D','A'],                  label:'D power' },

  // ── D# / Eb ────────────────────────────────────────────────────────────
  'D#':     { notes:['D#','G','A#'],            label:'E♭ major' },
  'D#m':    { notes:['D#','F#','A#'],           label:'E♭ minor' },
  'D#7':    { notes:['D#','G','A#','C#'],       label:'E♭ dominant 7th' },
  'D#maj7': { notes:['D#','G','A#','D'],        label:'E♭ major 7th' },
  'D#m7':   { notes:['D#','F#','A#','C#'],      label:'E♭ minor 7th' },
  'D#sus2': { notes:['D#','F','A#'],            label:'E♭ sus2' },
  'D#sus4': { notes:['D#','G#','A#'],           label:'E♭ sus4' },
  'D#add9': { notes:['D#','F','G','A#'],        label:'E♭ add9' },
  'D#5':    { notes:['D#','A#'],                label:'E♭ power' },

  // ── E ──────────────────────────────────────────────────────────────────
  'E':      { notes:['E','G#','B'],             label:'E major' },
  'Em':     { notes:['E','G','B'],              label:'E minor' },
  'E7':     { notes:['E','G#','B','D'],         label:'E dominant 7th' },
  'Emaj7':  { notes:['E','G#','B','D#'],        label:'E major 7th' },
  'Em7':    { notes:['E','G','B','D'],          label:'E minor 7th' },
  'Esus2':  { notes:['E','F#','B'],             label:'E sus2' },
  'Esus4':  { notes:['E','A','B'],              label:'E sus4' },
  'Eadd9':  { notes:['E','F#','G#','B'],        label:'E add9' },
  'E5':     { notes:['E','B'],                  label:'E power' },

  // ── F ──────────────────────────────────────────────────────────────────
  'F':      { notes:['F','A','C'],              label:'F major' },
  'Fm':     { notes:['F','G#','C'],             label:'F minor' },
  'F7':     { notes:['F','A','C','D#'],         label:'F dominant 7th' },
  'Fmaj7':  { notes:['F','A','C','E'],          label:'F major 7th' },
  'Fm7':    { notes:['F','G#','C','D#'],        label:'F minor 7th' },
  'Fsus2':  { notes:['F','G','C'],              label:'F sus2' },
  'Fsus4':  { notes:['F','A#','C'],             label:'F sus4' },
  'Fadd9':  { notes:['F','G','A','C'],          label:'F add9' },
  'F5':     { notes:['F','C'],                  label:'F power' },

  // ── F# / Gb ────────────────────────────────────────────────────────────
  'F#':     { notes:['F#','A#','C#'],           label:'F♯ major' },
  'F#m':    { notes:['F#','A','C#'],            label:'F♯ minor' },
  'F#7':    { notes:['F#','A#','C#','E'],       label:'F♯ dominant 7th' },
  'F#maj7': { notes:['F#','A#','C#','F'],       label:'F♯ major 7th' },
  'F#m7':   { notes:['F#','A','C#','E'],        label:'F♯ minor 7th' },
  'F#sus2': { notes:['F#','G#','C#'],           label:'F♯ sus2' },
  'F#sus4': { notes:['F#','B','C#'],            label:'F♯ sus4' },
  'F#add9': { notes:['F#','G#','A#','C#'],      label:'F♯ add9' },
  'F#5':    { notes:['F#','C#'],                label:'F♯ power' },

  // ── G ──────────────────────────────────────────────────────────────────
  'G':      { notes:['G','B','D'],              label:'G major' },
  'Gm':     { notes:['G','A#','D'],             label:'G minor' },
  'G7':     { notes:['G','B','D','F'],          label:'G dominant 7th' },
  'Gmaj7':  { notes:['G','B','D','F#'],         label:'G major 7th' },
  'Gm7':    { notes:['G','A#','D','F'],         label:'G minor 7th' },
  'Gsus2':  { notes:['G','A','D'],              label:'G sus2' },
  'Gsus4':  { notes:['G','C','D'],              label:'G sus4' },
  'Gadd9':  { notes:['G','A','B','D'],          label:'G add9' },
  'G5':     { notes:['G','D'],                  label:'G power' },

  // ── G# / Ab ────────────────────────────────────────────────────────────
  'G#':     { notes:['G#','C','D#'],            label:'A♭ major' },
  'G#m':    { notes:['G#','B','D#'],            label:'A♭ minor' },
  'G#7':    { notes:['G#','C','D#','F#'],       label:'A♭ dominant 7th' },
  'G#maj7': { notes:['G#','C','D#','G'],        label:'A♭ major 7th' },
  'G#m7':   { notes:['G#','B','D#','F#'],       label:'A♭ minor 7th' },
  'G#sus2': { notes:['G#','A#','D#'],           label:'A♭ sus2' },
  'G#sus4': { notes:['G#','C#','D#'],           label:'A♭ sus4' },
  'G#add9': { notes:['G#','A#','C','D#'],       label:'A♭ add9' },
  'G#5':    { notes:['G#','D#'],                label:'A♭ power' },

  // ── A ──────────────────────────────────────────────────────────────────
  'A':      { notes:['A','C#','E'],             label:'A major' },
  'Am':     { notes:['A','C','E'],              label:'A minor' },
  'A7':     { notes:['A','C#','E','G'],         label:'A dominant 7th' },
  'Amaj7':  { notes:['A','C#','E','G#'],        label:'A major 7th' },
  'Am7':    { notes:['A','C','E','G'],          label:'A minor 7th' },
  'Asus2':  { notes:['A','B','E'],              label:'A sus2' },
  'Asus4':  { notes:['A','D','E'],              label:'A sus4' },
  'Aadd9':  { notes:['A','B','C#','E'],         label:'A add9' },
  'A5':     { notes:['A','E'],                  label:'A power' },

  // ── A# / Bb ────────────────────────────────────────────────────────────
  'A#':     { notes:['A#','D','F'],             label:'B♭ major' },
  'A#m':    { notes:['A#','C#','F'],            label:'B♭ minor' },
  'A#7':    { notes:['A#','D','F','G#'],        label:'B♭ dominant 7th' },
  'A#maj7': { notes:['A#','D','F','A'],         label:'B♭ major 7th' },
  'A#m7':   { notes:['A#','C#','F','G#'],       label:'B♭ minor 7th' },
  'A#sus2': { notes:['A#','C','F'],             label:'B♭ sus2' },
  'A#sus4': { notes:['A#','D#','F'],            label:'B♭ sus4' },
  'A#add9': { notes:['A#','C','D','F'],         label:'B♭ add9' },
  'A#5':    { notes:['A#','F'],                 label:'B♭ power' },

  // ── B ──────────────────────────────────────────────────────────────────
  'B':      { notes:['B','D#','F#'],            label:'B major' },
  'Bm':     { notes:['B','D','F#'],             label:'B minor' },
  'B7':     { notes:['B','D#','F#','A'],        label:'B dominant 7th' },
  'Bmaj7':  { notes:['B','D#','F#','A#'],       label:'B major 7th' },
  'Bm7':    { notes:['B','D','F#','A'],         label:'B minor 7th' },
  'Bsus2':  { notes:['B','C#','F#'],            label:'B sus2' },
  'Bsus4':  { notes:['B','E','F#'],             label:'B sus4' },
  'Badd9':  { notes:['B','C#','D#','F#'],       label:'B add9' },
  'B5':     { notes:['B','F#'],                 label:'B power' },
};

// Piano enharmonic aliases (flat roots → sharp equivalents already handled
// by transposeChord, but aliases ensure direct lookup works too)
const _PE = [
  ['Db','C#'],['Dbm','C#m'],['Db7','C#7'],['Dbmaj7','C#maj7'],['Dbm7','C#m7'],
  ['Dbsus2','C#sus2'],['Dbsus4','C#sus4'],['Dbadd9','C#add9'],['Db5','C#5'],
  ['Eb','D#'],['Ebm','D#m'],['Eb7','D#7'],['Ebmaj7','D#maj7'],['Ebm7','D#m7'],
  ['Ebsus2','D#sus2'],['Ebsus4','D#sus4'],['Ebadd9','D#add9'],['Eb5','D#5'],
  ['Gb','F#'],['Gbm','F#m'],['Gb7','F#7'],['Gbmaj7','F#maj7'],['Gbm7','F#m7'],
  ['Gbsus2','F#sus2'],['Gbsus4','F#sus4'],['Gbadd9','F#add9'],['Gb5','F#5'],
  ['Ab','G#'],['Abm','G#m'],['Ab7','G#7'],['Abmaj7','G#maj7'],['Abm7','G#m7'],
  ['Absus2','G#sus2'],['Absus4','G#sus4'],['Abadd9','G#add9'],['Ab5','G#5'],
  ['Bb','A#'],['Bbm','A#m'],['Bb7','A#7'],['Bbmaj7','A#maj7'],['Bbm7','A#m7'],
  ['Bbsus2','A#sus2'],['Bbsus4','A#sus4'],['Bbadd9','A#add9'],['Bb5','A#5'],
];
_PE.forEach(([alias, canonical]) => { PIANO_SHAPES[alias] = PIANO_SHAPES[canonical]; });

// ── Default export (backwards compat) ─────────────────────────────────────
const CHORD_SHAPES = GUITAR_SHAPES;
export default CHORD_SHAPES;
export { GUITAR_SHAPES, UKULELE_SHAPES, PIANO_SHAPES, CHORD_SHAPES };