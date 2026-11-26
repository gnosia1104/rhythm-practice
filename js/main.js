// Main Application Entry Point — Playback, Grading, Drills, Controls & Boot
import { I18N, getCurLang, setCurLang, t } from "./i18n.js";
import {
  TIME_SIG_OPTIONS, TIME_SIGS, BAR_OPTIONS, LEVEL_TITLES, PRE_DELAY_SEC,
  decodeFullSeedCode, getTodayDateStr, getDailyChallengeSpec, getDailyStreak, saveDailyBest, generatePhrase,
} from "./rhythm.js";
import {
  IS_MOBILE, app, audioIn, edState, calState, tourState,
  getTimeSig, tripletsAllowed, isGapBar, hitWindowSec, currentFullSeedCode, deriveInputMode,
} from "./state.js";
import {
  formatPlayMods, formatPlayModsCompact, computeChartMaxInfo,
  getTimingThresholds, computeDetailedScore, computeScoreRank,
} from "./scoring.js";
import { el, renderScore } from "./engraver.js";
import {
  getAudioCtx, setClickMasterGainVol, ensureAudioCtx, ensureAudioCtxReady,
  stopScheduledAudio, scheduleClick, scheduleBassNote, scheduleRunAudio,
} from "./audio-out.js";
import {
  registerAudioInCallbacks, populateAudioDevices, populateChannelSelect, startAudioInput, stopAudioInput,
  closeSustainTarget, schedulePitchCheck,
} from "./audio-in.js";
import {
  JAZZ_KEYS, FLAT_PC_NAMES, DEGREE_NAMES, getRelativeDegreeName, midiToFreq,
  assignPitchesToPhrase, clearPitchesFromPhrase,
} from "./pitch-gen.js";
import { comparePitchClass } from "./pitch-detect.js";
import {
  midiIn, registerMidiCallbacks, startMidiInput, stopMidiInput,
} from "./midi-in.js";
import {
  clearShareQueryUrl, buildShareUrl, copyToClipboard, flashBtnText,
  buildResultCardText, renderScoreCardPngBlob,
} from "./share-card.js";
import {
  makeDefaultBar, applyCustomToApp, renderEditorUi, toggleEditorBar, applyFullSeedObj, applySeedQueryParams,
  loadCustomFromInput, initEditor,
} from "./editor.js";
import {
  hasSeenTour, renderTourStep, openTour, closeTour, nextTourStep, prevTourStep, initTour,
} from "./tour.js";
import {
  trackPracticeStart, trackPracticeComplete, trackPracticeStop, trackShare,
} from "./analytics.js";

function resetTargets() {
  const ts = getTimeSig(app.phrase ? app.phrase.timeSig : app.timeSig);
  const clickSec = ts.clickSec(app.bpm);
  const tickSec = clickSec / ts.clickTicks;
  const countIn = ts.countInClicks * clickSec;
  const targets = app.phrase.targets;
  const totalSlots = app.numBars * ts.barTicks;
  for (let i = 0; i < targets.length; i++) {
    const tgt = targets[i];
    const nextTgt = targets[i + 1];
    const gapSlots = nextTgt
      ? Math.max(0, nextTgt.globalSlot - (tgt.globalSlot + tgt.durSlots))
      : Math.max(0, totalSlots - (tgt.globalSlot + tgt.durSlots));
    tgt.timeSec = countIn + tgt.globalSlot * tickSec;
    tgt.durSec = tgt.durSlots * tickSec;
    tgt.endSec = tgt.timeSec + tgt.durSec;
    tgt.hasRestAfter = gapSlots >= 1;
    tgt.restEndSec = tgt.endSec + gapSlots * tickSec;
    tgt.hit = false;
    tgt.missed = false;
    tgt.errMs = null;
    tgt.hitSource = null;
    tgt.hitTimeSec = null;
    tgt.sustainFloor = 0;
    tgt.quietFrames = 0;
    tgt.lastAudibleSec = null;
    tgt.sustainEndSec = null;
    tgt.sustainRatio = null;
    tgt.sustainStatus = null;
    tgt.bleedMs = 0;
    tgt.sustainDone = false;
    tgt.peakLevel = 0;
    tgt.ghostHeldMs = null;
    tgt.ghostWrongKey = false;
    tgt.pitchOk = null;
    tgt.detectedPitch = null;
    tgt.pitchCents = null;
    tgt.hadWrongTry = false;
  }
  audioIn.pendingPitchChecks = [];
  app.pitchFreeIdx = findNextPitchFreeIdx(0);
  app.pitchFreeMistakes = 0;
  for (const rst of (app.phrase.rests || [])) {
    rst.timeSec = countIn + rst.globalSlot * tickSec;
    rst.endSec = rst.timeSec + rst.durSlots * tickSec;
    rst.error = false;
    rst.passed = false;
    rst.errorKind = null;
    rst.ringFrames = 0;
  }
  app.activeSustainTgt = null;
  app.activeKeyStac = null;
  app.extraHits = 0;
  app.keyExtraHits = 0;
  app.audioExtraHits = 0;
  app.dirtyScore = true;
}


function cancelRushTimer(resetRound = false) {
  if (app.rushTimerId) {
    window.clearTimeout(app.rushTimerId);
    app.rushTimerId = null;
  }
  if (resetRound) app.rushRound = 0;
}

function loadRushBest() {
  try {
    const raw = localStorage.getItem("rhythm_practice_rush_best");
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.peakBpm)) return { peakBpm: p.peakBpm, rounds: p.rounds || 0 };
    }
  } catch (_) {}
  return null;
}

function saveRushBest(bpm, rounds) {
  const prev = loadRushBest();
  const next = {
    peakBpm: prev ? Math.max(prev.peakBpm, bpm) : bpm,
    rounds: prev ? Math.max(prev.rounds, rounds) : rounds,
  };
  try { localStorage.setItem("rhythm_practice_rush_best", JSON.stringify(next)); } catch (_) {}
  syncDrillUi();
  return next;
}

function clearFadeOutClasses() {
  document.querySelectorAll("#scoreSvg .beat-fade.faded").forEach(n => n.classList.remove("faded"));
}

function applyPitchToCurrentPhrase() {
  if (!app.phrase) return;
  if (app.pitchMode) {
    assignPitchesToPhrase(app.phrase, app.pitchKey, app.pitchProg, app.pitchClef);
  } else {
    clearPitchesFromPhrase(app.phrase);
  }
  app.dirtyScore = true;
}

function newPhrase(forcedSeed = null, keepDaily = false) {
  cancelRushTimer(true);
  app.runSeq += 1;
  if (app.state === "CAL") stopCalibration(false);
  stopScheduledAudio();
  app.takeId += 1;
  if (!keepDaily) {
    app.dailyDate = null;
    app.dailyPlus = false;
    app.customMode = false;
    clearShareQueryUrl();
  }
  app.phrase = generatePhrase(app.numBars, app.level, app.tripletMode, app.timeSig, forcedSeed, app.staccatoOn, app.ghostOn);
  applyPitchToCurrentPhrase();
  resetTargets();
  app.state = "READY";
  setHitBadge(t("badgeWait"), "");
  updateMeta();
}

function loadDailyChallenge(dateStr = null, isPlus = false) {
  cancelRushTimer(true);
  if (app.rushOn) { app.rushOn = false; syncDrillUi(); }
  const spec = getDailyChallengeSpec(dateStr, isPlus);
  app.dailyDate = spec.dateStr;
  app.dailyPlus = spec.isPlus;
  app.customMode = false;
  app.timeSig = spec.timeSig;
  app.level = spec.level;
  app.numBars = spec.numBars;
  app.bpm = spec.bpm;
  app.tripletMode = spec.tripletMode;
  app.staccatoOn = spec.staccatoOn;
  app.ghostOn = spec.ghostOn;
  toggleEditorBar(false);
  newPhrase(spec.seed, true);
  const streak = getDailyStreak(spec.isPlus);
  setHitBadge(t("dailyLoaded", spec.dateStr, streak, spec.isPlus), "tight");
}


async function startRun(demo = false, keepRushRound = false) {
  cancelRushTimer(!keepRushRound);
  const seq = ++app.runSeq;
  ensureAudioCtx(); // Synchronously unlock/resume inside user tap gesture on mobile
  if (app.state === "CAL") stopCalibration(false);
  stopScheduledAudio();
  // Immediately leave PLAY/COUNTIN before awaiting AudioContext so frame() cannot stamp stale misses
  app.state = "READY";
  resetTargets();
  clearFadeOutClasses();
  setHitBadge(t("statusGetReady"), "");
  syncTransportButtons();
  const ctx = await ensureAudioCtxReady();
  if (seq !== app.runSeq) return;
  resetTargets();
  app.startAudioT = ctx.currentTime + PRE_DELAY_SEC;
  app.state = demo ? "DEMO" : "COUNTIN";
  setHitBadge(demo ? t("badgeDemo") : t("badgeCountIn"), "");
  syncTransportButtons();
  trackPracticeStart(app, demo);
  scheduleRunAudio(
    app.bpm,
    app.numBars,
    app.startAudioT,
    demo ? true : app.soundOn,
    demo ? app.phrase.targets : null,
    app.timeSig,
    demo ? "OFF" : app.gapClick
  );
}

function stopRun() {
  const hadRushTimer = Boolean(app.rushTimerId);
  cancelRushTimer(true);
  app.runSeq += 1;
  clearFadeOutClasses();
  if (app.state === "CAL") {
    stopCalibration(true);
    return;
  }
  if (app.state !== "COUNTIN" && app.state !== "PLAY" && app.state !== "DEMO" && !hadRushTimer) return;
  if (app.state === "PLAY") {
    const ctx = getAudioCtx();
    const tsStop = getTimeSig();
    const playStartT = app.startAudioT + tsStop.countInClicks * tsStop.clickSec(app.bpm);
    const elapsed = ctx ? Math.max(0, ctx.currentTime - playStartT) : 0;
    trackPracticeStop(app, elapsed);
  }
  stopScheduledAudio();
  resetTargets();
  app.state = "READY";
  setHitBadge(t("badgeStopped"), "");
  syncTransportButtons();
}

// Optional 16-beat tap/pluck latency calibration (4 warm-up + 12 measured)

function resetCalDots() {
  const dots = document.querySelectorAll("#calDots .cal-dot");
  dots.forEach((d, i) => {
    d.className = i < calState.warmupClicks ? "cal-dot warmup" : "cal-dot";
  });
}

async function startCalibration() {
  const seq = ++app.runSeq;
  ensureAudioCtx(); // Synchronously unlock/resume inside user tap gesture on mobile
  stopScheduledAudio();
  app.state = "READY";
  resetTargets();
  const ctx = await ensureAudioCtxReady();
  if (seq !== app.runSeq) return;
  calState.startAudioT = ctx.currentTime + 0.45;
  calState.taps = [];
  calState.captured = {};
  resetCalDots();
  app.state = "CAL";
  setHitBadge(t("calBadgeRunning"), "");
  document.getElementById("btnCalRun").textContent = t("calStopBtn");
  document.getElementById("btnCalRun").classList.remove("primary");
  document.getElementById("btnCalRun").classList.add("danger");
  const msgEl = document.getElementById("calMsg");
  msgEl.style.color = "var(--accent)";
  msgEl.textContent = t("calRunningMsg");
  syncTransportButtons();
  for (let c = 0; c < calState.totalClicks; c++) {
    const isAcc = c % 4 === 0;
    scheduleClick(ctx, calState.startAudioT + c * calState.beatSec, isAcc ? 1318.51 : 880.0, isAcc ? 0.32 : 0.22);
  }
}

function stopCalibration(resetBadge = true) {
  if (app.state !== "CAL") return;
  stopScheduledAudio();
  app.state = "READY";
  const btn = document.getElementById("btnCalRun");
  btn.textContent = t("calStartBtn");
  btn.classList.remove("danger");
  btn.classList.add("primary");
  resetCalDots();
  if (resetBadge) {
    setHitBadge(t("badgeStopped"), "");
    const msgEl = document.getElementById("calMsg");
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("calIdleMsg");
  }
  syncTransportButtons();
}

function recordCalibrationTap(rawAudioT, source) {
  if (app.state !== "CAL") return;
  const elapsed = rawAudioT - calState.startAudioT;
  const idx = Math.round(elapsed / calState.beatSec);
  if (idx < 0 || idx >= calState.totalClicks) return;
  const deltaMs = (elapsed - idx * calState.beatSec) * 1000;
  if (Math.abs(deltaMs) > 320) return;

  const dots = document.querySelectorAll("#calDots .cal-dot");
  if (idx < calState.warmupClicks) {
    if (dots[idx]) dots[idx].classList.add("hit");
    return;
  }
  if (calState.captured[idx]) return;
  calState.captured[idx] = true;
  calState.taps.push({ idx, deltaMs, source });
  if (dots[idx]) dots[idx].classList.add("hit");
  const sign = deltaMs >= 0 ? "+" : "";
  setHitBadge(`[${source === "AUDIO" ? "AUD" : "KEY"}] ${sign}${Math.round(deltaMs)}ms`, "tight");

  if (idx === calState.totalClicks - 1) {
    finishCalibration();
  }
}

