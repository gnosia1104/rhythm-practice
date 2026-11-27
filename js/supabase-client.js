// Shared Supabase Client & Persistent Player Identity Utility
// Reused by both Real-Time Multiplayer Rooms (room.js) and Global Leaderboard (leaderboard.js).

export const SUPABASE_URL = "https://fdpnrxkohvfrcesoxpwo.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ifPAkMXSsD1C_2xEToofNg_GtDLtkVB";

export const NICK_STORAGE_KEY = "rhythm_room_nick_v1";
const CLIENT_ID_STORAGE_KEY = "rhythm_player_uid_v1";
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let supabaseClientPromise = null;

export function randomCode(len = 10) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return out;
}

export function getPersistentClientId() {
  try {
    const saved = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (saved && /^[A-Z0-9_-]{8,32}$/.test(saved)) return saved;
    const fresh = `P_${randomCode(12)}`;
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch (_) {
    return `P_${randomCode(12)}`;
  }
}

export function loadSavedNickname() {
  try {
    return String(localStorage.getItem(NICK_STORAGE_KEY) || "").trim().slice(0, 16);
  } catch (_) {
    return "";
  }
}

export function saveNickname(raw) {
  const clean = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 16);
  try {
    if (clean) localStorage.setItem(NICK_STORAGE_KEY, clean);
  } catch (_) {}
  return clean;
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_URL.trim() && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.trim());
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
      .then((mod) => mod.createClient(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim(), {
        realtime: { params: { eventsPerSecond: 10 } },
      }));
  }
  return supabaseClientPromise;
}
