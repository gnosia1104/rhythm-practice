// Categorized Toolbar Dropdowns (🎚️ Difficulty · ⋯ Tools), Click Volume & Guide Accordion
import { app, getTimeSig, tripletsAllowed } from "./state.js";
import { t } from "./i18n.js";
import { setClickMasterGainVol, ensureAudioCtx, scheduleClick } from "./audio-out.js";

const TOOLBAR_MENUS = [
  { wrapId: "diffWrap", btnId: "btnDiffMenu", dropId: "diffDropdown", closeOnClick: false },
  { wrapId: "toolsWrap", btnId: "btnToolsMenu", dropId: "toolsDropdown", closeOnClick: true },
];

export function closeAllToolbarMenus(exceptDropId = null) {
  for (const m of TOOLBAR_MENUS) {
    if (m.dropId === exceptDropId) continue;
    const drop = document.getElementById(m.dropId);
    const btn = document.getElementById(m.btnId);
    if (drop && !drop.classList.contains("hidden")) {
      drop.classList.add("hidden");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  }
}

export function syncAllDropdownBadges() {
  const allowTri = tripletsAllowed(app.level, getTimeSig());
  const effTri = allowTri ? app.tripletMode : 0;
  const tTag = effTri === 2 ? "T2" : (effTri === 1 ? "T1" : "");
  const lvFlags = `${tTag}${app.staccatoOn ? "S" : ""}${app.ghostOn ? "G" : ""}`;
  const diffParts = [`Lv${app.level}${lvFlags}`, app.timeSig, `${app.numBars}B`];
  if (!app.soundOn) diffParts.push("M×");
  if (app.blindGrade) diffParts.push("Blind");
  if (app.showBeatNums) diffParts.push("+B");
  if (app.showCursor) diffParts.push("+C");
  if (app.drumBacking) diffParts.push("🥁");
  if (app.endlessMode) diffParts.push("♾️");
  if (app.suddenDeath) diffParts.push("💀");
  const diffDropOpen = !document.getElementById("diffDropdown").classList.contains("hidden");
  document.getElementById("diffSummaryBadge").textContent = diffParts.join(" · ");
  document.getElementById("btnDiffMenu").classList.toggle("active", diffDropOpen);

  const anyDrill = (app.gapClick !== "OFF") || (app.fadeBeats > 0) || app.rushOn || app.pitchMode;
  const anyPanelOpen =
    !document.getElementById("editorBar").classList.contains("hidden") ||
    !document.getElementById("drillBar").classList.contains("hidden") ||
    !document.getElementById("pitchBar").classList.contains("hidden") ||
    !document.getElementById("achBar").classList.contains("hidden") ||
    !document.getElementById("lbBar").classList.contains("hidden") ||
    !document.getElementById("diagBar").classList.contains("hidden") ||
    !document.getElementById("calBar").classList.contains("hidden");
  const toolsDropOpen = !document.getElementById("toolsDropdown").classList.contains("hidden");
  document.getElementById("btnToolsMenu").classList.toggle("active", toolsDropOpen || anyDrill || anyPanelOpen);
  document.getElementById("toolsActiveDot").classList.toggle("hidden", !anyDrill);
}

export const syncToolsMenuBadge = syncAllDropdownBadges;

export function clampDropdownToViewport(drop) {
  if (!drop || drop.classList.contains("hidden")) return;
  drop.style.left = "0px";
  drop.style.right = "auto";
  const r = drop.getBoundingClientRect();
  const vw = window.innerWidth;
  let shift = 0;
  if (r.right > vw - 12) shift -= (r.right - (vw - 12));
  if (r.left + shift < 12) shift += (12 - (r.left + shift));
  if (shift !== 0) drop.style.left = `${Math.round(shift)}px`;
}

export function syncClickVol(val, persist = true) {
  const v = Math.max(0, Math.min(200, Math.round(Number(val) || 0)));
  app.clickVol = v;
  document.getElementById("clickVolSlider").value = String(v);
  document.getElementById("clickVolVal").textContent = `${v}%`;
  setClickMasterGainVol(v);
  if (persist) {
    try { localStorage.setItem("rhythm_practice_click_vol", String(v)); } catch (_) {}
  }
}

export function syncGuideUi() {
  const guideCard = document.getElementById("guideCard");
  const btnGuide = document.getElementById("btnGuide");
  const guideToggleHint = document.getElementById("guideToggleHint");
  const opened = guideCard.open;
  btnGuide.classList.toggle("active", opened);
  guideToggleHint.textContent = opened ? t("guideClose") : t("guideOpen");
}

export function initToolbarMenus() {
  const guideCard = document.getElementById("guideCard");
  const btnGuide = document.getElementById("btnGuide");
  guideCard.addEventListener("toggle", syncGuideUi);
  btnGuide.addEventListener("click", () => {
    guideCard.open = !guideCard.open;
    syncGuideUi();
    if (guideCard.open) {
      guideCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  document.getElementById("btnDiffClose").addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllToolbarMenus();
    syncAllDropdownBadges();
  });

  for (const m of TOOLBAR_MENUS) {
    const btn = document.getElementById(m.btnId);
    const drop = document.getElementById(m.dropId);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.currentTarget.blur();
      const willOpen = drop.classList.contains("hidden");
      closeAllToolbarMenus(willOpen ? m.dropId : null);
      drop.classList.toggle("hidden", !willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen) clampDropdownToViewport(drop);
      syncAllDropdownBadges();
    });
    if (m.closeOnClick) {
      drop.addEventListener("click", (e) => {
        if (e.target.closest("button")) {
          window.setTimeout(() => {
            drop.classList.add("hidden");
            btn.setAttribute("aria-expanded", "false");
            syncAllDropdownBadges();
          }, 0);
        }
      });
    }
  }

  window.addEventListener("resize", () => {
    for (const m of TOOLBAR_MENUS) {
      clampDropdownToViewport(document.getElementById(m.dropId));
    }
  });
  document.addEventListener("click", (e) => {
    const insideAny = TOOLBAR_MENUS.some((m) => document.getElementById(m.wrapId).contains(e.target));
    if (!insideAny) {
      closeAllToolbarMenus();
      syncAllDropdownBadges();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Escape") {
      closeAllToolbarMenus();
      syncAllDropdownBadges();
    }
  });
  ["btnEdClose", "btnCalClose", "btnDrillClose", "btnPitchClose"].forEach((id) => {
    const elBtn = document.getElementById(id);
    if (elBtn) elBtn.addEventListener("click", () => window.setTimeout(syncAllDropdownBadges, 0));
  });

  document.getElementById("clickVolSlider").addEventListener("input", (e) => {
    syncClickVol(e.target.value, true);
  });
  document.getElementById("clickVolSlider").addEventListener("change", (e) => {
    syncClickVol(e.target.value, true);
    e.target.blur();
    if ((app.state === "READY" || app.state === "DONE") && app.clickVol > 0) {
      const ctx = ensureAudioCtx();
      scheduleClick(ctx, ctx.currentTime + 0.02, 1318.51, 0.32);
    }
  });
}
