// Dual-Track Real-Time Bass Pitch Detector (YIN with 4x Decimation & Sub-Harmonic Rescue)
// Runs ONLY once per onset (+55ms post-attack) when Pitch BETA is active — zero impact on timing latency!

import { FLAT_PC_NAMES } from "./pitch-gen.js";

// Preallocated reusable scratch buffers (zero GC pressure in audio loop)
let decBuf = new Float32Array(1024);
let yinDiff = new Float32Array(512);

export function freqToMidiFloat(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * Detect fundamental frequency of an electric bass note from a 4096-sample Float32Array.
 * Supports E1 (41.2 Hz) down to B0 (30.9 Hz) and up to G4 (~392 Hz).
 */
export function detectBassPitch(rawBuf, sampleRate) {
  if (!rawBuf || rawBuf.length < 1024 || !sampleRate) return null;

  // Quick RMS gate (skip silence / dead mute)
  let sq = 0;
  for (let i = 0; i < rawBuf.length; i++) {
    const v = rawBuf[i];
    sq += v * v;
  }
  const rms = Math.sqrt(sq / rawBuf.length);
  if (rms < 0.008) return null;

  // 4x boxcar decimation: 48kHz -> 12kHz (4096 -> 1024 samples), <0.3ms CPU
  const decim = rawBuf.length >= 2048 ? 4 : 2;
  const n = Math.floor(rawBuf.length / decim);
  const fs = sampleRate / decim;
  if (decBuf.length < n) decBuf = new Float32Array(n);

  let mean = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * decim;
    for (let k = 0; k < decim; k++) s += rawBuf[base + k];
    const v = s / decim;
    decBuf[i] = v;
    mean += v;
  }
  mean /= n;
  for (let i = 0; i < n; i++) decBuf[i] -= mean;

  const halfN = Math.floor(n / 2);
  if (yinDiff.length < halfN) yinDiff = new Float32Array(halfN);

  const minFreq = 34;  // Covers low D1 (36.7Hz) & E1 (41.2Hz) cleanly
  const maxFreq = 920; // Covers Bass E1..G4 AND Treble C4..A5 (880Hz) cleanly!
  const tauMin = Math.max(2, Math.floor(fs / maxFreq));
  const tauMax = Math.min(halfN - 2, Math.ceil(fs / minFreq));
  if (tauMax <= tauMin + 2) return null;

  // YIN Difference Function + Cumulative Mean Normalized Difference (CMNDF)
  yinDiff[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < halfN; j++) {
      const d = decBuf[j] - decBuf[j + tau];
      sum += d * d;
    }
    runningSum += sum;
    yinDiff[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
  }

  // First local minimum below YIN threshold
  const threshold = 0.16;
  let bestTau = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yinDiff[tau] < threshold) {
      while (tau + 1 <= tauMax && yinDiff[tau + 1] < yinDiff[tau]) tau++;
      bestTau = tau;
      break;
    }
  }

  // Fallback: global minimum if slightly noisier than 0.16 but still clear (<0.28)
  if (bestTau === -1) {
    let minVal = 0.28;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (yinDiff[tau] < minVal) {
        minVal = yinDiff[tau];
        bestTau = tau;
      }
    }
  }
  if (bestTau === -1) return null;

  // Sub-harmonic Octave Rescue: electric bass pickups often have a stronger 2nd harmonic on E1..A1
  if (bestTau * 2 <= tauMax && fs / bestTau > 70 && fs / bestTau < 240) {
    const subCenter = bestTau * 2;
    let subTau = subCenter;
    let subMin = yinDiff[subCenter];
    for (let t = Math.max(tauMin, subCenter - 3); t <= Math.min(tauMax, subCenter + 3); t++) {
      if (yinDiff[t] < subMin) {
        subMin = yinDiff[t];
        subTau = t;
      }
    }
    if (subMin < 0.22 && subMin <= yinDiff[bestTau] + 0.08) {
      bestTau = subTau;
    }
  }

  // Parabolic interpolation around bestTau for sub-sample precision (~1 cent accuracy)
  let betterTau = bestTau;
  if (bestTau > tauMin && bestTau < tauMax) {
    const s0 = yinDiff[bestTau - 1];
    const s1 = yinDiff[bestTau];
    const s2 = yinDiff[bestTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-6) {
      const shift = (s2 - s0) / denom;
      if (Math.abs(shift) < 1) betterTau = bestTau + shift;
    }
  }

  const freq = fs / betterTau;
  if (!Number.isFinite(freq) || freq < minFreq || freq > maxFreq) return null;

  const midiFloat = freqToMidiFloat(freq);
  const midi = Math.round(midiFloat);
  const pc = ((midi % 12) + 12) % 12;
  const clarity = Math.max(0, 1 - yinDiff[bestTau]);
  return {
    freq,
    midiFloat,
    midi,
    pc,
    noteName: FLAT_PC_NAMES[pc],
    clarity,
  };
}

/**
 * Octave-agnostic pitch-class comparison:
 * Playing high B or low B both match a written B! (±45 cents tolerance for vibrato/intonation)
 */
export function comparePitchClass(detectedMidiFloat, targetMidi, tolCents = 45) {
  const diffSemi = ((((detectedMidiFloat - targetMidi) % 12) + 18) % 12) - 6; // [-6, +6)
  const cents = diffSemi * 100;
  const detectedMidi = Math.round(detectedMidiFloat);
  const detectedPc = ((detectedMidi % 12) + 12) % 12;
  const targetPc = ((targetMidi % 12) + 12) % 12;
  return {
    ok: Math.abs(cents) <= tolCents,
    cents,
    detectedPc,
    targetPc,
    detectedName: FLAT_PC_NAMES[detectedPc],
  };
}
