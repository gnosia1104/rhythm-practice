// Global & Local Leaderboard Module
// Tracks Top 20 + Your Rank across 4 boards:
//   1. Today's Daily (4/4)          -> daily:YYYY-MM-DD
//   2. Today's Daily+ (Odd Meter)   -> dailyplus:YYYY-MM-DD
//   3. Endless Survival (HP)        -> endless:all
//   4. Endless + Sudden Death (3M)  -> endless_sd3:all
// Uses shared Supabase client when table/RPC is available, and seamlessly falls back to local personal bests.
import { t } from "./i18n.js";
import { getTodayDateStr } from "./rhythm.js";
import { getEquippedTitleAndBadges } from "./achievements.js";
import { trackEvent } from "./analytics.js";
import {
  isSupabaseConfigured, getSupabaseClient, getPersistentClientId,
  loadSavedNickname, saveNickname,
} from "./supabase-client.js";

const LOCAL_LB_KEY = "rhythm_leaderboard_local_v1";
const MAX_ROWS = 20;

export const lbState = {
  open: false,
  tab: "daily", // "daily" | "dailyplus" | "endless" | "endless_sd3"
  mode: "local", // "online" | "local"
  loading: false,
  clientId: getPersistentClientId(),
  rowsByBoard: new Map(), // boardKey -> array of rows
  localBestByBoard: {},   // boardKey -> best local entry
  lastSubmittedByBoard: new Map(),
};

let cbs = {
  onUiChange: () => {},
  setHitBadge: () => {},
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function boardKeyForTab(tab = lbState.tab) {
  const today = getTodayDateStr();
  if (tab === "daily") return `daily:${today}`;
  if (tab === "dailyplus") return `dailyplus:${today}`;
  if (tab === "endless_sd3") return "endless_sd3:all";
  return "endless:all";
}

function isSurvivalTab(tab = lbState.tab) {
  return tab === "endless" || tab === "endless_sd3";
}

function loadLocalBests() {
  try {
    const raw = localStorage.getItem(LOCAL_LB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        lbState.localBestByBoard = parsed;
      }
    }
  } catch (_) {}
}

function persistLocalBests() {
  try {
    // Keep only recent 20 board keys so localStorage stays tiny
    const keys = Object.keys(lbState.localBestByBoard);
    if (keys.length > 20) {
      keys.sort().slice(0, keys.length - 20).forEach((k) => {
        if (!k.endsWith(":all")) delete lbState.localBestByBoard[k];
      });
    }
    localStorage.setItem(LOCAL_LB_KEY, JSON.stringify(lbState.localBestByBoard));
  } catch (_) {}
}

function isBetterEntry(next, prev, survival) {
  if (!prev) return true;
  if (survival) {
    if ((next.bars || 0) !== (prev.bars || 0)) return (next.bars || 0) > (prev.bars || 0);
    if ((next.acc || 0) !== (prev.acc || 0)) return (next.acc || 0) > (prev.acc || 0);
    return (next.bpm || 0) > (prev.bpm || 0);
  }
  if ((next.score || 0) !== (prev.score || 0)) return (next.score || 0) > (prev.score || 0);
  if ((next.sd_ms || 0) !== (prev.sd_ms || 0)) return (next.sd_ms || 999) < (prev.sd_ms || 999);
  return (next.acc || 0) > (prev.acc || 0);
}

function getEffectiveNickname() {
  const inp = document.getElementById("lbNickInput");
  const fromInput = inp ? inp.value.trim() : "";
  if (fromInput) return saveNickname(fromInput);
  const saved = loadSavedNickname();
  if (saved) return saved;
  return `Player-${lbState.clientId.slice(-4)}`;
}

function setLbMsg(text, color = "var(--muted)") {
  const el = document.getElementById("lbMsg");
  if (!el) return;
  el.style.color = color;
  el.textContent = text;
}

export async function fetchLeaderboardTab(tab = lbState.tab) {
  const boardKey = boardKeyForTab(tab);
  const survival = isSurvivalTab(tab);
  lbState.loading = true;
  renderLeaderboardUi();

  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabaseClient();
      let q = sb.from("leaderboard_scores")
        .select("board_key,client_id,nickname,title,score,max_score,bars,acc,sd_ms,rank_grade,bpm,level,input_mode,updated_at")
        .eq("board_key", boardKey);
      if (survival) {
        q = q.order("bars", { ascending: false })
          .order("acc", { ascending: false })
          .order("bpm", { ascending: false });
      } else {
        q = q.order("score", { ascending: false })
          .order("sd_ms", { ascending: true })
          .order("acc", { ascending: false });
      }
      const { data, error } = await q.limit(MAX_ROWS);
      if (!error && Array.isArray(data)) {
        lbState.mode = "online";
        lbState.rowsByBoard.set(boardKey, data);
        lbState.loading = false;
        setLbMsg(t("lbOnlineHint"), "var(--muted)");
        renderLeaderboardUi();
        return data;
      }
      lbState.mode = "local";
    } catch (_) {
      lbState.mode = "local";
    }
  } else {
    lbState.mode = "local";
  }

  // Graceful local fallback: show user's own saved best on this board
  const mine = lbState.localBestByBoard[boardKey];
  lbState.rowsByBoard.set(boardKey, mine ? [mine] : []);
  lbState.loading = false;
  setLbMsg(t("lbLocalHint"), "var(--muted)");
  renderLeaderboardUi();
  return lbState.rowsByBoard.get(boardKey);
}

