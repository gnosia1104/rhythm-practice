// Interactive Spotlight Walkthrough Engine (3 Decks: Onboarding Tour · User Guide · Shortcuts)
import { app, tourState } from "./state.js";
import { t, getCurLang } from "./i18n.js";

export const TOUR_STORAGE_KEY = "rhythm_practice_tour_v1";

const DECK_KEYS = {
  tour: "tourSteps",
  guide: "guideTourSteps",
  grading: "gradingTourSteps",
  shortcuts: "shortcutTourSteps",
};

const tourCbs = {
  stopRun: () => {},
  applyLanguage: () => {},
};

export function markTourSeen() {
  try { localStorage.setItem(TOUR_STORAGE_KEY, "1"); } catch (_) {}
}

export function hasSeenTour() {
  try { return localStorage.getItem(TOUR_STORAGE_KEY) === "1"; } catch (_) { return false; }
}

function getActiveSteps(mode = tourState.mode) {
  const key = DECK_KEYS[mode] || "tourSteps";
  return t(key) || t("tourSteps") || [];
}

export function positionTourElements() {
  if (!tourState.open) return;
  const steps = getActiveSteps();
  const step = steps[tourState.idx];
  const backdrop = document.getElementById("tourBackdrop");
  const spot = document.getElementById("tourSpotlight");
  const card = document.getElementById("tourCard");
  if (!step) return;

  const targetEl = step.target ? document.querySelector(step.target) : null;
  if (!targetEl) {
    backdrop.classList.remove("hidden");
    spot.classList.add("hidden");
    card.classList.add("centered");
    card.style.top = "";
    card.style.left = "";
    return;
  }

  backdrop.classList.add("hidden");
  spot.classList.remove("hidden");
  card.classList.remove("centered");

  const rect = targetEl.getBoundingClientRect();
  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = Math.max(4, rect.left - pad);
  const sy = Math.max(4, rect.top - pad);
  const sw = Math.min(vw - sx - 4, rect.width + pad * 2);
  const sh = Math.min(vh - sy - 4, rect.height + pad * 2);
  spot.style.left = `${sx}px`;
  spot.style.top = `${sy}px`;
  spot.style.width = `${Math.max(24, sw)}px`;
  spot.style.height = `${Math.max(24, sh)}px`;

  const cardRect = card.getBoundingClientRect();
  const cw = cardRect.width || Math.min(430, vw - 24);
  const ch = cardRect.height || 230;
  const gap = 14;
  let cx = sx + sw / 2 - cw / 2;
  cx = Math.max(12, Math.min(vw - cw - 12, cx));

  let cy;
  const spaceBelow = vh - (sy + sh) - gap;
  const spaceAbove = sy - gap;
  if (spaceBelow >= ch + 12) {
    cy = sy + sh + gap;
  } else if (spaceAbove >= ch + 12) {
    cy = sy - ch - gap;
  } else {
    const spotCenterY = sy + sh / 2;
    cy = spotCenterY > vh * 0.55 ? 12 : Math.max(12, vh - ch - 12);
  }
  cy = Math.max(12, Math.min(vh - ch - 12, cy));
  card.style.left = `${cx}px`;
  card.style.top = `${cy}px`;
}

export function syncTourButtonsLanguage() {
  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTxt("btnFooterShortcutTour", "btnFooterShortcutTour");
  setTxt("btnGuideSpotlight", "btnGuideSpotlight");
  setTxt("btnGuideGradingTour", "btnGuideGradingTour");
  const modeLabels = {
    tour: "tourModeTour",
    guide: "tourModeGuide",
    grading: "tourModeGrading",
    shortcuts: "tourModeShortcuts",
  };
  document.querySelectorAll(".tour-mode-tab").forEach((b) => {
    const k = modeLabels[b.dataset.tourMode];
    if (k) b.textContent = t(k);
  });
}