function finishCalibration() {
  stopScheduledAudio();
  app.state = "READY";
  const btn = document.getElementById("btnCalRun");
  btn.textContent = t("calStartBtn");
  btn.classList.remove("danger");
  btn.classList.add("primary");
  const msgEl = document.getElementById("calMsg");

  const n = calState.taps.length;
  if (n < calState.minTaps) {
    msgEl.style.color = "var(--red)";
    msgEl.textContent = t("calTooFew", n);
    setHitBadge(t("badgeWait"), "");
    syncTransportButtons();
    return;
  }

  const sorted = calState.taps.map(x => x.deltaMs).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mad = sorted.reduce((acc, v) => acc + Math.abs(v - med), 0) / sorted.length;
  const audCount = calState.taps.filter(x => x.source === "AUDIO").length;
  const useAudio = audCount * 2 >= n;
  const rounded = Math.round(med);

  if (useAudio) {
    const applied = Math.max(0, Math.min(300, rounded));
    syncLatency(applied, true);
    msgEl.style.color = "var(--green)";
    msgEl.textContent = t("calApplied", "AUD", applied, n, Math.round(mad));
    setHitBadge(`AUD +${applied}ms`, "tight");
  } else {
    const applied = Math.max(-50, Math.min(300, rounded));
    syncKeyLatency(applied, true);
    msgEl.style.color = "var(--green)";
    msgEl.textContent = t("calApplied", "KEY", applied, n, Math.round(mad));
    setHitBadge(`KEY ${applied >= 0 ? "+" : ""}${applied}ms`, "tight");
  }
  syncTransportButtons();
}

function syncTransportButtons() {
  const running = app.state === "COUNTIN" || app.state === "PLAY" || app.state === "DEMO" || app.state === "CAL";
  const btnStop = document.getElementById("btnStop");
  const btnDockStop = document.getElementById("btnDockStop");
  const btnDemo = document.getElementById("btnDemo");
  btnStop.disabled = !running;
  btnStop.classList.toggle("danger", running);
  if (btnDockStop) {
    btnDockStop.disabled = !running;
    btnDockStop.classList.toggle("danger", running);
  }
  btnDemo.classList.toggle("active", app.state === "DEMO");
}

function setHitBadge(text, cls) {
  const b = document.getElementById("hitBadge");
  b.textContent = text;
  b.className = "hit-badge" + (cls ? " " + cls : "");
}

function closeKeyStaccato(releaseElapsed) {
  if (!app.activeKeyStac) return;
  const { tgt } = app.activeKeyStac;
  app.activeKeyStac = null;
  if (!tgt || tgt.sustainDone) return;
  const heldSec = Math.max(0, releaseElapsed - tgt.hitTimeSec);
  const ratio = tgt.durSec > 0 ? heldSec / tgt.durSec : 0;
  tgt.sustainRatio = ratio;
  if (ratio > 0.58 && heldSec > 0.14) {
    tgt.sustainStatus = "LONG";
  } else if (tgt.durSec >= 0.50 && ratio < 0.22) {
    tgt.sustainStatus = "SHORT";
  } else {
    tgt.sustainStatus = "OK";
  }
  tgt.sustainDone = true;
  app.dirtyScore = true;
}

function handleHit(hitAudioT, source, hitKind = "NORMAL", keyCode = null, playedMidi = null) {
  if (app.state !== "COUNTIN" && app.state !== "PLAY") return;
  const ts = getTimeSig();
  const countIn = ts.countInClicks * ts.clickSec(app.bpm);
  const elapsed = hitAudioT - app.startAudioT;
  const win = hitWindowSec();
  if (elapsed < countIn - win) return;

  let best = null;
  let bestAbs = 999;
  for (const tgt of app.phrase.targets) {
    if (tgt.hit || tgt.missed) continue;
    const diff = Math.abs(elapsed - tgt.timeSec);
    if (diff <= win && diff < bestAbs) {
      bestAbs = diff;
      best = tgt;
    }
  }

  const src = source === "AUDIO" ? "AUD" : (source === "MIDI" ? "MIDI" : (source === "PAD" ? "PAD" : "KEY"));
  if (best) {
    // Close any previously sustaining audio or keyboard staccato note at this new attack
    if (app.activeSustainTgt && !app.activeSustainTgt.sustainDone) {
      closeSustainTarget(app.activeSustainTgt, elapsed, false);
    }
    if (app.activeKeyStac) {
      closeKeyStaccato(elapsed);
    }
    best.hit = true;
    best.hitSource = source;
    best.hitTimeSec = elapsed;
    best.errMs = (elapsed - best.timeSec) * 1000;

    let artBadgeOverride = null;
    if (source === "AUDIO") {
      if (app.pitchMode) schedulePitchCheck(best, hitAudioT);
      if (best.art === "staccato" || best.art === "ghost" || best.durSec >= 0.30 || (best.hasRestAfter && (best.restEndSec - best.endSec) >= 0.18)) {
        best.sustainFloor = Math.max(audioIn.threshold * 0.28, 0.005);
        best.peakLevel = audioIn.level;
        best.quietFrames = 0;
        best.lastAudibleSec = elapsed;
        app.activeSustainTgt = best;
      }
    } else {
      // KEY / Touch Pad articulation grading
      if (best.art === "ghost") {
        if (hitKind === "GHOST") {
          best.sustainStatus = "OK";
          best.sustainRatio = 0.25;
          best.sustainDone = true;
        } else {
          best.sustainStatus = "LONG";
          best.sustainRatio = 1.0;
          best.sustainDone = true;
          artBadgeOverride = { text: `[KEY] GHOST ERR (F/D)`, cls: "err" };
        }
      } else if (hitKind === "GHOST") {
        best.ghostWrongKey = true;
        best.sustainStatus = "LONG";
        best.sustainRatio = 1.0;
        best.sustainDone = true;
        artBadgeOverride = { text: `[KEY] NOT GHOST !`, cls: "err" };
      } else if (best.art === "staccato") {
        if (keyCode) {
          app.activeKeyStac = { tgt: best, code: keyCode };
        } else {
          // Touch pad tap is inherently short staccato
          best.sustainStatus = "OK";
          best.sustainRatio = 0.32;
          best.sustainDone = true;
        }
      }
      // Pitch BETA: QWERTY piano / MIDI keyboard input grades pitch class immediately (octave-agnostic!)
      if (app.pitchMode && best.pitch && Number.isFinite(playedMidi) && best.art !== "ghost") {
        const useRel = Boolean(app.pitchRelative && source !== "AUDIO");
        const cmp = comparePitchClass(playedMidi, best.pitch.midi, 45);
        const tgtLbl = useRel ? getRelativeDegreeName(best.pitch.midi, getActivePitchKeyId()) : best.pitch.name;
        const detLbl = useRel ? getRelativeDegreeName(Math.round(playedMidi), getActivePitchKeyId()) : cmp.detectedName;
        best.pitchOk = cmp.ok;
        best.detectedPitch = detLbl;
        best.pitchCents = 0;
        if (!cmp.ok && !artBadgeOverride) {
          const signP = best.errMs >= 0 ? "+" : "";
          artBadgeOverride = {
            text: `[${src}] ${tgtLbl} ≠ ${detLbl} · ${signP}${best.errMs.toFixed(1)}ms`,
            cls: "err",
          };
        }
      }
    }

    if (!app.blindGrade) {
      if (artBadgeOverride) {
        setHitBadge(artBadgeOverride.text, artBadgeOverride.cls);
      } else {
        const tw = getTimingThresholds(app.bpm);
        const ae = Math.abs(best.errMs);
        const sign = best.errMs >= 0 ? "+" : "";
        const tag = ae <= tw.tight ? "TIGHT" : (best.errMs > 0 ? "LATE" : "EARLY");
        const cls = ae <= tw.tight ? "tight" : (ae <= tw.ok ? "warn" : "err");
        const gPrefix = (best.art === "ghost" && hitKind === "GHOST") ? "× " : "";
        const useRelBadge = Boolean(app.pitchRelative && source !== "AUDIO");
        const okLbl = best.pitch ? (useRelBadge ? getRelativeDegreeName(best.pitch.midi, getActivePitchKeyId()) : best.pitch.name) : "";
        const pPrefix = (app.pitchMode && best.pitch && best.pitchOk === true) ? `${okLbl} · ` : "";
        setHitBadge(`[${src}] ${gPrefix}${pPrefix}${sign}${best.errMs.toFixed(1)}ms ${tag}`, cls);
      }
      app.dirtyScore = true;
    }
  } else {
    app.extraHits += 1;
    if (source === "AUDIO") app.audioExtraHits += 1;
    else app.keyExtraHits += 1;
    // Forward-only rest check: only flag hits inside [rst.timeSec, rst.endSec]
    let hitRest = null;
    for (const rst of (app.phrase.rests || [])) {
      if (elapsed >= rst.timeSec && elapsed <= rst.endSec) {
        hitRest = rst;
        break;
      }
    }
    if (hitRest) {
      hitRest.error = true;
      hitRest.passed = false;
      hitRest.errorKind = "HIT";
      if (!app.blindGrade) app.dirtyScore = true;
    }
    if (!app.blindGrade) {
      setHitBadge(hitRest ? `[${src}] REST ERR !` : `[${src}] EXTRA !`, "err");
    }
  }
}

