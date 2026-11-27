// Endless Arcade Survival Mode — 2-Line Double-Buffered Infinite Sight-Reading
// Zero audio clock drift (rolling look-ahead Web Audio scheduler), zero ties across line boundaries,
// smooth halfway line swaps, HP gauge, combo counter, optional BPM escalation, and local best record.
import { t } from "./i18n.js";
import { TIME_SIGS, generatePhrase } from "./rhythm.js";
import { app, getTimeSig, isGapBar } from "./state.js";
import { getTimingThresholds } from "./scoring.js";
import { assignPitchesToPhrase } from "./pitch-gen.js";
import { ensureAudioCtx, getAudioCtx, scheduleClick, scheduleBarGroove } from "./audio-out.js";

const ENDLESS_BEST_KEY = "rhythm_practice_endless_best_v1";
const SD_BEST_KEY = "rhythm_practice_sd_best_v1";

let cbs = {
  onGameOver: () => {},
  onHudUpdate: () => {},
  setHitBadge: () => {},
  updateMeta: () => {},
  stopRun: () => {},
  newPhrase: () => {},
};

export const endlessState = {
  variant: "hp",            // "hp" (Endless HP Survival) | "sd3" (Sudden Death 3-Miss Infinite)
  slotBars: 4,              // 4 bars per line on desktop (2 on narrow/5/4) -> always 2 lines on screen
  streamSeed: null,         // optional deterministic seed for synced Multiplayer Room Endless/SD Survival
  hp: 100,
  lives: 3,
  maxLives: 3,
  combo: 0,
  maxCombo: 0,
  survivedBars: 0,
  bestBars: 0,
  sdBestBars: 0,
  baseBpm: 60,
  curBpm: 60,
  nextGlobalBar: 0,
  nextBarStartSec: 0,       // cumulative elapsed seconds from app.startAudioT
  scheduledUntilBar: -1,    // highest globalBar whose metronome clicks are already scheduled
  barTimeline: [],          // active/upcoming bar timing entries { globalBar, startSec, endSec, clickSec, tickSec, bpm, slotIdx, localBar }
  slotLineNum: [0, 1],      // monotonic line index currently residing in Slot 0 / Slot 1
  slotStarts: [1, 5],       // 1-based measure numbers shown at left of Slot 0 / Slot 1
  activeSlot: 0,
  freshSlot: -1,
  freshClearTimerId: null,
  lastSwappedAtLine: -1,
  // Cumulative run stats (preserved across line swaps for final summary & timing scatter plot)
  totalHits: 0,
  totalMissed: 0,
  totalTight: 0,
  totalRestErrs: 0,
  totalExtra: 0,
  allErrs: [],
  gameOverTriggered: false,
};

export function isSdEndless() {
  return Boolean(app.endlessMode && app.suddenDeath);
}

