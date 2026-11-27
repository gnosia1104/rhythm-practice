// Share URL Builder, Clipboard Utilities & 1200x630 PNG Score Brag Card Generator
import { getDailyStreak } from "./rhythm.js";
import { app, getTimeSig, tripletsAllowed, currentFullSeedCode } from "./state.js";
import { formatPlayMods, computeScoreRank, getTimingThresholds } from "./scoring.js";
import { getEquippedTitleAndBadges } from "./achievements.js";

export function clearShareQueryUrl() {
  try {
    if (location.protocol !== "file:" && location.search) {
      const qs = new URLSearchParams(location.search);
      const keep = new URLSearchParams();
      if (qs.has("room")) keep.set("room", qs.get("room"));
      if (qs.has("lang")) keep.set("lang", qs.get("lang"));
      const suffix = keep.toString() ? `?${keep.toString()}` : "";
      history.replaceState(null, "", `${location.pathname}${suffix}`);
    }
  } catch (_) {}
}


export function buildShareUrl() {
  const base = location.protocol === "file:"
    ? "https://gnosia1104.github.io/rhythm-practice/"
    : `${location.origin}${location.pathname}`;
  const qs = new URLSearchParams();
  if (app.customMode && app.phrase && app.phrase.customCode) {
    qs.set("custom", app.phrase.customCode);
    qs.set("bpm", String(app.bpm));
  } else if (app.dailyDate) {
    qs.set(app.dailyPlus ? "dailyplus" : "daily", app.dailyDate);
  } else {
    qs.set("seed", currentFullSeedCode());
  }
  return `${base}?${qs.toString()}`;
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}


export function flashBtnText(btn, tempText, restoreFn) {
  btn.textContent = tempText;
  window.setTimeout(() => { btn.textContent = restoreFn(); }, 1500);
}


export function buildResultCardText() {
  const r = app.lastResult;
  if (!r) return "";
  const snap = r.snap || {};
  const timeSig = snap.timeSig || app.timeSig;
  const numBars = snap.numBars || app.numBars;
  const bpm = snap.bpm || app.bpm;
  const level = snap.level || app.level;
  const lvFlags = snap.lvFlags !== undefined ? snap.lvFlags : "";
  const mods = snap.mods || formatPlayMods(app.soundOn, app.showBeatNums, app.showCursor, app.blindGrade, app.inputMode);
  const dailyDate = snap.dailyDate !== undefined ? snap.dailyDate : app.dailyDate;
  const dailyPlus = snap.dailyPlus !== undefined ? snap.dailyPlus : app.dailyPlus;
  const customMode = snap.customMode !== undefined ? snap.customMode : app.customMode;
  const seedCode = snap.seedCode || currentFullSeedCode();
  const shareUrl = snap.shareUrl || buildShareUrl();
  const streak = snap.streak !== undefined ? snap.streak : (dailyDate ? getDailyStreak(dailyPlus) : 0);
  const rank = computeScoreRank(r);
  const streakTxt = streak > 1 ? ` · 🔥${streak}d` : "";
  const header = dailyDate
    ? `🎸 Rhythm Sight-Reader — ${dailyPlus ? "🔥 Daily+" : "🏆 Daily"} ${dailyDate}${streakTxt}`
    : (customMode
      ? `🎸 Rhythm Sight-Reader — ✏️ Custom Score`
      : `🎸 Rhythm Sight-Reader — #${seedCode}`);
  const meta = customMode
    ? `${timeSig} · ${numBars} bars · ${bpm} BPM · ${mods}`
    : `${timeSig} · Lv${level}${lvFlags} · ${bpm} BPM · ${mods}`;
  const pct = r.total ? ((r.hits / r.total) * 100).toFixed(0) : "0";
  const sign = r.mean >= 0 ? "+" : "";
  const susTxt = (r.sustainStats && r.sustainStats.total > 0)
    ? ` · Sus ${Math.round((r.sustainStats.ok / r.sustainStats.total) * 100)}%`
    : "";
  const scoreTxt = (r.maxScore > 0) ? ` · 🎯 ${r.score.toLocaleString()}/${r.maxScore.toLocaleString()}` : "";
  const stat = `🏅 Rank ${rank.grade}${scoreTxt} · ${r.hits}/${r.total} (${pct}%) · TIGHT ${r.tight}${r.hits ? ` · Mean ${sign}${r.mean.toFixed(1)}ms` : ""}${susTxt}`;
  const grades = r.noteGrades || [];
  const emojis = grades.map(g => g === "tight" ? "🟩" : (g === "ok" ? "🟨" : "🟥"));
  const rows = [];
  for (let i = 0; i < emojis.length; i += 12) {
    rows.push(emojis.slice(i, i + 12).join(""));
  }
  return `${header}\n${meta}\n${stat}\n${rows.join("\n")}\n${shareUrl}`;
}

