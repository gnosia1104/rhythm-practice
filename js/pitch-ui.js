// Pitch Sight-Reading BETA UI, QWERTY/Dock Piano, Free-Tempo & MIDI Input Module
import { app } from "./state.js";
import { t } from "./i18n.js";
import { generatePhrase } from "./rhythm.js";
import {
  JAZZ_KEYS, FLAT_PC_NAMES, DEGREE_NAMES, getRelativeDegreeName, midiToFreq,
  assignPitchesToPhrase, clearPitchesFromPhrase,
} from "./pitch-gen.js";
import { comparePitchClass } from "./pitch-detect.js";
import { ensureAudioCtx, scheduleBassNote } from "./audio-out.js";

// Shifted ergonomic DAW layout starting from E = C (e 4 r 5 t y 7 u 8 i 9 o p),
// plus low A-Bb-B (q 2 w) on the left for natural leading tones.
export const PITCH_WHITE_KEYS = [
  { code: "KeyQ", kbd: "Q", midi: 33, note: "A" },
  { code: "KeyW", kbd: "W", midi: 35, note: "B" },
  { code: "KeyE", kbd: "E", midi: 36, note: "C", cAnchor: true },
  { code: "KeyR", kbd: "R", midi: 38, note: "D" },
  { code: "KeyT", kbd: "T", midi: 40, note: "E" },
  { code: "KeyY", kbd: "Y", midi: 41, note: "F" },
  { code: "KeyU", kbd: "U", midi: 43, note: "G" },
  { code: "KeyI", kbd: "I", midi: 45, note: "A" },
  { code: "KeyO", kbd: "O", midi: 47, note: "B" },
  { code: "KeyP", kbd: "P", midi: 48, note: "C", cAnchor: true },
];
export const PITCH_BLACK_KEYS = [
  { code: "Digit2", kbd: "2", midi: 34, note: "B♭", leftPct: 6.6 },
  { code: "Digit4", kbd: "4", midi: 37, note: "D♭", leftPct: 26.6 },
  { code: "Digit5", kbd: "5", midi: 39, note: "E♭", leftPct: 36.6 },
  { code: "Digit7", kbd: "7", midi: 42, note: "G♭", leftPct: 56.6 },
  { code: "Digit8", kbd: "8", midi: 44, note: "A♭", leftPct: 66.6 },
  { code: "Digit9", kbd: "9", midi: 46, note: "B♭", leftPct: 76.6 },
];
export const PITCH_KEY_MAP = new Map([...PITCH_WHITE_KEYS, ...PITCH_BLACK_KEYS].map((k) => [k.code, k]));
// Unused top-row digits (gaps between black keys: 1, 3, 6, 0) swallowed while Pitch BETA is ON so level shortcuts never misfire
export const PITCH_TOP_ROW_SWALLOW = new Set(["Digit1", "Digit3", "Digit6", "Digit0"]);

const DOCK_WHITE_KEYS = [
  { code: "DockC",  midi: 36, note: "C", cAnchor: true },
  { code: "DockD",  midi: 38, note: "D" },
  { code: "DockE",  midi: 40, note: "E" },
  { code: "DockF",  midi: 41, note: "F" },
  { code: "DockG",  midi: 43, note: "G" },
  { code: "DockA",  midi: 45, note: "A" },
  { code: "DockB",  midi: 47, note: "B" },
  { code: "DockC2", midi: 48, note: "C", cAnchor: true },
];
const DOCK_BLACK_KEYS = [
  { code: "DockDb", midi: 37, note: "D♭", leftPct: 8.2 },
  { code: "DockEb", midi: 39, note: "E♭", leftPct: 20.7 },
  { code: "DockGb", midi: 42, note: "G♭", leftPct: 45.7 },
  { code: "DockAb", midi: 44, note: "A♭", leftPct: 58.2 },
  { code: "DockBb", midi: 46, note: "B♭", leftPct: 70.7 },
];

let cbs = {
  resetTargets: () => {},
  stopRun: () => {},
  updateMeta: () => {},
  setHitBadge: () => {},
  handleHit: () => {},
  recordCalibrationTap: () => {},
  onUiChange: () => {},
};

