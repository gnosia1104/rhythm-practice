// Real-Time Multiplayer Room Engine (Gartic Phone / Kahoot style)
// Supports Supabase Realtime (Broadcast + Presence) when SUPABASE_URL & SUPABASE_ANON_KEY are set,
// and seamlessly falls back to Local Multi-Tab Mode (BroadcastChannel) for instant zero-config testing!
import { t } from "./i18n.js";
import { app, currentFullSeedCode, hitWindowSec } from "./state.js";
import { computeDetailedScore, computeScoreRank, getTimingThresholds } from "./scoring.js";
import { copyToClipboard, flashBtnText } from "./share-card.js";
import { trackEvent } from "./analytics.js";

// =========================================================================
// Supabase Realtime Config (Optional: leave blank for Local Multi-Tab Mode)
// Create a free project at https://supabase.com -> Project Settings -> API
// Paste Project URL and anon public key below (no DB tables needed!).
// =========================================================================
export const SUPABASE_URL = "https://fdpnrxkohvfrcesoxpwo.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ifPAkMXSsD1C_2xEToofNg_GtDLtkVB";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes confusing I/O/0/1
export const MAX_ROOM_PLAYERS = 10; // Total room capacity including bots
const NICK_STORAGE_KEY = "rhythm_room_nick_v1";
const CHAT_MUTE_STORAGE_KEY = "rhythm_room_chat_muted_v1";
const HOST_SESSION_PREFIX = "rhythm_room_host_";
const LAST_ROOM_SESSION_KEY = "rhythm_room_last_v1";
const BOT_PROFILES = [
  { name: "ChillRookie", skill: 0.80, restErrProb: 0.12, meanBias: 14,  sd: 44 }, // Easy (C~B) — fun warm-up opponent
  { name: "GrooveCat",   skill: 0.88, restErrProb: 0.07, meanBias: -10, sd: 32 }, // Normal (B~A) — balanced rival
  { name: "PocketFox",   skill: 0.93, restErrProb: 0.03, meanBias: 5,   sd: 22 }, // Hard (A~S) — beatable boss
];

function gaussianRand() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

let cbs = {
  applyRoomChart: () => {},
  triggerRoomStart: () => {},
  unlockAudio: () => {},
  playCountdownBeep: () => {},
  stopRun: () => {},
  newPhrase: () => {},
  setHitBadge: () => {},
  updateMeta: () => {},
};

let supabaseClientPromise = null;

function randomId(len = 10) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return out;
}

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

function sanitizeRoomCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function sanitizeNick(raw) {
  const clean = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 16);
  return clean || `Player-${randomId(3)}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_URL.trim() && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.trim());
}

async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
      .then((mod) => mod.createClient(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim(), {
        realtime: { params: { eventsPerSecond: 10 } },
      }));
  }
  return supabaseClientPromise;
}

export const roomState = {
  open: false,
  joined: false,
  transportMode: "local", // "supabase" | "local"
  code: "",
  clientId: randomId(10),
  name: "",
  isHost: false,
  hostToken: "",
  rule: "score", // "score" (Score Attack) | "sd3" (Sudden Death: 3 misses out)
  phase: "LOBBY", // "LOBBY" | "COUNTDOWN" | "PLAYING" | "PODIUM"
  roundId: 0,
  chart: null, // { seedCode, customCode, bpm, label }
  players: new Map(), // id -> player state
  bots: [], // bot ids owned by host
  transport: null,
  lastProgressSentMs: 0,
  countdownTimerId: null,
  countdownTickTimers: [],
  countdownSec: 0,
  chatLog: [], // { sys, id, name, text }
  chatMuted: false,
  blockedIds: new Set(),
  lastChatBySender: new Map(),
  botTimers: [],
  podiumCheckTimerId: null,
  applyingRemoteChart: false,
  eliminatedInRound: false,
};

function makePlayerRecord(id, name, isHost = false, isBot = false) {
  return {
    id,
    name,
    isHost: Boolean(isHost),
    isBot: Boolean(isBot),
    joinedAt: Date.now(),
    status: "READY", // READY | PLAYING | DONE | OUT
    score: 0,
    maxScore: 0,
    acc: 0,
    hits: 0,
    total: 0,
    doneNotes: 0,
    misses: 0,
    rank: "",
    rankCls: "",
    mean: 0,
    sd: 0,
    tight: 0,
  };
}

function resetPlayersForRound(totalNotes = 0) {
  for (const p of roomState.players.values()) {
    p.status = "PLAYING";
    p.score = 0;
    p.maxScore = 0;
    p.acc = 0;
    p.hits = 0;
    p.total = totalNotes;
    p.doneNotes = 0;
    p.misses = 0;
    p.rank = "";
    p.rankCls = "";
    p.mean = 0;
    p.sd = 0;
    p.tight = 0;
  }
  roomState.eliminatedInRound = false;
}

function getCurrentChartPayload() {
  const isCustom = Boolean(app.customMode && app.phrase && app.phrase.customCode);
  const seedCode = isCustom ? "" : currentFullSeedCode();
  const customCode = isCustom ? app.phrase.customCode : "";
  const pitchTag = app.pitchMode ? ` · ${app.pitchClef === "treble" ? "𝄞" : "𝄢"} Pitch` : "";
  const label = isCustom
    ? `Custom · ${app.timeSig} · ${app.numBars}B · ${app.bpm} BPM`
    : `Lv${app.level} · ${app.timeSig} · ${app.numBars}B · ${app.bpm} BPM${pitchTag}`;
  return {
    seedCode,
    customCode,
    bpm: app.bpm,
    label,
  };
}

function persistHostSession() {
  if (!roomState.joined || !roomState.code) return;
  try {
    if (roomState.isHost && roomState.hostToken) {
      sessionStorage.setItem(
        HOST_SESSION_PREFIX + roomState.code,
        JSON.stringify({
          clientId: roomState.clientId,
          hostToken: roomState.hostToken,
          name: roomState.name,
          rule: roomState.rule,
        })
      );
    }
    sessionStorage.setItem(
      LAST_ROOM_SESSION_KEY,
      JSON.stringify({
        code: roomState.code,
        clientId: roomState.clientId,
        name: roomState.name,
        hostToken: roomState.isHost ? roomState.hostToken : "",
      })
    );
  } catch (_) {}
}

function clearLastRoomSession() {
  try { sessionStorage.removeItem(LAST_ROOM_SESSION_KEY); } catch (_) {}
}

function loadHostSession(code) {
  try {
    const raw = sessionStorage.getItem(HOST_SESSION_PREFIX + code);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.hostToken) return parsed;
    }
  } catch (_) {}
  return null;
}

function syncRoomUrlParam(code) {
  try {
    if (location.protocol === "file:") return;
    const qs = new URLSearchParams(location.search);
    if (code) qs.set("room", code);
    else qs.delete("room");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    history.replaceState(null, "", `${location.pathname}${suffix}`);
  } catch (_) {}
}

function buildRoomInviteUrl(code) {
  const base = location.protocol === "file:"
    ? "https://gnosia1104.github.io/rhythm-practice/"
    : `${location.origin}${location.pathname}`;
  return `${base}?room=${encodeURIComponent(code)}`;
}

// =========================================================================
// Transport Layer: Supabase Realtime OR Local BroadcastChannel
// =========================================================================
function createLocalTransport(code, onMessage) {
  const chName = `rhythm_room_ch_${code}`;
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(chName) : null;
  if (bc) {
    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.senderId === roomState.clientId) return;
      onMessage(msg);
    };
  }
  return {
    mode: "local",
    send(payload) {
      if (!bc) return;
      try {
        bc.postMessage({ ...payload, senderId: roomState.clientId });
      } catch (_) {}
    },
    close() {
      try { if (bc) bc.close(); } catch (_) {}
    },
  };
}

async function createSupabaseTransport(code, onMessage, onPresenceSync) {
  const sb = await getSupabaseClient();
  const channel = sb.channel(`rhythm-room-${code}`, {
    config: {
      broadcast: { self: false },
      presence: { key: roomState.clientId },
    },
  });

  channel.on("broadcast", { event: "room_msg" }, ({ payload }) => {
    if (!payload || payload.senderId === roomState.clientId) return;
    onMessage(payload);
  });

  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    onPresenceSync(state);
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) { settled = true; reject(new Error("Supabase Realtime timeout")); }
    }, 8000);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && !settled) {
        settled = true;
        window.clearTimeout(timer);
        try {
          await channel.track({
            id: roomState.clientId,
            name: roomState.name,
            isHost: roomState.isHost,
            joinedAt: Date.now(),
          });
        } catch (_) {}
        resolve();
      } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error(`Realtime ${status}`));
      }
    });
  });

  return {
    mode: "supabase",
    send(payload) {
      try {
        channel.send({
          type: "broadcast",
          event: "room_msg",
          payload: { ...payload, senderId: roomState.clientId },
        });
      } catch (_) {}
    },
    async close() {
      try { await sb.removeChannel(channel); } catch (_) {}
    },
  };
}

function sendMsg(payload) {
  if (roomState.transport) {
    roomState.transport.send(payload);
  }
}

function clearBotTimers() {
  for (const id of roomState.botTimers) window.clearTimeout(id);
  roomState.botTimers = [];
}

function clearRoundTimers() {
  if (roomState.countdownTimerId) {
    window.clearTimeout(roomState.countdownTimerId);
    roomState.countdownTimerId = null;
  }
  for (const id of roomState.countdownTickTimers) window.clearTimeout(id);
  roomState.countdownTickTimers = [];
  roomState.countdownSec = 0;
  if (roomState.podiumCheckTimerId) {
    window.clearTimeout(roomState.podiumCheckTimerId);
    roomState.podiumCheckTimerId = null;
  }
  clearBotTimers();
}

function appendChatMessage({ sys = false, id = "", name = "", text = "" }) {
  const cleanText = String(text || "").trim().slice(0, 120);
  if (!cleanText) return;
  roomState.chatLog.push({ sys, id, name, text: cleanText });
  if (roomState.chatLog.length > 40) roomState.chatLog.shift();
  renderChatLog();
}

function renderChatLog() {
  const logEl = document.getElementById("roomChatLog");
  if (!logEl) return;
  const blockTip = escapeHtml(t("roomBlockTip"));
  const visible = roomState.chatLog.filter((m) => m.sys || !roomState.blockedIds.has(m.id));
  logEl.innerHTML = visible.map((m) => {
    if (m.sys) {
      return `<div class="room-chat-msg is-sys">${escapeHtml(m.text)}</div>`;
    }
    const isMe = m.id === roomState.clientId;
    const blockBtn = !isMe && m.id
      ? `<button type="button" class="chat-block-btn" data-block-id="${escapeHtml(m.id)}" data-block-name="${escapeHtml(m.name)}" title="${blockTip}">🚫</button>`
      : "";
    return `<div class="room-chat-msg${isMe ? " is-me" : ""}"><span class="chat-author">${escapeHtml(m.name)}:</span><span>${escapeHtml(m.text)}</span>${blockBtn}</div>`;
  }).join("");
  logEl.scrollTop = logEl.scrollHeight;

  const unblockBtn = document.getElementById("btnRoomUnblockAll");
  if (unblockBtn) {
    const cnt = roomState.blockedIds.size;
    unblockBtn.classList.toggle("hidden", cnt === 0);
    if (cnt > 0) unblockBtn.textContent = t("roomUnblockAll", cnt);
  }
}

function sendChatMessage(rawText) {
  if (!roomState.joined) return;
  const clean = String(rawText || "").trim().slice(0, 120);
  if (!clean) return;
  const now = performance.now();
  const prev = roomState.lastChatBySender.get(roomState.clientId) || 0;
  if (now - prev < 500) return;
  roomState.lastChatBySender.set(roomState.clientId, now);
  appendChatMessage({ sys: false, id: roomState.clientId, name: roomState.name, text: clean });
  sendMsg({
    type: "chat",
    id: roomState.clientId,
    name: roomState.name,
    text: clean,
  });
}

function syncChatMuteUi() {
  const btn = document.getElementById("btnRoomMuteChat");
  const panel = document.getElementById("roomChatPanel");
  const split = document.getElementById("roomSplit");
  if (btn) {
    btn.textContent = roomState.chatMuted ? t("roomChatOffBtn") : t("roomChatOnBtn");
    btn.classList.toggle("danger", roomState.chatMuted);
  }
  if (panel) panel.classList.toggle("hidden", roomState.chatMuted);
  if (split) split.classList.toggle("chat-muted", roomState.chatMuted);
}

// =========================================================================
// Message Protocol Handler
// =========================================================================
function buildHostSyncPayload() {
  const playersArr = [];
  for (const p of roomState.players.values()) {
    playersArr.push({ ...p });
  }
  return {
    type: "room_state",
    roundId: roomState.roundId,
    phase: roomState.phase,
    rule: roomState.rule,
    chart: roomState.chart || getCurrentChartPayload(),
    players: playersArr,
  };
}

function handleRemotePresenceSync(presenceState) {
  const presentIds = new Set();
  for (const key of Object.keys(presenceState || {})) {
    const metas = presenceState[key] || [];
    for (const m of metas) {
      if (!m || !m.id) continue;
      presentIds.add(m.id);
      if (!roomState.players.has(m.id)) {
        if (roomState.players.size >= MAX_ROOM_PLAYERS) continue;
        roomState.players.set(m.id, makePlayerRecord(m.id, m.name || "Player", Boolean(m.isHost), false));
      } else {
        const cur = roomState.players.get(m.id);
        if (m.name) cur.name = m.name;
        if (m.isHost) cur.isHost = true;
      }
    }
  }
  // Remove disconnected non-bot players who aren't ourselves
  for (const [id, p] of roomState.players.entries()) {
    if (id !== roomState.clientId && !p.isBot && !presentIds.has(id)) {
      roomState.players.delete(id);
    }
  }
  if (roomState.isHost) {
    sendMsg(buildHostSyncPayload());
  }
  renderRoomUi();
}

function handleIncomingMessage(msg) {
  if (!roomState.joined || !msg || !msg.type) return;

  if (msg.type === "hello") {
    const isNew = !roomState.players.has(msg.id);
    if (isNew && roomState.players.size >= MAX_ROOM_PLAYERS) {
      if (roomState.isHost) {
        sendMsg({ type: "room_full", targetId: msg.id, max: MAX_ROOM_PLAYERS });
      }
      return;
    }
    const p = roomState.players.get(msg.id) || makePlayerRecord(msg.id, msg.name, Boolean(msg.isHost), false);
    p.name = msg.name || p.name;
    if (msg.isHost) p.isHost = true;
    roomState.players.set(msg.id, p);
    if (isNew) appendChatMessage({ sys: true, text: t("roomSysJoin", p.name) });
    // Reply with our own presence (so local multi-tab discovery works instantaneously!)
    sendMsg({
      type: "hello_ack",
      id: roomState.clientId,
      name: roomState.name,
      isHost: roomState.isHost,
    });
    if (roomState.isHost) {
      sendMsg(buildHostSyncPayload());
    }
    renderRoomUi();
    return;
  }

  if (msg.type === "room_full") {
    if (msg.targetId === roomState.clientId && !roomState.isHost) {
      const maxN = Number(msg.max) || MAX_ROOM_PLAYERS;
      leaveRoom(false).then(() => {
        setRoomStatusMsg(t("roomFullMsg", maxN), "var(--red)");
      });
    }
    return;
  }

  if (msg.type === "hello_ack") {
    if (!roomState.players.has(msg.id) && roomState.players.size >= MAX_ROOM_PLAYERS) return;
    const p = roomState.players.get(msg.id) || makePlayerRecord(msg.id, msg.name, Boolean(msg.isHost), false);
    p.name = msg.name || p.name;
    if (msg.isHost) p.isHost = true;
    roomState.players.set(msg.id, p);
    renderRoomUi();
    return;
  }

  if (msg.type === "leave") {
    const left = roomState.players.get(msg.id);
    roomState.players.delete(msg.id);
    if (left) appendChatMessage({ sys: true, text: t("roomSysLeave", left.name) });
    renderRoomUi();
    return;
  }

  if (msg.type === "chat") {
    if (roomState.chatMuted || roomState.blockedIds.has(msg.id)) return;
    const now = performance.now();
    const prev = roomState.lastChatBySender.get(msg.id) || 0;
    if (now - prev < 500) return; // basic per-sender flood protection
    roomState.lastChatBySender.set(msg.id, now);
    appendChatMessage({ sys: false, id: msg.id, name: msg.name || "Player", text: msg.text });
    return;
  }

  if (msg.type === "host_reclaim") {
    for (const p of roomState.players.values()) {
      p.isHost = (p.id === msg.id);
    }
    const hostP = roomState.players.get(msg.id) || makePlayerRecord(msg.id, msg.name, true, false);
    hostP.isHost = true;
    roomState.players.set(msg.id, hostP);
    renderRoomUi();
    return;
  }

  if (msg.type === "room_state") {
    if (!roomState.isHost) {
      roomState.rule = msg.rule || "score";
      if (msg.chart) {
        const changed = !roomState.chart
          || roomState.chart.seedCode !== msg.chart.seedCode
          || roomState.chart.customCode !== msg.chart.customCode
          || roomState.chart.bpm !== msg.chart.bpm;
        roomState.chart = msg.chart;
        if (changed && roomState.phase !== "PLAYING") {
          applyChartQuietly(msg.chart);
        }
      }
      if (Array.isArray(msg.players)) {
        const seen = new Set();
        for (const rp of msg.players) {
          seen.add(rp.id);
          if (rp.id === roomState.clientId) {
            const me = roomState.players.get(roomState.clientId);
            if (me) me.isHost = Boolean(rp.isHost);
          } else {
            roomState.players.set(rp.id, { ...makePlayerRecord(rp.id, rp.name, rp.isHost, rp.isBot), ...rp });
          }
        }
        // Keep self even if host hasn't added us yet; remove bots deleted by host
        for (const [id, p] of roomState.players.entries()) {
          if (p.isBot && !seen.has(id)) roomState.players.delete(id);
        }
      }
      if (msg.phase === "LOBBY" && roomState.phase === "PODIUM") {
        roomState.phase = "LOBBY";
      }
    }
    renderRoomUi();
    return;
  }

  if (msg.type === "chart_sync") {
    roomState.rule = msg.rule || roomState.rule;
    roomState.chart = msg.chart;
    if (roomState.phase !== "PLAYING") {
      roomState.phase = "LOBBY";
      applyChartQuietly(msg.chart);
    }
    renderRoomUi();
    return;
  }

  if (msg.type === "round_start") {
    beginSyncedRound(msg);
    return;
  }

  if (msg.type === "round_abort") {
    clearRoundTimers();
    cbs.stopRun();
    roomState.phase = "LOBBY";
    for (const p of roomState.players.values()) p.status = "READY";
    renderRoomUi();
    return;
  }

  if (msg.type === "progress" || msg.type === "finish") {
    if (msg.roundId && msg.roundId !== roomState.roundId) return;
    const p = roomState.players.get(msg.id) || makePlayerRecord(msg.id, msg.name || "Player", false, Boolean(msg.isBot));
    p.score = Number(msg.score) || 0;
    p.maxScore = Number(msg.maxScore) || p.maxScore;
    p.acc = Number(msg.acc) || 0;
    p.hits = Number(msg.hits) || 0;
    p.total = Number(msg.total) || p.total;
    p.doneNotes = Number(msg.doneNotes) || 0;
    p.misses = Number(msg.misses) || 0;
    if (msg.rank) p.rank = msg.rank;
    if (msg.rankCls) p.rankCls = msg.rankCls;
    if (Number.isFinite(msg.mean)) p.mean = msg.mean;
    if (Number.isFinite(msg.sd)) p.sd = msg.sd;
    if (Number.isFinite(msg.tight)) p.tight = msg.tight;
    p.status = msg.eliminated ? "OUT" : (msg.type === "finish" ? "DONE" : "PLAYING");
    roomState.players.set(msg.id, p);
    checkRoundCompletion();
    renderRoomUi();
    return;
  }

  if (msg.type === "podium_show") {
    if (msg.roundId && msg.roundId !== roomState.roundId) return;
    roomState.phase = "PODIUM";
    renderRoomUi();
  }
}

function applyChartQuietly(chart) {
  if (!chart) return;
  roomState.applyingRemoteChart = true;
  try {
    cbs.applyRoomChart(chart);
  } finally {
    roomState.applyingRemoteChart = false;
  }
}

function beginSyncedRound(msg) {
  clearRoundTimers();
  roomState.roundId = msg.roundId;
  roomState.rule = msg.rule || "score";
  roomState.chart = msg.chart;
  applyChartQuietly(msg.chart);
  const totalNotes = (app.phrase && app.phrase.targets) ? app.phrase.targets.length : 0;
  resetPlayersForRound(totalNotes);
  roomState.phase = "COUNTDOWN";
  const totalSec = Math.max(1, Math.min(5, Math.round((Number(msg.startDelayMs) || 3000) / 1000)));
  roomState.countdownSec = totalSec;
  appendChatMessage({ sys: true, text: t("roomSysStart", msg.roundId) });
  cbs.playCountdownBeep(totalSec);
  cbs.setHitBadge(t("roomCountdownBanner", totalSec), "warn");
  renderRoomUi();

  for (let s = totalSec - 1; s >= 1; s--) {
    const waitMs = (totalSec - s) * 1000;
    const tid = window.setTimeout(() => {
      if (!roomState.joined || roomState.roundId !== msg.roundId || roomState.phase !== "COUNTDOWN") return;
      roomState.countdownSec = s;
      cbs.playCountdownBeep(s);
      cbs.setHitBadge(t("roomCountdownBanner", s), "warn");
      renderRoomUi();
    }, waitMs);
    roomState.countdownTickTimers.push(tid);
  }

  roomState.countdownTimerId = window.setTimeout(() => {
    roomState.countdownTimerId = null;
    roomState.countdownSec = 0;
    if (!roomState.joined || roomState.roundId !== msg.roundId) return;
    roomState.phase = "PLAYING";
    renderRoomUi();
    cbs.triggerRoomStart();
    if (roomState.isHost && roomState.bots.length) {
      startBotSimulations(msg.roundId);
    }
  }, totalSec * 1000);
}

// =========================================================================
// Bot Simulation (Host-driven, lets anyone test live race + podium solo!)
// =========================================================================
function startBotSimulations(roundId) {
  clearBotTimers();
  if (!app.phrase || !app.phrase.targets || !app.phrase.targets.length) return;
  const srcTargets = app.phrase.targets;
  const srcRests = app.phrase.rests || [];
  const total = srcTargets.length;
  const tw = getTimingThresholds(app.bpm);
  const winMs = hitWindowSec() * 1000;

  for (const botId of roomState.bots) {
    const p = roomState.players.get(botId);
    if (!p) continue;
    const prof = BOT_PROFILES[p.botProfileIdx % BOT_PROFILES.length];

    // Give each bot its own virtual phrase clone graded by the EXACT same engine as humans!
    const botPhrase = {
      ...app.phrase,
      targets: srcTargets.map((tgt) => ({
        ...tgt,
        hit: false,
        missed: false,
        errMs: null,
        sustainStatus: null,
        sustainRatio: null,
      })),
      rests: srcRests.map((rst) => ({
        ...rst,
        error: false,
        errorKind: null,
      })),
    };

    let hits = 0;
    let missedNotes = 0;
    let extraHits = 0;
    let tight = 0;
    let doneNotes = 0;
    let eliminated = false;
    const errs = [];

    const recalcAndBroadcast = (isFinal = false) => {
      const restErrs = botPhrase.rests.filter((r) => r.error).length;
      const misses = missedNotes + restErrs;
      let mean = 0, sd = 0;
      if (errs.length > 0) {
        mean = errs.reduce((a, b) => a + b, 0) / errs.length;
        sd = Math.sqrt(errs.reduce((s, e) => s + (e - mean) ** 2, 0) / errs.length);
      }
      const detail = computeDetailedScore(botPhrase, hits, total, sd, extraHits, restErrs, extraHits, 0);
      const susTargets = botPhrase.targets.filter((tg) => tg.hit && tg.sustainStatus);
      const sustainStats = {
        total: susTargets.length,
        ok: susTargets.filter((tg) => tg.sustainStatus === "OK").length,
        short: susTargets.filter((tg) => tg.sustainStatus === "SHORT").length,
        long: susTargets.filter((tg) => tg.sustainStatus === "LONG").length,
        restErrs,
      };
      const rankObj = computeScoreRank({
        hits, total, tight, extra: extraHits,
        keyExtra: extraHits, audioExtra: 0, inputMode: app.inputMode,
        sustainStats, score: detail.score, maxScore: detail.maxScore,
      });

      p.score = detail.score;
      p.maxScore = detail.maxScore;
      p.hits = hits;
      p.total = total;
      p.doneNotes = doneNotes;
      p.misses = misses;
      p.acc = doneNotes > 0 ? (hits / doneNotes) * 100 : 100;
      p.tight = tight;
      p.mean = mean;
      p.sd = sd;

      if (roomState.rule === "sd3" && misses >= 3) {
        eliminated = true;
        p.status = "OUT";
        p.rank = "OUT";
        p.rankCls = "rank-c";
      } else if (isFinal) {
        p.status = "DONE";
        p.rank = rankObj.grade;
        p.rankCls = rankObj.cls;
      } else {
        p.status = "PLAYING";
      }

      sendMsg({
        type: (isFinal || eliminated) ? "finish" : "progress",
        roundId,
        id: p.id,
        name: p.name,
        isBot: true,
        score: p.score,
        maxScore: p.maxScore,
        acc: p.acc,
        hits: p.hits,
        total: p.total,
        doneNotes: p.doneNotes,
        misses: p.misses,
        tight: p.tight,
        mean: p.mean,
        sd: p.sd,
        rank: p.rank,
        rankCls: p.rankCls,
        eliminated,
      });
      if (isFinal || eliminated) checkRoundCompletion();
      renderRoomUi();
    };

    // Schedule probabilistic rest mistakes on real rest timestamps (aligned with PRE_DELAY_SEC 0.35s)
    botPhrase.rests.forEach((botRst) => {
      const fireMs = Math.max(250, Math.round((botRst.timeSec + 0.45) * 1000));
      const tid = window.setTimeout(() => {
        if (!roomState.joined || roomState.roundId !== roundId || roomState.phase !== "PLAYING" || eliminated) return;
        if (Math.random() < prof.restErrProb) {
          botRst.error = true;
          botRst.errorKind = "HIT";
          extraHits += 1;
          recalcAndBroadcast(false);
        }
      }, fireMs);
      roomState.botTimers.push(tid);
    });

    // Schedule realistic note-by-note execution (aligned with PRE_DELAY_SEC 0.35s)
    botPhrase.targets.forEach((botTgt, idx) => {
      const fireMs = Math.max(250, Math.round((botTgt.timeSec + 0.48) * 1000));
      const tid = window.setTimeout(() => {
        if (!roomState.joined || roomState.roundId !== roundId || roomState.phase !== "PLAYING" || eliminated) return;
        // Harder subdivisions/articulations slightly lower bot hit probability just like human players
        const offbeat = (botTgt.globalSlot % 12) !== 0;
        const hardArt = botTgt.art === "staccato" || botTgt.art === "ghost";
        const effSkill = Math.max(0.55, prof.skill - (offbeat ? 0.04 : 0) - (hardArt ? 0.04 : 0));

        if (Math.random() < effSkill) {
          const e = prof.meanBias + gaussianRand() * prof.sd;
          if (Math.abs(e) <= winMs) {
            botTgt.hit = true;
            botTgt.errMs = e;
            errs.push(e);
            hits += 1;
            if (Math.abs(e) <= tw.tight) tight += 1;
            // Realistic articulation & sustain simulation
            if (botTgt.art === "staccato") {
              const r = Math.random();
              botTgt.sustainStatus = r < prof.skill ? "OK" : (r < 0.94 ? "LONG" : "SHORT");
              botTgt.sustainRatio = botTgt.sustainStatus === "OK" ? 0.46 : (botTgt.sustainStatus === "SHORT" ? 0.18 : 0.72);
            } else if (botTgt.art === "ghost") {
              botTgt.sustainStatus = Math.random() < prof.skill ? "OK" : "LONG";
              botTgt.sustainRatio = botTgt.sustainStatus === "OK" ? 0.22 : 0.85;
            } else if (app.audioOn && botTgt.durSec >= 0.30) {
              const r = Math.random();
              botTgt.sustainStatus = r < prof.skill ? "OK" : "SHORT";
              botTgt.sustainRatio = botTgt.sustainStatus === "OK" ? (0.80 + Math.random() * 0.18) : (0.42 + Math.random() * 0.18);
            }
          } else {
            // Way off timing -> real miss
            botTgt.missed = true;
            missedNotes += 1;
          }
        } else {
          botTgt.missed = true;
          missedNotes += 1;
        }

        doneNotes = idx + 1;
        recalcAndBroadcast(doneNotes === total);
      }, fireMs);
      roomState.botTimers.push(tid);
    });
  }
}

function checkRoundCompletion() {
  if (roomState.phase !== "PLAYING") return;
  const all = [...roomState.players.values()];
  if (!all.length) return;
  const allFinished = all.every((p) => p.status === "DONE" || p.status === "OUT");
  if (allFinished) {
    roomState.phase = "PODIUM";
    const winner = sortedPlayers()[0];
    if (winner) appendChatMessage({ sys: true, text: t("roomSysWinner", winner.name, winner.score) });
    if (roomState.isHost) {
      sendMsg({ type: "podium_show", roundId: roomState.roundId });
    }
    renderRoomUi();
  }
}

// =========================================================================
// Public Lifecycle & Main-App Integration Hooks
// =========================================================================
export function isRoomActive() {
  return roomState.joined;
}

export function isRoomPlaying() {
  return roomState.joined && (roomState.phase === "PLAYING" || roomState.phase === "COUNTDOWN");
}

export function isRoomCountingDown() {
  return roomState.joined && roomState.phase === "COUNTDOWN";
}

export function getRoomCountdownText() {
  if (!isRoomCountingDown() || roomState.countdownSec <= 0) return "";
  return t("roomCountdownBanner", roomState.countdownSec);
}

export function tryStartRoomRoundFromMain() {
  if (!roomState.joined || !roomState.isHost) return false;
  if (roomState.phase === "COUNTDOWN") return true; // already counting down
  hostStartRound();
  return true;
}

export function notifyRoomStopped() {
  if (!roomState.joined) return;
  if (roomState.phase === "COUNTDOWN" || roomState.phase === "PLAYING") {
    if (roomState.isHost) {
      clearRoundTimers();
      roomState.phase = "LOBBY";
      for (const p of roomState.players.values()) p.status = "READY";
      sendMsg({ type: "round_abort", roundId: roomState.roundId });
      renderRoomUi();
    }
  }
}

export function notifyRoomChartChanged() {
  if (!roomState.joined || !roomState.isHost || roomState.applyingRemoteChart) return;
  if (roomState.phase === "PLAYING" || roomState.phase === "COUNTDOWN") return;
  const next = getCurrentChartPayload();
  if (roomState.chart
    && roomState.chart.seedCode === next.seedCode
    && roomState.chart.customCode === next.customCode
    && roomState.chart.bpm === next.bpm) {
    return;
  }
  roomState.chart = next;
  sendMsg({
    type: "chart_sync",
    rule: roomState.rule,
    chart: roomState.chart,
  });
  renderRoomUi();
}

function getAdaptiveProgressIntervalMs() {
  const n = Math.max(1, roomState.players.size);
  if (n <= 6) return 250;
  if (n <= 12) return 650;
  if (n <= 25) return 1500;
  return Infinity; // 26+ players: final score broadcast only (protects Supabase 100 msg/s quota)
}

function sendFinishWithCrowdJitter(payload) {
  const n = roomState.players.size;
  if (n >= 20 && roomState.transportMode === "supabase") {
    const jitter = Math.floor(Math.random() * Math.min(1200, n * 15));
    window.setTimeout(() => {
      if (roomState.joined) sendMsg(payload);
    }, jitter);
  } else {
    sendMsg(payload);
  }
}

export function notifyRoomLiveProgress({ score, maxScore, hits, total, doneNotes, misses, acc, tight }) {
  if (!roomState.joined || roomState.phase !== "PLAYING" || roomState.eliminatedInRound) return;
  const me = roomState.players.get(roomState.clientId);
  if (!me) return;

  me.score = Math.round(score || 0);
  me.maxScore = Math.round(maxScore || 0);
  me.hits = hits || 0;
  me.total = total || 0;
  me.doneNotes = doneNotes || 0;
  me.misses = misses || 0;
  me.acc = Number.isFinite(acc) ? acc : 0;
  me.tight = tight || 0;

  // Sudden Death (3 misses out) check
  if (roomState.rule === "sd3" && me.misses >= 3) {
    roomState.eliminatedInRound = true;
    me.status = "OUT";
    me.rank = "OUT";
    me.rankCls = "rank-c";
    cbs.stopRun();
    cbs.setHitBadge(t("roomEliminatedBadge"), "err");
    sendFinishWithCrowdJitter({
      type: "finish",
      roundId: roomState.roundId,
      id: me.id,
      name: me.name,
      score: me.score,
      maxScore: me.maxScore,
      acc: me.acc,
      hits: me.hits,
      total: me.total,
      doneNotes: me.doneNotes,
      misses: me.misses,
      tight: me.tight,
      rank: "OUT",
      rankCls: "rank-c",
      eliminated: true,
    });
    checkRoundCompletion();
    renderRoomUi();
    return;
  }

  // Always update own local UI immediately; adapt network broadcast rate to room size
  renderRoomUi();
  const minInterval = getAdaptiveProgressIntervalMs();
  if (!Number.isFinite(minInterval)) return;
  const now = performance.now();
  if (now - roomState.lastProgressSentMs < minInterval) return;
  roomState.lastProgressSentMs = now;
  sendMsg({
    type: "progress",
    roundId: roomState.roundId,
    id: me.id,
    name: me.name,
    score: me.score,
    maxScore: me.maxScore,
    acc: me.acc,
    hits: me.hits,
    total: me.total,
    doneNotes: me.doneNotes,
    misses: me.misses,
    tight: me.tight,
    eliminated: false,
  });
}

export function notifyRoomFinish({ score, maxScore, acc, hits, total, misses, tight, mean, sd, rank, rankCls }) {
  if (!roomState.joined || roomState.phase !== "PLAYING" || roomState.eliminatedInRound) return;
  const me = roomState.players.get(roomState.clientId);
  if (!me) return;
  me.score = Math.round(score || 0);
  me.maxScore = Math.round(maxScore || 0);
  me.acc = Number.isFinite(acc) ? acc : 0;
  me.hits = hits || 0;
  me.total = total || 0;
  me.doneNotes = total || 0;
  me.misses = misses || 0;
  me.tight = tight || 0;
  me.mean = Number.isFinite(mean) ? mean : 0;
  me.sd = Number.isFinite(sd) ? sd : 0;
  me.rank = rank || "";
  me.rankCls = rankCls || "rank-b";
  me.status = "DONE";

  sendFinishWithCrowdJitter({
    type: "finish",
    roundId: roomState.roundId,
    id: me.id,
    name: me.name,
    score: me.score,
    maxScore: me.maxScore,
    acc: me.acc,
    hits: me.hits,
    total: me.total,
    doneNotes: me.doneNotes,
    misses: me.misses,
    tight: me.tight,
    mean: me.mean,
    sd: me.sd,
    rank: me.rank,
    rankCls: me.rankCls,
    eliminated: false,
  });
  checkRoundCompletion();
  renderRoomUi();
}

// =========================================================================
// Join / Create / Leave / Host Actions
// =========================================================================
async function connectRoom({ code, name, createAsHost = false, restoreHost = null }) {
  if (roomState.joined) await leaveRoom(false);

  const cleanCode = sanitizeRoomCode(code) || generateRoomCode();
  const cleanNick = sanitizeNick(name);
  try { localStorage.setItem(NICK_STORAGE_KEY, cleanNick); } catch (_) {}

  roomState.code = cleanCode;
  roomState.name = cleanNick;
  roomState.bots = [];
  roomState.chatLog = [];
  roomState.players.clear();
  roomState.phase = "LOBBY";

  const savedHost = restoreHost || loadHostSession(cleanCode);
  if (createAsHost) {
    roomState.isHost = true;
    roomState.hostToken = randomId(16);
  } else if (savedHost && savedHost.hostToken) {
    roomState.isHost = true;
    roomState.clientId = savedHost.clientId || roomState.clientId;
    roomState.hostToken = savedHost.hostToken;
    roomState.rule = savedHost.rule || "score";
  } else {
    roomState.isHost = false;
    roomState.hostToken = "";
  }

  roomState.chart = getCurrentChartPayload();
  roomState.players.set(roomState.clientId, makePlayerRecord(roomState.clientId, roomState.name, roomState.isHost, false));

  setRoomStatusMsg(t("roomConnecting"), "var(--accent)");
  let transport = null;
  if (isSupabaseConfigured()) {
    try {
      transport = await createSupabaseTransport(cleanCode, handleIncomingMessage, handleRemotePresenceSync);
    } catch (err) {
      setRoomStatusMsg(t("roomFallbackLocal", err.message || "network"), "var(--amber)");
      transport = createLocalTransport(cleanCode, handleIncomingMessage);
    }
  } else {
    transport = createLocalTransport(cleanCode, handleIncomingMessage);
  }

  roomState.transport = transport;
  roomState.transportMode = transport.mode;
  roomState.joined = true;
  persistHostSession();
  syncRoomUrlParam(cleanCode);

  sendMsg({
    type: roomState.isHost && savedHost ? "host_reclaim" : "hello",
    id: roomState.clientId,
    name: roomState.name,
    isHost: roomState.isHost,
  });
  if (roomState.isHost) {
    sendMsg(buildHostSyncPayload());
  }

  trackEvent(createAsHost ? "room_create" : "room_join", {
    transport: roomState.transportMode,
  });

  setRoomStatusMsg(
    roomState.transportMode === "supabase" ? t("roomConnectedOnline") : t("roomConnectedLocal"),
    "var(--muted)"
  );
  appendChatMessage({ sys: true, text: t("roomSysJoin", roomState.name) });
  renderRoomUi();
}

export async function leaveRoom(clearUrl = true) {
  clearRoundTimers();
  if (roomState.joined) {
    sendMsg({ type: "leave", id: roomState.clientId });
    if (roomState.transport) {
      await roomState.transport.close();
      roomState.transport = null;
    }
  }
  roomState.joined = false;
  roomState.code = "";
  roomState.isHost = false;
  roomState.phase = "LOBBY";
  roomState.players.clear();
  roomState.bots = [];
  clearLastRoomSession();
  if (clearUrl) syncRoomUrlParam("");
  renderRoomUi();
}

function hostStartRound() {
  if (!roomState.joined || !roomState.isHost) return;
  cbs.unlockAudio(); // Synchronously unlock Web Audio on user gesture before countdown setTimeout!
  const chart = getCurrentChartPayload();
  roomState.chart = chart;
  const nextRoundId = roomState.roundId + 1;
  const payload = {
    type: "round_start",
    roundId: nextRoundId,
    rule: roomState.rule,
    chart,
    startDelayMs: 3000,
  };
  sendMsg(payload);
  beginSyncedRound(payload);
}

function hostNextScore() {
  if (!roomState.joined || !roomState.isHost) return;
  clearRoundTimers();
  cbs.newPhrase();
  roomState.phase = "LOBBY";
  for (const p of roomState.players.values()) p.status = "READY";
  roomState.chart = getCurrentChartPayload();
  sendMsg(buildHostSyncPayload());
  renderRoomUi();
}

function hostForcePodium() {
  if (!roomState.joined || !roomState.isHost) return;
  clearBotTimers();
  roomState.phase = "PODIUM";
  sendMsg({ type: "podium_show", roundId: roomState.roundId });
  renderRoomUi();
}

function hostAddBot() {
  if (!roomState.joined || !roomState.isHost) return;
  if (roomState.bots.length >= 3) {
    // Cycle: remove all bots when already at 3 so user can toggle cleanly
    for (const id of roomState.bots) roomState.players.delete(id);
    roomState.bots = [];
  } else {
    if (roomState.players.size >= MAX_ROOM_PLAYERS) {
      setRoomStatusMsg(t("roomFullMsg", MAX_ROOM_PLAYERS), "var(--amber)");
      return;
    }
    const idx = roomState.bots.length;
    const prof = BOT_PROFILES[idx % BOT_PROFILES.length];
    const id = `BOT_${idx + 1}_${randomId(4)}`;
    const rec = makePlayerRecord(id, `🤖 ${prof.name}`, false, true);
    rec.botProfileIdx = idx;
    roomState.bots.push(id);
    roomState.players.set(id, rec);
  }
  sendMsg(buildHostSyncPayload());
  renderRoomUi();
}

// =========================================================================
// UI Rendering
// =========================================================================
function setRoomStatusMsg(text, color = "var(--muted)") {
  const el = document.getElementById("roomMsg");
  if (!el) return;
  el.style.color = color;
  el.textContent = text;
}

function sortedPlayers() {
  return [...roomState.players.values()].sort((a, b) => {
    // Eliminated players rank below active/done players with higher progress/score
    if ((a.status === "OUT") !== (b.status === "OUT")) return a.status === "OUT" ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.acc !== a.acc) return b.acc - a.acc;
    return a.joinedAt - b.joinedAt;
  });
}

export function renderRoomUi() {
  const bar = document.getElementById("roomBar");
  const btnRoom = document.getElementById("btnRoom");
  if (!bar) return;

  if (btnRoom) {
    btnRoom.classList.toggle("active", roomState.open || roomState.joined);
    btnRoom.textContent = roomState.joined ? `⚔️ #${roomState.code}` : t("btnRoom");
  }

  const entryEl = document.getElementById("roomEntryView");
  const activeEl = document.getElementById("roomActiveView");
  if (!entryEl || !activeEl) return;

  entryEl.classList.toggle("hidden", roomState.joined);
  activeEl.classList.toggle("hidden", !roomState.joined);

  if (!roomState.joined) return;

  document.getElementById("roomCodeBadge").textContent = `#${roomState.code}`;
  const modeBadge = document.getElementById("roomModeBadge");
  modeBadge.textContent = roomState.transportMode === "supabase" ? t("roomBadgeOnline") : t("roomBadgeLocal");
  modeBadge.className = `room-mode-pill ${roomState.transportMode === "supabase" ? "online" : "local"}`;

  const hostCtrls = document.getElementById("roomHostControls");
  hostCtrls.classList.toggle("hidden", !roomState.isHost);

  const ruleSel = document.getElementById("roomRuleSelect");
  if (ruleSel) ruleSel.value = roomState.rule;

  const botBtn = document.getElementById("btnRoomAddBot");
  if (botBtn) {
    const canAddBot = roomState.bots.length >= 3 || roomState.players.size < MAX_ROOM_PLAYERS;
    botBtn.disabled = !canAddBot;
    botBtn.textContent = roomState.bots.length >= 3
      ? t("roomClearBots")
      : t("roomAddBot", roomState.bots.length);
  }

  const startBtn = document.getElementById("btnRoomStart");
  if (startBtn) {
    startBtn.disabled = roomState.phase === "COUNTDOWN";
    startBtn.textContent = roomState.phase === "PODIUM"
      ? t("roomRematch")
      : (roomState.phase === "PLAYING" ? t("roomRestart") : t("roomStartRound"));
  }

  const endNowBtn = document.getElementById("btnRoomEndNow");
  if (endNowBtn) {
    endNowBtn.classList.toggle("hidden", roomState.phase !== "PLAYING");
  }

  const chartLabel = (roomState.chart && roomState.chart.label) || getCurrentChartPayload().label;
  const ruleTxt = roomState.rule === "sd3" ? t("roomRuleSd3Short") : t("roomRuleScoreShort");
  const phaseTxt = roomState.phase === "COUNTDOWN"
    ? t("roomPhaseCountdown")
    : (roomState.phase === "PLAYING"
      ? t("roomPhasePlaying")
      : (roomState.phase === "PODIUM" ? t("roomPhasePodium") : t("roomPhaseLobby")));
  document.getElementById("roomChartSummary").textContent = `${phaseTxt} · ${ruleTxt} · ${chartLabel} · ${roomState.players.size}/${MAX_ROOM_PLAYERS}P`;

  const cdBanner = document.getElementById("roomCountdownBanner");
  if (cdBanner) {
    const showCd = roomState.phase === "COUNTDOWN" && roomState.countdownSec > 0;
    cdBanner.classList.toggle("hidden", !showCd);
    if (showCd) cdBanner.textContent = t("roomCountdownBanner", roomState.countdownSec);
  }

  // Render Podium (1st–3rd) when PODIUM
  const podiumEl = document.getElementById("roomPodium");
  const list = sortedPlayers();
  if (roomState.phase === "PODIUM" && list.length > 0) {
    podiumEl.classList.remove("hidden");
    const top3 = [list[1], list[0], list[2]]; // 2nd (left), 1st (center), 3rd (right)
    const medals = [
      { idx: 1, icon: "🥈", cls: "p2", rankNum: "2nd" },
      { idx: 0, icon: "🥇", cls: "p1", rankNum: "1st" },
      { idx: 2, icon: "🥉", cls: "p3", rankNum: "3rd" },
    ];
    podiumEl.innerHTML = medals.map((m, slot) => {
      const p = top3[slot];
      if (!p) return `<div class="podium-slot empty"></div>`;
      const isMe = p.id === roomState.clientId;
      return `<div class="podium-slot ${m.cls}${isMe ? " is-me" : ""}">
        <div class="podium-medal">${m.icon}</div>
        <div class="podium-name">${escapeHtml(p.name)}</div>
        <div class="podium-score">${p.score.toLocaleString()}</div>
        <div class="podium-meta">${p.rank || "—"} · ${p.acc.toFixed(0)}%${p.status === "OUT" ? " · 💀" : ""}</div>
      </div>`;
    }).join("");
  } else {
    podiumEl.classList.add("hidden");
    podiumEl.innerHTML = "";
  }

  // Render Live Leaderboard / Participant Rows
  const boardEl = document.getElementById("roomLeaderboard");
  boardEl.innerHTML = list.map((p, idx) => {
    const isMe = p.id === roomState.clientId;
    const pct = p.total > 0 ? Math.min(100, Math.round((p.doneNotes / p.total) * 100)) : 0;
    const statusBadge = p.status === "OUT"
      ? `<span class="room-st out">💀 OUT</span>`
      : (p.status === "DONE"
        ? `<span class="room-st done">${p.rank || "DONE"}</span>`
        : (p.status === "PLAYING"
          ? `<span class="room-st play">${p.doneNotes}/${p.total || "?"}</span>`
          : `<span class="room-st ready">READY</span>`));
    const crown = p.isHost ? "👑 " : "";
    const meTag = isMe ? ` <span class="room-me-tag">YOU</span>` : "";
    const scoreStr = (roomState.phase === "LOBBY" && p.score === 0) ? "—" : p.score.toLocaleString();
    const accStr = (roomState.phase === "LOBBY" && p.doneNotes === 0) ? "" : `${p.acc.toFixed(0)}%`;
    return `<div class="room-player-row${isMe ? " is-me" : ""}${p.status === "OUT" ? " is-out" : ""}">
      <span class="room-pos">#${idx + 1}</span>
      <div class="room-player-main">
        <div class="room-player-top">
          <span class="room-player-name">${crown}${escapeHtml(p.name)}${meTag}</span>
          <span class="room-player-stats">${accStr ? `<span>${accStr}</span> · ` : ""}<strong>${scoreStr}</strong></span>
        </div>
        <div class="room-prog-track"><div class="room-prog-fill${p.status === "OUT" ? " out" : (p.status === "DONE" ? " done" : "")}" style="width:${pct}%"></div></div>
      </div>
      ${statusBadge}
    </div>`;
  }).join("");
}

