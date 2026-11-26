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

// Jazz chord qualities (all flat-friendly symbols & authentic chord-scale pairs)
const CHORD_QUAL = {
  maj7:   { suffix: "maj7",  chord: [0, 4, 7, 11], scale: [0, 2, 4, 5, 7, 9, 11] }, // Ionian
  maj6:   { suffix: "6",     chord: [0, 4, 7, 9],  scale: [0, 2, 4, 5, 7, 9, 11] }, // Major 6/9
  m7:     { suffix: "m7",    chord: [0, 3, 7, 10], scale: [0, 2, 3, 5, 7, 9, 10] }, // Dorian
  dom7:   { suffix: "7",     chord: [0, 4, 7, 10], scale: [0, 2, 4, 5, 7, 9, 10] }, // Mixolydian
  dom7b9: { suffix: "7♭9",   chord: [0, 4, 7, 10], scale: [0, 1, 3, 4, 7, 8, 10] }, // Phrygian Dominant / Altered feel
  lyd7:   { suffix: "7",     chord: [0, 4, 7, 10], scale: [0, 2, 4, 6, 7, 9, 10] }, // Lydian Dominant (Tritone Sub bII7!)
  m7b5:   { suffix: "m7♭5",  chord: [0, 3, 6, 10], scale: [0, 2, 3, 5, 6, 8, 10] }, // Locrian nat2
  dim7:   { suffix: "°7",    chord: [0, 3, 6, 9],  scale: [0, 2, 3, 5, 6, 8, 9, 11] }, // Passing diminished
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
    scalePcs: new Set(q.scale.map(o => (rootPc + o) % 12)),
    thirdPc: (rootPc + thirdOff) % 12,
    fifthPc: (rootPc + fifthOff) % 12,
    seventhPc: (rootPc + seventhOff) % 12,
    guidePcs: new Set([(rootPc + thirdOff) % 12, (rootPc + seventhOff) % 12]),
  };
}

// Section-aware Jazz Harmony Block Pools (for genuine 8/12/16/32-bar A-A'-B-A'' Song Form!)
// A_OPEN: ends on Half Cadence / Dominant tension (Question phrase)
const MAJOR_A_OPEN = [
  [[0, "maj7"], [9, "dom7"], [2, "m7"], [7, "dom7"]],    // Imaj7 -> VI7 -> ii7 -> V7
  [[0, "maj7"], [3, "dim7"], [2, "m7"], [7, "dom7"]],    // Imaj7 -> bIIIdim7 -> ii7 -> V7
  [[0, "maj7"], [10, "maj7"], [8, "maj7"], [7, "dom7"]], // Imaj7 -> bVIImaj7 -> bVImaj7 -> V7
];
// A_CLOSE: resolves cleanly to Tonic (Answer phrase)
const MAJOR_A_CLOSE = [
  [[0, "maj7"], [2, "m7"], [1, "lyd7"], [0, "maj7"]],    // Imaj7 -> ii7 -> bII7 -> Imaj7 (Tritone sub!)
  [[2, "m7"], [7, "dom7"], [0, "maj7"], [0, "maj6"]],    // ii7 -> V7 -> Imaj7 -> I6
  [[5, "maj7"], [5, "m7"], [10, "dom7"], [0, "maj7"]],   // IVmaj7 -> iv7 -> bVII7 -> Imaj7 (Backdoor!)
];
// B_BRIDGE: contrasting harmonic color (Subdominant lift / Cycle of Dominants)
const MAJOR_B_BRIDGE = [
  [[4, "m7"], [9, "dom7"], [2, "dom7"], [7, "dom7"]],    // iii7 -> VI7 -> II7 -> V7 (Cycle of 5ths!)
  [[0, "dom7"], [5, "maj7"], [5, "m7"], [10, "dom7"]],   // I7 -> IVmaj7 -> iv7 -> bVII7
  [[5, "maj7"], [5, "m7"], [4, "m7"], [9, "dom7"]],      // IVmaj7 -> iv7 -> iii7 -> VI7
  [[2, "m7"], [7, "dom7"], [4, "m7"], [9, "dom7"]],      // ii7 -> V7 -> iii7 -> VI7
];

