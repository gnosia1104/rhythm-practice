// In-App Quick Feedback Drawer (Write-Only Supabase RPC, Zero Login, Auto Environment Context)
import { IS_MOBILE, app } from "./state.js";
import { t, getCurLang } from "./i18n.js";
import { isSupabaseConfigured, getSupabaseClient, getPersistentClientId } from "./supabase-client.js";
import { trackEvent } from "./analytics.js";

const VALID_CATS = ["bug", "idea", "audio"];

const fbState = {
  open: false,
  cat: "idea",
  sending: false,
  clientId: getPersistentClientId(),
};

let cbs = {
  onUiChange: () => {},
  setHitBadge: () => {},
};

function setFbMsg(text, color = "var(--muted)") {
  const el = document.getElementById("fbMsg");
  if (!el) return;
  el.style.color = color;
  el.textContent = text;
}

function collectEnvMeta() {
  return {
    mobile: Boolean(IS_MOBILE),
    vw: window.innerWidth || 0,
    vh: window.innerHeight || 0,
    level: app.level,
    bpm: app.bpm,
    ts: app.timeSig,
    pitch: Boolean(app.pitchMode),
    endless: Boolean(app.endlessMode),
    ua: String(navigator.userAgent || "").slice(0, 140),
  };
}

function updateCharCount() {
  const ta = document.getElementById("fbText");
  const cnt = document.getElementById("fbCharCount");
  if (ta && cnt) {
    cnt.textContent = `${ta.value.length} / 800`;
  }
}

function renderCategoryPills() {
  document.querySelectorAll(".fb-cat-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.fbCat === fbState.cat);
  });
}

export function toggleFeedbackBar(forceOpen = null) {
  const bar = document.getElementById("feedbackBar");
  if (!bar) return;
  const open = forceOpen !== null ? forceOpen : bar.classList.contains("hidden");
  fbState.open = open;
  bar.classList.toggle("hidden", !open);
  const btn = document.getElementById("btnFeedback");
  if (btn) btn.classList.toggle("active", open);
  cbs.onUiChange();
  if (open) {
    renderCategoryPills();
    updateCharCount();
    const ta = document.getElementById("fbText");
    if (ta) window.setTimeout(() => ta.focus(), 40);
  }
}

async function submitFeedbackForm() {
  if (fbState.sending) return;
  const ta = document.getElementById("fbText");
  const contactIn = document.getElementById("fbContact");
  const sendBtn = document.getElementById("btnFbSend");
  if (!ta) return;

  const msg = ta.value.trim();
  if (msg.length < 3) {
    setFbMsg(t("fbTooShort"), "var(--red)");
    ta.focus();
    return;
  }
  if (!isSupabaseConfigured()) {
    setFbMsg(t("fbOfflineErr"), "var(--red)");
    return;
  }

  fbState.sending = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = t("fbSending");
  }
  setFbMsg(t("fbSending"), "var(--muted)");

  try {
    const sb = await getSupabaseClient();
    const { error } = await sb.rpc("submit_feedback", {
      p_category: fbState.cat,
      p_message: msg.slice(0, 800),
      p_contact: contactIn ? contactIn.value.trim().slice(0, 80) : "",
      p_lang: getCurLang(),
      p_input_mode: app.inputMode || "KEY",
      p_meta: collectEnvMeta(),
      p_client_id: fbState.clientId,
    });
    if (!error) {
      ta.value = "";
      updateCharCount();
      setFbMsg(t("fbSentOk"), "var(--green)");
      cbs.setHitBadge(t("fbSentBadge"), "tight");
      trackEvent("feedback_submit", { cat: fbState.cat });
    } else {
      const m = String(error.message || "");
      if (m.includes("rate_limited")) {
        setFbMsg(t("fbRateLimited"), "var(--amber)");
      } else if (m.includes("message_too_short")) {
        setFbMsg(t("fbTooShort"), "var(--red)");
      } else {
        setFbMsg(t("fbSendErr"), "var(--red)");
      }
    }
  } catch (_) {
    setFbMsg(t("fbSendErr"), "var(--red)");
  } finally {
    fbState.sending = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = t("fbSendBtn");
    }
  }
}

export function syncFeedbackLanguage() {
  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTxt("btnFeedback", "btnFeedback");
  setTxt("lblFbTitle", "fbTitle");
  setTxt("fbEnvHint", "fbEnvHint");
  setTxt("btnFbSend", "fbSendBtn");

  const catMap = { bug: "fbCatBug", idea: "fbCatIdea", audio: "fbCatAudio" };
  document.querySelectorAll(".fb-cat-btn").forEach((b) => {
    const k = catMap[b.dataset.fbCat];
    if (k) b.textContent = t(k);
  });

  const ta = document.getElementById("fbText");
  if (ta) ta.placeholder = t("fbPlaceholder");
  const contactIn = document.getElementById("fbContact");
  if (contactIn) contactIn.placeholder = t("fbContactPlaceholder");

  setFbMsg(t("fbIdleHint"), "var(--muted)");
}

export function initFeedback(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };

  const btnOpen = document.getElementById("btnFeedback");
  if (btnOpen) {
    btnOpen.addEventListener("click", (e) => {
      e.currentTarget.blur();
      toggleFeedbackBar();
    });
  }
  const btnClose = document.getElementById("btnFbClose");
  if (btnClose) {
    btnClose.addEventListener("click", () => toggleFeedbackBar(false));
  }
  document.querySelectorAll(".fb-cat-btn").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.currentTarget.blur();
      const c = b.dataset.fbCat;
      if (!VALID_CATS.includes(c)) return;
      fbState.cat = c;
      renderCategoryPills();
    });
  });

  const ta = document.getElementById("fbText");
  if (ta) {
    ta.addEventListener("input", updateCharCount);
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitFeedbackForm();
      }
    });
  }
  const sendBtn = document.getElementById("btnFbSend");
  if (sendBtn) {
    sendBtn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      submitFeedbackForm();
    });
  }

  renderCategoryPills();
  updateCharCount();
  syncFeedbackLanguage();
}
