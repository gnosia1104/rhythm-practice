// Rhythm Patterns, Procedural Phrase Generator, Codecs & Daily Challenge Spec
export const BAR_OPTIONS = [2, 4, 8, 12, 16, 32];

// -------------------------------------------------------------------------
// 1. Multi-Beat Rhythm Patterns (12 ticks/beat = 48 ticks/bar, supports 16ths & Triplets)
//    Each event: [slotInBeat(0..11), durInTicks, isRest, tupletTag(null|"8t"|"4t")]
// -------------------------------------------------------------------------
export const TICKS_PER_BEAT = 12;
export const TICKS_PER_BAR = 48;

export const TIME_SIG_OPTIONS = ["4/4", "3/4", "2/4", "5/4", "6/8"];
export const TIME_SIGS = {
  "4/4": { num: 4, den: 4, beatsPerBar: 4, beatTicks: 12, barTicks: 48, clicksPerBar: 4, clickTicks: 12, countInClicks: 4, subAcc: [],  compound: false, clickSec: (bpm) => 60 / bpm },
  "3/4": { num: 3, den: 4, beatsPerBar: 3, beatTicks: 12, barTicks: 36, clicksPerBar: 3, clickTicks: 12, countInClicks: 3, subAcc: [],  compound: false, clickSec: (bpm) => 60 / bpm },
  "2/4": { num: 2, den: 4, beatsPerBar: 2, beatTicks: 12, barTicks: 24, clicksPerBar: 2, clickTicks: 12, countInClicks: 2, subAcc: [],  compound: false, clickSec: (bpm) => 60 / bpm },
  "5/4": { num: 5, den: 4, beatsPerBar: 5, beatTicks: 12, barTicks: 60, clicksPerBar: 5, clickTicks: 12, countInClicks: 5, subAcc: [3], compound: false, clickSec: (bpm) => 60 / bpm },
  "6/8": { num: 6, den: 8, beatsPerBar: 2, beatTicks: 18, barTicks: 36, clicksPerBar: 6, clickTicks: 6,  countInClicks: 6, subAcc: [3], compound: true,  clickSec: (bpm) => (60 / bpm) / 3 },
};

function scale16thPool(rawPool) {
  return rawPool.map(([cells, weight, starts]) => [
    cells.map(cell => cell.map(([slot, dur, rest]) => [slot * 3, dur * 3, rest, null])),
    weight,
    starts,
  ]);
}

// Lv 1: Quarter & Rest Basics (whole, dotted half, half, half rest, quarter, quarter rest — no 8ths)
const PATTERNS_LV1 = scale16thPool([
  [[[[0, 16, false]], [], [], []], 1.1, [0]],
  [[[[0, 12, false]], [], []], 1.5, [0, 1]],
  [[[[0, 8, false]], []], 2.8, [0, 2]],
  [[[[0, 8, true]], []], 1.1, [0, 2]],
  [[[[0, 4, false]]], 4.5, [0, 1, 2, 3]],
  [[[[0, 4, true]]], 1.6, [0, 1, 2, 3]],
]);

// Lv 2: Straight 8ths (adds beamed 8-8 pairs, zero off-beat rests or dotted quarters)
const PATTERNS_LV2 = scale16thPool([
  [[[[0, 16, false]], [], [], []], 0.8, [0]],
  [[[[0, 12, false]], [], []], 1.2, [0, 1]],
  [[[[0, 8, false]], []], 2.2, [0, 2]],
  [[[[0, 8, true]], []], 0.9, [0, 2]],
  [[[[0, 4, false]]], 3.4, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 2, false]]], 4.8, [0, 1, 2, 3]],
  [[[[0, 4, true]]], 1.2, [0, 1, 2, 3]],
]);

// Lv 3: 8th Off-beats & Dotted Quarter (former Lv 1: dot4+8, 8r-8, 8-8r)
const PATTERNS_LV3 = scale16thPool([
  [[[[0, 16, false]], [], [], []], 0.9, [0]],
  [[[[0, 12, false]], [], []], 1.2, [0, 1]],
  [[[[0, 8, false]], []], 2.2, [0, 2]],
  [[[[0, 8, true]], []], 0.8, [0, 2]],
  [[[[0, 6, false]], [[2, 2, false]]], 2.2, [0, 2]],
  [[[[0, 4, false]]], 3.0, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 2, false]]], 3.8, [0, 1, 2, 3]],
  [[[[0, 2, true], [2, 2, false]]], 1.8, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 2, true]]], 1.5, [0, 1, 2, 3]],
  [[[[0, 4, true]]], 1.0, [0, 1, 2, 3]],
]);

