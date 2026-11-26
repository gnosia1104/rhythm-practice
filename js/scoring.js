// Difficulty-Weighted Precision Scoring & Rank Engine
import { app } from "./state.js";

export function formatPlayMods(soundOn, showBeatNums, showCursor, blindGrade, inputMode, gapClick = app.gapClick, fadeBeats = app.fadeBeats, rushOn = app.rushOn) {
  const parts = [inputMode === "AUDIO" ? "AUD" : inputMode];
  if (!soundOn) parts.push("M×");
  else if (gapClick && gapClick !== "OFF") parts.push(`Gap${gapClick}`);
  if (blindGrade) parts.push("Blind");
  if (showBeatNums) parts.push("+B");
  if (showCursor) parts.push("+C");
  if (fadeBeats > 0) parts.push(`Fade${fadeBeats}b`);
  if (rushOn) parts.push("Rush");
  return parts.join(" · ");
}

export function formatPlayModsCompact(h) {
  const inp = h.mode === "AUDIO" ? "AUD" : (h.mode || "KEY");
  const flags = [];
  if (h.soundOn === false) flags.push("M×");
  else if (h.gapClick && h.gapClick !== "OFF") flags.push(`Gap${h.gapClick}`);
  if (h.blindGrade) flags.push("Blind");
  if (h.showBeatNums) flags.push("+B");
  if (h.showCursor) flags.push("+C");
  if (h.fadeBeats > 0) flags.push(`Fade${h.fadeBeats}b`);
  if (h.rushOn) flags.push("Rush");
  return flags.length ? `${inp} · ${flags.join(" · ")}` : inp;
}

// -------------------------------------------------------------------------
// Difficulty-Weighted Precision Scoring Engine (Chart Max + Mod + Groove)
// -------------------------------------------------------------------------
export const METER_SCORE_MULT = { "4/4": 1.00, "2/4": 1.05, "3/4": 1.05, "6/8": 1.12, "5/4": 1.22 };

export function getNoteDifficultyWeight(tgt, prevTgt) {
  const slot = tgt.slotInBeat || 0;
  const dur = tgt.durSlots || 12;
  let w = 1.0;
  if (tgt.tuplet === "4t" || dur === 8) {
    w = 1.85;
  } else if (tgt.tuplet === "8t" || dur === 4 || slot === 4 || slot === 8) {
    w = 1.55;
  } else if (slot % 6 !== 0 && slot % 4 !== 0) {
    // 16th-note off-beat ("e" or "a")
    w = 2.00;
  } else if (dur === 3 || dur === 9) {
    // 16th-note on-beat or dotted-8th
    w = 1.65;
  } else if (slot === 6 || tgt.tied || dur === 18) {
    // 8th off-beat / syncopation / cross-beat tie / dotted quarter
    w = 1.45;
  } else if (dur === 6) {
    // Straight on-beat 8th
    w = 1.15;
  } else {
    // Quarter / half / whole on-beat
    w = 1.00;
  }
  if (tgt.art === "staccato") w += 0.25;
  else if (tgt.art === "ghost") w += 0.30;
  // Rest-to-note re-entry difficulty bonus
  const hasRestBefore = prevTgt
    ? (tgt.globalSlot > prevTgt.globalSlot + prevTgt.durSlots)
    : (tgt.globalSlot > 0);
  if (hasRestBefore) w += 0.15;
  return w;
}

