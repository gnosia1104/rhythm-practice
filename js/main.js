// Main Application Entry Point — Playback, Grading, Controls & Boot
import { I18N, getCurLang, setCurLang, t } from "./i18n.js";
import {
  TIME_SIGS, LEVEL_TITLES, PRE_DELAY_SEC,
  decodeFullSeedCode, getDailyChallengeSpec, getDailyStreak, saveDailyBest, generatePhrase,
} from "./rhythm.js";
import {
  app, audioIn, edState, calState, tourState,
  getTimeSig, tripletsAllowed, isGapBar, hitWindowSec, currentFullSeedCode, deriveInputMode,
} from "./state.js";
import {
  formatPlayMods, computeChartMaxInfo,
  getTimingThresholds, computeDetailedScore, computeScoreRank,
} from "./scoring.js";
import { renderScore } from "./engraver.js?v=20261127o";
import {
  getAudioCtx, isAudioCtxRunning, onAudioStateChange, ensureAudioCtx, ensureAudioCtxReady,
  stopScheduledAudio, scheduleClick, scheduleRunAudio,
} from "./audio-out.js";
import {
  registerAudioInCallbacks, populateAudioDevices, populateChannelSelect, startAudioInput, stopAudioInput,
  closeSustainTarget, schedulePitchCheck,
} from "./audio-in.js";
import { JAZZ_KEYS, getRelativeDegreeName } from "./pitch-gen.js";
import { comparePitchClass } from "./pitch-detect.js";
import {
  midiIn, registerMidiCallbacks, startMidiInput, stopMidiInput,
} from "./midi-in.js";
import { clearShareQueryUrl, buildShareUrl } from "./share-card.js";
import {
  makeDefaultBar, applyCustomToApp, renderEditorUi, toggleEditorBar, applyFullSeedObj, applySeedQueryParams,
  loadCustomFromInput, initEditor,
} from "./editor.js";
import {
  hasSeenTour, renderTourStep, openTour, closeTour, nextTourStep, prevTourStep, initTour,
} from "./tour.js";
import {
  trackPracticeStart, trackPracticeComplete, trackPracticeStop, trackRefVisit,
} from "./analytics.js";
import {
  initRoom, syncRoomLanguage, isRoomActive, isRoomGuest, isRoomSuddenDeath, isRoomPlaying, isRoomCountingDown, getRoomCountdownText,
  refreshRoomAudioBanner, tryStartRoomRoundFromMain, notifyRoomStopped,
  notifyRoomChartChanged, notifyRoomLiveProgress, notifyRoomFinish,
  notifyRoomEndlessProgress, notifyRoomEndlessOut,
} from "./room.js?v=20261127ad";
import {
  endlessState, isSdEndless, initEndless, setEndlessMode, setEndlessStreamSeed, syncEndlessLanguage, renderEndlessHud,
  buildEndlessPreviewPhrase, startEndlessAudioAndState, stepEndlessFrame,
  onEndlessHit, onEndlessMiss, onEndlessRestPassed, onEndlessRestError, onEndlessExtraHit,
  saveEndlessBest,
} from "./endless.js?v=20261127ag";
import {
  initAchievements, syncAchievementsLanguage,
  evaluateStandardRunAchievements, evaluateEndlessAchievements, evaluateRoomWinAchievement,
} from "./achievements.js";
import {
  initSuddenDeath, resetSuddenDeathRunState, renderSdLivesHud, playSuddenDeathFailSfx, checkSuddenDeathProgress,
} from "./sudden-death.js";
import {
  initLeaderboard, syncLeaderboardLanguage, recordLeaderboardRun, toggleLeaderboardBar,
} from "./leaderboard.js?v=20261128e";
import {
  initJuice, syncJuiceUi, resetJuiceCombo, onJuiceHit, onJuiceMiss, onJuiceExtraHit,
  animateScoreRollup, celebrateRankReveal,
} from "./juice.js";
import {
  initDiagnostics, syncDiagnosticsLanguage, recordDiagnosticsRun,
} from "./diagnostics.js";
import { initFeedback, syncFeedbackLanguage } from "./feedback.js";
import {
  initAudioWizard, onAudioBarShown, onAudioNoiseCalDone, syncAudioWizardLanguage,
} from "./audio-wizard.js";
import {
  cancelRushTimer, saveRushBest, clearFadeOutClasses, syncDrillUi, initDrills,
} from "./drills.js";
import {
  stopCalibration, recordCalibrationTap, finishCalibration, syncLatency, syncKeyLatency, initCalibration,
} from "./calibration.js";
import {
  PITCH_KEY_MAP, PITCH_TOP_ROW_SWALLOW,
  applyPitchToCurrentPhrase, getActivePitchKeyId, findNextPitchFreeIdx,
  handlePitchFreeStep, triggerPitchPianoKey, handleMidiNoteOn, syncPitchUi, initPitchUi,
} from "./pitch-ui.js";
import { drawDistribution, renderLog, initResultsUi } from "./results-ui.js";
import {
  syncAllDropdownBadges, syncToolsMenuBadge, syncClickVol, syncGuideUi, initToolbarMenus,
} from "./toolbar-menus.js";
import { initKeyboard } from "./keyboard.js";

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
  resetSuddenDeathRunState();
  resetJuiceCombo();
}