// Lv 4: 8th Syncopation & Ties (former Lv 2: 8-4-8, 8r-dot4, ties)
const PATTERNS_LV4 = scale16thPool([
  [[[[0, 16, false]], [], [], []], 0.6, [0]],
  [[[[0, 12, false]], [], []], 1.0, [0, 1]],
  [[[[0, 8, false]], []], 1.8, [0, 1, 2]],
  [[[[0, 8, true]], []], 0.6, [0, 2]],
  [[[[0, 6, false]], [[2, 2, false]]], 2.2, [0, 1, 2]],
  [[[[0, 2, false], [2, 4, false]], [[2, 2, false]]], 2.2, [0, 2]],
  [[[[0, 6, true]], [[2, 2, false]]], 1.2, [0, 2]],
  [[[[0, 2, true], [2, 6, false]], []], 1.5, [0, 2]],
  [[[[0, 4, false]]], 2.2, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 2, false]]], 3.2, [0, 1, 2, 3]],
  [[[[0, 2, true], [2, 2, false]]], 2.4, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 2, true]]], 1.5, [0, 1, 2, 3]],
  [[[[0, 4, true]]], 0.8, [0, 1, 2, 3]],
]);

// Lv 5: 16th Basics (16-16-16-16, 8-16-16, 16-16-8 — no 16th rests, no dot8+16, no 16-8-16)
const PATTERNS_LV5 = scale16thPool([
  [[[[0, 16, false]], [], [], []], 0.4, [0]],
  [[[[0, 12, false]], [], []], 0.7, [0, 1]],
  [[[[0, 8, false]], []], 1.2, [0, 1, 2]],
  [[[[0, 6, false]], [[2, 2, false]]], 1.5, [0, 1, 2]],
  [[[[0, 4, false]]], 2.0, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 2, false]]], 2.6, [0, 1, 2, 3]],
  [[[[0, 2, true], [2, 2, false]]], 1.4, [0, 1, 2, 3]],
  [[[[0, 4, true]]], 0.8, [0, 1, 2, 3]],
  [[[[0, 1, false], [1, 1, false], [2, 1, false], [3, 1, false]]], 3.2, [0, 1, 2, 3]],
  [[[[0, 1, false], [1, 1, false], [2, 2, false]]], 3.2, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 1, false], [3, 1, false]]], 3.2, [0, 1, 2, 3]],
]);

// Lv 6: 16th Notes Advanced (former Lv 3: full dot8+16, 16-8-16, 16th rests)
const PATTERNS_LV6 = scale16thPool([
  [[[[0, 16, false]], [], [], []], 0.4, [0]],
  [[[[0, 12, false]], [], []], 0.6, [0, 1]],
  [[[[0, 8, false]], []], 1.0, [0, 1, 2]],
  [[[[0, 6, false]], [[2, 2, false]]], 1.4, [0, 1, 2]],
  [[[[0, 2, false], [2, 4, false]], [[2, 2, false]]], 1.4, [0, 2]],
  [[[[0, 6, true]], [[2, 2, false]]], 0.8, [0, 2]],
  [[[[0, 2, true], [2, 6, false]], []], 1.0, [0, 2]],
  [[[[0, 4, false]]], 1.2, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 2, false]]], 1.6, [0, 1, 2, 3]],
  [[[[0, 1, false], [1, 1, false], [2, 1, false], [3, 1, false]]], 2.0, [0, 1, 2, 3]],
  [[[[0, 1, false], [1, 1, false], [2, 2, false]]], 2.0, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 1, false], [3, 1, false]]], 2.0, [0, 1, 2, 3]],
  [[[[0, 2, true], [2, 2, false]]], 1.2, [0, 1, 2, 3]],
  [[[[0, 3, false], [3, 1, false]]], 2.0, [0, 1, 2, 3]],
  [[[[0, 1, false], [1, 3, false]]], 1.6, [0, 1, 2, 3]],
  [[[[0, 1, false], [1, 2, false], [3, 1, false]]], 1.8, [0, 1, 2, 3]],
  [[[[0, 1, true], [1, 1, false], [2, 2, false]]], 1.4, [0, 1, 2, 3]],
  [[[[0, 2, false], [2, 1, true], [3, 1, false]]], 1.4, [0, 1, 2, 3]],
  [[[[0, 2, true], [2, 1, false], [3, 1, false]]], 1.4, [0, 1, 2, 3]],
  [[[[0, 1, false], [1, 1, false], [2, 2, true]]], 1.2, [0, 1, 2, 3]],
  [[[[0, 1, true], [1, 2, false], [3, 1, false]]], 1.2, [0, 1, 2, 3]],
  [[[[0, 1, true], [1, 1, false], [2, 1, true], [3, 1, false]]], 1.0, [0, 1, 2, 3]],
  [[[[0, 2, true], [2, 1, true], [3, 1, false]]], 1.0, [0, 1, 2, 3]],
  [[[[0, 1, true], [1, 1, false], [2, 2, true]]], 1.0, [0, 1, 2, 3]],
]);

