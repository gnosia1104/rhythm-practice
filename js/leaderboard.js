// Global & Local Leaderboard Module
// Tracks Top 20 + Your Rank across 4 boards + 5 input-mode filters:
//   Boards:
//     1. Today's Daily (4/4)          -> daily:YYYY-MM-DD
//     2. Today's Daily+ (Odd Meter)   -> dailyplus:YYYY-MM-DD
//     3. Endless Survival (HP)        -> endless:all
//     4. Endless + Sudden Death (3M)  -> endless_sd3:all
//   Input Filters: ALL | KEY | AUDIO | MIDI | PAD
// Uses Supabase Anonymous Auth (auth.uid()) + hardened RPCs (get_leaderboard / submit_leaderboard_score),
// never exposes user_id/client_id in queries, and gracefully falls back to local personal bests.
import { t } from "./i18n.js";
import { getTodayDateStr } from "./rhythm.js";
import { getEquippedTitleAndBadges, formatLocalizedTitle } from "./achievements.js";
import { trackEvent } from "./analytics.js";
import {
  isSupabaseConfigured, getSupabaseClient, getExistingSupabaseUser, ensureSupabaseAuth,
  getPersistentClientId, loadSavedNickname, saveNickname,
} from "./supabase-client.js";

const LOCAL_LB_KEY = "rhythm_leaderboard_local_v1";
const MAX_ROWS = 20;
const VALID_FILTERS = ["ALL", "KEY", "AUDIO", "MIDI", "PAD"];