function finalizeRun() {
  if (app.activeSustainTgt && !app.activeSustainTgt.sustainDone && getAudioCtx()) {
    const endElapsed = (getAudioCtx().currentTime - audioIn.latencyMs / 1000) - app.startAudioT;
    closeSustainTarget(app.activeSustainTgt, endElapsed, audioIn.level >= app.activeSustainTgt.sustainFloor);
  }
  if (app.activeKeyStac && getAudioCtx()) {
    closeKeyStaccato((getAudioCtx().currentTime - app.keyLatencyMs / 1000) - app.startAudioT);
  }
  for (const rst of (app.phrase.rests || [])) {
    if (!rst.error) rst.passed = true;
  }
  stopScheduledAudio();
  app.state = "DONE";
  const errs = app.phrase.targets.filter(t => t.hit && t.errMs !== null).map(t => t.errMs);
  const total = app.phrase.targets.length;
  const hits = errs.length;
  const acc = total ? (hits / total) * 100 : 0;
  let mean = 0, sd = 0, tight = 0;
  const twFin = getTimingThresholds(app.bpm);
  if (hits > 0) {
    mean = errs.reduce((a, b) => a + b, 0) / hits;
    sd = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / hits);
    tight = errs.filter(e => Math.abs(e) <= twFin.tight).length;
  }

  const susTargets = app.phrase.targets.filter(t => t.hit && t.sustainStatus);
  const susTotal = susTargets.length;
  const susOk = susTargets.filter(t => t.sustainStatus === "OK").length;
  const susShort = susTargets.filter(t => t.sustainStatus === "SHORT").length;
  const susLong = susTargets.filter(t => t.sustainStatus === "LONG").length;
  const restErrs = (app.phrase.rests || []).filter(r => r.error).length;
  const sustainStats = { total: susTotal, ok: susOk, short: susShort, long: susLong, restErrs };

  const scoreDetail = computeDetailedScore(app.phrase, hits, total, sd, app.extraHits, restErrs, app.keyExtraHits, app.audioExtraHits);
  const rankNow = computeScoreRank({
    hits, total, tight, extra: app.extraHits,
    keyExtra: app.keyExtraHits, audioExtra: app.audioExtraHits, inputMode: app.inputMode,
    sustainStats, score: scoreDetail.score, maxScore: scoreDetail.maxScore
  });
  app.history.unshift({
    take: app.takeId,
    tsIso: new Date().toISOString(),
    seed: app.phrase.seed.toString(16).toUpperCase().padStart(4, "0"),
    fullSeed: app.customMode ? (app.phrase.customCode || "Custom") : currentFullSeedCode(),
    bpm: app.bpm,
    bars: app.numBars,
    lv: app.level,
    tripletMode: tripletsAllowed() ? app.tripletMode : 0,
    staccato: app.staccatoOn,
    ghost: app.ghostOn,
    daily: Boolean(app.dailyDate),
    dailyPlus: Boolean(app.dailyDate && app.dailyPlus),
    dailyDate: app.dailyDate || null,
    custom: app.customMode,
    ts: app.timeSig,
    mode: app.inputMode,
    soundOn: app.soundOn,
    showBeatNums: app.showBeatNums,
    showCursor: app.showCursor,
    blindGrade: app.blindGrade,
    gapClick: app.gapClick,
    fadeBeats: app.fadeBeats,
    rushOn: app.rushOn,
    rank: rankNow.grade,
    rankCls: rankNow.cls,
    score: scoreDetail.score,
    maxScore: scoreDetail.maxScore,
    ptsPerBar: Math.round(scoreDetail.score / Math.max(1, app.numBars)),
    hits, total, acc, tight, mean, sd, extra: app.extraHits, restErrs,
    susTotal, susOk,
  });
  if (app.history.length > 12) app.history.pop();
  try { localStorage.setItem("rhythm_practice_history_v1", JSON.stringify(app.history)); } catch (_) {}

  if (app.dailyDate) {
    saveDailyBest(app.dailyDate, acc, tight, app.dailyPlus);
  }

  const effTriSnap = tripletsAllowed() ? app.tripletMode : 0;
  const tTagSnap = effTriSnap === 2 ? "T2" : (effTriSnap === 1 ? "T1" : "");
  const lvFlagsSnap = `${tTagSnap}${app.staccatoOn ? "S" : ""}${app.ghostOn ? "G" : ""}`;
  app.lastResult = {
    errs, hits, total, mean, sd, tight,
    extra: app.extraHits,
    keyExtra: app.keyExtraHits,
    audioExtra: app.audioExtraHits,
    inputMode: app.inputMode,
    sustainStats,
    score: scoreDetail.score,
    maxScore: scoreDetail.maxScore,
    noteGrades: app.phrase.targets.map(tgt => {
      if (!tgt.hit || tgt.errMs === null) return "miss";
      const ae = Math.abs(tgt.errMs);
      return ae <= twFin.tight ? "tight" : (ae <= twFin.ok ? "ok" : "miss");
    }),
    snap: {
      timeSig: app.timeSig,
      numBars: app.numBars,
      bpm: app.bpm,
      level: app.level,
      lvFlags: lvFlagsSnap,
      mods: formatPlayMods(app.soundOn, app.showBeatNums, app.showCursor, app.blindGrade, app.inputMode),
      dailyDate: app.dailyDate,
      dailyPlus: app.dailyPlus,
      customMode: app.customMode,
      seedCode: currentFullSeedCode(),
      shareUrl: buildShareUrl(),
      streak: app.dailyDate ? getDailyStreak(app.dailyPlus) : 0,
    },
  };
  drawDistribution(errs, hits, total, mean, sd, tight, sustainStats, app.extraHits);
  const rank = computeScoreRank(app.lastResult);
  const tsTrack = getTimeSig();
  const durSec = app.numBars * tsTrack.clicksPerBar * tsTrack.clickSec(app.bpm);
  trackPracticeComplete(app, { rank: rank.grade, acc, durationSec: durSec });
  const rankEl = document.getElementById("rankBadge");
  rankEl.textContent = rank.grade;
  rankEl.className = `rank-pill ${rank.cls}`;
  const scoreEl = document.getElementById("scoreBadge");
  if (scoreDetail.sustainMax > 0) {
    scoreEl.textContent = `${scoreDetail.noteScore.toLocaleString()} + Sus ${scoreDetail.sustainEarned.toLocaleString()} = ${scoreDetail.score.toLocaleString()} / ${scoreDetail.maxScore.toLocaleString()}`;
  } else {
    scoreEl.textContent = `${scoreDetail.score.toLocaleString()} / ${scoreDetail.maxScore.toLocaleString()}`;
  }
  const susTip = scoreDetail.sustainMax > 0 ? ` · Note ${scoreDetail.noteScore}/${scoreDetail.noteMax} + Sus ${scoreDetail.sustainEarned}/${scoreDetail.sustainMax}` : "";
  const sdTip = scoreDetail.sdBonus > 0 ? ` · SD +${scoreDetail.sdBonus}` : "";
  const penTip = scoreDetail.penalty > 0 ? ` · Pen -${scoreDetail.penalty}` : "";
  const modTipStr = scoreDetail.info.modTags.length ? ` · ${scoreDetail.info.modTags.join(", ")}` : "";
  scoreEl.title = `Score ${scoreDetail.pct.toFixed(1)}% (Meter ×${scoreDetail.info.meterMult.toFixed(2)} · BPM ×${scoreDetail.info.bpmMult.toFixed(2)}${modTipStr}${susTip}${sdTip}${penTip})`;
  scoreEl.classList.remove("hidden");
  document.getElementById("btnShareResult").classList.remove("hidden");
  document.getElementById("btnBragCard").classList.remove("hidden");
  renderLog();
  clearFadeOutClasses();

  // Pitch BETA post-run summary (Audio pitch-class accuracy)
  if (app.pitchMode) {
    const pitchedTgts = app.phrase.targets.filter(tg => tg.hit && tg.pitchOk !== null);
    const pitchMsgEl = document.getElementById("pitchMsg");
    if (pitchedTgts.length) {
      const pOk = pitchedTgts.filter(tg => tg.pitchOk === true).length;
      const pPct = (pOk / pitchedTgts.length) * 100;
      pitchMsgEl.style.color = pPct >= 85 ? "var(--green)" : (pPct >= 65 ? "var(--amber)" : "var(--red)");
      pitchMsgEl.textContent = t("pitchResult", pOk, pitchedTgts.length, pPct);
    }
  }

  // Special Training BETA post-run feedback (Gap Click sub-score & BPM Rush sudden death)
  const drillMsgEl = document.getElementById("drillMsg");
  const tsDone = getTimeSig();
  if (app.gapClick !== "OFF") {
    const gapTgts = app.phrase.targets.filter(tg => isGapBar(Math.floor(tg.globalSlot / tsDone.barTicks), app.gapClick));
    if (gapTgts.length) {
      const gapHits = gapTgts.filter(tg => tg.hit && tg.errMs !== null);
      const gAcc = (gapHits.length / gapTgts.length) * 100;
      const gMean = gapHits.length ? gapHits.reduce((s, tg) => s + tg.errMs, 0) / gapHits.length : 0;
      drillMsgEl.style.color = gAcc >= 85 ? "var(--green)" : "var(--amber)";
      drillMsgEl.textContent = t("drillGapResult", gAcc, gapHits.length, gapTgts.length, gMean);
    }
  }

  if (app.rushOn && !app.dailyDate && !app.customMode) {
    if (acc >= app.rushMinAcc) {
      app.rushRound += 1;
      saveRushBest(app.bpm, app.rushRound);
      const nextBpm = Math.min(180, app.bpm + 5);
      drillMsgEl.style.color = "var(--green)";
      drillMsgEl.textContent = t("drillRushClear", app.rushRound, acc, nextBpm);
      setHitBadge(t("drillRushBadge", app.rushRound, nextBpm), "tight");
      const rushSeq = app.runSeq;
      app.rushTimerId = window.setTimeout(() => {
        app.rushTimerId = null;
        if (!app.rushOn || rushSeq !== app.runSeq) return;
        app.bpm = nextBpm;
        app.takeId += 1;
        app.phrase = generatePhrase(app.numBars, app.level, app.tripletMode, app.timeSig, null, app.staccatoOn, app.ghostOn);
        resetTargets();
        updateMeta();
        startRun(false, true);
      }, 1500);
    } else {
      const peakBpm = app.rushRound > 0 ? Math.max(40, app.bpm - 5) : app.bpm;
      drillMsgEl.style.color = "var(--red)";
      drillMsgEl.textContent = t("drillRushFail", app.rushRound, peakBpm, acc, app.rushMinAcc);
      setHitBadge(`💥 RUSH ${app.rushRound}R · ${peakBpm}BPM`, "err");
      app.rushRound = 0;
    }
  } else if (app.blindGrade) {
    const cls = acc >= 90 ? "tight" : (acc >= 70 ? "warn" : "err");
    setHitBadge(t("badgeDone", hits, total), cls);
  }
  syncTransportButtons();
  app.dirtyScore = true;
}

function drawDistribution(errs, hits, total, mean, sd, tight, sustainStats = null, extraHits = app.extraHits, distBpm = app.bpm) {
  const svg = document.getElementById("distSvg");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = 380, cy = 30, pad = 28;
  const mapX = (ms) => pad + ((Math.max(-150, Math.min(150, ms)) + 150) / 300) * (W - pad * 2);
  const tw = getTimingThresholds(distBpm);

  // Tight zone (-tw.tight..+tw.tight)
  svg.appendChild(el("rect", {
    x: mapX(-tw.tight), y: 12, width: mapX(tw.tight) - mapX(-tw.tight), height: 36,
    fill: "#dcfce7", rx: 4
  }));
  // Axis line & ticks
  svg.appendChild(el("line", { x1: pad, y1: cy, x2: W - pad, y2: cy, stroke: "#cbd5e1", "stroke-width": 1.5 }));
  for (const ms of [-150, -80, 0, 80, 150]) {
    const x = mapX(ms);
    svg.appendChild(el("line", {
      x1: x, y1: ms === 0 ? 8 : 22, x2: x, y2: ms === 0 ? 52 : 38,
      stroke: ms === 0 ? "#16a34a" : "#94a3b8", "stroke-width": ms === 0 ? 2 : 1
    }));
    svg.appendChild(el("text", {
      x, y: 61, "text-anchor": "middle", "font-size": 10, fill: "#64748b",
      "font-family": "ui-monospace, monospace"
    }, ms === 0 ? "0" : (ms > 0 ? `+${ms}` : `${ms}`)));
  }
  for (const e of errs) {
    const ae = Math.abs(e);
    const fill = ae <= tw.tight ? "#16a34a" : (ae <= tw.ok ? "#d97706" : "#dc2626");
    svg.appendChild(el("circle", { cx: mapX(e), cy, r: 5, fill, opacity: 0.85 }));
  }

  const summary = document.getElementById("summaryLine");
  if (total === 0) {
    summary.textContent = t("summaryIdle");
  } else if (hits > 0) {
    const sign = mean >= 0 ? "+" : "";
    const restErrs = sustainStats ? (sustainStats.restErrs || 0) : 0;
    summary.textContent = t(
      "summaryHits",
      hits, total, ((hits / total) * 100).toFixed(1), tight,
      sign, mean.toFixed(1), sd.toFixed(1), extraHits,
      sustainStats, restErrs
    );
  } else {
    const restErrs = sustainStats ? (sustainStats.restErrs || 0) : 0;
    summary.textContent = t("summaryZero", total, extraHits, restErrs);
  }
}