async function submitEntryToSupabase(entry) {
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = await getSupabaseClient();
    const { error } = await sb.rpc("submit_leaderboard_score", {
      p_board_key: entry.board_key,
      p_client_id: entry.client_id,
      p_nickname: entry.nickname,
      p_title: entry.title || "",
      p_score: Math.max(0, Math.round(entry.score || 0)),
      p_max_score: Math.max(0, Math.round(entry.max_score || 0)),
      p_bars: Math.max(0, Math.round(entry.bars || 0)),
      p_acc: Number((entry.acc || 0).toFixed(1)),
      p_sd_ms: Number((entry.sd_ms || 0).toFixed(1)),
      p_rank_grade: String(entry.rank_grade || "").slice(0, 8),
      p_bpm: Math.max(40, Math.min(180, Math.round(entry.bpm || 60))),
      p_level: Math.max(1, Math.min(6, Math.round(entry.level || 1))),
      p_input_mode: String(entry.input_mode || "KEY").slice(0, 12),
    });
    if (!error) {
      lbState.mode = "online";
      lbState.lastSubmittedByBoard.set(entry.board_key, Date.now());
      trackEvent("leaderboard_submit", { board: entry.board_key.split(":")[0] });
      return true;
    }
  } catch (_) {}
  return false;
}

export async function recordLeaderboardRun({
  tab, // "daily" | "dailyplus" | "endless" | "endless_sd3"
  dateStr = null,
  score = 0,
  maxScore = 0,
  bars = 0,
  acc = 0,
  sd = 0,
  rank = "",
  bpm = 60,
  level = 1,
  inputMode = "KEY",
}) {
  if (!tab) return;
  const survival = isSurvivalTab(tab);
  if (survival && bars <= 0) return;
  if (!survival && score <= 0) return;
  if (!survival && maxScore > 0 && score > maxScore + 5) return; // sanity guard

  const boardKey = survival
    ? boardKeyForTab(tab)
    : `${tab}:${dateStr || getTodayDateStr()}`;
  const { title } = getEquippedTitleAndBadges();
  const entry = {
    board_key: boardKey,
    client_id: lbState.clientId,
    nickname: getEffectiveNickname(),
    title: title ? String(title).slice(0, 24) : "",
    score: Math.max(0, Math.round(score)),
    max_score: Math.max(0, Math.round(maxScore)),
    bars: Math.max(0, Math.round(bars)),
    acc: Math.max(0, Math.min(100, Number(acc) || 0)),
    sd_ms: Math.max(0, Math.min(999, Number(sd) || 0)),
    rank_grade: String(rank || "").slice(0, 8),
    bpm: Math.max(40, Math.min(180, Math.round(bpm || 60))),
    level: Math.max(1, Math.min(6, Math.round(level || 1))),
    input_mode: String(inputMode || "KEY").slice(0, 12),
    updated_at: new Date().toISOString(),
  };

  const prev = lbState.localBestByBoard[boardKey];
  if (!isBetterEntry(entry, prev, survival)) {
    return;
  }
  lbState.localBestByBoard[boardKey] = entry;
  persistLocalBests();

  const uploaded = await submitEntryToSupabase(entry);
  if (lbState.open) {
    if (uploaded) await fetchLeaderboardTab(lbState.tab);
    else {
      lbState.rowsByBoard.set(boardKey, [entry]);
      renderLeaderboardUi();
    }
  }
}

export function renderLeaderboardUi() {
  const bar = document.getElementById("lbBar");
  const btn = document.getElementById("btnLeaderboard");
  if (btn) btn.classList.toggle("active", lbState.open);
  if (!bar) return;

  const badge = document.getElementById("lbModeBadge");
  if (badge) {
    badge.textContent = lbState.mode === "online" ? t("lbBadgeOnline") : t("lbBadgeLocal");
    badge.className = `room-mode-pill ${lbState.mode === "online" ? "online" : "local"}`;
  }

  document.querySelectorAll(".lb-tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lbTab === lbState.tab);
  });

  const listEl = document.getElementById("lbList");
  if (!listEl) return;

  if (lbState.loading) {
    listEl.innerHTML = `<div class="lb-empty">${escapeHtml(t("lbLoading"))}</div>`;
    return;
  }

  const boardKey = boardKeyForTab(lbState.tab);
  const survival = isSurvivalTab(lbState.tab);
  const rows = lbState.rowsByBoard.get(boardKey) || [];
  if (!rows.length) {
    listEl.innerHTML = `<div class="lb-empty">${escapeHtml(t("lbEmpty"))}</div>`;
    return;
  }

  listEl.innerHTML = rows.map((r, idx) => {
    const isMe = r.client_id === lbState.clientId;
    const medal = idx === 0 ? "🥇" : (idx === 1 ? "🥈" : (idx === 2 ? "🥉" : `#${idx + 1}`));
    const titlePill = r.title ? `<span class="lb-title-pill">${escapeHtml(r.title)}</span>` : "";
    const meTag = isMe ? `<span class="room-me-tag">YOU</span>` : "";
    const mainVal = survival
      ? `${r.bars}B`
      : `${Number(r.score || 0).toLocaleString()}`;
    const metaVal = survival
      ? `Lv${r.level || 1} · ${r.bpm || 60}BPM · ${Number(r.acc || 0).toFixed(0)}%`
      : `${r.rank_grade || "—"} · ${Number(r.acc || 0).toFixed(0)}% · ±${Number(r.sd_ms || 0).toFixed(0)}ms`;
    return `<div class="lb-row${isMe ? " is-me" : ""}${idx < 3 ? " is-top" : ""}">
      <span class="lb-rank">${medal}</span>
      <div class="lb-player">
        <div class="lb-name-line">
          <span class="lb-name">${escapeHtml(r.nickname || "Player")}</span>
          ${titlePill}${meTag}
        </div>
        <div class="lb-sub">${escapeHtml(metaVal)} · ${escapeHtml(r.input_mode || "KEY")}</div>
      </div>
      <div class="lb-score-col">
        <strong>${escapeHtml(mainVal)}</strong>
      </div>
    </div>`;
  }).join("");
}