export const lbState = {
  open: false,
  tab: "daily",        // "daily" | "dailyplus" | "endless" | "endless_sd3"
  inputFilter: "ALL",  // "ALL" | "KEY" | "AUDIO" | "MIDI" | "PAD"
  mode: "local",       // "online" | "local"
  loading: false,
  clientId: getPersistentClientId(), // used only for default fallback nickname suffix
  rowsByCacheKey: new Map(), // `${boardKey}|${inputFilter}` -> array of rows
  localBestByBoard: {},      // boardKey -> best local entry
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

function cacheKeyFor(boardKey, inputFilter = lbState.inputFilter) {
  return `${boardKey}|${inputFilter}`;
}

function isSurvivalTab(tab = lbState.tab) {
  return tab === "endless" || tab === "endless_sd3";
}

function matchesInputFilter(entryMode, filter = lbState.inputFilter) {
  const f = String(filter || "ALL").toUpperCase();
  if (f === "ALL") return true;
  const m = String(entryMode || "KEY").toUpperCase();
  if (f === "AUDIO") return m === "AUDIO" || m === "BOTH";
  return m === f;
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

export async function fetchLeaderboardTab(tab = lbState.tab, inputFilter = lbState.inputFilter) {
  const boardKey = boardKeyForTab(tab);
  const filter = VALID_FILTERS.includes(inputFilter) ? inputFilter : "ALL";
  const cKey = cacheKeyFor(boardKey, filter);
  lbState.loading = true;
  renderLeaderboardUi();

  if (isSupabaseConfigured()) {
    try {
      const sb = await getSupabaseClient();
      // Read-only session check (NEVER creates a new anonymous user on passive browsing — saves Supabase MAU)
      await getExistingSupabaseUser();
      const { data, error } = await sb.rpc("get_leaderboard", {
        p_board_key: boardKey,
        p_input_mode: filter,
        p_limit: MAX_ROWS,
      });
      if (!error && Array.isArray(data)) {
        lbState.mode = "online";
        lbState.rowsByCacheKey.set(cKey, data);
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

  // Graceful local fallback: show user's own saved best on this board if it matches filter
  const mine = lbState.localBestByBoard[boardKey];
  const localRows = (mine && matchesInputFilter(mine.input_mode, filter))
    ? [{ ...mine, is_me: true }]
    : [];
  lbState.rowsByCacheKey.set(cKey, localRows);
  lbState.loading = false;
  setLbMsg(t("lbLocalHint"), "var(--muted)");
  renderLeaderboardUi();
  return localRows;
}

async function submitEntryToSupabase(entry) {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unconfigured" };
  try {
    const sb = await getSupabaseClient();
    const user = await ensureSupabaseAuth();
    if (!user || !user.id) {
      return { ok: false, reason: "auth_required" };
    }
    const { data, error } = await sb.rpc("submit_leaderboard_score", {
      p_board_key: entry.board_key,
      p_nickname: entry.nickname,
      p_title: entry.title || "",
      p_score: Math.max(0, Math.round(entry.score || 0)),
      p_max_score: Math.max(0, Math.round(entry.max_score || 0)),
      p_bars: Math.max(0, Math.round(entry.bars || 0)),
      p_acc: Number((entry.acc || 0).toFixed(1)),
      p_sd_ms: Number((entry.sd_ms || 0).toFixed(1)),
      p_rank_grade: ["S+", "S", "A", "B", "C"].includes(entry.rank_grade) ? entry.rank_grade : "C",
      p_bpm: Math.max(40, Math.min(180, Math.round(entry.bpm || 60))),
      p_level: Math.max(1, Math.min(6, Math.round(entry.level || 1))),
      p_input_mode: ["KEY", "AUDIO", "MIDI", "PAD", "BOTH"].includes(entry.input_mode) ? entry.input_mode : "KEY",
    });
    if (!error) {
      lbState.mode = "online";
      lbState.lastSubmittedByBoard.set(entry.board_key, Date.now());
      trackEvent("leaderboard_submit", { board: entry.board_key.split(":")[0], mode: entry.input_mode });
      const sanitized = Boolean(data && data.nickname_sanitized);
      const savedNick = (data && data.nickname) || entry.nickname;
      return { ok: true, reason: null, nicknameSanitized: sanitized, savedNick };
    }
    const msg = String(error.message || "");
    if (msg.includes("rate_limited")) return { ok: false, reason: "rate_limited" };
    if (msg.includes("auth_required")) return { ok: false, reason: "auth_required" };
    return { ok: false, reason: msg || "rpc_error" };
  } catch (_) {
    return { ok: false, reason: "network_error" };
  }
}

export async function recordLeaderboardRun({
  tab, // "daily" | "dailyplus" | "endless" | "endless_sd3"
  dateStr = null,
  score = 0,
  maxScore = 0,
  bars = 0,
  acc = 0,
  sd = 0,
  rank = "C",
  bpm = 60,
  level = 1,
  inputMode = "KEY",
}) {
  if (!tab) return;
  const survival = isSurvivalTab(tab);
  if (survival && bars <= 0) return;
  if (!survival && score <= 0) return;
  if (!survival && maxScore > 0 && score > maxScore) return;

  const boardKey = survival
    ? boardKeyForTab(tab)
    : `${tab}:${dateStr || getTodayDateStr()}`;
  const { titleId } = getEquippedTitleAndBadges();
  const cleanMode = ["KEY", "AUDIO", "MIDI", "PAD", "BOTH"].includes(String(inputMode || "").toUpperCase())
    ? String(inputMode).toUpperCase()
    : "KEY";
  const cleanRank = ["S+", "S", "A", "B", "C"].includes(String(rank || "").toUpperCase())
    ? String(rank).toUpperCase()
    : "C";

  const entry = {
    board_key: boardKey,
    nickname: getEffectiveNickname(),
    title: titleId ? String(titleId).slice(0, 24) : "",
    score: Math.max(0, Math.round(score)),
    max_score: Math.max(0, Math.round(maxScore)),
    bars: Math.max(0, Math.round(bars)),
    acc: Math.max(0, Math.min(100, Number(acc) || 0)),
    sd_ms: Math.max(0, Math.min(500, Number(sd) || 0)),
    rank_grade: cleanRank,
    bpm: Math.max(40, Math.min(180, Math.round(bpm || 60))),
    level: Math.max(1, Math.min(6, Math.round(level || 1))),
    input_mode: cleanMode,
    updated_at: new Date().toISOString(),
  };

  const prev = lbState.localBestByBoard[boardKey];
  if (!isBetterEntry(entry, prev, survival)) {
    return;
  }
  lbState.localBestByBoard[boardKey] = entry;
  persistLocalBests();

  const res = await submitEntryToSupabase(entry);
  if (res.ok && res.nicknameSanitized) {
    setLbMsg(t("lbNickSanitized", res.savedNick), "var(--amber)");
  }
  if (lbState.open) {
    if (res.ok) {
      await fetchLeaderboardTab(lbState.tab, lbState.inputFilter);
      if (res.nicknameSanitized) setLbMsg(t("lbNickSanitized", res.savedNick), "var(--amber)");
    } else if (!res.reason || res.reason === "unconfigured" || res.reason === "network_error") {
      const cKey = cacheKeyFor(boardKey, lbState.inputFilter);
      const localRows = matchesInputFilter(entry.input_mode, lbState.inputFilter)
        ? [{ ...entry, is_me: true }]
        : [];
      lbState.rowsByCacheKey.set(cKey, localRows);
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
  document.querySelectorAll(".lb-filter-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lbFilter === lbState.inputFilter);
  });

  const listEl = document.getElementById("lbList");
  if (!listEl) return;

  if (lbState.loading) {
    listEl.innerHTML = `<div class="lb-empty">${escapeHtml(t("lbLoading"))}</div>`;
    return;
  }

  const boardKey = boardKeyForTab(lbState.tab);
  const survival = isSurvivalTab(lbState.tab);
  const rows = lbState.rowsByCacheKey.get(cacheKeyFor(boardKey, lbState.inputFilter)) || [];
  const myRankEl = document.getElementById("lbMyRank");
  if (myRankEl) {
    const myIdx = rows.findIndex((r) => Boolean(r.is_me));
    if (myIdx >= 0) {
      const r = rows[myIdx];
      const val = survival ? `${r.bars}B` : Number(r.score || 0).toLocaleString();
      myRankEl.textContent = t("lbMyRankFmt", myIdx + 1, val);
      myRankEl.classList.remove("hidden");
    } else {
      myRankEl.classList.add("hidden");
    }
  }
  if (!rows.length) {
    listEl.innerHTML = `<div class="lb-empty">${escapeHtml(t("lbEmpty"))}</div>`;
    return;
  }

  listEl.innerHTML = rows.map((r, idx) => {
    const isMe = Boolean(r.is_me);
    const medal = idx === 0 ? "🥇" : (idx === 1 ? "🥈" : (idx === 2 ? "🥉" : `#${idx + 1}`));
    const localizedTitle = formatLocalizedTitle(r.title);
    const titlePill = localizedTitle ? `<span class="lb-title-pill">${escapeHtml(localizedTitle)}</span>` : "";
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
  setTxt("btnOpenLbFromResult", "btnOpenLb");

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

  const filterMap = {
    ALL: "lbFilterAll",
    KEY: "lbFilterKey",
    AUDIO: "lbFilterAudio",
    MIDI: "lbFilterMidi",
    PAD: "lbFilterPad",
  };
  document.querySelectorAll(".lb-filter-btn").forEach((b) => {
    const key = filterMap[b.dataset.lbFilter];
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
    fetchLeaderboardTab(lbState.tab, lbState.inputFilter);
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
      fetchLeaderboardTab(lbState.tab, lbState.inputFilter);
    });
  }
  const btnSaveNick = document.getElementById("btnLbSaveNick");
  const applyNickAndSync = async () => {
    if (!nickIn) return;
    const saved = saveNickname(nickIn.value);
    if (!saved) return;
    const roomNick = document.getElementById("roomNickInput");
    if (roomNick && !roomNick.value) roomNick.value = saved;
    const boardKey = boardKeyForTab(lbState.tab);
    const mine = lbState.localBestByBoard[boardKey];
    if (mine) {
      const { titleId } = getEquippedTitleAndBadges();
      mine.nickname = saved;
      mine.title = titleId ? String(titleId).slice(0, 24) : "";
      const res = await submitEntryToSupabase(mine);
      if (res.reason === "rate_limited") {
        setLbMsg(t("lbRateLimited"), "var(--amber)");
        return;
      }
      if (res.reason === "auth_required") {
        persistLocalBests();
        setLbMsg(t("lbAuthNeeded"), "var(--amber)");
        return;
      }
      if (res.ok && res.nicknameSanitized) {
        mine.nickname = res.savedNick;
        persistLocalBests();
        await fetchLeaderboardTab(lbState.tab, lbState.inputFilter);
        setLbMsg(t("lbNickSanitized", res.savedNick), "var(--amber)");
        return;
      }
      persistLocalBests();
    }
    setLbMsg(t("lbNickSaved", saved), "var(--green)");
    await fetchLeaderboardTab(lbState.tab, lbState.inputFilter);
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
      fetchLeaderboardTab(nextTab, lbState.inputFilter);
    });
  });

  document.querySelectorAll(".lb-filter-btn").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.currentTarget.blur();
      const nextFilter = b.dataset.lbFilter;
      if (!nextFilter || !VALID_FILTERS.includes(nextFilter)) return;
      lbState.inputFilter = nextFilter;
      fetchLeaderboardTab(lbState.tab, nextFilter);
    });
  });

  syncLeaderboardLanguage();
}