export function applyPitchToCurrentPhrase(rebuildRhythm = false) {
  if (!app.phrase) return;
  if (rebuildRhythm && !app.customMode && !app.dailyDate) {
    app.phrase = generatePhrase(app.numBars, app.level, app.tripletMode, app.timeSig, app.phrase.seed, app.staccatoOn, app.ghostOn, app.pitchMode);
  }
  if (app.pitchMode) {
    assignPitchesToPhrase(app.phrase, app.pitchKey, app.pitchProg, app.pitchClef);
  } else {
    clearPitchesFromPhrase(app.phrase);
  }
  app.dirtyScore = true;
}

export function getActivePitchKeyId() {
  if (app.phrase && app.phrase.pitchMeta && app.phrase.pitchMeta.key) {
    return app.phrase.pitchMeta.key;
  }
  return app.pitchKey === "RND" ? "Bb" : app.pitchKey;
}

export function getActiveKeyRootPc() {
  return (JAZZ_KEYS[getActivePitchKeyId()] || JAZZ_KEYS.C).rootPc;
}

export function findNextPitchFreeIdx(startIdx) {
  const tgts = (app.phrase && app.phrase.targets) || [];
  let idx = startIdx;
  while (idx < tgts.length && tgts[idx].art === "ghost") idx++;
  return idx;
}

export function handlePitchFreeStep(playedMidiFloat, sourceTag = "KEY") {
  if (!app.pitchMode || !app.pitchFreeMode || !app.phrase) return;
  const tgts = app.phrase.targets || [];
  if (!tgts.length) return;
  if (app.pitchFreeIdx >= tgts.length) {
    cbs.resetTargets();
  }
  const curIdx = findNextPitchFreeIdx(app.pitchFreeIdx);
  if (curIdx >= tgts.length) return;
  const tgt = tgts[curIdx];
  if (!tgt.pitch) return;

  const useRel = Boolean(app.pitchRelative && sourceTag !== "AUD");
  const keyId = getActivePitchKeyId();
  const cmp = comparePitchClass(playedMidiFloat, tgt.pitch.midi, 45);
  const tgtLbl = useRel ? getRelativeDegreeName(tgt.pitch.midi, keyId) : tgt.pitch.name;
  const detLbl = useRel ? getRelativeDegreeName(Math.round(playedMidiFloat), keyId) : cmp.detectedName;

  if (cmp.ok) {
    tgt.hit = true;
    tgt.pitchOk = true;
    tgt.detectedPitch = detLbl;
    app.pitchFreeIdx = findNextPitchFreeIdx(curIdx + 1);
    app.dirtyScore = true;

    if (app.pitchFreeIdx >= tgts.length) {
      const gradable = tgts.filter((tg) => tg.art !== "ghost" && tg.pitch);
      const firstTryOk = gradable.filter((tg) => tg.pitchOk === true && !tg.hadWrongTry).length;
      const pct = gradable.length ? (firstTryOk / gradable.length) * 100 : 100;
      const msgEl = document.getElementById("pitchMsg");
      msgEl.style.color = pct >= 85 ? "var(--green)" : (pct >= 65 ? "var(--amber)" : "var(--red)");
      msgEl.textContent = t("pitchFreeDone", firstTryOk, gradable.length, pct, app.pitchFreeMistakes);
      cbs.setHitBadge(`[${sourceTag}] 🎯 ${firstTryOk}/${gradable.length} (${pct.toFixed(0)}%)`, "tight");
    } else {
      cbs.setHitBadge(`[${sourceTag}] ✓ ${tgtLbl}`, "tight");
    }
  } else {
    tgt.pitchOk = false;
    tgt.hadWrongTry = true;
    tgt.detectedPitch = detLbl;
    app.pitchFreeMistakes += 1;
    app.dirtyScore = true;
    cbs.setHitBadge(`[${sourceTag}] ${tgtLbl} ≠ ${detLbl}`, "err");
  }
}

