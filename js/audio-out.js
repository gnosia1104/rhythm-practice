// Web Audio Output Engine (Hardware-Clock Metronome & Bass Synth)
import { TIME_SIGS } from "./rhythm.js";
import { app, audioIn, IS_MOBILE, isGapBar } from "./state.js";

let audioCtx = null;
let audioUnlocked = false;
let scheduledNodes = [];
const audioStateListeners = new Set();

export function isAudioCtxRunning() {
  return Boolean(audioCtx && audioCtx.state === "running");
}

export function onAudioStateChange(fn) {
  if (typeof fn === "function") audioStateListeners.add(fn);
}

function notifyAudioStateChange() {
  for (const fn of audioStateListeners) {
    try { fn(isAudioCtxRunning()); } catch (_) {}
  }
}

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
    audioCtx.onstatechange = () => {
      if (audioCtx && audioCtx.state === "running") audioUnlocked = true;
      notifyAudioStateChange();
    };
  }
  if (audioCtx.state !== "running") {
    try {
      const p = audioCtx.resume();
      if (p && typeof p.then === "function") {
        p.then(() => {
          if (audioCtx && audioCtx.state === "running") audioUnlocked = true;
          notifyAudioStateChange();
        }).catch(() => {});
      }
    } catch (_) {}
  }
  if (!audioUnlocked) {
    try {
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
      if (audioCtx.state === "running") audioUnlocked = true;
    } catch (_) {}
  }
  notifyAudioStateChange();
  return audioCtx;
}

export async function ensureAudioCtxReady() {
  const ctx = ensureAudioCtx();
  if (ctx.state === "running" && ctx.currentTime > 0.05) {
    return ctx;
  }
  if (ctx.state !== "running") {
    try {
      await Promise.race([
        ctx.resume().catch(() => {}),
        new Promise(r => window.setTimeout(r, 350)),
      ]);
    } catch (_) {}
    notifyAudioStateChange();
  }
  // If still suspended (e.g. WebSocket-triggered start before any user gesture), return immediately instead of stalling
  if (ctx.state !== "running") {
    return ctx;
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

  const isTreble = freq > 190;
  filter.type = "lowpass";
  if (isTreble) {
    filter.frequency.setValueAtTime(Math.min(4800, freq * 5.2), when);
    filter.frequency.exponentialRampToValueAtTime(Math.min(2200, freq * 2.0), when + Math.min(0.28, playDur));
  } else {
    filter.frequency.setValueAtTime(900, when);
    filter.frequency.exponentialRampToValueAtTime(240, when + Math.min(0.28, playDur));
  }

  const g2 = ctx.createGain();
  g2.gain.value = isTreble ? 0.16 : 0.32;

  const peakGain = isTreble ? 0.30 : 0.45;
  const susGain = isTreble ? 0.16 : 0.24;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peakGain, when + 0.007);
  gain.gain.exponentialRampToValueAtTime(susGain, when + Math.min(0.18, playDur * 0.7));
  gain.gain.setValueAtTime(susGain, Math.max(when + 0.02, when + playDur - 0.025));
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

let drumNoiseBuf = null;
function getDrumNoiseBuf(ctx) {
  if (!drumNoiseBuf || drumNoiseBuf.sampleRate !== ctx.sampleRate) {
    const len = Math.floor(ctx.sampleRate * 0.16);
    drumNoiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = drumNoiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return drumNoiseBuf;
}

function scheduleDrumKick(ctx, when, amp = 0.42) {
  const outNode = getClickMasterGain(ctx);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, when);
  osc.frequency.exponentialRampToValueAtTime(44, when + 0.085);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(amp, when + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
  osc.connect(gain).connect(outNode);
  osc.start(when);
  osc.stop(when + 0.14);
  scheduledNodes.push(osc, gain);
}

function scheduleDrumSnare(ctx, when, amp = 0.28) {
  const outNode = getClickMasterGain(ctx);
  const noise = ctx.createBufferSource();
  noise.buffer = getDrumNoiseBuf(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "bandpass";
  hp.frequency.setValueAtTime(1850, when);
  hp.Q.value = 0.85;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, when);
  ng.gain.linearRampToValueAtTime(amp, when + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
  noise.connect(hp).connect(ng).connect(outNode);
  noise.start(when);
  noise.stop(when + 0.12);

  const body = ctx.createOscillator();
  const bg = ctx.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(210, when);
  body.frequency.exponentialRampToValueAtTime(115, when + 0.055);
  bg.gain.setValueAtTime(0.0001, when);
  bg.gain.linearRampToValueAtTime(amp * 0.72, when + 0.002);
  bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.065);
  body.connect(bg).connect(outNode);
  body.start(when);
  body.stop(when + 0.07);
  scheduledNodes.push(noise, hp, ng, body, bg);
}

function scheduleDrumHat(ctx, when, amp = 0.11) {
  const outNode = getClickMasterGain(ctx);
  const noise = ctx.createBufferSource();
  noise.buffer = getDrumNoiseBuf(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(6800, when);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, when);
  ng.gain.linearRampToValueAtTime(amp, when + 0.0015);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.032);
  noise.connect(hp).connect(ng).connect(outNode);
  noise.start(when);
  noise.stop(when + 0.036);
  scheduledNodes.push(noise, hp, ng);
}

export function scheduleBarGroove(ctx, barStartSec, timeSigKey, clickSec, useDrum = Boolean(app && app.drumBacking)) {
  const ts = TIME_SIGS[timeSigKey] || TIME_SIGS["4/4"];
  if (!useDrum) {
    for (let c = 0; c < ts.clicksPerBar; c++) {
      const isDownbeat = c === 0;
      const isSubAcc = !isDownbeat && ts.subAcc.includes(c);
      const freq = isDownbeat ? 1318.51 : (isSubAcc ? 1046.50 : 880.0);
      const amp = isDownbeat ? 0.32 : (isSubAcc ? 0.25 : 0.20);
      scheduleClick(ctx, barStartSec + c * clickSec, freq, amp);
    }
    return;
  }

  // Drum backing groove tailored to each time signature (routed through clickMasterGain!)
  if (timeSigKey === "6/8") {
    for (let c = 0; c < 6; c++) {
      const w = barStartSec + c * clickSec;
      scheduleDrumHat(ctx, w, (c === 0 || c === 3) ? 0.14 : 0.08);
      if (c === 0) scheduleDrumKick(ctx, w, 0.44);
      if (c === 3) scheduleDrumSnare(ctx, w, 0.28);
    }
    return;
  }

  const kicks = timeSigKey === "4/4" ? [0, 2]
    : (timeSigKey === "5/4" ? [0, 3] : [0]);
  const snares = timeSigKey === "4/4" ? [1, 3]
    : (timeSigKey === "5/4" ? [2, 4] : (timeSigKey === "3/4" ? [2] : [1]));

  for (let c = 0; c < ts.clicksPerBar; c++) {
    const w = barStartSec + c * clickSec;
    const isDown = c === 0;
    scheduleDrumHat(ctx, w, isDown ? 0.14 : 0.10);
    scheduleDrumHat(ctx, w + clickSec * 0.5, 0.065);
    if (kicks.includes(c)) scheduleDrumKick(ctx, w, isDown ? 0.45 : 0.38);
    if (snares.includes(c)) scheduleDrumSnare(ctx, w, 0.27);
  }
}

export function playKeyHitSfx(kind = "tight") {
  const ctx = ensureAudioCtx();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime + 0.002;
  const volScale = Math.max(0.25, Math.min(1.5, ((app && app.clickVol) || 100) / 100));

  if (kind === "err") {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(92, now + 0.055);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.14 * volScale, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
    return;
  }

  if (kind === "ghost") {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.032);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.18 * volScale, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
    return;
  }

  // Crisp woodblock/rim tap for TIGHT / OK hits (distinct timbre from metronome sine click)
  const baseFreq = kind === "tight" ? 760 : 580;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.62, now + 0.032);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime((kind === "tight" ? 0.22 : 0.16) * volScale, now + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.042);
}

