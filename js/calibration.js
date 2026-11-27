// 16-Beat Auto Latency Calibration & Sync Bar Module (KEY & AUDIO)
import { app, audioIn, calState } from "./state.js";
import { t } from "./i18n.js";
import {
  ensureAudioCtx, ensureAudioCtxReady, stopScheduledAudio, scheduleClick,
} from "./audio-out.js";

let cbs = {
  abortActiveRunTracking: () => {},
  resetTargets: () => {},
  setHitBadge: () => {},
  syncTransportButtons: () => {},
  onUiChange: () => {},
};

export function resetCalDots() {
  const dots = document.querySelectorAll("#calDots .cal-dot");
  dots.forEach((d, i) => {
    d.className = i < calState.warmupClicks ? "cal-dot warmup" : "cal-dot";
  });
}

export function syncLatency(ms, persist = false) {
  const clamped = Math.max(0, Math.min(300, Math.round(ms)));
  audioIn.latencyMs = clamped;
  const latSlider = document.getElementById("latSlider");
  const latVal = document.getElementById("latVal");
  const calAudLatSlider = document.getElementById("calAudLatSlider");
  const calAudLatVal = document.getElementById("calAudLatVal");
  if (latSlider) latSlider.value = String(clamped);
  if (latVal) latVal.textContent = `${clamped}ms`;
  if (calAudLatSlider) calAudLatSlider.value = String(clamped);
  if (calAudLatVal) calAudLatVal.textContent = `${clamped}ms`;
  if (persist) {
    try { localStorage.setItem("rhythm_practice_aud_lat", String(clamped)); } catch (_) {}
  }
}

export function syncKeyLatency(ms, persist = false) {
  const clamped = Math.max(-50, Math.min(300, Math.round(ms)));
  app.keyLatencyMs = clamped;
  const keyLatSlider = document.getElementById("keyLatSlider");
  const keyLatVal = document.getElementById("keyLatVal");
  if (keyLatSlider) keyLatSlider.value = String(clamped);
  if (keyLatVal) keyLatVal.textContent = `${clamped > 0 ? "+" : ""}${clamped}ms`;
  if (persist) {
    try { localStorage.setItem("rhythm_practice_key_lat", String(clamped)); } catch (_) {}
  }
}

export async function startCalibration() {
  cbs.abortActiveRunTracking("cal");
  const seq = ++app.runSeq;
  ensureAudioCtx(); // Synchronously unlock/resume inside user tap gesture on mobile
  stopScheduledAudio();
  app.state = "READY";
  cbs.resetTargets();
  const ctx = await ensureAudioCtxReady();
  if (seq !== app.runSeq) return;
  calState.startAudioT = ctx.currentTime + 0.45;
  calState.taps = [];
  calState.captured = {};
  resetCalDots();
  app.state = "CAL";
  cbs.setHitBadge(t("calBadgeRunning"), "");
  const btn = document.getElementById("btnCalRun");
  btn.textContent = t("calStopBtn");
  btn.classList.remove("primary");
  btn.classList.add("danger");
  const msgEl = document.getElementById("calMsg");
  msgEl.style.color = "var(--accent)";
  msgEl.textContent = t("calRunningMsg");
  cbs.syncTransportButtons();
  for (let c = 0; c < calState.totalClicks; c++) {
    const isAcc = c % 4 === 0;
    scheduleClick(ctx, calState.startAudioT + c * calState.beatSec, isAcc ? 1318.51 : 880.0, isAcc ? 0.32 : 0.22);
  }
}

export function stopCalibration(resetBadge = true) {
  if (app.state !== "CAL") return;
  stopScheduledAudio();
  app.state = "READY";
  const btn = document.getElementById("btnCalRun");
  btn.textContent = t("calStartBtn");
  btn.classList.remove("danger");
  btn.classList.add("primary");
  resetCalDots();
  if (resetBadge) {
    cbs.setHitBadge(t("badgeStopped"), "");
    const msgEl = document.getElementById("calMsg");
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("calIdleMsg");
  }
  cbs.syncTransportButtons();
}

export function recordCalibrationTap(rawAudioT, source) {
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
  cbs.setHitBadge(`[${source === "AUDIO" ? "AUD" : "KEY"}] ${sign}${Math.round(deltaMs)}ms`, "tight");

  if (idx === calState.totalClicks - 1) {
    finishCalibration();
  }
}

export function finishCalibration() {
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
    cbs.setHitBadge(t("badgeWait"), "");
    cbs.syncTransportButtons();
    return;
  }

  const sorted = calState.taps.map((x) => x.deltaMs).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mad = sorted.reduce((acc, v) => acc + Math.abs(v - med), 0) / sorted.length;
  const audCount = calState.taps.filter((x) => x.source === "AUDIO").length;
  const useAudio = audCount * 2 >= n;
  const rounded = Math.round(med);

  if (useAudio) {
    const applied = Math.max(0, Math.min(300, rounded));
    syncLatency(applied, true);
    msgEl.style.color = "var(--green)";
    msgEl.textContent = t("calApplied", "AUD", applied, n, Math.round(mad));
    cbs.setHitBadge(`AUD +${applied}ms`, "tight");
  } else {
    const applied = Math.max(-50, Math.min(300, rounded));
    syncKeyLatency(applied, true);
    msgEl.style.color = "var(--green)";
    msgEl.textContent = t("calApplied", "KEY", applied, n, Math.round(mad));
    cbs.setHitBadge(`KEY ${applied >= 0 ? "+" : ""}${applied}ms`, "tight");
  }
  cbs.syncTransportButtons();
}

export function toggleCalBar(forceOpen = null) {
  const calBar = document.getElementById("calBar");
  const btnSyncCal = document.getElementById("btnSyncCal");
  const open = forceOpen !== null ? forceOpen : calBar.classList.contains("hidden");
  calBar.classList.toggle("hidden", !open);
  btnSyncCal.classList.toggle("active", open);
  if (!open && app.state === "CAL") stopCalibration(true);
  cbs.onUiChange();
}

export function initCalibration(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };

  document.getElementById("latSlider").addEventListener("input", (e) => syncLatency(Number(e.target.value), true));
  document.getElementById("calAudLatSlider").addEventListener("input", (e) => syncLatency(Number(e.target.value), true));
  document.getElementById("keyLatSlider").addEventListener("input", (e) => syncKeyLatency(Number(e.target.value), true));

  document.getElementById("btnSyncCal").addEventListener("click", (e) => {
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
}