export function flashPianoKeyByMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const match = [...PITCH_WHITE_KEYS, ...PITCH_BLACK_KEYS].find((k) => (k.midi % 12) === pc);
  if (!match) return;
  const kEl = document.querySelector(`#pitchPiano [data-code="${match.code}"]`);
  if (kEl) {
    kEl.classList.add("pressed");
    window.setTimeout(() => kEl.classList.remove("pressed"), 150);
  }
}

export function triggerPitchPianoKey(keySpec, fromPointer = false) {
  if (!keySpec) return;
  const ctx = ensureAudioCtx();
  const kEl = document.querySelector(`#pitchPiano [data-code="${keySpec.code}"]`);
  if (kEl) {
    kEl.classList.add("pressed");
    if (fromPointer) {
      window.setTimeout(() => kEl.classList.remove("pressed"), 140);
    }
  }
  const rootShift = app.pitchRelative ? getActiveKeyRootPc() : 0;
  const effectiveMidi = keySpec.midi + rootShift;
  if (ctx) {
    let soundMidi = app.pitchClef === "treble" ? (effectiveMidi + 24) : effectiveMidi;
    if (app.pitchClef === "bass" && soundMidi > 55) soundMidi -= 12;
    if (app.pitchClef === "treble" && soundMidi > 84) soundMidi -= 12;
    scheduleBassNote(ctx, ctx.currentTime, 0.26, midiToFreq(soundMidi));
  }
  if (app.state === "CAL" && ctx) {
    cbs.recordCalibrationTap(ctx.currentTime, "KEY");
  } else if ((app.state === "COUNTIN" || app.state === "PLAY") && ctx) {
    if (app.keyOn || fromPointer) {
      cbs.handleHit(ctx.currentTime - app.keyLatencyMs / 1000, fromPointer ? "PAD" : "KEY", "NORMAL", keySpec.code, effectiveMidi);
    }
  } else if (app.pitchFreeMode) {
    handlePitchFreeStep(effectiveMidi, fromPointer ? "PAD" : "KEY");
  } else {
    const lbl = app.pitchRelative ? DEGREE_NAMES[((keySpec.midi % 12) + 12) % 12] : keySpec.note;
    const srcTag = fromPointer ? "PAD" : "KEY";
    cbs.setHitBadge(keySpec.kbd ? `[${srcTag}] ${lbl} (${keySpec.kbd})` : `[${srcTag}] ${lbl}`, "tight");
  }
}

export function handleMidiNoteOn(midiNote) {
  const ctx = ensureAudioCtx();
  const rootShift = (app.pitchMode && app.pitchRelative) ? getActiveKeyRootPc() : 0;
  const effectiveMidi = midiNote + rootShift;
  const pc = ((effectiveMidi % 12) + 12) % 12;
  const noteName = (app.pitchMode && app.pitchRelative)
    ? DEGREE_NAMES[((midiNote % 12) + 12) % 12]
    : FLAT_PC_NAMES[pc];
  if (app.pitchMode) {
    flashPianoKeyByMidi(midiNote);
    if (ctx) {
      const playMidi = app.pitchClef === "treble"
        ? (effectiveMidi < 48 ? effectiveMidi + 24 : (effectiveMidi > 84 ? effectiveMidi - 12 : effectiveMidi))
        : (effectiveMidi < 28 ? effectiveMidi + 12 : (effectiveMidi > 60 ? effectiveMidi - 12 : effectiveMidi));
      scheduleBassNote(ctx, ctx.currentTime, 0.26, midiToFreq(playMidi));
    }
  }
  if (app.state === "CAL" && ctx) {
    cbs.recordCalibrationTap(ctx.currentTime, "MIDI");
  } else if ((app.state === "COUNTIN" || app.state === "PLAY") && ctx) {
    cbs.handleHit(ctx.currentTime, "MIDI", "NORMAL", null, app.pitchMode ? effectiveMidi : null);
  } else if (app.pitchMode && app.pitchFreeMode) {
    handlePitchFreeStep(effectiveMidi, "MIDI");
  } else {
    cbs.setHitBadge(`[MIDI] ${noteName}`, "tight");
  }
}

