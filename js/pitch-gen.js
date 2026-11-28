// Flat-Key Jazz Harmony & Musical Voice-Leading Bassline Generator (Pitch BETA)
// Features real jazz harmonic blocks (Secondary Dominants, Tritone Subs, Backdoor Cadences,
// Passing Diminished, Modal Interchange) + Contour-Guided Basslines (Enclosures, Walking, Pocket)
// with strict flat/natural diatonic spelling (zero sharps!).

import { TIME_SIGS } from "./rhythm.js";

// Natural pitch classes for C D E F G A B
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
// Bass clef flat key signature order (up to 7 flats): Bb(-2), Eb(+1), Ab(-3), Db(0), Gb(-4), Cb(-1), Fb(-5)
export const BASS_FLAT_SIG_POS = [-2, 1, -3, 0, -4, -1, -5];
// Treble clef flat key signature order (up to 7 flats): Bb(0), Eb(+3), Ab(-1), Db(+2), Gb(-2), Cb(+1), Fb(-3)
export const TREBLE_FLAT_SIG_POS = [0, 3, -1, 2, -2, 1, -3];
export const FLAT_ORDER_LETTERS = [6, 2, 5, 1, 4, 0, 3]; // B, E, A, D, G, C, F

// All flat-side jazz keys (Major 0♭~7♭ & Minor 1♭~7♭)
export const JAZZ_KEYS = {
  "C":   { label: "C Maj (0♭)",   rootPc: 0,  flats: 0, minor: false },
  "F":   { label: "F Maj (1♭)",   rootPc: 5,  flats: 1, minor: false },
  "Bb":  { label: "B♭ Maj (2♭)",  rootPc: 10, flats: 2, minor: false },
  "Eb":  { label: "E♭ Maj (3♭)",  rootPc: 3,  flats: 3, minor: false },
  "Ab":  { label: "A♭ Maj (4♭)",  rootPc: 8,  flats: 4, minor: false },
  "Db":  { label: "D♭ Maj (5♭)",  rootPc: 1,  flats: 5, minor: false },
  "Gb":  { label: "G♭ Maj (6♭)",  rootPc: 6,  flats: 6, minor: false },
  "Cb":  { label: "C♭ Maj (7♭)",  rootPc: 11, flats: 7, minor: false },
  "Dm":  { label: "D min (1♭)",   rootPc: 2,  flats: 1, minor: true  },
  "Gm":  { label: "G min (2♭)",   rootPc: 7,  flats: 2, minor: true  },
  "Cm":  { label: "C min (3♭)",   rootPc: 0,  flats: 3, minor: true  },
  "Fm":  { label: "F min (4♭)",   rootPc: 5,  flats: 4, minor: true  },
  "Bbm": { label: "B♭ min (5♭)",  rootPc: 10, flats: 5, minor: true  },
  "Ebm": { label: "E♭ min (6♭)",  rootPc: 3,  flats: 6, minor: true  },
  "Abm": { label: "A♭ min (7♭)",  rootPc: 8,  flats: 7, minor: true  },
};

export const JAZZ_KEY_OPTIONS = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"];

export const JAZZ_PROG_OPTIONS = ["auto", "ii-V-I", "tritone", "backdoor", "I-vi-ii-V", "blues", "modal"];

// Flat-priority pitch-class names (zero sharps!) & Movable-Do relative degree names
export const FLAT_PC_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
export const DEGREE_NAMES = ["1", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♭6", "6", "♭7", "7"];

export function resolvePitchKey(keySetting, seed = 1) {
  if (keySetting && keySetting !== "RND" && JAZZ_KEYS[keySetting]) return keySetting;
  const r = mulberry32(((seed || 1) ^ 0x51F15EED) >>> 0);
  return JAZZ_KEY_OPTIONS[Math.floor(r() * JAZZ_KEY_OPTIONS.length)];
}

export function getRelativeDegreeName(midi, keyId) {
  const k = JAZZ_KEYS[keyId] || JAZZ_KEYS.C;
  const deg = ((((midi % 12) - k.rootPc) % 12) + 12) % 12;
  return DEGREE_NAMES[deg];
}
const FLAT_PC_SPELL = [
  [0, 0],  // C
  [1, -1], // Db
  [1, 0],  // D
  [2, -1], // Eb
  [2, 0],  // E
  [3, 0],  // F
  [4, -1], // Gb
  [4, 0],  // G
  [5, -1], // Ab
  [5, 0],  // A
  [6, -1], // Bb
  [6, 0],  // B
];

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function getKeySignatureAcc(keyId) {
  const k = JAZZ_KEYS[keyId] || JAZZ_KEYS.C;
  const acc = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < k.flats; i++) {
    acc[FLAT_ORDER_LETTERS[i]] = -1;
  }
  return acc;
}