function loadBestByKey(key) {
  try {
    const v = Number(localStorage.getItem(key) || "0");
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch (_) {
    return 0;
  }
}

export function saveEndlessBest(bars) {
  const b = Math.max(0, Math.floor(Number(bars) || 0));
  if (app.suddenDeath) {
    if (b > endlessState.sdBestBars) {
      endlessState.sdBestBars = b;
      try { localStorage.setItem(SD_BEST_KEY, String(b)); } catch (_) {}
      return true;
    }
    return false;
  }
  if (b > endlessState.bestBars) {
    endlessState.bestBars = b;
    try { localStorage.setItem(ENDLESS_BEST_KEY, String(b)); } catch (_) {}
    return true;
  }
  return false;
}

function chooseSlotBars() {
  const isNarrow = window.innerWidth <= 640;
  if (isNarrow || app.timeSig === "5/4") return 2;
  return 4;
}

function buildLineChunk(slotIdx, startGlobalBar, startSec, bpmForLine, effLevel) {
  const slotBars = endlessState.slotBars;
  const ts = getTimeSig();
  const clickSec = ts.clickSec(bpmForLine);
  const tickSec = clickSec / ts.clickTicks;
  const barSec = ts.clicksPerBar * clickSec;
  const seed = Number.isFinite(endlessState.streamSeed)
    ? ((((endlessState.streamSeed * 2654435761) ^ ((startGlobalBar + 1) * 2246822519)) >>> 0) % 0xEFFF) + 0x1000
    : ((Math.floor(Math.random() * 0xEFFF) + 0x1000) & 0xFFFF);
  const chunk = generatePhrase(slotBars, effLevel, app.tripletMode, app.timeSig, seed, app.staccatoOn, app.ghostOn, app.pitchMode);
  if (app.pitchMode) {
    assignPitchesToPhrase(chunk, app.pitchKey, app.pitchProg, app.pitchClef);
  }

  const baseBarOffset = slotIdx * slotBars;
  const lineBars = chunk.bars; // array of slotBars bars (no ties crossing line boundaries!)
  const totalSlotsInLine = slotBars * ts.barTicks;

  const lineTargets = chunk.targets.map((tgt, idx) => {
    const nextTgt = chunk.targets[idx + 1];
    const gapSlots = nextTgt
      ? Math.max(0, nextTgt.globalSlot - (tgt.globalSlot + tgt.durSlots))
      : Math.max(0, totalSlotsInLine - (tgt.globalSlot + tgt.durSlots));
    const timeSec = startSec + tgt.globalSlot * tickSec;
    const durSec = tgt.durSlots * tickSec;
    const endSec = timeSec + durSec;
    return {
      ...tgt,
      bar: baseBarOffset + tgt.bar,
      globalBar: startGlobalBar + tgt.bar,
      globalSlot: (baseBarOffset + tgt.bar) * ts.barTicks + tgt.beat * ts.beatTicks + tgt.slotInBeat,
      slotIdx,
      timeSec,
      durSec,
      endSec,
      hasRestAfter: gapSlots >= 1,
      restEndSec: endSec + gapSlots * tickSec,
      hit: false,
      missed: false,
      errMs: null,
      hitSource: null,
      hitTimeSec: null,
      sustainFloor: 0,
      quietFrames: 0,
      lastAudibleSec: null,
      sustainEndSec: null,
      sustainRatio: null,
      sustainStatus: null,
      bleedMs: 0,
      sustainDone: false,
      peakLevel: 0,
      ghostHeldMs: null,
      ghostWrongKey: false,
      pitchOk: null,
      detectedPitch: null,
      pitchCents: null,
      hadWrongTry: false,
    };
  });

  const lineRests = (chunk.rests || []).map((rst) => ({
    ...rst,
    bar: baseBarOffset + rst.bar,
    globalBar: startGlobalBar + rst.bar,
    globalSlot: (baseBarOffset + rst.bar) * ts.barTicks + rst.beat * ts.beatTicks + rst.slotInBeat,
    slotIdx,
    timeSec: startSec + rst.globalSlot * tickSec,
    endSec: startSec + (rst.globalSlot + rst.durSlots) * tickSec,
    error: false,
    passed: false,
    errorKind: null,
    ringFrames: 0,
    hpCounted: false,
  }));

  const timelineEntries = [];
  for (let i = 0; i < slotBars; i++) {
    const bStart = startSec + i * barSec;
    timelineEntries.push({
      globalBar: startGlobalBar + i,
      startSec: bStart,
      endSec: bStart + barSec,
      clickSec,
      tickSec,
      bpm: bpmForLine,
      slotIdx,
      localBar: baseBarOffset + i,
    });
  }

  return {
    bars: lineBars,
    targets: lineTargets,
    rests: lineRests,
    pitchMeta: chunk.pitchMeta || null,
    timelineEntries,
    nextStartSec: startSec + slotBars * barSec,
  };
}

export function buildEndlessPreviewPhrase() {
  const slotBars = chooseSlotBars();
  endlessState.slotBars = slotBars;
  endlessState.hp = 100;
  endlessState.lives = endlessState.maxLives;
  endlessState.combo = 0;
  endlessState.maxCombo = 0;
  endlessState.survivedBars = 0;
  endlessState.baseBpm = app.bpm;
  endlessState.curBpm = app.bpm;
  endlessState.activeSlot = 0;
  endlessState.freshSlot = -1;
  endlessState.slotLineNum = [0, 1];
  endlessState.slotStarts = [1, slotBars + 1];
  endlessState.lastSwappedAtLine = -1;
  endlessState.totalHits = 0;
  endlessState.totalMissed = 0;
  endlessState.totalTight = 0;
  endlessState.totalRestErrs = 0;
  endlessState.totalExtra = 0;
  endlessState.allErrs = [];
  endlessState.gameOverTriggered = false;

  const ts = getTimeSig();
  const countInSec = ts.countInClicks * ts.clickSec(app.bpm);
  const c0 = buildLineChunk(0, 0, countInSec, app.bpm, app.level);
  const c1 = buildLineChunk(1, slotBars, c0.nextStartSec, app.bpm, app.level);

  endlessState.nextGlobalBar = slotBars * 2;
  endlessState.nextBarStartSec = c1.nextStartSec;
  endlessState.barTimeline = [...c0.timelineEntries, ...c1.timelineEntries];
  endlessState.scheduledUntilBar = -1;

  app.phrase = {
    seed: (Math.floor(Math.random() * 0xEFFF) + 0x1000) & 0xFFFF,
    timeSig: app.timeSig,
    numBars: slotBars * 2,
    bars: [...c0.bars, ...c1.bars],
    targets: [...c0.targets, ...c1.targets],
    rests: [...c0.rests, ...c1.rests],
    pitchMeta: c0.pitchMeta || c1.pitchMeta || null,
    endless: true,
    endlessSlotBars: slotBars,
    endlessActiveSlot: 0,
    endlessFreshSlot: -1,
    endlessSlotStarts: [1, slotBars + 1],
  };
  app.dirtyScore = true;
  renderEndlessHud();
}

function scheduleEndlessClicksAhead(elapsedSec) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const ts = getTimeSig();
  const horizonSec = elapsedSec + 8.0; // Always keep ~8 seconds of clicks scheduled ahead on hardware clock

  for (const b of endlessState.barTimeline) {
    if (b.globalBar <= endlessState.scheduledUntilBar) continue;
    if (b.startSec > horizonSec) break;
    endlessState.scheduledUntilBar = b.globalBar;
    if (!app.soundOn) continue;
    if (isGapBar(b.globalBar, app.gapClick)) continue;
    scheduleBarGroove(ctx, app.startAudioT + b.startSec, app.timeSig, b.clickSec, Boolean(app.drumBacking));
  }
}

