/**
 * js/data/chord-shapes.js
 *
 * Chord shape / voicing data for three instruments.
 * Each chord now maps to an ARRAY of voicings so the popup can show
 * prev/next alternate shapes (different fret positions / inversions).
 *
 * Exports (named):
 *   GUITAR_SHAPES   — { frets, fingers, barre?, baseFret, label }[]
 *   UKULELE_SHAPES  — { frets, fingers, barre?, baseFret, label }[]
 *   PIANO_SHAPES    — { notes: string[], label: string }[]
 *
 * Default export:
 *   CHORD_SHAPES    — alias for GUITAR_SHAPES (backwards-compat)
 *
 * Helper export:
 *   getShape(shapeMap, chordName, variantIdx) — safe array accessor
 *
 * ─── Guitar array order ───────────────────────────────────────────────────
 * [e, B, G, D, A, E]  (index 0 = highest string)
 *
 * ─── Ukulele array order ─────────────────────────────────────────────────
 * [A, E, C, G]  (index 0 = A4 = highest string in standard reentrant tuning)
 *
 * ─── Piano notes ─────────────────────────────────────────────────────────
 * Pitch-class strings (sharps only): C C# D D# E F F# G G# A A# B
 */

// ══════════════════════════════════════════════════════════════════════════
//  SAFE ACCESSOR
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get one shape from a shape map, handling both old single-object format
 * and new array format.
 * @param {Object} map   - e.g. GUITAR_SHAPES
 * @param {string} name  - chord name, e.g. "G"
 * @param {number} idx   - variant index (0-based)
 * @returns {{ frets?, fingers?, barre?, baseFret?, notes?, label? } | null}
 */
export function getShape(map, name, idx = 0) {
  const entry = map[name];
  if (!entry) return null;
  if (Array.isArray(entry)) {
    return entry[((idx % entry.length) + entry.length) % entry.length] || null;
  }
  return entry; // legacy single-object (aliases point here)
}

/**
 * Get total variant count for a chord.
 */
export function getVariantCount(map, name) {
  const entry = map[name];
  if (!entry) return 0;
  if (Array.isArray(entry)) return entry.length;
  return 1;
}

// ══════════════════════════════════════════════════════════════════════════
//  GUITAR SHAPES
//  Format per voicing: { frets:[e,B,G,D,A,E], fingers:[e,B,G,D,A,E], barre?, baseFret, label }
// ══════════════════════════════════════════════════════════════════════════

