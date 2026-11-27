// Personal Performance Analytics & Local Weakness Diagnostics (BETA)
// 100% local (localStorage) note-level telemetry:
//   - Subdivision breakdown (Beat 1 / 16th-e / 8th-& / 16th-a / Triplet): rush/drag bias & accuracy
//   - BPM band breakdown (40-79 / 80-119 / 120-149 / 150-180): attack accuracy vs rest-mute error rate
//   - Recent 20-run Accuracy & Timing SD sparkline SVG
//   - Automatic #1 weakness detection + 1-click focused drill generator
import { t } from "./i18n.js";
import { app } from "./state.js";
import { getTimingThresholds } from "./scoring.js";
import { trackEvent } from "./analytics.js";

const DIAG_STORAGE_KEY = "rhythm_diag_v1";
const SUB_KEYS = ["beat", "e", "and", "a", "tri"];
const BPM_BANDS = [
  { id: "slow", min: 40,  max: 79,  label: "40–79" },
  { id: "mid",  min: 80,  max: 119, label: "80–119" },
  { id: "fast", min: 120, max: 149, label: "120–149" },
  { id: "max",  min: 150, max: 180, label: "150–180" },
];

function makeBucket() {
  return { hits: 0, misses: 0, tight: 0, sumErr: 0, sumSq: 0, restTotal: 0, restErrs: 0 };
}

function makeEmptyStore() {
  const subs = {};
  for (const k of SUB_KEYS) subs[k] = makeBucket();
  const bands = {};
  for (const b of BPM_BANDS) bands[b.id] = makeBucket();
  return {
    runs: 0,
    totalNotes: 0,
    subs,
    bands,
    trend: [], // last 20 runs: { acc, sd, mean, bpm, lv }
  };
}

export const diagState = {
  open: false,
  store: makeEmptyStore(),
};