// Triplet pattern pools (12 ticks/beat) scaled across 6 levels
const TRIPLETS_BASIC = [
  [[[[0, 4, false, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]], 3.6, [0, 1, 2, 3]], // 3 eighth triplets
  [[[[0, 8, false, "4t"], [8, 8, false, "4t"]], [[4, 8, false, "4t"]]], 1.2, [0, 2]],      // 2-beat quarter-note triplet
];

const TRIPLETS_SHUFFLE = [
  [[[[0, 4, false, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]], 3.2, [0, 1, 2, 3]], // 3 eighth triplets
  [[[[0, 8, false, "8t"], [8, 4, false, "8t"]]], 2.2, [0, 1, 2, 3]],                       // shuffle 2:1 (quarter + eighth)
  [[[[0, 8, false, "4t"], [8, 8, false, "4t"]], [[4, 8, false, "4t"]]], 1.4, [0, 2]],      // 2-beat quarter-note triplet
];

const TRIPLETS_SYNC = [
  [[[[0, 4, false, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]], 2.8, [0, 1, 2, 3]], // 3 eighth triplets
  [[[[0, 8, false, "8t"], [8, 4, false, "8t"]]], 2.2, [0, 1, 2, 3]],                       // shuffle 2:1
  [[[[0, 4, false, "8t"], [4, 8, false, "8t"]]], 1.3, [0, 1, 2, 3]],                       // reverse shuffle 1:2
  [[[[0, 4, true, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]], 1.6, [0, 1, 2, 3]],  // rest + 2 eighths
  [[[[0, 4, false, "8t"], [4, 4, true, "8t"], [8, 4, false, "8t"]]], 1.4, [0, 1, 2, 3]],  // eighth + rest + eighth
  [[[[0, 4, false, "8t"], [4, 4, false, "8t"], [8, 4, true, "8t"]]], 1.2, [0, 1, 2, 3]],  // 2 eighths + rest
  [[[[0, 8, false, "4t"], [8, 8, false, "4t"]], [[4, 8, false, "4t"]]], 1.8, [0, 2]],      // 2-beat quarter-note triplet
];

const TRIPLETS_ADV = [
  [[[[0, 4, false, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]], 2.4, [0, 1, 2, 3]],
  [[[[0, 8, false, "8t"], [8, 4, false, "8t"]]], 2.0, [0, 1, 2, 3]],
  [[[[0, 4, false, "8t"], [4, 8, false, "8t"]]], 1.4, [0, 1, 2, 3]],
  [[[[0, 4, true, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]], 1.6, [0, 1, 2, 3]],
  [[[[0, 4, false, "8t"], [4, 4, true, "8t"], [8, 4, false, "8t"]]], 1.4, [0, 1, 2, 3]],
  [[[[0, 4, false, "8t"], [4, 4, false, "8t"], [8, 4, true, "8t"]]], 1.2, [0, 1, 2, 3]],
  [[[[0, 8, false, "4t"], [8, 8, false, "4t"]], [[4, 8, false, "4t"]]], 1.8, [0, 1, 2]],
];

// Compound 6/8 pattern pools (18 ticks/beat = 1 dotted quarter = 3 eighth notes) across 6 levels
const PATTERNS_68_LV1 = [
  [[[[0, 36, false, null]], []], 1.4, [0]],                                             // dotted half (full bar)
  [[[[0, 18, false, null]]], 4.2, [0, 1]],                                              // dotted quarter
  [[[[0, 18, true, null]]], 1.4, [0, 1]],                                               // dotted quarter rest
  [[[[0, 12, false, null], [12, 6, false, null]]], 3.0, [0, 1]],                        // quarter + eighth
];

const PATTERNS_68_LV2 = [
  [[[[0, 36, false, null]], []], 1.0, [0]],
  [[[[0, 18, false, null]]], 3.0, [0, 1]],
  [[[[0, 18, true, null]]], 1.0, [0, 1]],
  [[[[0, 6, false, null], [6, 6, false, null], [12, 6, false, null]]], 4.6, [0, 1]],    // 3 straight eighths
  [[[[0, 12, false, null], [12, 6, false, null]]], 3.2, [0, 1]],                        // quarter + eighth
];

const PATTERNS_68_LV3 = [
  [[[[0, 36, false, null]], []], 0.9, [0]],
  [[[[0, 18, false, null]]], 2.6, [0, 1]],
  [[[[0, 18, true, null]]], 0.9, [0, 1]],
  [[[[0, 6, false, null], [6, 6, false, null], [12, 6, false, null]]], 4.0, [0, 1]],
  [[[[0, 12, false, null], [12, 6, false, null]]], 3.2, [0, 1]],
  [[[[0, 6, true, null], [6, 6, false, null], [12, 6, false, null]]], 1.6, [0, 1]],
  [[[[0, 12, false, null], [12, 6, true, null]]], 1.4, [0, 1]],
];

const PATTERNS_68_LV4 = [
  [[[[0, 36, false, null]], []], 0.6, [0]],
  [[[[0, 18, false, null]]], 2.0, [0, 1]],
  [[[[0, 18, true, null]]], 0.6, [0, 1]],
  [[[[0, 6, false, null], [6, 6, false, null], [12, 6, false, null]]], 3.0, [0, 1]],
  [[[[0, 12, false, null], [12, 6, false, null]]], 2.8, [0, 1]],
  [[[[0, 6, false, null], [6, 12, false, null]]], 2.2, [0, 1]],                         // eighth + quarter (syncopation)
  [[[[0, 6, true, null], [6, 6, false, null], [12, 6, false, null]]], 2.0, [0, 1]],
  [[[[0, 6, false, null], [6, 6, true, null], [12, 6, false, null]]], 2.0, [0, 1]],     // eighth + rest + eighth
  [[[[0, 6, false, null], [6, 6, false, null], [12, 6, true, null]]], 1.5, [0, 1]],     // 2 eighths + rest
  [[[[0, 6, true, null], [6, 12, false, null]]], 1.5, [0, 1]],                          // 8th rest + quarter
  [[[[0, 12, true, null], [12, 6, false, null]]], 1.3, [0, 1]],                         // quarter rest + eighth
];

const PATTERNS_68_LV5 = [
  ...PATTERNS_68_LV3.map(([c, w, s]) => [c, w * 0.7, s]),
  [[[[0, 3, false, null], [3, 3, false, null], [6, 6, false, null], [12, 6, false, null]]], 2.8, [0, 1]],
  [[[[0, 6, false, null], [6, 3, false, null], [9, 3, false, null], [12, 6, false, null]]], 2.6, [0, 1]],
  [[[[0, 6, false, null], [6, 6, false, null], [12, 3, false, null], [15, 3, false, null]]], 2.8, [0, 1]],
  [[[[0, 12, false, null], [12, 3, false, null], [15, 3, false, null]]], 2.4, [0, 1]],  // quarter + two 16ths
];

const PATTERNS_68_LV6 = [
  ...PATTERNS_68_LV4.map(([c, w, s]) => [c, w * 0.65, s]),
  [[[[0, 3, false, null], [3, 3, false, null], [6, 6, false, null], [12, 6, false, null]]], 2.2, [0, 1]],
  [[[[0, 6, false, null], [6, 3, false, null], [9, 3, false, null], [12, 6, false, null]]], 2.0, [0, 1]],
  [[[[0, 6, false, null], [6, 6, false, null], [12, 3, false, null], [15, 3, false, null]]], 2.2, [0, 1]],
  [[[[0, 9, false, null], [9, 3, false, null], [12, 6, false, null]]], 2.2, [0, 1]],    // dot8 + 16th + 8th
  [[[[0, 12, false, null], [12, 3, false, null], [15, 3, false, null]]], 2.0, [0, 1]],  // quarter + two 16ths
  [[[[0, 3, false, null], [3, 3, false, null], [6, 3, false, null], [9, 3, false, null], [12, 6, false, null]]], 1.5, [0, 1]],
  [[[[0, 6, true, null], [6, 3, false, null], [9, 3, false, null], [12, 6, false, null]]], 1.4, [0, 1]],
];

const LEVEL_POOLS = {
  1: PATTERNS_LV1, 2: PATTERNS_LV2, 3: PATTERNS_LV3,
  4: PATTERNS_LV4, 5: PATTERNS_LV5, 6: PATTERNS_LV6,
};
const TRIPLET_POOLS = {
  1: TRIPLETS_BASIC, 2: TRIPLETS_SHUFFLE, 3: TRIPLETS_SHUFFLE,
  4: TRIPLETS_SYNC, 5: TRIPLETS_ADV, 6: TRIPLETS_ADV,
};
const COMPOUND68_POOLS = {
  1: PATTERNS_68_LV1, 2: PATTERNS_68_LV2, 3: PATTERNS_68_LV3,
  4: PATTERNS_68_LV4, 5: PATTERNS_68_LV5, 6: PATTERNS_68_LV6,
};
export const LEVEL_TITLES = {
  1: "Lv1 · Quarter & Rest Basics",
  2: "Lv2 · Straight 8ths",
  3: "Lv3 · 8th Off-beats & Dotted",
  4: "Lv4 · 8th Syncopation",
  5: "Lv5 · 16th Basics",
  6: "Lv6 · 16th Notes Advanced",
};
export const TIE_PROBS = { 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.28, 5: 0.12, 6: 0.24 };
export const PRE_DELAY_SEC = 0.5;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function patternIsAllRest(cells) {
  return cells.every(c => c.every(ev => ev[2]));
}

function beatStartAllowed(cells, starts, bt, beatsPerBar, isCompound) {
  if (isCompound) return starts.includes(bt);
  if (cells.length === 1) return true; // any 1-beat pattern allowed on any beat (0..4)
  if (starts.includes(bt)) return true;
  // Allow 2-beat patterns on beat 3 (4th beat) in 5/4 (3+2 grouping), and 3-beat patterns on beat 2 in 5/4
  if (beatsPerBar === 5 && cells.length === 2 && bt === 3) return true;
  if (beatsPerBar === 5 && cells.length === 3 && bt === 2) return true;
  return false;
}

export function buildPhraseFromBars(bars, timeSigKey, seed = 0, isCustom = false, customCode = "") {
  const ts = TIME_SIGS[timeSigKey] || TIME_SIGS["4/4"];
  const targets = [];
  const rests = [];
  bars.forEach((beats, bIdx) => {
    beats.forEach((events, btIdx) => {
      events.forEach(ev => {
        const globalSlot = bIdx * ts.barTicks + btIdx * ts.beatTicks + ev.slot;
        if (ev.rest) {
          rests.push({
            bar: bIdx,
            beat: btIdx,
            slotInBeat: ev.slot,
            globalSlot,
            durSlots: ev.dur,
            timeSec: 0,
            endSec: 0,
            error: false,
            errorKind: null,
            ringFrames: 0,
          });
          return;
        }
        if (ev.tiedIn && targets.length) {
          targets[targets.length - 1].durSlots += ev.dur;
          targets[targets.length - 1].tied = true;
        } else if (!ev.tiedIn) {
          targets.push({
            bar: bIdx,
            beat: btIdx,
            slotInBeat: ev.slot,
            globalSlot,
            durSlots: ev.dur,
            art: ev.art || null,
            tuplet: ev.tuplet || null,
            tied: Boolean(ev.tiedOut),
            timeSec: 0,
            hit: false,
            missed: false,
            errMs: null,
          });
        }
      });
    });
  });
  return { seed, timeSig: timeSigKey, bars, targets, rests, isCustom, customCode };
}

// Serverless Compact Custom Score Serializer (v1, URL-safe Base64 prefixed with "C1_")
export const DUR_TO_CH = { 3: "3", 4: "4", 6: "6", 8: "8", 9: "9", 12: "c", 18: "i", 24: "o", 36: "w", 48: "Z" };
export const CH_TO_DUR = { "3": 3, "4": 4, "6": 6, "8": 8, "9": 9, "c": 12, "i": 18, "o": 24, "w": 36, "Z": 48 };
export const TS_TO_CODE = { "4/4": "44", "3/4": "34", "2/4": "24", "5/4": "54", "6/8": "68" };
export const CODE_TO_TS = { "44": "4/4", "34": "3/4", "24": "2/4", "54": "5/4", "68": "6/8" };

export function encodeCustomScore(timeSigKey, bars) {
  const tsCode = TS_TO_CODE[timeSigKey] || "44";
  const barStrs = bars.map(beats =>
    beats.map(events =>
      events.map(ev => {
        const sCh = ev.slot.toString(36);
        const dCh = DUR_TO_CH[ev.dur] || "c";
        let fl = "";
        if (ev.rest) fl += "r";
        if (ev.art === "staccato") fl += "s";
        else if (ev.art === "ghost") fl += "g";
        if (ev.tuplet === "8t") fl += "t";
        else if (ev.tuplet === "4t") fl += "q";
        if (ev.tiedIn) fl += "i";
        if (ev.tiedOut) fl += "o";
        return sCh + dCh + fl;
      }).join(".")
    ).join(",")
  );
  const raw = `1:${tsCode}:${barStrs.join("|")}`;
  const b64 = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "C1_" + b64;
}

export function decodeCustomScore(input) {
  if (!input || typeof input !== "string") return null;
  let code = input.trim();
  let parsedBpm = null;
  if (code.includes("custom=")) {
    try {
      const u = new URL(code.startsWith("http") ? code : "https://x.local/?" + code.replace(/^\?/, ""));
      const c = u.searchParams.get("custom");
      const b = u.searchParams.get("bpm");
      if (c) code = c.trim();
      if (b && Number.isFinite(Number(b))) parsedBpm = Math.max(40, Math.min(180, Math.round(Number(b))));
    } catch (_) {}
  }
  if (!code.startsWith("C1_")) return null;
  try {
    let b64 = code.slice(3).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const raw = atob(b64);
    const parts = raw.split(":");
    if (parts.length !== 3 || parts[0] !== "1") return null;
    const timeSig = CODE_TO_TS[parts[1]];
    if (!timeSig) return null;
    const ts = TIME_SIGS[timeSig];
    const barStrs = parts[2].split("|");
    if (barStrs.length < 1 || barStrs.length > 16) return null;

    const bars = [];
    for (const bs of barStrs) {
      const beatStrs = bs.split(",");
      if (beatStrs.length !== ts.beatsPerBar) return null;
      const beats = [];
      let barDur = 0;
      for (const evListStr of beatStrs) {
        if (!evListStr) {
          beats.push([]);
          continue;
        }
        const evs = [];
        let prevEnd = 0;
        for (const tok of evListStr.split(".")) {
          if (tok.length < 2) return null;
          const slot = parseInt(tok[0], 36);
          const dur = CH_TO_DUR[tok[1]];
          if (!Number.isFinite(slot) || slot < 0 || slot >= ts.beatTicks || !dur) return null;
          if (slot < prevEnd) return null;
          const fl = tok.slice(2);
          const rest = fl.includes("r");
          const art = rest ? null : (fl.includes("s") ? "staccato" : (fl.includes("g") ? "ghost" : null));
          const tuplet = fl.includes("t") ? "8t" : (fl.includes("q") ? "4t" : null);
          const tiedIn = !rest && fl.includes("i");
          const tiedOut = !rest && fl.includes("o");
          evs.push({ slot, dur, rest, tuplet, tiedIn, tiedOut, art });
          barDur += dur;
          prevEnd = slot + dur;
        }
        beats.push(evs);
      }
      if (barDur !== ts.barTicks) return null;
      bars.push(beats);
    }
    return { timeSig, bars, bpm: parsedBpm, code };
  } catch (_) {
    return null;
  }
}

// Self-contained Full Seed Code: e.g. "44-L4T1SG-8B-80-A1B2"
// Encodes meter, level, T1/T2/S/G toggles, bar count, BPM, and 4-hex RNG seed in one short string
export function encodeFullSeedCode(cfg) {
  const tsCode = TS_TO_CODE[cfg.timeSig] || "44";
  const ts = TIME_SIGS[cfg.timeSig] || TIME_SIGS["4/4"];
  const effTri = (!ts.compound && cfg.level >= 2) ? (Number(cfg.tripletMode) || 0) : 0;
  const tTag = effTri === 2 ? "T2" : (effTri === 1 ? "T1" : "");
  const flags = `${tTag}${cfg.staccatoOn ? "S" : ""}${cfg.ghostOn ? "G" : ""}`;
  const hex = (Number(cfg.seed) >>> 0).toString(16).toUpperCase().padStart(4, "0");
  return `${tsCode}-L${cfg.level}${flags}-${cfg.numBars}B-${Math.round(cfg.bpm)}-${hex}`;
}

export function decodeFullSeedCode(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().replace(/^seed\s*/i, "").replace(/^#/, "").toUpperCase();
  const m = s.match(/^(44|34|24|54|68)-L([1-6])(T[12])?(S)?(G)?-(\d{1,2})B-(\d{2,3})-([0-9A-F]{1,8})$/);
  if (!m) return null;
  const timeSig = CODE_TO_TS[m[1]];
  const level = Number(m[2]);
  const tripletMode = m[3] === "T2" ? 2 : (m[3] === "T1" ? 1 : 0);
  const staccatoOn = Boolean(m[4]);
  const ghostOn = Boolean(m[5]);
  const numBars = Number(m[6]);
  const bpm = Number(m[7]);
  const seed = parseInt(m[8], 16);
  if (!timeSig || !BAR_OPTIONS.includes(numBars) || bpm < 40 || bpm > 180 || !Number.isFinite(seed) || seed <= 0) {
    return null;
  }
  return { timeSig, level, tripletMode, staccatoOn, ghostOn, numBars, bpm, seed };
}

// Deterministic Daily Challenge (same 8-bar score worldwide per calendar date YYYY-MM-DD)
export function getTodayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function hashDateSeed(dateStr, isPlus = false) {
  let h = 2166136261 >>> 0;
  const s = (isPlus ? "RSR-DAILY-PLUS-" : "RSR-DAILY-") + dateStr;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 0x1000 + (h % 0xEFFF);
}

export function getDailyChallengeSpec(dateStr = null, isPlus = false) {
  const ds = (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : getTodayDateStr();
  const [y, m, d] = ds.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  // Standard Daily: approachable 4/4 daily sight-reading warm-up (Lv2-5, no triplets)
  const stdSchedule = [
    { timeSig: "4/4", level: 3, bpm: 70, tripletMode: 0, staccatoOn: true,  ghostOn: false }, // Sun
    { timeSig: "4/4", level: 2, bpm: 70, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Mon
    { timeSig: "4/4", level: 3, bpm: 75, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Tue
    { timeSig: "4/4", level: 3, bpm: 70, tripletMode: 0, staccatoOn: true,  ghostOn: false }, // Wed
    { timeSig: "4/4", level: 4, bpm: 70, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Thu
    { timeSig: "4/4", level: 3, bpm: 70, tripletMode: 0, staccatoOn: false, ghostOn: true  }, // Fri
    { timeSig: "4/4", level: 5, bpm: 65, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Sat
  ];
  // Daily+: non-4/4 meters (3/4, 2/4, 5/4, 6/8) at playable Lv3-4 tempos (no triplets)
  const plusSchedule = [
    { timeSig: "3/4", level: 3, bpm: 70, tripletMode: 0, staccatoOn: true,  ghostOn: false }, // Sun
    { timeSig: "2/4", level: 3, bpm: 70, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Mon
    { timeSig: "6/8", level: 3, bpm: 60, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Tue
    { timeSig: "5/4", level: 3, bpm: 70, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Wed
    { timeSig: "3/4", level: 4, bpm: 70, tripletMode: 0, staccatoOn: false, ghostOn: false }, // Thu
    { timeSig: "6/8", level: 4, bpm: 60, tripletMode: 0, staccatoOn: true,  ghostOn: false }, // Fri
    { timeSig: "5/4", level: 4, bpm: 70, tripletMode: 0, staccatoOn: false, ghostOn: true  }, // Sat
  ];
  const picked = (isPlus ? plusSchedule : stdSchedule)[dow];
  return {
    dateStr: ds,
    isPlus: Boolean(isPlus),
    numBars: 8,
    seed: hashDateSeed(ds, isPlus),
    ...picked,
  };
}

export function generatePhrase(numBars, level, tripletMode = 0, timeSigKey = "4/4", forcedSeed = null, staccatoOn = false, ghostOn = false) {
  const ts = TIME_SIGS[timeSigKey] || TIME_SIGS["4/4"];
  const tMode = (typeof tripletMode === "boolean") ? (tripletMode ? 2 : 0) : (Number(tripletMode) || 0);
  const activeTriMode = (!ts.compound && level >= 2) ? tMode : 0;
  const seed = forcedSeed ?? (0x1000 + Math.floor(Math.random() * 0xEFFF));
  const rand = mulberry32(seed);
  let triPool = [];
  if (activeTriMode === 1) {
    // 8th-note triplets only (exclude 2-beat quarter-note triplets "4t")
    triPool = TRIPLET_POOLS[level].filter(([cells]) => !cells.some(c => c.some(ev => ev[3] === "4t")));
  } else if (activeTriMode === 2) {
    // 8th-note triplets + 2-beat quarter-note triplets ("4t", slightly boosted weight so they appear reliably)
    triPool = TRIPLET_POOLS[level].map(([cells, w, starts]) => {
      const is4t = cells.some(c => c.some(ev => ev[3] === "4t"));
      return [cells, is4t ? Math.max(w, 2.3) : w, starts];
    });
  }
  const pool = ts.compound
    ? COMPOUND68_POOLS[level]
    : (activeTriMode > 0 ? [...LEVEL_POOLS[level], ...triPool] : LEVEL_POOLS[level]);
  const tieProb = TIE_PROBS[level];

  let bestBars = [];
  let bestTargets = [];
  let bestRests = [];

  for (let attempt = 0; attempt < 40; attempt++) {
    const bars = [];
    let hasTriplet = false;
    let hasQuarterTriplet = false;
    let hasStaccato = false;
    let hasGhost = false;
    for (let b = 0; b < numBars; b++) {
      const beats = [];
      let prevRest = false;
      while (beats.length < ts.beatsPerBar) {
        const bt = beats.length;
        const rem = ts.beatsPerBar - bt;
        const cands = pool.filter(([cells, _w, starts]) =>
          cells.length <= rem &&
          beatStartAllowed(cells, starts, bt, ts.beatsPerBar, ts.compound) &&
          !(prevRest && patternIsAllRest(cells))
        );
        const totalW = cands.reduce((s, c) => s + c[1], 0);
        let r = rand() * totalW;
        let chosen = cands[0][0];
        for (const [cells, w] of cands) {
          r -= w;
          if (r <= 0) { chosen = cells; break; }
        }
        for (const cell of chosen) {
          beats.push(cell.map(([slot, dur, rest, tuplet]) => {
            if (tuplet) hasTriplet = true;
            if (tuplet === "4t") hasQuarterTriplet = true;
            return { slot, dur, rest, tuplet: tuplet || null, tiedIn: false, tiedOut: false, art: null };
          }));
        }
        prevRest = patternIsAllRest(chosen);
      }

      for (let bt = 1; bt < ts.beatsPerBar; bt++) {
        if (!beats[bt - 1].length || !beats[bt].length) continue;
        const prevEv = beats[bt - 1][beats[bt - 1].length - 1];
        const currEv = beats[bt][0];
        if (
          !prevEv.rest && !currEv.rest && !prevEv.tiedIn &&
          !prevEv.tuplet && !currEv.tuplet &&
          prevEv.slot + prevEv.dur === ts.beatTicks && currEv.slot === 0 &&
          rand() < tieProb
        ) {
          prevEv.tiedOut = true;
          currEv.tiedIn = true;
        }
      }

      // Assign optional bass articulations (ghost dead-notes & staccato) on untied notes
      if (staccatoOn || ghostOn) {
        let consecGhost = 0;
        for (let bt = 0; bt < beats.length; bt++) {
          for (const ev of beats[bt]) {
            if (ev.rest || ev.tiedIn || ev.tiedOut) {
              consecGhost = 0;
              continue;
            }
            let assigned = null;
            const isBarDownbeat = (bt === 0 && ev.slot === 0);
            if (ghostOn && !isBarDownbeat && consecGhost < 2) {
              const ghostMaxDur = (level === 1 && !ts.compound) ? 12 : 6;
              if (ev.dur <= ghostMaxDur) {
                const pGhost = ev.dur === 3 ? 0.28 : (ev.slot > 0 ? 0.24 : (level === 1 ? 0.22 : 0.12));
                if (rand() < pGhost) {
                  assigned = "ghost";
                  hasGhost = true;
                  consecGhost += 1;
                }
              }
            }
            if (!assigned) consecGhost = 0;
            if (!assigned && staccatoOn) {
              if (ev.dur === 12 || ev.dur === 18 || ev.dur === 6 || ev.dur === 4) {
                const pStac = (ev.dur === 12 || ev.dur === 18) ? 0.30 : 0.16;
                if (rand() < pStac) {
                  assigned = "staccato";
                  hasStaccato = true;
                }
              }
            }
            ev.art = assigned;
          }
        }
      }

      bars.push(beats);
    }

    const built = buildPhraseFromBars(bars, timeSigKey, seed, false, "");
    const targets = built.targets;
    const rests = built.rests;

    bestBars = bars;
    bestTargets = targets;
    bestRests = rests;
    const minTargets = Math.max(2, level === 1 ? numBars : numBars * Math.min(2, ts.beatsPerBar));
    const triOk = activeTriMode === 0
      ? true
      : (activeTriMode === 2 ? hasQuarterTriplet : hasTriplet);
    if (
      targets.length >= minTargets &&
      triOk &&
      (!staccatoOn || hasStaccato) &&
      (!ghostOn || hasGhost)
    ) break;
  }

  return { seed, timeSig: timeSigKey, bars: bestBars, targets: bestTargets, rests: bestRests, isCustom: false, customCode: "" };
}


export function getDailyStreak(isPlus = false) {
  try {
    const prefix = isPlus ? "rhythm_practice_dailyplus_" : "rhythm_practice_daily_";
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${prefix}${y}-${m}-${day}`;
      if (localStorage.getItem(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return streak;
  } catch (_) {
    return 0;
  }
}

export function saveDailyBest(dateStr, acc, tight, isPlus = false) {
  try {
    const prefix = isPlus ? "rhythm_practice_dailyplus_" : "rhythm_practice_daily_";
    const key = `${prefix}${dateStr}`;
    const prev = JSON.parse(localStorage.getItem(key) || "null");
    if (!prev || acc > prev.acc || (acc === prev.acc && tight > prev.tight)) {
      localStorage.setItem(key, JSON.stringify({ acc: Math.round(acc), tight }));
    }
  } catch (_) {}
}