export function syncRoomLanguage() {
  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTxt("lblRoomTitle", "roomTitle");
  setTxt("btnRoomCreate", "roomCreateBtn");
  setTxt("btnRoomJoin", "roomJoinBtn");
  setTxt("btnRoomCopyLink", "roomCopyInvite");
  setTxt("btnRoomLeave", "roomLeaveBtn");
  setTxt("btnRoomNewScore", "roomNextScore");
  setTxt("btnRoomEndNow", "roomEndNow");
  setTxt("btnRoomChatSend", "roomChatSend");
  setTxt("lblRoomChatTitle", "roomChatTitle");
  syncChatMuteUi();
  renderChatLog();

  const nickIn = document.getElementById("roomNickInput");
  if (nickIn) nickIn.placeholder = t("roomNickPlaceholder");
  const codeIn = document.getElementById("roomCodeInput");
  if (codeIn) codeIn.placeholder = t("roomCodePlaceholder");
  const chatIn = document.getElementById("roomChatInput");
  if (chatIn) chatIn.placeholder = t("roomChatPlaceholder");

  const ruleSel = document.getElementById("roomRuleSelect");
  const ruleOpts = t("roomRuleOpts") || [];
  if (ruleSel) {
    for (let i = 0; i < ruleSel.options.length && i < ruleOpts.length; i++) {
      ruleSel.options[i].textContent = ruleOpts[i];
    }
  }

  if (!roomState.joined) {
    setRoomStatusMsg(isSupabaseConfigured() ? t("roomIdleOnline") : t("roomIdleLocal"));
  } else {
    setRoomStatusMsg(roomState.transportMode === "supabase" ? t("roomConnectedOnline") : t("roomConnectedLocal"));
  }
  renderRoomUi();
}

