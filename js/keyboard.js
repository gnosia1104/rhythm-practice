// Global IME-Independent Keyboard Shortcut & Input Router
// Zero overlap with Pitch Sight-Reading QWERTY piano keys (Q..P / 1..0).
import { app, audioIn, tourState, tripletsAllowed } from "./state.js";
import { TIME_SIG_OPTIONS, BAR_OPTIONS } from "./rhythm.js";
import { getAudioCtx, stopScheduledAudio } from "./audio-out.js";
import { t } from "./i18n.js";

export function initKeyboard(cbs) {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (tourState && tourState.open) {
      if (e.code === "Escape") {
        e.preventDefault();
        cbs.closeTour(true);
      } else if (e.code === "ArrowRight" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
        e.preventDefault();
        cbs.nextTourStep();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        cbs.prevTourStep();
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;

    // Physical key code (e.code) works regardless of KO/JA IME state
    const code = e.code;

    // In Pitch Sight-Reading BETA, top 2 rows (1..0 & Q..P) are dedicated to playable piano input
    if (app.pitchMode) {
      if (cbs.PITCH_KEY_MAP.has(code)) {
        e.preventDefault();
        cbs.triggerPitchPianoKey(cbs.PITCH_KEY_MAP.get(code));
        return;
      }
      if (cbs.PITCH_TOP_ROW_SWALLOW.has(code)) {
        e.preventDefault();
        return;
      }
    }

    if (code === "Space" || code === "KeyJ" || code === "KeyK" || code === "KeyF" || code === "KeyD") {
      e.preventDefault();
      const hitKind = (code === "KeyF" || code === "KeyD") ? "GHOST" : "NORMAL";
      if (app.state === "CAL" && getAudioCtx()) {
        cbs.recordCalibrationTap(getAudioCtx().currentTime, "KEY");
      } else if (app.state === "COUNTIN" || app.state === "PLAY") {
        if (app.keyOn && getAudioCtx()) {
          cbs.handleHit(getAudioCtx().currentTime - app.keyLatencyMs / 1000, "KEY", hitKind, code);
        }
      } else if (app.state === "READY") {
        if (!cbs.isRoomCountingDown()) cbs.handleMainStartAction();
      }
    } else if (code === "Enter" || code === "NumpadEnter" || code === "KeyA") {
      e.preventDefault();
      cbs.handleMainStartAction();
    } else if (code === "Escape") {
      e.preventDefault();
      cbs.handleMainStopAction();
    } else if (code === "KeyN") {
      e.preventDefault();
      cbs.handleMainNewAction();
    } else if (code === "KeyH") {
      e.preventDefault();
      cbs.handleMainDemoAction();
    } else if (code === "Equal" || code === "NumpadAdd" || e.key === "+" || e.key === "=") {
      e.preventDefault();
      cbs.setBpm(app.bpm + 5);
    } else if (code === "Minus" || code === "NumpadSubtract" || e.key === "-" || e.key === "_") {
      e.preventDefault();
      cbs.setBpm(app.bpm - 5);
    } else if (/^(Digit|Numpad)[1-6]$/.test(code)) {
      cbs.setLevel(Number(code.slice(-1)));
    } else if (code === "ArrowUp") {
      e.preventDefault();
      if (app.level < 6) cbs.setLevel(app.level + 1);
    } else if (code === "ArrowDown") {
      e.preventDefault();
      if (app.level > 1) cbs.setLevel(app.level - 1);
    } else if (code === "KeyV") {
      e.preventDefault();
      app.showCursor = !app.showCursor;
      cbs.updateMeta();
    } else if (code === "KeyZ") {
      e.preventDefault();
      if (tripletsAllowed()) {
        app.tripletMode = (app.tripletMode + 1) % 3;
        cbs.newPhrase();
      }
    } else if (code === "KeyC") {
      e.preventDefault();
      app.staccatoOn = !app.staccatoOn;
      cbs.newPhrase();
    } else if (code === "KeyX") {
      e.preventDefault();
      app.ghostOn = !app.ghostOn;
      cbs.newPhrase();
    } else if (code === "KeyS") {
      e.preventDefault();
      const idx = TIME_SIG_OPTIONS.indexOf(app.timeSig);
      app.timeSig = TIME_SIG_OPTIONS[(idx + 1) % TIME_SIG_OPTIONS.length];
      cbs.newPhrase();
    } else if (code === "KeyL") {
      e.preventDefault();
      const idx = BAR_OPTIONS.indexOf(app.numBars);
      app.numBars = BAR_OPTIONS[(idx + 1) % BAR_OPTIONS.length];
      cbs.newPhrase();
    } else if (code === "KeyM") {
      e.preventDefault();
      app.soundOn = !app.soundOn;
      if (!app.soundOn) stopScheduledAudio();
      cbs.updateMeta();
    } else if (code === "KeyB") {
      e.preventDefault();
      app.showBeatNums = !app.showBeatNums;
      app.dirtyScore = true;
      cbs.updateMeta();
    } else if (code === "KeyG") {
      e.preventDefault();
      app.blindGrade = !app.blindGrade;
      app.dirtyScore = true;
      if (app.state === "PLAY" && app.blindGrade) cbs.setHitBadge(t("badgeBlindPlay"), "");
      cbs.updateMeta();
    } else if (code === "Slash") {
      e.preventDefault();
      cbs.cycleInputMode();
    } else if (code === "BracketLeft") {
      cbs.syncThreshold(Math.round(audioIn.threshold * 100) - 2);
    } else if (code === "BracketRight") {
      cbs.syncThreshold(Math.round(audioIn.threshold * 100) + 2);
    } else if (code === "Comma") {
      cbs.syncLatency(audioIn.latencyMs - 5, true);
    } else if (code === "Period") {
      cbs.syncLatency(audioIn.latencyMs + 5, true);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (cbs.PITCH_KEY_MAP.has(e.code)) {
      const kEl = document.querySelector(`#pitchPiano [data-code="${e.code}"]`);
      if (kEl) kEl.classList.remove("pressed");
    }
    if (app.activeKeyStac && app.activeKeyStac.code === e.code && getAudioCtx()) {
      cbs.closeKeyStaccato((getAudioCtx().currentTime - app.keyLatencyMs / 1000) - app.startAudioT);
    }
  });
}
