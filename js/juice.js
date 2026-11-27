// Rhythm Game Juice Package Module
// Self-contained module for:
//   1. Live Combo Counter (#comboBadge) with milestone glow (10+ gold, 25+ fever)
//   2. KEY / PAD percussive Hit SFX (auto-OFF in AUDIO mode; user toggleable for Bluetooth)
//   3. Score Roll-up animation + S/S+ Rank Reveal pop, confetti burst & fanfare
//   4. Drum Backing Beat preference persistence & UI toggle sync
import { t } from "./i18n.js";
import { app } from "./state.js";
import { playKeyHitSfx, playRankFanfare } from "./audio-out.js";

const HIT_SFX_KEY = "rhythm_practice_hitsfx_v1";
const DRUM_BACK_KEY = "rhythm_practice_drum_v1";

export const juiceState = {
  combo: 0,
  maxCombo: 0,
  rollupRafId: null,
};

let cbs = {
  updateMeta: () => {},
};

export function renderComboBadge(bounce = false) {
  const el = document.getElementById("comboBadge");
  if (!el) return;
  const show = juiceState.combo >= 2 && !app.blindGrade && (app.state === "COUNTIN" || app.state === "PLAY");
  el.classList.toggle("hidden", !show);
  if (!show) return;

  const isFever = juiceState.combo >= 25;
  const isHot = juiceState.combo >= 10 && !isFever;
  el.textContent = `${isFever ? "⚡" : "🔥"} ${juiceState.combo} COMBO`;
  el.classList.toggle("hot", isHot);
  el.classList.toggle("fever", isFever);
  if (bounce) {
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }
}

export function resetJuiceCombo() {
  juiceState.combo = 0;
  juiceState.maxCombo = 0;
  if (juiceState.rollupRafId) {
    cancelAnimationFrame(juiceState.rollupRafId);
    juiceState.rollupRafId = null;
  }
  renderComboBadge(false);
}

function shouldPlayHitSfx(source) {
  if (!app.hitSfxOn) return false;
  if (app.audioOn || source === "AUDIO") return false; // Never bleed synthetic clicks into live mic/interface input
  if (app.pitchMode) return false; // Pitch mode already plays real pitched synth notes on press
  return source === "KEY" || source === "PAD" || source === "MIDI";
}

export function onJuiceHit({ tier = "tight", isGhost = false, pitchBad = false, source = "KEY" }) {
  if (pitchBad) {
    juiceState.combo = 0;
    renderComboBadge(false);
    if (shouldPlayHitSfx(source)) playKeyHitSfx("err");
    return;
  }
  if (tier === "tight" || tier === "ok") {
    juiceState.combo += 1;
    if (juiceState.combo > juiceState.maxCombo) juiceState.maxCombo = juiceState.combo;
    renderComboBadge(true);
    if (shouldPlayHitSfx(source)) playKeyHitSfx(isGhost ? "ghost" : tier);
  } else {
    juiceState.combo = 0;
    renderComboBadge(false);
    if (shouldPlayHitSfx(source)) playKeyHitSfx("err");
  }
}

export function onJuiceMiss() {
  if (juiceState.combo !== 0) {
    juiceState.combo = 0;
    renderComboBadge(false);
  }
}

export function onJuiceExtraHit(source = "KEY") {
  if (juiceState.combo !== 0) {
    juiceState.combo = 0;
    renderComboBadge(false);
  }
  if (shouldPlayHitSfx(source)) playKeyHitSfx("err");
}

export function animateScoreRollup(scoreEl, targetScore, formatFn) {
  if (!scoreEl) return;
  if (juiceState.rollupRafId) {
    cancelAnimationFrame(juiceState.rollupRafId);
    juiceState.rollupRafId = null;
  }
  const endVal = Math.max(0, Math.round(Number(targetScore) || 0));
  if (endVal === 0) {
    scoreEl.textContent = formatFn(0);
    return;
  }
  const durMs = 540;
  const startWall = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - startWall) / durMs);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    scoreEl.textContent = formatFn(Math.round(endVal * eased));
    if (p < 1) {
      juiceState.rollupRafId = requestAnimationFrame(step);
    } else {
      juiceState.rollupRafId = null;
      scoreEl.textContent = formatFn(endVal);
    }
  };
  juiceState.rollupRafId = requestAnimationFrame(step);
}

function launchRankConfetti(anchorEl, isSPlus) {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = isSPlus
    ? ["#f59e0b", "#fbbf24", "#10b981", "#3b82f6", "#a855f7", "#ef4444"]
    : ["#10b981", "#34d399", "#fbbf24", "#60a5fa"];
  const count = isSPlus ? 26 : 14;
  const layer = document.createElement("div");
  layer.className = "juice-confetti-layer";
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "juice-confetti";
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    const dist = (isSPlus ? 55 : 38) + Math.random() * (isSPlus ? 65 : 42);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 18;
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", `${dx.toFixed(1)}px`);
    p.style.setProperty("--dy", `${dy.toFixed(1)}px`);
    p.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 520)}deg`);
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 950);
}

export function celebrateRankReveal(rankEl, grade) {
  if (!rankEl) return;
  rankEl.classList.remove("rank-pop", "rank-splus-glow");
  void rankEl.offsetWidth;
  rankEl.classList.add("rank-pop");
  if (grade === "S+" || grade === "S") {
    if (grade === "S+") rankEl.classList.add("rank-splus-glow");
    playRankFanfare(grade);
    launchRankConfetti(rankEl, grade === "S+");
  }
}

export function syncJuiceUi() {
  const sfxBtn = document.getElementById("btnHitSfx");
  if (sfxBtn) {
    const autoOff = Boolean(app.audioOn);
    sfxBtn.textContent = autoOff
      ? t("hitSfxAutoOff")
      : (app.hitSfxOn ? t("hitSfxOn") : t("hitSfxOff"));
    sfxBtn.classList.toggle("active", app.hitSfxOn && !autoOff);
    sfxBtn.disabled = autoOff;
  }
  const drumBtn = document.getElementById("btnDrumBacking");
  if (drumBtn) {
    drumBtn.textContent = app.drumBacking ? t("drumOn") : t("drumOff");
    drumBtn.classList.toggle("active", app.drumBacking);
  }
}

export function initJuice(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };
  try {
    const savedSfx = localStorage.getItem(HIT_SFX_KEY);
    if (savedSfx === "0") app.hitSfxOn = false;
    else if (savedSfx === "1") app.hitSfxOn = true;
    const savedDrum = localStorage.getItem(DRUM_BACK_KEY);
    if (savedDrum === "1") app.drumBacking = true;
  } catch (_) {}

  const sfxBtn = document.getElementById("btnHitSfx");
  if (sfxBtn) {
    sfxBtn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      app.hitSfxOn = !app.hitSfxOn;
      try { localStorage.setItem(HIT_SFX_KEY, app.hitSfxOn ? "1" : "0"); } catch (_) {}
      if (app.hitSfxOn && !app.audioOn) playKeyHitSfx("tight");
      syncJuiceUi();
      cbs.updateMeta();
    });
  }

  const drumBtn = document.getElementById("btnDrumBacking");
  if (drumBtn) {
    drumBtn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      app.drumBacking = !app.drumBacking;
      if (app.drumBacking && !app.soundOn) app.soundOn = true;
      try { localStorage.setItem(DRUM_BACK_KEY, app.drumBacking ? "1" : "0"); } catch (_) {}
      syncJuiceUi();
      cbs.updateMeta();
    });
  }

  syncJuiceUi();
}