export function renderTourStep(shouldScroll = true) {
  const steps = getActiveSteps();
  if (!steps.length) return;
  tourState.idx = Math.max(0, Math.min(steps.length - 1, tourState.idx));
  const step = steps[tourState.idx];

  syncTourButtonsLanguage();
  document.querySelectorAll(".tour-mode-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tourMode === tourState.mode);
  });

  document.getElementById("tourStepBadge").textContent = `${tourState.idx + 1} / ${steps.length}`;
  document.getElementById("tourTitle").textContent = step.title;
  document.getElementById("tourBody").textContent = step.body;

  const chipsEl = document.getElementById("tourChips");
  const chips = Array.isArray(step.chips)
    ? step.chips
    : (tourState.mode === "tour" && tourState.idx === 0 ? (t("tourWelcomeChips") || []) : []);
  if (chips.length) {
    chipsEl.innerHTML = chips.map((ch) => `<span class="tour-chip">${ch}</span>`).join("");
    chipsEl.classList.remove("hidden");
  } else {
    chipsEl.innerHTML = "";
    chipsEl.classList.add("hidden");
  }

  const isBasicsCheck = step.kind === "basicsCheck";
  const choicesEl = document.getElementById("tourChoices");
  if (choicesEl) {
    choicesEl.classList.toggle("hidden", !isBasicsCheck);
    if (isBasicsCheck) {
      const goBtn = document.getElementById("btnTourGoLearn");
      const knowBtn = document.getElementById("btnTourKnowBasics");
      if (goBtn) goBtn.textContent = t("tourChoiceGoLearn");
      if (knowBtn) knowBtn.textContent = t("tourChoiceKnowBasics");
    }
  }

  const dotsEl = document.getElementById("tourDots");
  dotsEl.innerHTML = steps.map((_, i) => `<span class="tour-dot${i === tourState.idx ? " active" : ""}"></span>`).join("");

  document.querySelectorAll(".tour-lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tourLang === getCurLang());
  });

  const btnSkip = document.getElementById("btnTourSkip");
  const btnPrev = document.getElementById("btnTourPrev");
  const btnNext = document.getElementById("btnTourNext");
  btnSkip.textContent = t("tourSkip");
  btnPrev.textContent = t("tourPrev");
  btnNext.textContent = tourState.idx === steps.length - 1 ? t("tourDone") : t("tourNext");
  btnSkip.classList.toggle("hidden", tourState.idx === steps.length - 1);
  btnPrev.classList.toggle("hidden", tourState.idx === 0);
  btnNext.classList.toggle("hidden", isBasicsCheck);

  if (shouldScroll && step.target) {
    const targetEl = document.querySelector(step.target);
    if (targetEl) {
      const r = targetEl.getBoundingClientRect();
      if (r.top < 16 || r.bottom > window.innerHeight - 16) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }
  requestAnimationFrame(() => {
    positionTourElements();
    window.setTimeout(positionTourElements, 260);
  });
}

export function openTour(startIdx = 0, mode = "tour") {
  if (app.state === "COUNTIN" || app.state === "PLAY" || app.state === "DEMO") {
    tourCbs.stopRun();
  }
  tourState.mode = DECK_KEYS[mode] ? mode : "tour";
  tourState.open = true;
  tourState.idx = startIdx;
  document.getElementById("tourOverlay").classList.remove("hidden");
  renderTourStep(true);
}

export function closeTour(persist = true) {
  tourState.open = false;
  document.getElementById("tourOverlay").classList.add("hidden");
  if (persist) markTourSeen();
}

export function nextTourStep() {
  const steps = getActiveSteps();
  if (tourState.idx >= steps.length - 1) {
    closeTour(true);
  } else {
    tourState.idx++;
    renderTourStep(true);
  }
}

export function prevTourStep() {
  if (tourState.idx > 0) {
    tourState.idx--;
    renderTourStep(true);
  }
}

export function initTour(cbs) {
  Object.assign(tourCbs, cbs);
  document.getElementById("btnTour").addEventListener("click", (e) => {
    e.currentTarget.blur();
    openTour(0, "tour");
  });
  const btnGuide = document.getElementById("btnGuide");
  if (btnGuide) {
    btnGuide.addEventListener("click", (e) => {
      e.currentTarget.blur();
      openTour(0, "guide");
    });
  }
  const btnGuideSpot = document.getElementById("btnGuideSpotlight");
  if (btnGuideSpot) {
    btnGuideSpot.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.blur();
      openTour(0, "guide");
    });
  }
  const btnGuideGrade = document.getElementById("btnGuideGradingTour");
  if (btnGuideGrade) {
    btnGuideGrade.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.blur();
      openTour(0, "grading");
    });
  }
  const btnFooterSc = document.getElementById("btnFooterShortcutTour");
  if (btnFooterSc) {
    btnFooterSc.addEventListener("click", (e) => {
      e.currentTarget.blur();
      openTour(0, "shortcuts");
    });
  }

  document.querySelectorAll(".tour-mode-tab").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      const nextMode = btn.dataset.tourMode;
      if (!nextMode || !DECK_KEYS[nextMode]) return;
      tourState.mode = nextMode;
      tourState.idx = 0;
      renderTourStep(true);
    });
  });

  document.getElementById("btnTourClose").addEventListener("click", () => closeTour(true));
  document.getElementById("btnTourSkip").addEventListener("click", () => closeTour(true));
  document.getElementById("btnTourPrev").addEventListener("click", () => prevTourStep());
  document.getElementById("btnTourNext").addEventListener("click", () => nextTourStep());
  const goLearnBtn = document.getElementById("btnTourGoLearn");
  if (goLearnBtn) {
    goLearnBtn.addEventListener("click", () => {
      const curLang = getCurLang();
      try { localStorage.setItem("rhythm_practice_lang", curLang); } catch (_) {}
      markTourSeen();
      window.location.href = `learn.html?lang=${encodeURIComponent(curLang)}`;
    });
  }
  const knowBasicsBtn = document.getElementById("btnTourKnowBasics");
  if (knowBasicsBtn) {
    knowBasicsBtn.addEventListener("click", () => nextTourStep());
  }
  document.querySelectorAll(".tour-lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tourCbs.applyLanguage(btn.dataset.tourLang);
    });
  });
  window.addEventListener("resize", () => { if (tourState.open) positionTourElements(); });
  window.addEventListener("scroll", () => { if (tourState.open) positionTourElements(); }, { passive: true });
  syncTourButtonsLanguage();
}