function renderLog() {
  const box = document.getElementById("logContainer");
  if (!app.history.length) {
    box.className = "log-empty";
    box.textContent = t("logEmpty");
    return;
  }
  box.className = "";
  const rows = app.history.map((h, idx) => {
    const mStr = h.hits ? `${h.mean >= 0 ? "+" : ""}${h.mean.toFixed(1)}ms` : "—";
    const sStr = h.hits ? `${h.sd.toFixed(1)}ms` : "—";
    const susStr = h.susTotal ? `${Math.round((h.susOk / h.susTotal) * 100)}%` : "—";
    const tTag = h.tripletMode === 2 ? "T2" : (h.tripletMode === 1 ? "T1" : (h.triplets ? "T" : ""));
    const lvFlags = `${tTag}${h.staccato ? "S" : ""}${h.ghost ? "G" : ""}`;
    const barsTag = h.bars ? `${h.bars}B` : "";
    const modePrefix = h.custom ? "✏️" : (h.dailyPlus ? "🔥" : (h.daily ? "🏆" : ""));
    const lvCore = h.custom ? "Custom" : `Lv${h.lv}${lvFlags}`;
    const lvLabel = `${modePrefix}${modePrefix ? " " : ""}${lvCore} · ${h.ts || "4/4"}${barsTag ? ` · ${barsTag}` : ""}`;
    const canReplay = Boolean(h.daily || h.dailyPlus || (h.fullSeed && (h.fullSeed.startsWith("C1_") || decodeFullSeedCode(h.fullSeed))));
    const replayHint = canReplay ? " · Click to replay" : "";
    const lvTip = `${h.fullSeed ? `#${h.fullSeed} · ` : ""}${lvCore} (${h.ts || "4/4"}${barsTag ? ` ${barsTag}` : ""})${replayHint}`;
    const modStr = formatPlayModsCompact(h);
    const metroTxt = (h.gapClick && h.gapClick !== "OFF") ? `Gap ${h.gapClick}` : (h.soundOn === false ? "OFF" : "ON");
    const modTip = `Input:${h.mode || "KEY"} | Metro:${metroTxt} | Beats:${h.showBeatNums ? "ON" : "OFF"} | Cursor:${h.showCursor ? "ON" : "OFF"} | Grade:${h.blindGrade ? "End" : "Live"} | Fade:${h.fadeBeats ? `${h.fadeBeats}b` : "OFF"} | Rush:${h.rushOn ? "ON" : "OFF"}`;
    const rk = h.rank
      ? { grade: h.rank, cls: h.rankCls || "rank-b" }
      : computeScoreRank({ hits: h.hits, total: h.total, tight: h.tight, extra: h.extra || 0, sustainStats: { total: h.susTotal || 0, ok: h.susOk || 0, restErrs: h.restErrs || 0 } });
    const extStr = (h.restErrs && h.restErrs > 0) ? `${h.extra}/${h.restErrs}r` : `${h.extra}`;
    const scoreCell = Number.isFinite(h.score)
      ? `<td class="log-score" title="${h.score.toLocaleString()} / ${(h.maxScore || 0).toLocaleString()} pts">${h.score.toLocaleString()}</td>`
      : `<td class="log-score">—</td>`;
    return `<tr>
      <td>#${h.take}</td>
      <td><span class="log-rank ${rk.cls}">${rk.grade}</span></td>
      ${scoreCell}
      <td class="log-lv${canReplay ? " replayable" : ""}"${canReplay ? ` data-replay-idx="${idx}"` : ""} title="${lvTip}">${lvLabel}</td>
      <td>${h.bpm}</td>
      <td title="${modTip}">${modStr}</td>
      <td><strong>${h.hits}/${h.total}</strong> (${h.acc.toFixed(0)}%)</td>
      <td>${h.tight}</td>
      <td>${susStr}</td>
      <td>${mStr}</td>
      <td>${sStr}</td>
      <td>${extStr}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `<table class="log-table">
    <thead><tr><th>#</th><th>Rank</th><th>Score</th><th>Lv</th><th>BPM</th><th>Opt</th><th>Hit</th><th>Tight</th><th>Sus</th><th>Mean</th><th>SD</th><th>Ext</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

document.getElementById("logContainer").addEventListener("click", (e) => {
  const cell = e.target.closest("[data-replay-idx]");
  if (!cell) return;
  const h = app.history[Number(cell.dataset.replayIdx)];
  if (!h) return;
  if (h.daily || h.dailyPlus) {
    loadDailyChallenge(h.dailyDate || null, Boolean(h.dailyPlus));
  } else if (h.fullSeed && h.fullSeed.startsWith("C1_")) {
    if (Number.isFinite(Number(h.bpm))) app.bpm = Math.max(40, Math.min(180, Math.round(Number(h.bpm))));
    loadCustomFromInput(h.fullSeed);
  } else if (h.fullSeed) {
    const cfg = decodeFullSeedCode(h.fullSeed);
    if (cfg) applyFullSeedObj(cfg);
  }
  document.querySelector(".sheet-paper").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function updateMeta() {
  app.inputMode = deriveInputMode();
  const ts = getTimeSig();
  document.getElementById("bpmVal").textContent = String(app.bpm);
  document.getElementById("bpmSlider").value = String(app.bpm);
  document.getElementById("metaTempo").textContent = ts.compound ? `♩. = ${app.bpm}` : `♩ = ${app.bpm}`;
  const allowTri = tripletsAllowed(app.level, ts);
  const effTri = allowTri ? app.tripletMode : 0;
  const tTag = effTri === 2 ? "T2" : (effTri === 1 ? "T1" : "");
  const lvFlags = `${tTag}${app.staccatoOn ? "S" : ""}${app.ghostOn ? "G" : ""}`;
  const playMods = formatPlayMods(app.soundOn, app.showBeatNums, app.showCursor, app.blindGrade, app.inputMode);
  const baseTitle = LEVEL_TITLES[app.level].replace(/^Lv\d+/, `Lv${app.level}${lvFlags}`);
  const clefIcon = app.pitchClef === "treble" ? "𝄞" : "𝄢";
  const resolvedPitchKey = getActivePitchKeyId();
  const rndPrefix = app.pitchKey === "RND" ? "🎲 " : "";
  const relSuffix = app.pitchRelative ? " · 123" : "";
  const pitchTag = app.pitchMode ? ` · ${clefIcon} ${rndPrefix}${(JAZZ_KEYS[resolvedPitchKey] || JAZZ_KEYS.Bb).label}${relSuffix}` : "";
  if (app.customMode) {
    document.getElementById("metaLevel").textContent = `✏️ Custom · ${app.timeSig} · ${app.numBars} bars${pitchTag} · [${playMods}]`;
    document.getElementById("metaSeed").textContent = app.phrase.customCode ? app.phrase.customCode.slice(0, 14) + "…" : "Custom";
  } else if (app.dailyDate) {
    const dTag = app.dailyPlus ? "🔥 Daily+" : "🏆 Daily";
    document.getElementById("metaLevel").textContent = `${dTag} ${app.dailyDate} · ${app.timeSig} · ${baseTitle}${pitchTag} · [${playMods}]`;
    document.getElementById("metaSeed").textContent = `#${currentFullSeedCode()}`;
  } else {
    document.getElementById("metaLevel").textContent = `${app.timeSig} · ${baseTitle}${pitchTag} · [${playMods}]`;
    document.getElementById("metaSeed").textContent = `#${currentFullSeedCode()}`;
  }
  const chartMax = computeChartMaxInfo(app.phrase);
  const maxEl = document.getElementById("metaMaxScore");
  maxEl.textContent = chartMax.sustainMax > 0
    ? `Max ${chartMax.noteMax.toLocaleString()} + Sus ${chartMax.sustainMax.toLocaleString()}`
    : `Max ${chartMax.maxScore.toLocaleString()}`;
  const modDesc = chartMax.modTags.length ? ` · ${chartMax.modTags.join(", ")}` : "";
  const susDesc = chartMax.sustainMax > 0 ? ` · Note ${chartMax.noteMax.toLocaleString()} + Sus ${chartMax.sustainMax.toLocaleString()} (${chartMax.sustainCount} notes)` : "";
  maxEl.title = `Chart Max: ${chartMax.maxScore.toLocaleString()} pts (Meter ×${chartMax.meterMult.toFixed(2)} · Log BPM ×${chartMax.bpmMult.toFixed(2)}${modDesc}${susDesc})`;
  const twMeta = getTimingThresholds(app.bpm);
  document.getElementById("legendLine").innerHTML = t("legendHtml")
    .replace(/35ms/g, `${twMeta.tight}ms`)
    .replace(/80ms/g, `${twMeta.ok}ms`);
  document.getElementById("btnDaily").classList.toggle("active", Boolean(app.dailyDate && !app.dailyPlus));
  document.getElementById("btnDailyPlus").classList.toggle("active", Boolean(app.dailyDate && app.dailyPlus));
  document.getElementById("levelSelect").value = String(app.level);
  document.getElementById("timeSigSelect").value = app.timeSig;
  const barsSel = document.getElementById("barsSelect");
  if ([...barsSel.options].some(o => Number(o.value) === app.numBars)) {
    barsSel.value = String(app.numBars);
  }
  const btnTriplets = document.getElementById("btnTriplets");
  btnTriplets.disabled = !allowTri;
  btnTriplets.textContent = effTri === 2 ? t("triplets2b") : (effTri === 1 ? t("triplets8") : t("tripletsOff"));
  btnTriplets.classList.toggle("active", effTri > 0);

  const btnStaccato = document.getElementById("btnStaccato");
  btnStaccato.textContent = app.staccatoOn ? t("staccatoOn") : t("staccatoOff");
  btnStaccato.classList.toggle("active", app.staccatoOn);

  const btnGhost = document.getElementById("btnGhost");
  btnGhost.textContent = app.ghostOn ? t("ghostOn") : t("ghostOff");
  btnGhost.classList.toggle("active", app.ghostOn);
  document.getElementById("padGhost").classList.toggle("hidden", !app.ghostOn);
  document.getElementById("dockPads").classList.toggle("with-ghost", app.ghostOn);
  const btnSound = document.getElementById("btnSound");
  btnSound.textContent = app.soundOn ? t("metroOn") : t("metroOff");
  btnSound.classList.toggle("active", app.soundOn);

  const btnBeatNums = document.getElementById("btnBeatNums");
  btnBeatNums.textContent = app.showBeatNums ? t("beatsOn") : t("beatsOff");
  btnBeatNums.classList.toggle("active", app.showBeatNums);

  const btnCursor = document.getElementById("btnCursor");
  btnCursor.textContent = app.showCursor ? t("cursorOn") : t("cursorOff");
  btnCursor.classList.toggle("active", app.showCursor);

  const btnBlind = document.getElementById("btnBlindGrade");
  btnBlind.textContent = app.blindGrade ? t("gradeEnd") : t("gradeLive");
  if (typeof syncAllDropdownBadges === "function") syncAllDropdownBadges();
  btnBlind.classList.toggle("active", app.blindGrade);

  document.getElementById("btnInKey").classList.toggle("active", app.keyOn);
  document.getElementById("btnInAudio").classList.toggle("active", app.audioOn);
  document.getElementById("btnInMidi").classList.toggle("active", app.midiOn);
  document.getElementById("btnTouchPad").classList.toggle("active", app.showTouchDock);
  document.getElementById("audioBar").classList.toggle("hidden", !app.audioOn);

  syncTransportButtons();
}

function applyLanguage(lang) {
  if (!I18N[lang]) return;
  setCurLang(lang);
  try { localStorage.setItem("rhythm_practice_lang", lang); } catch (_) {}
  document.documentElement.lang = lang;
  document.getElementById("langSelect").value = lang;

  document.getElementById("btnStart").textContent = t("btnStart");
  document.getElementById("btnDockStart").textContent = t("btnDockStart");
  document.getElementById("btnStop").textContent = t("btnStop");
  document.getElementById("btnDockStop").textContent = t("btnStop");
  document.getElementById("btnNew").textContent = t("btnNew");
  document.getElementById("btnDockNew").textContent = t("btnDockNew");
  document.getElementById("btnDemo").textContent = t("btnDemo");
  document.getElementById("lblLevel").textContent = t("lblLevel");
  const lvMap = t("lvBtns");
  document.querySelectorAll("#levelSelect option").forEach(opt => {
    opt.textContent = lvMap[Number(opt.value)];
  });
  const barsMap = t("barsLabels");
  document.querySelectorAll("#barsSelect option").forEach(opt => {
    opt.textContent = barsMap[Number(opt.value)];
  });
  document.getElementById("btnInKey").textContent = t("btnInKey");
  document.getElementById("btnInAudio").textContent = t("btnInAudio");
  document.getElementById("btnInMidi").textContent = t("btnInMidi");
  document.getElementById("btnTouchPad").textContent = t("btnPad");
  document.getElementById("lblClickVol").textContent = t("lblClickVol");
  document.getElementById("btnPrint").textContent = t("btnPrint");
  document.getElementById("btnSyncCal").textContent = t("btnSyncCal");
  document.getElementById("btnDaily").textContent = t("btnDaily");
  document.getElementById("btnDailyPlus").textContent = t("btnDailyPlus");
  document.getElementById("btnEditor").textContent = t("btnEditor");
  document.getElementById("btnTechText").textContent = t("btnTechMenu");
  document.getElementById("btnOptsText").textContent = t("btnOptsMenu");
  document.getElementById("lblDiffPanelTitle").textContent = t("diffPanelTitle");
  document.getElementById("lblDiffSecScore").textContent = t("diffSecScore");
  document.getElementById("btnToolsText").textContent = t("btnToolsMenu");
  document.getElementById("lblToolsSecCreate").textContent = t("toolsSecCreate");
  document.getElementById("lblToolsSecUtil").textContent = t("toolsSecUtil");
  document.getElementById("lblToolsSecHelp").textContent = t("toolsSecHelp");
  document.getElementById("btnLearnPage").textContent = t("btnLearnPage");
  document.getElementById("lnkPitchLearn").textContent = t("lnkPitchLearn");
  document.getElementById("btnDrillText").textContent = t("btnDrill");
  document.getElementById("lblDrillTitle").textContent = t("drillTitle");
  document.getElementById("lblGapClick").textContent = t("drillGapLbl");
  const gapOpts = t("drillGapOpts") || [];
  const gapSel = document.getElementById("gapClickSelect");
  for (let i = 0; i < gapSel.options.length && i < gapOpts.length; i++) {
    gapSel.options[i].textContent = gapOpts[i];
  }
  document.getElementById("lblFadeOut").textContent = t("drillFadeLbl");
  const fadeOpts = t("drillFadeOpts") || [];
  const fadeSel = document.getElementById("fadeOutSelect");
  for (let i = 0; i < fadeSel.options.length && i < fadeOpts.length; i++) {
    fadeSel.options[i].textContent = fadeOpts[i];
  }
  document.getElementById("btnDrillReset").textContent = t("drillReset");
  document.getElementById("drillMsg").style.color = "var(--muted)";
  document.getElementById("drillMsg").textContent = t("drillIdleMsg");
  if (typeof syncDrillUi === "function") syncDrillUi();
  document.getElementById("btnPitchText").textContent = t("btnPitch");
  document.getElementById("lblPitchTitle").textContent = t("pitchTitle");
  document.getElementById("lblPitchKey").textContent = t("pitchKeyLbl");
  document.getElementById("lblPitchProg").textContent = t("pitchProgLbl");
  const clefOpts = t("pitchClefOpts") || [];
  const clefSel = document.getElementById("pitchClefSelect");
  for (let i = 0; i < clefSel.options.length && i < clefOpts.length; i++) {
    clefSel.options[i].textContent = clefOpts[i];
  }
  const keyRndOpt = document.querySelector('#pitchKeySelect option[value="RND"]');
  if (keyRndOpt) keyRndOpt.textContent = t("pitchKeyRnd");
  const progOpts = t("pitchProgOpts") || [];
  const progSel = document.getElementById("pitchProgSelect");
  for (let i = 0; i < progSel.options.length && i < progOpts.length; i++) {
    progSel.options[i].textContent = progOpts[i];
  }
  document.getElementById("pitchMsg").style.color = "var(--muted)";
  document.getElementById("pitchMsg").textContent = t("pitchIdleMsg");
  if (typeof syncPitchUi === "function") syncPitchUi();
  document.getElementById("btnShareUrl").textContent = t("btnShareUrl");
  document.getElementById("btnShareResult").textContent = t("btnShareResult");
  document.getElementById("btnBragCard").textContent = t("btnBragCard");
  document.getElementById("lblEdTitle").textContent = t("edTitle");
  document.getElementById("btnEdImportCur").textContent = t("edImportCur");
  document.getElementById("btnEdClear").textContent = t("edClear");
  document.getElementById("btnEdCopyUrl").textContent = t("edCopyUrl");
  document.getElementById("btnEdLoadCode").textContent = t("edLoadCode");
  document.getElementById("edCodeInput").placeholder = t("edCodePlaceholder");
  document.getElementById("edMsg").textContent = t("edDefaultMsg");
  document.getElementById("metaSeed").title = t("seedTooltip");
  if (typeof renderEditorUi === "function" && !document.getElementById("editorBar").classList.contains("hidden")) {
    renderEditorUi();
  }
  document.getElementById("btnTour").textContent = t("btnTour");
  document.getElementById("btnGuide").textContent = t("btnGuide");
  if (typeof tourState !== "undefined" && tourState.open) renderTourStep(false);
  document.getElementById("lblCalTitle").textContent = t("calTitle");
  document.getElementById("btnCalRun").textContent = app.state === "CAL" ? t("calStopBtn") : t("calStartBtn");
  document.getElementById("btnCalReset").textContent = t("calResetBtn");
  if (app.state !== "CAL") {
    const calMsg = document.getElementById("calMsg");
    calMsg.style.color = "var(--muted)";
    calMsg.textContent = t("calIdleMsg");
  }
  document.getElementById("statusSub").textContent = t("statusSub");

  document.getElementById("lblAudioTitle").textContent = t("audioTitle");
  document.getElementById("btnAudioReconnect").textContent = t("btnReconnect");
  if (!audioIn.calibrating) {
    document.getElementById("btnNoiseCal").textContent = t("btnNoiseCal");
  }
  document.getElementById("lblGain").textContent = t("lblGain");
  document.getElementById("lblThr").textContent = t("lblThr");
  document.getElementById("lblLat").textContent = t("lblLat");
  if (!audioIn.active) {
    const msgEl = document.getElementById("audioMsg");
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("audioDefaultMsg");
  } else {
    populateChannelSelect(audioIn.channelCount);
    populateAudioDevices(audioIn.deviceId);
  }

  document.getElementById("tapHint").innerHTML = t("tapHintHtml");
  document.getElementById("legendLine").innerHTML = t("legendHtml");
  document.getElementById("guideSummaryTitle").textContent = t("guideTitle");
  document.getElementById("guideBody").innerHTML = t("guideHtml");
  document.getElementById("padGhostSub").textContent = t("padGhostSub");
  document.getElementById("padLeftSub").textContent = t("padLeftSub");
  document.getElementById("padRightSub").textContent = t("padRightSub");

  if (app.state === "READY") {
    setHitBadge(t("badgeWait"), "");
  }
  if (app.lastResult) {
    const r = app.lastResult;
    drawDistribution(r.errs, r.hits, r.total, r.mean, r.sd, r.tight, r.sustainStats, r.extra);
  } else {
    document.getElementById("summaryLine").textContent = t("summaryIdle");
  }
  renderLog();
  syncGuideUi();
  updateMeta();
  app.dirtyScore = true;
}


async function applyInputToggles(nextKey, nextAudio, nextPad) {
  // Keep at least one input method active
  if (!nextKey && !nextAudio && !nextPad) {
    nextKey = true;
  }
  const prevAudio = app.audioOn;
  app.keyOn = Boolean(nextKey);
  app.audioOn = Boolean(nextAudio);
  if (typeof app.showTouchDock !== "undefined") {
    app.showTouchDock = Boolean(nextPad);
    syncTouchDock();
  }
  app.inputMode = deriveInputMode();
  updateMeta();
  if (app.audioOn && !prevAudio) {
    await startAudioInput();
  } else if (!app.audioOn && prevAudio) {
    stopAudioInput();
  }
}

async function cycleInputMode() {
  // Keyboard shortcut 'i' cycles: KEY -> AUDIO -> BOTH -> KEY
  if (app.keyOn && !app.audioOn) {
    await applyInputToggles(false, true, app.showTouchDock);
  } else if (!app.keyOn && app.audioOn) {
    await applyInputToggles(true, true, app.showTouchDock);
  } else {
    await applyInputToggles(true, false, app.showTouchDock);
  }
}

function setBpm(val) {
  cancelRushTimer(true);
  if (app.state === "CAL") stopCalibration(true);
  app.bpm = Math.max(40, Math.min(180, val));
  stopScheduledAudio();
  resetTargets();
  if (app.state === "COUNTIN" || app.state === "PLAY" || app.state === "DEMO") {
    app.state = "READY";
  }
  updateMeta();
}


// -------------------------------------------------------------------------
// 6. Main Animation Loop (60 FPS UI + Fixed Metronome LED)
// -------------------------------------------------------------------------
const ledCore = document.getElementById("ledCore");
const statusMain = document.getElementById("statusMain");
const meterFill = document.getElementById("meterFill");
const meterTrack = document.getElementById("meterTrack");
const audioLevelText = document.getElementById("audioLevelText");
const scoreSvg = document.getElementById("scoreSvg");

function meterPct(val) {
  // Perceptual (sqrt) meter curve so healthy -24..-18 dBFS bass signals sit cleanly in the mid-upper meter range
  return Math.min(100, Math.sqrt(Math.max(0, val) / 0.5) * 100);
}

function frame() {
  // Update live audio meter
  if (audioIn.active) {
    const pct = meterPct(audioIn.level);
    meterFill.style.width = `${pct.toFixed(1)}%`;
    meterFill.classList.toggle("hot", audioIn.level >= audioIn.threshold);
    meterTrack.classList.toggle("triggered", (performance.now() - audioIn.lastTriggerMs) < 120);
    if (audioIn.rawPeak > 0.0003) {
      const db = Math.max(-72, Math.round(20 * Math.log10(audioIn.rawPeak)));
      audioLevelText.textContent = `${db}dB (Ch${audioIn.hotChannel + 1})`;
    } else {
      audioLevelText.textContent = t("levelSilent");
    }
  } else {
    meterFill.style.width = "0%";
    meterFill.classList.remove("hot");
    meterTrack.classList.remove("triggered");
    audioLevelText.textContent = t("levelOff");
  }

  // Update run timing & LED
  let ledClass = "led-core";
  if (app.state === "CAL" && getAudioCtx()) {
    const elapsed = getAudioCtx().currentTime - calState.startAudioT;
    const endT = (calState.totalClicks - 1) * calState.beatSec + 0.34;
    const dots = document.querySelectorAll("#calDots .cal-dot");
    if (elapsed < 0) {
      statusMain.textContent = t("statusGetReady");
    } else {
      const clickIdx = Math.floor(elapsed / calState.beatSec);
      const phase = elapsed - clickIdx * calState.beatSec;
      const flashDur = Math.min(0.13, calState.beatSec * 0.30);
      const curBeat = Math.min(calState.totalClicks, clickIdx + 1);
      statusMain.textContent = t("calStatus", curBeat, calState.totalClicks);
      dots.forEach((d, i) => d.classList.toggle("active", i === clickIdx));
      if (clickIdx >= 0 && clickIdx < calState.totalClicks && phase < flashDur) {
        ledClass = clickIdx % 4 === 0 ? "led-core beat1" : "led-core beatn";
      }
    }
    if (elapsed >= endT) {
      finishCalibration();
    }
  } else if ((app.state === "COUNTIN" || app.state === "PLAY" || app.state === "DEMO") && getAudioCtx()) {
    const now = getAudioCtx().currentTime;
    const elapsed = now - app.startAudioT;
    const ts = getTimeSig();
    const clickSec = ts.clickSec(app.bpm);
    const tickSec = clickSec / ts.clickTicks;
    const countIn = ts.countInClicks * clickSec;
    const win = hitWindowSec();
    const totalClicks = ts.countInClicks + app.numBars * ts.clicksPerBar;
    const endT = countIn + (app.numBars * ts.barTicks) * tickSec + win;

    if (app.state === "COUNTIN" && elapsed >= countIn) {
      app.state = "PLAY";
      if (app.blindGrade) setHitBadge(t("badgeBlindPlay"), "");
    }

    if (app.state === "COUNTIN" || app.state === "PLAY") {
      let changed = false;
      for (const tgt of app.phrase.targets) {
        if (!tgt.hit && !tgt.missed && elapsed > tgt.timeSec + win) {
          tgt.missed = true;
          changed = true;
        }
      }
      for (const rst of (app.phrase.rests || [])) {
        if (!rst.error && !rst.passed && elapsed >= rst.endSec) {
          rst.passed = true;
          changed = true;
        }
      }
      if (changed && !app.blindGrade) app.dirtyScore = true;
    }

    const clickIdxNow = elapsed >= 0 ? Math.floor(elapsed / clickSec) : -1;
    const inGapMuteNow = (app.state === "PLAY" && app.gapClick !== "OFF" && clickIdxNow >= ts.countInClicks)
      && isGapBar(Math.floor((clickIdxNow - ts.countInClicks) / ts.clicksPerBar), app.gapClick);

    if (elapsed < 0) {
      statusMain.textContent = t("statusGetReady");
    } else if (elapsed < countIn) {
      const ciBeat = Math.min(ts.countInClicks, Math.floor(elapsed / clickSec) + 1);
      statusMain.textContent = t("statusCountIn", ciBeat, ts.countInClicks);
    } else if (app.state === "DEMO") {
      statusMain.textContent = t("statusDemo");
    } else if (inGapMuteNow) {
      statusMain.textContent = t("statusGapMute");
    } else {
      statusMain.textContent = t("statusPlay");
    }

    if (elapsed >= 0) {
      const clickIdx = clickIdxNow;
      const phase = elapsed - clickIdx * clickSec;
      const flashDur = Math.min(0.13, clickSec * 0.32);
      const ledLimit = (app.soundOn || app.state === "DEMO") ? totalClicks : ts.countInClicks;
      if (clickIdx >= 0 && clickIdx < ledLimit && phase < flashDur && !inGapMuteNow) {
        const pos = clickIdx < ts.countInClicks ? clickIdx : (clickIdx - ts.countInClicks) % ts.clicksPerBar;
        ledClass = pos === 0 ? "led-core beat1" : "led-core beatn";
      }
    }

    if (elapsed >= endT) {
      if (app.state === "DEMO") {
        stopScheduledAudio();
        app.state = "READY";
        setHitBadge(t("badgeWait"), "");
        syncTransportButtons();
      } else {
        finalizeRun();
      }
    }
  } else if (app.state === "READY") {
    statusMain.textContent = t("statusReady");
  } else if (app.state === "DONE") {
    statusMain.textContent = t("statusDone");
  }

  if (ledCore.className !== ledClass) ledCore.className = ledClass;

  if (app.dirtyScore) {
    renderScore(scoreSvg, app.phrase);
    app.dirtyScore = false;
  }

  // Optional beginner guide cursor (60 FPS lightweight SVG attribute update, default OFF)
  const cursorEl = document.getElementById("scoreCursor");
  if (cursorEl) {
    let showNow = false;
    if (app.showCursor && (app.state === "PLAY" || app.state === "DEMO") && getAudioCtx() && app.scoreLayout) {
      const ts = getTimeSig();
      const clickSec = ts.clickSec(app.bpm);
      const tickSec = clickSec / ts.clickTicks;
      const countIn = ts.countInClicks * clickSec;
      const playElapsed = (getAudioCtx().currentTime - app.startAudioT) - countIn;
      const totalTicks = app.numBars * ts.barTicks;
      const curTick = playElapsed / tickSec;
      if (curTick >= 0 && curTick < totalTicks) {
        const bIdx = Math.floor(curTick / ts.barTicks);
        const tickInBar = curTick - bIdx * ts.barTicks;
        const lay = app.scoreLayout.barLayouts[bIdx];
        if (lay) {
          const cx = lay.barX0 + lay.innerPadL + (tickInBar / lay.barTicks) * lay.innerW;
          cursorEl.setAttribute("x1", cx.toFixed(1));
          cursorEl.setAttribute("x2", cx.toFixed(1));
          cursorEl.setAttribute("y1", String(lay.staffTop - 22));
          cursorEl.setAttribute("y2", String(lay.staffTop + 48));
          cursorEl.setAttribute("visibility", "visible");
          showNow = true;
        }
      }
    }
    if (!showNow && cursorEl.getAttribute("visibility") !== "hidden") {
      cursorEl.setAttribute("visibility", "hidden");
    }
  }

  // Special Training BETA: Look-ahead Fade-out (60 FPS lightweight SVG opacity toggle)
  if (app.fadeBeats > 0 && (app.state === "COUNTIN" || app.state === "PLAY") && getAudioCtx()) {
    const ts = getTimeSig();
    const clickSec = ts.clickSec(app.bpm);
    const tickSec = clickSec / ts.clickTicks;
    const countIn = ts.countInClicks * clickSec;
    const playElapsed = (getAudioCtx().currentTime - app.startAudioT) - countIn;
    const curTick = playElapsed / tickSec;
    const fadeThresholdTick = curTick + app.fadeBeats * ts.clickTicks;
    const nodes = scoreSvg.querySelectorAll(".beat-fade");
    for (const n of nodes) {
      const fTick = Number(n.dataset.fadeTick);
      if (fTick <= fadeThresholdTick) {
        if (!n.classList.contains("faded")) n.classList.add("faded");
      } else if (n.classList.contains("faded")) {
        n.classList.remove("faded");
      }
    }
  } else if (scoreSvg.querySelector(".beat-fade.faded")) {
    clearFadeOutClasses();
  }

  requestAnimationFrame(frame);
}

// -------------------------------------------------------------------------
// 7. Wire Controls & Keyboard Shortcuts
// -------------------------------------------------------------------------
document.getElementById("btnStart").addEventListener("click", () => startRun(false));
document.getElementById("btnDockStart").addEventListener("click", () => startRun(false));
document.getElementById("btnStop").addEventListener("click", () => stopRun());
document.getElementById("btnDockStop").addEventListener("click", () => stopRun());
document.getElementById("btnNew").addEventListener("click", () => newPhrase());
document.getElementById("btnDockNew").addEventListener("click", () => newPhrase());
document.getElementById("btnDemo").addEventListener("click", () => startRun(true));
document.getElementById("btnBpmDown").addEventListener("click", () => setBpm(app.bpm - 5));
document.getElementById("btnBpmUp").addEventListener("click", () => setBpm(app.bpm + 5));
document.getElementById("bpmSlider").addEventListener("input", e => setBpm(Number(e.target.value)));

function setLevel(lv) {
  app.level = Math.max(1, Math.min(6, Number(lv) || 1));
  newPhrase();
}

document.getElementById("levelSelect").addEventListener("change", (e) => {
  e.target.blur();
  setLevel(Number(e.target.value));
});

document.getElementById("btnTriplets").addEventListener("click", () => {
  if (!tripletsAllowed()) return;
  app.tripletMode = (app.tripletMode + 1) % 3;
  newPhrase();
});

document.getElementById("btnStaccato").addEventListener("click", () => {
  app.staccatoOn = !app.staccatoOn;
  newPhrase();
});

document.getElementById("btnGhost").addEventListener("click", () => {
  app.ghostOn = !app.ghostOn;
  newPhrase();
});

document.getElementById("timeSigSelect").addEventListener("change", (e) => {
  app.timeSig = e.target.value;
  e.target.blur();
  if (edState.open) {
    edState.timeSig = app.timeSig;
    const nBars = Math.max(1, Math.min(8, edState.bars.length || 4));
    edState.bars = Array.from({ length: nBars }, () => makeDefaultBar(app.timeSig));
    edState.selBar = 0;
    edState.selBeat = 0;
    applyCustomToApp();
    renderEditorUi();
  } else {
    newPhrase();
  }
});

document.getElementById("barsSelect").addEventListener("change", (e) => {
  app.numBars = Number(e.target.value);
  e.target.blur();
  newPhrase();
});

document.getElementById("btnSound").addEventListener("click", () => {
  app.soundOn = !app.soundOn;
  if (!app.soundOn) stopScheduledAudio();
  updateMeta();
});

document.getElementById("btnBeatNums").addEventListener("click", () => {
  app.showBeatNums = !app.showBeatNums;
  app.dirtyScore = true;
  updateMeta();
});

document.getElementById("btnCursor").addEventListener("click", () => {
  app.showCursor = !app.showCursor;
  updateMeta();
});

document.getElementById("btnBlindGrade").addEventListener("click", () => {
  app.blindGrade = !app.blindGrade;
  app.dirtyScore = true;
  if (app.state === "PLAY" && app.blindGrade) setHitBadge(t("badgeBlindPlay"), "");
  updateMeta();
});

document.getElementById("btnInKey").addEventListener("click", (e) => {
  e.currentTarget.blur();
  applyInputToggles(!app.keyOn, app.audioOn, app.showTouchDock);
});
document.getElementById("btnInAudio").addEventListener("click", (e) => {
  e.currentTarget.blur();
  applyInputToggles(app.keyOn, !app.audioOn, app.showTouchDock);
});
document.getElementById("btnInMidi").addEventListener("click", async (e) => {
  e.currentTarget.blur();
  if (app.midiOn) {
    stopMidiInput();
    updateMeta();
    return;
  }
  const res = await startMidiInput();
  if (!res.ok) {
    setHitBadge(res.reason === "unsupported" ? t("midiUnsupported") : `MIDI: ${res.reason}`, "err");
  } else if (res.devices.length) {
    setHitBadge(t("midiConnected", res.devices[0]), "tight");
  } else {
    setHitBadge(t("midiNoDevice"), "warn");
  }
  updateMeta();
});
document.getElementById("btnPrint").addEventListener("click", () => window.print());

const guideCard = document.getElementById("guideCard");
const btnGuide = document.getElementById("btnGuide");
const guideToggleHint = document.getElementById("guideToggleHint");
function syncGuideUi() {
  const opened = guideCard.open;
  btnGuide.classList.toggle("active", opened);
  guideToggleHint.textContent = opened ? t("guideClose") : t("guideOpen");
}
guideCard.addEventListener("toggle", syncGuideUi);
btnGuide.addEventListener("click", () => {
  guideCard.open = !guideCard.open;
  syncGuideUi();
  if (guideCard.open) {
    guideCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.getElementById("langSelect").addEventListener("change", (e) => {
  applyLanguage(e.target.value);
  e.target.blur();
});

// Mobile two-finger touch pad dock (auto-on only for touch devices; never disable keyboard on desktop split-screen)
const touchDock = document.getElementById("touchDock");
const btnTouchPad = document.getElementById("btnTouchPad");
const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
const isTouchOnly = isCoarsePointer && !window.matchMedia("(any-pointer: fine)").matches;
app.showTouchDock = isCoarsePointer;
if (isTouchOnly) app.keyOn = false;

function syncTouchDock() {
  touchDock.classList.toggle("visible", app.showTouchDock);
  document.body.classList.toggle("has-dock", app.showTouchDock);
  btnTouchPad.classList.toggle("active", app.showTouchDock);
}
btnTouchPad.addEventListener("click", (e) => {
  e.currentTarget.blur();
  applyInputToggles(app.keyOn, app.audioOn, !app.showTouchDock);
});

function bindTouchPad(padEl, hitKind = "NORMAL") {
  const trigger = (e) => {
    e.preventDefault();
    ensureAudioCtx();
    padEl.classList.add("pressed");
    window.setTimeout(() => padEl.classList.remove("pressed"), 90);
    if (app.state === "CAL" && getAudioCtx()) {
      recordCalibrationTap(getAudioCtx().currentTime, "KEY");
    } else if (app.state === "COUNTIN" || app.state === "PLAY") {
      if (app.showTouchDock && getAudioCtx()) {
        handleHit(getAudioCtx().currentTime - app.keyLatencyMs / 1000, "PAD", hitKind, null);
      }
    } else if (app.state === "READY") {
      startRun(false);
    }
  };
  padEl.addEventListener("pointerdown", trigger, { passive: false });
}
bindTouchPad(document.getElementById("padGhost"), "GHOST");
bindTouchPad(document.getElementById("padLeft"), "NORMAL");
bindTouchPad(document.getElementById("padRight"), "NORMAL");

let lastNarrow = window.innerWidth <= 640;
window.addEventListener("resize", () => {
  const nowNarrow = window.innerWidth <= 640;
  if (nowNarrow !== lastNarrow) {
    lastNarrow = nowNarrow;
    app.dirtyScore = true;
  }
});

const audioDeviceSelect = document.getElementById("audioDeviceSelect");
audioDeviceSelect.addEventListener("change", async (e) => {
  audioIn.deviceId = e.target.value;
  audioIn.userPickedDevice = Boolean(e.target.value);
  e.target.blur();
  if (app.inputMode === "AUDIO" || app.inputMode === "BOTH") {
    await startAudioInput(true);
  }
});

const audioChSelect = document.getElementById("audioChSelect");
audioChSelect.addEventListener("change", (e) => {
  audioIn.channelMode = e.target.value;
  e.target.blur();
});

document.getElementById("btnAudioReconnect").addEventListener("click", async () => {
  if (app.inputMode === "AUDIO" || app.inputMode === "BOTH") {
    await startAudioInput(true);
  }
});

const btnNoiseCal = document.getElementById("btnNoiseCal");
btnNoiseCal.addEventListener("click", () => {
  if (!audioIn.active || audioIn.calibrating) return;
  audioIn.calibrating = true;
  audioIn.calMaxLevel = 0;
  const msgEl = document.getElementById("audioMsg");
  btnNoiseCal.disabled = true;
  btnNoiseCal.textContent = t("btnMeasuring");
  msgEl.style.color = "var(--accent)";
  msgEl.textContent = t("calMeasuring");
  window.setTimeout(() => {
    audioIn.calibrating = false;
    btnNoiseCal.disabled = false;
    btnNoiseCal.textContent = t("btnNoiseCal");
    // Set threshold comfortably above measured idle noise floor (2.2x + 3% margin)
    const targetPct = Math.ceil(audioIn.calMaxLevel * 220) + 3;
    syncThreshold(Math.max(6, Math.min(45, targetPct)));
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("calDone", Math.round(audioIn.threshold * 100));
  }, 650);
});

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    if (audioIn.active) populateAudioDevices(audioIn.deviceId);
  });
}

const gainSlider = document.getElementById("gainSlider");
const gainVal = document.getElementById("gainVal");
function syncGain(mult) {
  const clamped = Math.max(1, Math.min(20, mult));
  audioIn.gain = clamped;
  gainSlider.value = String(clamped);
  gainVal.textContent = `${clamped}x`;
}
gainSlider.addEventListener("input", e => syncGain(Number(e.target.value)));

const thrSlider = document.getElementById("thrSlider");
const thrVal = document.getElementById("thrVal");
const meterThr = document.getElementById("meterThr");
const meterSusThr = document.getElementById("meterSusThr");
function syncThreshold(pct) {
  const clamped = Math.max(2, Math.min(48, pct));
  audioIn.threshold = clamped / 100;
  thrSlider.value = String(clamped);
  thrVal.textContent = `${clamped}%`;
  meterThr.style.left = `${Math.min(98, meterPct(audioIn.threshold)).toFixed(1)}%`;
  meterSusThr.style.left = `${Math.min(96, meterPct(audioIn.threshold * 0.28)).toFixed(1)}%`;
}
thrSlider.addEventListener("input", e => syncThreshold(Number(e.target.value)));

const latSlider = document.getElementById("latSlider");
const latVal = document.getElementById("latVal");
const calAudLatSlider = document.getElementById("calAudLatSlider");
const calAudLatVal = document.getElementById("calAudLatVal");
const keyLatSlider = document.getElementById("keyLatSlider");
const keyLatVal = document.getElementById("keyLatVal");

function syncLatency(ms, persist = false) {
  const clamped = Math.max(0, Math.min(300, Math.round(ms)));
  audioIn.latencyMs = clamped;
  latSlider.value = String(clamped);
  latVal.textContent = `${clamped}ms`;
  calAudLatSlider.value = String(clamped);
  calAudLatVal.textContent = `${clamped}ms`;
  if (persist) {
    try { localStorage.setItem("rhythm_practice_aud_lat", String(clamped)); } catch (_) {}
  }
}
function syncKeyLatency(ms, persist = false) {
  const clamped = Math.max(-50, Math.min(300, Math.round(ms)));
  app.keyLatencyMs = clamped;
  keyLatSlider.value = String(clamped);
  keyLatVal.textContent = `${clamped > 0 ? "+" : ""}${clamped}ms`;
  if (persist) {
    try { localStorage.setItem("rhythm_practice_key_lat", String(clamped)); } catch (_) {}
  }
}
latSlider.addEventListener("input", e => syncLatency(Number(e.target.value), true));
calAudLatSlider.addEventListener("input", e => syncLatency(Number(e.target.value), true));
keyLatSlider.addEventListener("input", e => syncKeyLatency(Number(e.target.value), true));

const calBar = document.getElementById("calBar");
const btnSyncCal = document.getElementById("btnSyncCal");
function toggleCalBar(forceOpen = null) {
  const open = forceOpen !== null ? forceOpen : calBar.classList.contains("hidden");
  calBar.classList.toggle("hidden", !open);
  btnSyncCal.classList.toggle("active", open);
  if (!open && app.state === "CAL") stopCalibration(true);
}
btnSyncCal.addEventListener("click", (e) => {
  e.currentTarget.blur();
  toggleCalBar();
});
document.getElementById("btnCalClose").addEventListener("click", () => toggleCalBar(false));
document.getElementById("btnCalRun").addEventListener("click", (e) => {
  e.currentTarget.blur();
  if (app.state === "CAL") stopCalibration(true);
  else startCalibration();
});
document.getElementById("btnCalReset").addEventListener("click", (e) => {
  e.currentTarget.blur();
  syncKeyLatency(0, true);
  syncLatency(25, true);
  const msgEl = document.getElementById("calMsg");
  msgEl.style.color = "var(--muted)";
  msgEl.textContent = t("calResetMsg");
});

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (typeof tourState !== "undefined" && tourState.open) {
    if (e.code === "Escape") {
      e.preventDefault();
      closeTour(true);
    } else if (e.code === "ArrowRight" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
      e.preventDefault();
      nextTourStep();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      prevTourStep();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;

  // Use physical key code (e.code) so all shortcuts work even when Korean IME is active
  const code = e.code;

  // In Pitch Sight-Reading BETA, free the entire top 2 rows (1..0 & Q..P) for playable piano/bass input!
  if (app.pitchMode) {
    if (PITCH_KEY_MAP.has(code)) {
      e.preventDefault();
      triggerPitchPianoKey(PITCH_KEY_MAP.get(code));
      return;
    }
    if (PITCH_TOP_ROW_SWALLOW.has(code)) {
      e.preventDefault();
      return;
    }
  }

  if (code === "Space" || code === "KeyJ" || code === "KeyK" || code === "KeyF" || code === "KeyD") {
    e.preventDefault();
    const hitKind = (code === "KeyF" || code === "KeyD") ? "GHOST" : "NORMAL";
    if (app.state === "CAL" && getAudioCtx()) {
      recordCalibrationTap(getAudioCtx().currentTime, "KEY");
    } else if (app.state === "COUNTIN" || app.state === "PLAY") {
      if (app.keyOn && getAudioCtx()) {
        handleHit(getAudioCtx().currentTime - app.keyLatencyMs / 1000, "KEY", hitKind, code);
      }
    } else if (app.state === "READY") {
      startRun(false);
    }
  } else if (code === "Enter" || code === "NumpadEnter" || code === "KeyR") {
    e.preventDefault();
    startRun(false);
  } else if (code === "Escape") {
    e.preventDefault();
    stopRun();
  } else if (code === "KeyN") {
    e.preventDefault();
    newPhrase();
  } else if (code === "KeyP") {
    e.preventDefault();
    startRun(true);
  } else if (code === "Equal" || code === "NumpadAdd" || e.key === "+" || e.key === "=") {
    e.preventDefault();
    setBpm(app.bpm + 5);
  } else if (code === "Minus" || code === "NumpadSubtract" || e.key === "-" || e.key === "_") {
    e.preventDefault();
    setBpm(app.bpm - 5);
  } else if (/^(Digit|Numpad)[1-6]$/.test(code)) {
    setLevel(Number(code.slice(-1)));
  } else if (code === "ArrowUp") {
    e.preventDefault();
    if (app.level < 6) setLevel(app.level + 1);
  } else if (code === "ArrowDown") {
    e.preventDefault();
    if (app.level > 1) setLevel(app.level - 1);
  } else if (code === "KeyC") {
    e.preventDefault();
    app.showCursor = !app.showCursor;
    updateMeta();
  } else if (code === "KeyT") {
    e.preventDefault();
    if (tripletsAllowed()) {
      app.tripletMode = (app.tripletMode + 1) % 3;
      newPhrase();
    }
  } else if (code === "KeyQ") {
    e.preventDefault();
    app.staccatoOn = !app.staccatoOn;
    newPhrase();
  } else if (code === "KeyX") {
    e.preventDefault();
    app.ghostOn = !app.ghostOn;
    newPhrase();
  } else if (code === "KeyS") {
    e.preventDefault();
    const idx = TIME_SIG_OPTIONS.indexOf(app.timeSig);
    app.timeSig = TIME_SIG_OPTIONS[(idx + 1) % TIME_SIG_OPTIONS.length];
    newPhrase();
  } else if (code === "KeyL") {
    e.preventDefault();
    const idx = BAR_OPTIONS.indexOf(app.numBars);
    app.numBars = BAR_OPTIONS[(idx + 1) % BAR_OPTIONS.length];
    newPhrase();
  } else if (code === "KeyM") {
    e.preventDefault();
    app.soundOn = !app.soundOn;
    if (!app.soundOn) stopScheduledAudio();
    updateMeta();
  } else if (code === "KeyB") {
    e.preventDefault();
    app.showBeatNums = !app.showBeatNums;
    app.dirtyScore = true;
    updateMeta();
  } else if (code === "KeyG") {
    e.preventDefault();
    app.blindGrade = !app.blindGrade;
    app.dirtyScore = true;
    if (app.state === "PLAY" && app.blindGrade) setHitBadge(t("badgeBlindPlay"), "");
    updateMeta();
  } else if (code === "KeyI") {
    e.preventDefault();
    cycleInputMode();
  } else if (code === "BracketLeft") {
    syncThreshold(Math.round(audioIn.threshold * 100) - 2);
  } else if (code === "BracketRight") {
    syncThreshold(Math.round(audioIn.threshold * 100) + 2);
  } else if (code === "Comma") {
    syncLatency(audioIn.latencyMs - 5, true);
  } else if (code === "Period") {
    syncLatency(audioIn.latencyMs + 5, true);
  }
});

window.addEventListener("keyup", (e) => {
  if (PITCH_KEY_MAP.has(e.code)) {
    const kEl = document.querySelector(`#pitchPiano [data-code="${e.code}"]`);
    if (kEl) kEl.classList.remove("pressed");
  }
  if (app.activeKeyStac && app.activeKeyStac.code === e.code && getAudioCtx()) {
    closeKeyStaccato((getAudioCtx().currentTime - app.keyLatencyMs / 1000) - app.startAudioT);
  }
});

// -------------------------------------------------------------------------
// 7B. Custom Score Editor, Share URL, Daily Challenge & Result Card

document.getElementById("btnDaily").addEventListener("click", (e) => {
  e.currentTarget.blur();
  loadDailyChallenge(null, false);
});

document.getElementById("btnDailyPlus").addEventListener("click", (e) => {
  e.currentTarget.blur();
  loadDailyChallenge(null, true);
});

document.getElementById("btnShareUrl").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.blur();
  const url = buildShareUrl();
  await copyToClipboard(url);
  trackShare("url", app);
  flashBtnText(btn, t("btnShareCopied"), () => t("btnShareUrl"));
  setHitBadge(app.customMode ? t("edUrlCopied") : t("edSeedCopied"), "tight");
});

document.getElementById("btnShareResult").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.blur();
  const text = buildResultCardText();
  if (!text) return;
  await copyToClipboard(text);
  trackShare("text", app);
  flashBtnText(btn, t("resultCopied"), () => t("btnShareResult"));
});

document.getElementById("btnBragCard").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.blur();
  const blob = await renderScoreCardPngBlob();
  if (!blob) return;
  trackShare("card", app);
  const snap = (app.lastResult && app.lastResult.snap) || {};
  const dDate = snap.dailyDate !== undefined ? snap.dailyDate : app.dailyDate;
  const dPlus = snap.dailyPlus !== undefined ? snap.dailyPlus : app.dailyPlus;
  const tag = dDate
    ? `${dPlus ? "daily-plus" : "daily"}-${dDate}`
    : `score-${getTodayDateStr()}`;
  const filename = `rhythm-sight-reader-${tag}.png`;
  // Mobile native share sheet (KakaoTalk / Instagram / X / Photos) when supported
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (IS_MOBILE && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Rhythm Sight-Reader",
        text: buildResultCardText(),
        files: [file],
      });
      flashBtnText(btn, t("bragSaved"), () => t("btnBragCard"));
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return;
  }
  // Desktop / fallback: instant PNG download + try clipboard image copy
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }
  } catch (_) {}
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  flashBtnText(btn, t("bragSaved"), () => t("btnBragCard"));
});