function abortActiveRunTracking(reason = "stop") {
  if (!app.runTrackOpen) return;
  const phase = app.state === "COUNTIN" ? "COUNTIN" : "PLAY";
  let elapsed = 0;
  const ctx = getAudioCtx();
  if (ctx && app.state === "PLAY") {
    const tsStop = getTimeSig();
    const playStartT = app.startAudioT + tsStop.countInClicks * tsStop.clickSec(app.bpm);
    elapsed = Math.max(0, ctx.currentTime - playStartT);
  }
  app.runTrackOpen = false;
  trackPracticeStop(app, elapsed, reason, phase);
}

function newPhrase(forcedSeed = null, keepDaily = false) {
  abortActiveRunTracking("new");
  cancelRushTimer(true);
  app.runSeq += 1;
  if (app.state === "CAL") stopCalibration(false);
  stopScheduledAudio();
  app.takeId += 1;
  if (keepDaily && app.endlessMode) {
    app.endlessMode = false;
    renderEndlessHud();
  }
  if (!keepDaily) {
    app.dailyDate = null;
    app.dailyPlus = false;
    app.customMode = false;
    clearShareQueryUrl();
  }
  if (app.endlessMode && !keepDaily && !forcedSeed) {
    buildEndlessPreviewPhrase();
    app.state = "READY";
    setHitBadge(t("endlessReadyBadge"), "tight");
    updateMeta();
    return;
  }
  app.phrase = generatePhrase(app.numBars, app.level, app.tripletMode, app.timeSig, forcedSeed, app.staccatoOn, app.ghostOn, app.pitchMode && !keepDaily);
  applyPitchToCurrentPhrase(false);
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
  abortActiveRunTracking("retry");
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
  app.startAudioT = ctx.currentTime + PRE_DELAY_SEC;
  app.state = demo ? "DEMO" : "COUNTIN";
  setHitBadge(demo ? t("badgeDemo") : t("badgeCountIn"), "");
  syncTransportButtons();
  app.runTrackOpen = !demo;
  trackPracticeStart(app, demo);
  if (app.endlessMode && !demo) {
    startEndlessAudioAndState(app.startAudioT);
  } else {
    resetTargets();
    scheduleRunAudio(
      app.bpm,
      (app.phrase && app.phrase.bars ? app.phrase.bars.length : app.numBars),
      app.startAudioT,
      demo ? true : app.soundOn,
      demo ? app.phrase.targets : null,
      app.timeSig,
      demo ? "OFF" : app.gapClick
    );
  }
}

function stopRun(fromRoom = false) {
  const hadRushTimer = Boolean(app.rushTimerId);
  cancelRushTimer(true);
  app.runSeq += 1;
  clearFadeOutClasses();
  if (!fromRoom) notifyRoomStopped();
  if (app.state === "CAL") {
    stopCalibration(true);
    return;
  }
  if (app.state !== "COUNTIN" && app.state !== "PLAY" && app.state !== "DEMO" && !hadRushTimer) return;
  abortActiveRunTracking("stop");
  stopScheduledAudio();
  if (app.endlessMode) {
    if (endlessState.survivedBars > 0) saveEndlessBest(endlessState.survivedBars);
    buildEndlessPreviewPhrase();
  } else {
    resetTargets();
  }
  app.state = "READY";
  setHitBadge(t("badgeStopped"), "");
  syncTransportButtons();
}

