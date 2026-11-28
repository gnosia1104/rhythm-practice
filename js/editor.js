// Custom Rhythm Score Editor & Serverless Seed/URL Loader
import { TIME_SIGS, BAR_OPTIONS, encodeCustomScore, decodeCustomScore, decodeFullSeedCode, buildPhraseFromBars } from "./rhythm.js";
import { app, edState, getTimeSig, currentFullSeedCode } from "./state.js";
import { t } from "./i18n.js";
import { SVG_NS, el, drawRest, drawNotehead, drawTuplet, drawFlag } from "./engraver.js";
import { stopScheduledAudio } from "./audio-out.js";
import { stopCalibration } from "./calibration.js";
import { buildShareUrl, copyToClipboard, flashBtnText } from "./share-card.js";

const edCbs = {
  stopRun: () => {},
  resetTargets: () => {},
  updateMeta: () => {},
  setHitBadge: () => {},
  loadDailyChallenge: () => {},
  newPhrase: () => {},
  syncPitchUi: () => {},
  playDemo: () => {},
  startPlay: () => {},
  applyPitchIfNeeded: () => {},
};

const MAX_ED_UNDO = 30;

export function pushEdUndo() {
  if (!edState.bars || !edState.bars.length) return;
  edState.undoStack.push({
    timeSig: edState.timeSig,
    bars: cloneBars(edState.bars),
    selBar: edState.selBar,
    selBeat: edState.selBeat,
  });
  if (edState.undoStack.length > MAX_ED_UNDO) {
    edState.undoStack.shift();
  }
}

export function undoEditor() {
  if (!edState.undoStack.length) return false;
  const snap = edState.undoStack.pop();
  edState.timeSig = snap.timeSig;
  edState.bars = cloneBars(snap.bars);
  edState.selBar = snap.selBar;
  edState.selBeat = snap.selBeat;
  applyCustomToApp();
  renderEditorUi();
  const msgEl = document.getElementById("edMsg");
  if (msgEl) {
    msgEl.style.color = "var(--muted)";
    msgEl.textContent = t("edUndone");
  }
  return true;
}

export function stepSelectedBeat(delta) {
  const ts = TIME_SIGS[edState.timeSig] || TIME_SIGS["4/4"];
  const totalBeats = edState.bars.length * ts.beatsPerBar;
  if (totalBeats <= 0) return;
  const curFlat = edState.selBar * ts.beatsPerBar + edState.selBeat;
  const nextFlat = Math.max(0, Math.min(totalBeats - 1, curFlat + delta));
  edState.selBar = Math.floor(nextFlat / ts.beatsPerBar);
  edState.selBeat = nextFlat % ts.beatsPerBar;
  app.dirtyScore = true;
  renderEditorUi();
}

export function duplicateSelectedBar() {
  if (!edState.bars.length) return;
  const srcIdx = Math.max(0, Math.min(edState.bars.length - 1, edState.selBar));
  let dstIdx = srcIdx + 1;
  if (dstIdx >= edState.bars.length) {
    if (edState.bars.length >= 8) return;
    pushEdUndo();
    edState.bars.push(cloneBars([edState.bars[srcIdx]])[0]);
  } else {
    pushEdUndo();
    edState.bars[dstIdx] = cloneBars([edState.bars[srcIdx]])[0];
  }
  edState.selBar = dstIdx;
  edState.selBeat = 0;
  applyCustomToApp();
  renderEditorUi();
  const msgEl = document.getElementById("edMsg");
  if (msgEl) {
    msgEl.style.color = "var(--green)";
    msgEl.textContent = t("edDupDone", srcIdx + 1, dstIdx + 1);
  }
}

