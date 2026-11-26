// Flat-Key Jazz Harmony & Musical Voice-Leading Bassline Generator (Pitch BETA)
// Features real jazz harmonic blocks (Secondary Dominants, Tritone Subs, Backdoor Cadences,
// Passing Diminished, Modal Interchange) + Contour-Guided Basslines (Enclosures, Walking, Pocket)
// with strict flat/natural diatonic spelling (zero sharps!).

import { TIME_SIGS } from "./rhythm.js";

// Natural pitch classes for C D E F G A B
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
// Bass clef flat key signature order: Bb(B2:-2), Eb(E3:+1), Ab(A2:-3), Db(D3:0), Gb(G2:-4)
export const BASS_FLAT_SIG_POS = [-2, 1, -3, 0, -4];
// Treble clef flat key signature order: Bb(B4:0), Eb(E5:+3), Ab(A4:-1), Db(D5:+2), Gb(G4:-2)
export const TREBLE_FLAT_SIG_POS = [0, 3, -1, 2, -2];
export const FLAT_ORDER_LETTERS = [6, 2, 5, 1, 4]; // B, E, A, D, G

// Flat-side jazz keys (Major & Minor — 0 to 5 flats)
export const JAZZ_KEYS = {
  "C":  { label: "C Maj (0♭)",  rootPc: 0,  flats: 0, minor: false },
  "F":  { label: "F Maj (1♭)",  rootPc: 5,  flats: 1, minor: false },
  "Bb": { label: "B♭ Maj (2♭)", rootPc: 10, flats: 2, minor: false },
  "Eb": { label: "E♭ Maj (3♭)", rootPc: 3,  flats: 3, minor: false },
  "Ab": { label: "A♭ Maj (4♭)", rootPc: 8,  flats: 4, minor: false },
  "Db": { label: "D♭ Maj (5♭)", rootPc: 1,  flats: 5, minor: false },
  "Dm": { label: "D min (1♭)",  rootPc: 2,  flats: 1, minor: true  },
  "Gm": { label: "G min (2♭)",  rootPc: 7,  flats: 2, minor: true  },
  "Cm": { label: "C min (3♭)",  rootPc: 0,  flats: 3, minor: true  },
};

export const JAZZ_KEY_OPTIONS = ["C", "F", "Bb", "Eb", "Ab", "Db", "Dm", "Gm", "Cm"];

export const JAZZ_PROG_OPTIONS = ["auto", "ii-V-I", "tritone", "backdoor", "I-vi-ii-V", "blues", "modal"];

// Flat-priority pitch-class names (zero sharps!)
export const FLAT_PC_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
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

// Authentic 4-bar Jazz Harmony Phrase Idioms (used by "auto" to avoid dry textbook diatonic loops)
const MAJOR_JAZZ_BLOCKS_4 = [
  // 1. Secondary Dominant Turnaround (Imaj7 -> VI7 -> ii7 -> V7)
  [[0, "maj7"], [9, "dom7"], [2, "m7"], [7, "dom7"]],
  // 2. Tritone Sub Cadence (Imaj7 -> ii7 -> bII7 -> Imaj7) — chromatic descending bass!
  [[0, "maj7"], [2, "m7"], [1, "lyd7"], [0, "maj7"]],
  // 3. Backdoor Cadence (IVmaj7 -> iv7 -> bVII7 -> Imaj7) — lush jazz/neo-soul!
  [[5, "maj7"], [5, "m7"], [10, "dom7"], [0, "maj7"]],
  // 4. Chain of Dominants (iii7 -> VI7 -> II7 -> V7) — Rhythm Changes / Standard drive!
  [[4, "m7"], [9, "dom7"], [2, "dom7"], [7, "dom7"]],
  // 5. Passing Diminished (Imaj7 -> bIIIdim7 -> ii7 -> V7)
  [[0, "maj7"], [3, "dim7"], [2, "m7"], [7, "dom7"]],
  // 6. Secondary ii-V to IV (Imaj7 -> I7 -> IVmaj7 -> iv7)
  [[0, "maj7"], [0, "dom7"], [5, "maj7"], [5, "m7"]],
  // 7. Modal Interchange Lift (Imaj7 -> bVIImaj7 -> bVImaj7 -> V7)
  [[0, "maj7"], [10, "maj7"], [8, "maj7"], [7, "dom7"]],
  // 8. Classic Standard (ii7 -> V7 -> iii7 -> VI7)
  [[2, "m7"], [7, "dom7"], [4, "m7"], [9, "dom7"]],
];