function syncTransportButtons() {
  const running = app.state === "COUNTIN" || app.state === "PLAY" || app.state === "DEMO" || app.state === "CAL";
  const guestInRoom = isRoomGuest();
  const roomBusy = isRoomPlaying();
  const btnStart = document.getElementById("btnStart");
  const btnDockStart = document.getElementById("btnDockStart");
  const btnStop = document.getElementById("btnStop");
  const btnDockStop = document.getElementById("btnDockStop");
  const btnNew = document.getElementById("btnNew");
  const btnDockNew = document.getElementById("btnDockNew");
  const btnDemo = document.getElementById("btnDemo");

  if (btnStart) {
    btnStart.disabled = guestInRoom || roomBusy;
    btnStart.title = roomBusy ? t("roomLockedPlaying") : (guestInRoom ? t("roomHostOnlyStart") : "Enter");
  }
  if (btnDockStart) {
    btnDockStart.disabled = guestInRoom || roomBusy;
    btnDockStart.title = roomBusy ? t("roomLockedPlaying") : (guestInRoom ? t("roomHostOnlyStart") : "Enter");
  }
  if (btnNew) {
    btnNew.disabled = guestInRoom || roomBusy;
    btnNew.title = roomBusy ? t("roomLockedPlaying") : (guestInRoom ? t("roomHostOnlyStart") : "n");
  }
  if (btnDockNew) {
    btnDockNew.disabled = guestInRoom || roomBusy;
  }
  const canStop = running && !roomBusy && !guestInRoom;
  btnStop.disabled = !canStop;
  btnStop.classList.toggle("danger", canStop);
  btnStop.title = roomBusy ? t("roomLockedPlaying") : "Esc";
  if (btnDockStop) {
    btnDockStop.disabled = !canStop;
    btnDockStop.classList.toggle("danger", canStop);
  }
  btnDemo.disabled = guestInRoom || roomBusy;
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

function pushLiveRoomProgress() {
  if (!isRoomPlaying() || !app.phrase) return;
  const tgts = app.phrase.targets || [];
  const total = tgts.length;
  let hits = 0, missedNotes = 0, tight = 0;
  const tw = getTimingThresholds(app.bpm);
  const errs = [];
  for (const tg of tgts) {
    if (tg.hit) {
      hits += 1;
      if (tg.errMs !== null) {
        errs.push(tg.errMs);
        if (Math.abs(tg.errMs) <= tw.tight) tight += 1;
      }
    } else if (tg.missed) {
      missedNotes += 1;
    }
  }
  const restErrs = (app.phrase.rests || []).filter(r => r.error).length;
  const doneNotes = hits + missedNotes;
  const misses = missedNotes + restErrs;
  let sd = 0;
  if (errs.length > 1) {
    const m = errs.reduce((a, b) => a + b, 0) / errs.length;
    sd = Math.sqrt(errs.reduce((s, e) => s + (e - m) ** 2, 0) / errs.length);
  }
  const det = computeDetailedScore(app.phrase, hits, total, sd, app.extraHits, restErrs, app.keyExtraHits, app.audioExtraHits);
  const acc = doneNotes > 0 ? (hits / doneNotes) * 100 : 100;
  notifyRoomLiveProgress({
    score: det.score,
    maxScore: det.maxScore,
    hits,
    total,
    doneNotes,
    misses,
    acc,
    tight,
  });
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
    const twJuice = getTimingThresholds(app.bpm);
    const aeJuice = Math.abs(best.errMs || 0);
    const tierJuice = aeJuice <= twJuice.tight ? "tight" : (aeJuice <= twJuice.ok ? "ok" : "bad");
    onJuiceHit({
      tier: tierJuice,
      isGhost: best.art === "ghost" && hitKind === "GHOST",
      pitchBad: best.pitchOk === false,
      source,
    });
    onEndlessHit(best);
  } else {
    app.extraHits += 1;
    if (source === "AUDIO") app.audioExtraHits += 1;
    else app.keyExtraHits += 1;
    onJuiceExtraHit(source);
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
      if (!hitRest.hpCounted) {
        hitRest.hpCounted = true;
        onEndlessRestError();
      }
      if (!app.blindGrade) app.dirtyScore = true;
      pushLiveRoomProgress();
      checkSuddenDeathProgress();
    } else {
      onEndlessExtraHit();
    }
    if (!app.blindGrade) {
      setHitBadge(hitRest ? `[${src}] REST ERR !` : `[${src}] EXTRA !`, "err");
    }
  }
  pushLiveRoomProgress();
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
  app.runTrackOpen = false;
  trackPracticeComplete(app, { rank: rank.grade, acc, durationSec: durSec });
  evaluateStandardRunAchievements({
    hits,
    total,
    acc,
    sd,
    bpm: app.bpm,
    level: app.level,
    rank: rank.grade,
    restCount: (app.phrase.rests || []).length,
    restErrs,
  });
  recordDiagnosticsRun({
    phrase: app.phrase,
    bpm: app.bpm,
    level: app.level,
    acc,
    sd,
    mean,
  });
  if (app.dailyDate && !isRoomPlaying()) {
    recordLeaderboardRun({
      tab: app.dailyPlus ? "dailyplus" : "daily",
      dateStr: app.dailyDate,
      score: scoreDetail.score,
      maxScore: scoreDetail.maxScore,
      bars: app.numBars,
      acc,
      sd,
      rank: rank.grade,
      bpm: app.bpm,
      level: app.level,
      inputMode: app.inputMode,
    });
  }
  notifyRoomFinish({
    score: scoreDetail.score,
    maxScore: scoreDetail.maxScore,
    acc,
    hits,
    total,
    misses: (total - hits) + restErrs,
    tight,
    mean,
    sd,
    rank: rank.grade,
    rankCls: rank.cls,
  });
  const rankEl = document.getElementById("rankBadge");
  rankEl.textContent = rank.grade;
  rankEl.className = `rank-pill ${rank.cls}`;
  celebrateRankReveal(rankEl, rank.grade);
  const scoreEl = document.getElementById("scoreBadge");
  if (scoreDetail.sustainMax > 0) {
    animateScoreRollup(scoreEl, scoreDetail.score, (val) => `${scoreDetail.noteScore.toLocaleString()} + Sus ${scoreDetail.sustainEarned.toLocaleString()} = ${val.toLocaleString()} / ${scoreDetail.maxScore.toLocaleString()}`);
  } else {
    animateScoreRollup(scoreEl, scoreDetail.score, (val) => `${val.toLocaleString()} / ${scoreDetail.maxScore.toLocaleString()}`);
  }
  const susTip = scoreDetail.sustainMax > 0 ? ` · Note ${scoreDetail.noteScore}/${scoreDetail.noteMax} + Sus ${scoreDetail.sustainEarned}/${scoreDetail.sustainMax}` : "";
  const sdTip = scoreDetail.sdBonus > 0 ? ` · SD +${scoreDetail.sdBonus}` : "";
  const penTip = scoreDetail.penalty > 0 ? ` · Pen -${scoreDetail.penalty}` : "";
  const modTipStr = scoreDetail.info.modTags.length ? ` · ${scoreDetail.info.modTags.join(", ")}` : "";
  scoreEl.title = `Score ${scoreDetail.pct.toFixed(1)}% (Meter ×${scoreDetail.info.meterMult.toFixed(2)} · BPM ×${scoreDetail.info.bpmMult.toFixed(2)}${modTipStr}${susTip}${sdTip}${penTip})`;
  scoreEl.classList.remove("hidden");
  const openLbBtn = document.getElementById("btnOpenLbFromResult");
  if (openLbBtn) openLbBtn.classList.toggle("hidden", !app.dailyDate);
  document.getElementById("btnShareResult").classList.remove("hidden");
  document.getElementById("btnBragCard").classList.remove("hidden");
  resetJuiceCombo();
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
  } else if (app.suddenDeath && !app.endlessMode && !isRoomPlaying() && !app.suddenDeathOut) {
    const left = Math.max(1, (app.suddenDeathMax || 3) - ((total - hits) + restErrs));
    setHitBadge(t("sdClearBadge", left), "tight");
  } else if (app.blindGrade) {
    const cls = acc >= 90 ? "tight" : (acc >= 70 ? "warn" : "err");
    setHitBadge(t("badgeDone", hits, total), cls);
  }
  renderSdLivesHud(false);
  syncTransportButtons();
  app.dirtyScore = true;
}

