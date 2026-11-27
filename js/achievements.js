// Achievements, Titles, Steam-Style Unlock Toasts & Local JSON Backup/Restore
import { getCurLang, t } from "./i18n.js";
import { getTodayDateStr } from "./rhythm.js";

const ACH_STORAGE_KEY = "rhythm_practice_achievements_v1";

// LocalStorage keys included in full JSON backup/restore
const BACKUP_KEYS = [
  ACH_STORAGE_KEY,
  "rhythm_practice_history_v1",
  "rhythm_practice_endless_best_v1",
  "rhythm_practice_rush_best",
  "rhythm_practice_daily_v1",
  "rhythm_practice_daily_plus_v1",
  "rhythm_practice_aud_lat",
  "rhythm_practice_key_lat",
  "rhythm_practice_click_vol",
  "rhythm_room_nick_v1",
  "rhythm_practice_lang",
];

export const ACHIEVEMENTS = [
  // Habit & Cumulative
  {
    id: "first_take", cat: "habit", icon: "🎵",
    name: { ko: "첫 발걸음", en: "First Steps", ja: "最初の一歩" },
    desc: { ko: "첫 초견 연주 완주", en: "Complete your first sight-reading take", ja: "初めての初見演奏を完走" },
    title: { ko: "신입 초견러", en: "Rookie Reader", ja: "初見ビギナー" },
  },
  {
    id: "notes_100", cat: "habit", icon: "🥁",
    name: { ko: "100노트 돌파", en: "Century Club", ja: "100ノート達成" },
    desc: { ko: "누적 적중 노트 100개 달성", en: "Hit 100 cumulative notes", ja: "累計100ノート的中" },
    title: { ko: "리듬 입문자", en: "Steady Tapper", ja: "リズム入門者" },
  },
  {
    id: "notes_1000", cat: "habit", icon: "🔥",
    name: { ko: "1,000노트 마스터", en: "Groove Grinder", ja: "1,000ノート突破" },
    desc: { ko: "누적 적중 노트 1,000개 달성", en: "Hit 1,000 cumulative notes", ja: "累計1,000ノート的中" },
    title: { ko: "그루브 장인", en: "Groove Grinder", ja: "グルーヴ職人" },
  },
  {
    id: "streak_3", cat: "habit", icon: "📅",
    name: { ko: "3일 연속 출석", en: "3-Day Streak", ja: "3日連続練習" },
    desc: { ko: "3일 연속으로 연습 완료", en: "Practice 3 days in a row", ja: "3日連続で演奏完了" },
    title: { ko: "꾸준한 연주자", en: "Consistent Player", ja: "コツコツ練習家" },
  },
  {
    id: "streak_7", cat: "habit", icon: "🌟",
    name: { ko: "7일 연속 출석", en: "7-Day Streak", ja: "7日連続練習" },
    desc: { ko: "7일 연속으로 연습 완료", en: "Practice 7 days in a row", ja: "7日連続で演奏完了" },
    title: { ko: "매일 초견러", en: "Daily Sight-Reader", ja: "毎日初見マスター" },
  },
  // Skill & Mastery
  {
    id: "clean_rest", cat: "skill", icon: "🤫",
    name: { ko: "쉼표의 미학", en: "Clean Silence", ja: "休符の美学" },
    desc: { ko: "쉼표 포함 악보에서 쉼표 에러 0회 + 95%↑", en: "0 rest errors with ≥95% accuracy on a score with rests", ja: "休符あり譜面で休符エラー0回＆95%以上" },
    title: { ko: "뮤트 장인", en: "Mute Master", ja: "ミュート職人" },
  },
  {
    id: "s_plus", cat: "skill", icon: "⭐",
    name: { ko: "완벽한 테이크", en: "S+ Perfection", ja: "S+ パーフェクト" },
    desc: { ko: "S+ 랭크 달성", en: "Achieve an S+ rank", ja: "S+ ランクを達成" },
    title: { ko: "퍼펙트 포켓", en: "Perfect Pocket", ja: "パーフェクトポケット" },
  },
  {
    id: "human_metro", cat: "skill", icon: "⏱️",
    name: { ko: "휴먼 메트로놈", en: "Human Metronome", ja: "ヒューマンメトロノーム" },
    desc: { ko: "BPM 120 이상에서 100% 적중 + SD ≤ 10ms", en: "100% accuracy & SD ≤ 10ms at 120+ BPM", ja: "BPM120以上で100%的中＆SD 10ms以内" },
    title: { ko: "휴먼 메트로놈", en: "Human Metronome", ja: "ヒューマンメトロノーム" },
  },
  {
    id: "syncopation_16", cat: "skill", icon: "⚡",
    name: { ko: "16분음표 정복", en: "16th-Note Sniper", ja: "16分音符マスター" },
    desc: { ko: "Lv5~6 (16분음표) 노미스(100%) 클리어", en: "100% no-miss clear on Lv5–6 (16th notes)", ja: "Lv5〜6（16分音符）ノーミス達成" },
    title: { ko: "16분 킬러", en: "16th-Note Sniper", ja: "16分スナイパー" },
  },
  {
    id: "endless_20", cat: "skill", icon: "♾️",
    name: { ko: "엔드리스 20마디", en: "Survivor 20", ja: "エンドレス20小節" },
    desc: { ko: "엔드리스 모드 20마디 이상 생존", en: "Survive 20+ bars in Endless mode", ja: "エンドレスで20小節以上生存" },
    title: { ko: "서바이버", en: "Endless Survivor", ja: "サバイバー" },
  },
  {
    id: "endless_50", cat: "skill", icon: "👑",
    name: { ko: "엔드리스 50마디", en: "Iron Sight-Reader", ja: "エンドレス50小節" },
    desc: { ko: "엔드리스 모드 50마디 이상 생존", en: "Survive 50+ bars in Endless mode", ja: "エンドレスで50小節以上生存" },
    title: { ko: "철인 초견러", en: "Iron Sight-Reader", ja: "鉄人サイトリーダー" },
  },
  {
    id: "room_win", cat: "skill", icon: "⚔️",
    name: { ko: "방 대결 우승", en: "Room Champion", ja: "ルーム対戦優勝" },
    desc: { ko: "실시간 방 대결(2인 이상)에서 1등 달성", en: "Win 1st place in a 2+ player live room", ja: "2名以上のリアルタイム対戦で1位獲得" },
    title: { ko: "방 대결 챔피언", en: "Room Champion", ja: "対戦チャンピオン" },
  },
];

