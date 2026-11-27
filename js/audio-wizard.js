// Interactive 3-Step Live Audio Interface Setup Wizard (Permission/Device -> Noise Floor -> Gain/Attack Test)
import { app, audioIn } from "./state.js";
import { t } from "./i18n.js";

const WIZARD_DONE_KEY = "rhythm_audio_setup_done_v1";
const BUILTIN_MIC_RE = /macbook|built-in|internal|내장|iphone|continuity|airpods/i;

const awState = {
  open: false,
  confirmedBuiltin: false,
  noiseDone: false,
  pluckPeak: 0,
  pluckDetected: false,
  pluckHot: false,
  pluckWeak: false,
  lastSeenTriggerMs: 0,
  pollId: null,
};

let cbs = {
  startAudioInput: async () => false,
  triggerNoiseCal: () => {},
  syncGain: () => {},
  setHitBadge: () => {},
};

function hasCompletedWizard() {
  try { return localStorage.getItem(WIZARD_DONE_KEY) === "1"; } catch (_) { return false; }
}

function markWizardDone() {
  try { localStorage.setItem(WIZARD_DONE_KEY, "1"); } catch (_) {}
}

function startWizardPoll() {
  if (awState.pollId !== null) return;
  awState.lastSeenTriggerMs = audioIn.lastTriggerMs || 0;
  awState.pollId = window.setInterval(tickAudioWizard, 100);
}

function stopWizardPoll() {
  if (awState.pollId !== null) {
    clearInterval(awState.pollId);
    awState.pollId = null;
  }
}

function isStep1Done() {
  if (!audioIn.active) return false;
  const isBuiltin = BUILTIN_MIC_RE.test(audioIn.deviceLabel || "");
  return !isBuiltin || awState.confirmedBuiltin;
}

function isStep3Done() {
  return audioIn.active && awState.pluckDetected && !awState.pluckHot;
}