export function setEndlessStreamSeed(seed = null) {
  endlessState.streamSeed = Number.isFinite(Number(seed)) ? (Number(seed) & 0xFFFF) : null;
}

export function startEndlessAudioAndState(startAudioT, forcedStreamSeed = undefined) {
  if (forcedStreamSeed !== undefined) {
    setEndlessStreamSeed(forcedStreamSeed);
  }
  buildEndlessPreviewPhrase();
  const ctx = ensureAudioCtx();
  const ts = getTimeSig();
  const clickSec = ts.clickSec(app.bpm);
  // Schedule count-in clicks on exact hardware audio clock
  for (let c = 0; c < ts.countInClicks; c++) {
    const isDownbeat = c === 0;
    const isSubAcc = !isDownbeat && ts.subAcc.includes(c);
    const freq = isDownbeat ? 1318.51 : (isSubAcc ? 1046.50 : 880.0);
    const amp = isDownbeat ? 0.32 : (isSubAcc ? 0.25 : 0.20);
    scheduleClick(ctx, startAudioT + c * clickSec, freq, amp);
  }
  scheduleEndlessClicksAhead(0);
  renderEndlessHud();
}

function swapSlot(slotToReplace) {
  if (!app.phrase || !app.phrase.endless) return;
  const slotBars = endlessState.slotBars;
  const startG = endlessState.nextGlobalBar;
  const lineIndex = Math.floor(startG / slotBars);

  const nextBpm = endlessState.baseBpm;
  endlessState.curBpm = nextBpm;

  const chunk = buildLineChunk(slotToReplace, startG, endlessState.nextBarStartSec, nextBpm, app.level);
  endlessState.nextGlobalBar = startG + slotBars;
  endlessState.nextBarStartSec = chunk.nextStartSec;
  endlessState.barTimeline.push(...chunk.timelineEntries);
  // Prune old timeline entries far in the past to keep O(1) memory forever
  while (endlessState.barTimeline.length > slotBars * 4) {
    endlessState.barTimeline.shift();
  }

  const baseBarOffset = slotToReplace * slotBars;
  for (let i = 0; i < slotBars; i++) {
    app.phrase.bars[baseBarOffset + i] = chunk.bars[i];
  }

  // Replace only targets & rests belonging to slotToReplace (never touching the active playing slot!)
  const otherTargets = app.phrase.targets.filter((tg) => tg.slotIdx !== slotToReplace);
  const otherRests = (app.phrase.rests || []).filter((r) => r.slotIdx !== slotToReplace);
  app.phrase.targets = [...otherTargets, ...chunk.targets].sort((a, b) => a.timeSec - b.timeSec);
  app.phrase.rests = [...otherRests, ...chunk.rests].sort((a, b) => a.timeSec - b.timeSec);

  endlessState.slotLineNum[slotToReplace] = lineIndex;
  endlessState.slotStarts[slotToReplace] = startG + 1;
  endlessState.freshSlot = slotToReplace;
  app.phrase.endlessSlotStarts = [...endlessState.slotStarts];
  app.phrase.endlessFreshSlot = slotToReplace;
  app.dirtyScore = true;

  if (endlessState.freshClearTimerId) window.clearTimeout(endlessState.freshClearTimerId);
  endlessState.freshClearTimerId = window.setTimeout(() => {
    endlessState.freshClearTimerId = null;
    endlessState.freshSlot = -1;
    if (app.phrase) app.phrase.endlessFreshSlot = -1;
  }, 550);
}

