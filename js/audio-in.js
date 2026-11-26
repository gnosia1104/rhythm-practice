// Multi-Channel (4-16ch) Discrete Web Audio Input & Sustain/Rest Detection Engine
import { app, audioIn, IS_MOBILE } from "./state.js";
import { t } from "./i18n.js";
import { getAudioCtx, ensureAudioCtx, resetAudioCtxIfIdle, setAudioSessionType } from "./audio-out.js";
import { detectBassPitch, comparePitchClass } from "./pitch-detect.js";

const audioInCbs = {
  handleHit: () => {},
  handlePitchFreeStep: () => {},
  recordCalibrationTap: () => {},
  setHitBadge: () => {},
};

export function registerAudioInCallbacks(cbs) {
  Object.assign(audioInCbs, cbs);
}

const BUILTIN_MIC_RE = /macbook|built-in|internal|내장|iphone|continuity|airpods/i;
const EXT_IFACE_RE = /anagram|darkglass|scarlett|focusrite|usb|audio|interface|steinberg|audient|motu|apollo|universal audio|ssl|zoom|helix|hx |cortex|kemper|fractal|boss|presonus|behringer|roland|yamaha|rme|irig|line 6/i;

export async function populateAudioDevices(activeDeviceId = "") {
  const sel = document.getElementById("audioDeviceSelect");
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { inputs: [], opaqueIds: false };
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const rawInputs = devices.filter(d => d.kind === "audioinput");
    const inputs = rawInputs.filter(d => d.deviceId !== "default" && d.deviceId !== "communications");
    const opaqueIds = rawInputs.length > 0 && rawInputs.every(d => !d.deviceId);
    const prev = activeDeviceId || audioIn.deviceId || sel.value;

    sel.innerHTML = "";
    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = (opaqueIds && audioIn.deviceLabel) ? audioIn.deviceLabel : t("sysDefault");
    sel.appendChild(defOpt);
    if (!opaqueIds) {
      inputs.forEach((d, idx) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || t("audioInputN", idx + 1);
        sel.appendChild(opt);
      });
    }
    if (!opaqueIds && prev && inputs.some(d => d.deviceId === prev)) {
      sel.value = prev;
    } else {
      sel.value = "";
    }
    return { inputs, opaqueIds };
  } catch (_) {
    return { inputs: [], opaqueIds: false };
  }
}

export function findPreferredInterface(inputs) {
  const valid = inputs.filter(d => d.deviceId && d.label);
  return (
    valid.find(d => EXT_IFACE_RE.test(d.label)) ||
    valid.find(d => !BUILTIN_MIC_RE.test(d.label) && !/blackhole|teams|zoomaudio|virtual/i.test(d.label)) ||
    null
  );
}