export function computeChartMaxInfo(phrase = app.phrase, cfg = null) {
  const c = cfg || {
    timeSig: app.timeSig,
    bpm: app.bpm,
    inputMode: app.inputMode,
    soundOn: app.soundOn,
    showBeatNums: app.showBeatNums,
    showCursor: app.showCursor,
    blindGrade: app.blindGrade,
    gapClick: app.gapClick,
    fadeBeats: app.fadeBeats,
  };
  const tgts = (phrase && phrase.targets) ? phrase.targets : [];
  const weights = tgts.map((t, i) => getNoteDifficultyWeight(t, i > 0 ? tgts[i - 1] : null));
  const rawWeightSum = weights.reduce((a, b) => a + b, 0);
  const meterMult = METER_SCORE_MULT[c.timeSig] || 1.0;
  // Logarithmic BPM curve: musical groove focus (no reward for sloppy 180 BPM farming, no penalty for slow 40-60 BPM)
  const bpmMult = 1 + 0.28 * Math.log(Math.max(60, c.bpm || 60) / 60);

  const isAudio = (c.inputMode === "AUDIO" || c.inputMode === "BOTH");
  let modMult = 1.0;
  const modTags = [];
  if (c.showBeatNums) { modMult *= 0.94; modTags.push("+B ×0.94"); }
  if (c.showCursor) { modMult *= 0.90; modTags.push("+C ×0.90"); }
  if (c.blindGrade) { modMult *= 1.05; modTags.push("Blind ×1.05"); }
  if (c.soundOn === false) { modMult *= 1.22; modTags.push("M× ×1.22"); }
  else if (c.gapClick === "1+1") { modMult *= 1.08; modTags.push("Gap1+1 ×1.08"); }
  else if (c.gapClick === "2+2") { modMult *= 1.10; modTags.push("Gap2+2 ×1.10"); }
  else if (c.gapClick === "1+3") { modMult *= 1.18; modTags.push("Gap1+3 ×1.18"); }
  if (c.fadeBeats === 1) { modMult *= 1.08; modTags.push("Fade1b ×1.08"); }
  else if (c.fadeBeats === 2) { modMult *= 1.15; modTags.push("Fade2b ×1.15"); }

  const attackUnitScale = 100 * meterMult * bpmMult * modMult;
  const sustainPtsPerNote = isAudio ? (50 * meterMult * modMult) : 0;
  const sustainEligible = tgts.map(t => {
    if (!isAudio) return false;
    if (t.art === "staccato" || t.art === "ghost") return true;
    if (Number.isFinite(t.durSec) && t.durSec >= 0.30) return true;
    if (t.hasRestAfter && Number.isFinite(t.restEndSec) && (t.restEndSec - t.endSec) >= 0.18) return true;
    return !Number.isFinite(t.durSec) && (t.durSlots || 0) >= 6;
  });
  const sustainCount = sustainEligible.filter(Boolean).length;
  const baseMax = Math.round(rawWeightSum * 100 * meterMult * bpmMult);
  const noteMax = Math.round(rawWeightSum * attackUnitScale);
  const sustainMax = isAudio ? Math.round(sustainCount * sustainPtsPerNote) : 0;
  const maxScore = noteMax + sustainMax;
  return {
    weights, rawWeightSum, meterMult, bpmMult, modMult, modTags, isAudio,
    attackUnitScale, sustainPtsPerNote, sustainEligible, sustainCount,
    baseMax, noteMax, sustainMax, maxScore
  };
}

export function computeSustainQuality(tgt) {
  // Graduated real-instrument sustain & articulation mastery (0..1)
  if (!tgt.sustainStatus) return 1.0;
  const ratio = Number.isFinite(tgt.sustainRatio) ? tgt.sustainRatio : 1.0;
  if (tgt.art === "staccato") {
    if (tgt.sustainStatus === "OK") {
      const dist = Math.abs(ratio - 0.45);
      return dist <= 0.10 ? 1.0 : Math.max(0.85, 1.0 - (dist - 0.10) * 0.9);
    }
    return 0.40;
  }
  if (tgt.art === "ghost") {
    return tgt.sustainStatus === "OK" ? 1.0 : 0.30;
  }
  if (tgt.sustainStatus === "OK") {
    if (ratio >= 0.82) return 1.0;
    return 0.80 + Math.max(0, (ratio - 0.62) / 0.20) * 0.20;
  }
  if (tgt.sustainStatus === "SHORT") {
    return Math.max(0.35, Math.min(0.75, 0.35 + (ratio / 0.62) * 0.40));
  }
  return 0.30;
}

export function getTimingThresholds(bpm = app.bpm) {
  // BPM-adaptive timing windows (blends human absolute floor + musical subdivision spacing):
  // 40..75 BPM: P+<=18ms, TIGHT<=35ms, GOOD<=60ms, OK<=80ms
  // 120 BPM:    P+<=14ms, TIGHT<=28ms, GOOD<=47ms, OK<=63ms
  // 180 BPM:    P+<=12ms, TIGHT<=23ms, GOOD<=39ms, OK<=52ms
  const scale = Math.max(0.64, Math.min(1.0, Math.sqrt(75 / Math.max(60, bpm || 60))));
  const pPlus = Math.max(12, Math.round(18 * scale));
  const tight = Math.max(22, Math.round(35 * scale));
  const good = Math.max(38, Math.round(60 * scale));
  const ok = Math.max(50, Math.round(80 * scale));
  return { pPlus, tight, good, ok, scale };
}