function triggerEndlessGameOver() {
  if (endlessState.gameOverTriggered) return;
  endlessState.gameOverTriggered = true;
  const sdMode = Boolean(app.suddenDeath);
  const isNewBest = saveEndlessBest(endlessState.survivedBars);
  renderEndlessHud();
  cbs.onGameOver({
    variant: sdMode ? "sd3" : "hp",
    survivedBars: endlessState.survivedBars,
    bestBars: sdMode ? endlessState.sdBestBars : endlessState.bestBars,
    isNewBest,
    maxCombo: endlessState.maxCombo,
    hits: endlessState.totalHits,
    missed: endlessState.totalMissed,
    tight: endlessState.totalTight,
    restErrs: endlessState.totalRestErrs,
    extra: endlessState.totalExtra,
    errs: [...endlessState.allErrs],
    peakBpm: endlessState.curBpm,
  });
}

function loseSdLife() {
  if (!app.endlessMode || endlessState.gameOverTriggered) return;
  endlessState.lives = Math.max(0, endlessState.lives - 1);
  endlessState.hp = Math.round((endlessState.lives / endlessState.maxLives) * 100);
  renderEndlessHud();
  cbs.onHudUpdate(endlessState);
  if (endlessState.lives <= 0) {
    triggerEndlessGameOver();
  }
}

function adjustHp(delta) {
  if (!app.endlessMode || endlessState.gameOverTriggered) return;
  if (app.suddenDeath) return;
  endlessState.hp = Math.max(0, Math.min(100, endlessState.hp + delta));
  renderEndlessHud();
  cbs.onHudUpdate(endlessState);
  if (endlessState.hp <= 0) {
    triggerEndlessGameOver();
  }
}

export function onEndlessHit(tgt) {
  if (!app.endlessMode || !tgt) return;
  const tw = getTimingThresholds(endlessState.curBpm || app.bpm);
  const ae = Math.abs(tgt.errMs || 0);
  endlessState.totalHits += 1;
  if (Number.isFinite(tgt.errMs)) endlessState.allErrs.push(tgt.errMs);

  if (tgt.pitchOk === false) {
    endlessState.combo = 0;
    if (app.suddenDeath) loseSdLife();
    else adjustHp(-7);
    return;
  }
  if (ae <= tw.tight) {
    endlessState.totalTight += 1;
    endlessState.combo += 1;
    if (endlessState.combo > endlessState.maxCombo) endlessState.maxCombo = endlessState.combo;
    if (app.suddenDeath) { renderEndlessHud(); cbs.onHudUpdate(endlessState); }
    else adjustHp(3.5);
  } else if (ae <= tw.ok) {
    endlessState.combo += 1;
    if (endlessState.combo > endlessState.maxCombo) endlessState.maxCombo = endlessState.combo;
    if (app.suddenDeath) { renderEndlessHud(); cbs.onHudUpdate(endlessState); }
    else adjustHp(1.5);
  } else {
    endlessState.combo = 0;
    if (app.suddenDeath) { renderEndlessHud(); cbs.onHudUpdate(endlessState); }
    else adjustHp(-3);
  }
}