export function populateChannelSelect(chCount) {
  const sel = document.getElementById("audioChSelect");
  const prev = audioIn.channelMode;
  sel.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "ALL";
  allOpt.textContent = t("allChannels", chCount);
  sel.appendChild(allOpt);
  if (chCount >= 4) {
    for (let i = 0; i + 1 < chCount; i += 2) {
      const pairOpt = document.createElement("option");
      pairOpt.value = `${i}-${i + 1}`;
      pairOpt.textContent = `Ch ${i + 1}-${i + 2}`;
      sel.appendChild(pairOpt);
    }
  }
  for (let i = 0; i < chCount; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Ch ${i + 1}`;
    sel.appendChild(opt);
  }
  const validValues = new Set([...sel.options].map(o => o.value));
  if (validValues.has(prev)) {
    sel.value = prev;
  } else {
    audioIn.channelMode = "ALL";
    sel.value = "ALL";
  }
}

export async function startAudioInput(forceReconnect = false) {
  if (audioIn.active && !forceReconnect) return true;
  stopAudioInput();

  const msgEl = document.getElementById("audioMsg");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msgEl.textContent = t("audioNoApi");
    return false;
  }
  try {
    // Keep AudioContext created & unlocked synchronously inside user gesture on mobile (iOS Safari/Android)
    setAudioSessionType("play-and-record");
    let ctx = ensureAudioCtx();
    if (!IS_MOBILE && forceReconnect) {
      await resetAudioCtxIfIdle();
      ctx = ensureAudioCtx();
    }
    if (ctx.state !== "running") {
      try { await ctx.resume(); } catch (_) {}
    }

    const baseConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (audioIn.deviceId) {
      baseConstraints.deviceId = { exact: audioIn.deviceId };
    }

    // Multi-channel negotiation ladder:
    // 1) Request >=4ch (ideal 16) first so CoreAudio/Chrome opens all 4/6/8/16 channels instead of defaulting to 2ch stereo
    // 2) Fallback to ideal 2ch for 1-2ch interfaces/mics
    // 3) Final safe fallback if deviceId vanished or channelCount constraint was rejected
    let stream = null;
    const attempts = [
      { ...baseConstraints, channelCount: { ideal: 16, min: 4 } },
      { ...baseConstraints, channelCount: { ideal: 2 } },
    ];
    let lastErr = null;
    for (const audioConstraint of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
        break;
      } catch (err) {
        lastErr = err;
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          throw err;
        }
      }
    }
    if (!stream) {
      const fallback = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
      if (audioIn.deviceId && lastErr && lastErr.name !== "OverconstrainedError" && lastErr.name !== "NotFoundError") {
        fallback.deviceId = { ideal: audioIn.deviceId };
      } else if (lastErr && (lastErr.name === "OverconstrainedError" || lastErr.name === "NotFoundError")) {
        audioIn.deviceId = "";
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: fallback });
    }

    // If hardware reports >2 channels (e.g. 4ch/8ch interface) but track opened with fewer, upgrade explicitly
    let track = stream.getAudioTracks()[0];
    let settings = track && track.getSettings ? track.getSettings() : {};
    const caps = track && track.getCapabilities ? track.getCapabilities() : null;
    const capMax = caps && caps.channelCount && Number.isFinite(caps.channelCount.max)
      ? Math.min(16, caps.channelCount.max)
      : 0;
    if (capMax > (settings.channelCount || 1)) {
      try {
        await track.applyConstraints({ channelCount: { exact: capMax } });
        settings = track.getSettings ? track.getSettings() : settings;
      } catch (_) {}
      if ((settings.channelCount || 1) < capMax) {
        try {
          const devId = settings.deviceId || audioIn.deviceId;
          const exactReq = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { exact: capMax },
          };
          if (devId) exactReq.deviceId = { exact: devId };
          const upgraded = await navigator.mediaDevices.getUserMedia({ audio: exactReq });
          for (const oldT of stream.getTracks()) oldT.stop();
          stream = upgraded;
          track = stream.getAudioTracks()[0];
          settings = track && track.getSettings ? track.getSettings() : {};
        } catch (_) {}
      }
    }

    // iOS Safari & Android Chrome often interrupt/suspend AudioContext when getUserMedia switches audio session
    if (ctx.state !== "running") {
      try { await ctx.resume(); } catch (_) {}
    }

    const source = ctx.createMediaStreamSource(stream);
    source.channelInterpretation = "discrete";
    const chCount = Math.max(1, Math.min(16, settings.channelCount || source.channelCount || 1));

    // Split every input channel FIRST with discrete interpretation (prevents 4ch->2ch surround downmix in Web Audio),
    // then apply dedicated mono 35Hz..1200Hz bass bandpass + analyser per channel.
    const splitter = ctx.createChannelSplitter(chCount);
    splitter.channelInterpretation = "discrete";
    const zeroGain = ctx.createGain();
    zeroGain.gain.value = 0;
    zeroGain.connect(ctx.destination);

    source.connect(splitter);
    const filters = [];
    const analysers = [];
    const pitchAnalysers = [];
    for (let c = 0; c < chCount; c++) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 35;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      const pan = ctx.createAnalyser();
      pan.fftSize = 4096;
      splitter.connect(hp, c);
      hp.connect(lp);
      lp.connect(an);
      lp.connect(pan);
      an.connect(zeroGain);
      pan.connect(zeroGain);
      filters.push(hp, lp);
      analysers.push(an);
      pitchAnalysers.push(pan);
    }

    audioIn.stream = stream;
    audioIn.source = source;
    audioIn.filters = filters;
    audioIn.splitter = splitter;
    audioIn.analysers = analysers;
    audioIn.pitchAnalysers = pitchAnalysers;
    audioIn.zeroGain = zeroGain;
    audioIn.buf = new Float32Array(1024);
    audioIn.pitchBuf = new Float32Array(4096);
    audioIn.pendingPitchChecks = [];
    audioIn.channelCount = chCount;
    audioIn.active = true;
    audioIn.prevLevel = 0;
    audioIn.recentLevels = [];
    audioIn.fluxBase = 0;
    audioIn.wasAbove = false;
    audioIn.lastOnset = 0;
    audioIn.lastOnsetLevel = 0;

    audioIn.deviceLabel = track ? (track.label || "Default Input") : "Default Input";
    const actualId = settings.deviceId || audioIn.deviceId || "";

    populateChannelSelect(chCount);
    const { inputs, opaqueIds } = await populateAudioDevices(actualId);

    // If browser grabbed the built-in MacBook mic while an external interface (e.g. Anagram) is available, auto-switch once
    if (!audioIn.userPickedDevice && !opaqueIds && BUILTIN_MIC_RE.test(audioIn.deviceLabel)) {
      const preferred = findPreferredInterface(inputs);
      if (preferred && preferred.deviceId !== actualId) {
        audioIn.deviceId = preferred.deviceId;
        audioIn.userPickedDevice = true;
        return startAudioInput(true);
      }
    }

    const srKhz = (ctx.sampleRate / 1000).toFixed(1).replace(/\.0$/, "");
    const isBuiltin = BUILTIN_MIC_RE.test(audioIn.deviceLabel);
    if (isBuiltin && (opaqueIds || location.protocol === "file:")) {
      msgEl.style.color = "var(--red)";
      msgEl.textContent = t("audioBuiltinFile", audioIn.deviceLabel);
    } else if (isBuiltin) {
      msgEl.style.color = "var(--amber)";
      msgEl.textContent = t("audioBuiltinSelect", audioIn.deviceLabel);
    } else {
      msgEl.style.color = "var(--muted)";
      msgEl.textContent = t("audioConnected", audioIn.deviceLabel, srKhz, chCount);
    }

    audioIn.pollId = window.setInterval(pollAudioInput, 6);
    return true;
  } catch (err) {
    msgEl.textContent = t("audioFail", err.message || err, location.protocol === "file:");
    return false;
  }
}

export function stopAudioInput() {
  if (audioIn.pollId !== null) {
    clearInterval(audioIn.pollId);
    audioIn.pollId = null;
  }
  if (audioIn.source) { try { audioIn.source.disconnect(); } catch (_) {} }
  for (const flt of (audioIn.filters || [])) { try { flt.disconnect(); } catch (_) {} }
  if (audioIn.splitter) { try { audioIn.splitter.disconnect(); } catch (_) {} }
  for (const an of audioIn.analysers) { try { an.disconnect(); } catch (_) {} }
  for (const pan of (audioIn.pitchAnalysers || [])) { try { pan.disconnect(); } catch (_) {} }
  if (audioIn.zeroGain) { try { audioIn.zeroGain.disconnect(); } catch (_) {} }
  if (audioIn.stream) {
    for (const t of audioIn.stream.getTracks()) t.stop();
  }
  audioIn.stream = null;
  audioIn.source = null;
  audioIn.filters = [];
  audioIn.splitter = null;
  audioIn.analysers = [];
  audioIn.pitchAnalysers = [];
  audioIn.pendingPitchChecks = [];
  audioIn.zeroGain = null;
  audioIn.active = false;
  audioIn.level = 0;
  audioIn.rawPeak = 0;
  setAudioSessionType("playback");
  if (getAudioCtx() && getAudioCtx().state !== "running") {
    try { getAudioCtx().resume(); } catch (_) {}
  }
}

export function measureAnalyser(an, buf) {
  an.getFloatTimeDomainData(buf);
  const n = buf.length;
  const split = Math.floor(n * 0.50); // balanced 10.7ms vs 10.7ms halves (avoids 41Hz E1 half-cycle ripple)
  let sqAll = 0, sqHead = 0, sqTail = 0;
  let peak = 0;
  let tailFlux = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i];
    const av = v < 0 ? -v : v;
    if (av > peak) peak = av;
    const v2 = v * v;
    sqAll += v2;
    if (i < split) {
      sqHead += v2;
    } else {
      sqTail += v2;
      tailFlux += Math.abs(v - buf[i - 1]);
    }
  }
  const rms = Math.sqrt(sqAll / n);
  const headRms = Math.sqrt(sqHead / split);
  const tailRms = Math.sqrt(sqTail / (n - split));
  const flux = tailFlux / (n - split);
  // RMS-weighted level ignores single-sample spikes while keeping bass attack crisp
  return { rms, peak, headRms, tailRms, flux, level: rms * 1.2 + peak * 0.25 };
}

export function pollAudioInput() {
  const ctx = getAudioCtx();
  if (!audioIn.active || !audioIn.analysers.length || !ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  let best = null;
  let bestCh = 0;

  let chIndices;
  if (audioIn.channelMode === "ALL") {
    chIndices = audioIn.analysers.map((_, i) => i);
  } else if (String(audioIn.channelMode).includes("-")) {
    const [a, b] = String(audioIn.channelMode).split("-").map(Number);
    chIndices = [a, b].filter(i => Number.isFinite(i) && i >= 0 && i < audioIn.analysers.length);
    if (!chIndices.length) chIndices = [0];
  } else {
    const idx = Math.min(audioIn.analysers.length - 1, Math.max(0, Number(audioIn.channelMode) || 0));
    chIndices = [idx];
  }
  for (const c of chIndices) {
    const m = measureAnalyser(audioIn.analysers[c], audioIn.buf);
    if (!best || m.level > best.level) {
      best = m;
      bestCh = c;
    }
  }

  const level = best.level * audioIn.gain;
  const tailLevel = best.tailRms * 1.4 * audioIn.gain;
  const headLevel = best.headRms * 1.4 * audioIn.gain;
  const fluxScaled = best.flux * audioIn.gain;

  audioIn.level = level;
  audioIn.rawPeak = best.peak;
  audioIn.hotChannel = bestCh;

  if (audioIn.calibrating) {
    if (level > audioIn.calMaxLevel) audioIn.calMaxLevel = level;
    return;
  }

  // Track trailing ~36ms minimum level so legato/consecutive plucks trigger reliably without bass-wave ripple false-triggers
  audioIn.recentLevels.push(level);
  if (audioIn.recentLevels.length > 6) audioIn.recentLevels.shift();
  let minRecent = level;
  for (let i = 0; i < audioIn.recentLevels.length - 1; i++) {
    if (audioIn.recentLevels[i] < minRecent) minRecent = audioIn.recentLevels[i];
  }

  const now = getAudioCtx().currentTime;
  const thr = audioIn.threshold;
  const freshAttack = !audioIn.wasAbove;
  // While already sustaining a bass note, require a genuine macro envelope jump or true pluck transient
  // (prevents 41-110Hz harmonic wave beating during long half/dotted-half notes from firing fake extra hits)
  const legatoJump = (level >= minRecent * 1.60) && (level >= audioIn.prevLevel * 1.15) && (tailLevel >= headLevel * 1.30);
  const pluckTransient = (audioIn.fluxBase > 0) && (fluxScaled >= audioIn.fluxBase * 2.75) && (level >= thr * 1.15) && (level >= minRecent * 1.25);
  const sinceLast = now - audioIn.lastOnset;
  const settleGuardOk = freshAttack || sinceLast >= 0.14 || level >= (audioIn.lastOnsetLevel || 0) * 1.25;
  const rising = (level >= thr) && (freshAttack || (settleGuardOk && (legatoJump || pluckTransient)));

  if (rising && (sinceLast >= audioIn.cooldownSec)) {
    audioIn.lastOnset = now;
    audioIn.lastOnsetLevel = level;
    audioIn.lastTriggerMs = performance.now();
    if (app.state === "CAL") {
      audioInCbs.recordCalibrationTap(now, "AUDIO");
    } else if (app.inputMode === "AUDIO" || app.inputMode === "BOTH") {
      if (app.state === "COUNTIN" || app.state === "PLAY") {
        audioInCbs.handleHit(now - audioIn.latencyMs / 1000, "AUDIO");
      } else if (app.state === "READY") {
        if (app.pitchMode && audioIn.pitchAnalysers[bestCh] && audioIn.pitchBuf) {
          // Schedule a quick +55ms pitch read in READY mode so bassists can verify live pitch detection
          audioIn.pendingPitchChecks.push({ tgt: null, ch: bestCh, checkAt: now + 0.055, isReadyPreview: true });
        } else {
          audioInCbs.setHitBadge(t("badgeDetected", bestCh + 1), "tight");
        }
      }
    }
  }

  // Dual-Track Pitch BETA: process post-onset (+55ms) pitch checks once per attack (zero timing latency impact)
  if (app.pitchMode && audioIn.pendingPitchChecks.length && audioIn.pitchBuf) {
    processPendingPitchChecks(ctx, now);
  }

  if ((app.inputMode === "AUDIO" || app.inputMode === "BOTH") &&
      (app.state === "COUNTIN" || app.state === "PLAY")) {
    const adjT = now - audioIn.latencyMs / 1000;
    updateAudioSustain(adjT, level);
    checkAudioRestViolation(adjT, level);
  }

  audioIn.wasAbove = level >= thr * 0.72;
  audioIn.prevLevel = level;
  audioIn.fluxBase = audioIn.fluxBase === 0
    ? fluxScaled
    : (audioIn.fluxBase * 0.80 + fluxScaled * 0.20);
}

export function schedulePitchCheck(tgt, onsetAudioT) {
  if (!app.pitchMode || !tgt || !tgt.pitch || tgt.art === "ghost") return;
  if (!audioIn.active || !audioIn.pitchAnalysers.length) return;
  const ch = Math.min(audioIn.pitchAnalysers.length - 1, Math.max(0, audioIn.hotChannel || 0));
  // Check 55ms after onset (past pick/finger transient) or earlier if note is very short
  const delaySec = Math.min(0.055, Math.max(0.032, (tgt.durSec || 0.25) * 0.45));
  audioIn.pendingPitchChecks.push({
    tgt,
    ch,
    checkAt: onsetAudioT + delaySec,
    isReadyPreview: false,
  });
}

function processPendingPitchChecks(ctx, now) {
  const remaining = [];
  for (const item of audioIn.pendingPitchChecks) {
    if (now < item.checkAt) {
      remaining.push(item);
      continue;
    }
    const pan = audioIn.pitchAnalysers[item.ch];
    if (!pan) continue;
    pan.getFloatTimeDomainData(audioIn.pitchBuf);
    const det = detectBassPitch(audioIn.pitchBuf, ctx.sampleRate);

    if (item.isReadyPreview) {
      if (det) {
        if (app.pitchMode && app.pitchFreeMode) {
          audioInCbs.handlePitchFreeStep(det.midiFloat, "AUD");
        } else {
          audioInCbs.setHitBadge(`[AUD] Ch${item.ch + 1} · ${det.noteName} (${Math.round(det.freq)}Hz)`, "tight");
        }
      } else {
        audioInCbs.setHitBadge(t("badgeDetected", item.ch + 1), "tight");
      }
      continue;
    }

    const tgt = item.tgt;
    if (!tgt || !tgt.pitch || !tgt.hit) continue;
    if (det) {
      const cmp = comparePitchClass(det.midiFloat, tgt.pitch.midi, 45);
      tgt.pitchOk = cmp.ok;
      tgt.detectedPitch = cmp.detectedName;
      tgt.pitchCents = cmp.cents;
      if (!app.blindGrade) {
        if (!cmp.ok) {
          audioInCbs.setHitBadge(`[AUD] ${tgt.pitch.name} ≠ ${cmp.detectedName}`, "err");
        }
        app.dirtyScore = true;
      }
    }
  }
  audioIn.pendingPitchChecks = remaining;
}

export function markRestsInRange(startSec, endSec, kind) {
  let changed = false;
  for (const rst of (app.phrase.rests || [])) {
    if (endSec > rst.timeSec + 0.01 && startSec < rst.endSec - 0.01) {
      if (!rst.error || (kind === "HIT" && rst.errorKind !== "HIT")) {
        rst.error = true;
        rst.passed = false;
        rst.errorKind = kind;
        changed = true;
      }
    }
  }
  if (changed) app.dirtyScore = true;
  return changed;
}

export function checkAudioRestViolation(hitAudioT, level) {
  if (app.state !== "PLAY") return;
  const elapsed = hitAudioT - app.startAudioT;
  const rests = app.phrase.rests || [];
  const restNoiseThr = Math.max(audioIn.threshold * 0.70, 0.02);
  for (const rst of rests) {
    if (rst.error) continue;
    // Forward-only check inside the rest [timeSec + brief release grace, endSec]
    const restDur = rst.endSec - rst.timeSec;
    if (restDur < 0.14) continue;
    const graceStart = rst.timeSec + Math.min(0.10, restDur * 0.30);
    if (elapsed >= graceStart && elapsed <= rst.endSec) {
      if (level >= restNoiseThr) {
        rst.ringFrames += 1;
        if (rst.ringFrames >= 5) {
          rst.error = true;
          rst.passed = false;
          rst.errorKind = "RING";
          if (!app.blindGrade) {
            audioInCbs.setHitBadge("[AUD] REST ERR !", "err");
            app.dirtyScore = true;
          }
        }
      } else {
        rst.ringFrames = 0;
      }
    }
  }
}

export function closeSustainTarget(tgt, endSec, stillRingingAtEnd) {
  if (!tgt || tgt.sustainDone) return;
  const heldSec = Math.max(0, endSec - tgt.hitTimeSec);
  const expectedSec = tgt.durSec;
  const ratio = expectedSec > 0 ? heldSec / expectedSec : 1;
  tgt.sustainEndSec = endSec;
  tgt.sustainRatio = ratio;

  const restDurSec = Math.max(0, tgt.restEndSec - tgt.endSec);
  const muteGraceSec = Math.min(0.16, Math.max(0.095, restDurSec * 0.35));
  const checkHold = expectedSec >= 0.30;
  const checkBleed = tgt.hasRestAfter && restDurSec >= 0.18;

  if (tgt.art === "ghost") {
    // Percussive bass dead-note: must die out rapidly instead of ringing like an open/fretted note
    const maxGhostSec = Math.min(0.17, Math.max(0.115, expectedSec * 0.65));
    tgt.ghostHeldMs = Math.round(heldSec * 1000);
    if (!stillRingingAtEnd && heldSec <= maxGhostSec) {
      tgt.sustainStatus = "OK";
    } else {
      tgt.sustainStatus = "LONG";
    }
  } else if (tgt.art === "staccato") {
    // Musical staccato: sustain ~half written duration (target 50%: OK 25%..58%, SHORT <25% on long notes, LONG >58%)
    const stacBleed = checkBleed && (tgt.bleedMs > muteGraceSec * 1000 || (stillRingingAtEnd && (endSec - tgt.endSec) > muteGraceSec));
    if (stacBleed || stillRingingAtEnd || (ratio > 0.58 && heldSec > 0.14)) {
      tgt.sustainStatus = "LONG";
      if (stacBleed) {
        tgt.bleedMs = Math.max(tgt.bleedMs, (endSec - tgt.endSec) * 1000);
        markRestsInRange(tgt.endSec, Math.max(endSec, tgt.endSec + tgt.bleedMs / 1000), "RING");
      }
    } else if (expectedSec >= 0.50 && ratio < 0.25) {
      tgt.sustainStatus = "SHORT";
    } else {
      tgt.sustainStatus = "OK";
    }
  } else if (checkBleed && (tgt.bleedMs > muteGraceSec * 1000 || (stillRingingAtEnd && (endSec - tgt.endSec) > muteGraceSec))) {
    tgt.sustainStatus = "LONG";
    tgt.bleedMs = Math.max(tgt.bleedMs, (endSec - tgt.endSec) * 1000);
    markRestsInRange(tgt.endSec, Math.max(endSec, tgt.endSec + tgt.bleedMs / 1000), "RING");
  } else if (checkHold && ratio < 0.62) {
    tgt.sustainStatus = "SHORT";
  } else if (checkHold || checkBleed) {
    tgt.sustainStatus = "OK";
  }

  tgt.sustainDone = true;
  if (app.activeSustainTgt === tgt) app.activeSustainTgt = null;
  app.dirtyScore = true;
}

export function updateAudioSustain(hitAudioT, level) {
  const tgt = app.activeSustainTgt;
  if (!tgt || tgt.sustainDone) return;
  const elapsed = hitAudioT - app.startAudioT;
  if (elapsed < tgt.hitTimeSec + 0.025) return;

  // Capture attack peak during first 45ms so ghost-note percussive decay can be judged relative to peak
  if (elapsed <= tgt.hitTimeSec + 0.045) {
    tgt.peakLevel = Math.max(tgt.peakLevel || 0, level);
  }

  const restDurSec = Math.max(0, tgt.restEndSec - tgt.endSec);
  const monitorEndSec = tgt.art === "ghost"
    ? Math.min(tgt.endSec + 0.06, tgt.hitTimeSec + 0.24)
    : (tgt.hasRestAfter
      ? Math.min(tgt.restEndSec - 0.02, tgt.endSec + Math.min(0.32, Math.max(0.18, restDurSec * 0.8)))
      : tgt.endSec + 0.04);

  const floor = tgt.art === "ghost"
    ? Math.max((tgt.peakLevel || 0) * 0.34, tgt.sustainFloor * 1.15)
    : tgt.sustainFloor;
  const neededQuiet = tgt.art === "ghost" ? 5 : (tgt.art === "staccato" ? 6 : 7);
  const minCheckSec = tgt.art === "ghost" ? 0.045 : 0.06;

  if (level >= floor) {
    tgt.quietFrames = 0;
    tgt.lastAudibleSec = elapsed;
    if (tgt.hasRestAfter && elapsed > tgt.endSec && level >= tgt.sustainFloor * 1.15) {
      tgt.bleedMs = Math.max(tgt.bleedMs, (elapsed - tgt.endSec) * 1000);
    }
    if (elapsed >= monitorEndSec) {
      closeSustainTarget(tgt, elapsed, true);
    }
  } else {
    tgt.quietFrames += 1;
    if (tgt.quietFrames >= neededQuiet && elapsed >= tgt.hitTimeSec + minCheckSec) {
      const endT = tgt.lastAudibleSec ?? Math.max(tgt.hitTimeSec, elapsed - neededQuiet * 0.006);
      closeSustainTarget(tgt, endT, false);
    } else if (elapsed >= monitorEndSec) {
      const endT = tgt.lastAudibleSec ?? elapsed;
      closeSustainTarget(tgt, endT, false);
    }
  }
}