let cbs = {
  onUiChange: () => {},
  onApplyWeaknessDrill: () => {},
  setHitBadge: () => {},
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadStore() {
  try {
    const raw = localStorage.getItem(DIAG_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const base = makeEmptyStore();
    base.runs = Number(parsed.runs) || 0;
    base.totalNotes = Number(parsed.totalNotes) || 0;
    if (parsed.subs && typeof parsed.subs === "object") {
      for (const k of SUB_KEYS) {
        if (parsed.subs[k]) base.subs[k] = { ...makeBucket(), ...parsed.subs[k] };
      }
    }
    if (parsed.bands && typeof parsed.bands === "object") {
      for (const b of BPM_BANDS) {
        if (parsed.bands[b.id]) base.bands[b.id] = { ...makeBucket(), ...parsed.bands[b.id] };
      }
    }
    if (Array.isArray(parsed.trend)) {
      base.trend = parsed.trend.slice(-20);
    }
    diagState.store = base;
  } catch (_) {}
}

function persistStore() {
  try {
    localStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(diagState.store));
  } catch (_) {}
}

function classifySubdivision(tgt) {
  if (tgt.tuplet) return "tri";
  const s = ((Number(tgt.slotInBeat) || 0) % 12 + 12) % 12;
  if (s === 0) return "beat";
  if (s === 6) return "and";
  if (s === 3) return "e";
  if (s === 9) return "a";
  if (s === 4 || s === 8) return "tri";
  return "beat";
}

function classifyBpmBand(bpm) {
  const b = Number(bpm) || 60;
  for (const band of BPM_BANDS) {
    if (b >= band.min && b <= band.max) return band.id;
  }
  return b < 80 ? "slow" : "max";
}

export function recordDiagnosticsRun({ phrase, bpm, level, acc, sd, mean }) {
  if (!phrase || !Array.isArray(phrase.targets) || !phrase.targets.length) return;
  const st = diagState.store;
  const bandId = classifyBpmBand(bpm);
  const bandB = st.bands[bandId] || makeBucket();
  const tw = getTimingThresholds(bpm || 60);

  let countedNotes = 0;
  for (const tgt of phrase.targets) {
    if (!tgt.hit && !tgt.missed) continue;
    countedNotes += 1;
    const subKey = classifySubdivision(tgt);
    const subB = st.subs[subKey] || makeBucket();
    if (tgt.hit) {
      subB.hits += 1;
      bandB.hits += 1;
      if (Number.isFinite(tgt.errMs)) {
        subB.sumErr += tgt.errMs;
        subB.sumSq += tgt.errMs * tgt.errMs;
        bandB.sumErr += tgt.errMs;
        bandB.sumSq += tgt.errMs * tgt.errMs;
        if (Math.abs(tgt.errMs) <= tw.tight) {
          subB.tight += 1;
          bandB.tight += 1;
        }
      }
    } else {
      subB.misses += 1;
      bandB.misses += 1;
    }
    st.subs[subKey] = subB;
  }

  for (const rst of (phrase.rests || [])) {
    if (!rst.passed && !rst.error) continue;
    bandB.restTotal += 1;
    if (rst.error) bandB.restErrs += 1;
  }
  st.bands[bandId] = bandB;

  if (countedNotes === 0) return;
  st.runs += 1;
  st.totalNotes += countedNotes;
  st.trend.push({
    acc: Math.round(Math.max(0, Math.min(100, Number(acc) || 0))),
    sd: Number(Math.max(0, Math.min(150, Number(sd) || 0)).toFixed(1)),
    mean: Number((Number(mean) || 0).toFixed(1)),
    bpm: Math.round(Number(bpm) || 60),
    lv: Number(level) || 1,
  });
  if (st.trend.length > 20) st.trend.shift();

  persistStore();
  if (diagState.open) renderDiagnosticsUi();
}

function bucketStats(b) {
  const total = (b.hits || 0) + (b.misses || 0);
  const acc = total > 0 ? (b.hits / total) * 100 : null;
  const mean = b.hits > 0 ? (b.sumErr / b.hits) : 0;
  const variance = b.hits > 1 ? Math.max(0, (b.sumSq / b.hits) - mean * mean) : 0;
  const sd = Math.sqrt(variance);
  const restFailRate = b.restTotal > 0 ? (b.restErrs / b.restTotal) * 100 : null;
  return { total, hits: b.hits || 0, misses: b.misses || 0, acc, mean, sd, restTotal: b.restTotal || 0, restErrs: b.restErrs || 0, restFailRate };
}

function detectWeakness() {
  const st = diagState.store;
  if (st.totalNotes < 5) return null;

  let worst = null;
  const subLabels = t("diagSubLabels") || {};

  // Check subdivision weaknesses (minimum 3 notes in bucket)
  for (const k of SUB_KEYS) {
    const s = bucketStats(st.subs[k]);
    if (s.total < 3 || s.acc === null) continue;
    // Composite weakness penalty: lower accuracy + higher timing deviation
    const penalty = (100 - s.acc) * 1.4 + Math.min(40, Math.abs(s.mean) * 0.6 + s.sd * 0.35);
    if (!worst || penalty > worst.penalty) {
      const drillCfg = k === "e" || k === "a"
        ? { level: 5, tripletMode: 0, reasonKey: k }
        : (k === "tri"
          ? { level: Math.max(2, Math.min(4, app.level)), tripletMode: 1, reasonKey: "tri" }
          : (k === "and"
            ? { level: 3, tripletMode: 0, reasonKey: "and" }
            : { level: 1, tripletMode: 0, reasonKey: "beat" }));
      worst = {
        kind: "sub",
        key: k,
        label: subLabels[k] || k,
        acc: s.acc,
        mean: s.mean,
        sd: s.sd,
        penalty,
        drill: drillCfg,
      };
    }
  }

  // Also check overall rest-mute failure rate across BPM bands
  let restTot = 0, restErr = 0;
  for (const b of BPM_BANDS) {
    restTot += st.bands[b.id].restTotal || 0;
    restErr += st.bands[b.id].restErrs || 0;
  }
  if (restTot >= 4) {
    const failPct = (restErr / restTot) * 100;
    const restPenalty = failPct * 1.6;
    if (failPct >= 15 && (!worst || restPenalty > worst.penalty)) {
      worst = {
        kind: "rest",
        key: "rest",
        label: t("diagRestLabel"),
        acc: 100 - failPct,
        failPct,
        mean: 0,
        sd: 0,
        penalty: restPenalty,
        drill: { level: 3, tripletMode: 0, reasonKey: "rest" },
      };
    }
  }
  return worst;
}

function renderTrendSparklineSvg(trend) {
  if (!trend || trend.length < 2) {
    return `<div class="diag-empty-sub">${escapeHtml(t("diagTrendNeedMore"))}</div>`;
  }
  const W = 360, H = 74, padX = 10, padY = 10;
  const n = trend.length;
  const xAt = (i) => padX + (i / (n - 1)) * (W - padX * 2);
  const yAcc = (v) => padY + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - padY * 2);
  const ySd = (v) => padY + (1 - Math.max(0, Math.min(100, 100 - v)) / 100) * (H - padY * 2);

  const accPts = trend.map((pt, i) => `${xAt(i).toFixed(1)},${yAcc(pt.acc).toFixed(1)}`).join(" ");
  const sdPts = trend.map((pt, i) => `${xAt(i).toFixed(1)},${ySd(pt.sd).toFixed(1)}`).join(" ");
  const latest = trend[n - 1];
  const first = trend[0];
  const accDelta = latest.acc - first.acc;
  const sdDelta = latest.sd - first.sd;

  return `<svg class="diag-spark-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${padX}" y1="${padY}" x2="${W - padX}" y2="${padY}" stroke="#f1f5f9" stroke-width="1" />
    <line x1="${padX}" y1="${H / 2}" x2="${W - padX}" y2="${H / 2}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="3 3" />
    <line x1="${padX}" y1="${H - padY}" x2="${W - padX}" y2="${H - padY}" stroke="#e2e8f0" stroke-width="1" />
    <polyline fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${accPts}" />
    <polyline fill="none" stroke="#6366f1" stroke-width="1.8" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round" points="${sdPts}" />
    <circle cx="${xAt(n - 1).toFixed(1)}" cy="${yAcc(latest.acc).toFixed(1)}" r="3.4" fill="#16a34a" />
    <circle cx="${xAt(n - 1).toFixed(1)}" cy="${ySd(latest.sd).toFixed(1)}" r="3" fill="#6366f1" />
  </svg>
  <div class="diag-spark-legend">
    <span><i class="diag-dot acc"></i> ${escapeHtml(t("diagAccLbl"))} ${latest.acc}% (${accDelta >= 0 ? "+" : ""}${accDelta}%)</span>
    <span><i class="diag-dot sd"></i> SD ±${latest.sd.toFixed(0)}ms (${sdDelta >= 0 ? "+" : ""}${sdDelta.toFixed(0)}ms)</span>
  </div>`;
}