export function onEndlessMiss() {
  if (!app.endlessMode) return;
  endlessState.totalMissed += 1;
  endlessState.combo = 0;
  if (app.suddenDeath) loseSdLife();
  else adjustHp(-14);
}

export function onEndlessRestPassed() {
  if (!app.endlessMode) return;
  if (app.suddenDeath) return; // Sudden Death: zero HP healing!
  adjustHp(1.0);
}

export function onEndlessRestError() {
  if (!app.endlessMode) return;
  endlessState.totalRestErrs += 1;
  endlessState.combo = 0;
  if (app.suddenDeath) loseSdLife();
  else adjustHp(-10);
}

export function onEndlessExtraHit() {
  if (!app.endlessMode) return;
  endlessState.totalExtra += 1;
  endlessState.combo = 0;
  if (app.suddenDeath) { renderEndlessHud(); return; }
  adjustHp(-4);
}

export function stepEndlessFrame(elapsedSec) {
  if (!app.endlessMode || !app.phrase || !app.phrase.endless || endlessState.gameOverTriggered) return null;

  scheduleEndlessClicksAhead(elapsedSec);

  // Locate current bar in rolling barTimeline
  let curBar = null;
  for (const b of endlessState.barTimeline) {
    if (elapsedSec >= b.startSec && elapsedSec < b.endSec) {
      curBar = b;
      break;
    }
  }
  if (!curBar) return null;

  // Update survived bar count every time a bar completes
  if (curBar.globalBar > endlessState.survivedBars) {
    endlessState.survivedBars = curBar.globalBar;
    saveEndlessBest(endlessState.survivedBars);
    renderEndlessHud();
    cbs.onHudUpdate(endlessState);
  }

  // Update live BPM display when escalation steps up into a new bar
  if (curBar.bpm !== app.bpm) {
    app.bpm = curBar.bpm;
    const bpmVal = document.getElementById("bpmVal");
    const bpmSl = document.getElementById("bpmSlider");
    const metaT = document.getElementById("metaTempo");
    if (bpmVal) bpmVal.textContent = String(app.bpm);
    if (bpmSl) bpmSl.value = String(app.bpm);
    if (metaT) metaT.textContent = getTimeSig().compound ? `♩. = ${app.bpm}` : `♩ = ${app.bpm}`;
  }

  // Update active line marker
  if (curBar.slotIdx !== endlessState.activeSlot) {
    endlessState.activeSlot = curBar.slotIdx;
    app.phrase.endlessActiveSlot = curBar.slotIdx;
    app.dirtyScore = true;
  }

  // Double-buffering halfway swap trigger:
  // Once we reach the second half of the currently playing line (lineIndex >= 1),
  // seamlessly swap out the OTHER (already-finished) line with fresh upcoming bars!
  const slotBars = endlessState.slotBars;
  const curLineIdx = Math.floor(curBar.globalBar / slotBars);
  const posInSlot = curBar.globalBar % slotBars;
  const swapTriggerPos = Math.max(1, Math.floor(slotBars / 2));
  if (curLineIdx >= 1 && posInSlot >= swapTriggerPos && curLineIdx > endlessState.lastSwappedAtLine) {
    endlessState.lastSwappedAtLine = curLineIdx;
    const otherSlot = 1 - curBar.slotIdx;
    swapSlot(otherSlot);
    scheduleEndlessClicksAhead(elapsedSec);
  }

  // Return active bar timing info so main.js can animate LED & optional cursor with zero drift!
  const ts = getTimeSig();
  const inBarElapsed = elapsedSec - curBar.startSec;
  const clickInBar = Math.floor(inBarElapsed / curBar.clickSec);
  const phase = inBarElapsed - clickInBar * curBar.clickSec;
  const tickInBar = inBarElapsed / curBar.tickSec;
  return {
    globalBar: curBar.globalBar,
    localBar: curBar.localBar,
    clickInBar,
    clickSec: curBar.clickSec,
    phase,
    tickInBar,
    inGapMute: isGapBar(curBar.globalBar, app.gapClick),
  };
}

