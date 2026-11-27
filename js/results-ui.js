// Results Visualization (Timing Distribution SVG), Recent Practice Log & Share/Brag Card UI
import { IS_MOBILE, app } from "./state.js";
import { t } from "./i18n.js";
import { decodeFullSeedCode, getTodayDateStr } from "./rhythm.js";
import { formatPlayModsCompact, getTimingThresholds, computeScoreRank } from "./scoring.js";
import {
  buildShareUrl, copyToClipboard, flashBtnText,
  buildResultCardText, renderScoreCardPngBlob,
} from "./share-card.js";
import { trackShare } from "./analytics.js";

let cbs = {
  loadDailyChallenge: () => {},
  loadCustomFromInput: () => {},
  applyFullSeedObj: () => {},
  setHitBadge: () => {},
  onOpenLeaderboard: () => {},
};

function svgEl(tag, attrs = {}, text = null) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== null) n.textContent = text;
  return n;
}

export function drawDistribution(errs, hits, total, mean, sd, tight, sustainStats = null, extraHits = app.extraHits, distBpm = app.bpm) {
  const svg = document.getElementById("distSvg");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = 380, cy = 30, pad = 28;
  const mapX = (ms) => pad + ((Math.max(-150, Math.min(150, ms)) + 150) / 300) * (W - pad * 2);
  const tw = getTimingThresholds(distBpm);

  svg.appendChild(svgEl("rect", {
    x: mapX(-tw.tight), y: 12, width: mapX(tw.tight) - mapX(-tw.tight), height: 36,
    fill: "#dcfce7", rx: 4,
  }));
  svg.appendChild(svgEl("line", { x1: pad, y1: cy, x2: W - pad, y2: cy, stroke: "#cbd5e1", "stroke-width": 1.5 }));
  for (const ms of [-150, -80, 0, 80, 150]) {
    const x = mapX(ms);
    svg.appendChild(svgEl("line", {
      x1: x, y1: ms === 0 ? 8 : 22, x2: x, y2: ms === 0 ? 52 : 38,
      stroke: ms === 0 ? "#16a34a" : "#94a3b8", "stroke-width": ms === 0 ? 2 : 1,
    }));
    svg.appendChild(svgEl("text", {
      x, y: 61, "text-anchor": "middle", "font-size": 10, fill: "#64748b",
      "font-family": "ui-monospace, monospace",
    }, ms === 0 ? "0" : (ms > 0 ? `+${ms}` : `${ms}`)));
  }
  for (const e of errs) {
    const ae = Math.abs(e);
    const fill = ae <= tw.tight ? "#16a34a" : (ae <= tw.ok ? "#d97706" : "#dc2626");
    svg.appendChild(svgEl("circle", { cx: mapX(e), cy, r: 5, fill, opacity: 0.85 }));
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

export function renderLog() {
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
    const modePrefix = h.endless ? "♾️" : (h.custom ? "✏️" : (h.dailyPlus ? "🔥" : (h.daily ? "🏆" : "")));
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

export function initResultsUi(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };

  document.getElementById("logContainer").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-replay-idx]");
    if (!cell) return;
    const h = app.history[Number(cell.dataset.replayIdx)];
    if (!h) return;
    if (h.daily || h.dailyPlus) {
      cbs.loadDailyChallenge(h.dailyDate || null, Boolean(h.dailyPlus));
    } else if (h.fullSeed && h.fullSeed.startsWith("C1_")) {
      if (Number.isFinite(Number(h.bpm))) app.bpm = Math.max(40, Math.min(180, Math.round(Number(h.bpm))));
      cbs.loadCustomFromInput(h.fullSeed);
    } else if (h.fullSeed) {
      const cfg = decodeFullSeedCode(h.fullSeed);
      if (cfg) cbs.applyFullSeedObj(cfg);
    }
    document.querySelector(".sheet-paper").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("btnShareUrl").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.blur();
    const url = buildShareUrl();
    await copyToClipboard(url);
    trackShare("url", app);
    flashBtnText(btn, t("btnShareCopied"), () => t("btnShareUrl"));
    cbs.setHitBadge(app.customMode ? t("edUrlCopied") : t("edSeedCopied"), "tight");
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

  const btnOpenLbFromRes = document.getElementById("btnOpenLbFromResult");
  if (btnOpenLbFromRes) {
    btnOpenLbFromRes.addEventListener("click", (e) => {
      e.currentTarget.blur();
      cbs.onOpenLeaderboard();
    });
  }
}
