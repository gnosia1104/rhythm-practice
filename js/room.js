// Real-Time Multiplayer Room Engine (Gartic Phone / Kahoot style)
// Supports Supabase Realtime (Broadcast + Presence) when SUPABASE_URL & SUPABASE_ANON_KEY are set,
// and seamlessly falls back to Local Multi-Tab Mode (BroadcastChannel) for instant zero-config testing!
import { t } from "./i18n.js";
import { app, currentFullSeedCode } from "./state.js";
import { computeChartMaxInfo, getTimingThresholds } from "./scoring.js";
import { copyToClipboard, flashBtnText } from "./share-card.js";
import { trackEvent } from "./analytics.js";

// =========================================================================
// Supabase Realtime Config (Optional: leave blank for Local Multi-Tab Mode)
// Create a free project at https://supabase.com -> Project Settings -> API
// Paste Project URL and anon public key below (no DB tables needed!).
// =========================================================================
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes confusing I/O/0/1
const NICK_STORAGE_KEY = "rhythm_room_nick_v1";
const HOST_SESSION_PREFIX = "rhythm_room_host_";
const LAST_ROOM_SESSION_KEY = "rhythm_room_last_v1";
const BOT_PROFILES = [
  { name: "ChillRookie", skill: 0.78, meanBias: 14, sd: 48 }, // Easy (C~B) — fun warm-up opponent
  { name: "GrooveCat",   skill: 0.86, meanBias: -10, sd: 36 }, // Normal (B~A) — balanced rival
  { name: "PocketFox",   skill: 0.92, meanBias: 5, sd: 26 },   // Hard (A~S) — beatable boss
];

let cbs = {
  applyRoomChart: () => {},
  triggerRoomStart: () => {},
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
  if (roomState.podiumCheckTimerId) {
    window.clearTimeout(roomState.podiumCheckTimerId);
    roomState.podiumCheckTimerId = null;
  }
  clearBotTimers();
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
    const p = roomState.players.get(msg.id) || makePlayerRecord(msg.id, msg.name, Boolean(msg.isHost), false);
    p.name = msg.name || p.name;
    if (msg.isHost) p.isHost = true;
    roomState.players.set(msg.id, p);
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

  if (msg.type === "hello_ack") {
    const p = roomState.players.get(msg.id) || makePlayerRecord(msg.id, msg.name, Boolean(msg.isHost), false);
    p.name = msg.name || p.name;
    if (msg.isHost) p.isHost = true;
    roomState.players.set(msg.id, p);
    renderRoomUi();
    return;
  }

  if (msg.type === "leave") {
    roomState.players.delete(msg.id);
    renderRoomUi();
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
  renderRoomUi();

  const delay = Math.max(250, Math.min(2000, Number(msg.startDelayMs) || 800));
  cbs.setHitBadge(t("roomSyncStarting"), "tight");

  roomState.countdownTimerId = window.setTimeout(() => {
    roomState.countdownTimerId = null;
    if (!roomState.joined || roomState.roundId !== msg.roundId) return;
    roomState.phase = "PLAYING";
    renderRoomUi();
    cbs.triggerRoomStart();
    if (roomState.isHost && roomState.bots.length) {
      startBotSimulations(msg.roundId);
    }
  }, delay);
}

// =========================================================================
// Bot Simulation (Host-driven, lets anyone test live race + podium solo!)
// =========================================================================
function startBotSimulations(roundId) {
  clearBotTimers();
  if (!app.phrase || !app.phrase.targets || !app.phrase.targets.length) return;
  const targets = app.phrase.targets;
  const total = targets.length;
  const chartInfo = computeChartMaxInfo(app.phrase);
  const realMaxScore = chartInfo.maxScore || (total * 1000);
  const perNotePts = (chartInfo.noteMax || realMaxScore) / Math.max(1, total);
  const tw = getTimingThresholds(app.bpm);

  for (const botId of roomState.bots) {
    const p = roomState.players.get(botId);
    if (!p) continue;
    const prof = BOT_PROFILES[p.botProfileIdx % BOT_PROFILES.length];
    let hits = 0;
    let misses = 0;
    let tight = 0;
    let score = 0;
    let eliminated = false;
    const errs = [];

    targets.forEach((tgt, idx) => {
      const fireMs = Math.max(200, Math.round((tgt.timeSec + 0.25) * 1000));
      const tid = window.setTimeout(() => {
        if (!roomState.joined || roomState.roundId !== roundId || roomState.phase !== "PLAYING" || eliminated) return;
        const isHit = Math.random() < prof.skill;
        if (isHit) {
          // Box-Muller-ish bell curve so timing feels human rather than uniform
          const u = ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 3.2;
          const e = prof.meanBias + u * prof.sd;
          errs.push(e);
          hits += 1;
          const ae = Math.abs(e);
          if (ae <= tw.tight) { tight += 1; score += perNotePts; }
          else if (ae <= tw.ok) score += perNotePts * 0.72;
          else score += perNotePts * 0.35;
        } else {
          misses += 1;
        }

        const doneNotes = idx + 1;
        const acc = (hits / doneNotes) * 100;
        p.score = Math.round(score);
        p.maxScore = realMaxScore;
        p.hits = hits;
        p.total = total;
        p.doneNotes = doneNotes;
        p.misses = misses;
        p.acc = acc;
        p.tight = tight;

        if (roomState.rule === "sd3" && misses >= 3) {
          eliminated = true;
          p.status = "OUT";
          p.rank = "OUT";
          p.rankCls = "rank-c";
          sendMsg({
            type: "finish",
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
            rank: p.rank,
            rankCls: p.rankCls,
            eliminated: true,
          });
          checkRoundCompletion();
          renderRoomUi();
          return;
        }

        const isLast = doneNotes === total;
        if (isLast) {
          const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
          const sd = errs.length ? Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length) : 0;
          p.mean = mean;
          p.sd = sd;
          const pct = (p.score / Math.max(1, p.maxScore)) * 100;
          if (pct >= 96 && hits === total) { p.rank = "S+"; p.rankCls = "rank-sp"; }
          else if (pct >= 88) { p.rank = "S"; p.rankCls = "rank-s"; }
          else if (pct >= 76) { p.rank = "A"; p.rankCls = "rank-a"; }
          else if (pct >= 60) { p.rank = "B"; p.rankCls = "rank-b"; }
          else { p.rank = "C"; p.rankCls = "rank-c"; }
          p.status = "DONE";
        }
        sendMsg({
          type: isLast ? "finish" : "progress",
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
          eliminated: false,
        });
        if (isLast) checkRoundCompletion();
        renderRoomUi();
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
    sendMsg({
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

  const now = performance.now();
  if (now - roomState.lastProgressSentMs < 240) return;
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
  renderRoomUi();
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

  sendMsg({
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
  const chart = getCurrentChartPayload();
  roomState.chart = chart;
  const nextRoundId = roomState.roundId + 1;
  const payload = {
    type: "round_start",
    roundId: nextRoundId,
    rule: roomState.rule,
    chart,
    startDelayMs: 900,
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
  document.getElementById("roomChartSummary").textContent = `${phaseTxt} · ${ruleTxt} · ${chartLabel} · ${roomState.players.size}P`;

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

  const nickIn = document.getElementById("roomNickInput");
  if (nickIn) nickIn.placeholder = t("roomNickPlaceholder");
  const codeIn = document.getElementById("roomCodeInput");
  if (codeIn) codeIn.placeholder = t("roomCodePlaceholder");

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
