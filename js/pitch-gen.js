// Flat-Key Jazz Harmony & Metric Voice-Leading Bassline Generator (Pitch BETA)
// Uses diatonic spelling (flats/naturals only — zero sharp keys) for Real Book bass sight-reading.

import { TIME_SIGS } from "./rhythm.js";

// Natural pitch classes for C D E F G A B
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
// Bass clef flat key signature order: Bb(B2:-2), Eb(E3:+1), Ab(A2:-3), Db(D3:0), Gb(G2:-4)
export const BASS_FLAT_SIG_POS = [-2, 1, -3, 0, -4];
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

export const JAZZ_PROG_OPTIONS = ["auto", "ii-V-I", "I-vi-ii-V", "blues", "modal"];

// Flat-priority pitch-class names (zero sharps!)
export const FLAT_PC_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
// Default flat spelling [letterIdx, acc] for chromatic notes
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

// Spell a sounding bass MIDI note (E1=28..D3=50) into bass clef written position & flat/natural accidental
export function spellBassMidi(midi, keyId = "C") {
  const pc = ((midi % 12) + 12) % 12;
  const keyAcc = getKeySignatureAcc(keyId);

  // 1. Prefer a diatonic spelling matching the key signature (zero extra accidental!)
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
  // 2. Otherwise use flat/natural spelling (never sharps!)
  if (chosenLetter === -1) {
    [chosenLetter, chosenAcc] = FLAT_PC_SPELL[pc];
  }

  // Sounding octave (MIDI 36 = C2, MIDI 38 = D2). Bass clef writes 1 octave higher than sounding!
  // Compute sounding octave accurately for letter + acc:
  const basePc = LETTER_PC[chosenLetter];
  const soundingOct = Math.round((midi - (basePc + chosenAcc)) / 12) - 1;
  const writtenOct = soundingOct + 1;
  // staffPos: 0 = middle line (written D3 / sounding D2), +1 = E3, -1 = C3, -4 = G2(bottom line), -6 = E2(1st ledger below)
  const staffPos = (writtenOct - 3) * 7 + (chosenLetter - 1);
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

// Chord quality definitions (semitone offsets from chord root)
const CHORD_QUAL = {
  maj7: { suffix: "maj7", chord: [0, 4, 7, 11], scale: [0, 2, 4, 5, 7, 9, 11] },
  m7:   { suffix: "m7",   chord: [0, 3, 7, 10], scale: [0, 2, 3, 5, 7, 9, 10] },
  dom7: { suffix: "7",    chord: [0, 4, 7, 10], scale: [0, 2, 4, 5, 7, 9, 10] },
  m7b5: { suffix: "m7♭5", chord: [0, 3, 6, 10], scale: [0, 2, 3, 5, 6, 8, 10] },
  min6: { suffix: "m6",   chord: [0, 3, 7, 9],  scale: [0, 2, 3, 5, 7, 9, 10] },
};

function makeChord(keyRootPc, degreeSemi, qualKey, keyId) {
  const rootPc = (keyRootPc + degreeSemi + 12) % 12;
  const q = CHORD_QUAL[qualKey] || CHORD_QUAL.maj7;
  // Spell chord root using flat-side convention
  const spelled = spellBassMidi(36 + rootPc, keyId);
  return {
    symbol: `${spelled.name}${q.suffix}`,
    rootPc,
    qual: qualKey,
    chordPcs: new Set(q.chord.map(o => (rootPc + o) % 12)),
    scalePcs: new Set(q.scale.map(o => (rootPc + o) % 12)),
    fifthPc: (rootPc + (qualKey === "m7b5" ? 6 : 7)) % 12,
    thirdPc: (rootPc + q.chord[1]) % 12,
  };
}

// 1. Functional Jazz Harmony Progression Generator (T -> PD -> D -> T Grammar)
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
      ? [[2, "m7b5"], [7, "dom7"], [0, "m7"], [7, "dom7"]]
      : [[2, "m7"], [7, "dom7"], [0, "maj7"], [9, "dom7"]]; // VI7 turnaround on bar 4
    for (let i = 0; i < numBars; i++) {
      const idx = (i === numBars - 1 && numBars >= 4) ? 2 : (i % cycle.length);
      const [deg, q] = cycle[idx];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  if (progType === "I-vi-ii-V") {
    const cycle = isMin
      ? [[0, "m7"], [8, "maj7"], [2, "m7b5"], [7, "dom7"]]
      : [[0, "maj7"], [9, "m7"], [2, "m7"], [7, "dom7"]];
    for (let i = 0; i < numBars; i++) {
      const [deg, q] = cycle[i % cycle.length];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  if (progType === "blues") {
    const blues12 = isMin
      ? [[0, "m7"], [5, "m7"], [0, "m7"], [0, "m7"], [5, "m7"], [5, "m7"], [0, "m7"], [0, "m7"], [8, "maj7"], [7, "dom7"], [0, "m7"], [7, "dom7"]]
      : [[0, "dom7"], [5, "dom7"], [0, "dom7"], [0, "dom7"], [5, "dom7"], [5, "dom7"], [0, "dom7"], [9, "dom7"], [2, "m7"], [7, "dom7"], [0, "dom7"], [7, "dom7"]];
    for (let i = 0; i < numBars; i++) {
      const [deg, q] = blues12[i % 12];
      chords.push(makeChord(r, deg, q, keyId));
    }
    return chords;
  }

  // "auto": Functional Jazz Harmony FSM (Tonic -> Predominant -> Dominant -> Tonic)
  const groups = isMin
    ? {
        T:  [[0, "m7"], [3, "maj7"]],
        PD: [[2, "m7b5"], [5, "m7"], [8, "maj7"]],
        D:  [[7, "dom7"]],
      }
    : {
        T:  [[0, "maj7"], [9, "m7"], [4, "m7"]],
        PD: [[2, "m7"], [5, "maj7"]],
        D:  [[7, "dom7"]],
      };

  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  let func = "T";
  for (let b = 0; b < numBars; b++) {
    // Bar 1 always tonic anchor
    if (b === 0) {
      chords.push(makeChord(r, 0, isMin ? "m7" : "maj7", keyId));
      func = "T";
      continue;
    }
    // Penultimate bar -> strong ii or V setup; final bar -> I resolution (or V7 turnaround if >=8 bars)
    if (b === numBars - 2 && numBars >= 4) {
      const [deg, q] = isMin ? [2, "m7b5"] : (rand() < 0.65 ? [2, "m7"] : [5, "maj7"]);
      chords.push(makeChord(r, deg, q, keyId));
      func = "PD";
      continue;
    }
    if (b === numBars - 1 && numBars >= 4) {
      // Half the time resolve V7 on penultimate -> I on last; or ii on penultimate -> V7 turnaround on last
      const prevWasDom = chords[b - 1].qual === "dom7";
      const [deg, q] = prevWasDom ? [0, isMin ? "m7" : "maj7"] : [7, "dom7"];
      chords.push(makeChord(r, deg, q, keyId));
      func = prevWasDom ? "T" : "D";
      continue;
    }
    if (b === numBars - 2 && numBars === 2) {
      chords.push(makeChord(r, 0, isMin ? "m7" : "maj7", keyId));
      continue;
    }
    if (b === numBars - 1 && numBars === 2) {
      chords.push(makeChord(r, 7, "dom7", keyId));
      continue;
    }

    const u = rand();
    let nextFunc = "T";
    if (func === "T") {
      nextFunc = u < 0.58 ? "PD" : (u < 0.80 ? "D" : "T");
    } else if (func === "PD") {
      nextFunc = u < 0.72 ? "D" : (u < 0.90 ? "PD" : "T");
    } else {
      // Dominant strongly resolves to Tonic
      nextFunc = u < 0.86 ? "T" : "D";
    }
    const pool = groups[nextFunc];
    let choice = pick(pool);
    // Avoid dull identical chord 3x in a row
    const prevSym = chords[b - 1].symbol;
    if (pool.length > 1 && makeChord(r, choice[0], choice[1], keyId).symbol === prevSym && rand() < 0.75) {
      choice = pool.find(c => makeChord(r, c[0], c[1], keyId).symbol !== prevSym) || choice;
    }
    chords.push(makeChord(r, choice[0], choice[1], keyId));
    func = nextFunc;
  }
  return chords;
}

// Playable 4-string electric bass sight-reading range: E1 (28) .. D3 (50)
const MIN_BASS_MIDI = 28; // E1 (1st ledger line below bass clef)
const MAX_BASS_MIDI = 50; // D3 (space above 1st ledger line above bass clef)

function weightedPick(scored, rand, temp = 1.1) {
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

// 2. Metric-Hierarchy + Voice-Leading Bassline Assignment
export function assignPitchesToPhrase(phrase, keyId = "Bb", progType = "auto") {
  if (!phrase || !phrase.bars || !phrase.bars.length) return phrase;
  const ts = TIME_SIGS[phrase.timeSig || "4/4"] || TIME_SIGS["4/4"];
  const numBars = phrase.bars.length;
  const seedBase = ((phrase.seed || 1) ^ strHash(`${keyId}:${progType}`)) >>> 0;
  const rand = mulberry32(seedBase);

  const barChords = generateChordProgression(numBars, keyId, progType, rand);
  phrase.pitchMeta = {
    key: keyId,
    prog: progType,
    flats: (JAZZ_KEYS[keyId] || JAZZ_KEYS.C).flats,
    chords: barChords,
  };

  // Build ordered list of attack targets (non-tiedIn sounding events)
  const targets = phrase.targets || [];
  // Group target indices by bar so we know which target is the last sounding note of each bar
  const lastTargetIdxInBar = new Array(numBars).fill(-1);
  for (let i = 0; i < targets.length; i++) {
    lastTargetIdxInBar[targets[i].bar] = i;
  }

  let prevMidi = null;
  let prevInterval = 0;
  let repeatCount = 0;
  let pendingTargetRoot = null; // Set when bar-end approach aims at next bar's root

  for (let i = 0; i < targets.length; i++) {
    const tgt = targets[i];
    const b = tgt.bar;
    const chord = barChords[b] || barChords[0];
    const nextChord = b + 1 < numBars ? barChords[b + 1] : null;
    const barTick = tgt.globalSlot - b * ts.barTicks;
    const isDownbeat = barTick === 0;
    const isSecondaryStrong = !isDownbeat && (
      (ts.num === 4 && barTick === 24) ||
      (ts.num === 6 && barTick === 18) ||
      (ts.num === 5 && barTick === 36) ||
      (ts.num === 3 && (barTick === 12 || barTick === 24))
    );
    const isBarEndApproach = (i === lastTargetIdxInBar[b]) && !isDownbeat && nextChord && (nextChord.rootPc !== chord.rootPc);
    const isFast = (tgt.durSlots || 12) <= 6;

    // Ghost notes keep the previous fret/pitch (percussive muted thump)
    if (tgt.art === "ghost" && prevMidi !== null) {
      tgt.pitch = spellBassMidi(prevMidi, keyId);
      continue;
    }

    const candidates = [];
    for (let m = MIN_BASS_MIDI; m <= MAX_BASS_MIDI; m++) {
      const pc = m % 12;
      let score = 0;

      // A. Harmonic & Metric Hierarchy
      const isRoot = pc === chord.rootPc;
      const isFifth = pc === chord.fifthPc;
      const isThird = pc === chord.thirdPc;
      const isChordTone = chord.chordPcs.has(pc);
      const isScaleTone = chord.scalePcs.has(pc);

      if (isDownbeat) {
        if (isRoot) score += 6.2;
        else if (isFifth) score += 1.6;
        else if (isThird) score += 1.3;
        else if (isChordTone) score += 0.4;
        else score -= 6.0;

        // If previous bar set up an approach note targeting this root, reward exact stepwise resolution!
        if (pendingTargetRoot !== null && isRoot && prevMidi !== null) {
          const d = Math.abs(m - prevMidi);
          if (d === 1 || d === 2) score += 4.5;
        }
      } else if (isBarEndApproach) {
        // Look-ahead to next bar's root: reward chromatic/diatonic leading tones (±1, ±2) or V drop
        const distToNextRoot = Math.min(
          ((nextChord.rootPc - pc) + 12) % 12,
          ((pc - nextChord.rootPc) + 12) % 12
        );
        if (distToNextRoot === 1) score += 4.6;      // Jazz chromatic approach!
        else if (distToNextRoot === 2 && isScaleTone) score += 3.6; // Diatonic step approach
        else if (((pc - nextChord.rootPc) + 12) % 12 === 7) score += 2.6; // V -> I drop
        else if (isChordTone) score += 1.5;
        else if (isScaleTone) score += 0.8;
        else score -= 4.0;
      } else if (isSecondaryStrong) {
        if (isFifth) score += 3.8;
        else if (isThird) score += 3.5;
        else if (isRoot) score += 2.8;
        else if (isChordTone) score += 3.0;
        else if (isScaleTone) score += 1.0;
        else score -= 5.0;
      } else {
        // Weak beat / off-beat: smooth scale passing tones & chord tones
        if (isChordTone) score += 2.6;
        else if (isScaleTone) score += 2.4;
        else score -= 4.5;
      }

      // B. Voice-Leading, Interval & Playability Cost
      if (prevMidi === null) {
        // First note of phrase: prefer comfortable low-mid root (E1..G2 = 28..43)
        score -= Math.abs(m - 36) * 0.22;
      } else {
        const diff = m - prevMidi;
        const absD = Math.abs(diff);

        if (absD === 0) {
          // Occasional repeat is groovy, 3+ in a row gets stale
          score += repeatCount >= 2 ? -3.2 : (isFast ? 0.6 : -0.6);
        } else if (absD <= 2) {
          score += isFast ? 2.6 : 2.1; // Stepwise voice leading
        } else if (absD === 3 || absD === 4) {
          score += 1.7; // Arpeggio 3rd
        } else if (absD === 5 || absD === 7) {
          score += isFast ? 1.1 : 1.9; // 4th / 5th bass motion
        } else if (absD === 12) {
          score += isFast ? 0.9 : 1.2; // Octave pop
        } else if (absD === 6 || absD === 9 || absD === 10 || absD === 11) {
          score -= isFast ? 4.5 : 2.8; // Awkward leap
        } else if (absD === 8) {
          score -= 1.5;
        } else {
          score -= 6.0 + (absD - 12) * 0.6; // Too wide
        }

        // Counterpoint Leap Recovery: after a leap >= 5, reward opposite-direction stepwise move
        if (Math.abs(prevInterval) >= 5 && diff !== 0 && Math.sign(diff) !== Math.sign(prevInterval)) {
          if (absD <= 4) score += 1.8;
        }
      }

      // C. Gentle Register Gravity toward sweet spot of bass clef (G1=31 .. A2=45)
      if (m < 31) score -= (31 - m) * 0.45;
      else if (m > 45) score -= (m - 45) * 0.55;
      else score -= Math.abs(m - 38) * 0.05;

      candidates.push({ midi: m, score });
    }

    const chosenMidi = weightedPick(candidates, rand, isDownbeat ? 0.65 : 1.15);
    tgt.pitch = spellBassMidi(chosenMidi, keyId);

    if (prevMidi !== null) {
      prevInterval = chosenMidi - prevMidi;
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
          const p = tgtMap.get(`${b}:${bt}:${ev.slot}`) || lastBarEvPitch || spellBassMidi(38, keyId);
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