export function syncLeaderboardLanguage() {
  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTxt("btnLbText", "btnLeaderboard");
  setTxt("lblLbTitle", "lbTitle");
  setTxt("btnLbRefresh", "lbRefresh");
  setTxt("btnLbSaveNick", "lbSaveNick");

  const nickIn = document.getElementById("lbNickInput");
  if (nickIn) nickIn.placeholder = t("roomNickPlaceholder");

  const tabMap = {
    daily: "lbTabDaily",
    dailyplus: "lbTabDailyPlus",
    endless: "lbTabEndless",
    endless_sd3: "lbTabEndlessSd",
  };
  document.querySelectorAll(".lb-tab-btn").forEach((b) => {
    const key = tabMap[b.dataset.lbTab];
    if (key) b.textContent = t(key);
  });

  setLbMsg(lbState.mode === "online" ? t("lbOnlineHint") : t("lbLocalHint"));
  renderLeaderboardUi();
}

export function toggleLeaderboardBar(forceOpen = null, targetTab = null) {
  const bar = document.getElementById("lbBar");
  if (!bar) return;
  if (targetTab) lbState.tab = targetTab;
  const open = forceOpen !== null ? forceOpen : bar.classList.contains("hidden");
  lbState.open = open;
  bar.classList.toggle("hidden", !open);
  cbs.onUiChange();
  if (open) {
    const nickIn = document.getElementById("lbNickInput");
    if (nickIn && !nickIn.value) nickIn.value = loadSavedNickname();
    fetchLeaderboardTab(lbState.tab);
  } else {
    renderLeaderboardUi();
  }
}

export function initLeaderboard(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };
  loadLocalBests();

  const nickIn = document.getElementById("lbNickInput");
  if (nickIn) nickIn.value = loadSavedNickname();

  const btnOpen = document.getElementById("btnLeaderboard");
  if (btnOpen) {
    btnOpen.addEventListener("click", (e) => {
      e.currentTarget.blur();
      toggleLeaderboardBar();
    });
  }
  const btnClose = document.getElementById("btnLbClose");
  if (btnClose) {
    btnClose.addEventListener("click", () => toggleLeaderboardBar(false));
  }
  const btnRefresh = document.getElementById("btnLbRefresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", (e) => {
      e.currentTarget.blur();
      fetchLeaderboardTab(lbState.tab);
    });
  }
  const btnSaveNick = document.getElementById("btnLbSaveNick");
  const applyNickAndSync = async () => {
    if (!nickIn) return;
    const saved = saveNickname(nickIn.value);
    if (!saved) return;
    const roomNick = document.getElementById("roomNickInput");
    if (roomNick && !roomNick.value) roomNick.value = saved;
    // Update current board's local best nickname/title and re-submit if present
    const boardKey = boardKeyForTab(lbState.tab);
    const mine = lbState.localBestByBoard[boardKey];
    if (mine) {
      const { title } = getEquippedTitleAndBadges();
      mine.nickname = saved;
      mine.title = title ? String(title).slice(0, 24) : "";
      persistLocalBests();
      await submitEntryToSupabase(mine);
    }
    setLbMsg(t("lbNickSaved", saved), "var(--green)");
    await fetchLeaderboardTab(lbState.tab);
  };
  if (btnSaveNick) {
    btnSaveNick.addEventListener("click", (e) => {
      e.currentTarget.blur();
      applyNickAndSync();
    });
  }
  if (nickIn) {
    nickIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        applyNickAndSync();
      }
    });
  }

  document.querySelectorAll(".lb-tab-btn").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.currentTarget.blur();
      const nextTab = b.dataset.lbTab;
      if (!nextTab) return;
      lbState.tab = nextTab;
      fetchLeaderboardTab(nextTab);
    });
  });

  syncLeaderboardLanguage();
}