const MINOR_JAZZ_BLOCKS_4 = [
  // 1. Autumn Leaves Cycle (iv7 -> bVII7 -> bIIImaj7 -> bVImaj7)
  [[5, "m7"], [10, "dom7"], [3, "maj7"], [8, "maj7"]],
  // 2. Minor ii-V-i (im7 -> iiø7 -> V7b9 -> im7)
  [[0, "m7"], [2, "m7b5"], [7, "dom7b9"], [0, "m7"]],
  // 3. Minor Tritone Sub (im7 -> iiø7 -> bII7 -> im7)
  [[0, "m7"], [2, "m7b5"], [1, "lyd7"], [0, "m7"]],
  // 4. Blue Bossa / Minor Turnaround (im7 -> iv7 -> iiø7 -> V7b9)
  [[0, "m7"], [5, "m7"], [2, "m7b5"], [7, "dom7b9"]],
  // 5. Chromatic Backdoor Minor (im7 -> bVImaj7 -> bVII7 -> im7)
  [[0, "m7"], [8, "maj7"], [10, "dom7"], [0, "m7"]],
];

// 1. Sophisticated Jazz Chord Progression Generator
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
    // Jazz Tritone Substitution: ii7 -> bII7 -> Imaj7 -> VI7 (chromatic root drop!)
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
    // Backdoor Cadence: Imaj7 -> IVmaj7 -> iv7 -> bVII7 (or resolving to I)
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

  // "auto": Phrase-Level Jazz Harmony Composer (stitches authentic 4-bar jazz idioms with cadential endings)
  if (numBars === 2) {
    const pairs = isMin
      ? [[[2, "m7b5"], [7, "dom7b9"]], [[0, "m7"], [7, "dom7b9"]], [[5, "m7"], [1, "lyd7"]]]
      : [[[2, "m7"], [7, "dom7"]], [[2, "m7"], [1, "lyd7"]], [[5, "m7"], [10, "dom7"]]];
    const p = pairs[Math.floor(rand() * pairs.length)];
    return p.map(([deg, q]) => makeChord(r, deg, q, keyId));
  }

  const blocks = isMin ? MINOR_JAZZ_BLOCKS_4 : MAJOR_JAZZ_BLOCKS_4;
  const openerPool = isMin ? [1, 2, 3, 4] : [0, 1, 4, 5, 6];
  const cadencePool = isMin ? [1, 2, 3] : [0, 1, 2, 3];
  const totalChunks = Math.ceil(numBars / 4);
  let lastBlockIdx = -1;

  for (let ch = 0; ch < totalChunks; ch++) {
    let idx;
    if (ch === 0) {
      idx = openerPool[Math.floor(rand() * openerPool.length)];
    } else if (ch === totalChunks - 1) {
      const filtered = cadencePool.filter(i => i !== lastBlockIdx);
      idx = filtered[Math.floor(rand() * filtered.length)] ?? cadencePool[0];
    } else {
      const candidates = blocks.map((_, i) => i).filter(i => i !== lastBlockIdx);
      idx = candidates[Math.floor(rand() * candidates.length)];
    }
    lastBlockIdx = idx;
    for (const [deg, q] of blocks[idx]) {
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

// 2. Contour-Guided Jazz Line Assignment (supports Bass E1..D3 & Treble C4..A5)
export function assignPitchesToPhrase(phrase, keyId = "Bb", progType = "auto", clef = "bass") {
  if (!phrase || !phrase.bars || !phrase.bars.length) return phrase;
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
  phrase.pitchMeta = {
    key: keyId,
    prog: progType,
    clef: isTreble ? "treble" : "bass",
    flats: (JAZZ_KEYS[keyId] || JAZZ_KEYS.C).flats,
    chords: barChords,
  };

  const targets = phrase.targets || [];
  // Track per-bar target indices so we can detect bar-end approach & 2-note enclosures!
  const barTargetIdxs = Array.from({ length: numBars }, () => []);
  for (let i = 0; i < targets.length; i++) {
    barTargetIdxs[targets[i].bar].push(i);
  }

  // Assign a musical contour archetype per bar so lines never feel like mechanical 1-3-5-7 climbs
  const CONTOURS = ["WALK_UP", "WALK_DOWN", "ENCLOSURE", "POCKET", "GUIDE_DROP"];
  const barContours = [];
  for (let b = 0; b < numBars; b++) {
    const prevC = b > 0 ? barContours[b - 1] : null;
    const pool = CONTOURS.filter(c => c !== prevC);
    barContours.push(pool[Math.floor(rand() * pool.length)]);
  }

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
    const contour = barContours[b];
    const barIds = barTargetIdxs[b];
    const posInBar = barIds.indexOf(i);
    const notesLeftInBar = barIds.length - 1 - posInBar;

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

      // D. Gentle Register Gravity toward staff sweet spot
      if (m < sweetLo) score -= (sweetLo - m) * 0.45;
      else if (m > sweetHi) score -= (m - sweetHi) * 0.55;
      else score -= Math.abs(m - centerMidi) * 0.04;

      candidates.push({ midi: m, score });
    }

    const chosenMidi = weightedPick(candidates, rand, isDownbeat ? 0.65 : 1.10);
    tgt.pitch = spellBassMidi(chosenMidi, keyId, clef);

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