export function renderDiagnosticsUi() {
  const bar = document.getElementById("diagBar");
  const btn = document.getElementById("btnDiagnostics");
  if (btn) btn.classList.toggle("active", diagState.open);
  if (!bar) return;

  const st = diagState.store;
  const sumEl = document.getElementById("diagSummaryStats");
  if (sumEl) sumEl.textContent = t("diagSummary", st.runs, st.totalNotes);

  // 1. Weakness Diagnosis Banner + 1-Click Focused Drill
  const weak = detectWeakness();
  const weakCard = document.getElementById("diagWeaknessBox");
  const weakText = document.getElementById("diagWeaknessText");
  const drillBtn = document.getElementById("btnDiagFocusDrill");
  if (weakCard && weakText && drillBtn) {
    if (!weak) {
      weakCard.classList.remove("has-weak");
      weakText.textContent = t("diagNeedData");
      drillBtn.classList.add("hidden");
    } else {
      weakCard.classList.add("has-weak");
      if (weak.kind === "rest") {
        weakText.textContent = t("diagWeakRest", weak.failPct.toFixed(0));
      } else {
        const biasTxt = Math.abs(weak.mean) < 6
          ? t("diagBiasCenter")
          : (weak.mean < 0 ? t("diagBiasRush", Math.abs(weak.mean).toFixed(0)) : t("diagBiasDrag", weak.mean.toFixed(0)));
        weakText.textContent = t("diagWeakSub", weak.label, weak.acc.toFixed(0), biasTxt);
      }
      drillBtn.textContent = t("diagFocusDrillBtn");
      drillBtn.classList.remove("hidden");
    }
  }

  // 2. Subdivision Breakdown (1 / e / & / a / Triplet)
  const subEl = document.getElementById("diagSubGrid");
  if (subEl) {
    const labels = t("diagSubLabels") || {};
    subEl.innerHTML = SUB_KEYS.map((k) => {
      const s = bucketStats(st.subs[k]);
      const accStr = s.acc !== null ? `${s.acc.toFixed(0)}%` : "—";
      const fillW = s.acc !== null ? Math.round(s.acc) : 0;
      const cls = s.acc === null ? "" : (s.acc >= 88 ? "good" : (s.acc >= 72 ? "warn" : "bad"));
      const biasStr = s.hits === 0
        ? "—"
        : (Math.abs(s.mean) < 5 ? `0ms` : `${s.mean > 0 ? "+" : ""}${s.mean.toFixed(0)}ms`);
      const biasCls = s.hits === 0 ? "" : (s.mean <= -10 ? "rush" : (s.mean >= 10 ? "drag" : "center"));
      return `<div class="diag-row">
        <span class="diag-lbl">${escapeHtml(labels[k] || k)}</span>
        <div class="diag-track"><div class="diag-fill ${cls}" style="width:${fillW}%"></div></div>
        <span class="diag-val">${accStr}</span>
        <span class="diag-bias ${biasCls}">${biasStr}</span>
      </div>`;
    }).join("");
  }

  // 3. BPM Band Breakdown (Attack Acc vs Rest Mute Fail Rate)
  const bpmEl = document.getElementById("diagBpmGrid");
  if (bpmEl) {
    bpmEl.innerHTML = BPM_BANDS.map((b) => {
      const s = bucketStats(st.bands[b.id]);
      const accStr = s.acc !== null ? `${s.acc.toFixed(0)}%` : "—";
      const fillW = s.acc !== null ? Math.round(s.acc) : 0;
      const cls = s.acc === null ? "" : (s.acc >= 88 ? "good" : (s.acc >= 72 ? "warn" : "bad"));
      const restStr = s.restFailRate !== null ? `🔇${s.restFailRate.toFixed(0)}%` : "—";
      return `<div class="diag-row">
        <span class="diag-lbl">${b.label}</span>
        <div class="diag-track"><div class="diag-fill ${cls}" style="width:${fillW}%"></div></div>
        <span class="diag-val">${accStr}</span>
        <span class="diag-bias">${restStr}</span>
      </div>`;
    }).join("");
  }

  // 4. Recent 20-run Trend Sparkline
  const trendEl = document.getElementById("diagTrendBox");
  if (trendEl) {
    trendEl.innerHTML = renderTrendSparklineSvg(st.trend);
  }
}