export function computeAttackPrecision(absMs, bpm = app.bpm) {
  const tw = getTimingThresholds(bpm);
  const ae = Math.max(0, Number(absMs) || 0);
  if (ae <= tw.pPlus) return 1.0;
  if (ae <= tw.tight) return 1.0 - ((ae - tw.pPlus) / Math.max(1, tw.tight - tw.pPlus)) * 0.08;
  if (ae <= tw.good) return 0.92 - ((ae - tw.tight) / Math.max(1, tw.good - tw.tight)) * 0.18;
  if (ae <= tw.ok) return 0.74 - ((ae - tw.good) / Math.max(1, tw.ok - tw.good)) * 0.18;
  return Math.max(0.25, 0.56 - ((ae - tw.ok) / Math.max(1, 150 - tw.ok)) * 0.31);
}

export function computeDetailedScore(phrase, hits, total, sd, extraHits, restErrs, keyExtraHits = null, audioExtraHits = null) {
  const info = computeChartMaxInfo(phrase);
  if (!total || !info.maxScore) {
    return { score: 0, maxScore: info.maxScore, noteScore: 0, noteMax: info.noteMax, sustainEarned: 0, sustainMax: info.sustainMax, pct: 0, penalty: 0, sdBonus: 0, info };
  }
  let rawAttack = 0;
  let rawSustain = 0;
  for (let i = 0; i < phrase.targets.length; i++) {
    const tgt = phrase.targets[i];
    if (!tgt.hit || tgt.errMs === null) continue;
    let atkRatio = computeAttackPrecision(Math.abs(tgt.errMs));
    if (!info.isAudio) {
      // KEY / PAD: staccato release / ghost key accuracy scales attack note directly
      if (tgt.sustainStatus === "SHORT") atkRatio *= 0.88;
      else if (tgt.sustainStatus === "LONG") atkRatio *= 0.78;
    }
    rawAttack += info.weights[i] * info.attackUnitScale * atkRatio;
    if (info.isAudio && info.sustainEligible[i]) {
      rawSustain += info.sustainPtsPerNote * computeSustainQuality(tgt);
    }
  }
  // Split KEY/PAD extra hits (strict anti-mashing) vs AUDIO extra hits (real-bass string/pickup tolerance)
  const kExt = keyExtraHits !== null ? keyExtraHits : (info.isAudio ? 0 : extraHits);
  const aExt = audioExtraHits !== null ? audioExtraHits : (info.isAudio ? extraHits : 0);
  const restHitErrs = (phrase.rests || []).filter(r => r.error && r.errorKind === "HIT").length;
  const kNonRest = Math.max(0, kExt - Math.min(kExt, restHitErrs));
  const remRestHits = Math.max(0, restHitErrs - Math.min(kExt, restHitErrs));
  const aNonRest = Math.max(0, aExt - remRestHits);
  const avgNotePts = info.noteMax / Math.max(1, total);

  // 1) KEY/PAD strict two-tier anti-mashing penalty
  const kSpamThr = Math.max(3, Math.ceil(total * 0.25));
  const kNormal = Math.min(kNonRest, kSpamThr);
  const kSpam = Math.max(0, kNonRest - kSpamThr);

  // 2) AUDIO gentle real-instrument noise handling (never zeroes out clean 0-rest-error bass playing)
  const aSpamThr = Math.max(6, Math.ceil(total * 0.65));
  const aNormal = Math.min(aNonRest, aSpamThr);
  const aSpam = (restErrs >= 2) ? Math.max(0, aNonRest - aSpamThr) : 0;

  const baseRawPen = restErrs * avgNotePts * 0.15 + kNormal * avgNotePts * 0.08 + aNormal * avgNotePts * 0.05;
  const basePenalty = Math.min(Math.round(rawAttack * 0.20), Math.round(baseRawPen));
  const spamPenalty = Math.round(kSpam * avgNotePts * 0.85 + aSpam * avgNotePts * 0.30);
  const penalty = basePenalty + spamPenalty;
  const kExtraRatio = kExt / Math.max(1, total);
  const sdBonus = (hits >= Math.ceil(total * 0.8) && sd <= 20 && kSpam === 0)
    ? Math.round(((20 - sd) / 20) * 0.02 * info.noteMax)
    : 0;
  const noteScore = Math.max(0, Math.min(info.noteMax, Math.round(rawAttack + sdBonus - penalty)));
  // Only attenuate sustain on clear keyboard mashing or noisy audio with rest errors
  const susSpamMult = (kExtraRatio >= 0.45)
    ? Math.max(0, 1 - (kExtraRatio - 0.45) * 1.6)
    : ((aSpam > 0 && restErrs >= 2) ? Math.max(0.25, 1 - (aSpam / Math.max(1, total)) * 0.6) : 1.0);
  const sustainEarned = Math.max(0, Math.min(info.sustainMax, Math.round(rawSustain * susSpamMult)));
  const score = noteScore + sustainEarned;
  const pct = (score / info.maxScore) * 100;
  return { score, maxScore: info.maxScore, noteScore, noteMax: info.noteMax, sustainEarned, sustainMax: info.sustainMax, pct, penalty, sdBonus, info };
}

