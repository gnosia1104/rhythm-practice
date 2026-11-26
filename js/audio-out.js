// Web Audio Output Engine (Hardware-Clock Metronome & Bass Synth)
import { TIME_SIGS } from "./rhythm.js";
import { app, audioIn, IS_MOBILE, isGapBar } from "./state.js";

let audioCtx = null;
let audioUnlocked = false;
let scheduledNodes = [];

export function setAudioSessionType(mode) {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== mode) {
      navigator.audioSession.type = mode;
    }
  } catch (_) {}
}

export function ensureAudioCtx() {
  setAudioSessionType(audioIn && audioIn.active ? "play-and-record" : "playback");
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state !== "running") {
    try { audioCtx.resume(); } catch (_) {}
  }
  if (!audioUnlocked) {
    try {
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
      audioUnlocked = true;
    } catch (_) {}
  }
  return audioCtx;
}

export async function ensureAudioCtxReady() {
  const ctx = ensureAudioCtx();
  if (ctx.state === "running" && ctx.currentTime > 0.05) {
    return ctx;
  }
  if (ctx.state !== "running") {
    try { await ctx.resume(); } catch (_) {}
  }
  // Wait until AudioContext hardware clock is genuinely ticking (prevents cold-start 1st-beat drift)
  const t0 = ctx.currentTime;
  const wallStart = performance.now();
  while (ctx.currentTime <= t0 + 0.012 && (performance.now() - wallStart) < 420) {
    await new Promise(r => window.setTimeout(r, 16));
  }
  return ctx;
}

export function stopScheduledAudio() {
  for (const node of scheduledNodes) {
    try { node.stop(); } catch (_) {}
    try { node.disconnect(); } catch (_) {}
  }
  scheduledNodes = [];
}

let clickMasterGain = null;

export function getClickMasterGain(ctx) {
  if (!clickMasterGain || clickMasterGain.context !== ctx) {
    clickMasterGain = ctx.createGain();
    clickMasterGain.gain.value = (typeof app !== "undefined" ? app.clickVol : 100) / 100;
    clickMasterGain.connect(ctx.destination);
  }
  return clickMasterGain;
}

export function scheduleClick(ctx, when, freq, amp) {
  // Compensate for iOS/Android PlayAndRecord volume ducking while mic is open
  const effAmp = (IS_MOBILE && audioIn && audioIn.active) ? Math.min(0.85, amp * 2.1) : amp;
  const outNode = getClickMasterGain(ctx);
  // Stable-pitch metronome click (no downward pitch sweep)
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(effAmp, when + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.028);
  osc.connect(gain).connect(outNode);
  osc.start(when);
  osc.stop(when + 0.032);

  // Subtle octave-up attack transient for crisp rhythmic definition
  const hiOsc = ctx.createOscillator();
  const hiGain = ctx.createGain();
  hiOsc.type = "sine";
  hiOsc.frequency.setValueAtTime(freq * 2, when);
  hiGain.gain.setValueAtTime(0.0001, when);
  hiGain.gain.linearRampToValueAtTime(effAmp * 0.25, when + 0.001);
  hiGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.008);
  hiOsc.connect(hiGain).connect(outNode);
  hiOsc.start(when);
  hiOsc.stop(when + 0.010);

  scheduledNodes.push(osc, gain, hiOsc, hiGain);
}

export function scheduleBassNote(ctx, when, durSec, freq) {
  const playDur = Math.max(0.09, durSec * 0.90);
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(freq, when);
  osc2.type = "sawtooth";
  osc2.frequency.setValueAtTime(freq, when);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, when);
  filter.frequency.exponentialRampToValueAtTime(240, when + Math.min(0.28, playDur));

  const g2 = ctx.createGain();
  g2.gain.value = 0.32;

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(0.45, when + 0.007);
  gain.gain.exponentialRampToValueAtTime(0.24, when + Math.min(0.18, playDur * 0.7));
  gain.gain.setValueAtTime(0.24, Math.max(when + 0.02, when + playDur - 0.025));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + playDur);

  osc1.connect(filter);
  osc2.connect(g2).connect(filter);
  filter.connect(gain).connect(ctx.destination);

  osc1.start(when);
  osc2.start(when);
  osc1.stop(when + playDur + 0.01);
  osc2.stop(when + playDur + 0.01);
  scheduledNodes.push(osc1, osc2, g2, filter, gain);
}