export function syncDiagnosticsLanguage() {
  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTxt("btnDiagText", "btnDiagnostics");
  setTxt("lblDiagTitle", "diagTitle");
  setTxt("lblDiagSubHead", "diagSubHead");
  setTxt("lblDiagBpmHead", "diagBpmHead");
  setTxt("lblDiagTrendHead", "diagTrendHead");
  setTxt("btnDiagReset", "diagReset");
  renderDiagnosticsUi();
}

export function toggleDiagnosticsBar(forceOpen = null) {
  const bar = document.getElementById("diagBar");
  if (!bar) return;
  const open = forceOpen !== null ? forceOpen : bar.classList.contains("hidden");
  diagState.open = open;
  bar.classList.toggle("hidden", !open);
  cbs.onUiChange();
  if (open) {
    trackEvent("diagnostics_open");
    renderDiagnosticsUi();
  } else {
    renderDiagnosticsUi();
  }
}

export function initDiagnostics(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };
  loadStore();

  const btnOpen = document.getElementById("btnDiagnostics");
  if (btnOpen) {
    btnOpen.addEventListener("click", (e) => {
      e.currentTarget.blur();
      toggleDiagnosticsBar();
    });
  }
  const btnClose = document.getElementById("btnDiagClose");
  if (btnClose) {
    btnClose.addEventListener("click", () => toggleDiagnosticsBar(false));
  }
  const btnReset = document.getElementById("btnDiagReset");
  if (btnReset) {
    btnReset.addEventListener("click", (e) => {
      e.currentTarget.blur();
      diagState.store = makeEmptyStore();
      persistStore();
      renderDiagnosticsUi();
      cbs.setHitBadge(t("diagResetDone"), "warn");
    });
  }
  const btnDrill = document.getElementById("btnDiagFocusDrill");
  if (btnDrill) {
    btnDrill.addEventListener("click", (e) => {
      e.currentTarget.blur();
      const weak = detectWeakness();
      if (!weak || !weak.drill) return;
      trackEvent("diagnostics_drill", { key: weak.key });
      cbs.onApplyWeaknessDrill(weak);
    });
  }

  syncDiagnosticsLanguage();
}