function finalizeEndlessGameOver(stats) {
  stopScheduledAudio();
  app.state = "DONE";
  app.runTrackOpen = false;
  clearFadeOutClasses();

  const isSd = stats.variant === "sd3";
  if (isSd) {
    app.suddenDeathOut = true;
    playSuddenDeathFailSfx();
    renderSdLivesHud(true);
  }

  const total = stats.hits + stats.missed;
  const acc = total ? (stats.hits / total) * 100 : 0;
  let mean = 0, sd = 0;
  if (stats.errs.length) {
    mean = stats.errs.reduce((a, b) => a + b, 0) / stats.errs.length;
    sd = Math.sqrt(stats.errs.reduce((s, e) => s + (e - mean) ** 2, 0) / stats.errs.length);
  }
  const bars = stats.survivedBars;
  const rk = bars >= 50 ? { grade: "S+", cls: "rank-sp" }
    : (bars >= 30 ? { grade: "S", cls: "rank-s" }
      : (bars >= 16 ? { grade: "A", cls: "rank-a" }
        : (bars >= 8 ? { grade: "B", cls: "rank-b" } : { grade: isSd ? "💀 OUT" : "C", cls: "rank-c" })));

  app.history.unshift({
    take: app.takeId++,
    tsIso: new Date().toISOString(),
    seed: isSd ? "SD3" : "ENDL",
    fullSeed: "",
    bpm: stats.peakBpm || app.bpm,
    bars,
    lv: app.level,
    tripletMode: tripletsAllowed() ? app.tripletMode : 0,
    staccato: app.staccatoOn,
    ghost: app.ghostOn,
    endless: true,
    daily: false,
    dailyPlus: false,
    custom: false,
    ts: app.timeSig,
    mode: app.inputMode,
    soundOn: app.soundOn,
    showBeatNums: app.showBeatNums,
    showCursor: app.showCursor,
    blindGrade: app.blindGrade,
    gapClick: app.gapClick,
    fadeBeats: app.fadeBeats,
    rushOn: false,
    rank: rk.grade,
    rankCls: rk.cls,
    score: bars * 100 + stats.maxCombo * 10,
    maxScore: bars * 100 + stats.maxCombo * 10,
    hits: stats.hits,
    total,
    acc,
    tight: stats.tight,
    mean,
    sd,
    extra: stats.extra,
    restErrs: stats.restErrs,
    susTotal: 0,
    susOk: 0,
  });
  if (app.history.length > 12) app.history.pop();
  try { localStorage.setItem("rhythm_practice_history_v1", JSON.stringify(app.history)); } catch (_) {}

  drawDistribution(stats.errs, stats.hits, total, mean, sd, stats.tight, { total: 0, ok: 0, short: 0, long: 0, restErrs: stats.restErrs }, stats.extra, stats.peakBpm || app.bpm);
  const rankEl = document.getElementById("rankBadge");
  rankEl.textContent = rk.grade;
  rankEl.className = `rank-pill ${rk.cls}`;
  celebrateRankReveal(rankEl, rk.grade);
  const scoreEl = document.getElementById("scoreBadge");
  animateScoreRollup(scoreEl, bars, (v) => `${isSd ? "💀" : "♾️"} ${v}B · Max ${stats.maxCombo}C`);
  scoreEl.classList.remove("hidden");
  const openLbBtn = document.getElementById("btnOpenLbFromResult");
  if (openLbBtn) openLbBtn.classList.remove("hidden");
  resetJuiceCombo();
  renderLog();

  const goText = isSd
    ? t("sdGameOver", bars, stats.bestBars, stats.isNewBest, stats.maxCombo, stats.peakBpm || app.bpm)
    : t("endlessGameOver", bars, stats.bestBars, stats.isNewBest, stats.maxCombo, stats.peakBpm || app.bpm);
  const msgEl = document.getElementById("endlessMsg");
  if (msgEl) {
    msgEl.style.color = stats.isNewBest ? "var(--green)" : "var(--red)";
    msgEl.textContent = goText;
  }
  setHitBadge(
    isSd
      ? `💀 OUT · ${bars}B${stats.isNewBest ? " 🏆 NEW BEST!" : ""}`
      : `💀 ${bars}B${stats.isNewBest ? " 🏆 NEW BEST!" : ""}`,
    stats.isNewBest ? "tight" : "err"
  );
  notifyRoomEndlessOut({
    survivedBars: bars,
    maxCombo: stats.maxCombo,
    hits: stats.hits,
    total,
    acc,
    tight: stats.tight,
  });
  const tsTrack = getTimeSig();
  trackPracticeComplete(app, { rank: rk.grade, acc, durationSec: Math.max(1, bars * tsTrack.clicksPerBar * tsTrack.clickSec(app.bpm)) });
  evaluateEndlessAchievements({ survivedBars: bars, hits: stats.hits });
  if (bars > 0) {
    recordLeaderboardRun({
      tab: isSd ? "endless_sd3" : "endless",
      score: bars * 100 + stats.maxCombo * 10,
      maxScore: bars * 100 + stats.maxCombo * 10,
      bars,
      acc,
      sd,
      rank: rk.grade,
      bpm: stats.peakBpm || app.bpm,
      level: app.level,
      inputMode: app.inputMode,
    });
  }
  syncTransportButtons();
  app.dirtyScore = true;
}

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
  if (app.endlessMode) {
    const isSd = isSdEndless();
    document.getElementById("metaLevel").textContent = `${isSd ? "💀 Sudden Death" : "♾️ Endless"} · ${app.timeSig} · ${baseTitle}${pitchTag} · [${playMods}]`;
    document.getElementById("metaSeed").textContent = `${isSd ? "💀" : "♾️"} Best ${isSd ? endlessState.sdBestBars : endlessState.bestBars}B`;
  } else if (app.customMode) {
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
  if (app.endlessMode) {
    maxEl.textContent = isSdEndless() ? "💀 3-Miss Survival" : "♾️ Survival";
  } else {
    maxEl.textContent = chartMax.sustainMax > 0
      ? `Max ${chartMax.noteMax.toLocaleString()} + Sus ${chartMax.sustainMax.toLocaleString()}`
      : `Max ${chartMax.maxScore.toLocaleString()}`;
  }
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
  btnBlind.classList.toggle("active", app.blindGrade);
  const btnSd = document.getElementById("btnSuddenDeath");
  if (btnSd) {
    const sdOn = Boolean(app.suddenDeath);
    const sdTxt = document.getElementById("btnSuddenDeathText");
    if (sdTxt) sdTxt.textContent = sdOn ? t("sdOn") : t("sdOff");
    else btnSd.textContent = sdOn ? t("sdOn") : t("sdOff");
    btnSd.classList.toggle("active", sdOn);
  }
  if (typeof syncAllDropdownBadges === "function") syncAllDropdownBadges();
  renderSdLivesHud(false);
  if (app.endlessMode) renderEndlessHud();

  document.getElementById("btnInKey").classList.toggle("active", app.keyOn);
  document.getElementById("btnInAudio").classList.toggle("active", app.audioOn);
  document.getElementById("btnInMidi").classList.toggle("active", app.midiOn);
  document.getElementById("btnTouchPad").classList.toggle("active", app.showTouchDock);
  document.getElementById("audioBar").classList.toggle("hidden", !app.audioOn);

  syncJuiceUi();
  syncTransportButtons();
  notifyRoomChartChanged();
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

  const taglineEl = document.getElementById("brandTagline");
  if (taglineEl) taglineEl.textContent = t("brandTagline");
  const briefEl = document.getElementById("tapHintBrief");
  if (briefEl) briefEl.innerHTML = t("tapHintBriefHtml");
  const footerDet = document.getElementById("footerDetails");
  const footerBtn = document.getElementById("btnFooterToggle");
  if (footerBtn && footerDet) {
    const opened = !footerDet.classList.contains("hidden");
    footerBtn.textContent = opened ? t("footerToggleClose") : t("footerToggleOpen");
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
  syncRoomLanguage();
  syncEndlessLanguage();
  syncAchievementsLanguage();
  syncLeaderboardLanguage();
  syncDiagnosticsLanguage();
  syncFeedbackLanguage();
  syncAudioWizardLanguage();
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
    onAudioBarShown();
    await startAudioInput();
  } else if (!app.audioOn && prevAudio) {
    stopAudioInput();
    onAudioBarShown();
  }
}

