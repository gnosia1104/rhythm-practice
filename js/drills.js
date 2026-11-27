// Special Training BETA Module (Gap Click · Look-ahead Fade-out · BPM Rush)
import { app } from "./state.js";
import { t } from "./i18n.js";

let cbs = {
  updateMeta: () => {},
  newPhrase: () => {},
  onUiChange: () => {},
};

export function cancelRushTimer(resetRound = false) {
  if (app.rushTimerId) {
    window.clearTimeout(app.rushTimerId);
    app.rushTimerId = null;
  }
  if (resetRound) app.rushRound = 0;
}

export function loadRushBest() {
  try {
    const raw = localStorage.getItem("rhythm_practice_rush_best");
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.peakBpm)) return { peakBpm: p.peakBpm, rounds: p.rounds || 0 };
    }
  } catch (_) {}
  return null;
}

export function saveRushBest(bpm, rounds) {
  const prev = loadRushBest();
  const next = {
    peakBpm: prev ? Math.max(prev.peakBpm, bpm) : bpm,
    rounds: prev ? Math.max(prev.rounds, rounds) : rounds,
  };
  try { localStorage.setItem("rhythm_practice_rush_best", JSON.stringify(next)); } catch (_) {}
  syncDrillUi();
  return next;
}

export function clearFadeOutClasses() {
  document.querySelectorAll("#scoreSvg .beat-fade.faded").forEach((n) => n.classList.remove("faded"));
}

export function syncDrillUi() {
  const bar = document.getElementById("drillBar");
  if (!bar) return;
  const barOpen = !bar.classList.contains("hidden");
  const anyActive = (app.gapClick !== "OFF") || (app.fadeBeats > 0) || app.rushOn;
  document.getElementById("btnDrill").classList.toggle("active", barOpen || anyActive);
  cbs.onUiChange();
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

export function initDrills(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };

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
    cbs.updateMeta();
    syncDrillUi();
  });
  document.getElementById("fadeOutSelect").addEventListener("change", (e) => {
    app.fadeBeats = Number(e.target.value) || 0;
    clearFadeOutClasses();
    e.target.blur();
    cbs.updateMeta();
    syncDrillUi();
  });
  document.getElementById("btnRushToggle").addEventListener("click", (e) => {
    e.currentTarget.blur();
    app.rushOn = !app.rushOn;
    cancelRushTimer(true);
    if (app.rushOn && (app.dailyDate || app.customMode)) {
      cbs.newPhrase(); // Exit Daily/Custom so Rush can generate fresh phrases each round
    }
    const msgEl = document.getElementById("drillMsg");
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("drillIdleMsg");
    cbs.updateMeta();
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
    cbs.updateMeta();
    syncDrillUi();
  });
}