export function syncPitchPianoLabels() {
  for (const k of [...PITCH_WHITE_KEYS, ...PITCH_BLACK_KEYS]) {
    const node = document.querySelector(`#pitchPiano [data-code="${k.code}"] .pk-note`);
    if (node) {
      node.textContent = app.pitchRelative ? DEGREE_NAMES[((k.midi % 12) + 12) % 12] : k.note;
    }
  }
  for (const k of [...DOCK_WHITE_KEYS, ...DOCK_BLACK_KEYS]) {
    const node = document.querySelector(`#dockPitchPiano [data-code="${k.code}"] .pk-note`);
    if (node) {
      node.textContent = app.pitchRelative ? DEGREE_NAMES[((k.midi % 12) + 12) % 12] : k.note;
    }
  }
}

function buildPitchPianoUi() {
  const wrap = document.getElementById("pitchPiano");
  if (wrap && wrap.childElementCount === 0) {
    for (const k of PITCH_WHITE_KEYS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = k.cAnchor ? "pk-white c-anchor" : "pk-white";
      btn.dataset.code = k.code;
      btn.innerHTML = `<span class="pk-note">${k.note}</span><span class="pk-kbd">${k.kbd}</span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        triggerPitchPianoKey(k, true);
      });
      wrap.appendChild(btn);
    }
    for (const k of PITCH_BLACK_KEYS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pk-black";
      btn.style.left = `${k.leftPct}%`;
      btn.dataset.code = k.code;
      btn.innerHTML = `<span class="pk-note">${k.note}</span><span class="pk-kbd">${k.kbd}</span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerPitchPianoKey(k, true);
      });
      wrap.appendChild(btn);
    }
  }
  const dockWrap = document.getElementById("dockPitchPiano");
  if (dockWrap && dockWrap.childElementCount === 0) {
    for (const k of DOCK_WHITE_KEYS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = k.cAnchor ? "pk-white c-anchor" : "pk-white";
      btn.dataset.code = k.code;
      btn.innerHTML = `<span class="pk-note">${k.note}</span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        btn.classList.add("pressed");
        window.setTimeout(() => btn.classList.remove("pressed"), 140);
        triggerPitchPianoKey(k, true);
      });
      dockWrap.appendChild(btn);
    }
    for (const k of DOCK_BLACK_KEYS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pk-black";
      btn.style.left = `${k.leftPct}%`;
      btn.dataset.code = k.code;
      btn.innerHTML = `<span class="pk-note">${k.note}</span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add("pressed");
        window.setTimeout(() => btn.classList.remove("pressed"), 140);
        triggerPitchPianoKey(k, true);
      });
      dockWrap.appendChild(btn);
    }
  }
}

export function syncPitchUi() {
  const bar = document.getElementById("pitchBar");
  if (!bar) return;
  const barOpen = !bar.classList.contains("hidden");
  document.getElementById("btnPitchBeta").classList.toggle("active", barOpen || app.pitchMode);
  const toggleBtn = document.getElementById("btnPitchToggle");
  toggleBtn.textContent = app.pitchMode ? t("pitchOn") : t("pitchOff");
  toggleBtn.classList.toggle("active", app.pitchMode);
  const freeBtn = document.getElementById("btnPitchFreeMode");
  freeBtn.textContent = app.pitchFreeMode ? t("pitchFree") : t("pitchTimed");
  freeBtn.classList.toggle("active", app.pitchFreeMode);
  const relBtn = document.getElementById("btnPitchRelMode");
  relBtn.textContent = app.pitchRelative ? t("pitchRel") : t("pitchAbs");
  relBtn.classList.toggle("active", app.pitchRelative);
  document.getElementById("pitchClefSelect").value = app.pitchClef;
  document.getElementById("pitchKeySelect").value = app.pitchKey;
  document.getElementById("pitchProgSelect").value = app.pitchProg;
  const hintBtn = document.getElementById("btnPitchHints");
  hintBtn.textContent = app.pitchShowHints ? t("pitchHintsOn") : t("pitchHintsOff");
  hintBtn.classList.toggle("active", app.pitchShowHints);
  const pianoEl = document.getElementById("pitchPiano");
  if (pianoEl) pianoEl.classList.toggle("hidden", !app.pitchMode || app.showTouchDock);
  const dockPadsEl = document.getElementById("dockPads");
  const dockPianoEl = document.getElementById("dockPitchPiano");
  if (dockPadsEl) dockPadsEl.classList.toggle("hidden", app.pitchMode);
  if (dockPianoEl) dockPianoEl.classList.toggle("hidden", !app.pitchMode);
  syncPitchPianoLabels();
  cbs.onUiChange();
}