const MINOR_A_OPEN = [
  [[0, "m7"], [5, "m7"], [2, "m7b5"], [7, "dom7b9"]],    // im7 -> iv7 -> iiø7 -> V7b9
  [[0, "m7"], [8, "maj7"], [2, "m7b5"], [7, "dom7b9"]],  // im7 -> bVImaj7 -> iiø7 -> V7b9
];
const MINOR_A_CLOSE = [
  [[0, "m7"], [2, "m7b5"], [7, "dom7b9"], [0, "m7"]],    // im7 -> iiø7 -> V7b9 -> im7
  [[0, "m7"], [2, "m7b5"], [1, "lyd7"], [0, "m7"]],      // im7 -> iiø7 -> bII7 -> im7 (Tritone sub!)
  [[0, "m7"], [8, "maj7"], [10, "dom7"], [0, "m7"]],     // im7 -> bVImaj7 -> bVII7 -> im7
];
const MINOR_B_BRIDGE = [
  [[5, "m7"], [10, "dom7"], [3, "maj7"], [8, "maj7"]],   // Autumn Leaves: iv7 -> bVII7 -> bIIImaj7 -> bVImaj7
  [[3, "maj7"], [8, "maj7"], [2, "m7b5"], [7, "dom7b9"]],// Relative Major lift -> Minor ii-V
  [[5, "m7"], [2, "m7b5"], [7, "dom7b9"], [0, "dom7"]],  // Subdominant drive -> V/iv
];

// Build structured Song Form metadata per bar: { section, isSectionStart, phraseBar, phraseLen, isCadenceEnd }
export function buildSongForm(numBars) {
  const plan = [];
  if (numBars <= 4) {
    for (let b = 0; b < numBars; b++) {
      plan.push({ section: "A", role: "A_CLOSE", isSectionStart: b === 0, phraseBar: b, phraseLen: numBars, isFinalBar: b === numBars - 1 });
    }
    return plan;
  }
  if (numBars === 8) {
    // 8-bar Antecedent (A, Question -> Half Cadence) + Consequent (A', Answer -> Full Cadence)
    for (let b = 0; b < 8; b++) {
      const sec = b < 4 ? "A" : "A'";
      plan.push({ section: sec, role: b < 4 ? "A_OPEN" : "A_CLOSE", isSectionStart: b === 0 || b === 4, phraseBar: b % 4, phraseLen: 4, isFinalBar: b === 7 });
    }
    return plan;
  }
  if (numBars === 12) {
    // 12-bar 3-phrase Jazz Form: [A] 4 -> [A'] 4 -> [B/Cadence] 4
    const secs = ["A", "A'", "B"];
    const roles = ["A_OPEN", "B_BRIDGE", "A_CLOSE"];
    for (let b = 0; b < 12; b++) {
      const g = Math.floor(b / 4);
      plan.push({ section: secs[g], role: roles[g], isSectionStart: (b % 4) === 0, phraseBar: b % 4, phraseLen: 4, isFinalBar: b === 11 });
    }
    return plan;
  }
  if (numBars === 16) {
    // 16-bar Classic Standard: [A] 4 -> [A'] 4 -> [B] 4 -> [A''] 4
    const secs = ["A", "A'", "B", "A''"];
    const roles = ["A_OPEN", "A_CLOSE", "B_BRIDGE", "A_CLOSE"];
    for (let b = 0; b < 16; b++) {
      const g = Math.floor(b / 4);
      plan.push({ section: secs[g], role: roles[g], isSectionStart: (b % 4) === 0, phraseBar: b % 4, phraseLen: 4, isFinalBar: b === 15 });
    }
    return plan;
  }
  // 32-bar Full Real Book AABA Standard ([A] 8 -> [A'] 8 -> [B] 8 -> [A''] 8)
  const chunkRoles = ["A_OPEN", "A_CLOSE", "A_OPEN", "A_CLOSE", "B_BRIDGE", "B_BRIDGE", "A_OPEN", "A_CLOSE"];
  const secLabels = ["A", null, "A'", null, "B", null, "A''", null];
  for (let b = 0; b < numBars; b++) {
    const c4 = Math.floor(b / 4) % chunkRoles.length;
    const secIdx = Math.floor(b / 8);
    const sec = ["A", "A'", "B", "A''"][secIdx % 4];
    plan.push({
      section: sec,
      role: chunkRoles[c4],
      isSectionStart: (b % 8) === 0 && Boolean(secLabels[c4]),
      phraseBar: b % 4,
      phraseLen: 4,
      isFinalBar: b === numBars - 1,
    });
  }
  return plan;
}