let ghostNoiseBuf = null;
export function scheduleGhostNote(ctx, when) {
  // Realistic percussive muted bass dead-note: short dampened thump + fret clack noise
  if (!ghostNoiseBuf || ghostNoiseBuf.sampleRate !== ctx.sampleRate) {
    const len = Math.floor(ctx.sampleRate * 0.05);
    ghostNoiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = ghostNoiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.28));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = ghostNoiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(420, when);
  bp.Q.value = 1.6;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, when);
  ng.gain.linearRampToValueAtTime(0.32, when + 0.003);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.038);
  noise.connect(bp).connect(ng).connect(ctx.destination);
  noise.start(when);
  noise.stop(when + 0.042);

  const thump = ctx.createOscillator();
  const tg = ctx.createGain();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(118, when);
  thump.frequency.exponentialRampToValueAtTime(52, when + 0.04);
  tg.gain.setValueAtTime(0.0001, when);
  tg.gain.linearRampToValueAtTime(0.34, when + 0.004);
  tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.044);
  thump.connect(tg).connect(ctx.destination);
  thump.start(when);
  thump.stop(when + 0.048);

  scheduledNodes.push(noise, bp, ng, thump, tg);
}


export function getAudioCtx() {
  return audioCtx;
}

export function setClickMasterGainVol(volPct) {
  if (audioCtx && clickMasterGain && clickMasterGain.context === audioCtx) {
    clickMasterGain.gain.setTargetAtTime(volPct / 100, audioCtx.currentTime, 0.015);
  }
}

export function scheduleRunAudio(bpm, numBars, startAudioT, playMetronome, demoTargets = null, timeSigKey = "4/4", gapClickMode = "OFF") {
  stopScheduledAudio();
  const ctx = ensureAudioCtx();
  const ts = TIME_SIGS[timeSigKey] || TIME_SIGS["4/4"];
  const clickSec = ts.clickSec(bpm);
  const tickSec = clickSec / ts.clickTicks;
  const countInSec = ts.countInClicks * clickSec;

  // Always play count-in clicks so the player gets the tempo; play bar clicks only when metronome is ON (or demo)
  const clicksToSchedule = (playMetronome || demoTargets)
    ? (ts.countInClicks + numBars * ts.clicksPerBar)
    : ts.countInClicks;
  for (let c = 0; c < clicksToSchedule; c++) {
    if (!demoTargets && c >= ts.countInClicks) {
      const playBar = Math.floor((c - ts.countInClicks) / ts.clicksPerBar);
      if (isGapBar(playBar, gapClickMode)) continue;
    }
    const pos = c < ts.countInClicks ? c : (c - ts.countInClicks) % ts.clicksPerBar;
    const isDownbeat = pos === 0;
    const isSubAcc = !isDownbeat && ts.subAcc.includes(pos);
    const freq = isDownbeat ? 1318.51 : (isSubAcc ? 1046.50 : 880.0);
    const amp = isDownbeat ? 0.32 : (isSubAcc ? 0.25 : 0.20);
    scheduleClick(ctx, startAudioT + c * clickSec, freq, amp);
  }
  if (demoTargets) {
    for (const tgt of demoTargets) {
      const when = startAudioT + countInSec + tgt.globalSlot * tickSec;
      const durSec = tgt.durSlots * tickSec;
      if (tgt.art === "ghost") {
        scheduleGhostNote(ctx, when);
      } else if (tgt.art === "staccato") {
        // Musical staccato: sustain half of the written note value (50%), then cut cleanly
        scheduleBassNote(ctx, when, Math.max(0.08, durSec * 0.50), 73.42);
      } else {
        // All notes on the middle line of bass clef = D (sounding D2 = 73.42Hz on bass guitar)
        scheduleBassNote(ctx, when, durSec, 73.42);
      }
    }
  }
}


export async function resetAudioCtxIfIdle() {
  if (app.state === "COUNTIN" || app.state === "PLAY" || app.state === "DEMO") return;
  stopScheduledAudio();
  if (audioCtx) {
    try { await audioCtx.close(); } catch (_) {}
    audioCtx = null;
    audioUnlocked = false;
  }
}