export function initPitchUi(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };
  buildPitchPianoUi();

  document.getElementById("btnPitchBeta").addEventListener("click", (e) => {
    e.currentTarget.blur();
    const bar = document.getElementById("pitchBar");
    const willOpen = bar.classList.contains("hidden");
    bar.classList.toggle("hidden", !willOpen);
    if (willOpen && !app.pitchMode) {
      app.pitchMode = true;
      applyPitchToCurrentPhrase(true);
      cbs.resetTargets();
      cbs.updateMeta();
    }
    syncPitchUi();
  });
  document.getElementById("btnPitchClose").addEventListener("click", () => {
    document.getElementById("pitchBar").classList.add("hidden");
    syncPitchUi();
  });
  document.getElementById("btnPitchToggle").addEventListener("click", (e) => {
    e.currentTarget.blur();
    app.pitchMode = !app.pitchMode;
    applyPitchToCurrentPhrase(true);
    cbs.resetTargets();
    const msgEl = document.getElementById("pitchMsg");
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("pitchIdleMsg");
    cbs.updateMeta();
    syncPitchUi();
  });
  document.getElementById("btnPitchFreeMode").addEventListener("click", (e) => {
    e.currentTarget.blur();
    app.pitchFreeMode = !app.pitchFreeMode;
    if (app.pitchFreeMode && !app.pitchMode) {
      app.pitchMode = true;
      applyPitchToCurrentPhrase();
    }
    cbs.stopRun();
    cbs.resetTargets();
    const msgEl = document.getElementById("pitchMsg");
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("pitchIdleMsg");
    cbs.updateMeta();
    syncPitchUi();
  });
  document.getElementById("btnPitchRelMode").addEventListener("click", (e) => {
    e.currentTarget.blur();
    app.pitchRelative = !app.pitchRelative;
    if (app.pitchRelative && !app.pitchMode) {
      app.pitchMode = true;
      applyPitchToCurrentPhrase();
      cbs.resetTargets();
    }
    app.dirtyScore = true;
    cbs.updateMeta();
    syncPitchUi();
  });
  document.getElementById("pitchClefSelect").addEventListener("change", (e) => {
    app.pitchClef = e.target.value === "treble" ? "treble" : "bass";
    e.target.blur();
    if (!app.pitchMode) app.pitchMode = true;
    applyPitchToCurrentPhrase();
    cbs.resetTargets();
    cbs.updateMeta();
    syncPitchUi();
  });
  document.getElementById("pitchKeySelect").addEventListener("change", (e) => {
    app.pitchKey = e.target.value;
    e.target.blur();
    if (!app.pitchMode) app.pitchMode = true;
    applyPitchToCurrentPhrase();
    cbs.resetTargets();
    cbs.updateMeta();
    syncPitchUi();
  });
  document.getElementById("pitchProgSelect").addEventListener("change", (e) => {
    app.pitchProg = e.target.value;
    e.target.blur();
    if (!app.pitchMode) app.pitchMode = true;
    applyPitchToCurrentPhrase();
    cbs.resetTargets();
    cbs.updateMeta();
    syncPitchUi();
  });
  document.getElementById("btnPitchHints").addEventListener("click", (e) => {
    e.currentTarget.blur();
    app.pitchShowHints = !app.pitchShowHints;
    app.dirtyScore = true;
    syncPitchUi();
  });
}