export const ED_SIMPLE_GROUPS = [
  {
    cat: "basic",
    items: [
      { lbl: "4박",   cells: [[[0, 48, false, null]], [], [], []] },
      { lbl: "3박",   cells: [[[0, 36, false, null]], [], []] },
      { lbl: "2박",   cells: [[[0, 24, false, null]], []] },
      { lbl: "2박쉼", cells: [[[0, 24, true, null]], []] },
      { lbl: "1박",   cells: [[[0, 12, false, null]]] },
      { lbl: "1박쉼", cells: [[[0, 12, true, null]]] },
    ]
  },
  {
    cat: "eighth",
    items: [
      { lbl: "8-8",     cells: [[[0, 6, false, null], [6, 6, false, null]]] },
      { lbl: "쉼-8",    cells: [[[0, 6, true, null], [6, 6, false, null]]] },
      { lbl: "8-쉼",    cells: [[[0, 6, false, null], [6, 6, true, null]]] },
      { lbl: "점4+8",   cells: [[[0, 18, false, null]], [[6, 6, false, null]]] },
    ]
  },
  {
    cat: "sixteenth",
    items: [
      { lbl: "16×4",    cells: [[[0, 3, false, null], [3, 3, false, null], [6, 3, false, null], [9, 3, false, null]]] },
      { lbl: "8-16-16", cells: [[[0, 6, false, null], [6, 3, false, null], [9, 3, false, null]]] },
      { lbl: "16-16-8", cells: [[[0, 3, false, null], [3, 3, false, null], [6, 6, false, null]]] },
      { lbl: "16-8-16", cells: [[[0, 3, false, null], [3, 6, false, null], [9, 3, false, null]]] },
      { lbl: "점8+16",  cells: [[[0, 9, false, null], [9, 3, false, null]]] },
      { lbl: "쉼-16×3", cells: [[[0, 3, true, null], [3, 3, false, null], [6, 3, false, null], [9, 3, false, null]]] },
    ]
  },
  {
    cat: "triplet",
    items: [
      { lbl: "8분 3연",  cells: [[[0, 4, false, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]] },
      { lbl: "셔플 2:1", cells: [[[0, 8, false, "8t"], [8, 4, false, "8t"]]] },
      { lbl: "쉼-8-8",   cells: [[[0, 4, true, "8t"], [4, 4, false, "8t"], [8, 4, false, "8t"]]] },
      { lbl: "2박 3연",  cells: [[[0, 8, false, "4t"], [8, 8, false, "4t"]], [[4, 8, false, "4t"]]] },
    ]
  }
];

export const ED_68_GROUPS = [
  {
    cat: "c68",
    items: [
      { lbl: "2박(점2)", cells: [[[0, 36, false, null]], []] },
      { lbl: "점4분",    cells: [[[0, 18, false, null]]] },
      { lbl: "점4쉼",    cells: [[[0, 18, true, null]]] },
      { lbl: "8-8-8",    cells: [[[0, 6, false, null], [6, 6, false, null], [12, 6, false, null]]] },
      { lbl: "4-8",      cells: [[[0, 12, false, null], [12, 6, false, null]]] },
      { lbl: "8-4",      cells: [[[0, 6, false, null], [6, 12, false, null]]] },
      { lbl: "쉼-8-8",   cells: [[[0, 6, true, null], [6, 6, false, null], [12, 6, false, null]]] },
      { lbl: "8-쉼-8",   cells: [[[0, 6, false, null], [6, 6, true, null], [12, 6, false, null]]] },
    ]
  },
  {
    cat: "c68_16",
    items: [
      { lbl: "16-16-8-8", cells: [[[0, 3, false, null], [3, 3, false, null], [6, 6, false, null], [12, 6, false, null]]] },
      { lbl: "8-8-16-16", cells: [[[0, 6, false, null], [6, 6, false, null], [12, 3, false, null], [15, 3, false, null]]] },
      { lbl: "점8-16-8",  cells: [[[0, 9, false, null], [9, 3, false, null], [12, 6, false, null]]] },
    ]
  }
];

export function createMiniStampSvg(cells, beatTicks) {
  // Crisp vector notation icon using our exact engraver primitives (zero font/tofu dependency!)
  const svg = el("svg", { viewBox: "0 0 96 54", xmlns: SVG_NS });
  const g = el("g");
  svg.appendChild(g);
  const midY = 40;
  const stemTopY = 12;
  g.appendChild(el("line", { x1: 6, y1: midY, x2: 90, y2: midY, stroke: "#e2e8f0", "stroke-width": 1.2 }));

  // Flatten events across cells for compact preview spacing
  const flat = [];
  const totalSpanTicks = cells.length * beatTicks;
  cells.forEach((cell, cIdx) => {
    cell.forEach(([slot, dur, rest, tuplet]) => {
      flat.push({ pos: cIdx * beatTicks + slot, slot, dur, rest, tuplet });
    });
  });
  const xOf = (pos) => flat.length === 1 ? 46 : (16 + (pos / Math.max(1, totalSpanTicks - 1)) * 66);

  const beamGroups = [];
  let curBeam = [];
  for (const ev of flat) {
    const nx = xOf(ev.pos);
    if (ev.rest) {
      drawRest(g, ev.dur, nx, midY - 4);
      if (curBeam.length) { beamGroups.push(curBeam); curBeam = []; }
    } else {
      drawNotehead(g, ev.dur, nx, midY, null);
      if (ev.dur !== 48) {
        const sx = nx + 4.7;
        g.appendChild(el("line", { x1: sx, y1: midY - 1.5, x2: sx, y2: stemTopY, stroke: "#111", "stroke-width": 1.5 }));
        if (ev.dur <= 9 && ev.dur !== 8) {
          curBeam.push({ ev, nx, sx });
        } else if (curBeam.length) {
          beamGroups.push(curBeam);
          curBeam = [];
        }
      }
    }
  }
  if (curBeam.length) beamGroups.push(curBeam);

  for (const beamable of beamGroups) {
    if (beamable.length === 1) {
      drawFlag(g, beamable[0].sx, stemTopY, beamable[0].ev.dur === 3);
    } else {
      const x1 = beamable[0].sx - 0.7;
      const x2 = beamable[beamable.length - 1].sx + 0.7;
      g.appendChild(el("rect", { x: x1, y: stemTopY, width: x2 - x1, height: 4.5, fill: "#111" }));
      const connected = new Array(beamable.length).fill(false);
      const y2 = stemTopY + 7;
      for (let i = 0; i < beamable.length - 1; i++) {
        const a = beamable[i], b = beamable[i + 1];
        if (a.ev.dur === 3 && b.ev.dur === 3 && a.ev.pos + a.ev.dur === b.ev.pos) {
          g.appendChild(el("rect", { x: a.sx - 0.7, y: y2, width: (b.sx - a.sx) + 1.4, height: 3.8, fill: "#111" }));
          connected[i] = true; connected[i + 1] = true;
        }
      }
      for (let i = 0; i < beamable.length; i++) {
        if (beamable[i].ev.dur === 3 && !connected[i]) {
          const stubW = 9;
          const sx = i < beamable.length - 1 ? beamable[i].sx - 0.7 : beamable[i].sx - stubW + 0.7;
          g.appendChild(el("rect", { x: sx, y: y2, width: stubW, height: 3.8, fill: "#111" }));
        }
      }
    }
  }

  if (flat.some(e => e.tuplet === "8t" || e.tuplet === "4t")) {
    const x1 = xOf(flat[0].pos) + (flat[0].rest ? 0 : 4.7);
    const last = flat[flat.length - 1];
    const x2 = xOf(last.pos) + (last.rest ? 4 : 4.7);
    const is4t = flat.some(e => e.tuplet === "4t");
    const allBeamed3 = !is4t && beamGroups.length === 1 && beamGroups[0].length === 3 && !flat.some(e => e.rest);
    drawTuplet(g, x1, x2, stemTopY + 1, !allBeamed3);
  }
  return svg;
}


export function cloneBars(bars) {
  return bars.map(bar => bar.map(beat => beat.map(ev => ({ ...ev }))));
}

export function makeDefaultBeat(ts) {
  return [{ slot: 0, dur: ts.beatTicks, rest: false, tuplet: null, tiedIn: false, tiedOut: false, art: null }];
}

export function makeDefaultBar(timeSigKey) {
  const ts = TIME_SIGS[timeSigKey] || TIME_SIGS["4/4"];
  const bar = [];
  for (let bt = 0; bt < ts.beatsPerBar; bt++) bar.push(makeDefaultBeat(ts));
  return bar;
}

export function spanLengthAt(bar, btIdx, ts) {
  const evs = bar[btIdx];
  if (!evs || !evs.length) return 1;
  // Check 2-beat quarter-note triplet ("4t")
  if (evs[0].tuplet === "4t" && evs[0].slot === 0 && btIdx + 1 < bar.length) return 2;
  const total = evs.reduce((s, e) => s + e.dur, 0);
  if (total > ts.beatTicks) {
    return Math.min(bar.length - btIdx, Math.ceil(total / ts.beatTicks));
  }
  return 1;
}

export function findBeatOwner(bar, btIdx, ts) {
  for (let i = btIdx; i >= 0; i--) {
    if (bar[i] && bar[i].length > 0) {
      const sp = spanLengthAt(bar, i, ts);
      if (i + sp > btIdx) return { owner: i, span: sp };
      break;
    }
  }
  return { owner: btIdx, span: 1 };
}

export function sanitizeBarTies(bar, ts) {
  for (let bt = 0; bt < bar.length; bt++) {
    for (const ev of bar[bt]) {
      if (ev.rest) { ev.tiedIn = false; ev.tiedOut = false; ev.art = null; }
    }
  }
  for (let bt = 0; bt < bar.length; bt++) {
    const curr = bar[bt];
    if (!curr.length) continue;
    if (bt === 0) {
      curr[0].tiedIn = false;
    } else {
      const prev = bar[bt - 1];
      const prevEv = prev.length ? prev[prev.length - 1] : null;
      const firstEv = curr[0];
      const valid = prevEv && !prevEv.rest && !firstEv.rest && !prevEv.tuplet && !firstEv.tuplet &&
        (prevEv.slot + prevEv.dur === ts.beatTicks) && firstEv.slot === 0 &&
        (prevEv.tiedOut && firstEv.tiedIn);
      if (!valid) {
        if (prevEv) prevEv.tiedOut = false;
        firstEv.tiedIn = false;
      } else {
        prevEv.art = null;
        firstEv.art = null;
      }
    }
  }
  const last = bar[bar.length - 1];
  if (last && last.length) last[last.length - 1].tiedOut = false;
}

export function applyStampAt(bIdx, btIdx, cells) {
  const ts = TIME_SIGS[edState.timeSig] || TIME_SIGS["4/4"];
  const bar = edState.bars[bIdx];
  if (!bar || btIdx + cells.length > ts.beatsPerBar) return;
  pushEdUndo();

  // 1. If btIdx is inside a multi-beat span owned by an earlier beat, split that span cleanly first
  const { owner, span } = findBeatOwner(bar, btIdx, ts);
  if (owner < btIdx) {
    for (let k = owner; k < owner + span; k++) bar[k] = makeDefaultBeat(ts);
  }

  // 2. Determine full range of existing spans touched by [btIdx .. btIdx + cells.length - 1]
  let clearEnd = btIdx + cells.length;
  for (let k = btIdx; k < btIdx + cells.length; k++) {
    if (bar[k] && bar[k].length) {
      const sp = spanLengthAt(bar, k, ts);
      clearEnd = Math.max(clearEnd, k + sp);
    }
  }
  clearEnd = Math.min(ts.beatsPerBar, clearEnd);

  // 3. Write new cells
  for (let i = 0; i < cells.length; i++) {
    bar[btIdx + i] = cells[i].map(([slot, dur, rest, tuplet]) => ({
      slot, dur, rest, tuplet: tuplet || null, tiedIn: false, tiedOut: false, art: null
    }));
  }
  // 4. Fill any leftover beats from a previously longer span
  for (let k = btIdx + cells.length; k < clearEnd; k++) {
    bar[k] = makeDefaultBeat(ts);
  }

  sanitizeBarTies(bar, ts);
  applyCustomToApp();
  // Auto-advance selection to next editable beat for rapid entry
  const nextBt = btIdx + cells.length;
  if (nextBt < ts.beatsPerBar) {
    edState.selBeat = nextBt;
  } else if (bIdx + 1 < edState.bars.length) {
    edState.selBar = bIdx + 1;
    edState.selBeat = 0;
  }
  renderEditorUi();
}

export function applyCustomToApp() {
  app.runSeq += 1;
  if (app.state === "CAL") stopCalibration(false);
  stopScheduledAudio();
  app.dailyDate = null;
  app.customMode = true;
  app.timeSig = edState.timeSig;
  app.numBars = edState.bars.length;
  const code = encodeCustomScore(edState.timeSig, edState.bars);
  app.phrase = buildPhraseFromBars(cloneBars(edState.bars), edState.timeSig, 0, true, code);
  edCbs.applyPitchIfNeeded();
  edCbs.resetTargets();
  app.state = "READY";
  edCbs.setHitBadge(t("badgeWait"), "");
  edCbs.updateMeta();
  const tsMain = document.getElementById("timeSigSelect");
  if (tsMain && tsMain.value !== edState.timeSig) tsMain.value = edState.timeSig;
  const inp = document.getElementById("edCodeInput");
  if (inp) inp.value = code;
}

export function renderEditorUi() {
  const ts = TIME_SIGS[edState.timeSig] || TIME_SIGS["4/4"];
  if (!edState.bars.length) {
    edState.bars = [makeDefaultBar(edState.timeSig), makeDefaultBar(edState.timeSig)];
  }
  edState.selBar = Math.max(0, Math.min(edState.bars.length - 1, edState.selBar));
  edState.selBeat = Math.max(0, Math.min(ts.beatsPerBar - 1, edState.selBeat));

  const edTsSel = document.getElementById("edTimeSigSelect");
  if (edTsSel && edTsSel.value !== edState.timeSig) edTsSel.value = edState.timeSig;
  document.getElementById("edBarsVal").textContent = t("edBarsLbl", edState.bars.length);
  document.getElementById("btnEdBarMinus").disabled = edState.bars.length <= 1;
  document.getElementById("btnEdBarPlus").disabled = edState.bars.length >= 8;
  const undoBtn = document.getElementById("btnEdUndo");
  if (undoBtn) undoBtn.disabled = edState.undoStack.length === 0;
  const dupBtn = document.getElementById("btnEdDupBar");
  if (dupBtn) dupBtn.disabled = (edState.selBar >= 7 && edState.bars.length >= 8);
  const posBadge = document.getElementById("edCurPosBadge");
  if (posBadge) posBadge.textContent = t("edBeatPos", edState.selBar + 1, edState.selBeat + 1);
  const prevBtn = document.getElementById("btnEdPrevBeat");
  if (prevBtn) prevBtn.disabled = (edState.selBar === 0 && edState.selBeat === 0);
  const nextBtn = document.getElementById("btnEdNextBeat");
  if (nextBtn) nextBtn.disabled = (edState.selBar === edState.bars.length - 1 && edState.selBeat === ts.beatsPerBar - 1);

  // 1. Beat strip (horizontal swipeable rail on mobile, auto-centered on active beat)
  const strip = document.getElementById("edBeatStrip");
  strip.innerHTML = "";
  let selectedBeatBtn = null;
  edState.bars.forEach((bar, bIdx) => {
    const grp = document.createElement("div");
    grp.className = "ed-bar-group" + (bIdx === edState.selBar ? " active-bar" : "");
    const lbl = document.createElement("span");
    lbl.className = "ed-bar-lbl";
    lbl.textContent = `M${bIdx + 1}`;
    grp.appendChild(lbl);
    for (let bt = 0; bt < ts.beatsPerBar; bt++) {
      const btn = document.createElement("button");
      btn.type = "button";
      const isCont = !bar[bt] || bar[bt].length === 0;
      const isSel = bIdx === edState.selBar && bt === edState.selBeat;
      btn.className = "ed-beat-btn" + (isSel ? " selected" : "") + (isCont ? " cont" : "");
      btn.textContent = isCont ? "→" : String(bt + 1);
      if (isSel) selectedBeatBtn = btn;
      btn.addEventListener("click", (e) => {
        e.currentTarget.blur();
        edState.selBar = bIdx;
        edState.selBeat = bt;
        app.dirtyScore = true;
        renderEditorUi();
      });
      grp.appendChild(btn);
    }
    strip.appendChild(grp);
  });
  if (selectedBeatBtn && strip.scrollWidth > strip.clientWidth + 4) {
    const targetLeft = Math.max(0, selectedBeatBtn.offsetLeft - strip.clientWidth / 2 + selectedBeatBtn.offsetWidth / 2);
    strip.scrollTo({ left: targetLeft, behavior: "smooth" });
  }

  // 2. Categorized SVG notation stamp palette (+ mobile segmented category tabs)
  const groups = ts.compound ? ED_68_GROUPS : ED_SIMPLE_GROUPS;
  const catLabels = t("edCats");
  if (!groups.some((g) => g.cat === edState.activeCat)) {
    edState.activeCat = groups[0].cat;
  }
  const tabsWrap = document.getElementById("edCatTabs");
  if (tabsWrap) {
    tabsWrap.innerHTML = "";
    for (const grp of groups) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.role = "tab";
      const isActive = grp.cat === edState.activeCat;
      tab.className = "ed-cat-tab" + (isActive ? " active" : "");
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.textContent = catLabels[grp.cat] || grp.cat;
      tab.addEventListener("click", (e) => {
        e.currentTarget.blur();
        edState.activeCat = grp.cat;
        renderEditorUi();
      });
      tabsWrap.appendChild(tab);
    }
  }

  const pal = document.getElementById("edPalette");
  pal.innerHTML = "";
  const remBeats = ts.beatsPerBar - edState.selBeat;
  for (const grp of groups) {
    const row = document.createElement("div");
    row.className = "ed-cat-row" + (grp.cat === edState.activeCat ? " cat-active" : "");
    const lbl = document.createElement("span");
    lbl.className = "ed-cat-lbl";
    lbl.textContent = catLabels[grp.cat] || grp.cat;
    row.appendChild(lbl);
    for (const st of grp.items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ed-stamp";
      btn.disabled = st.cells.length > remBeats;
      btn.appendChild(createMiniStampSvg(st.cells, ts.beatTicks));
      const cap = document.createElement("span");
      cap.className = "ed-stamp-lbl";
      cap.textContent = st.lbl;
      btn.appendChild(cap);
      btn.addEventListener("click", (e) => {
        e.currentTarget.blur();
        applyStampAt(edState.selBar, edState.selBeat, st.cells);
      });
      row.appendChild(btn);
    }
    pal.appendChild(row);
  }

  // 3. Per-note articulation & cross-beat tie controls for selected beat
  const tools = document.getElementById("edNoteTools");
  tools.innerHTML = "";
  const curBar = edState.bars[edState.selBar];
  const curEvs = curBar[edState.selBeat] || [];
  if (!curEvs.length) {
    const span = document.createElement("span");
    span.className = "ed-msg";
    span.textContent = t("edContBeat");
    tools.appendChild(span);
  } else {
    const notes = curEvs.filter(ev => !ev.rest);
    if (!notes.length) {
      const span = document.createElement("span");
      span.className = "ed-msg";
      span.textContent = t("edRestOnly");
      tools.appendChild(span);
    } else {
      const hint = document.createElement("span");
      hint.className = "label";
      hint.textContent = t("edNoteHint");
      tools.appendChild(hint);

      let noteNum = 0;
      curEvs.forEach((ev) => {
        if (ev.rest) return;
        noteNum++;
        const chip = document.createElement("button");
        chip.type = "button";
        const artCls = ev.art === "staccato" ? " art-stac" : (ev.art === "ghost" ? " art-ghost" : "");
        chip.className = "ed-note-chip" + artCls;
        const artTxt = ev.art === "staccato" ? t("edArtStac") : (ev.art === "ghost" ? t("edArtGhost") : t("edArtNormal"));
        chip.textContent = `#${noteNum} ${artTxt}`;
        chip.disabled = Boolean(ev.tiedIn || ev.tiedOut);
        chip.addEventListener("click", (e) => {
          e.currentTarget.blur();
          pushEdUndo();
          ev.art = ev.art === null ? "staccato" : (ev.art === "staccato" ? "ghost" : null);
          applyCustomToApp();
          renderEditorUi();
        });
        tools.appendChild(chip);
      });
    }

    // Tie toggle from previous beat
    if (edState.selBeat > 0 && curEvs.length) {
      const prev = curBar[edState.selBeat - 1];
      const prevEv = prev && prev.length ? prev[prev.length - 1] : null;
      const firstEv = curEvs[0];
      const canTie = prevEv && !prevEv.rest && !firstEv.rest && !prevEv.tuplet && !firstEv.tuplet &&
        (prevEv.slot + prevEv.dur === ts.beatTicks) && firstEv.slot === 0;
      if (canTie) {
        const tieBtn = document.createElement("button");
        tieBtn.type = "button";
        tieBtn.className = "ed-note-chip" + (firstEv.tiedIn ? " active" : "");
        tieBtn.textContent = t("edTiePrev");
        tieBtn.addEventListener("click", (e) => {
          e.currentTarget.blur();
          pushEdUndo();
          const next = !firstEv.tiedIn;
          prevEv.tiedOut = next;
          firstEv.tiedIn = next;
          if (next) { prevEv.art = null; firstEv.art = null; }
          applyCustomToApp();
          renderEditorUi();
        });
        tools.appendChild(tieBtn);
      }
    }
  }

  const inp = document.getElementById("edCodeInput");
  if (inp && document.activeElement !== inp) {
    inp.value = encodeCustomScore(edState.timeSig, edState.bars);
  }
}

