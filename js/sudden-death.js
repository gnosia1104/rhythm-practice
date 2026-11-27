// Sudden Death (3-Miss Elimination) Module
// Manages live 3-hearts HUD (#metaSdLives), miss tracking, KO sound effect, and fixed-bar elimination.
// Composes cleanly with both regular fixed-bar practice and Endless 2-line survival mode.
import { t } from "./i18n.js";
import { app, currentFullSeedCode, tripletsAllowed } from "./state.js";
import { computeDetailedScore, getTimingThresholds } from "./scoring.js";
import { ensureAudioCtx, scheduleBassNote, stopScheduledAudio } from "./audio-out.js";

let lastSdMisses = 0;

let cbs = {
  isSdEndless: () => false,
  getEndlessLives: () => ({ lives: 3, maxLives: 3 }),
  isRoomActive: () => false,
  isRoomSuddenDeath: () => false,
  isRoomPlaying: () => false,
  cancelRushTimer: () => {},
  clearFadeOutClasses: () => {},
  abortActiveRunTracking: () => {},
  drawDistribution: () => {},
  renderLog: () => {},
  setHitBadge: () => {},
  syncTransportButtons: () => {},
};

export function initSuddenDeath(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };
}

export function resetSuddenDeathRunState() {
  app.suddenDeathOut = false;
  lastSdMisses = 0;
  renderSdLivesHud(false);
}

export function isSuddenDeathActive() {
  if (cbs.isSdEndless()) return true;
  if (cbs.isRoomActive()) return cbs.isRoomSuddenDeath();
  return Boolean(app.suddenDeath);
}

export function countCurrentMisses() {
  if (cbs.isSdEndless()) {
    const { lives, maxLives } = cbs.getEndlessLives();
    return Math.max(0, (maxLives || 3) - (lives ?? 3));
  }
  if (!app.phrase) return 0;
  const missedNotes = (app.phrase.targets || []).filter(tg => tg.missed).length;
  const restErrs = (app.phrase.rests || []).filter(r => r.error).length;
  return missedNotes + restErrs;
}

export function renderSdLivesHud(shake = false) {
  const el = document.getElementById("metaSdLives");
  if (!el) return;
  const active = isSuddenDeathActive();
  el.classList.toggle("hidden", !active);
  if (!active) return;

  const isInfSd = cbs.isSdEndless();
  const { lives, maxLives } = cbs.getEndlessLives();
  const cap = isInfSd ? (maxLives || 3) : (app.suddenDeathMax || 3);
  const left = app.suddenDeathOut
    ? 0
    : (isInfSd ? Math.max(0, lives ?? cap) : Math.max(0, cap - countCurrentMisses()));
  if (left <= 0) {
    el.textContent = "💀 OUT";
  } else {
    const hearts = "❤️".repeat(left) + "🖤".repeat(Math.max(0, cap - left));
    el.textContent = `💀 ${hearts}`;
  }
  el.classList.toggle("warn", left === 1);
  el.classList.toggle("out", left === 0);
  if (shake) {
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }
}

export function playSuddenDeathFailSfx() {
  const ctx = ensureAudioCtx();
  if (!ctx || app.clickVol <= 0) return;
  const t0 = ctx.currentTime + 0.01;
  scheduleBassNote(ctx, t0, 0.16, 220.0);
  scheduleBassNote(ctx, t0 + 0.16, 0.28, 146.83);
}

export function triggerSoloSuddenDeathOut() {
  if (app.suddenDeathOut || cbs.isRoomPlaying()) return;
  app.suddenDeathOut = true;
  cbs.cancelRushTimer(true);
  stopScheduledAudio();
  cbs.clearFadeOutClasses();
  app.state = "DONE";
  cbs.abortActiveRunTracking("sd_out");
  playSuddenDeathFailSfx();
  renderSdLivesHud(true);

  const tgts = (app.phrase && app.phrase.targets) || [];
  const total = tgts.length;
  const hitTgts = tgts.filter(tg => tg.hit);
  const hits = hitTgts.length;
  const errs = hitTgts.map(tg => tg.errMs).filter(e => e !== null);
  const tw = getTimingThresholds(app.bpm);
  const tight = errs.filter(e => Math.abs(e) <= tw.tight).length;
  const acc = total ? (hits / total) * 100 : 0;
  let mean = 0, sd = 0;
  if (errs.length) {
    mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    sd = Math.sqrt(errs.reduce((s, e) => s + (e - mean) ** 2, 0) / errs.length);
  }
  const restErrs = (app.phrase && app.phrase.rests ? app.phrase.rests : []).filter(r => r.error).length;
  const scoreDetail = computeDetailedScore(app.phrase, hits, total, sd, app.extraHits, restErrs, app.keyExtraHits, app.audioExtraHits);
  app.history.unshift({
    take: app.takeId++,
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
    rank: "💀 OUT",
    rankCls: "rank-c",
    score: scoreDetail.score,
    maxScore: scoreDetail.maxScore,
    ptsPerBar: Math.round(scoreDetail.score / Math.max(1, app.numBars)),
    hits, total, acc, tight, mean, sd, extra: app.extraHits, restErrs,
    susTotal: 0, susOk: 0,
  });
  if (app.history.length > 12) app.history.pop();
  try { localStorage.setItem("rhythm_practice_history_v1", JSON.stringify(app.history)); } catch (_) {}

  cbs.drawDistribution(errs, hits, total, mean, sd, tight, { total: 0, ok: 0, short: 0, long: 0, restErrs }, app.extraHits);
  const rankEl = document.getElementById("rankBadge");
  if (rankEl) {
    rankEl.textContent = "💀 OUT";
    rankEl.className = "rank-pill rank-c";
  }
  const scoreEl = document.getElementById("scoreBadge");
  if (scoreEl) {
    scoreEl.textContent = `${scoreDetail.score.toLocaleString()} / ${scoreDetail.maxScore.toLocaleString()}`;
  }
  cbs.renderLog();
  cbs.setHitBadge(t("sdOutBadge"), "err");
  cbs.syncTransportButtons();
  app.dirtyScore = true;
}

export function checkSuddenDeathProgress() {
  if (!isSuddenDeathActive()) return;
  if (app.state !== "COUNTIN" && app.state !== "PLAY") return;
  const misses = countCurrentMisses();
  if (misses !== lastSdMisses) {
    const increased = misses > lastSdMisses;
    lastSdMisses = misses;
    renderSdLivesHud(increased);
    // Infinite Sudden Death elimination is handled inside endless.js -> finalizeEndlessGameOver
    if (!app.endlessMode && !cbs.isRoomPlaying() && misses >= (app.suddenDeathMax || 3)) {
      triggerSoloSuddenDeathOut();
    }
  }
}