const GUITAR_SHAPES = {

  // ── C ──────────────────────────────────────────────────────────────────
  'C': [
    { frets:[0,1,0,2,3,-1], fingers:[0,1,0,2,3,0], baseFret:1, label:'Open' },
    { frets:[3,5,5,5,3,3],  fingers:[1,3,4,2,1,1], barre:{fret:3,from:0,to:5}, baseFret:3, label:'Barre III' },
    { frets:[0,1,0,2,3,-1], fingers:[0,1,0,3,4,0], baseFret:1, label:'Open (alt fingering)' },
  ],
  'Cm': [
    { frets:[3,4,5,5,3,-1], fingers:[1,2,4,3,1,0], barre:{fret:3,from:0,to:4}, baseFret:3, label:'Barre III' },
    { frets:[8,9,10,10,8,8], fingers:[1,2,4,3,1,1], barre:{fret:8,from:0,to:5}, baseFret:8, label:'Barre VIII' },
  ],
  'C7': [
    { frets:[0,1,3,2,3,-1], fingers:[0,1,3,2,4,0], baseFret:1, label:'Open' },
    { frets:[3,5,3,5,3,3],  fingers:[1,3,1,4,1,1], barre:{fret:3,from:0,to:5}, baseFret:3, label:'Barre III' },
  ],
  'Cmaj7': [
    { frets:[0,0,0,2,3,-1], fingers:[0,0,0,2,3,0], baseFret:1, label:'Open' },
    { frets:[3,5,4,5,3,3],  fingers:[1,3,2,4,1,1], barre:{fret:3,from:0,to:5}, baseFret:3, label:'Barre III' },
  ],
  'Cm7': [
    { frets:[3,4,3,5,3,-1], fingers:[1,2,1,3,1,0], barre:{fret:3,from:0,to:4}, baseFret:3, label:'Barre III' },
    { frets:[8,9,8,10,8,8], fingers:[1,2,1,4,1,1], barre:{fret:8,from:0,to:5}, baseFret:8, label:'Barre VIII' },
  ],
  'Csus2':  [{ frets:[3,3,0,0,3,-1], fingers:[3,4,0,0,2,0], baseFret:1, label:'Open' }],
  'Csus4':  [{ frets:[1,1,0,3,3,-1], fingers:[1,1,0,3,4,0], baseFret:1, label:'Open' }],
  'Cadd9':  [{ frets:[0,3,0,2,3,-1], fingers:[0,4,0,2,3,0], baseFret:1, label:'Open' }],
  'C5':     [{ frets:[-1,-1,5,5,3,-1], fingers:[0,0,3,2,1,0], baseFret:3, label:'Power' }],

  // ── C# / Db ────────────────────────────────────────────────────────────
  'C#': [
    { frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' },
    { frets:[9,10,11,11,9,9], fingers:[1,2,4,3,1,1], barre:{fret:9,from:0,to:5}, baseFret:9, label:'Barre IX' },
  ],
  'C#m': [
    { frets:[4,5,6,6,4,4], fingers:[1,2,4,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' },
    { frets:[9,9,9,11,11,9], fingers:[1,1,1,3,4,1], barre:{fret:9,from:0,to:5}, baseFret:9, label:'Barre IX' },
  ],
  'C#7':    [{ frets:[4,4,6,4,4,4], fingers:[1,1,3,1,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'C#maj7': [{ frets:[4,4,5,6,4,4], fingers:[1,1,2,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'C#m7':   [{ frets:[4,4,6,4,4,4], fingers:[1,1,3,1,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'C#sus2': [{ frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'C#sus4': [{ frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'C#add9': [{ frets:[4,4,6,6,4,4], fingers:[1,1,3,4,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'C#5':    [{ frets:[-1,-1,6,6,4,4], fingers:[0,0,4,3,2,1], baseFret:4, label:'Power' }],

  // ── D ──────────────────────────────────────────────────────────────────
  'D': [
    { frets:[2,3,2,0,-1,-1], fingers:[1,3,2,0,0,0], baseFret:1, label:'Open' },
    { frets:[5,5,7,7,5,5],   fingers:[1,1,3,4,1,1], barre:{fret:5,from:0,to:5}, baseFret:5, label:'Barre V' },
  ],
  'Dm': [
    { frets:[1,3,2,0,-1,-1], fingers:[1,3,2,0,0,0], baseFret:1, label:'Open' },
    { frets:[5,6,7,7,5,5],   fingers:[1,2,4,3,1,1], barre:{fret:5,from:0,to:5}, baseFret:5, label:'Barre V' },
  ],
  'D7': [
    { frets:[2,1,2,0,-1,-1], fingers:[2,1,3,0,0,0], baseFret:1, label:'Open' },
    { frets:[5,5,7,5,5,5],   fingers:[1,1,3,1,1,1], barre:{fret:5,from:0,to:5}, baseFret:5, label:'Barre V' },
  ],
  'Dmaj7':  [{ frets:[2,2,2,0,-1,-1], fingers:[1,2,3,0,0,0], baseFret:1, label:'Open' }],
  'Dm7':    [{ frets:[1,1,2,0,-1,-1], fingers:[1,1,2,0,0,0], baseFret:1, label:'Open' }],
  'Dsus2':  [{ frets:[0,3,2,0,-1,-1], fingers:[0,3,2,0,0,0], baseFret:1, label:'Open' }],
  'Dsus4':  [{ frets:[3,3,2,0,-1,-1], fingers:[3,4,2,0,0,0], baseFret:1, label:'Open' }],
  'Dadd9':  [{ frets:[0,3,2,0,-1,-1], fingers:[0,3,2,0,0,0], baseFret:1, label:'Open' }],
  'D5':     [{ frets:[-1,-1,-1,0,0,-1], fingers:[0,0,0,2,1,0], baseFret:1, label:'Power' }],

  // ── D# / Eb ────────────────────────────────────────────────────────────
  'D#':     [{ frets:[3,4,3,1,1,1], fingers:[3,4,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#m':    [{ frets:[2,4,3,1,1,1], fingers:[2,4,3,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#7':    [{ frets:[3,2,3,1,1,1], fingers:[3,2,4,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#maj7': [{ frets:[3,3,3,1,1,1], fingers:[3,3,4,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#m7':   [{ frets:[2,2,3,1,1,1], fingers:[2,2,3,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#sus2': [{ frets:[4,4,3,1,1,1], fingers:[4,3,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#sus4': [{ frets:[4,4,3,1,1,1], fingers:[4,3,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#add9': [{ frets:[3,4,3,1,1,1], fingers:[3,4,2,1,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'D#5':    [{ frets:[-1,-1,-1,1,1,-1], fingers:[0,0,0,3,1,0], baseFret:1, label:'Power' }],

  // ── E ──────────────────────────────────────────────────────────────────
  'E': [
    { frets:[0,0,1,2,2,0], fingers:[0,0,1,3,2,0], baseFret:1, label:'Open' },
    { frets:[4,4,4,6,6,4], fingers:[1,1,1,3,4,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' },
    { frets:[0,0,1,2,2,0], fingers:[0,0,1,2,3,0], baseFret:1, label:'Open (alt)' },
  ],
  'Em': [
    { frets:[0,0,0,2,2,0], fingers:[0,0,0,2,3,0], baseFret:1, label:'Open' },
    { frets:[0,0,0,2,2,0], fingers:[0,0,0,1,2,0], baseFret:1, label:'Open (alt)' },
    { frets:[7,8,9,9,7,7], fingers:[1,2,4,3,1,1], barre:{fret:7,from:0,to:5}, baseFret:7, label:'Barre VII' },
  ],
  'E7': [
    { frets:[0,3,1,2,2,0], fingers:[0,3,1,2,2,0], baseFret:1, label:'Open' },
    { frets:[0,0,1,0,2,0], fingers:[0,0,1,0,2,0], baseFret:1, label:'Open (easy)' },
  ],
  'Emaj7':  [{ frets:[0,0,1,1,2,0], fingers:[0,0,2,1,3,0], baseFret:1, label:'Open' }],
  'Em7': [
    { frets:[0,3,0,2,2,0], fingers:[0,3,0,1,2,0], baseFret:1, label:'Open' },
    { frets:[0,0,0,0,2,0], fingers:[0,0,0,0,1,0], baseFret:1, label:'Easy Open' },
  ],
  'Esus2':  [{ frets:[0,0,2,2,2,0], fingers:[0,0,2,3,4,0], baseFret:1, label:'Open' }],
  'Esus4':  [{ frets:[0,0,2,2,2,0], fingers:[0,0,1,2,3,0], baseFret:1, label:'Open' }],
  'Eadd9':  [{ frets:[0,0,1,4,2,0], fingers:[0,0,1,4,2,0], baseFret:1, label:'Open' }],
  'E5':     [{ frets:[-1,-1,-1,2,2,0], fingers:[0,0,0,3,2,0], baseFret:1, label:'Power' }],

  // ── F ──────────────────────────────────────────────────────────────────
  'F': [
    { frets:[1,1,2,3,3,1], fingers:[1,1,2,4,3,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' },
    { frets:[1,1,2,3,-1,-1], fingers:[1,1,2,3,0,0], baseFret:1, label:'Mini Barre' },
    { frets:[0,1,2,3,3,1],   fingers:[0,1,2,4,3,1], baseFret:1, label:'No-barre (open e)' },
  ],
  'Fm': [
    { frets:[1,1,1,3,3,1], fingers:[1,1,1,4,3,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' },
    { frets:[1,1,1,3,-1,-1], fingers:[1,1,1,3,0,0], baseFret:1, label:'Mini Barre' },
  ],
  'F7':     [{ frets:[1,1,2,1,3,1], fingers:[1,1,2,1,3,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'Fmaj7':  [{ frets:[0,1,2,3,3,1], fingers:[0,1,2,4,3,1], baseFret:1, label:'Open e' }],
  'Fm7':    [{ frets:[1,1,1,1,3,1], fingers:[1,1,1,1,3,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'Fsus2':  [{ frets:[1,1,3,3,1,1], fingers:[1,1,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'Fsus4':  [{ frets:[1,1,3,3,1,1], fingers:[1,1,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'Fadd9':  [{ frets:[1,1,2,3,3,1], fingers:[1,1,2,4,3,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'F5':     [{ frets:[-1,-1,-1,3,3,1], fingers:[0,0,0,4,3,1], baseFret:1, label:'Power' }],

  // ── F# / Gb ────────────────────────────────────────────────────────────
  'F#': [
    { frets:[2,2,3,4,4,2], fingers:[1,1,2,4,3,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' },
    { frets:[9,10,11,11,9,9], fingers:[1,2,4,3,1,1], barre:{fret:9,from:0,to:5}, baseFret:9, label:'Barre IX' },
  ],
  'F#m': [
    { frets:[2,2,2,4,4,2], fingers:[1,1,1,4,3,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' },
    { frets:[9,9,9,11,11,9], fingers:[1,1,1,3,4,1], barre:{fret:9,from:0,to:5}, baseFret:9, label:'Barre IX' },
  ],
  'F#7':    [{ frets:[2,2,3,2,4,2], fingers:[1,1,2,1,3,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'F#maj7': [{ frets:[2,2,3,3,4,2], fingers:[1,1,2,3,4,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'F#m7':   [{ frets:[2,2,2,2,4,2], fingers:[1,1,1,1,3,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'F#sus2': [{ frets:[2,2,4,4,2,2], fingers:[1,1,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'F#sus4': [{ frets:[2,2,4,4,2,2], fingers:[1,1,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'F#add9': [{ frets:[2,2,3,4,4,2], fingers:[1,1,2,4,3,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'F#5':    [{ frets:[-1,-1,-1,4,4,2], fingers:[0,0,0,4,3,1], baseFret:2, label:'Power' }],

  // ── G ──────────────────────────────────────────────────────────────────
  'G': [
    { frets:[3,0,0,0,2,3], fingers:[3,0,0,0,1,4], baseFret:1, label:'Open (pinky)' },
    { frets:[3,3,0,0,2,3], fingers:[3,4,0,0,1,2], baseFret:1, label:'Open (full)' },
    { frets:[3,0,0,0,2,3], fingers:[2,0,0,0,1,3], baseFret:1, label:'Open (ring-pinky)' },
  ],
  'Gm': [
    { frets:[3,3,3,5,5,3], fingers:[1,1,1,4,3,1], barre:{fret:3,from:0,to:5}, baseFret:3, label:'Barre III' },
    { frets:[10,10,10,12,12,10], fingers:[1,1,1,3,4,1], barre:{fret:10,from:0,to:5}, baseFret:10, label:'Barre X' },
  ],
  'G7': [
    { frets:[1,0,0,0,2,3], fingers:[1,0,0,0,2,3], baseFret:1, label:'Open' },
    { frets:[3,3,3,3,5,3], fingers:[1,1,1,1,3,1], barre:{fret:3,from:0,to:5}, baseFret:3, label:'Barre III' },
  ],
  'Gmaj7':  [{ frets:[2,0,0,0,2,3], fingers:[2,0,0,0,1,3], baseFret:1, label:'Open' }],
  'Gm7':    [{ frets:[3,3,3,3,5,3], fingers:[1,1,1,1,3,1], barre:{fret:3,from:0,to:5}, baseFret:3, label:'Barre III' }],
  'Gsus2':  [{ frets:[3,0,0,0,0,3], fingers:[2,0,0,0,0,3], baseFret:1, label:'Open' }],
  'Gsus4':  [{ frets:[3,1,0,0,0,3], fingers:[3,1,0,0,0,4], baseFret:1, label:'Open' }],
  'Gadd9': [
    { frets:[3,0,2,0,0,3], fingers:[3,0,2,0,0,4], baseFret:1, label:'Open' },
    { frets:[3,0,0,0,0,3], fingers:[2,0,0,0,0,3], baseFret:1, label:'Easy Open' },
  ],
  'G5':     [{ frets:[-1,-1,-1,0,2,3], fingers:[0,0,0,0,1,2], baseFret:1, label:'Power' }],

  // ── G# / Ab ────────────────────────────────────────────────────────────
  'G#':     [{ frets:[4,4,5,6,6,4], fingers:[1,1,2,4,3,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#m':    [{ frets:[4,4,4,6,6,4], fingers:[1,1,1,4,3,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#7':    [{ frets:[4,4,5,4,6,4], fingers:[1,1,2,1,3,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#maj7': [{ frets:[4,4,5,5,6,4], fingers:[1,1,2,3,4,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#m7':   [{ frets:[4,4,4,4,6,4], fingers:[1,1,1,1,3,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#sus2': [{ frets:[4,4,6,6,4,4], fingers:[1,1,4,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#sus4': [{ frets:[4,4,6,6,4,4], fingers:[1,1,4,3,1,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#add9': [{ frets:[4,4,5,6,6,4], fingers:[1,1,2,4,3,1], barre:{fret:4,from:0,to:5}, baseFret:4, label:'Barre IV' }],
  'G#5':    [{ frets:[-1,-1,-1,6,6,4], fingers:[0,0,0,4,3,1], baseFret:4, label:'Power' }],

  // ── A ──────────────────────────────────────────────────────────────────
  'A': [
    { frets:[0,2,2,2,0,-1], fingers:[0,2,3,1,0,0], baseFret:1, label:'Open' },
    { frets:[0,2,2,2,0,-1], fingers:[0,1,1,1,0,0], barre:{fret:2,from:1,to:3}, baseFret:1, label:'Open (barre 3 strings)' },
    { frets:[5,5,6,7,7,5], fingers:[1,1,2,4,3,1], barre:{fret:5,from:0,to:5}, baseFret:5, label:'Barre V' },
  ],
  'Am': [
    { frets:[0,1,2,2,0,-1], fingers:[0,1,3,2,0,0], baseFret:1, label:'Open' },
    { frets:[0,1,2,2,0,-1], fingers:[0,1,2,3,0,0], baseFret:1, label:'Open (alt)' },
    { frets:[5,5,5,7,7,5], fingers:[1,1,1,4,3,1], barre:{fret:5,from:0,to:5}, baseFret:5, label:'Barre V' },
  ],
  'A7': [
    { frets:[0,2,0,2,0,-1], fingers:[0,2,0,3,0,0], baseFret:1, label:'Open' },
    { frets:[5,5,6,5,7,5],  fingers:[1,1,2,1,3,1], barre:{fret:5,from:0,to:5}, baseFret:5, label:'Barre V' },
  ],
  'Amaj7':  [{ frets:[0,2,1,2,0,-1], fingers:[0,3,1,2,0,0], baseFret:1, label:'Open' }],
  'Am7': [
    { frets:[0,1,0,2,0,-1], fingers:[0,1,0,2,0,0], baseFret:1, label:'Open' },
    { frets:[5,5,5,5,7,5],  fingers:[1,1,1,1,3,1], barre:{fret:5,from:0,to:5}, baseFret:5, label:'Barre V' },
  ],
  'Asus2':  [{ frets:[0,0,2,2,0,-1], fingers:[0,0,2,3,0,0], baseFret:1, label:'Open' }],
  'Asus4':  [{ frets:[0,3,2,2,0,-1], fingers:[0,4,2,1,0,0], baseFret:1, label:'Open' }],
  'Aadd9':  [{ frets:[0,2,2,4,0,-1], fingers:[0,2,3,4,0,0], baseFret:1, label:'Open' }],
  'A5':     [{ frets:[-1,-1,-1,2,0,-1], fingers:[0,0,0,2,0,0], baseFret:1, label:'Power' }],

  // ── A# / Bb ────────────────────────────────────────────────────────────
  'A#': [
    { frets:[1,3,3,3,1,1], fingers:[1,3,4,2,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' },
    { frets:[6,6,7,8,8,6], fingers:[1,1,2,4,3,1], barre:{fret:6,from:0,to:5}, baseFret:6, label:'Barre VI' },
  ],
  'A#m': [
    { frets:[1,2,3,3,1,1], fingers:[1,2,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' },
    { frets:[6,6,6,8,8,6], fingers:[1,1,1,3,4,1], barre:{fret:6,from:0,to:5}, baseFret:6, label:'Barre VI' },
  ],
  'A#7':    [{ frets:[1,3,1,3,1,1], fingers:[1,3,1,4,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'A#maj7': [{ frets:[1,3,2,3,1,1], fingers:[1,3,2,4,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'A#m7':   [{ frets:[1,2,1,3,1,1], fingers:[1,2,1,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'A#sus2': [{ frets:[1,1,3,3,1,1], fingers:[1,1,4,3,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'A#sus4': [{ frets:[1,4,3,3,1,1], fingers:[1,4,3,2,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'A#add9': [{ frets:[1,3,3,3,1,1], fingers:[1,3,4,2,1,1], barre:{fret:1,from:0,to:5}, baseFret:1, label:'Barre I' }],
  'A#5':    [{ frets:[-1,-1,-1,3,1,1], fingers:[0,0,0,4,2,1], baseFret:1, label:'Power' }],

  // ── B ──────────────────────────────────────────────────────────────────
  'B': [
    { frets:[2,4,4,4,2,2], fingers:[1,3,4,2,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' },
    { frets:[7,7,8,9,9,7], fingers:[1,1,2,4,3,1], barre:{fret:7,from:0,to:5}, baseFret:7, label:'Barre VII' },
  ],
  'Bm': [
    { frets:[2,3,4,4,2,2], fingers:[1,2,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' },
    { frets:[2,3,4,4,2,-1], fingers:[1,2,4,3,1,0], barre:{fret:2,from:0,to:4}, baseFret:2, label:'Barre II (5-str)' },
    { frets:[7,7,7,9,9,7], fingers:[1,1,1,3,4,1], barre:{fret:7,from:0,to:5}, baseFret:7, label:'Barre VII' },
  ],
  'B7': [
    { frets:[0,2,1,2,2,-1], fingers:[0,3,1,2,2,0], baseFret:1, label:'Open' },
    { frets:[2,4,2,4,2,2],  fingers:[1,3,1,4,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' },
  ],
  'Bmaj7':  [{ frets:[2,4,3,4,2,2], fingers:[1,3,2,4,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'Bm7': [
    { frets:[2,3,2,4,2,2], fingers:[1,2,1,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' },
    { frets:[2,0,2,4,2,2], fingers:[1,0,1,3,1,1], baseFret:2, label:'Open B' },
  ],
  'Bsus2':  [{ frets:[2,2,4,4,2,2], fingers:[1,1,4,3,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'Bsus4':  [{ frets:[2,5,4,4,2,2], fingers:[1,4,3,2,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'Badd9':  [{ frets:[2,4,4,4,2,2], fingers:[1,3,4,2,1,1], barre:{fret:2,from:0,to:5}, baseFret:2, label:'Barre II' }],
  'B5':     [{ frets:[-1,-1,-1,4,2,2], fingers:[0,0,0,4,2,1], baseFret:2, label:'Power' }],
};

// Guitar enharmonic aliases — point to same array
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
//  Array order: [A, E, C, G]  (index 0 = A = highest string)
// ══════════════════════════════════════════════════════════════════════════

const UKULELE_SHAPES = {

  'C': [
    { frets:[0,0,0,3], fingers:[0,0,0,3], baseFret:1, label:'Open' },
    { frets:[5,4,3,3], fingers:[4,3,1,2], barre:{fret:3,from:2,to:3}, baseFret:3, label:'High' },
  ],
  'Cm': [
    { frets:[3,3,3,5], fingers:[1,1,1,4], barre:{fret:3,from:0,to:2}, baseFret:3, label:'Barre III' },
    { frets:[0,3,3,3], fingers:[0,1,2,3], baseFret:3, label:'Alt' },
  ],
  'C7':     [{ frets:[0,0,0,1], fingers:[0,0,0,1], baseFret:1, label:'Open' }],
  'Cmaj7':  [{ frets:[0,0,0,2], fingers:[0,0,0,2], baseFret:1, label:'Open' }],
  'Cm7':    [{ frets:[3,3,3,3], fingers:[1,1,1,1], barre:{fret:3,from:0,to:3}, baseFret:3, label:'Barre III' }],
  'Csus2':  [{ frets:[0,2,0,0], fingers:[0,2,0,0], baseFret:1, label:'Open' }],
  'Csus4':  [{ frets:[0,0,1,3], fingers:[0,0,1,3], baseFret:1, label:'Open' }],
  'Cadd9':  [{ frets:[0,2,0,3], fingers:[0,2,0,3], baseFret:1, label:'Open' }],
  'C5':     [{ frets:[0,-1,0,3], fingers:[0,0,0,3], baseFret:1, label:'Power' }],

  'C#': [
    { frets:[1,1,1,4], fingers:[1,1,1,4], barre:{fret:1,from:0,to:2}, baseFret:1, label:'Barre I' },
    { frets:[6,5,4,4], fingers:[4,3,1,2], barre:{fret:4,from:2,to:3}, baseFret:4, label:'High' },
  ],
  'C#m':    [{ frets:[4,4,4,6], fingers:[1,1,1,4], barre:{fret:4,from:0,to:2}, baseFret:4, label:'Barre IV' }],
  'C#7':    [{ frets:[1,1,1,2], fingers:[1,1,1,2], barre:{fret:1,from:0,to:2}, baseFret:1, label:'Barre I' }],
  'C#maj7': [{ frets:[1,1,1,3], fingers:[1,1,1,3], barre:{fret:1,from:0,to:2}, baseFret:1, label:'Barre I' }],
  'C#m7':   [{ frets:[4,4,4,4], fingers:[1,1,1,1], barre:{fret:4,from:0,to:3}, baseFret:4, label:'Barre IV' }],
  'C#sus2': [{ frets:[1,3,1,1], fingers:[1,3,1,1], baseFret:1, label:'Open' }],
  'C#sus4': [{ frets:[1,1,2,4], fingers:[1,1,2,4], baseFret:1, label:'Open' }],
  'C#add9': [{ frets:[1,1,1,4], fingers:[1,1,1,4], barre:{fret:1,from:0,to:2}, baseFret:1, label:'Barre I' }],
  'C#5':    [{ frets:[1,-1,1,4], fingers:[1,0,1,4], baseFret:1, label:'Power' }],

  'D': [
    { frets:[2,2,2,0], fingers:[1,2,3,0], baseFret:1, label:'Open' },
    { frets:[5,2,2,2], fingers:[4,1,2,3], baseFret:2, label:'Alt' },
  ],
  'Dm': [
    { frets:[2,2,1,0], fingers:[2,3,1,0], baseFret:1, label:'Open' },
    { frets:[5,5,5,3], fingers:[2,3,4,1], barre:{fret:5,from:0,to:2}, baseFret:3, label:'Alt' },
  ],
  'D7':     [{ frets:[2,2,2,3], fingers:[1,2,3,4], baseFret:1, label:'Open' }],
  'Dmaj7':  [{ frets:[2,2,2,4], fingers:[1,2,3,4], baseFret:2, label:'Open' }],
  'Dm7':    [{ frets:[2,2,1,3], fingers:[2,3,1,4], baseFret:1, label:'Open' }],
  'Dsus2':  [{ frets:[2,2,0,0], fingers:[1,2,0,0], baseFret:1, label:'Open' }],
  'Dsus4':  [{ frets:[0,2,3,0], fingers:[0,1,3,0], baseFret:1, label:'Open' }],
  'Dadd9':  [{ frets:[2,4,2,0], fingers:[2,4,1,0], baseFret:2, label:'Open' }],
  'D5':     [{ frets:[2,-1,2,0], fingers:[2,0,1,0], baseFret:1, label:'Power' }],

  'D#':     [{ frets:[3,3,3,1], fingers:[2,3,4,1], baseFret:1, label:'Open' }],
  'D#m':    [{ frets:[3,3,2,1], fingers:[3,4,2,1], baseFret:1, label:'Open' }],
  'D#7':    [{ frets:[3,3,3,4], fingers:[1,2,3,4], baseFret:3, label:'Open' }],
  'D#maj7': [{ frets:[3,3,3,5], fingers:[1,2,3,4], baseFret:3, label:'Open' }],
  'D#m7':   [{ frets:[3,3,2,4], fingers:[2,3,1,4], baseFret:3, label:'Open' }],
  'D#sus2': [{ frets:[3,3,1,1], fingers:[2,3,1,1], baseFret:1, label:'Open' }],
  'D#sus4': [{ frets:[1,3,4,1], fingers:[1,3,4,1], baseFret:1, label:'Open' }],
  'D#add9': [{ frets:[3,3,3,1], fingers:[2,3,4,1], baseFret:1, label:'Open' }],
  'D#5':    [{ frets:[3,-1,3,1], fingers:[3,0,2,1], baseFret:1, label:'Power' }],

  'E': [
    { frets:[2,4,4,2], fingers:[1,3,4,1], barre:{fret:2,from:0,to:3}, baseFret:2, label:'Barre II' },
    { frets:[4,4,4,2], fingers:[2,3,4,1], baseFret:2, label:'Alt' },
  ],
  'Em': [
    { frets:[0,4,3,2], fingers:[0,4,3,2], baseFret:2, label:'Open' },
    { frets:[4,3,2,0], fingers:[3,2,1,0], baseFret:2, label:'Alt' },
  ],
  'E7':     [{ frets:[1,2,0,2], fingers:[1,3,0,2], baseFret:1, label:'Open' }],
  'Emaj7':  [{ frets:[1,3,0,2], fingers:[1,3,0,2], baseFret:1, label:'Open' }],
  'Em7':    [{ frets:[0,2,0,2], fingers:[0,2,0,3], baseFret:1, label:'Open' }],
  'Esus2':  [{ frets:[2,4,2,2], fingers:[1,4,1,1], barre:{fret:2,from:0,to:3}, baseFret:2, label:'Barre II' }],
  'Esus4':  [{ frets:[2,2,0,2], fingers:[2,3,0,1], baseFret:2, label:'Open' }],
  'Eadd9':  [{ frets:[2,4,2,4], fingers:[1,3,1,4], baseFret:2, label:'Barre II' }],
  'E5':     [{ frets:[2,-1,4,2], fingers:[1,0,4,1], baseFret:2, label:'Power' }],

  'F': [
    { frets:[0,1,1,2], fingers:[0,1,1,2], barre:{fret:1,from:1,to:2}, baseFret:1, label:'Open' },
    { frets:[2,0,1,0], fingers:[2,0,1,0], baseFret:1, label:'Alt Open' },
  ],
  'Fm':     [{ frets:[1,1,0,1], fingers:[2,3,0,1], barre:{fret:1,from:0,to:3}, baseFret:1, label:'Barre I' }],
  'F7':     [{ frets:[0,1,1,0], fingers:[0,1,2,0], baseFret:1, label:'Open' }],
  'Fmaj7':  [{ frets:[0,1,1,3], fingers:[0,1,1,3], baseFret:1, label:'Open' }],
  'Fm7':    [{ frets:[1,1,0,3], fingers:[1,1,0,3], baseFret:1, label:'Open' }],
  'Fsus2':  [{ frets:[0,3,1,0], fingers:[0,3,1,0], baseFret:1, label:'Open' }],
  'Fsus4':  [{ frets:[0,1,3,0], fingers:[0,1,3,0], baseFret:1, label:'Open' }],
  'Fadd9':  [{ frets:[0,1,1,2], fingers:[0,1,2,3], baseFret:1, label:'Open' }],
  'F5':     [{ frets:[0,-1,1,2], fingers:[0,0,1,2], baseFret:1, label:'Power' }],

  'F#': [
    { frets:[1,2,2,3], fingers:[1,2,3,4], baseFret:1, label:'Open' },
    { frets:[3,2,2,1], fingers:[3,2,2,1], barre:{fret:2,from:1,to:2}, baseFret:1, label:'Alt' },
  ],
  'F#m':    [{ frets:[2,2,1,2], fingers:[2,3,1,4], barre:{fret:2,from:0,to:3}, baseFret:2, label:'Barre II' }],
  'F#7':    [{ frets:[1,2,2,0], fingers:[1,2,3,0], baseFret:1, label:'Open' }],
  'F#maj7': [{ frets:[1,2,2,4], fingers:[1,2,3,4], baseFret:1, label:'Open' }],
  'F#m7':   [{ frets:[2,2,1,0], fingers:[2,3,1,0], baseFret:2, label:'Open' }],
  'F#sus2': [{ frets:[1,4,2,1], fingers:[1,4,2,1], baseFret:1, label:'Open' }],
  'F#sus4': [{ frets:[1,2,4,1], fingers:[1,2,4,1], baseFret:1, label:'Open' }],
  'F#add9': [{ frets:[1,2,2,3], fingers:[1,2,3,4], baseFret:1, label:'Open' }],
  'F#5':    [{ frets:[1,-1,2,3], fingers:[1,0,2,4], baseFret:1, label:'Power' }],

  'G': [
    { frets:[2,3,2,0], fingers:[2,3,1,0], baseFret:1, label:'Open' },
    { frets:[0,2,3,2], fingers:[0,1,3,2], baseFret:1, label:'Alt Open' },
  ],
  'Gm':     [{ frets:[0,2,3,1], fingers:[0,2,4,1], baseFret:1, label:'Open' }],
  'G7': [
    { frets:[2,1,2,0], fingers:[2,1,3,0], baseFret:1, label:'Open' },
    { frets:[0,2,1,2], fingers:[0,2,1,3], baseFret:1, label:'Alt Open' },
  ],
  'Gmaj7':  [{ frets:[2,2,2,0], fingers:[2,3,1,0], baseFret:2, label:'Open' }],
  'Gm7':    [{ frets:[0,2,1,1], fingers:[0,3,1,2], baseFret:1, label:'Open' }],
  'Gsus2':  [{ frets:[0,2,2,0], fingers:[0,1,2,0], baseFret:1, label:'Open' }],
  'Gsus4':  [{ frets:[0,2,3,3], fingers:[0,1,2,3], baseFret:1, label:'Open' }],
  'Gadd9':  [{ frets:[2,3,2,2], fingers:[2,4,1,3], baseFret:2, label:'Open' }],
  'G5':     [{ frets:[2,-1,2,0], fingers:[2,0,1,0], baseFret:1, label:'Power' }],

  'G#':     [{ frets:[3,4,3,1], fingers:[3,4,2,1], baseFret:1, label:'Open' }],
  'G#m':    [{ frets:[1,3,4,2], fingers:[1,3,4,2], baseFret:1, label:'Open' }],
  'G#7':    [{ frets:[3,2,3,1], fingers:[3,2,4,1], baseFret:1, label:'Open' }],
  'G#maj7': [{ frets:[3,3,3,1], fingers:[2,3,4,1], baseFret:1, label:'Open' }],
  'G#m7':   [{ frets:[1,3,2,2], fingers:[1,4,2,3], baseFret:1, label:'Open' }],
  'G#sus2': [{ frets:[1,3,3,1], fingers:[1,3,4,1], barre:{fret:1,from:0,to:3}, baseFret:1, label:'Open' }],
  'G#sus4': [{ frets:[1,3,4,4], fingers:[1,2,3,4], baseFret:1, label:'Open' }],
  'G#add9': [{ frets:[3,4,3,1], fingers:[3,4,2,1], baseFret:1, label:'Open' }],
  'G#5':    [{ frets:[3,-1,3,1], fingers:[3,0,2,1], baseFret:1, label:'Power' }],

  'A': [
    { frets:[0,1,0,0], fingers:[0,1,0,0], baseFret:1, label:'Open' },
    { frets:[2,1,0,0], fingers:[2,1,0,0], baseFret:1, label:'Alt Open' },
  ],
  'Am': [
    { frets:[0,0,0,2], fingers:[0,0,0,2], baseFret:1, label:'Open' },
    { frets:[2,0,0,0], fingers:[1,0,0,0], baseFret:1, label:'Alt Open' },
  ],
  'A7':     [{ frets:[0,1,0,2], fingers:[0,1,0,2], baseFret:1, label:'Open' }],
  'Amaj7':  [{ frets:[0,1,0,1], fingers:[0,1,0,2], baseFret:1, label:'Open' }],
  'Am7':    [{ frets:[0,0,0,0], fingers:[0,0,0,0], baseFret:1, label:'Open (all open)' }],
  'Asus2':  [{ frets:[2,1,0,0], fingers:[2,1,0,0], baseFret:1, label:'Open' }],
  'Asus4':  [{ frets:[0,2,0,0], fingers:[0,2,0,0], baseFret:1, label:'Open' }],
  'Aadd9':  [{ frets:[2,1,0,0], fingers:[2,1,0,0], baseFret:1, label:'Open' }],
  'A5':     [{ frets:[0,-1,0,0], fingers:[0,0,0,0], baseFret:1, label:'Power' }],

  'A#': [
    { frets:[1,2,1,1], fingers:[1,3,2,1], barre:{fret:1,from:0,to:3}, baseFret:1, label:'Barre I' },
    { frets:[3,2,1,1], fingers:[3,2,1,1], baseFret:1, label:'Alt' },
  ],
  'A#m':    [{ frets:[1,1,1,3], fingers:[1,1,1,3], barre:{fret:1,from:0,to:2}, baseFret:1, label:'Barre I' }],
  'A#7':    [{ frets:[1,2,1,3], fingers:[1,2,1,3], baseFret:1, label:'Open' }],
  'A#maj7': [{ frets:[1,2,1,0], fingers:[1,3,2,0], baseFret:1, label:'Open' }],
  'A#m7':   [{ frets:[1,1,1,1], fingers:[1,1,1,1], barre:{fret:1,from:0,to:3}, baseFret:1, label:'Barre I' }],
  'A#sus2': [{ frets:[3,2,1,1], fingers:[3,2,1,1], baseFret:1, label:'Open' }],
  'A#sus4': [{ frets:[1,3,1,1], fingers:[1,3,1,1], barre:{fret:1,from:0,to:3}, baseFret:1, label:'Barre I' }],
  'A#add9': [{ frets:[1,2,1,1], fingers:[1,3,2,1], barre:{fret:1,from:0,to:3}, baseFret:1, label:'Barre I' }],
  'A#5':    [{ frets:[1,-1,1,1], fingers:[1,0,1,1], baseFret:1, label:'Power' }],

  'B': [
    { frets:[2,3,2,2], fingers:[2,3,1,1], barre:{fret:2,from:0,to:3}, baseFret:2, label:'Barre II' },
    { frets:[4,3,2,2], fingers:[4,3,1,2], baseFret:2, label:'Alt' },
  ],
  'Bm':     [{ frets:[2,2,2,4], fingers:[1,1,1,4], barre:{fret:2,from:0,to:2}, baseFret:2, label:'Barre II' }],
  'B7':     [{ frets:[2,3,2,0], fingers:[2,3,1,0], baseFret:2, label:'Open' }],
  'Bmaj7':  [{ frets:[2,3,2,1], fingers:[2,4,3,1], baseFret:2, label:'Open' }],
  'Bm7':    [{ frets:[2,2,2,2], fingers:[1,1,1,1], barre:{fret:2,from:0,to:3}, baseFret:2, label:'Barre II' }],
  'Bsus2':  [{ frets:[4,3,2,2], fingers:[4,3,1,1], baseFret:2, label:'Open' }],
  'Bsus4':  [{ frets:[2,4,2,2], fingers:[1,4,1,1], barre:{fret:2,from:0,to:3}, baseFret:2, label:'Barre II' }],
  'Badd9':  [{ frets:[2,3,2,2], fingers:[2,3,1,1], barre:{fret:2,from:0,to:3}, baseFret:2, label:'Barre II' }],
  'B5':     [{ frets:[2,-1,2,2], fingers:[1,0,2,3], baseFret:2, label:'Power' }],
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
//  PIANO SHAPES — arrays with label field
// ══════════════════════════════════════════════════════════════════════════

const PIANO_SHAPES = {
  'C':      [{ notes:['C','E','G'],              label:'C major — root position' },
             { notes:['E','G','C'],              label:'C major — 1st inversion' }],
  'Cm':     [{ notes:['C','D#','G'],             label:'C minor — root position' }],
  'C7':     [{ notes:['C','E','G','A#'],         label:'C dom7 — root position' }],
  'Cmaj7':  [{ notes:['C','E','G','B'],          label:'Cmaj7 — root position' }],
  'Cm7':    [{ notes:['C','D#','G','A#'],        label:'Cm7 — root position' }],
  'Csus2':  [{ notes:['C','D','G'],              label:'Csus2' }],
  'Csus4':  [{ notes:['C','F','G'],              label:'Csus4' }],
  'Cadd9':  [{ notes:['C','D','E','G'],          label:'Cadd9' }],
  'C5':     [{ notes:['C','G'],                  label:'C power' }],

  'C#':     [{ notes:['C#','F','G#'],            label:'C♯ major' }],
  'C#m':    [{ notes:['C#','E','G#'],            label:'C♯ minor' }],
  'C#7':    [{ notes:['C#','F','G#','B'],        label:'C♯ dom7' }],
  'C#maj7': [{ notes:['C#','F','G#','C'],        label:'C♯ maj7' }],
  'C#m7':   [{ notes:['C#','E','G#','B'],        label:'C♯ m7' }],
  'C#sus2': [{ notes:['C#','D#','G#'],           label:'C♯ sus2' }],
  'C#sus4': [{ notes:['C#','F#','G#'],           label:'C♯ sus4' }],
  'C#add9': [{ notes:['C#','D#','F','G#'],       label:'C♯ add9' }],
  'C#5':    [{ notes:['C#','G#'],                label:'C♯ power' }],

  'D':      [{ notes:['D','F#','A'],             label:'D major' },
             { notes:['F#','A','D'],             label:'D major — 1st inv.' }],
  'Dm':     [{ notes:['D','F','A'],              label:'D minor' }],
  'D7':     [{ notes:['D','F#','A','C'],         label:'D dom7' }],
  'Dmaj7':  [{ notes:['D','F#','A','C#'],        label:'Dmaj7' }],
  'Dm7':    [{ notes:['D','F','A','C'],          label:'Dm7' }],
  'Dsus2':  [{ notes:['D','E','A'],              label:'Dsus2' }],
  'Dsus4':  [{ notes:['D','G','A'],              label:'Dsus4' }],
  'Dadd9':  [{ notes:['D','E','F#','A'],         label:'Dadd9' }],
  'D5':     [{ notes:['D','A'],                  label:'D power' }],

  'D#':     [{ notes:['D#','G','A#'],            label:'E♭ major' }],
  'D#m':    [{ notes:['D#','F#','A#'],           label:'E♭ minor' }],
  'D#7':    [{ notes:['D#','G','A#','C#'],       label:'E♭ dom7' }],
  'D#maj7': [{ notes:['D#','G','A#','D'],        label:'E♭ maj7' }],
  'D#m7':   [{ notes:['D#','F#','A#','C#'],      label:'E♭ m7' }],
  'D#sus2': [{ notes:['D#','F','A#'],            label:'E♭ sus2' }],
  'D#sus4': [{ notes:['D#','G#','A#'],           label:'E♭ sus4' }],
  'D#add9': [{ notes:['D#','F','G','A#'],        label:'E♭ add9' }],
  'D#5':    [{ notes:['D#','A#'],                label:'E♭ power' }],

  'E':      [{ notes:['E','G#','B'],             label:'E major' },
             { notes:['G#','B','E'],             label:'E major — 1st inv.' }],
  'Em':     [{ notes:['E','G','B'],              label:'E minor' }],
  'E7':     [{ notes:['E','G#','B','D'],         label:'E dom7' }],
  'Emaj7':  [{ notes:['E','G#','B','D#'],        label:'Emaj7' }],
  'Em7':    [{ notes:['E','G','B','D'],          label:'Em7' }],
  'Esus2':  [{ notes:['E','F#','B'],             label:'Esus2' }],
  'Esus4':  [{ notes:['E','A','B'],              label:'Esus4' }],
  'Eadd9':  [{ notes:['E','F#','G#','B'],        label:'Eadd9' }],
  'E5':     [{ notes:['E','B'],                  label:'E power' }],

  'F':      [{ notes:['F','A','C'],              label:'F major' }],
  'Fm':     [{ notes:['F','G#','C'],             label:'F minor' }],
  'F7':     [{ notes:['F','A','C','D#'],         label:'F dom7' }],
  'Fmaj7':  [{ notes:['F','A','C','E'],          label:'Fmaj7' }],
  'Fm7':    [{ notes:['F','G#','C','D#'],        label:'Fm7' }],
  'Fsus2':  [{ notes:['F','G','C'],              label:'Fsus2' }],
  'Fsus4':  [{ notes:['F','A#','C'],             label:'Fsus4' }],
  'Fadd9':  [{ notes:['F','G','A','C'],          label:'Fadd9' }],
  'F5':     [{ notes:['F','C'],                  label:'F power' }],

  'F#':     [{ notes:['F#','A#','C#'],           label:'F♯ major' }],
  'F#m':    [{ notes:['F#','A','C#'],            label:'F♯ minor' }],
  'F#7':    [{ notes:['F#','A#','C#','E'],       label:'F♯ dom7' }],
  'F#maj7': [{ notes:['F#','A#','C#','F'],       label:'F♯ maj7' }],
  'F#m7':   [{ notes:['F#','A','C#','E'],        label:'F♯ m7' }],
  'F#sus2': [{ notes:['F#','G#','C#'],           label:'F♯ sus2' }],
  'F#sus4': [{ notes:['F#','B','C#'],            label:'F♯ sus4' }],
  'F#add9': [{ notes:['F#','G#','A#','C#'],      label:'F♯ add9' }],
  'F#5':    [{ notes:['F#','C#'],                label:'F♯ power' }],

  'G':      [{ notes:['G','B','D'],              label:'G major' },
             { notes:['B','D','G'],              label:'G major — 1st inv.' }],
  'Gm':     [{ notes:['G','A#','D'],             label:'G minor' }],
  'G7':     [{ notes:['G','B','D','F'],          label:'G dom7' }],
  'Gmaj7':  [{ notes:['G','B','D','F#'],         label:'Gmaj7' }],
  'Gm7':    [{ notes:['G','A#','D','F'],         label:'Gm7' }],
  'Gsus2':  [{ notes:['G','A','D'],              label:'Gsus2' }],
  'Gsus4':  [{ notes:['G','C','D'],              label:'Gsus4' }],
  'Gadd9':  [{ notes:['G','A','B','D'],          label:'Gadd9' }],
  'G5':     [{ notes:['G','D'],                  label:'G power' }],

  'G#':     [{ notes:['G#','C','D#'],            label:'A♭ major' }],
  'G#m':    [{ notes:['G#','B','D#'],            label:'A♭ minor' }],
  'G#7':    [{ notes:['G#','C','D#','F#'],       label:'A♭ dom7' }],
  'G#maj7': [{ notes:['G#','C','D#','G'],        label:'A♭ maj7' }],
  'G#m7':   [{ notes:['G#','B','D#','F#'],       label:'A♭ m7' }],
  'G#sus2': [{ notes:['G#','A#','D#'],           label:'A♭ sus2' }],
  'G#sus4': [{ notes:['G#','C#','D#'],           label:'A♭ sus4' }],
  'G#add9': [{ notes:['G#','A#','C','D#'],       label:'A♭ add9' }],
  'G#5':    [{ notes:['G#','D#'],                label:'A♭ power' }],

  'A':      [{ notes:['A','C#','E'],             label:'A major' },
             { notes:['C#','E','A'],             label:'A major — 1st inv.' }],
  'Am':     [{ notes:['A','C','E'],              label:'A minor' }],
  'A7':     [{ notes:['A','C#','E','G'],         label:'A dom7' }],
  'Amaj7':  [{ notes:['A','C#','E','G#'],        label:'Amaj7' }],
  'Am7':    [{ notes:['A','C','E','G'],          label:'Am7' }],
  'Asus2':  [{ notes:['A','B','E'],              label:'Asus2' }],
  'Asus4':  [{ notes:['A','D','E'],              label:'Asus4' }],
  'Aadd9':  [{ notes:['A','B','C#','E'],         label:'Aadd9' }],
  'A5':     [{ notes:['A','E'],                  label:'A power' }],

  'A#':     [{ notes:['A#','D','F'],             label:'B♭ major' }],
  'A#m':    [{ notes:['A#','C#','F'],            label:'B♭ minor' }],
  'A#7':    [{ notes:['A#','D','F','G#'],        label:'B♭ dom7' }],
  'A#maj7': [{ notes:['A#','D','F','A'],         label:'B♭ maj7' }],
  'A#m7':   [{ notes:['A#','C#','F','G#'],       label:'B♭ m7' }],
  'A#sus2': [{ notes:['A#','C','F'],             label:'B♭ sus2' }],
  'A#sus4': [{ notes:['A#','D#','F'],            label:'B♭ sus4' }],
  'A#add9': [{ notes:['A#','C','D','F'],         label:'B♭ add9' }],
  'A#5':    [{ notes:['A#','F'],                 label:'B♭ power' }],

  'B':      [{ notes:['B','D#','F#'],            label:'B major' }],
  'Bm':     [{ notes:['B','D','F#'],             label:'B minor' }],
  'B7':     [{ notes:['B','D#','F#','A'],        label:'B dom7' }],
  'Bmaj7':  [{ notes:['B','D#','F#','A#'],       label:'Bmaj7' }],
  'Bm7':    [{ notes:['B','D','F#','A'],         label:'Bm7' }],
  'Bsus2':  [{ notes:['B','C#','F#'],            label:'Bsus2' }],
  'Bsus4':  [{ notes:['B','E','F#'],             label:'Bsus4' }],
  'Badd9':  [{ notes:['B','C#','D#','F#'],       label:'Badd9' }],
  'B5':     [{ notes:['B','F#'],                 label:'B power' }],
};

// Piano enharmonic aliases
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

// Default export (backwards compat)
const CHORD_SHAPES = GUITAR_SHAPES;
export default CHORD_SHAPES;
export { GUITAR_SHAPES, UKULELE_SHAPES, PIANO_SHAPES, CHORD_SHAPES };