// Spell a sounding MIDI note for either Bass Clef (E1..D3, written 1 oct up, mid=D3)
// or Treble Clef (C4..A5, concert pitch, mid=B4) using strict flat/natural spelling (zero sharps!)
export function spellBassMidi(midi, keyId = "C", clef = "bass") {
  const pc = ((midi % 12) + 12) % 12;
  const keyAcc = getKeySignatureAcc(keyId);

  let chosenLetter = -1;
  let chosenAcc = 0;
  for (let l = 0; l < 7; l++) {
    const natPc = (LETTER_PC[l] + keyAcc[l] + 12) % 12;
    if (natPc === pc) {
      chosenLetter = l;
      chosenAcc = keyAcc[l];
      break;
    }
  }
  if (chosenLetter === -1) {
    [chosenLetter, chosenAcc] = FLAT_PC_SPELL[pc];
  }

  const basePc = LETTER_PC[chosenLetter];
  const soundingOct = Math.round((midi - (basePc + chosenAcc)) / 12) - 1;
  const isTreble = clef === "treble";
  const writtenOct = isTreble ? soundingOct : (soundingOct + 1);
  // Bass clef middle line = D3 (oct 3, letter 1); Treble clef middle line = B4 (oct 4, letter 6)
  const staffPos = isTreble
    ? ((writtenOct - 4) * 7 + (chosenLetter - 6))
    : ((writtenOct - 3) * 7 + (chosenLetter - 1));
  const accStr = chosenAcc === -1 ? "♭" : "";
  const name = `${LETTER_NAMES[chosenLetter]}${accStr}`;
  return {
    midi,
    pc,
    letter: chosenLetter,
    acc: chosenAcc,
    soundingOct,
    writtenOct,
    staffPos,
    clef: isTreble ? "treble" : "bass",
    name,
    fullName: `${name}${soundingOct}`,
    freq: midiToFreq(midi),
  };
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function strHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Jazz chord qualities with authentic Bebop scales, safe tensions & explicit avoid notes:
// - chord     : Core chord tones (1, 3, 5, 7) — mandatory anchors on strong/on-beats & long sustains
// - tension   : Consonant jazz extensions (9, 13, #11, m7 11) — safe on weak on-beats & off-beats
// - bebopPass : 8-note Bebop / Symmetric Dominant passing tones — strictly stepwise on short off-beats!
// - avoid     : Clashing tones (e.g. natural 4 on maj7/dom7; W-H tones B/D/F/Ab on A°7) — never on on-beats!
const CHORD_QUAL = {
  maj7:   { suffix: "maj7",  chord: [0, 4, 7, 11], tension: [2, 9],    bebopPass: [8],           avoid: [5],          scale: [0, 2, 4, 5, 7, 8, 9, 11] }, // Major Bebop
  maj6:   { suffix: "6",     chord: [0, 4, 7, 9],  tension: [2, 11],   bebopPass: [8],           avoid: [5],          scale: [0, 2, 4, 5, 7, 8, 9, 11] }, // Major 6/9 Bebop
  m7:     { suffix: "m7",    chord: [0, 3, 7, 10], tension: [2, 5, 9], bebopPass: [4, 11],       avoid: [],           scale: [0, 2, 3, 4, 5, 7, 9, 10] }, // Dorian Bebop
  dom7:   { suffix: "7",     chord: [0, 4, 7, 10], tension: [2, 9],    bebopPass: [11],          avoid: [5],          scale: [0, 2, 4, 5, 7, 9, 10, 11] }, // Bebop Dominant
  dom7b9: { suffix: "7♭9",   chord: [0, 4, 7, 10], tension: [1, 3, 8], bebopPass: [6, 9],        avoid: [5, 11],      scale: [0, 1, 3, 4, 6, 7, 8, 10] }, // Altered / H-W Dominant
  lyd7:   { suffix: "7",     chord: [0, 4, 7, 10], tension: [2, 6, 9], bebopPass: [11],          avoid: [5],          scale: [0, 2, 4, 6, 7, 9, 10, 11] }, // Lydian Dominant Bebop
  m7b5:   { suffix: "m7♭5",  chord: [0, 3, 6, 10], tension: [2, 5, 8], bebopPass: [7, 11],       avoid: [1],          scale: [0, 2, 3, 5, 6, 8, 10] },     // Locrian nat2
  // Symmetric Dominant (Half-Whole Diminished): A Bb C Db Eb E Gb G — chord tones on beats, H-W passing on off-beats; zero B♮ clash!
  dim7:   { suffix: "°7",    chord: [0, 3, 6, 9],  tension: [],        bebopPass: [1, 4, 7, 10], avoid: [2, 5, 8, 11], scale: [0, 1, 3, 4, 6, 7, 9, 10] },
};

function makeChord(keyRootPc, degreeSemi, qualKey, keyId) {
  const rootPc = (keyRootPc + degreeSemi + 12) % 12;
  const q = CHORD_QUAL[qualKey] || CHORD_QUAL.maj7;
  const spelled = spellBassMidi(36 + rootPc, keyId);
  const thirdOff = q.chord[1];
  const fifthOff = q.chord[2];
  const seventhOff = q.chord[3];
  return {
    symbol: `${spelled.name}${q.suffix}`,
    rootPc,
    qual: qualKey,
    chordPcs: new Set(q.chord.map(o => (rootPc + o) % 12)),
    tensionPcs: new Set((q.tension || []).map(o => (rootPc + o) % 12)),
    bebopPassPcs: new Set((q.bebopPass || []).map(o => (rootPc + o) % 12)),
    avoidPcs: new Set((q.avoid || []).map(o => (rootPc + o) % 12)),
    scalePcs: new Set(q.scale.map(o => (rootPc + o) % 12)),
    thirdPc: (rootPc + thirdOff) % 12,
    fifthPc: (rootPc + fifthOff) % 12,
    seventhPc: (rootPc + seventhOff) % 12,
    guidePcs: new Set([(rootPc + thirdOff) % 12, (rootPc + seventhOff) % 12]),
  };
}

// Modern Jazz-Pop Song Form Harmony Pools (Verse -> Pre-Chorus -> Chorus -> Bridge)
// VERSE: grounded, storytelling tonic anchor
const MAJOR_VERSE = [
  [[0, "maj7"], [9, "m7"], [2, "m7"], [7, "dom7"]],      // Imaj7 -> vi7 -> ii7 -> V7
  [[0, "maj7"], [9, "dom7"], [2, "m7"], [7, "dom7"]],    // Imaj7 -> VI7 -> ii7 -> V7
  [[0, "maj7"], [2, "m7"], [1, "lyd7"], [0, "maj7"]],    // Imaj7 -> ii7 -> bII7 -> Imaj7 (Tritone sub)
  [[0, "maj7"], [3, "dim7"], [2, "m7"], [7, "dom7"]],    // Imaj7 -> bIIIdim7 -> ii7 -> V7
];
// PRE-CHORUS: predominant lift -> dominant build-up ramp!
const MAJOR_PRE = [
  [[5, "maj7"], [5, "m7"], [4, "m7"], [9, "dom7"]],      // IVmaj7 -> iv7 -> iii7 -> VI7 (Classic build!)
  [[2, "m7"], [4, "m7"], [5, "maj7"], [7, "dom7"]],      // ii7 -> iii7 -> IVmaj7 -> V7 (Ascending bass ramp!)
  [[5, "maj7"], [2, "dom7"], [2, "m7"], [7, "dom7"]],    // IVmaj7 -> II7 -> ii7 -> V7
];
// CHORUS: bright, anthemic Jazz-Pop / Royal-Road / Backdoor hook!
const MAJOR_CHORUS = [
  [[5, "maj7"], [7, "dom7"], [4, "m7"], [9, "m7"]],      // IVmaj7 -> V7 -> iii7 -> vi7 (Royal Road / J-Pop Jazz!)
  [[5, "maj7"], [5, "m7"], [10, "dom7"], [0, "maj7"]],   // IVmaj7 -> iv7 -> bVII7 -> Imaj7 (Lush Backdoor!)
  [[0, "maj7"], [7, "dom7"], [9, "m7"], [5, "maj7"]],    // Imaj7 -> V7 -> vi7 -> IVmaj7
  [[2, "m7"], [7, "dom7"], [0, "maj7"], [0, "maj6"]],    // ii7 -> V7 -> Imaj7 -> I6 (Cadential Chorus end)
];
// BRIDGE: harmonic contrast & modulation color
const MAJOR_BRIDGE = [
  [[0, "maj7"], [10, "maj7"], [8, "maj7"], [7, "dom7"]], // Imaj7 -> bVIImaj7 -> bVImaj7 -> V7 (Modal interchange!)
  [[4, "m7"], [9, "dom7"], [2, "dom7"], [7, "dom7"]],    // iii7 -> VI7 -> II7 -> V7 (Cycle of dominants)
  [[0, "dom7"], [5, "maj7"], [5, "m7"], [7, "dom7"]],    // I7 -> IVmaj7 -> iv7 -> V7
];

const MINOR_VERSE = [
  [[0, "m7"], [5, "m7"], [2, "m7b5"], [7, "dom7b9"]],    // im7 -> iv7 -> iiø7 -> V7b9
  [[0, "m7"], [8, "maj7"], [2, "m7b5"], [7, "dom7b9"]],  // im7 -> bVImaj7 -> iiø7 -> V7b9
  [[0, "m7"], [2, "m7b5"], [1, "lyd7"], [0, "m7"]],      // im7 -> iiø7 -> bII7 -> im7
];
const MINOR_PRE = [
  [[5, "m7"], [10, "dom7"], [3, "maj7"], [7, "dom7b9"]], // iv7 -> bVII7 -> bIIImaj7 -> V7b9
  [[8, "maj7"], [10, "dom7"], [2, "m7b5"], [7, "dom7b9"]],// bVImaj7 -> bVII7 -> iiø7 -> V7b9
];
const MINOR_CHORUS = [
  [[5, "m7"], [10, "dom7"], [3, "maj7"], [8, "maj7"]],   // Autumn Leaves hook: iv7 -> bVII7 -> bIIImaj7 -> bVImaj7
  [[0, "m7"], [8, "maj7"], [10, "dom7"], [0, "m7"]],     // Anthemic minor hook: im7 -> bVImaj7 -> bVII7 -> im7
  [[2, "m7b5"], [7, "dom7b9"], [0, "m7"], [0, "m7"]],    // Strong minor resolution
];
const MINOR_BRIDGE = [
  [[3, "maj7"], [8, "maj7"], [2, "m7b5"], [7, "dom7b9"]],// Relative Major lift -> iiø7 -> V7b9
  [[5, "m7"], [5, "m7"], [1, "lyd7"], [7, "dom7b9"]],    // Subdominant tension -> Tritone -> V7b9
];

// Build authentic 8-bar-section Song Form per bar:
// - 8B : Verse (8)
// - 12B: Verse (8) -> Chorus (4)
// - 16B: Verse (8) -> Chorus (8)
// - 24B: Verse (8) -> Pre (8) -> Chorus (8)
// - 32B: Verse (8) -> Pre (8) -> Chorus (8) -> Bridge/Chorus' (8)
export function buildSongForm(numBars) {
  const plan = [];
  if (numBars <= 8) {
    // 2, 4, 8 bars: single cohesive Verse section (8 bars = 4+4 period)
    for (let b = 0; b < numBars; b++) {
      plan.push({
        section: "Verse",
        role: b < 4 ? "VERSE" : "CHORUS_END",
        isSectionStart: b === 0,
        phraseBar: b % 4,
        secBar: b,
        phraseLen: Math.min(4, numBars),
        isFinalBar: b === numBars - 1,
      });
    }
    return plan;
  }
  if (numBars === 12) {
    // 12 bars: Verse (1-8) -> Chorus (9-12)
    for (let b = 0; b < 12; b++) {
      const isCh = b >= 8;
      plan.push({
        section: isCh ? "Chorus" : "Verse",
        role: isCh ? "CHORUS_END" : "VERSE",
        isSectionStart: b === 0 || b === 8,
        phraseBar: b % 4,
        secBar: isCh ? (b - 8) : b,
        phraseLen: 4,
        isFinalBar: b === 11,
      });
    }
    return plan;
  }
  if (numBars === 16) {
    // 16 bars: classic 8+8 -> Verse (1-8) -> Chorus (9-16)
    const chunkDefs = [
      { sec: "Verse",  role: "VERSE",      start: true  }, // 1-4
      { sec: "Verse",  role: "VERSE",      start: false }, // 5-8
      { sec: "Chorus", role: "CHORUS",     start: true  }, // 9-12
      { sec: "Chorus", role: "CHORUS_END", start: false }, // 13-16
    ];
    for (let b = 0; b < 16; b++) {
      const def = chunkDefs[Math.floor(b / 4)];
      plan.push({
        section: def.sec,
        role: def.role,
        isSectionStart: (b % 4) === 0 && def.start,
        phraseBar: b % 4,
        secBar: b % 8,
        phraseLen: 4,
        isFinalBar: b === 15,
      });
    }
    return plan;
  }
  if (numBars === 24) {
    // 24 bars: iconic 8+8+8 -> Verse (1-8) -> Pre (9-16) -> Chorus (17-24)
    const chunkDefs = [
      { sec: "Verse",  role: "VERSE",      start: true  }, // 1-4
      { sec: "Verse",  role: "VERSE",      start: false }, // 5-8
      { sec: "Pre",    role: "PRE",        start: true  }, // 9-12
      { sec: "Pre",    role: "PRE",        start: false }, // 13-16
      { sec: "Chorus", role: "CHORUS",     start: true  }, // 17-20
      { sec: "Chorus", role: "CHORUS_END", start: false }, // 21-24
    ];
    for (let b = 0; b < 24; b++) {
      const def = chunkDefs[Math.floor(b / 4)];
      plan.push({
        section: def.sec,
        role: def.role,
        isSectionStart: (b % 4) === 0 && def.start,
        phraseBar: b % 4,
        secBar: b % 8,
        phraseLen: 4,
        isFinalBar: b === 23,
      });
    }
    return plan;
  }
  // 32 bars: full 8+8+8+8 Pop-Jazz Song! Verse (1-8) -> Pre (9-16) -> Chorus (17-24) -> Bridge/Chorus' (25-32)
  const chunkDefs = [
    { sec: "Verse",   role: "VERSE",      start: true  }, // 1-4
    { sec: "Verse",   role: "VERSE",      start: false }, // 5-8
    { sec: "Pre",     role: "PRE",        start: true  }, // 9-12
    { sec: "Pre",     role: "PRE",        start: false }, // 13-16
    { sec: "Chorus",  role: "CHORUS",     start: true  }, // 17-20
    { sec: "Chorus",  role: "CHORUS_END", start: false }, // 21-24
    { sec: "Bridge",  role: "BRIDGE",     start: true  }, // 25-28
    { sec: "Bridge",  role: "CHORUS_END", start: false }, // 29-32
  ];
  for (let b = 0; b < numBars; b++) {
    const c4 = Math.floor(b / 4) % chunkDefs.length;
    const def = chunkDefs[c4];
    plan.push({
      section: def.sec,
      role: def.role,
      isSectionStart: (b % 4) === 0 && def.start,
      phraseBar: b % 4,
      secBar: b % 8,
      phraseLen: 4,
      isFinalBar: b === numBars - 1,
    });
  }
  return plan;
}

// 1. Phrase-Structured Jazz-Pop Chord Progression Generator
export function generateChordProgression(numBars, keyId, progType, rand) {
  const k = JAZZ_KEYS[keyId] || JAZZ_KEYS.Bb;
  const r = k.rootPc;
  const isMin = k.minor;

  const chords = [];
  if (progType === "modal") {
    const c = makeChord(r, 0, isMin ? "m7" : "maj7", keyId);
    for (let i = 0; i < numBars; i++) chords.push(c);
    return chords;
  }

  if (progType === "ii-V-I") {
    const cycle = isMin
      ? [[2, "m7b5"], [7, "dom7b9"], [0, "m7"], [7, "dom7b9"]]
      : [[2, "m7"], [7, "dom7"], [0, "maj7"], [9, "dom7"]];
    for (let i = 0; i < numBars; i++) {
      const idx = (i === numBars - 1 && numBars >= 4) ? 2 : (i % cycle.length);
      const [deg, q] = cycle[idx];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  if (progType === "tritone") {
    const cycle = isMin
      ? [[2, "m7b5"], [1, "lyd7"], [0, "m7"], [8, "dom7"]]
      : [[2, "m7"], [1, "lyd7"], [0, "maj7"], [9, "dom7"]];
    for (let i = 0; i < numBars; i++) {
      const idx = (i === numBars - 1 && numBars >= 4) ? 2 : (i % cycle.length);
      const [deg, q] = cycle[idx];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  if (progType === "backdoor") {
    const cycle = isMin
      ? [[0, "m7"], [5, "m7"], [10, "dom7"], [3, "maj7"]]
      : [[5, "maj7"], [5, "m7"], [10, "dom7"], [0, "maj7"]];
    for (let i = 0; i < numBars; i++) {
      const [deg, q] = cycle[i % cycle.length];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  if (progType === "I-vi-ii-V") {
    const cycle = isMin
      ? [[0, "m7"], [8, "maj7"], [2, "m7b5"], [7, "dom7b9"]]
      : [[0, "maj7"], [9, "m7"], [2, "m7"], [7, "dom7"]];
    for (let i = 0; i < numBars; i++) {
      const [deg, q] = cycle[i % cycle.length];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  if (progType === "blues") {
    const blues12 = isMin
      ? [[0, "m7"], [5, "m7"], [0, "m7"], [0, "m7"], [5, "m7"], [5, "m7"], [0, "m7"], [0, "m7"], [8, "maj7"], [7, "dom7b9"], [0, "m7"], [7, "dom7b9"]]
      : [[0, "dom7"], [5, "dom7"], [0, "dom7"], [0, "dom7"], [5, "dom7"], [5, "dom7"], [0, "dom7"], [9, "dom7"], [2, "m7"], [7, "dom7"], [0, "dom7"], [7, "dom7"]];
    for (let i = 0; i < numBars; i++) {
      const [deg, q] = blues12[i % 12];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  // "auto": Verse -> Pre-Chorus -> Chorus -> Bridge Song Composer
  if (numBars === 2) {
    const pairs = isMin
      ? [[[2, "m7b5"], [7, "dom7b9"]], [[0, "m7"], [7, "dom7b9"]], [[5, "m7"], [1, "lyd7"]]]
      : [[[2, "m7"], [7, "dom7"]], [[2, "m7"], [1, "lyd7"]], [[5, "m7"], [10, "dom7"]]];
    const p = pairs[Math.floor(rand() * pairs.length)];
    return p.map(([deg, q]) => makeChord(r, deg, q, keyId));
  }

  const formPlan = buildSongForm(numBars);
  const pools = isMin
    ? { VERSE: MINOR_VERSE, PRE: MINOR_PRE, CHORUS: MINOR_CHORUS, BRIDGE: MINOR_BRIDGE }
    : { VERSE: MAJOR_VERSE, PRE: MAJOR_PRE, CHORUS: MAJOR_CHORUS, BRIDGE: MAJOR_BRIDGE };

  // Lock in cohesive Verse & Chorus themes so returning sections sound like the same song!
  const verseTheme = pools.VERSE[Math.floor(rand() * pools.VERSE.length)];
  const chorusHook = pools.CHORUS[Math.floor(rand() * Math.min(3, pools.CHORUS.length))];
  const chorusResolve = isMin
    ? [[2, "m7b5"], [7, "dom7b9"], [0, "m7"], [0, "m7"]]
    : (rand() < 0.5 ? [[5, "maj7"], [5, "m7"], [10, "dom7"], [0, "maj7"]] : [[2, "m7"], [7, "dom7"], [0, "maj7"], [0, "maj6"]]);
  const totalChunks = Math.ceil(numBars / 4);

  for (let ch = 0; ch < totalChunks; ch++) {
    const role = formPlan[ch * 4]?.role || "CHORUS_END";
    let block;
    if (role === "VERSE") {
      block = (ch === 0) ? verseTheme : (rand() < 0.65 ? verseTheme : pools.VERSE[Math.floor(rand() * pools.VERSE.length)]);
    } else if (role === "PRE") {
      block = pools.PRE[Math.floor(rand() * pools.PRE.length)];
    } else if (role === "CHORUS") {
      block = (ch === totalChunks - 1) ? chorusResolve : chorusHook;
    } else if (role === "CHORUS_END") {
      block = chorusResolve;
    } else {
      block = pools.BRIDGE[Math.floor(rand() * pools.BRIDGE.length)];
    }
    for (const [deg, q] of block) {
      if (chords.length < numBars) {
        chords.push(makeChord(r, deg, q, keyId));
      }
    }
  }
  return chords;
}

// Playable 4-string electric bass sight-reading range: E1 (28) .. D3 (50)
const MIN_BASS_MIDI = 28;
const MAX_BASS_MIDI = 50;

function weightedPick(scored, rand, temp = 0.80) {
  if (!scored.length) return 38;
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(4, scored.length));
  const maxS = top[0].score;
  let sumW = 0;
  const weights = top.map(item => {
    const w = Math.exp((item.score - maxS) / temp);
    sumW += w;
    return w;
  });
  let r = rand() * sumW;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i].midi;
  }
  return top[0].midi;
}

// 2. Contour-Guided Jazz Line Assignment (supports Bass E1..D3 & Treble C4..A5, plus "RND" key)
export function assignPitchesToPhrase(phrase, keySetting = "Bb", progType = "auto", clef = "bass") {
  if (!phrase || !phrase.bars || !phrase.bars.length) return phrase;
  const keyId = resolvePitchKey(keySetting, phrase.seed);
  const ts = TIME_SIGS[phrase.timeSig || "4/4"] || TIME_SIGS["4/4"];
  const numBars = phrase.bars.length;
  const isTreble = clef === "treble";
  const minMidi = isTreble ? 60 : MIN_BASS_MIDI; // Treble: C4 (middle C, 1 ledger below) .. A5 (1 ledger above)
  const maxMidi = isTreble ? 81 : MAX_BASS_MIDI;
  const sweetLo = isTreble ? 64 : 31;            // E4..F5 (inside treble staff) or G1..A2 (inside bass staff)
  const sweetHi = isTreble ? 77 : 45;
  const centerMidi = isTreble ? 70 : 38;
  const seedBase = ((phrase.seed || 1) ^ strHash(`${keyId}:${progType}:${clef}`)) >>> 0;
  const rand = mulberry32(seedBase);

  const barChords = generateChordProgression(numBars, keyId, progType, rand);
  const songForm = buildSongForm(numBars);
  phrase.pitchMeta = {
    key: keyId,
    randomKey: keySetting === "RND",
    prog: progType,
    clef: isTreble ? "treble" : "bass",
    flats: (JAZZ_KEYS[keyId] || JAZZ_KEYS.C).flats,
    chords: barChords,
    sections: songForm.map(f => (numBars >= 8 && f.isSectionStart) ? f.section : null),
  };

  const targets = phrase.targets || [];
  // Track per-bar target indices so we can detect bar-end approach & 2-note enclosures!
  const barTargetIdxs = Array.from({ length: numBars }, () => []);
  for (let i = 0; i < targets.length; i++) {
    barTargetIdxs[targets[i].bar].push(i);
  }

  // Assign section-tailored contour archetypes:
  // Verse = grounded Pocket/Stepwise | Pre = ascending ramp | Chorus = energetic hook (recalled!) | Bridge = lyrical contrast
  const CONTOURS = ["WALK_UP", "WALK_DOWN", "ENCLOSURE", "POCKET", "GUIDE_DROP"];
  const barContours = [];
  let firstChorusStart = -1;
  for (let b = 0; b < numBars; b++) {
    const f = songForm[b];
    if (f.role === "PRE") {
      // Pre-Chorus climbs steadily upward toward the Chorus!
      barContours.push(f.phraseBar >= 2 ? "WALK_UP" : (rand() < 0.6 ? "WALK_UP" : "ENCLOSURE"));
    } else if (f.role === "CHORUS" || f.role === "CHORUS_END") {
      if (firstChorusStart === -1) firstChorusStart = b;
      if (b >= firstChorusStart + 4 && rand() < 0.78) {
        // Echo the first Chorus hook contour when Chorus returns!
        barContours.push(barContours[firstChorusStart + (f.phraseBar % 4)] || "POCKET");
      } else {
        barContours.push(f.phraseBar % 2 === 0 ? "POCKET" : (rand() < 0.5 ? "WALK_UP" : "ENCLOSURE"));
      }
    } else if (f.role === "BRIDGE") {
      barContours.push(f.phraseBar % 2 === 0 ? "GUIDE_DROP" : "WALK_DOWN");
    } else {
      // Verse: calm grounded pocket / walking
      const prevC = b > 0 ? barContours[b - 1] : null;
      const vPool = ["POCKET", "WALK_UP", "WALK_DOWN", "ENCLOSURE"].filter(c => c !== prevC);
      barContours.push(vPool[Math.floor(rand() * vPool.length)]);
    }
  }

  // Record per-bar signed interval motifs so repeated/varied rhythmic motifs (M1 -> M1', M1_REP, M2 -> M2_REP)
  // carry the SAME melodic contour transposed onto the new chord!
  const barIntervals = Array.from({ length: numBars }, () => []);
  const motifMap = phrase.motifMap || null;

  let prevMidi = null;
  let prevInt1 = 0;
  let prevInt2 = 0;
  let repeatCount = 0;
  let pendingTargetRoot = null;
  let enclosureDir = 0; // +1 if penultimate note approached from above, -1 if from below

  for (let i = 0; i < targets.length; i++) {
    const tgt = targets[i];
    const b = tgt.bar;
    const chord = barChords[b] || barChords[0];
    const nextChord = b + 1 < numBars ? barChords[b + 1] : null;
    const formBar = songForm[b] || { section: "Verse", role: "VERSE", phraseBar: b % 4, phraseLen: 4, isFinalBar: b === numBars - 1 };
    const contour = barContours[b];
    const barIds = barTargetIdxs[b];
    const posInBar = barIds.indexOf(i);
    const notesLeftInBar = barIds.length - 1 - posInBar;
    const isVeryLastNote = (i === targets.length - 1);

    // Section-Driven Register Arc across full 8-bar sections (Verse low -> Pre 8-bar rising ramp -> Chorus high hook -> Bridge):
    let sectionOffset = 0;
    const sb = (formBar.secBar ?? formBar.phraseBar) % 8;
    if (formBar.role === "VERSE") {
      sectionOffset = [-3, -2, -1, -2, -2, -1, 0, -1][sb];
    } else if (formBar.role === "PRE") {
      // Gradual 8-bar Pre-Chorus climb building straight into Chorus!
      sectionOffset = [-2, -1, 0, +1, +1, +2, +4, +5][sb];
    } else if (formBar.role === "CHORUS" || formBar.role === "CHORUS_END") {
      sectionOffset = [+4, +5, +4, +3, +4, +5, +3, formBar.isFinalBar ? 0 : +2][sb];
    } else if (formBar.role === "BRIDGE") {
      sectionOffset = [+2, +3, +1, +2, +3, +4, +2, +1][sb];
    }
    const barCenterMidi = Math.max(sweetLo, Math.min(sweetHi, centerMidi + sectionOffset));

    // Coupled Rhythm + Pitch Motif Recall:
    // If this bar repeats or varies an earlier motif bar (srcBar), lock onto its exact interval contour!
    const mInfo = motifMap ? motifMap[b] : null;
    let recallMotif = null;
    let recallStrength = 0;
    if (mInfo && mInfo.srcBar !== null && mInfo.srcBar < b && posInBar > 0) {
      const srcArr = barIntervals[mInfo.srcBar];
      const inPreservedHead = mInfo.exact || posInBar <= Math.max(1, Math.floor(barIds.length / 2));
      if (inPreservedHead && srcArr && srcArr[posInBar] !== undefined) {
        recallMotif = srcArr[posInBar];
        recallStrength = mInfo.exact ? 4.8 : 3.8;
      }
    }

    const barTick = tgt.globalSlot - b * ts.barTicks;
    const durSlots = tgt.durSlots || 12;
    const isDownbeat = barTick === 0;
    const isOnBeat = (barTick % ts.beatTicks) === 0;
    const isSecondaryStrong = !isDownbeat && (
      (ts.num === 4 && barTick === 24) ||
      (ts.num === 6 && barTick === 18) ||
      (ts.num === 5 && barTick === 36) ||
      (ts.num === 3 && barTick === 12)
    );
    // Any syncopated note sustained across an on-beat (e.g. 1& tied over beat 2, or 3& dotted quarter over beat 4)
    // rings directly over the beat and must obey chord-tone / safe-tension gravity!
    const crossesOnBeat = !isOnBeat && (Math.floor(barTick / ts.beatTicks) !== Math.floor((barTick + durSlots - 1) / ts.beatTicks));
    const isLongNote = durSlots >= ts.beatTicks || Boolean(tgt.tied) || crossesOnBeat;
    const hasNextChordChange = Boolean(nextChord && nextChord.rootPc !== chord.rootPc);
    const nextTgt = i + 1 < targets.length ? targets[i + 1] : null;
    const nextBarStartsOnDownbeat = Boolean(
      nextTgt && nextTgt.bar === b + 1 && (nextTgt.globalSlot - (b + 1) * ts.barTicks) === 0
    );
    const isFast = durSlots <= 6;
    // Only use a chromatic bar-end pickup when it is a short off-beat leading directly into next bar's beat 1!
    const isBarEndApproach = (notesLeftInBar === 0) && !isOnBeat && !crossesOnBeat && isFast && hasNextChordChange && nextBarStartsOnDownbeat;
    const isPreApproachEnclosure = (notesLeftInBar === 1) && !isDownbeat && !isSecondaryStrong && hasNextChordChange && nextBarStartsOnDownbeat && (contour === "ENCLOSURE" || rand() < 0.30);

    // Ghost notes keep the previous fret/pitch (percussive muted thump)
    if (tgt.art === "ghost" && prevMidi !== null) {
      tgt.pitch = spellBassMidi(prevMidi, keyId, clef);
      continue;
    }

    // Bebop Hard Eligibility Gate:
    // - Beat 1 & Beat 3 (strong pillars): strictly chord tones (1, 3, 5, 7)
    // - Beats 2 & 4 (on-beats) & long/syncopated sustains: chord tones (always) + safe non-avoid tensions (except dim7 = pure chord tones!)
    // - Short off-beats: chord tones + tensions + stepwise Bebop/Symmetric-Dominant passing tones (+ chromatic approach only right before next beat 1)
    // - Avoid notes (4th on maj7/dom7, B/D/F/Ab on A°7): hard-blocked on all on-beats/sustains & 100% blocked on dim7!
    const isDim7 = chord.qual === "dim7";
    const isStrongPillar = isDownbeat || isSecondaryStrong;
    const prevPc = prevMidi !== null ? (prevMidi % 12) : null;

    const isEligiblePitch = (m) => {
      const pc = m % 12;
      const isChordTone = chord.chordPcs.has(pc);
      if (isChordTone) return true;
      // Beat 1 & Beat 3: pure chord tones ONLY so harmony never sounds wrong!
      if (isStrongPillar) return false;
      // On dim7, any sustained/on-beat note must be a pure diminished chord tone (1, b3, b5, 6)
      if (isDim7 && (isOnBeat || isLongNote)) return false;
      // Explicit avoid notes are NEVER allowed on dim7, on-beats, or sustained/syncopated notes
      if (chord.avoidPcs.has(pc)) {
        if (isDim7 || isOnBeat || isLongNote || !isFast || prevMidi === null) return false;
        // On maj7/dom7 only: allow fleeting 4th ONLY as strict stepwise passing between 3rd and 5th
        const absD = Math.abs(m - prevMidi);
        return absD <= 2 && (prevPc === chord.thirdPc || prevPc === chord.fifthPc);
      }
      const isTension = chord.tensionPcs.has(pc);
      // Beats 2 & 4 (on-beats) and long/syncopated notes: only chord tones or consonant tensions (9, 13, #11, m7 11)
      if (isOnBeat || isLongNote) {
        return isTension;
      }
      // Short off-beat: tensions always allowed
      if (isTension) return true;
      // Short off-beat: Bebop / Symmetric Dominant passing tones allowed when moving stepwise
      if (chord.bebopPassPcs.has(pc)) {
        return prevMidi === null || Math.abs(m - prevMidi) <= 2;
      }
      // Short off-beat bar-end pickup directly into next bar's downbeat root: ±1 semitone leading tone
      if (isBarEndApproach && nextChord) {
        const upDist = ((nextChord.rootPc - pc) + 12) % 12;
        const downDist = ((pc - nextChord.rootPc) + 12) % 12;
        if ((upDist === 1 || downDist === 1) && (prevMidi === null || Math.abs(m - prevMidi) <= 3)) {
          return true;
        }
      }
      return false;
    };

    const candidates = [];
    for (let m = minMidi; m <= maxMidi; m++) {
      if (!isEligiblePitch(m)) continue;
      const pc = m % 12;
      let score = 0;

      const isRoot = pc === chord.rootPc;
      const isThird = pc === chord.thirdPc;
      const isFifth = pc === chord.fifthPc;
      const isSeventh = pc === chord.seventhPc;
      const isGuide = chord.guidePcs.has(pc);
      const isChordTone = chord.chordPcs.has(pc);
      const isTension = chord.tensionPcs.has(pc);
      const isBebopPass = chord.bebopPassPcs.has(pc);
      const isScaleTone = chord.scalePcs.has(pc);

      // A. Bebop Harmonic & Metric Hierarchy
      if (isDownbeat) {
        // Bar 0 always anchors strongly on Root; later bars favor Root with smooth 3rd/5th/7th voice-leading
        if (isRoot) score += (b === 0 ? 7.2 : 5.4);
        else if (isThird && b > 0) score += 2.8;
        else if (isFifth && b > 0) score += 2.3;
        else if (isSeventh && b > 0) score += 1.4;

        // If previous bar set up a leading-tone pickup into this root, resolve smoothly by step!
        if (pendingTargetRoot !== null && isRoot && prevMidi !== null) {
          const d = Math.abs(m - prevMidi);
          if (d === 1) score += 5.4;
          else if (d === 2) score += 4.2;
        }
      } else if (isSecondaryStrong) {
        // Beat 3 pillar: strictly chord tones — favor guide tones (3rd / 7th) & 5th for colorful jazz movement
        if (isGuide) score += 4.4;
        else if (isFifth) score += 3.8;
        else if (isRoot) score += (contour === "POCKET" ? 3.5 : 2.3);
      } else if (isBarEndApproach) {
        // Short off-beat pickup right before next bar's downbeat root
        const upDist = ((nextChord.rootPc - pc) + 12) % 12;   // 1 = half-step below next root
        const downDist = ((pc - nextChord.rootPc) + 12) % 12; // 1 = half-step above next root
        if (enclosureDir !== 0) {
          if ((enclosureDir > 0 && upDist === 1) || (enclosureDir < 0 && downDist === 1)) {
            score += 6.0;
          } else if (upDist === 1 || downDist === 1) {
            score += 4.4;
          }
        } else {
          if (upDist === 1 || downDist === 1) score += 4.6;
          else if ((upDist === 2 || downDist === 2) && isScaleTone) score += 3.8;
          else if (downDist === 7 || upDist === 5) score += 2.6;
          else if (isChordTone) score += 2.2;
        }
      } else if (isPreApproachEnclosure) {
        // Penultimate note setting up an enclosure around next bar's downbeat root (strictly inside valid tones!)
        const upDist = ((nextChord.rootPc - pc) + 12) % 12;
        const downDist = ((pc - nextChord.rootPc) + 12) % 12;
        if (downDist === 1 || downDist === 2) score += 3.8;
        else if (upDist === 1 || upDist === 2) score += 3.4;
        else if (isGuide) score += 3.0;
        else if (isChordTone) score += 2.4;
        else if (isTension) score += 1.6;
      } else if (isOnBeat || isLongNote) {
        // Beats 2 & 4 (정박) & sustained/syncopated notes: strongly anchor on Chord Tones (Bebop rule!),
        // allowing safe 9th/13th tensions tastefully when stepwise!
        if (isGuide) score += 4.2;
        else if (isFifth) score += 3.6;
        else if (isRoot) score += (contour === "POCKET" ? 3.5 : 2.5);
        else if (isTension) score += 1.8;
      } else {
        // Short off-beat (엇박): Bebop passing tones & 9/13 color tensions connect chord tones smoothly!
        if (isTension) score += 3.2;
        else if (isBebopPass) score += 2.9;
        else if (isGuide) score += 2.8;
        else if (isChordTone) score += 2.3;
        else score += 0.6;
      }

      // B. Contour Archetype Bias (breaks mechanical 1-3-5-7 patterns!)
      if (prevMidi !== null && !isDownbeat && !isBarEndApproach) {
        const diff = m - prevMidi;
        if (contour === "WALK_UP" && diff > 0 && diff <= 3) score += 1.9;
        else if (contour === "WALK_DOWN" && diff < 0 && diff >= -3) score += 1.9;
        else if (contour === "GUIDE_DROP" && diff < 0 && diff >= -5) score += 1.6;
        else if (contour === "POCKET" && (Math.abs(diff) === 5 || Math.abs(diff) === 7 || Math.abs(diff) === 12 || Math.abs(diff) <= 2)) {
          score += 1.4;
        }
      }

      // C. Voice-Leading, Interval & Anti-Arpeggio Monotony Rules
      if (prevMidi === null) {
        score -= Math.abs(m - centerMidi) * 0.22;
      } else {
        const diff = m - prevMidi;
        const absD = Math.abs(diff);

        if (absD === 0) {
          score += repeatCount >= 2 ? -3.6 : (contour === "POCKET" && isFast ? 1.0 : -0.9);
        } else if (absD <= 2) {
          score += isFast ? 2.9 : 2.4; // Smooth stepwise walking!
        } else if (absD === 3 || absD === 4) {
          score += 1.4;
        } else if (absD === 5 || absD === 7) {
          score += isFast ? 1.0 : 1.8;
        } else if (absD === 12) {
          score += contour === "POCKET" ? 1.8 : 0.9;
        } else if (absD === 6 || absD === 9 || absD === 10 || absD === 11) {
          score -= isFast ? 4.8 : 3.0;
        } else if (absD === 8) {
          score -= 1.5;
        } else {
          score -= 6.2 + (absD - 12) * 0.6;
        }

        // Anti-Mechanical-Arpeggio Rule: if previous 2 steps were same-direction 3rd/4th skips (1->3->5),
        // strongly penalize continuing straight up/down in another skip -> force musical turn or step!
        if (Math.abs(prevInt1) >= 3 && Math.abs(prevInt1) <= 4 &&
            Math.abs(prevInt2) >= 3 && Math.abs(prevInt2) <= 4 &&
            Math.sign(prevInt1) === Math.sign(prevInt2)) {
          if (Math.sign(diff) === Math.sign(prevInt1) && absD >= 3) {
            score -= 3.8; // Kills boring 1-3-5-7 robot arpeggios!
          } else if (absD <= 2) {
            score += 1.8; // Rewards turning into a smooth scale step!
          }
        }

        // Counterpoint Leap Recovery: after a leap >= 5, reward opposite-direction stepwise motion
        if (Math.abs(prevInt1) >= 5 && diff !== 0 && Math.sign(diff) !== Math.sign(prevInt1)) {
          if (absD <= 3) score += 2.2;
        }
      }

      // D. Phrase Register Arc + Motific Recall + Final Cadence Resolution
      if (isVeryLastNote && formBar.isFinalBar) {
        // Satisfying musical ending on Tonic Root (or 5th on a Dominant turnaround)
        if (isRoot) score += 5.5;
        else if (isFifth) score += 2.2;
        else score -= 3.0;
      }
      if (recallMotif !== null && recallMotif !== undefined && prevMidi !== null && !isDownbeat && !isBarEndApproach) {
        // Strong motific sequence lock: echo the motif's exact interval direction & step size on the new chord!
        const diffNow = m - prevMidi;
        if (Math.sign(diffNow) === Math.sign(recallMotif)) {
          const distErr = Math.abs(diffNow - recallMotif);
          if (distErr <= 1) score += recallStrength;
          else if (distErr <= 2) score += recallStrength * 0.72;
          else score += recallStrength * 0.35;
        } else if (recallMotif === 0 && diffNow === 0) {
          score += recallStrength * 0.85;
        }
      }
      if (m < sweetLo) score -= (sweetLo - m) * 0.45;
      else if (m > sweetHi) score -= (m - sweetHi) * 0.55;
      else score -= Math.abs(m - barCenterMidi) * 0.14;

      candidates.push({ midi: m, score });
    }

    const pickTemp = isDownbeat ? 0.50 : (isOnBeat || isLongNote ? 0.65 : (recallStrength > 0 ? 0.70 : 0.82));
    const chosenMidi = weightedPick(candidates, rand, pickTemp);
    tgt.pitch = spellBassMidi(chosenMidi, keyId, clef);

    // Record per-bar interval sequence for motific repetition & variation
    if (prevMidi !== null) {
      barIntervals[b][posInBar] = chosenMidi - prevMidi;
    }

    // Track enclosure direction if we just picked the penultimate note before a chord change
    if (isPreApproachEnclosure && nextChord) {
      const upDist = ((nextChord.rootPc - (chosenMidi % 12)) + 12) % 12;
      const downDist = (((chosenMidi % 12) - nextChord.rootPc) + 12) % 12;
      enclosureDir = (downDist === 1 || downDist === 2) ? 1 : ((upDist === 1 || upDist === 2) ? -1 : 0);
    } else {
      enclosureDir = 0;
    }

    if (prevMidi !== null) {
      prevInt2 = prevInt1;
      prevInt1 = chosenMidi - prevMidi;
      repeatCount = chosenMidi === prevMidi ? repeatCount + 1 : 0;
    }
    prevMidi = chosenMidi;
    pendingTargetRoot = isBarEndApproach && nextChord ? nextChord.rootPc : null;
  }

  // Mirror target pitch onto phrase.bars events (including tied continuations) for engraver
  const tgtMap = new Map();
  for (const tgt of targets) {
    tgtMap.set(`${tgt.bar}:${tgt.beat}:${tgt.slotInBeat}`, tgt.pitch);
  }
  let lastBarEvPitch = null;
  for (let b = 0; b < numBars; b++) {
    const beats = phrase.bars[b];
    for (let bt = 0; bt < beats.length; bt++) {
      for (const ev of beats[bt]) {
        if (ev.rest) {
          ev.pitch = null;
          continue;
        }
        if (ev.tiedIn && lastBarEvPitch) {
          ev.pitch = lastBarEvPitch;
        } else {
          const p = tgtMap.get(`${b}:${bt}:${ev.slot}`) || lastBarEvPitch || spellBassMidi(centerMidi, keyId, clef);
          ev.pitch = p;
          lastBarEvPitch = p;
        }
      }
    }
  }

  return phrase;
}

export function clearPitchesFromPhrase(phrase) {
  if (!phrase) return;
  delete phrase.pitchMeta;
  for (const tgt of (phrase.targets || [])) {
    delete tgt.pitch;
    delete tgt.pitchOk;
    delete tgt.detectedPitch;
    delete tgt.pitchCents;
  }
  for (const beats of (phrase.bars || [])) {
    for (const evs of beats) {
      for (const ev of evs) delete ev.pitch;
    }
  }
}