export function renderEndlessHud() {
  const btn = document.getElementById("btnEndless");
  const btnTxt = document.getElementById("btnEndlessText");
  const bar = document.getElementById("endlessBar");
  const sdMode = Boolean(app.suddenDeath);
  if (btn) btn.classList.toggle("active", app.endlessMode);
  if (btnTxt) btnTxt.textContent = `${t("btnEndless")} ${app.endlessMode ? "ON" : "OFF"}`;
  if (!bar) return;
  bar.classList.toggle("hidden", !app.endlessMode);
  bar.classList.toggle("is-sd", app.endlessMode && sdMode);
  if (!app.endlessMode) return;

  const lbl = document.getElementById("lblEndlessTitle");
  if (lbl) lbl.textContent = sdMode ? t("sdEndlessTitle") : t("endlessTitle");

  const hpPct = sdMode
    ? Math.round((endlessState.lives / endlessState.maxLives) * 100)
    : Math.round(endlessState.hp);
  const hpFill = document.getElementById("endlessHpFill");
  const hpVal = document.getElementById("endlessHpVal");
  if (hpFill) {
    hpFill.style.width = `${hpPct}%`;
    hpFill.className = "endless-hp-fill" + (hpPct <= 34 ? " crit" : (hpPct <= 67 ? " warn" : ""));
  }
  if (hpVal) {
    if (sdMode) {
      hpVal.textContent = endlessState.lives <= 0
        ? "OUT"
        : ("❤️".repeat(endlessState.lives) + "🖤".repeat(Math.max(0, endlessState.maxLives - endlessState.lives)));
    } else {
      hpVal.textContent = `${hpPct}%`;
    }
  }

  const barsEl = document.getElementById("endlessBarsVal");
  if (barsEl) barsEl.textContent = t("endlessSurvived", endlessState.survivedBars);
  const comboEl = document.getElementById("endlessComboVal");
  if (comboEl) comboEl.textContent = `${endlessState.combo} COMBO`;
  const bestEl = document.getElementById("endlessBestVal");
  if (bestEl) bestEl.textContent = t("endlessBest", sdMode ? endlessState.sdBestBars : endlessState.bestBars);
}

export function syncEndlessLanguage() {
  const btnTxt = document.getElementById("btnEndlessText");
  if (btnTxt) btnTxt.textContent = `${t("btnEndless")} ${app.endlessMode ? "ON" : "OFF"}`;
  const sdMode = Boolean(app.suddenDeath);
  const lbl = document.getElementById("lblEndlessTitle");
  if (lbl) lbl.textContent = sdMode ? t("sdEndlessTitle") : t("endlessTitle");
  const msg = document.getElementById("endlessMsg");
  if (msg) {
    msg.style.color = "var(--muted)";
    msg.textContent = sdMode ? t("sdEndlessIdleMsg") : t("endlessIdleMsg");
  }
  renderEndlessHud();
}

export function setEndlessMode(enabled) {
  const next = Boolean(enabled);
  if (app.endlessMode === next) return;
  cbs.stopRun();
  app.endlessMode = next;
  app.suddenDeathOut = false;
  if (next) {
    app.dailyDate = null;
    app.dailyPlus = false;
    app.customMode = false;
    app.rushOn = false;
    buildEndlessPreviewPhrase();
    const msg = document.getElementById("endlessMsg");
    if (msg) {
      msg.style.color = "var(--muted)";
      msg.textContent = app.suddenDeath ? t("sdEndlessIdleMsg") : t("endlessIdleMsg");
    }
    cbs.setHitBadge(app.suddenDeath ? t("sdReadyBadge") : t("endlessReadyBadge"), app.suddenDeath ? "warn" : "tight");
  } else {
    endlessState.streamSeed = null;
    if (endlessState.freshClearTimerId) {
      window.clearTimeout(endlessState.freshClearTimerId);
      endlessState.freshClearTimerId = null;
    }
    cbs.newPhrase();
  }
  cbs.updateMeta();
  renderEndlessHud();
}

export function initEndless(callbacks) {
  cbs = { ...cbs, ...callbacks };
  endlessState.bestBars = loadBestByKey(ENDLESS_BEST_KEY);
  endlessState.sdBestBars = loadBestByKey(SD_BEST_KEY);

  document.getElementById("btnEndless").addEventListener("click", (e) => {
    e.currentTarget.blur();
    setEndlessMode(!app.endlessMode);
  });
  document.getElementById("btnEndlessClose").addEventListener("click", () => {
    setEndlessMode(false);
  });

  syncEndlessLanguage();
}
