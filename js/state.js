// Shared Application State & Core Derived Helpers
import { TIME_SIGS, encodeFullSeedCode } from "./rhythm.js";

export const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");

export const app = {
  bpm: 60,
  level: 1,
  tripletMode: 0, // 0=OFF, 1=8th triplets (T1), 2=+2-beat quarter triplets (T2)
  staccatoOn: false,
  ghostOn: false,
  timeSig: "4/4",
  numBars: 4,
  dailyDate: null,  // "YYYY-MM-DD" when playing Daily / Daily+ Challenge
  dailyPlus: false, // false = 4/4 Daily, true = non-4/4 Daily+
  customMode: false,
  soundOn: true,
  clickVol: 100,    // 0..200 (%) real-time metronome click volume
  showBeatNums: false,
  showCursor: false,
  blindGrade: false,
  gapClick: "OFF",  // Special Training BETA: OFF | 1+1 | 2+2 | 1+3
  fadeBeats: 0,     // Special Training BETA: 0 | 1 | 2
  rushOn: false,    // Special Training BETA: BPM Rush sudden death
  rushMinAcc: 90,   // 85 | 90 | 95
  rushRound: 0,
  rushTimerId: null,
  pitchMode: false,     // Pitch Sight-Reading BETA (flat-key jazz 5-line bass/treble clef)
  pitchClef: "bass",    // "bass" (F-clef) | "treble" (G-clef)
  pitchKey: "Bb",       // "RND" | C | F | Bb | Eb | Ab | Db | Dm | Gm | Cm
  pitchProg: "auto",    // auto | ii-V-I | tritone | backdoor | I-vi-ii-V | blues | modal
  pitchRelative: false, // false = Fixed/Absolute pitch | true = Relative/Movable-Do (Keyboard/MIDI only; Audio stays Absolute)
  pitchShowHints: false,// optional note-name or degree labels for learning clef reading
  pitchFreeMode: false, // Free-Tempo wait-for-note sight-reading (no metronome pressure)
  pitchFreeIdx: 0,      // current target index in Free-Tempo mode
  pitchFreeMistakes: 0, // total wrong-note attempts in current Free-Tempo run
  keyOn: true,
  midiOn: false,
  showTouchDock: false,
  audioOn: false,
  inputMode: "KEY", // derived: KEY | PAD | AUDIO | BOTH
  keyLatencyMs: 0,  // optional offset for KEY/Touch (e.g. Bluetooth headphones)
  state: "READY",   // READY | COUNTIN | PLAY | DEMO | CAL | DONE
  takeId: 1,
  phrase: null,
  scoreLayout: null,
  startAudioT: 0,
  activeSustainTgt: null,
  activeKeyStac: null,
  extraHits: 0,
  keyExtraHits: 0,
  audioExtraHits: 0,
  history: [],
  lastResult: null,
  runSeq: 0,
  dirtyScore: true,
};


export const audioIn = {
  active: false,
  stream: null,
  source: null,
  filters: [],
  splitter: null,
  analysers: [],
  pitchAnalysers: [],
  zeroGain: null,
  buf: null,
  pitchBuf: null,
  pendingPitchChecks: [],
  pollId: null,
  deviceId: "",
  userPickedDevice: false,
  channelMode: "ALL", // "ALL", pair "0-1" / "2-3", or single index "0", "1", "2", "3", ...
  channelCount: 2,
  hotChannel: 0,
  gain: 2,
  threshold: 0.16,
  latencyMs: 25,
  cooldownSec: 0.075,
  level: 0,
  rawPeak: 0,
  prevLevel: 0,
  recentLevels: [],
  fluxBase: 0,
  wasAbove: false,
  lastOnset: 0,
  lastTriggerMs: 0,
  calibrating: false,
  calMaxLevel: 0,
  deviceLabel: "",
};


export const calState = {
  totalClicks: 16,
  warmupClicks: 4,
  minTaps: 6,
  beatSec: 60 / 90,
  startAudioT: 0,
  taps: [],      // { idx, deltaMs, source }
  captured: {},  // idx -> true
};


export const edState = {
  open: false,
  selBar: 0,
  selBeat: 0,
  timeSig: "4/4",
  bars: [],
};


export const tourState = { open: false, idx: 0 };

export function getTimeSig(key = null) {
  return TIME_SIGS[key || app.timeSig] || TIME_SIGS["4/4"];
}


export function tripletsAllowed(level = app.level, ts = null) {
  const t = ts || getTimeSig();
  return !t.compound && level >= 2;
}


export function isGapBar(playBar, gapMode = "OFF") {
  if (playBar < 0 || !gapMode || gapMode === "OFF") return false;
  if (gapMode === "1+1") return (playBar % 2) >= 1;
  if (gapMode === "2+2") return (playBar % 4) >= 2;
  if (gapMode === "1+3") return (playBar % 4) >= 1;
  return false;
}


export function hitWindowSec() {
  const ts = getTimeSig();
  const beatSec = 60 / app.bpm;
  if (ts.compound) {
    // In 6/8 at dotted-quarter = bpm, 8th note is beatSec/3, 16th is beatSec/6
    return app.level >= 5 ? Math.min(0.115, (beatSec / 6) * 0.48) : Math.min(0.135, (beatSec / 3) * 0.46);
  }
  if (app.level >= 5) return Math.min(0.120, (beatSec / 4) * 0.48);
  if (app.tripletMode > 0 && tripletsAllowed()) return Math.min(0.135, (beatSec / 3) * 0.46);
  if (app.level <= 2) return Math.min(0.165, (beatSec / 2) * 0.46);
  return Math.min(0.150, (beatSec / 2) * 0.45);
}


export function currentFullSeedCode() {
  const resolvedKey = (app.phrase && app.phrase.pitchMeta && app.phrase.pitchMeta.key)
    ? app.phrase.pitchMeta.key
    : (app.pitchKey === "RND" ? "Bb" : app.pitchKey);
  return encodeFullSeedCode({
    timeSig: app.timeSig,
    level: app.level,
    tripletMode: app.tripletMode,
    staccatoOn: app.staccatoOn,
    ghostOn: app.ghostOn,
    numBars: app.numBars,
    bpm: app.bpm,
    seed: app.phrase ? app.phrase.seed : 0x1000,
    pitchMode: app.pitchMode,
    pitchClef: app.pitchClef,
    pitchKey: resolvedKey,
    pitchProg: app.pitchProg,
  });
}


export function deriveInputMode() {
  const tap = app.keyOn || app.showTouchDock || app.midiOn;
  if (app.audioOn && tap) return "BOTH";
  if (app.audioOn) return "AUDIO";
  if (app.midiOn && !app.keyOn && !app.showTouchDock) return "MIDI";
  if (app.showTouchDock && !app.keyOn && !app.midiOn) return "PAD";
  return "KEY";
}
