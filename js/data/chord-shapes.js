/**
 * js/data/chord-shapes.js
 *
 * Complete chord shape data for all 12 roots × multiple chord qualities.
 * Used by js/views/chords.js to render inline SVG fretboard diagrams.
 *
 * DATA FORMAT per chord:
 * {
 *   frets:   [e, B, G, D, A, E]  — fret number (0=open, -1=muted, 1–5=finger position)
 *                                   Index 0 = high-e string, index 5 = low-E string
 *   fingers: [e, B, G, D, A, E]  — finger number (0=none/open, 1–4=index→pinky)
 *   barre:   { fret, from, to }  — optional; fret number + string indices for barre bar
 *                                   from/to use same 0-5 indexing as frets[]
 *   baseFret: number             — fret number shown at top-left (default 1 = nut visible)
 * }
 *
 * String order in arrays: [e, B, G, D, A, E]  (high to low, matching standard tab notation)
 *
 * Coverage:
 *   Qualities: major, m, 7, maj7, m7, sus2, sus4, add9, 5 (power chord)
 *   Roots: C  C#/Db  D  D#/Eb  E  F  F#/Gb  G  G#/Ab  A  A#/Bb  B
 *
 * Enharmonic aliases point to the same object (e.g. CHORD_SHAPES['C#'] === CHORD_SHAPES['Db'])
 *
 * No imports. No functions. Pure data. Default export.
 */