export function toggleRoomBar(forceOpen = null) {
  const bar = document.getElementById("roomBar");
  if (!bar) return;
  const open = forceOpen !== null ? forceOpen : bar.classList.contains("hidden");
  roomState.open = open;
  bar.classList.toggle("hidden", !open);
  renderRoomUi();
}

export function initRoom(callbacks) {
  cbs = { ...cbs, ...callbacks };

  const nickIn = document.getElementById("roomNickInput");
  const codeIn = document.getElementById("roomCodeInput");
  try {
    const savedNick = localStorage.getItem(NICK_STORAGE_KEY);
    if (savedNick && nickIn) nickIn.value = savedNick;
    roomState.chatMuted = localStorage.getItem(CHAT_MUTE_STORAGE_KEY) === "1";
  } catch (_) {}

  document.getElementById("btnRoom").addEventListener("click", (e) => {
    e.currentTarget.blur();
    toggleRoomBar();
  });
  document.getElementById("btnRoomClose").addEventListener("click", () => toggleRoomBar(false));

  document.getElementById("btnRoomCreate").addEventListener("click", async (e) => {
    e.currentTarget.blur();
    const nick = nickIn ? nickIn.value : "";
    await connectRoom({ code: generateRoomCode(), name: nick, createAsHost: true });
  });

  const doJoin = async () => {
    const code = sanitizeRoomCode(codeIn ? codeIn.value : "");
    if (code.length < 3) {
      setRoomStatusMsg(t("roomCodeInvalid"), "var(--red)");
      if (codeIn) codeIn.focus();
      return;
    }
    const nick = nickIn ? nickIn.value : "";
    await connectRoom({ code, name: nick, createAsHost: false });
  };

  document.getElementById("btnRoomJoin").addEventListener("click", (e) => {
    e.currentTarget.blur();
    doJoin();
  });
  if (codeIn) {
    codeIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doJoin(); }
    });
  }

  document.getElementById("btnRoomCopyLink").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.blur();
    if (!roomState.code) return;
    await copyToClipboard(buildRoomInviteUrl(roomState.code));
    flashBtnText(btn, t("btnShareCopied"), () => t("roomCopyInvite"));
  });

  document.getElementById("btnRoomLeave").addEventListener("click", (e) => {
    e.currentTarget.blur();
    leaveRoom(true);
  });

  document.getElementById("roomRuleSelect").addEventListener("change", (e) => {
    e.target.blur();
    if (!roomState.isHost) return;
    roomState.rule = e.target.value === "sd3" ? "sd3" : "score";
    persistHostSession();
    sendMsg(buildHostSyncPayload());
    renderRoomUi();
  });

  document.getElementById("btnRoomAddBot").addEventListener("click", (e) => {
    e.currentTarget.blur();
    hostAddBot();
  });
  document.getElementById("btnRoomNewScore").addEventListener("click", (e) => {
    e.currentTarget.blur();
    hostNextScore();
  });
  document.getElementById("btnRoomStart").addEventListener("click", (e) => {
    e.currentTarget.blur();
    hostStartRound();
  });
  document.getElementById("btnRoomEndNow").addEventListener("click", (e) => {
    e.currentTarget.blur();
    hostForcePodium();
  });

  const chatInput = document.getElementById("roomChatInput");
  const doSendChat = () => {
    if (!chatInput) return;
    const val = chatInput.value;
    if (!val.trim()) return;
    chatInput.value = "";
    sendChatMessage(val);
  };
  document.getElementById("btnRoomChatSend").addEventListener("click", (e) => {
    e.currentTarget.blur();
    doSendChat();
  });
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        doSendChat();
      }
    });
  }
  document.getElementById("btnRoomMuteChat").addEventListener("click", (e) => {
    e.currentTarget.blur();
    roomState.chatMuted = !roomState.chatMuted;
    try { localStorage.setItem(CHAT_MUTE_STORAGE_KEY, roomState.chatMuted ? "1" : "0"); } catch (_) {}
    syncChatMuteUi();
  });

  document.getElementById("roomChatLog").addEventListener("click", (e) => {
    const btn = e.target.closest(".chat-block-btn");
    if (!btn) return;
    const bid = btn.dataset.blockId;
    const bname = btn.dataset.blockName || "User";
    if (!bid) return;
    roomState.blockedIds.add(bid);
    appendChatMessage({ sys: true, text: t("roomSysBlocked", bname) });
    renderChatLog();
  });

  document.getElementById("btnRoomUnblockAll").addEventListener("click", (e) => {
    e.currentTarget.blur();
    roomState.blockedIds.clear();
    appendChatMessage({ sys: true, text: t("roomSysUnblocked") });
    renderChatLog();
  });

  document.querySelectorAll(".room-react-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      sendChatMessage(btn.dataset.react || "🔥");
    });
  });

  window.addEventListener("pagehide", () => {
    if (roomState.joined) {
      sendMsg({ type: "leave", id: roomState.clientId });
    }
  });

  // Auto-open or auto-rejoin when URL has ?room=XXXX (supports host refresh recovery!)
  const params = new URLSearchParams(location.search || "");
  const roomParam = sanitizeRoomCode(params.get("room"));
  if (roomParam) {
    toggleRoomBar(true);
    if (codeIn) codeIn.value = roomParam;
    const hostRecovery = loadHostSession(roomParam);
    if (hostRecovery) {
      if (nickIn && hostRecovery.name) nickIn.value = hostRecovery.name;
      connectRoom({ code: roomParam, name: hostRecovery.name, createAsHost: false, restoreHost: hostRecovery });
    }
  }

  syncRoomLanguage();
}