function bootInitialScore() {
  const params = new URLSearchParams(location.search || "");
  if (applySeedQueryParams(params)) return;
  app.phrase = generatePhrase(app.numBars, app.level, app.tripletMode, app.timeSig, null, app.staccatoOn, app.ghostOn);
  applyPitchToCurrentPhrase();
  resetTargets();
}

// -------------------------------------------------------------------------
// Special Training BETA Controls (Gap Click · Look-ahead Fade-out · BPM Rush)
// -------------------------------------------------------------------------
function syncDrillUi() {
  const bar = document.getElementById("drillBar");
  const barOpen = !bar.classList.contains("hidden");
  const anyActive = (app.gapClick !== "OFF") || (app.fadeBeats > 0) || app.rushOn;
  document.getElementById("btnDrill").classList.toggle("active", barOpen || anyActive);
  if (typeof syncToolsMenuBadge === "function") syncToolsMenuBadge();
  document.getElementById("gapClickSelect").value = app.gapClick;
  document.getElementById("fadeOutSelect").value = String(app.fadeBeats);
  const rushBtn = document.getElementById("btnRushToggle");
  rushBtn.textContent = app.rushOn ? t("drillRushOn") : t("drillRushOff");
  rushBtn.classList.toggle("active", app.rushOn);
  document.getElementById("rushAccSelect").value = String(app.rushMinAcc);
  const bestEl = document.getElementById("rushBestBadge");
  const best = loadRushBest();
  if (best && best.rounds > 0) {
    bestEl.textContent = t("drillRushBest", best.peakBpm, best.rounds);
    bestEl.classList.remove("hidden");
  } else {
    bestEl.classList.add("hidden");
  }
}