const CHORD_SHAPES = {

  // ══════════════════════════════════════════════════════════
  //  C
  // ══════════════════════════════════════════════════════════
  'C': {
    frets:   [0, 1, 0, 2, 3, -1],
    fingers: [0, 1, 0, 2, 3,  0],
    baseFret: 1,
  },
  'Cm': {
    frets:   [3, 4, 5, 5, 3, -1],
    fingers: [1, 2, 4, 3, 1,  0],
    barre:   { fret: 3, from: 0, to: 4 },
    baseFret: 3,
  },
  'C7': {
    frets:   [0, 1, 3, 2, 3, -1],
    fingers: [0, 1, 3, 2, 4,  0],
    baseFret: 1,
  },
  'Cmaj7': {
    frets:   [0, 0, 0, 2, 3, -1],
    fingers: [0, 0, 0, 2, 3,  0],
    baseFret: 1,
  },
  'Cm7': {
    frets:   [3, 4, 3, 5, 3, -1],
    fingers: [1, 2, 1, 3, 1,  0],
    barre:   { fret: 3, from: 0, to: 4 },
    baseFret: 3,
  },
  'Csus2': {
    frets:   [3, 3, 0, 0, 3, -1],
    fingers: [3, 4, 0, 0, 2,  0],
    baseFret: 1,
  },
  'Csus4': {
    frets:   [1, 1, 0, 3, 3, -1],
    fingers: [1, 1, 0, 3, 4,  0],
    baseFret: 1,
  },
  'Cadd9': {
    frets:   [0, 3, 0, 2, 3, -1],
    fingers: [0, 4, 0, 2, 3,  0],
    baseFret: 1,
  },
  'C5': {
    frets:   [-1, -1, 5, 5, 3, -1],
    fingers: [ 0,  0, 3, 2, 1,  0],
    baseFret: 3,
  },

  // ══════════════════════════════════════════════════════════
  //  C# / Db
  // ══════════════════════════════════════════════════════════
  'C#': {
    frets:   [4, 4, 6, 6, 4, 4],
    fingers: [1, 1, 3, 4, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#m': {
    frets:   [4, 5, 6, 6, 4, 4],
    fingers: [1, 2, 4, 3, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#7': {
    frets:   [4, 4, 6, 4, 4, 4],
    fingers: [1, 1, 3, 1, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#maj7': {
    frets:   [4, 4, 5, 6, 4, 4],
    fingers: [1, 1, 2, 3, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#m7': {
    frets:   [4, 4, 6, 4, 4, 4],
    fingers: [1, 1, 3, 1, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#sus2': {
    frets:   [4, 4, 6, 6, 4, 4],
    fingers: [1, 1, 3, 4, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#sus4': {
    frets:   [4, 4, 6, 6, 4, 4],
    fingers: [1, 1, 3, 4, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#add9': {
    frets:   [4, 4, 6, 6, 4, 4],
    fingers: [1, 1, 3, 4, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'C#5': {
    frets:   [-1, -1, 6, 6, 4, 4],
    fingers: [ 0,  0, 4, 3, 2, 1],
    baseFret: 4,
  },

  // ══════════════════════════════════════════════════════════
  //  D
  // ══════════════════════════════════════════════════════════
  'D': {
    frets:   [2, 3, 2, 0, -1, -1],
    fingers: [1, 3, 2, 0,  0,  0],
    baseFret: 1,
  },
  'Dm': {
    frets:   [1, 3, 2, 0, -1, -1],
    fingers: [1, 3, 2, 0,  0,  0],
    baseFret: 1,
  },
  'D7': {
    frets:   [2, 1, 2, 0, -1, -1],
    fingers: [2, 1, 3, 0,  0,  0],
    baseFret: 1,
  },
  'Dmaj7': {
    frets:   [2, 2, 2, 0, -1, -1],
    fingers: [1, 2, 3, 0,  0,  0],
    baseFret: 1,
  },
  'Dm7': {
    frets:   [1, 1, 2, 0, -1, -1],
    fingers: [1, 1, 2, 0,  0,  0],
    baseFret: 1,
  },
  'Dsus2': {
    frets:   [0, 3, 2, 0, -1, -1],
    fingers: [0, 3, 2, 0,  0,  0],
    baseFret: 1,
  },
  'Dsus4': {
    frets:   [3, 3, 2, 0, -1, -1],
    fingers: [3, 4, 2, 0,  0,  0],
    baseFret: 1,
  },
  'Dadd9': {
    frets:   [0, 3, 2, 0, -1, -1],
    fingers: [0, 3, 2, 0,  0,  0],
    baseFret: 1,
  },
  'D5': {
    frets:   [-1, -1, -1, 0, 0, -1],
    fingers: [ 0,  0,  0, 2, 1,  0],
    baseFret: 1,
  },

  // ══════════════════════════════════════════════════════════
  //  D# / Eb
  // ══════════════════════════════════════════════════════════
  'D#': {
    frets:   [3, 4, 3, 1, 1, 1],
    fingers: [3, 4, 2, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#m': {
    frets:   [2, 4, 3, 1, 1, 1],
    fingers: [2, 4, 3, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#7': {
    frets:   [3, 2, 3, 1, 1, 1],
    fingers: [3, 2, 4, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#maj7': {
    frets:   [3, 3, 3, 1, 1, 1],
    fingers: [3, 3, 4, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#m7': {
    frets:   [2, 2, 3, 1, 1, 1],
    fingers: [2, 2, 3, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#sus2': {
    frets:   [4, 4, 3, 1, 1, 1],
    fingers: [4, 3, 2, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#sus4': {
    frets:   [4, 4, 3, 1, 1, 1],
    fingers: [4, 3, 2, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#add9': {
    frets:   [3, 4, 3, 1, 1, 1],
    fingers: [3, 4, 2, 1, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'D#5': {
    frets:   [-1, -1, -1, 1, 1, -1],
    fingers: [ 0,  0,  0, 3, 1,  0],
    baseFret: 1,
  },

  // ══════════════════════════════════════════════════════════
  //  E
  // ══════════════════════════════════════════════════════════
  'E': {
    frets:   [0, 0, 1, 2, 2, 0],
    fingers: [0, 0, 1, 3, 2, 0],
    baseFret: 1,
  },
  'Em': {
    frets:   [0, 0, 0, 2, 2, 0],
    fingers: [0, 0, 0, 2, 3, 0],
    baseFret: 1,
  },
  'E7': {
    frets:   [0, 3, 1, 2, 2, 0],
    fingers: [0, 3, 1, 2, 2, 0],
    baseFret: 1,
  },
  'Emaj7': {
    frets:   [0, 0, 1, 1, 2, 0],
    fingers: [0, 0, 2, 1, 3, 0],
    baseFret: 1,
  },
  'Em7': {
    frets:   [0, 3, 0, 2, 2, 0],
    fingers: [0, 3, 0, 1, 2, 0],
    baseFret: 1,
  },
  'Esus2': {
    frets:   [0, 0, 2, 2, 2, 0],
    fingers: [0, 0, 2, 3, 4, 0],
    baseFret: 1,
  },
  'Esus4': {
    frets:   [0, 0, 2, 2, 2, 0],
    fingers: [0, 0, 1, 2, 3, 0],
    baseFret: 1,
  },
  'Eadd9': {
    frets:   [0, 0, 1, 4, 2, 0],
    fingers: [0, 0, 1, 4, 2, 0],
    baseFret: 1,
  },
  'E5': {
    frets:   [-1, -1, -1, 2, 2, 0],
    fingers: [ 0,  0,  0, 3, 2, 0],
    baseFret: 1,
  },

  // ══════════════════════════════════════════════════════════
  //  F
  // ══════════════════════════════════════════════════════════
  'F': {
    frets:   [1, 1, 2, 3, 3, 1],
    fingers: [1, 1, 2, 4, 3, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'Fm': {
    frets:   [1, 1, 1, 3, 3, 1],
    fingers: [1, 1, 1, 4, 3, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'F7': {
    frets:   [1, 1, 2, 1, 3, 1],
    fingers: [1, 1, 2, 1, 3, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'Fmaj7': {
    frets:   [0, 1, 2, 3, 3, 1],
    fingers: [0, 1, 2, 4, 3, 1],
    baseFret: 1,
  },
  'Fm7': {
    frets:   [1, 1, 1, 1, 3, 1],
    fingers: [1, 1, 1, 1, 3, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'Fsus2': {
    frets:   [1, 1, 3, 3, 1, 1],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'Fsus4': {
    frets:   [1, 1, 3, 3, 1, 1],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'Fadd9': {
    frets:   [1, 1, 2, 3, 3, 1],
    fingers: [1, 1, 2, 4, 3, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'F5': {
    frets:   [-1, -1, -1, 3, 3, 1],
    fingers: [ 0,  0,  0, 4, 3, 1],
    baseFret: 1,
  },

  // ══════════════════════════════════════════════════════════
  //  F# / Gb
  // ══════════════════════════════════════════════════════════
  'F#': {
    frets:   [2, 2, 3, 4, 4, 2],
    fingers: [1, 1, 2, 4, 3, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#m': {
    frets:   [2, 2, 2, 4, 4, 2],
    fingers: [1, 1, 1, 4, 3, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#7': {
    frets:   [2, 2, 3, 2, 4, 2],
    fingers: [1, 1, 2, 1, 3, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#maj7': {
    frets:   [2, 2, 3, 3, 4, 2],
    fingers: [1, 1, 2, 3, 4, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#m7': {
    frets:   [2, 2, 2, 2, 4, 2],
    fingers: [1, 1, 1, 1, 3, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#sus2': {
    frets:   [2, 2, 4, 4, 2, 2],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#sus4': {
    frets:   [2, 2, 4, 4, 2, 2],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#add9': {
    frets:   [2, 2, 3, 4, 4, 2],
    fingers: [1, 1, 2, 4, 3, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'F#5': {
    frets:   [-1, -1, -1, 4, 4, 2],
    fingers: [ 0,  0,  0, 4, 3, 1],
    baseFret: 2,
  },

  // ══════════════════════════════════════════════════════════
  //  G
  // ══════════════════════════════════════════════════════════
  'G': {
    frets:   [3, 0, 0, 0, 2, 3],
    fingers: [3, 0, 0, 0, 1, 4],
    baseFret: 1,
  },
  'Gm': {
    frets:   [3, 3, 3, 5, 5, 3],
    fingers: [1, 1, 1, 4, 3, 1],
    barre:   { fret: 3, from: 0, to: 5 },
    baseFret: 3,
  },
  'G7': {
    frets:   [1, 0, 0, 0, 2, 3],
    fingers: [1, 0, 0, 0, 2, 3],
    baseFret: 1,
  },
  'Gmaj7': {
    frets:   [2, 0, 0, 0, 2, 3],
    fingers: [2, 0, 0, 0, 1, 3],
    baseFret: 1,
  },
  'Gm7': {
    frets:   [3, 3, 3, 3, 5, 3],
    fingers: [1, 1, 1, 1, 3, 1],
    barre:   { fret: 3, from: 0, to: 5 },
    baseFret: 3,
  },
  'Gsus2': {
    frets:   [3, 0, 0, 0, 0, 3],
    fingers: [2, 0, 0, 0, 0, 3],
    baseFret: 1,
  },
  'Gsus4': {
    frets:   [3, 1, 0, 0, 0, 3],
    fingers: [3, 1, 0, 0, 0, 4],
    baseFret: 1,
  },
  'Gadd9': {
    frets:   [3, 0, 2, 0, 0, 3],
    fingers: [3, 0, 2, 0, 0, 4],
    baseFret: 1,
  },
  'G5': {
    frets:   [-1, -1, -1, 0, 2, 3],
    fingers: [ 0,  0,  0, 0, 1, 2],
    baseFret: 1,
  },

  // ══════════════════════════════════════════════════════════
  //  G# / Ab
  // ══════════════════════════════════════════════════════════
  'G#': {
    frets:   [4, 4, 5, 6, 6, 4],
    fingers: [1, 1, 2, 4, 3, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#m': {
    frets:   [4, 4, 4, 6, 6, 4],
    fingers: [1, 1, 1, 4, 3, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#7': {
    frets:   [4, 4, 5, 4, 6, 4],
    fingers: [1, 1, 2, 1, 3, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#maj7': {
    frets:   [4, 4, 5, 5, 6, 4],
    fingers: [1, 1, 2, 3, 4, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#m7': {
    frets:   [4, 4, 4, 4, 6, 4],
    fingers: [1, 1, 1, 1, 3, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#sus2': {
    frets:   [4, 4, 6, 6, 4, 4],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#sus4': {
    frets:   [4, 4, 6, 6, 4, 4],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#add9': {
    frets:   [4, 4, 5, 6, 6, 4],
    fingers: [1, 1, 2, 4, 3, 1],
    barre:   { fret: 4, from: 0, to: 5 },
    baseFret: 4,
  },
  'G#5': {
    frets:   [-1, -1, -1, 6, 6, 4],
    fingers: [ 0,  0,  0, 4, 3, 1],
    baseFret: 4,
  },

  // ══════════════════════════════════════════════════════════
  //  A
  // ══════════════════════════════════════════════════════════
  'A': {
    frets:   [0, 2, 2, 2, 0, -1],
    fingers: [0, 2, 3, 1, 0,  0],
    baseFret: 1,
  },
  'Am': {
    frets:   [0, 1, 2, 2, 0, -1],
    fingers: [0, 1, 3, 2, 0,  0],
    baseFret: 1,
  },
  'A7': {
    frets:   [0, 2, 0, 2, 0, -1],
    fingers: [0, 2, 0, 3, 0,  0],
    baseFret: 1,
  },
  'Amaj7': {
    frets:   [0, 2, 1, 2, 0, -1],
    fingers: [0, 3, 1, 2, 0,  0],
    baseFret: 1,
  },
  'Am7': {
    frets:   [0, 1, 0, 2, 0, -1],
    fingers: [0, 1, 0, 2, 0,  0],
    baseFret: 1,
  },
  'Asus2': {
    frets:   [0, 0, 2, 2, 0, -1],
    fingers: [0, 0, 2, 3, 0,  0],
    baseFret: 1,
  },
  'Asus4': {
    frets:   [0, 3, 2, 2, 0, -1],
    fingers: [0, 4, 2, 1, 0,  0],
    baseFret: 1,
  },
  'Aadd9': {
    frets:   [0, 2, 2, 4, 0, -1],
    fingers: [0, 2, 3, 4, 0,  0],
    baseFret: 1,
  },
  'A5': {
    frets:   [-1, -1, -1, 2, 0, -1],
    fingers: [ 0,  0,  0, 2, 0,  0],
    baseFret: 1,
  },

  // ══════════════════════════════════════════════════════════
  //  A# / Bb
  // ══════════════════════════════════════════════════════════
  'A#': {
    frets:   [1, 3, 3, 3, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#m': {
    frets:   [1, 2, 3, 3, 1, 1],
    fingers: [1, 2, 4, 3, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#7': {
    frets:   [1, 3, 1, 3, 1, 1],
    fingers: [1, 3, 1, 4, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#maj7': {
    frets:   [1, 3, 2, 3, 1, 1],
    fingers: [1, 3, 2, 4, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#m7': {
    frets:   [1, 2, 1, 3, 1, 1],
    fingers: [1, 2, 1, 3, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#sus2': {
    frets:   [1, 1, 3, 3, 1, 1],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#sus4': {
    frets:   [1, 4, 3, 3, 1, 1],
    fingers: [1, 4, 3, 2, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#add9': {
    frets:   [1, 3, 3, 3, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barre:   { fret: 1, from: 0, to: 5 },
    baseFret: 1,
  },
  'A#5': {
    frets:   [-1, -1, -1, 3, 1, 1],
    fingers: [ 0,  0,  0, 4, 2, 1],
    baseFret: 1,
  },

  // ══════════════════════════════════════════════════════════
  //  B
  // ══════════════════════════════════════════════════════════
  'B': {
    frets:   [2, 4, 4, 4, 2, 2],
    fingers: [1, 3, 4, 2, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'Bm': {
    frets:   [2, 3, 4, 4, 2, 2],
    fingers: [1, 2, 4, 3, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'B7': {
    frets:   [0, 2, 1, 2, 2, -1],
    fingers: [0, 3, 1, 2, 2,  0],
    baseFret: 1,
  },
  'Bmaj7': {
    frets:   [2, 4, 3, 4, 2, 2],
    fingers: [1, 3, 2, 4, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'Bm7': {
    frets:   [2, 3, 2, 4, 2, 2],
    fingers: [1, 2, 1, 3, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'Bsus2': {
    frets:   [2, 2, 4, 4, 2, 2],
    fingers: [1, 1, 4, 3, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'Bsus4': {
    frets:   [2, 5, 4, 4, 2, 2],
    fingers: [1, 4, 3, 2, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'Badd9': {
    frets:   [2, 4, 4, 4, 2, 2],
    fingers: [1, 3, 4, 2, 1, 1],
    barre:   { fret: 2, from: 0, to: 5 },
    baseFret: 2,
  },
  'B5': {
    frets:   [-1, -1, -1, 4, 2, 2],
    fingers: [ 0,  0,  0, 4, 2, 1],
    baseFret: 2,
  },

};

// ── Enharmonic aliases ────────────────────────────────────────────────────
// Each alias points to the same object as its enharmonic equivalent.
// The renderer uses these when a transposed chord lands on a flat root.

CHORD_SHAPES['Db']   = CHORD_SHAPES['C#'];
CHORD_SHAPES['Dbm']  = CHORD_SHAPES['C#m'];
CHORD_SHAPES['Db7']  = CHORD_SHAPES['C#7'];
CHORD_SHAPES['Dbmaj7'] = CHORD_SHAPES['C#maj7'];
CHORD_SHAPES['Dbm7'] = CHORD_SHAPES['C#m7'];
CHORD_SHAPES['Dbsus2'] = CHORD_SHAPES['C#sus2'];
CHORD_SHAPES['Dbsus4'] = CHORD_SHAPES['C#sus4'];
CHORD_SHAPES['Dbadd9'] = CHORD_SHAPES['C#add9'];
CHORD_SHAPES['Db5']  = CHORD_SHAPES['C#5'];

CHORD_SHAPES['Eb']   = CHORD_SHAPES['D#'];
CHORD_SHAPES['Ebm']  = CHORD_SHAPES['D#m'];
CHORD_SHAPES['Eb7']  = CHORD_SHAPES['D#7'];
CHORD_SHAPES['Ebmaj7'] = CHORD_SHAPES['D#maj7'];
CHORD_SHAPES['Ebm7'] = CHORD_SHAPES['D#m7'];
CHORD_SHAPES['Ebsus2'] = CHORD_SHAPES['D#sus2'];
CHORD_SHAPES['Ebsus4'] = CHORD_SHAPES['D#sus4'];
CHORD_SHAPES['Ebadd9'] = CHORD_SHAPES['D#add9'];
CHORD_SHAPES['Eb5']  = CHORD_SHAPES['D#5'];

CHORD_SHAPES['Gb']   = CHORD_SHAPES['F#'];
CHORD_SHAPES['Gbm']  = CHORD_SHAPES['F#m'];
CHORD_SHAPES['Gb7']  = CHORD_SHAPES['F#7'];
CHORD_SHAPES['Gbmaj7'] = CHORD_SHAPES['F#maj7'];
CHORD_SHAPES['Gbm7'] = CHORD_SHAPES['F#m7'];
CHORD_SHAPES['Gbsus2'] = CHORD_SHAPES['F#sus2'];
CHORD_SHAPES['Gbsus4'] = CHORD_SHAPES['F#sus4'];
CHORD_SHAPES['Gbadd9'] = CHORD_SHAPES['F#add9'];
CHORD_SHAPES['Gb5']  = CHORD_SHAPES['F#5'];

CHORD_SHAPES['Ab']   = CHORD_SHAPES['G#'];
CHORD_SHAPES['Abm']  = CHORD_SHAPES['G#m'];
CHORD_SHAPES['Ab7']  = CHORD_SHAPES['G#7'];
CHORD_SHAPES['Abmaj7'] = CHORD_SHAPES['G#maj7'];
CHORD_SHAPES['Abm7'] = CHORD_SHAPES['G#m7'];
CHORD_SHAPES['Absus2'] = CHORD_SHAPES['G#sus2'];
CHORD_SHAPES['Absus4'] = CHORD_SHAPES['G#sus4'];
CHORD_SHAPES['Abadd9'] = CHORD_SHAPES['G#add9'];
CHORD_SHAPES['Ab5']  = CHORD_SHAPES['G#5'];

CHORD_SHAPES['Bb']   = CHORD_SHAPES['A#'];
CHORD_SHAPES['Bbm']  = CHORD_SHAPES['A#m'];
CHORD_SHAPES['Bb7']  = CHORD_SHAPES['A#7'];
CHORD_SHAPES['Bbmaj7'] = CHORD_SHAPES['A#maj7'];
CHORD_SHAPES['Bbm7'] = CHORD_SHAPES['A#m7'];
CHORD_SHAPES['Bbsus2'] = CHORD_SHAPES['A#sus2'];
CHORD_SHAPES['Bbsus4'] = CHORD_SHAPES['A#sus4'];
CHORD_SHAPES['Bbadd9'] = CHORD_SHAPES['A#add9'];
CHORD_SHAPES['Bb5']  = CHORD_SHAPES['A#5'];

export default CHORD_SHAPES;