export function playRankFanfare(grade) {
  const ctx = ensureAudioCtx();
  if (!ctx || ctx.state !== "running" || (app && app.clickVol <= 0)) return;
  const notes = grade === "S+"
    ? [523.25, 659.25, 783.99, 987.77, 1174.66] // Cmaj9 sparkle
    : (grade === "S" ? [523.25, 659.25, 783.99, 1046.50] : []);
  if (!notes.length) return;
  const t0 = ctx.currentTime + 0.04;
  notes.forEach((freq, i) => {
    const when = t0 + i * 0.068;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.14, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (i === notes.length - 1 ? 0.42 : 0.18));
    osc.connect(g).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + (i === notes.length - 1 ? 0.45 : 0.20));
  });
}

export function scheduleRunAudio(bpm, numBars, startAudioT, playMetronome, demoTargets = null, timeSigKey = "4/4", gapClickMode = "OFF") {
  stopScheduledAudio();
  const ctx = ensureAudioCtx();
  const ts = TIME_SIGS[timeSigKey] || TIME_SIGS["4/4"];
  const safeBars = Math.max(1, Number(numBars) || (app && app.phrase && app.phrase.bars ? app.phrase.bars.length : 0) || (app && app.numBars) || 4);
  const clickSec = ts.clickSec(bpm);
  const tickSec = clickSec / ts.clickTicks;
  const countInSec = ts.countInClicks * clickSec;

  // Always schedule crisp count-in clicks so the player locks into the tempo immediately
  for (let c = 0; c < ts.countInClicks; c++) {
    const isDownbeat = c === 0;
    const isSubAcc = !isDownbeat && ts.subAcc.includes(c);
    const freq = isDownbeat ? 1318.51 : (isSubAcc ? 1046.50 : 880.0);
    const amp = isDownbeat ? 0.32 : (isSubAcc ? 0.25 : 0.20);
    scheduleClick(ctx, startAudioT + c * clickSec, freq, amp);
  }

  // Schedule play-bar metronome clicks OR drum backing groove
  if (playMetronome || demoTargets) {
    const useDrum = Boolean(!demoTargets && app && app.drumBacking);
    for (let b = 0; b < safeBars; b++) {
      if (!demoTargets && isGapBar(b, gapClickMode)) continue;
      const barStart = startAudioT + countInSec + b * ts.clicksPerBar * clickSec;
      scheduleBarGroove(ctx, barStart, timeSigKey, clickSec, useDrum);
    }
  }
  if (demoTargets) {
    for (const tgt of demoTargets) {
      const when = startAudioT + countInSec + tgt.globalSlot * tickSec;
      const durSec = tgt.durSlots * tickSec;
      if (tgt.art === "ghost") {
        scheduleGhostNote(ctx, when);
      } else {
        const demoFreq = (tgt.pitch && Number.isFinite(tgt.pitch.freq)) ? tgt.pitch.freq : 73.42;
        if (tgt.art === "staccato") {
          // Musical staccato: sustain half of the written note value (50%), then cut cleanly
          scheduleBassNote(ctx, when, Math.max(0.08, durSec * 0.50), demoFreq);
        } else {
          // Middle line of bass clef = D (sounding D2 = 73.42Hz), or real bass pitch in Pitch BETA
          scheduleBassNote(ctx, when, durSec, demoFreq);
        }
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

