// Privacy-friendly cookieless analytics wrapper (Umami Cloud)
// Fires strictly anonymous aggregate practice events; no PII, no cookies.

let sessionCompletedTakes = 0;

export function trackEvent(name, data) {
  try {
    if (typeof window !== "undefined" && window.umami && typeof window.umami.track === "function") {
      if (data && typeof data === "object") {
        window.umami.track(name, data);
      } else {
        window.umami.track(name);
      }
    }
  } catch (_) {}
}

export function getPracticeModeTag(st) {
  if (st.dailyDate) return st.dailyPlus ? "daily+" : "daily";
  if (st.customMode) return "custom";
  if (st.rushOn) return "rush";
  if (st.gapClick && st.gapClick !== "OFF") return "gap";
  if (st.fadeBeats > 0) return "fade";
  return "free";
}

export function trackPracticeStart(st, isDemo = false) {
  if (isDemo) {
    trackEvent("demo_play", { level: st.level, bpm: st.bpm, meter: st.timeSig });
    return;
  }
  trackEvent("practice_start", {
    level: st.level,
    meter: st.timeSig,
    bars: st.numBars,
    bpm: st.bpm,
    input: st.inputMode,
    mode: getPracticeModeTag(st),
  });
}

export function trackPracticeComplete(st, { rank, acc, durationSec }) {
  sessionCompletedTakes += 1;
  trackEvent("practice_complete", {
    level: st.level,
    meter: st.timeSig,
    bars: st.numBars,
    bpm: st.bpm,
    input: st.inputMode,
    mode: getPracticeModeTag(st),
    rank,
    acc: Math.round(acc),
    duration_sec: Math.max(1, Math.round(durationSec)),
    take_num: sessionCompletedTakes,
  });
}

export function trackPracticeStop(st, elapsedSec) {
  trackEvent("practice_stop", {
    level: st.level,
    input: st.inputMode,
    mode: getPracticeModeTag(st),
    elapsed_sec: Math.max(0, Math.round(elapsedSec)),
  });
}

export function trackShare(type, st) {
  trackEvent("share_click", {
    type,
    mode: getPracticeModeTag(st),
  });
}