const ACH_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

let achCbs = {
  playUnlockChime: () => {},
  onDataRestored: () => {},
  onUiChange: () => {},
};

export const achState = {
  unlocked: {}, // id -> "YYYY-MM-DD"
  equippedTitleId: "",
  totalHits: 0,
  totalTakes: 0,
  streak: 0,
  lastPlayDate: "",
};

function loc(obj) {
  if (!obj) return "";
  const lang = getCurLang();
  return obj[lang] || obj.en || obj.ko || "";
}

function loadAchState() {
  try {
    const raw = localStorage.getItem(ACH_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      achState.unlocked = (parsed.unlocked && typeof parsed.unlocked === "object") ? parsed.unlocked : {};
      achState.equippedTitleId = typeof parsed.equippedTitleId === "string" ? parsed.equippedTitleId : "";
      achState.totalHits = Number(parsed.totalHits) || 0;
      achState.totalTakes = Number(parsed.totalTakes) || 0;
      achState.streak = Number(parsed.streak) || 0;
      achState.lastPlayDate = typeof parsed.lastPlayDate === "string" ? parsed.lastPlayDate : "";
    }
  } catch (_) {}
}

function saveAchState() {
  try {
    localStorage.setItem(ACH_STORAGE_KEY, JSON.stringify({
      unlocked: achState.unlocked,
      equippedTitleId: achState.equippedTitleId,
      totalHits: achState.totalHits,
      totalTakes: achState.totalTakes,
      streak: achState.streak,
      lastPlayDate: achState.lastPlayDate,
    }));
  } catch (_) {}
}

function diffDays(prevStr, curStr) {
  if (!prevStr || !curStr) return 999;
  const a = new Date(prevStr + "T00:00:00");
  const b = new Date(curStr + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 999;
  return Math.round((b - a) / 86400000);
}

function bumpStreak() {
  const today = getTodayDateStr();
  if (achState.lastPlayDate === today) return;
  const gap = diffDays(achState.lastPlayDate, today);
  achState.streak = (gap === 1) ? (achState.streak + 1) : 1;
  achState.lastPlayDate = today;
}

function showUnlockToast(ach) {
  const stack = document.getElementById("achToastStack");
  if (!stack || !ach) return;
  const el = document.createElement("div");
  el.className = "ach-toast";
  el.innerHTML = `<div class="ach-toast-icon">${ach.icon}</div>
    <div class="ach-toast-body">
      <div class="ach-toast-kicker">${t("achToastKicker")}</div>
      <div class="ach-toast-title">${loc(ach.name)}</div>
      <div class="ach-toast-desc">${loc(ach.desc)}</div>
    </div>`;
  stack.appendChild(el);
  window.setTimeout(() => el.classList.add("fade-out"), 3800);
  window.setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4300);
}