// 1. Phrase-Structured Jazz Chord Progression Generator
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

  // "auto": Song-Form Phrase Composer (A -> A' -> B -> A'' with real Half/Full Cadences & Bridge Contrast!)
  if (numBars === 2) {
    const pairs = isMin
      ? [[[2, "m7b5"], [7, "dom7b9"]], [[0, "m7"], [7, "dom7b9"]], [[5, "m7"], [1, "lyd7"]]]
      : [[[2, "m7"], [7, "dom7"]], [[2, "m7"], [1, "lyd7"]], [[5, "m7"], [10, "dom7"]]];
    const p = pairs[Math.floor(rand() * pairs.length)];
    return p.map(([deg, q]) => makeChord(r, deg, q, keyId));
  }

  const formPlan = buildSongForm(numBars);
  const pools = isMin
    ? { A_OPEN: MINOR_A_OPEN, A_CLOSE: MINOR_A_CLOSE, B_BRIDGE: MINOR_B_BRIDGE }
    : { A_OPEN: MAJOR_A_OPEN, A_CLOSE: MAJOR_A_CLOSE, B_BRIDGE: MAJOR_B_BRIDGE };

  // Reuse the same A_OPEN theme block when A returns (A -> A' -> A'') for authentic song cohesion!
  const themeAOpen = pools.A_OPEN[Math.floor(rand() * pools.A_OPEN.length)];
  const themeAClose = pools.A_CLOSE[Math.floor(rand() * pools.A_CLOSE.length)];
  const totalChunks = Math.ceil(numBars / 4);

  for (let ch = 0; ch < totalChunks; ch++) {
    const role = formPlan[ch * 4]?.role || "A_CLOSE";
    let block;
    if (role === "A_OPEN") {
      block = (ch === 0 || rand() < 0.72) ? themeAOpen : pools.A_OPEN[Math.floor(rand() * pools.A_OPEN.length)];
    } else if (role === "A_CLOSE") {
      block = (ch === totalChunks - 1 || rand() < 0.65) ? themeAClose : pools.A_CLOSE[Math.floor(rand() * pools.A_CLOSE.length)];
    } else {
      block = pools.B_BRIDGE[Math.floor(rand() * pools.B_BRIDGE.length)];
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

function weightedPick(scored, rand, temp = 1.05) {
  if (!scored.length) return 38;
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(5, scored.length));
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

  // Assign phrase-coherent contour archetypes: A' / A'' echo A's contours, while B Bridge contrasts!
  const CONTOURS = ["WALK_UP", "WALK_DOWN", "ENCLOSURE", "POCKET", "GUIDE_DROP"];
  const barContours = [];
  for (let b = 0; b < numBars; b++) {
    const f = songForm[b];
    if (b >= 4 && (f.section === "A'" || f.section === "A''") && rand() < 0.72) {
      // Echo the corresponding bar in section A for real motific continuity!
      barContours.push(barContours[f.phraseBar] || CONTOURS[0]);
    } else {
      const prevC = b > 0 ? barContours[b - 1] : null;
      const pool = CONTOURS.filter(c => c !== prevC);
      barContours.push(pool[Math.floor(rand() * pool.length)]);
    }
  }

  // Record signed interval motifs from Section A (first 4 bars) so A' & A'' recall the theme!
  const motifAIntervals = [[], [], [], []];

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
    const formBar = songForm[b] || { section: "A", role: "A_CLOSE", phraseBar: b % 4, phraseLen: 4, isFinalBar: b === numBars - 1 };
    const contour = barContours[b];
    const barIds = barTargetIdxs[b];
    const posInBar = barIds.indexOf(i);
    const notesLeftInBar = barIds.length - 1 - posInBar;
    const isVeryLastNote = (i === targets.length - 1);

    // Macro Phrase Register Arc (기승전결):
    // Bar 0 grounded -> Bar 1-2 rise toward climax -> Bar 3 land back down; [B] Bridge lifts +3..4 semitones!
    const arcOffsets = [-2, +1, +3, -1];
    const sectionLift = formBar.section === "B" ? 4 : (formBar.section === "A''" ? 1 : 0);
    const barCenterMidi = Math.max(sweetLo, Math.min(sweetHi, centerMidi + (arcOffsets[formBar.phraseBar % 4] || 0) + sectionLift));
    const recallMotif = (b >= 4 && (formBar.section === "A'" || formBar.section === "A''"))
      ? motifAIntervals[formBar.phraseBar % 4]?.[posInBar]
      : null;

    const barTick = tgt.globalSlot - b * ts.barTicks;
    const isDownbeat = barTick === 0;
    const isSecondaryStrong = !isDownbeat && (
      (ts.num === 4 && barTick === 24) ||
      (ts.num === 6 && barTick === 18) ||
      (ts.num === 5 && barTick === 36) ||
      (ts.num === 3 && (barTick === 12 || barTick === 24))
    );
    const hasNextChordChange = Boolean(nextChord && nextChord.rootPc !== chord.rootPc);
    const isBarEndApproach = (notesLeftInBar === 0) && !isDownbeat && hasNextChordChange;
    const isPreApproachEnclosure = (notesLeftInBar === 1) && !isDownbeat && hasNextChordChange && (contour === "ENCLOSURE" || rand() < 0.35);
    const isFast = (tgt.durSlots || 12) <= 6;

    // Ghost notes keep the previous fret/pitch (percussive muted thump)
    if (tgt.art === "ghost" && prevMidi !== null) {
      tgt.pitch = spellBassMidi(prevMidi, keyId, clef);
      continue;
    }

    const candidates = [];
    for (let m = minMidi; m <= maxMidi; m++) {
      const pc = m % 12;
      let score = 0;

      const isRoot = pc === chord.rootPc;
      const isThird = pc === chord.thirdPc;
      const isFifth = pc === chord.fifthPc;
      const isSeventh = pc === chord.seventhPc;
      const isGuide = chord.guidePcs.has(pc);
      const isChordTone = chord.chordPcs.has(pc);
      const isScaleTone = chord.scalePcs.has(pc);

      // A. Harmonic & Metric Hierarchy (with real jazz inversions & enclosures!)
      if (isDownbeat) {
        // Bar 0 always anchors strongly on Root; later bars allow tasteful 3rd/5th inversions when stepwise!
        if (isRoot) score += (b === 0 ? 7.0 : 5.4);
        else if (isThird && b > 0) score += 2.6;
        else if (isFifth && b > 0) score += 2.2;
        else if (isSeventh && b > 0) score += 1.0;
        else score -= 6.5;

        // If previous bar set up an approach/enclosure into this root, resolve smoothly by step!
        if (pendingTargetRoot !== null && isRoot && prevMidi !== null) {
          const d = Math.abs(m - prevMidi);
          if (d === 1) score += 5.2;
          else if (d === 2) score += 4.2;
        }
      } else if (isBarEndApproach) {
        // Look-ahead chromatic/diatonic approach into next bar's root (or opposite side of enclosure!)
        const upDist = ((nextChord.rootPc - pc) + 12) % 12;   // 1 = half-step below next root
        const downDist = ((pc - nextChord.rootPc) + 12) % 12; // 1 = half-step above next root
        if (enclosureDir !== 0) {
          // Complete the enclosure from the OPPOSITE side of next root!
          if ((enclosureDir > 0 && upDist === 1) || (enclosureDir < 0 && downDist === 1)) {
            score += 6.2;
          } else if (upDist === 1 || downDist === 1) {
            score += 4.5;
          }
        } else {
          if (upDist === 1 || downDist === 1) score += 4.8; // Chromatic leading tone (e.g. E->F or Gb->F)
          else if ((upDist === 2 || downDist === 2) && isScaleTone) score += 3.8; // Diatonic step approach
          else if (downDist === 7 || upDist === 5) score += 2.6; // Dominant 5th drop
          else if (isChordTone) score += 1.2;
          else score -= 3.8;
        }
      } else if (isPreApproachEnclosure) {
        // Penultimate note of bar: set up an enclosure (±1 or ±2 around next bar's root!)
        const upDist = ((nextChord.rootPc - pc) + 12) % 12;
        const downDist = ((pc - nextChord.rootPc) + 12) % 12;
        if (downDist === 1 || downDist === 2) score += 4.2; // Step above next root -> then drop below -> resolve!
        else if (upDist === 1 || upDist === 2) score += 3.6;
        else if (isGuide) score += 2.6;
        else if (isScaleTone) score += 1.5;
        else score -= 3.5;
      } else if (isSecondaryStrong) {
        // Favor color guide tones (3rd / 7th) & 5th over monotonous root repetition
        if (isGuide) score += 4.0;
        else if (isFifth) score += 3.5;
        else if (isRoot) score += (contour === "POCKET" ? 3.4 : 2.1);
        else if (isScaleTone) score += 1.8;
        else score -= 4.8;
      } else {
        // Weak beat / off-beat: reward smooth scale passing tones & chromatic tension over rigid arpeggio
        if (isScaleTone && !isChordTone) score += 3.0; // 2nd/6th/9th color tones make jazz lines sing!
        else if (isGuide) score += 2.7;
        else if (isChordTone) score += 2.2;
        else score -= 4.2;
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
        // Echo Section A's melodic direction & interval contour in A' / A''!
        const diffNow = m - prevMidi;
        if (Math.sign(diffNow) === Math.sign(recallMotif)) {
          score += Math.abs(diffNow - recallMotif) <= 2 ? 2.6 : 1.3;
        }
      }
      if (m < sweetLo) score -= (sweetLo - m) * 0.45;
      else if (m > sweetHi) score -= (m - sweetHi) * 0.55;
      else score -= Math.abs(m - barCenterMidi) * 0.14;

      candidates.push({ midi: m, score });
    }

    const chosenMidi = weightedPick(candidates, rand, isDownbeat ? 0.65 : 1.10);
    tgt.pitch = spellBassMidi(chosenMidi, keyId, clef);

    // Record Section A interval motif (bars 0..3) for later variation in A' / A''
    if (b < 4 && prevMidi !== null) {
      motifAIntervals[b][posInBar] = chosenMidi - prevMidi;
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