export function importCurrentScoreIntoEditor() {
  edState.timeSig = app.phrase ? (app.phrase.timeSig || app.timeSig) : app.timeSig;
  const srcBars = app.phrase && app.phrase.bars ? app.phrase.bars.slice(0, 8) : [makeDefaultBar(edState.timeSig)];
  edState.bars = cloneBars(srcBars);
  edState.selBar = 0;
  edState.selBeat = 0;
  applyCustomToApp();
  renderEditorUi();
}

export function toggleEditorBar(forceOpen = null) {
  const bar = document.getElementById("editorBar");
  const btn = document.getElementById("btnEditor");
  const open = forceOpen !== null ? forceOpen : bar.classList.contains("hidden");
  edState.open = open;
  bar.classList.toggle("hidden", !open);
  btn.classList.toggle("active", open);
  document.body.classList.toggle("editing-score", open);
  if (open) {
    if (!app.customMode || edState.timeSig !== app.timeSig || !edState.bars.length) {
      importCurrentScoreIntoEditor();
    } else {
      renderEditorUi();
    }
    if (window.innerWidth <= 780) {
      window.requestAnimationFrame(() => {
        const paper = document.querySelector(".sheet-paper");
        if (paper) paper.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
  app.dirtyScore = true;
}

// Click/tap directly on any beat in the sheet music SVG to select it when the editor is open!
scoreSvg.addEventListener("click", (e) => {
  if (!edState.open || !app.scoreLayout) return;
  const rect = scoreSvg.getBoundingClientRect();
  const vb = scoreSvg.viewBox.baseVal;
  if (!rect.width || !rect.height || !vb.width || !vb.height) return;
  const sx = ((e.clientX - rect.left) / rect.width) * vb.width;
  const sy = ((e.clientY - rect.top) / rect.height) * vb.height;
  const layouts = app.scoreLayout.barLayouts;
  for (let bIdx = 0; bIdx < layouts.length; bIdx++) {
    const lay = layouts[bIdx];
    if (!lay) continue;
    if (sy >= lay.staffTop - 52 && sy <= lay.staffTop + 92 && sx >= lay.barX0 && sx <= lay.barX1) {
      const relTick = ((sx - (lay.barX0 + lay.innerPadL)) / Math.max(1, lay.innerW)) * lay.barTicks;
      const bt = Math.max(0, Math.min(lay.beatsPerBar - 1, Math.floor(relTick / lay.beatTicks)));
      edState.selBar = bIdx;
      edState.selBeat = bt;
      app.dirtyScore = true;
      renderEditorUi();
      return;
    }
  }
});

export function applyFullSeedObj(cfg) {
  app.timeSig = cfg.timeSig;
  app.level = cfg.level;
  app.tripletMode = cfg.tripletMode;
  app.staccatoOn = cfg.staccatoOn;
  app.ghostOn = cfg.ghostOn;
  app.numBars = cfg.numBars;
  app.bpm = cfg.bpm;
  if (cfg.pitchMode) {
    app.pitchMode = true;
    app.pitchClef = cfg.pitchClef || "bass";
    if (cfg.pitchKey) app.pitchKey = cfg.pitchKey;
    if (cfg.pitchProg) app.pitchProg = cfg.pitchProg;
    const pBar = document.getElementById("pitchBar");
    if (pBar) pBar.classList.remove("hidden");
  } else {
    app.pitchMode = false;
  }
  toggleEditorBar(false);
  edCbs.newPhrase(cfg.seed, false);
  edCbs.syncPitchUi();
  const full = currentFullSeedCode();
  edCbs.setHitBadge(`#${full}`, "tight");
  return full;
}

export function applySeedQueryParams(params) {
  const customParam = params.get("custom");
  if (customParam) {
    const bpmP = params.get("bpm");
    if (bpmP && Number.isFinite(Number(bpmP))) {
      app.bpm = Math.max(40, Math.min(180, Math.round(Number(bpmP))));
    }
    return loadCustomFromInput(customParam);
  }
  const dailyPlusParam = params.get("dailyplus");
  if (dailyPlusParam) {
    edCbs.loadDailyChallenge(dailyPlusParam === "1" ? null : dailyPlusParam, true);
    return true;
  }
  const dailyParam = params.get("daily");
  if (dailyParam) {
    edCbs.loadDailyChallenge(dailyParam === "1" ? null : dailyParam, false);
    return true;
  }
  const seedParam = params.get("seed");
  if (seedParam) {
    // Support self-contained full seed code: ?seed=44-L4SG-8B-80-A1B2
    const fullCfg = decodeFullSeedCode(seedParam);
    if (fullCfg) {
      applyFullSeedObj(fullCfg);
      return true;
    }
    // Backward compatibility: legacy ?ts=4/4&lv=4&b=4&bpm=80&seed=A1B2
    const tsP = params.get("ts");
    if (tsP && TIME_SIGS[tsP]) app.timeSig = tsP;
    const lvP = Number(params.get("lv"));
    if (lvP >= 1 && lvP <= 6) app.level = lvP;
    const bP = Number(params.get("b"));
    if (BAR_OPTIONS.includes(bP)) app.numBars = bP;
    const bpmP = Number(params.get("bpm"));
    if (bpmP >= 40 && bpmP <= 180) app.bpm = Math.round(bpmP);
    const tP = Number(params.get("t"));
    app.tripletMode = (tP === 1 || tP === 2) ? tP : 0;
    app.staccatoOn = params.get("s") === "1";
    app.ghostOn = params.get("g") === "1";
    const cleanHex = seedParam.replace(/^#/, "").trim();
    const parsedSeed = parseInt(cleanHex, 16);
    if (/^[0-9a-fA-F]{1,8}$/.test(cleanHex) && Number.isFinite(parsedSeed) && parsedSeed > 0) {
      toggleEditorBar(false);
      edCbs.newPhrase(parsedSeed, false);
      edCbs.setHitBadge(`#${currentFullSeedCode()}`, "tight");
      return true;
    }
  }
  return false;
}

export function loadCustomFromInput(rawInput) {
  const trimmed = String(rawInput || "").trim();
  const msgEl = document.getElementById("edMsg");

  // 1. Try custom code or ?custom= URL
  const decoded = decodeCustomScore(trimmed);
  if (decoded) {
    edState.timeSig = decoded.timeSig;
    edState.bars = cloneBars(decoded.bars);
    edState.selBar = 0;
    edState.selBeat = 0;
    if (decoded.bpm !== null) app.bpm = decoded.bpm;
    applyCustomToApp();
    if (edState.open) renderEditorUi();
    if (msgEl) {
      msgEl.style.color = "var(--green)";
      msgEl.textContent = t("edLoadedOk");
    }
    return true;
  }

  // 2. Try self-contained full seed code (e.g. "44-L4T1SG-8B-80-A1B2") — syncs ALL settings!
  const fullCfg = decodeFullSeedCode(trimmed);
  if (fullCfg) {
    const fullStr = applyFullSeedObj(fullCfg);
    if (msgEl) {
      msgEl.style.color = "var(--green)";
      msgEl.textContent = t("edSeedLoadedOk", "#" + fullStr);
    }
    return true;
  }

  // 3. Try full share URL (?seed=... / ?daily=... / ?dailyplus=...)
  if (trimmed.includes("seed=") || trimmed.includes("daily=") || trimmed.includes("dailyplus=")) {
    try {
      const u = new URL(trimmed.startsWith("http") ? trimmed : "https://x.local/?" + trimmed.replace(/^\?/, ""));
      if (applySeedQueryParams(u.searchParams)) {
        if (msgEl) {
          msgEl.style.color = "var(--green)";
          msgEl.textContent = t("edSeedLoadedOk", "#" + currentFullSeedCode());
        }
        return true;
      }
    } catch (_) {}
  }

  // 4. Try bare hex seed (e.g. "A1B2", "#A1B2") using current settings
  const seedMatch = trimmed.match(/^(?:seed\s*)?#?([0-9a-fA-F]{1,8})$/i);
  if (seedMatch) {
    const parsedSeed = parseInt(seedMatch[1], 16);
    if (Number.isFinite(parsedSeed) && parsedSeed > 0) {
      toggleEditorBar(false);
      edCbs.newPhrase(parsedSeed, false);
      const fullStr = currentFullSeedCode();
      edCbs.setHitBadge(`#${fullStr}`, "tight");
      if (msgEl) {
        msgEl.style.color = "var(--green)";
        msgEl.textContent = t("edSeedLoadedOk", "#" + fullStr);
      }
      return true;
    }
  }

  if (msgEl) {
    msgEl.style.color = "var(--red)";
    msgEl.textContent = t("edLoadFail");
  }
  return false;
}


export function initEditor(cbs) {
  Object.assign(edCbs, cbs);

  

  document.getElementById("metaSeed").addEventListener("click", () => {
    const curVal = app.customMode && app.phrase.customCode
      ? app.phrase.customCode
      : currentFullSeedCode();
    const entered = window.prompt(t("seedPrompt"), curVal);
    if (entered === null || !entered.trim()) return;
    if (!loadCustomFromInput(entered)) {
      edCbs.setHitBadge(t("edLoadFail"), "err");
    }
  });
  
  
  document.getElementById("btnEditor").addEventListener("click", (e) => {
    e.currentTarget.blur();
    toggleEditorBar();
  });
  document.getElementById("btnEdClose").addEventListener("click", () => toggleEditorBar(false));

  const btnEdDemo = document.getElementById("btnEdDemo");
  if (btnEdDemo) {
    btnEdDemo.addEventListener("click", (e) => {
      e.currentTarget.blur();
      edCbs.playDemo();
    });
  }
  const btnEdPlay = document.getElementById("btnEdPlay");
  if (btnEdPlay) {
    btnEdPlay.addEventListener("click", (e) => {
      e.currentTarget.blur();
      toggleEditorBar(false);
      edCbs.startPlay();
    });
  }
  const edTsSel = document.getElementById("edTimeSigSelect");
  if (edTsSel) {
    edTsSel.addEventListener("change", (e) => {
      const nextTs = e.target.value;
      e.target.blur();
      if (!TIME_SIGS[nextTs] || nextTs === edState.timeSig) return;
      pushEdUndo();
      edState.timeSig = nextTs;
      const nBars = Math.max(1, Math.min(8, edState.bars.length || 4));
      edState.bars = Array.from({ length: nBars }, () => makeDefaultBar(nextTs));
      edState.selBar = 0;
      edState.selBeat = 0;
      applyCustomToApp();
      renderEditorUi();
    });
  }
  const btnEdUndo = document.getElementById("btnEdUndo");
  if (btnEdUndo) {
    btnEdUndo.addEventListener("click", (e) => {
      e.currentTarget.blur();
      undoEditor();
    });
  }
  const btnEdDupBar = document.getElementById("btnEdDupBar");
  if (btnEdDupBar) {
    btnEdDupBar.addEventListener("click", (e) => {
      e.currentTarget.blur();
      duplicateSelectedBar();
    });
  }
  const btnEdPrevBeat = document.getElementById("btnEdPrevBeat");
  if (btnEdPrevBeat) {
    btnEdPrevBeat.addEventListener("click", (e) => {
      e.currentTarget.blur();
      stepSelectedBeat(-1);
    });
  }
  const btnEdNextBeat = document.getElementById("btnEdNextBeat");
  if (btnEdNextBeat) {
    btnEdNextBeat.addEventListener("click", (e) => {
      e.currentTarget.blur();
      stepSelectedBeat(1);
    });
  }

  document.getElementById("btnEdBarMinus").addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (edState.bars.length > 1) {
      pushEdUndo();
      edState.bars.pop();
      applyCustomToApp();
      renderEditorUi();
    }
  });
  document.getElementById("btnEdBarPlus").addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (edState.bars.length < 8) {
      pushEdUndo();
      edState.bars.push(makeDefaultBar(edState.timeSig));
      applyCustomToApp();
      renderEditorUi();
    }
  });
  document.getElementById("btnEdImportCur").addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (edState.bars.length) pushEdUndo();
    importCurrentScoreIntoEditor();
  });
  document.getElementById("btnEdClear").addEventListener("click", (e) => {
    e.currentTarget.blur();
    pushEdUndo();
    edState.bars = edState.bars.map(() => makeDefaultBar(edState.timeSig));
    edState.selBar = 0;
    edState.selBeat = 0;
    applyCustomToApp();
    renderEditorUi();
  });
  document.getElementById("btnEdCopyUrl").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.blur();
    const url = buildShareUrl();
    await copyToClipboard(url);
    flashBtnText(btn, t("btnShareCopied"), () => t("edCopyUrl"));
    const msgEl = document.getElementById("edMsg");
    msgEl.style.color = "var(--green)";
    msgEl.textContent = t("edUrlCopied");
  });
  document.getElementById("btnEdLoadCode").addEventListener("click", (e) => {
    e.currentTarget.blur();
    loadCustomFromInput(document.getElementById("edCodeInput").value);
  });

  window.addEventListener("keydown", (e) => {
    if (!edState.open) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "KeyZ") {
      e.preventDefault();
      undoEditor();
    }
  });
  
}