export function computeScoreRank(r) {
  if (!r || !r.total) return { grade: "C", cls: "rank-c", color: "#ef4444" };
  const acc = (r.hits / r.total) * 100;
  const restErrs = r.sustainStats ? (r.sustainStats.restErrs || 0) : 0;
  const kExt = Number.isFinite(r.keyExtra) ? r.keyExtra : (r.inputMode === "AUDIO" ? 0 : (Number(r.extra) || 0));
  const aExt = Number.isFinite(r.audioExtra) ? r.audioExtra : (r.inputMode === "AUDIO" ? (Number(r.extra) || 0) : 0);
  const kExtraRatio = kExt / Math.max(1, r.total);
  const aExtraRatio = aExt / Math.max(1, r.total);
  const TIERS = [
    { grade: "S+", cls: "rank-sp", color: "#f59e0b" },
    { grade: "S",  cls: "rank-s",  color: "#22c55e" },
    { grade: "A",  cls: "rank-a",  color: "#3b82f6" },
    { grade: "B",  cls: "rank-b",  color: "#94a3b8" },
    { grade: "C",  cls: "rank-c",  color: "#ef4444" },
  ];
  let idx = 4; // C
  // Primary: synced directly with difficulty-weighted Score % (score / maxScore)
  if (r.maxScore > 0 && Number.isFinite(r.score)) {
    const scorePct = (r.score / r.maxScore) * 100;
    if (scorePct >= 95 && acc >= 99.9 && restErrs === 0) idx = 0;
    else if (scorePct >= 88 && acc >= 90) idx = 1;
    else if (scorePct >= 78) idx = 2;
    else if (scorePct >= 62) idx = 3;
    else idx = 4;
  } else {
    // Fallback for legacy persisted Practice Log rows without maxScore
    const tightPct = (r.tight / r.total) * 100;
    const susPct = (r.sustainStats && r.sustainStats.total > 0)
      ? (r.sustainStats.ok / r.sustainStats.total) * 100
      : 100;
    if (acc >= 99.9 && tightPct >= 85 && restErrs === 0 && susPct >= 85) idx = 0;
    else if (acc >= 95 && tightPct >= 70 && restErrs <= 1) idx = 1;
    else if (acc >= 85) idx = 2;
    else if (acc >= 70) idx = 3;
    else idx = 4;
  }
  // Strict anti-mashing rank caps for KEY/PAD spam; fair audio-only cap only when rest errors also occur
  if (kExtraRatio >= 0.50) idx = Math.max(idx, 4);
  else if (kExtraRatio >= 0.30) idx = Math.max(idx, 3);
  else if (kExtraRatio >= 0.15) idx = Math.max(idx, 2);
  if (aExtraRatio >= 0.85 && restErrs >= 2) idx = Math.max(idx, 3);
  return TIERS[idx];
}