document.getElementById("btnDrill").addEventListener("click", (e) => {
  e.currentTarget.blur();
  document.getElementById("drillBar").classList.toggle("hidden");
  syncDrillUi();
});
document.getElementById("btnDrillClose").addEventListener("click", () => {
  document.getElementById("drillBar").classList.add("hidden");
  syncDrillUi();
});
document.getElementById("gapClickSelect").addEventListener("change", (e) => {
  app.gapClick = e.target.value;
  if (app.gapClick !== "OFF" && !app.soundOn) {
    app.soundOn = true; // Ensure metronome is ON so Gap Click has audible ON bars
  }
  e.target.blur();
  app.dirtyScore = true;
  updateMeta();
  syncDrillUi();
});
document.getElementById("fadeOutSelect").addEventListener("change", (e) => {
  app.fadeBeats = Number(e.target.value) || 0;
  clearFadeOutClasses();
  e.target.blur();
  updateMeta();
  syncDrillUi();
});
document.getElementById("btnRushToggle").addEventListener("click", (e) => {
  e.currentTarget.blur();
  app.rushOn = !app.rushOn;
  cancelRushTimer(true);
  if (app.rushOn && (app.dailyDate || app.customMode)) {
    newPhrase(); // Exit Daily/Custom so Rush can generate fresh phrases each round
  }
  const msgEl = document.getElementById("drillMsg");
  msgEl.style.color = "var(--muted)";
  msgEl.textContent = t("drillIdleMsg");
  updateMeta();
  syncDrillUi();
});
document.getElementById("rushAccSelect").addEventListener("change", (e) => {
  app.rushMinAcc = Number(e.target.value) || 90;
  e.target.blur();
});
document.getElementById("btnDrillReset").addEventListener("click", (e) => {
  e.currentTarget.blur();
  cancelRushTimer(true);
  app.gapClick = "OFF";
  app.fadeBeats = 0;
  app.rushOn = false;
  clearFadeOutClasses();
  const msgEl = document.getElementById("drillMsg");
  msgEl.style.color = "var(--muted)";
  msgEl.textContent = t("drillIdleMsg");
  app.dirtyScore = true;
  updateMeta();
  syncDrillUi();
});