function unlockIds(ids) {
  const today = getTodayDateStr();
  const newly = [];
  for (const id of ids) {
    if (!ACH_MAP.has(id) || achState.unlocked[id]) continue;
    achState.unlocked[id] = today;
    const ach = ACH_MAP.get(id);
    newly.push(ach);
    if (!achState.equippedTitleId) {
      achState.equippedTitleId = id;
    }
  }
  if (newly.length) {
    saveAchState();
    achCbs.playUnlockChime();
    newly.forEach((ach, idx) => {
      window.setTimeout(() => showUnlockToast(ach), idx * 450);
    });
    renderAchievementsUi();
  }
}

export function evaluateStandardRunAchievements({ hits, total, acc, sd, bpm, level, rank, restCount, restErrs }) {
  achState.totalTakes += 1;
  achState.totalHits += Math.max(0, Number(hits) || 0);
  bumpStreak();
  saveAchState();

  const toUnlock = ["first_take"];
  if (achState.totalHits >= 100) toUnlock.push("notes_100");
  if (achState.totalHits >= 1000) toUnlock.push("notes_1000");
  if (achState.streak >= 3) toUnlock.push("streak_3");
  if (achState.streak >= 7) toUnlock.push("streak_7");
  if (restCount > 0 && restErrs === 0 && acc >= 95) toUnlock.push("clean_rest");
  if (rank === "S+") toUnlock.push("s_plus");
  if (bpm >= 120 && total >= 6 && hits === total && sd <= 10) toUnlock.push("human_metro");
  if (level >= 5 && total >= 8 && hits === total && restErrs === 0) toUnlock.push("syncopation_16");

  unlockIds(toUnlock);
  renderAchievementsUi();
}

export function evaluateEndlessAchievements({ survivedBars, hits }) {
  achState.totalTakes += 1;
  achState.totalHits += Math.max(0, Number(hits) || 0);
  bumpStreak();
  saveAchState();

  const toUnlock = ["first_take"];
  if (achState.totalHits >= 100) toUnlock.push("notes_100");
  if (achState.totalHits >= 1000) toUnlock.push("notes_1000");
  if (achState.streak >= 3) toUnlock.push("streak_3");
  if (achState.streak >= 7) toUnlock.push("streak_7");
  if (survivedBars >= 20) toUnlock.push("endless_20");
  if (survivedBars >= 50) toUnlock.push("endless_50");

  unlockIds(toUnlock);
  renderAchievementsUi();
}

export function evaluateRoomWinAchievement(playerCount) {
  if ((playerCount || 0) >= 2) {
    unlockIds(["room_win"]);
  }
}

export function formatLocalizedTitle(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Direct achievement ID match (preferred universal global format)
  if (ACH_MAP.has(s)) {
    const a = ACH_MAP.get(s);
    return `${a.icon} ${loc(a.title)}`;
  }
  // Backwards-compatible fallback for any legacy localized title strings stored locally
  for (const a of ACHIEVEMENTS) {
    for (const lang of ["ko", "en", "ja"]) {
      if (s === a.title[lang] || s === `${a.icon} ${a.title[lang]}`) {
        return `${a.icon} ${loc(a.title)}`;
      }
    }
  }
  return s;
}

export function getEquippedTitleAndBadges() {
  const unlockedList = ACHIEVEMENTS.filter((a) => Boolean(achState.unlocked[a.id]));
  const eq = achState.equippedTitleId && achState.unlocked[achState.equippedTitleId]
    ? ACH_MAP.get(achState.equippedTitleId)
    : (unlockedList[unlockedList.length - 1] || null);
  return {
    titleId: eq ? eq.id : "",
    title: eq ? `${eq.icon} ${loc(eq.title)}` : "",
    badges: unlockedList.slice(-6).map((a) => a.icon),
    unlockedCount: unlockedList.length,
    totalCount: ACHIEVEMENTS.length,
  };
}

export function exportLocalDataJson() {
  const payload = {
    app: "Rhythm Sight-Reader",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {},
  };
  for (const key of BACKUP_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) payload.data[key] = val;
    } catch (_) {}
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rhythm-sight-reader-backup-${getTodayDateStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function importLocalDataJson(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
      return false;
    }
    const allowed = new Set(BACKUP_KEYS);
    let count = 0;
    for (const [k, v] of Object.entries(parsed.data)) {
      if (!allowed.has(k) || typeof v !== "string") continue;
      localStorage.setItem(k, v);
      count += 1;
    }
    if (count === 0) return false;
    loadAchState();
    renderAchievementsUi();
    achCbs.onDataRestored();
    return true;
  } catch (_) {
    return false;
  }
}