function renderAudioWizard() {
  const box = document.getElementById("audioWizard");
  const toggleBtn = document.getElementById("btnAudioWizard");
  if (toggleBtn) toggleBtn.classList.toggle("active", awState.open);
  if (!box) return;
  box.classList.toggle("hidden", !awState.open);
  if (!awState.open) return;

  const s1Ok = isStep1Done();
  const s2Ok = awState.noiseDone;
  const s3Ok = isStep3Done();
  const doneCount = (s1Ok ? 1 : 0) + (s2Ok ? 1 : 0) + (s3Ok ? 1 : 0);

  const progEl = document.getElementById("awProgress");
  if (progEl) {
    progEl.textContent = `${doneCount} / 3`;
    progEl.classList.toggle("done", doneCount === 3);
  }

  // Step 1: Permission & Interface
  const s1Card = document.getElementById("awStep1");
  const s1Desc = document.getElementById("awStep1Desc");
  const s1Btn = document.getElementById("btnAwStep1");
  const s1ConfirmBtn = document.getElementById("btnAwUseBuiltin");
  if (s1Card && s1Desc && s1Btn && s1ConfirmBtn) {
    const isBuiltin = audioIn.active && BUILTIN_MIC_RE.test(audioIn.deviceLabel || "");
    s1Card.classList.toggle("done", s1Ok);
    s1Card.classList.toggle("active", !s1Ok);
    if (!audioIn.active) {
      s1Desc.textContent = t("awStep1NeedPerm");
      s1Btn.textContent = t("awStep1BtnConnect");
      s1Btn.classList.remove("hidden");
      s1ConfirmBtn.classList.add("hidden");
    } else if (isBuiltin && !awState.confirmedBuiltin) {
      s1Desc.textContent = t("awStep1BuiltinWarn", audioIn.deviceLabel || "Built-in Mic");
      s1Btn.textContent = t("awStep1BtnReconnect");
      s1Btn.classList.remove("hidden");
      s1ConfirmBtn.textContent = t("awStep1BtnKeepMic");
      s1ConfirmBtn.classList.remove("hidden");
    } else {
      s1Desc.textContent = t("awStep1Ok", audioIn.deviceLabel || t("sysDefault"), audioIn.channelCount || 1);
      s1Btn.classList.add("hidden");
      s1ConfirmBtn.classList.add("hidden");
    }
  }

  // Step 2: Noise floor calibration
  const s2Card = document.getElementById("awStep2");
  const s2Desc = document.getElementById("awStep2Desc");
  const s2Btn = document.getElementById("btnAwNoiseCal");
  const s2Skip = document.getElementById("btnAwSkipNoise");
  if (s2Card && s2Desc && s2Btn && s2Skip) {
    s2Card.classList.toggle("done", s2Ok);
    s2Card.classList.toggle("active", s1Ok && !s2Ok);
    if (audioIn.calibrating) {
      s2Desc.textContent = t("awStep2Measuring");
      s2Btn.disabled = true;
      s2Btn.textContent = t("btnMeasuring");
      s2Skip.classList.add("hidden");
    } else if (s2Ok) {
      s2Desc.textContent = t("awStep2Ok", Math.round((audioIn.threshold || 0.16) * 100));
      s2Btn.disabled = !audioIn.active;
      s2Btn.textContent = t("awStep2BtnAgain");
      s2Skip.classList.add("hidden");
    } else {
      s2Desc.textContent = t("awStep2Idle");
      s2Btn.disabled = !audioIn.active;
      s2Btn.textContent = t("awStep2BtnRun");
      s2Skip.textContent = t("awStep2Skip");
      s2Skip.classList.remove("hidden");
    }
  }

  // Step 3: Live pluck & gain test
  const s3Card = document.getElementById("awStep3");
  const s3Desc = document.getElementById("awStep3Desc");
  const btnGainUp = document.getElementById("btnAwGainUp");
  const btnGainDown = document.getElementById("btnAwGainDown");
  const btnFinish = document.getElementById("btnAwFinish");
  const mFill = document.getElementById("awMeterFill");
  const mThr = document.getElementById("awMeterThr");
  if (s3Card && s3Desc && btnGainUp && btnGainDown && btnFinish) {
    s3Card.classList.toggle("done", s3Ok);
    s3Card.classList.toggle("active", s1Ok && s2Ok && !s3Ok);

    const lvl = audioIn.active ? Math.min(1, audioIn.level || 0) : 0;
    const thr = Math.min(0.96, audioIn.threshold || 0.16);
    if (mFill) {
      mFill.style.width = `${Math.round(Math.pow(lvl, 0.55) * 100)}%`;
      mFill.classList.toggle("hot", lvl >= 0.90);
      mFill.classList.toggle("ok", lvl >= thr && lvl < 0.90);
    }
    if (mThr) {
      mThr.style.left = `${Math.min(96, Math.round(Math.pow(thr, 0.55) * 100))}%`;
    }

    if (!audioIn.active) {
      s3Desc.textContent = t("awStep3WaitAudio");
      btnGainUp.classList.add("hidden");
      btnGainDown.classList.add("hidden");
      btnFinish.classList.add("hidden");
    } else if (awState.pluckHot) {
      s3Desc.textContent = t("awStep3TooHot", Math.round(awState.pluckPeak * 100));
      btnGainUp.classList.add("hidden");
      btnGainDown.textContent = t("awBtnGainDown");
      btnGainDown.classList.remove("hidden");
      btnFinish.classList.add("hidden");
    } else if (s3Ok) {
      const ch = (audioIn.hotChannel || 0) + 1;
      s3Desc.textContent = t("awStep3Ok", audioIn.gain || 2, ch);
      btnGainUp.classList.add("hidden");
      btnGainDown.classList.add("hidden");
      btnFinish.textContent = t("awBtnFinish");
      btnFinish.classList.remove("hidden");
    } else if (awState.pluckWeak) {
      s3Desc.textContent = t("awStep3TooWeak", Math.round(awState.pluckPeak * 100));
      btnGainUp.textContent = t("awBtnGainUp");
      btnGainUp.classList.remove("hidden");
      btnGainDown.classList.add("hidden");
      btnFinish.classList.add("hidden");
    } else {
      s3Desc.textContent = t("awStep3Prompt");
      btnGainUp.classList.add("hidden");
      btnGainDown.classList.add("hidden");
      btnFinish.classList.add("hidden");
    }
  }
}

function tickAudioWizard() {
  if (!awState.open) return;
  if (audioIn.active && !audioIn.calibrating) {
    const lvl = audioIn.level || 0;
    const thr = audioIn.threshold || 0.16;
    if (lvl > awState.pluckPeak) {
      awState.pluckPeak = lvl;
    }
    if (lvl >= 0.90) {
      awState.pluckHot = true;
      awState.pluckWeak = false;
    } else if ((audioIn.lastTriggerMs || 0) > awState.lastSeenTriggerMs && lvl < 0.90) {
      awState.lastSeenTriggerMs = audioIn.lastTriggerMs;
      awState.pluckDetected = true;
      awState.pluckHot = false;
      awState.pluckWeak = false;
    } else if (!awState.pluckDetected && lvl >= 0.035 && lvl < thr * 1.15) {
      awState.pluckWeak = true;
    }
  }
  renderAudioWizard();
}