// -------------------------------------------------------------------------
// Pitch Sight-Reading BETA Controls (Flat-Key Jazz Harmony + e4r5ty7u8i9op Piano + Free-Tempo + MIDI + Audio)
// -------------------------------------------------------------------------
// Shifted ergonomic DAW layout starting from E = C (e 4 r 5 t y 7 u 8 i 9 o p),
// plus low A-Bb-B (q 2 w) on the left for natural leading tones!
const PITCH_WHITE_KEYS = [
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
const PITCH_BLACK_KEYS = [
  { code: "Digit2", kbd: "2", midi: 34, note: "B♭", leftPct: 6.6 },
  { code: "Digit4", kbd: "4", midi: 37, note: "D♭", leftPct: 26.6 },
  { code: "Digit5", kbd: "5", midi: 39, note: "E♭", leftPct: 36.6 },
  { code: "Digit7", kbd: "7", midi: 42, note: "G♭", leftPct: 56.6 },
  { code: "Digit8", kbd: "8", midi: 44, note: "A♭", leftPct: 66.6 },
  { code: "Digit9", kbd: "9", midi: 46, note: "B♭", leftPct: 76.6 },
];
const PITCH_KEY_MAP = new Map([...PITCH_WHITE_KEYS, ...PITCH_BLACK_KEYS].map(k => [k.code, k]));
// Unused top-row digits (gaps between black keys: 1, 3, 6, 0) swallowed while Pitch BETA is ON so level shortcuts never misfire
const PITCH_TOP_ROW_SWALLOW = new Set(["Digit1", "Digit3", "Digit6", "Digit0"]);

function getActivePitchKeyId() {
  if (app.phrase && app.phrase.pitchMeta && app.phrase.pitchMeta.key) {
    return app.phrase.pitchMeta.key;
  }
  return app.pitchKey === "RND" ? "Bb" : app.pitchKey;
}

function getActiveKeyRootPc() {
  return (JAZZ_KEYS[getActivePitchKeyId()] || JAZZ_KEYS.C).rootPc;
}

function findNextPitchFreeIdx(startIdx) {
  const tgts = (app.phrase && app.phrase.targets) || [];
  let idx = startIdx;
  while (idx < tgts.length && tgts[idx].art === "ghost") idx++;
  return idx;
}

function handlePitchFreeStep(playedMidiFloat, sourceTag = "KEY") {
  if (!app.pitchMode || !app.pitchFreeMode || !app.phrase) return;
  const tgts = app.phrase.targets || [];
  if (!tgts.length) return;
  if (app.pitchFreeIdx >= tgts.length) {
    // Already completed phrase: reset cleanly on next press to replay!
    resetTargets();
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
      const gradable = tgts.filter(tg => tg.art !== "ghost" && tg.pitch);
      const firstTryOk = gradable.filter(tg => tg.pitchOk === true && !tg.hadWrongTry).length;
      const pct = gradable.length ? (firstTryOk / gradable.length) * 100 : 100;
      const msgEl = document.getElementById("pitchMsg");
      msgEl.style.color = pct >= 85 ? "var(--green)" : (pct >= 65 ? "var(--amber)" : "var(--red)");
      msgEl.textContent = t("pitchFreeDone", firstTryOk, gradable.length, pct, app.pitchFreeMistakes);
      setHitBadge(`[${sourceTag}] 🎯 ${firstTryOk}/${gradable.length} (${pct.toFixed(0)}%)`, "tight");
    } else {
      setHitBadge(`[${sourceTag}] ✓ ${tgtLbl}`, "tight");
    }
  } else {
    tgt.pitchOk = false;
    tgt.hadWrongTry = true;
    tgt.detectedPitch = detLbl;
    app.pitchFreeMistakes += 1;
    app.dirtyScore = true;
    setHitBadge(`[${sourceTag}] ${tgtLbl} ≠ ${detLbl}`, "err");
  }
}

function flashPianoKeyByMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const match = [...PITCH_WHITE_KEYS, ...PITCH_BLACK_KEYS].find(k => (k.midi % 12) === pc);
  if (!match) return;
  const kEl = document.querySelector(`#pitchPiano [data-code="${match.code}"]`);
  if (kEl) {
    kEl.classList.add("pressed");
    window.setTimeout(() => kEl.classList.remove("pressed"), 150);
  }
}

function triggerPitchPianoKey(keySpec, fromPointer = false) {
  if (!keySpec) return;
  const ctx = ensureAudioCtx();
  const kEl = document.querySelector(`#pitchPiano [data-code="${keySpec.code}"]`);
  if (kEl) {
    kEl.classList.add("pressed");
    if (fromPointer) {
      window.setTimeout(() => kEl.classList.remove("pressed"), 140);
    }
  }
  // In Relative/Movable-Do mode, E(C) acts as Tonic 1 of the current key!
  const rootShift = app.pitchRelative ? getActiveKeyRootPc() : 0;
  const effectiveMidi = keySpec.midi + rootShift;
  // Live synth feedback (shifted +2 octaves in Treble Clef so it sounds in treble register)
  if (ctx) {
    let soundMidi = app.pitchClef === "treble" ? (effectiveMidi + 24) : effectiveMidi;
    if (app.pitchClef === "bass" && soundMidi > 55) soundMidi -= 12;
    if (app.pitchClef === "treble" && soundMidi > 84) soundMidi -= 12;
    scheduleBassNote(ctx, ctx.currentTime, 0.26, midiToFreq(soundMidi));
  }
  if (app.state === "CAL" && ctx) {
    recordCalibrationTap(ctx.currentTime, "KEY");
  } else if ((app.state === "COUNTIN" || app.state === "PLAY") && ctx) {
    if (app.keyOn || fromPointer) {
      handleHit(ctx.currentTime - app.keyLatencyMs / 1000, fromPointer ? "PAD" : "KEY", "NORMAL", keySpec.code, effectiveMidi);
    }
  } else if (app.pitchFreeMode) {
    handlePitchFreeStep(effectiveMidi, fromPointer ? "PAD" : "KEY");
  } else {
    const lbl = app.pitchRelative ? DEGREE_NAMES[((keySpec.midi % 12) + 12) % 12] : keySpec.note;
    setHitBadge(`[KEY] ${lbl} (${keySpec.kbd})`, "tight");
  }
}