async function cycleInputMode() {
  // Keyboard shortcut '/' cycles: KEY -> AUDIO -> BOTH -> KEY
  if (app.keyOn && !app.audioOn) {
    await applyInputToggles(false, true, app.showTouchDock);
  } else if (!app.keyOn && app.audioOn) {
    await applyInputToggles(true, true, app.showTouchDock);
  } else {
    await applyInputToggles(true, false, app.showTouchDock);
  }
}

function setBpm(val) {
  abortActiveRunTracking("bpm");
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
const countinHintEl = document.getElementById("countinHint");

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
  let endlessFrameInfo = null;
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
    const isEndlessRun = Boolean(app.endlessMode && app.state !== "DEMO");
    const refBpm = isEndlessRun ? (endlessState.baseBpm || app.bpm) : app.bpm;
    const clickSec = ts.clickSec(refBpm);
    const tickSec = clickSec / ts.clickTicks;
    const countIn = ts.countInClicks * clickSec;
    const win = hitWindowSec();
    const activeNumBars = (app.phrase && app.phrase.bars ? app.phrase.bars.length : app.numBars);
    const totalClicks = ts.countInClicks + activeNumBars * ts.clicksPerBar;
    const endT = countIn + (activeNumBars * ts.barTicks) * tickSec + win;

    if (app.state === "COUNTIN" && elapsed >= countIn) {
      app.state = "PLAY";
      if (app.blindGrade) setHitBadge(t("badgeBlindPlay"), "");
    }

    if (isEndlessRun && app.state === "PLAY") {
      endlessFrameInfo = stepEndlessFrame(elapsed);
    }

    if (app.state === "COUNTIN" || app.state === "PLAY") {
      let changed = false;
      for (const tgt of app.phrase.targets) {
        if (!tgt.hit && !tgt.missed && elapsed > tgt.timeSec + win) {
          tgt.missed = true;
          changed = true;
          onJuiceMiss();
          onEndlessMiss();
        }
      }
      for (const rst of (app.phrase.rests || [])) {
        if (app.endlessMode && rst.error && !rst.hpCounted) {
          rst.hpCounted = true;
          onEndlessRestError();
        }
        if (!rst.error && !rst.passed && elapsed >= rst.endSec) {
          rst.passed = true;
          changed = true;
          onEndlessRestPassed();
        }
      }
      if (changed) {
        if (!app.blindGrade) app.dirtyScore = true;
        pushLiveRoomProgress();
      }
      checkSuddenDeathProgress();
    }

    const clickIdxNow = elapsed >= 0 ? Math.floor(elapsed / clickSec) : -1;
    const inGapMuteNow = endlessFrameInfo
      ? endlessFrameInfo.inGapMute
      : ((app.state === "PLAY" && app.gapClick !== "OFF" && clickIdxNow >= ts.countInClicks)
        && isGapBar(Math.floor((clickIdxNow - ts.countInClicks) / ts.clicksPerBar), app.gapClick));

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
      if (endlessFrameInfo) {
        const flashDur = Math.min(0.13, endlessFrameInfo.clickSec * 0.32);
        if (app.soundOn && !endlessFrameInfo.inGapMute && endlessFrameInfo.phase < flashDur) {
          ledClass = endlessFrameInfo.clickInBar === 0 ? "led-core beat1" : "led-core beatn";
        }
      } else {
        const clickIdx = clickIdxNow;
        const phase = elapsed - clickIdx * clickSec;
        const flashDur = Math.min(0.13, clickSec * 0.32);
        const ledLimit = (app.soundOn || app.state === "DEMO") ? totalClicks : ts.countInClicks;
        if (clickIdx >= 0 && clickIdx < ledLimit && phase < flashDur && !inGapMuteNow) {
          const pos = clickIdx < ts.countInClicks ? clickIdx : (clickIdx - ts.countInClicks) % ts.clicksPerBar;
          ledClass = pos === 0 ? "led-core beat1" : "led-core beatn";
        }
      }
    }

    if (!isEndlessRun && elapsed >= endT) {
      if (app.state === "DEMO") {
        stopScheduledAudio();
        app.state = "READY";
        setHitBadge(t("badgeWait"), "");
        syncTransportButtons();
      } else {
        finalizeRun();
      }
    }
  } else if (isRoomCountingDown()) {
    statusMain.textContent = getRoomCountdownText();
  } else if (app.state === "READY") {
    statusMain.textContent = t("statusReady");
  } else if (app.state === "DONE") {
    statusMain.textContent = app.suddenDeathOut ? t("sdStatusOut") : t("statusDone");
  }

  if (ledCore.className !== ledClass) ledCore.className = ledClass;

  if (countinHintEl) {
    const showRoomCd = isRoomCountingDown();
    const showHint = showRoomCd || app.state === "COUNTIN";
    if (showHint) {
      const hintTxt = showRoomCd
        ? getRoomCountdownText()
        : (app.pitchMode
          ? t("countinHintPitch")
          : (app.audioOn && !app.keyOn && !app.showTouchDock
            ? t("countinHintAudio")
            : (app.showTouchDock && !app.keyOn ? t("countinHintPad") : t("countinHintKey"))));
      if (countinHintEl.textContent !== hintTxt) countinHintEl.textContent = hintTxt;
      if (countinHintEl.classList.contains("hidden")) countinHintEl.classList.remove("hidden");
    } else if (!countinHintEl.classList.contains("hidden")) {
      countinHintEl.classList.add("hidden");
    }
  }

  if (app.dirtyScore) {
    renderScore(scoreSvg, app.phrase);
    app.dirtyScore = false;
  }

  // Optional beginner guide cursor (60 FPS lightweight SVG attribute update, default OFF)
  const cursorEl = document.getElementById("scoreCursor");
  if (cursorEl) {
    let showNow = false;
    if (app.showCursor && (app.state === "PLAY" || app.state === "DEMO") && getAudioCtx() && app.scoreLayout) {
      let bIdx = -1, tickInBar = 0;
      if (endlessFrameInfo) {
        bIdx = endlessFrameInfo.localBar;
        tickInBar = endlessFrameInfo.tickInBar;
      } else {
        const ts = getTimeSig();
        const clickSec = ts.clickSec(app.bpm);
        const tickSec = clickSec / ts.clickTicks;
        const countIn = ts.countInClicks * clickSec;
        const playElapsed = (getAudioCtx().currentTime - app.startAudioT) - countIn;
        const totalTicks = (app.phrase && app.phrase.bars ? app.phrase.bars.length : app.numBars) * ts.barTicks;
        const curTick = playElapsed / tickSec;
        if (curTick >= 0 && curTick < totalTicks) {
          bIdx = Math.floor(curTick / ts.barTicks);
          tickInBar = curTick - bIdx * ts.barTicks;
        }
      }
      if (bIdx >= 0) {
        const lay = app.scoreLayout.barLayouts[bIdx];
        if (lay) {
          const cx = lay.tickX ? lay.tickX(tickInBar) : (lay.barX0 + lay.innerPadL + (tickInBar / lay.barTicks) * lay.innerW);
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
function handleMainStartAction() {
  if (tryStartRoomRoundFromMain()) return;
  startRun(false);
}
function handleMainStopAction() {
  if (isRoomPlaying()) {
    setHitBadge(t("roomLockedPlaying"), "warn");
    return;
  }
  if (isRoomGuest()) {
    setHitBadge(t("roomHostOnlyStart"), "warn");
    return;
  }
  stopRun();
}
function handleMainNewAction() {
  if (isRoomGuest()) {
    setHitBadge(t("roomHostOnlyStart"), "warn");
    return;
  }
  if (isRoomPlaying()) return;
  newPhrase();
}
function handleMainDemoAction() {
  if (isRoomGuest()) {
    setHitBadge(t("roomHostOnlyStart"), "warn");
    return;
  }
  if (isRoomPlaying()) return;
  startRun(true);
}
document.getElementById("btnStart").addEventListener("click", handleMainStartAction);
document.getElementById("btnDockStart").addEventListener("click", handleMainStartAction);
document.getElementById("btnStop").addEventListener("click", handleMainStopAction);
document.getElementById("btnDockStop").addEventListener("click", handleMainStopAction);
document.getElementById("btnNew").addEventListener("click", handleMainNewAction);
document.getElementById("btnDockNew").addEventListener("click", handleMainNewAction);
document.getElementById("btnDemo").addEventListener("click", handleMainDemoAction);
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

document.getElementById("btnSuddenDeath").addEventListener("click", () => {
  app.suddenDeath = !app.suddenDeath;
  resetSuddenDeathRunState();
  if (app.endlessMode) {
    if (app.state === "READY" || app.state === "DONE") buildEndlessPreviewPhrase();
    const msg = document.getElementById("endlessMsg");
    if (msg) {
      msg.style.color = "var(--muted)";
      msg.textContent = app.suddenDeath ? t("sdEndlessIdleMsg") : t("endlessIdleMsg");
    }
    renderEndlessHud();
  }
  updateMeta();
  renderSdLivesHud(false);
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

const btnFooterToggle = document.getElementById("btnFooterToggle");
const footerDetails = document.getElementById("footerDetails");
if (btnFooterToggle && footerDetails) {
  btnFooterToggle.addEventListener("click", (e) => {
    e.currentTarget.blur();
    const willOpen = footerDetails.classList.contains("hidden");
    footerDetails.classList.toggle("hidden", !willOpen);
    btnFooterToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    btnFooterToggle.textContent = willOpen ? t("footerToggleClose") : t("footerToggleOpen");
  });
}

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
  if (typeof syncPitchUi === "function") syncPitchUi();
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
      if (!isRoomCountingDown()) handleMainStartAction();
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
    if (app.endlessMode && app.state === "READY") {
      buildEndlessPreviewPhrase();
    } else {
      app.dirtyScore = true;
    }
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
    onAudioNoiseCalDone();
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

// -------------------------------------------------------------------------
// 7B. Daily Challenge & Initial Score Boot
document.getElementById("btnDaily").addEventListener("click", (e) => {
  e.currentTarget.blur();
  loadDailyChallenge(null, false);
});

document.getElementById("btnDailyPlus").addEventListener("click", (e) => {
  e.currentTarget.blur();
  loadDailyChallenge(null, true);
});

function bootInitialScore() {
  const params = new URLSearchParams(location.search || "");
  if (applySeedQueryParams(params)) return;
  app.phrase = generatePhrase(app.numBars, app.level, app.tripletMode, app.timeSig, null, app.staccatoOn, app.ghostOn);
  applyPitchToCurrentPhrase();
  resetTargets();
}

// Wire cross-module callbacks cleanly before Boot
initToolbarMenus();
initDrills({ updateMeta, newPhrase, onUiChange: () => syncToolsMenuBadge() });
initCalibration({
  abortActiveRunTracking,
  resetTargets,
  setHitBadge,
  syncTransportButtons,
  onUiChange: () => syncToolsMenuBadge(),
});
initPitchUi({
  resetTargets,
  stopRun,
  updateMeta,
  setHitBadge,
  handleHit,
  recordCalibrationTap,
  onUiChange: () => syncToolsMenuBadge(),
});
initResultsUi({
  loadDailyChallenge,
  loadCustomFromInput,
  applyFullSeedObj,
  setHitBadge,
  onOpenLeaderboard: () => {
    const targetTab = app.endlessMode
      ? (app.suddenDeath ? "endless_sd3" : "endless")
      : (app.dailyDate ? (app.dailyPlus ? "dailyplus" : "daily") : "daily");
    toggleLeaderboardBar(true, targetTab);
    document.getElementById("lbBar")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
});
initKeyboard({
  PITCH_KEY_MAP,
  PITCH_TOP_ROW_SWALLOW,
  triggerPitchPianoKey,
  closeTour,
  nextTourStep,
  prevTourStep,
  recordCalibrationTap,
  handleHit,
  closeKeyStaccato,
  isRoomCountingDown,
  handleMainStartAction,
  handleMainStopAction,
  handleMainNewAction,
  handleMainDemoAction,
  setBpm,
  setLevel,
  updateMeta,
  newPhrase,
  setHitBadge,
  cycleInputMode,
  syncThreshold,
  syncLatency,
});

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
const arrivedViaSharedLink = ["seed", "daily", "dailyplus", "custom", "room"].some(k => bootParams.has(k));
if (bootParams.has("ref")) {
  trackRefVisit(bootParams.get("ref"));
}
window.addEventListener("pagehide", () => abortActiveRunTracking("unload"));
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
initRoom({
  applyRoomChart: (chart) => {
    if (!chart) return;
    if (chart.opts && typeof chart.opts === "object") {
      if (typeof chart.opts.soundOn === "boolean") app.soundOn = chart.opts.soundOn;
      if (typeof chart.opts.showBeatNums === "boolean") app.showBeatNums = chart.opts.showBeatNums;
      if (typeof chart.opts.showCursor === "boolean") app.showCursor = chart.opts.showCursor;
      if (typeof chart.opts.blindGrade === "boolean") app.blindGrade = chart.opts.blindGrade;
      if (typeof chart.opts.suddenDeath === "boolean") app.suddenDeath = chart.opts.suddenDeath;
      if (typeof chart.opts.gapClick === "string") app.gapClick = chart.opts.gapClick;
      if (Number.isFinite(Number(chart.opts.fadeBeats))) app.fadeBeats = Number(chart.opts.fadeBeats);
    }
    if (chart.customCode) {
      if (Number.isFinite(Number(chart.bpm))) {
        app.bpm = Math.max(40, Math.min(180, Math.round(Number(chart.bpm))));
      }
      loadCustomFromInput(chart.customCode);
    } else if (chart.seedCode) {
      const cfg = decodeFullSeedCode(chart.seedCode);
      if (cfg) applyFullSeedObj(cfg);
    }
    app.dirtyScore = true;
    syncDrillUi();
    updateMeta();
  },
  setRoomEndlessMode: (enabled, streamSeed) => {
    setEndlessStreamSeed(streamSeed);
    if (Boolean(enabled) !== app.endlessMode) {
      setEndlessMode(Boolean(enabled));
    } else if (enabled) {
      buildEndlessPreviewPhrase();
    }
    renderSdLivesHud(false);
  },
  triggerRoomStart: (endlessSeed = null) => {
    setEndlessStreamSeed(endlessSeed);
    startRun(false);
  },
  unlockAudio: () => ensureAudioCtx(),
  isAudioRunning: () => isAudioCtxRunning(),
  playCountdownBeep: (sec) => {
    const ctx = ensureAudioCtx();
    if (ctx && app.clickVol > 0) {
      scheduleClick(ctx, ctx.currentTime + 0.01, sec === 1 ? 1046.5 : 659.25, 0.18);
    }
  },
  onRoomWin: (playerCount) => evaluateRoomWinAchievement(playerCount),
  onRoomStateChange: () => {
    syncTransportButtons();
    renderSdLivesHud(false);
  },
  stopRun: () => stopRun(true),
  newPhrase,
  setHitBadge,
  updateMeta,
});

// Automatically unlock Web Audio on ANY first user click/tap/keypress so room guests always hear countdown & metronome
const unlockAudioOnFirstGesture = () => {
  if (!isAudioCtxRunning()) {
    ensureAudioCtx();
    refreshRoomAudioBanner();
  }
};
window.addEventListener("pointerdown", unlockAudioOnFirstGesture, { capture: true, passive: true });
window.addEventListener("keydown", unlockAudioOnFirstGesture, { capture: true, passive: true });
onAudioStateChange(() => refreshRoomAudioBanner());
initEndless({
  onGameOver: finalizeEndlessGameOver,
  onHudUpdate: (es) => {
    const tot = es.totalHits + es.totalMissed;
    notifyRoomEndlessProgress({
      survivedBars: es.survivedBars,
      hp: es.hp,
      combo: es.combo,
      hits: es.totalHits,
      total: tot,
      acc: tot ? (es.totalHits / tot) * 100 : 100,
      tight: es.totalTight,
    });
  },
  setHitBadge,
  updateMeta,
  stopRun,
  newPhrase,
});
initAchievements({
  onUiChange: () => syncToolsMenuBadge(),
  playUnlockChime: () => {
    const ctx = ensureAudioCtx();
    if (ctx && app.clickVol > 0) {
      const t0 = ctx.currentTime + 0.02;
      scheduleClick(ctx, t0, 880, 0.18);
      scheduleClick(ctx, t0 + 0.11, 1318.51, 0.22);
    }
  },
  onDataRestored: () => {
    try {
      const rawHist = localStorage.getItem("rhythm_practice_history_v1");
      if (rawHist) {
        const parsed = JSON.parse(rawHist);
        if (Array.isArray(parsed)) app.history = parsed.slice(0, 12);
      }
    } catch (_) {}
    renderLog();
    renderEndlessHud();
    updateMeta();
  },
});
initSuddenDeath({
  isSdEndless,
  getEndlessLives: () => ({ lives: endlessState.lives, maxLives: endlessState.maxLives }),
  isRoomActive,
  isRoomSuddenDeath,
  isRoomPlaying,
  cancelRushTimer,
  clearFadeOutClasses,
  abortActiveRunTracking,
  drawDistribution,
  renderLog,
  setHitBadge,
  syncTransportButtons,
});
initLeaderboard({
  onUiChange: () => syncToolsMenuBadge(),
  setHitBadge,
});
initJuice({
  updateMeta,
});
initDiagnostics({
  onUiChange: () => syncToolsMenuBadge(),
  onApplyWeaknessDrill: (weak) => {
    if (isRoomPlaying() || isRoomGuest()) return;
    if (app.endlessMode) setEndlessMode(false);
    app.dailyDate = null;
    app.dailyPlus = false;
    app.customMode = false;
    app.level = Math.max(1, Math.min(6, weak.drill.level || app.level));
    app.tripletMode = weak.drill.tripletMode || 0;
    newPhrase();
    setHitBadge(t("diagDrillApplied", weak.label, app.level), "tight");
  },
  setHitBadge,
});
initFeedback({
  onUiChange: () => syncToolsMenuBadge(),
  setHitBadge,
});
initAudioWizard({
  startAudioInput,
  triggerNoiseCal: () => document.getElementById("btnNoiseCal")?.click(),
  syncGain,
  setHitBadge,
});
syncToolsMenuBadge();
renderLog();
requestAnimationFrame(frame);
if (!hasSeenTour() && !arrivedViaSharedLink) {
  window.setTimeout(() => openTour(0), 260);
}