export function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderScoreCardPngBlob() {
  const r = app.lastResult;
  if (!r) return Promise.resolve(null);
  const snap = r.snap || {};
  const timeSig = snap.timeSig || app.timeSig;
  const numBars = snap.numBars || app.numBars;
  const bpm = snap.bpm || app.bpm;
  const level = snap.level || app.level;
  const lvFlags = snap.lvFlags !== undefined ? snap.lvFlags : "";
  const mods = snap.mods || formatPlayMods(app.soundOn, app.showBeatNums, app.showCursor, app.blindGrade, app.inputMode);
  const dailyDate = snap.dailyDate !== undefined ? snap.dailyDate : app.dailyDate;
  const dailyPlus = snap.dailyPlus !== undefined ? snap.dailyPlus : app.dailyPlus;
  const customMode = snap.customMode !== undefined ? snap.customMode : app.customMode;
  const seedCode = snap.seedCode || currentFullSeedCode();
  const streak = snap.streak !== undefined ? snap.streak : (dailyDate ? getDailyStreak(dailyPlus) : 0);

  const W = 1200, H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");

  // Sleek dark studio card background
  const grad = c.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#111827");
  grad.addColorStop(1, "#1e293b");
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);

  // Subtle staff lines watermark across upper backdrop
  c.strokeStyle = "rgba(255, 255, 255, 0.05)";
  c.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const y = 76 + i * 20;
    c.beginPath(); c.moveTo(48, y); c.lineTo(W - 48, y); c.stroke();
  }

  // Outer frame
  drawRoundRect(c, 28, 28, W - 56, H - 56, 22);
  c.strokeStyle = "rgba(255, 255, 255, 0.12)";
  c.lineWidth = 2;
  c.stroke();

  const rank = computeScoreRank(r);

  // Header: Brand + Challenge Badge
  c.fillStyle = "#f8fafc";
  c.font = '700 32px Georgia, "Times New Roman", serif';
  c.fillText("Rhythm Sight-Reader", 64, 92);

  const badgeText = dailyDate
    ? `${dailyPlus ? "DAILY+ " : "DAILY "}${dailyDate}${streak > 1 ? `  ·  ${streak}-DAY STREAK` : ""}`
    : (customMode ? "CUSTOM SCORE" : `#${seedCode}`);
  c.font = '700 18px ui-monospace, Menlo, Consolas, monospace';
  const bw = Math.min(540, c.measureText(badgeText).width + 36);
  drawRoundRect(c, W - 64 - bw, 58, bw, 40, 20);
  c.fillStyle = dailyPlus ? "rgba(249,115,22,0.22)" : (dailyDate ? "rgba(245,158,11,0.22)" : "rgba(59,130,246,0.22)");
  c.fill();
  c.strokeStyle = dailyPlus ? "#f97316" : (dailyDate ? "#f59e0b" : "#60a5fa");
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = "#f8fafc";
  c.textAlign = "center";
  c.fillText(badgeText, W - 64 - bw / 2, 84, bw - 24);
  c.textAlign = "left";

  // Subtitle: Meter / Level / BPM / Modifiers
  const subText = customMode
    ? `${timeSig}  ·  ${numBars} Bars  ·  ${bpm} BPM  ·  [ ${mods} ]`
    : `${timeSig}  ·  Lv${level}${lvFlags}  ·  ${numBars} Bars  ·  ${bpm} BPM  ·  [ ${mods} ]`;
  c.fillStyle = "#94a3b8";
  c.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  c.fillText(subText, 64, 134, W - 128);

  // Left Hero Box: Giant Rank Tier
  drawRoundRect(c, 64, 168, 220, 210, 20);
  c.fillStyle = "rgba(255, 255, 255, 0.05)";
  c.fill();
  c.strokeStyle = rank.color;
  c.lineWidth = 3;
  c.stroke();

  c.fillStyle = "#94a3b8";
  c.font = '700 16px -apple-system, sans-serif';
  c.textAlign = "center";
  c.fillText("RANK", 174, 202);
  c.fillStyle = rank.color;
  c.font = '800 96px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(rank.grade, 174, 304, 200);
  if (r.maxScore > 0) {
    c.fillStyle = "#e2e8f0";
    c.font = '700 17px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(`${r.score.toLocaleString()} / ${r.maxScore.toLocaleString()}`, 174, 352, 200);
  }
  c.textAlign = "left";

  // Right Metrics Grid (4 clean stat tiles)
  const acc = r.total ? ((r.hits / r.total) * 100).toFixed(1) : "0.0";
  const sign = r.mean >= 0 ? "+" : "";
  const susStr = (r.sustainStats && r.sustainStats.total > 0)
    ? `${Math.round((r.sustainStats.ok / r.sustainStats.total) * 100)}%`
    : `${r.sustainStats ? (r.sustainStats.restErrs || 0) : 0} err`;
  const susLbl = (r.sustainStats && r.sustainStats.total > 0) ? "SUSTAIN / ART" : "REST ERRORS";
  const twCard = getTimingThresholds(bpm);
  const tiles = [
    { lbl: "ACCURACY", val: `${acc}%`, sub: `${r.hits} / ${r.total} notes`, col: "#22c55e" },
    { lbl: `TIGHT (≤${twCard.tight}ms)`, val: `${r.tight}`, sub: `${r.total ? Math.round((r.tight / r.total) * 100) : 0}% in pocket`, col: "#38bdf8" },
    { lbl: "TIMING MEAN", val: r.hits ? `${sign}${r.mean.toFixed(1)}ms` : "—", sub: r.hits ? `SD ${r.sd.toFixed(1)}ms` : "—", col: "#f8fafc" },
    { lbl: susLbl, val: susStr, sub: `Extra hits: ${r.extra}`, col: "#fbbf24" },
  ];
  tiles.forEach((tl, idx) => {
    const col = idx % 2, row = Math.floor(idx / 2);
    const tx = 310 + col * 424;
    const ty = 168 + row * 112;
    drawRoundRect(c, tx, ty, 402, 98, 16);
    c.fillStyle = "rgba(255, 255, 255, 0.05)";
    c.fill();
    c.fillStyle = "#94a3b8";
    c.font = '700 14px -apple-system, sans-serif';
    c.fillText(tl.lbl, tx + 22, ty + 28);
    c.fillStyle = tl.col;
    c.font = '800 34px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(tl.val, tx + 22, ty + 68);
    c.fillStyle = "#cbd5e1";
    c.font = '500 15px -apple-system, sans-serif';
    c.textAlign = "right";
    c.fillText(tl.sub, tx + 380, ty + 66);
    c.textAlign = "left";
  });

  // Timing Distribution Strip (-150ms .. 0 .. +150ms)
  const dx0 = 64, dx1 = W - 64, dy = 442;
  drawRoundRect(c, dx0, dy - 34, dx1 - dx0, 68, 14);
  c.fillStyle = "rgba(15, 23, 42, 0.65)";
  c.fill();
  const mapX = (ms) => (dx0 + 36) + ((Math.max(-150, Math.min(150, ms)) + 150) / 300) * ((dx1 - dx0) - 72);
  // Green tight zone (BPM-adaptive)
  c.fillStyle = "rgba(34, 197, 94, 0.18)";
  c.fillRect(mapX(-twCard.tight), dy - 22, mapX(twCard.tight) - mapX(-twCard.tight), 44);
  // Axis line
  c.strokeStyle = "rgba(148, 163, 184, 0.45)";
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(mapX(-150), dy); c.lineTo(mapX(150), dy); c.stroke();
  // Center 0ms tick
  c.strokeStyle = "#22c55e";
  c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(mapX(0), dy - 24); c.lineTo(mapX(0), dy + 24); c.stroke();
  // Scatter dots
  for (const e of r.errs) {
    const ae = Math.abs(e);
    c.fillStyle = ae <= twCard.tight ? "#22c55e" : (ae <= twCard.ok ? "#f59e0b" : "#ef4444");
    c.beginPath(); c.arc(mapX(e), dy, 7, 0, Math.PI * 2); c.fill();
  }
  // Axis labels
  c.fillStyle = "#94a3b8";
  c.font = '600 13px ui-monospace, Menlo, monospace';
  c.textAlign = "center";
  for (const ms of [-150, -80, 0, 80, 150]) {
    c.fillText(ms === 0 ? "0ms" : (ms > 0 ? `+${ms}` : `${ms}`), mapX(ms), dy + 48);
  }
  c.textAlign = "left";

  // Note-by-note color bar (auto-fits even dense 128+ note charts)
  const grades = r.noteGrades || [];
  if (grades.length) {
    const barY = 514, maxW = W - 128;
    const gap = grades.length > 80 ? 1.5 : (grades.length > 48 ? 2.5 : 4);
    const cellW = Math.max(2, Math.min(26, (maxW - gap * (grades.length - 1)) / grades.length));
    const totalBarW = grades.length * cellW + (grades.length - 1) * gap;
    const radius = Math.min(4, cellW / 2);
    let cx = 64 + Math.max(0, (maxW - totalBarW) / 2);
    for (const g of grades) {
      c.fillStyle = g === "tight" ? "#22c55e" : (g === "ok" ? "#f59e0b" : "#ef4444");
      drawRoundRect(c, cx, barY, cellW, 18, radius);
      c.fill();
      cx += cellW + gap;
    }
  }

  // Footer viral URL watermark + Equipped Title & Achievement Badges
  const achInfo = getEquippedTitleAndBadges();
  if (achInfo.title || achInfo.badges.length) {
    c.fillStyle = "#cbd5e1";
    c.font = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
    const badgeStrip = achInfo.badges.length ? `   ${achInfo.badges.join(" ")}` : "";
    const titleTxt = achInfo.title ? `${achInfo.title}${badgeStrip}` : achInfo.badges.join(" ");
    c.fillText(titleTxt, 64, H - 84);
  }
  c.fillStyle = "#64748b";
  c.font = '600 17px ui-monospace, Menlo, Consolas, monospace';
  c.fillText("gnosia1104.github.io/rhythm-practice", 64, H - 50);
  c.textAlign = "right";
  c.fillText("Free Online Rhythm & Pitch Sight-Reading Trainer", W - 64, H - 50);
  c.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