export function toggleAudioWizard(forceOpen = null) {
  const next = forceOpen !== null ? Boolean(forceOpen) : !awState.open;
  awState.open = next;
  if (next) {
    awState.pluckPeak = 0;
    awState.pluckHot = false;
    awState.pluckWeak = false;
    startWizardPoll();
  } else {
    stopWizardPoll();
  }
  renderAudioWizard();
}

export function onAudioBarShown() {
  if (app.audioOn && !hasCompletedWizard()) {
    toggleAudioWizard(true);
  } else if (!app.audioOn && awState.open) {
    toggleAudioWizard(false);
  }
}

export function onAudioNoiseCalDone() {
  awState.noiseDone = true;
  awState.pluckPeak = 0;
  awState.pluckWeak = false;
  awState.pluckHot = false;
  if (awState.open) renderAudioWizard();
}

export function syncAudioWizardLanguage() {
  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTxt("btnAudioWizard", "btnAudioWizard");
  setTxt("lblAwTitle", "awTitle");
  setTxt("lblAwStep1", "awStep1Title");
  setTxt("lblAwStep2", "awStep2Title");
  setTxt("lblAwStep3", "awStep3Title");
  renderAudioWizard();
}

export function initAudioWizard(callbacks = {}) {
  cbs = { ...cbs, ...callbacks };

  const btnToggle = document.getElementById("btnAudioWizard");
  if (btnToggle) {
    btnToggle.addEventListener("click", (e) => {
      e.currentTarget.blur();
      toggleAudioWizard();
    });
  }
  const btnClose = document.getElementById("btnAwClose");
  if (btnClose) {
    btnClose.addEventListener("click", () => {
      markWizardDone();
      toggleAudioWizard(false);
    });
  }
  const btnStep1 = document.getElementById("btnAwStep1");
  if (btnStep1) {
    btnStep1.addEventListener("click", async (e) => {
      e.currentTarget.blur();
      await cbs.startAudioInput(true);
      renderAudioWizard();
    });
  }
  const btnKeepMic = document.getElementById("btnAwUseBuiltin");
  if (btnKeepMic) {
    btnKeepMic.addEventListener("click", (e) => {
      e.currentTarget.blur();
      awState.confirmedBuiltin = true;
      renderAudioWizard();
    });
  }
  const btnNoise = document.getElementById("btnAwNoiseCal");
  if (btnNoise) {
    btnNoise.addEventListener("click", (e) => {
      e.currentTarget.blur();
      cbs.triggerNoiseCal();
      renderAudioWizard();
    });
  }
  const btnSkipNoise = document.getElementById("btnAwSkipNoise");
  if (btnSkipNoise) {
    btnSkipNoise.addEventListener("click", (e) => {
      e.currentTarget.blur();
      awState.noiseDone = true;
      renderAudioWizard();
    });
  }
  const btnGainUp = document.getElementById("btnAwGainUp");
  if (btnGainUp) {
    btnGainUp.addEventListener("click", (e) => {
      e.currentTarget.blur();
      cbs.syncGain(Math.min(20, (audioIn.gain || 2) + 2));
      awState.pluckPeak = 0;
      awState.pluckWeak = false;
      renderAudioWizard();
    });
  }
  const btnGainDown = document.getElementById("btnAwGainDown");
  if (btnGainDown) {
    btnGainDown.addEventListener("click", (e) => {
      e.currentTarget.blur();
      cbs.syncGain(Math.max(1, (audioIn.gain || 2) - 2));
      awState.pluckPeak = 0;
      awState.pluckHot = false;
      renderAudioWizard();
    });
  }
  const btnFinish = document.getElementById("btnAwFinish");
  if (btnFinish) {
    btnFinish.addEventListener("click", (e) => {
      e.currentTarget.blur();
      markWizardDone();
      toggleAudioWizard(false);
      cbs.setHitBadge(t("awDoneBadge"), "tight");
    });
  }

  syncAudioWizardLanguage();
}