export function renderAchievementsUi() {
  const unlockedCnt = Object.keys(achState.unlocked).filter((id) => ACH_MAP.has(id)).length;
  const totalCnt = ACHIEVEMENTS.length;
  const badgeEl = document.getElementById("achCountBadge");
  if (badgeEl) badgeEl.textContent = `${unlockedCnt}/${totalCnt}`;

  const summaryEl = document.getElementById("achSummaryStats");
  if (summaryEl) {
    summaryEl.textContent = t("achSummary", unlockedCnt, totalCnt, achState.totalHits.toLocaleString(), achState.streak);
  }

  const sel = document.getElementById("achTitleSelect");
  if (sel) {
    const unlockedList = ACHIEVEMENTS.filter((a) => Boolean(achState.unlocked[a.id]));
    const opts = [`<option value="">${t("achNoTitle")}</option>`];
    for (const a of unlockedList) {
      const selected = achState.equippedTitleId === a.id ? " selected" : "";
      opts.push(`<option value="${a.id}"${selected}>${a.icon} ${loc(a.title)}</option>`);
    }
    sel.innerHTML = opts.join("");
  }

  const grid = document.getElementById("achGrid");
  if (!grid) return;
  grid.innerHTML = ACHIEVEMENTS.map((a) => {
    const date = achState.unlocked[a.id];
    const isOpen = Boolean(date);
    const catLbl = a.cat === "skill" ? t("achCatSkill") : t("achCatHabit");
    return `<div class="ach-card${isOpen ? " unlocked" : " locked"}">
      <div class="ach-card-icon">${isOpen ? a.icon : "🔒"}</div>
      <div class="ach-card-body">
        <div class="ach-card-top">
          <span class="ach-card-name">${loc(a.name)}</span>
          <span class="ach-cat-tag ${a.cat}">${catLbl}</span>
        </div>
        <div class="ach-card-desc">${loc(a.desc)}</div>
        <div class="ach-card-meta">${isOpen ? `✓ ${date} · 🏷️ ${loc(a.title)}` : t("achLockedHint")}</div>
      </div>
    </div>`;
  }).join("");
}

export function syncAchievementsLanguage() {
  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTxt("btnAchText", "btnAch");
  setTxt("lblAchTitle", "achPanelTitle");
  setTxt("lblAchEquip", "achEquipLbl");
  setTxt("btnAchExport", "achExportBtn");
  setTxt("btnAchImport", "achImportBtn");
  renderAchievementsUi();
}

export function toggleAchBar(forceOpen = null) {
  const bar = document.getElementById("achBar");
  if (!bar) return;
  const willOpen = forceOpen !== null ? forceOpen : bar.classList.contains("hidden");
  bar.classList.toggle("hidden", !willOpen);
  const btn = document.getElementById("btnAchievements");
  if (btn) btn.classList.toggle("active", willOpen);
  if (willOpen) renderAchievementsUi();
  achCbs.onUiChange();
}

export function initAchievements(callbacks = {}) {
  achCbs = { ...achCbs, ...callbacks };
  loadAchState();

  document.getElementById("btnAchievements").addEventListener("click", (e) => {
    e.currentTarget.blur();
    toggleAchBar();
  });
  document.getElementById("btnAchClose").addEventListener("click", () => toggleAchBar(false));

  const sel = document.getElementById("achTitleSelect");
  if (sel) {
    sel.addEventListener("change", (e) => {
      achState.equippedTitleId = e.target.value;
      saveAchState();
      e.target.blur();
    });
  }

  document.getElementById("btnAchExport").addEventListener("click", (e) => {
    e.currentTarget.blur();
    exportLocalDataJson();
    const msg = document.getElementById("achMsg");
    if (msg) { msg.style.color = "var(--green)"; msg.textContent = t("achExportedMsg"); }
  });

  const fileIn = document.getElementById("achImportFile");
  document.getElementById("btnAchImport").addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (fileIn) fileIn.click();
  });
  if (fileIn) {
    fileIn.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      const text = await f.text();
      const ok = importLocalDataJson(text);
      const msg = document.getElementById("achMsg");
      if (msg) {
        msg.style.color = ok ? "var(--green)" : "var(--red)";
        msg.textContent = ok ? t("achImportedMsg") : t("achImportFailMsg");
      }
    });
  }

  syncAchievementsLanguage();
}