function handleMidiNoteOn(midiNote) {
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
      // Keep MIDI playback in natural register for Bass or Treble clef
      const playMidi = app.pitchClef === "treble"
        ? (effectiveMidi < 48 ? effectiveMidi + 24 : (effectiveMidi > 84 ? effectiveMidi - 12 : effectiveMidi))
        : (effectiveMidi < 28 ? effectiveMidi + 12 : (effectiveMidi > 60 ? effectiveMidi - 12 : effectiveMidi));
      scheduleBassNote(ctx, ctx.currentTime, 0.26, midiToFreq(playMidi));
    }
  }
  if (app.state === "CAL" && ctx) {
    recordCalibrationTap(ctx.currentTime, "MIDI");
  } else if ((app.state === "COUNTIN" || app.state === "PLAY") && ctx) {
    handleHit(ctx.currentTime, "MIDI", "NORMAL", null, app.pitchMode ? effectiveMidi : null);
  } else if (app.pitchMode && app.pitchFreeMode) {
    handlePitchFreeStep(effectiveMidi, "MIDI");
  } else {
    setHitBadge(`[MIDI] ${noteName}`, "tight");
  }
}

function syncPitchPianoLabels() {
  for (const k of [...PITCH_WHITE_KEYS, ...PITCH_BLACK_KEYS]) {
    const node = document.querySelector(`#pitchPiano [data-code="${k.code}"] .pk-note`);
    if (node) {
      node.textContent = app.pitchRelative ? DEGREE_NAMES[((k.midi % 12) + 12) % 12] : k.note;
    }
  }
}

function buildPitchPianoUi() {
  const wrap = document.getElementById("pitchPiano");
  if (!wrap || wrap.childElementCount > 0) return;
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
buildPitchPianoUi();

function syncPitchUi() {
  const bar = document.getElementById("pitchBar");
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
  if (pianoEl) pianoEl.classList.toggle("hidden", !app.pitchMode);
  syncPitchPianoLabels();
  if (typeof syncToolsMenuBadge === "function") syncToolsMenuBadge();
}

document.getElementById("btnPitchBeta").addEventListener("click", (e) => {
  e.currentTarget.blur();
  const bar = document.getElementById("pitchBar");
  const willOpen = bar.classList.contains("hidden");
  bar.classList.toggle("hidden", !willOpen);
  // Auto-enable Pitch BETA when first opening the drawer so the user sees 5-line jazz notation immediately
  if (willOpen && !app.pitchMode) {
    app.pitchMode = true;
    applyPitchToCurrentPhrase();
    updateMeta();
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
  applyPitchToCurrentPhrase();
  resetTargets();
  const msgEl = document.getElementById("pitchMsg");
  msgEl.style.color = "var(--muted)";
  msgEl.textContent = t("pitchIdleMsg");
  updateMeta();
  syncPitchUi();
});
document.getElementById("btnPitchFreeMode").addEventListener("click", (e) => {
  e.currentTarget.blur();
  app.pitchFreeMode = !app.pitchFreeMode;
  if (app.pitchFreeMode && !app.pitchMode) {
    app.pitchMode = true;
    applyPitchToCurrentPhrase();
  }
  stopRun();
  resetTargets();
  const msgEl = document.getElementById("pitchMsg");
  msgEl.style.color = "var(--muted)";
  msgEl.textContent = t("pitchIdleMsg");
  updateMeta();
  syncPitchUi();
});
document.getElementById("btnPitchRelMode").addEventListener("click", (e) => {
  e.currentTarget.blur();
  app.pitchRelative = !app.pitchRelative;
  if (app.pitchRelative && !app.pitchMode) {
    app.pitchMode = true;
    applyPitchToCurrentPhrase();
    resetTargets();
  }
  app.dirtyScore = true;
  updateMeta();
  syncPitchUi();
});
document.getElementById("pitchClefSelect").addEventListener("change", (e) => {
  app.pitchClef = e.target.value === "treble" ? "treble" : "bass";
  e.target.blur();
  if (!app.pitchMode) app.pitchMode = true;
  applyPitchToCurrentPhrase();
  resetTargets();
  updateMeta();
  syncPitchUi();
});
document.getElementById("pitchKeySelect").addEventListener("change", (e) => {
  app.pitchKey = e.target.value;
  e.target.blur();
  if (!app.pitchMode) app.pitchMode = true;
  applyPitchToCurrentPhrase();
  resetTargets();
  updateMeta();
  syncPitchUi();
});
document.getElementById("pitchProgSelect").addEventListener("change", (e) => {
  app.pitchProg = e.target.value;
  e.target.blur();
  if (!app.pitchMode) app.pitchMode = true;
  applyPitchToCurrentPhrase();
  resetTargets();
  updateMeta();
  syncPitchUi();
});
document.getElementById("btnPitchHints").addEventListener("click", (e) => {
  e.currentTarget.blur();
  app.pitchShowHints = !app.pitchShowHints;
  app.dirtyScore = true;
  syncPitchUi();
});


// -------------------------------------------------------------------------
// Categorized Toolbar Dropdowns (🎚️ 난이도 통합 패널 · ⋯ 도구)
// -------------------------------------------------------------------------
const TOOLBAR_MENUS = [
  { wrapId: "diffWrap", btnId: "btnDiffMenu", dropId: "diffDropdown", closeOnClick: false },
  { wrapId: "toolsWrap", btnId: "btnToolsMenu", dropId: "toolsDropdown", closeOnClick: true },
];

function closeAllToolbarMenus(exceptDropId = null) {
  for (const m of TOOLBAR_MENUS) {
    if (m.dropId === exceptDropId) continue;
    const drop = document.getElementById(m.dropId);
    const btn = document.getElementById(m.btnId);
    if (drop && !drop.classList.contains("hidden")) {
      drop.classList.add("hidden");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  }
}

function syncAllDropdownBadges() {
  // 1. Unified Difficulty Menu (Lv + Tech + TimeSig + Bars + Practice Opts)
  const allowTri = tripletsAllowed(app.level, getTimeSig());
  const effTri = allowTri ? app.tripletMode : 0;
  const tTag = effTri === 2 ? "T2" : (effTri === 1 ? "T1" : "");
  const lvFlags = `${tTag}${app.staccatoOn ? "S" : ""}${app.ghostOn ? "G" : ""}`;
  const diffParts = [`Lv${app.level}${lvFlags}`, app.timeSig, `${app.numBars}B`];
  if (!app.soundOn) diffParts.push("M×");
  if (app.blindGrade) diffParts.push("Blind");
  if (app.showBeatNums) diffParts.push("+B");
  if (app.showCursor) diffParts.push("+C");
  const diffDropOpen = !document.getElementById("diffDropdown").classList.contains("hidden");
  document.getElementById("diffSummaryBadge").textContent = diffParts.join(" · ");
  document.getElementById("btnDiffMenu").classList.toggle("active", diffDropOpen);

  // 2. Tools Menu (Editor · Drills · Pitch · Sync · PDF · Tour · Guide)
  const anyDrill = (app.gapClick !== "OFF") || (app.fadeBeats > 0) || app.rushOn || app.pitchMode;
  const anyPanelOpen =
    !document.getElementById("editorBar").classList.contains("hidden") ||
    !document.getElementById("drillBar").classList.contains("hidden") ||
    !document.getElementById("pitchBar").classList.contains("hidden") ||
    !document.getElementById("calBar").classList.contains("hidden");
  const toolsDropOpen = !document.getElementById("toolsDropdown").classList.contains("hidden");
  document.getElementById("btnToolsMenu").classList.toggle("active", toolsDropOpen || anyDrill || anyPanelOpen);
  document.getElementById("toolsActiveDot").classList.toggle("hidden", !anyDrill);
}
const syncToolsMenuBadge = syncAllDropdownBadges;

document.getElementById("btnDiffClose").addEventListener("click", (e) => {
  e.stopPropagation();
  closeAllToolbarMenus();
  syncAllDropdownBadges();
});

function clampDropdownToViewport(drop) {
  if (!drop || drop.classList.contains("hidden")) return;
  drop.style.left = "0px";
  drop.style.right = "auto";
  const r = drop.getBoundingClientRect();
  const vw = window.innerWidth;
  let shift = 0;
  if (r.right > vw - 12) shift -= (r.right - (vw - 12));
  if (r.left + shift < 12) shift += (12 - (r.left + shift));
  if (shift !== 0) drop.style.left = `${Math.round(shift)}px`;
}

for (const m of TOOLBAR_MENUS) {
  const btn = document.getElementById(m.btnId);
  const drop = document.getElementById(m.dropId);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.currentTarget.blur();
    const willOpen = drop.classList.contains("hidden");
    closeAllToolbarMenus(willOpen ? m.dropId : null);
    drop.classList.toggle("hidden", !willOpen);
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) clampDropdownToViewport(drop);
    syncAllDropdownBadges();
  });
  if (m.closeOnClick) {
    drop.addEventListener("click", (e) => {
      if (e.target.closest("button")) {
        window.setTimeout(() => {
          drop.classList.add("hidden");
          btn.setAttribute("aria-expanded", "false");
          syncAllDropdownBadges();
        }, 0);
      }
    });
  }
}
window.addEventListener("resize", () => {
  for (const m of TOOLBAR_MENUS) {
    clampDropdownToViewport(document.getElementById(m.dropId));
  }
});
document.addEventListener("click", (e) => {
  const insideAny = TOOLBAR_MENUS.some(m => document.getElementById(m.wrapId).contains(e.target));
  if (!insideAny) {
    closeAllToolbarMenus();
    syncAllDropdownBadges();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    closeAllToolbarMenus();
    syncAllDropdownBadges();
  }
});
["btnEdClose", "btnCalClose", "btnDrillClose", "btnPitchClose"].forEach(id => {
  const elBtn = document.getElementById(id);
  if (elBtn) elBtn.addEventListener("click", () => window.setTimeout(syncAllDropdownBadges, 0));
});

function syncClickVol(val, persist = true) {
  const v = Math.max(0, Math.min(200, Math.round(Number(val) || 0)));
  app.clickVol = v;
  document.getElementById("clickVolSlider").value = String(v);
  document.getElementById("clickVolVal").textContent = `${v}%`;
  setClickMasterGainVol(v);
  if (persist) {
    try { localStorage.setItem("rhythm_practice_click_vol", String(v)); } catch (_) {}
  }
}

document.getElementById("clickVolSlider").addEventListener("input", (e) => {
  syncClickVol(e.target.value, true);
});
document.getElementById("clickVolSlider").addEventListener("change", (e) => {
  syncClickVol(e.target.value, true);
  e.target.blur();
  if ((app.state === "READY" || app.state === "DONE") && app.clickVol > 0) {
    const ctx = ensureAudioCtx();
    scheduleClick(ctx, ctx.currentTime + 0.02, 1318.51, 0.32);
  }
});

// Wire cross-module callbacks cleanly before Boot
registerAudioInCallbacks({ handleHit, handlePitchFreeStep, recordCalibrationTap, setHitBadge });
registerMidiCallbacks({
  onNoteOn: handleMidiNoteOn,
  onStatusChange: (devices) => {
    const btn = document.getElementById("btnInMidi");
    if (btn) {
      btn.title = devices.length
        ? `MIDI: ${devices.join(", ")}`
        : (midiIn.supported ? "USB MIDI (Web MIDI)" : t("midiUnsupported"));
    }
  },
});
initEditor({ stopRun, resetTargets, updateMeta, setHitBadge, loadDailyChallenge, newPhrase, syncPitchUi });
initTour({ stopRun, applyLanguage });

// Boot
const bootParams = new URLSearchParams(location.search || "");
const arrivedViaSharedLink = ["seed", "daily", "dailyplus", "custom"].some(k => bootParams.has(k));
bootInitialScore();
syncGain(2);
syncThreshold(16);
let savedKeyLat = 0, savedAudLat = 25, savedClickVol = 100;
try {
  const k = localStorage.getItem("rhythm_practice_key_lat");
  const a = localStorage.getItem("rhythm_practice_aud_lat");
  const cv = localStorage.getItem("rhythm_practice_click_vol");
  if (k !== null && Number.isFinite(Number(k))) savedKeyLat = Number(k);
  if (a !== null && Number.isFinite(Number(a))) savedAudLat = Number(a);
  if (cv !== null && Number.isFinite(Number(cv))) savedClickVol = Number(cv);
} catch (_) {}
syncKeyLatency(savedKeyLat);
syncLatency(savedAudLat);
syncClickVol(savedClickVol, false);
// Restore persisted recent practice log (leaderboard-ready history)
try {
  const rawHist = localStorage.getItem("rhythm_practice_history_v1");
  if (rawHist) {
    const parsed = JSON.parse(rawHist);
    if (Array.isArray(parsed) && parsed.length) {
      app.history = parsed.slice(0, 12);
      const maxTake = app.history.reduce((m, h) => Math.max(m, Number(h.take) || 0), 0);
      if (maxTake >= app.takeId) app.takeId = maxTake + 1;
    }
  }
} catch (_) {}
syncTouchDock();
drawDistribution([], 0, 0, 0, 0, 0);
applyLanguage(getCurLang());
syncToolsMenuBadge();
renderLog();
requestAnimationFrame(frame);
if (!hasSeenTour() && !arrivedViaSharedLink) {
  window.setTimeout(() => openTour(0), 260);
}
