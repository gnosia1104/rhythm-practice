// Print-Quality SVG Vector Sheet Music Engraver
import { TIME_SIGS } from "./rhythm.js";
import { app, edState, getTimeSig, isGapBar } from "./state.js";
import { t } from "./i18n.js";
import { getTimingThresholds } from "./scoring.js";
import { BASS_FLAT_SIG_POS, TREBLE_FLAT_SIG_POS, getKeySignatureAcc, getRelativeDegreeName } from "./pitch-gen.js";

// -------------------------------------------------------------------------
// 2. Print-Quality SVG Vector Sheet Music Engraver
// -------------------------------------------------------------------------
export const SVG_NS = "http://www.w3.org/2000/svg";
export function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== null) node.textContent = text;
  return node;
}

export function drawBassClef(g, x, staffTop) {
  // Crisp vector F-clef centered around line 4 from bottom (staffTop + 10)
  const y2 = staffTop + 10;
  g.appendChild(el("circle", { cx: x + 6, cy: y2, r: 3.4, fill: "#111" }));
  g.appendChild(el("path", {
    d: `M ${x + 4.5} ${y2 + 1} C ${x + 2} ${y2 - 11}, ${x + 19} ${y2 - 13}, ${x + 20} ${y2 + 1}
        C ${x + 21} ${y2 + 13}, ${x + 11} ${y2 + 22}, ${x + 2} ${y2 + 27}`,
    fill: "none", stroke: "#111", "stroke-width": 2.8, "stroke-linecap": "round"
  }));
  g.appendChild(el("circle", { cx: x + 26, cy: staffTop + 5.5, r: 2.0, fill: "#111" }));
  g.appendChild(el("circle", { cx: x + 26, cy: staffTop + 14.5, r: 2.0, fill: "#111" }));
}

export function drawTrebleClef(g, x, staffTop) {
  // Crisp vector G-clef spiraling around line 2 from bottom (G4 = staffTop + 30)
  const gY = staffTop + 30;
  g.appendChild(el("path", {
    d: `M ${x + 14} ${gY + 5}
        C ${x + 9} ${gY + 4}, ${x + 9} ${gY - 5}, ${x + 15} ${gY - 6}
        C ${x + 22} ${gY - 7}, ${x + 25} ${gY + 2}, ${x + 19} ${gY + 8}
        C ${x + 12} ${gY + 13}, ${x + 3} ${gY + 7}, ${x + 4} ${gY - 4}
        C ${x + 5} ${gY - 16}, ${x + 20} ${staffTop - 2}, ${x + 18} ${staffTop - 13}
        C ${x + 17} ${staffTop - 20}, ${x + 11} ${staffTop - 18}, ${x + 12} ${staffTop - 8}
        L ${x + 15} ${staffTop + 47}
        C ${x + 15} ${staffTop + 53}, ${x + 9} ${staffTop + 54}, ${x + 7} ${staffTop + 50}`,
    fill: "none", stroke: "#111", "stroke-width": 2.35, "stroke-linecap": "round", "stroke-linejoin": "round"
  }));
  g.appendChild(el("circle", { cx: x + 7.5, cy: staffTop + 49.5, r: 2.3, fill: "#111" }));
}

export function drawTimeSig(g, x, staffTop, num = 4, den = 4) {
  const common = {
    "font-family": 'Georgia, "Times New Roman", serif',
    "font-weight": "700",
    "font-size": "24",
    fill: "#111",
    "text-anchor": "middle",
  };
  g.appendChild(el("text", { ...common, x, y: staffTop + 18.5 }, String(num)));
  g.appendChild(el("text", { ...common, x, y: staffTop + 38.5 }, String(den)));
}

export function drawRest(g, dur, x, midY) {
  if (dur >= 24) {
    // Half rest (24 or dotted 36): solid hat sitting on top of middle line
    g.appendChild(el("rect", { x: x - 6, y: midY - 5, width: 12, height: 5, fill: "#111", rx: 0.5 }));
    if (dur === 36) g.appendChild(el("circle", { cx: x + 10.5, cy: midY - 4.5, r: 2.1, fill: "#111" }));
    return;
  }
  if (dur === 12 || dur === 18) {
    // Engraved quarter rest (12 or dotted 18)
    g.appendChild(el("path", {
      d: `M ${x - 2.5} ${midY - 14} L ${x + 3.8} ${midY - 5.5}
          C ${x - 1} ${midY - 1}, ${x - 2.5} ${midY + 2}, ${x + 3.2} ${midY + 8}
          C ${x - 3.5} ${midY + 5.5}, ${x - 5.2} ${midY + 11.5}, ${x + 1.2} ${midY + 15.5}`,
      fill: "none", stroke: "#111", "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round"
    }));
    if (dur === 18) g.appendChild(el("circle", { cx: x + 10, cy: midY - 4.5, r: 2.1, fill: "#111" }));
    return;
  }
  if (dur === 6 || dur === 9 || dur === 4) {
    // Engraved 8th rest (straight 6, dotted 9, or triplet 8th 4)
    g.appendChild(el("circle", { cx: x - 2.8, cy: midY - 5.5, r: 2.6, fill: "#111" }));
    g.appendChild(el("path", {
      d: `M ${x - 2} ${midY - 3.5} Q ${x + 3} ${midY - 1.5}, ${x + 5.5} ${midY - 7.5} L ${x - 1.2} ${midY + 12}`,
      fill: "none", stroke: "#111", "stroke-width": 1.9, "stroke-linecap": "round"
    }));
    if (dur === 9) g.appendChild(el("circle", { cx: x + 9.5, cy: midY - 4.5, r: 2.0, fill: "#111" }));
    return;
  }
  if (dur === 3) {
    // Engraved 16th rest
    g.appendChild(el("circle", { cx: x - 2.2, cy: midY - 8.5, r: 2.3, fill: "#111" }));
    g.appendChild(el("circle", { cx: x - 4.2, cy: midY - 0.5, r: 2.3, fill: "#111" }));
    g.appendChild(el("path", {
      d: `M ${x - 1.5} ${midY - 6.8} Q ${x + 3.2} ${midY - 4.8}, ${x + 5.5} ${midY - 10.5} L ${x - 2.8} ${midY + 15}
          M ${x - 3.5} ${midY + 1.2} Q ${x + 1.2} ${midY + 3.2}, ${x + 3.2} ${midY - 2.5}`,
      fill: "none", stroke: "#111", "stroke-width": 1.8, "stroke-linecap": "round"
    }));
  }
}

export function drawNotehead(g, dur, x, y, art = null, color = "#111", stemDown = false) {
  if (art === "ghost") {
    // Engraved X dead-note head (percussive muted bass note)
    g.appendChild(el("path", {
      d: `M ${x - 4.6} ${y - 4.3} L ${x + 4.6} ${y + 4.3} M ${x - 4.6} ${y + 4.3} L ${x + 4.6} ${y - 4.3}`,
      stroke: color, "stroke-width": 2.15, "stroke-linecap": "round"
    }));
    if (dur === 9 || dur === 18) {
      g.appendChild(el("circle", { cx: x + 9.2, cy: y - 4.5, r: 1.9, fill: color }));
    }
    return;
  }
  if (dur === 48) {
    // Engraved whole note (wide oval + tilted inner cutout, no stem)
    g.appendChild(el("ellipse", { cx: x, cy: y, rx: 7.2, ry: 4.5, fill: color }));
    g.appendChild(el("ellipse", {
      cx: x, cy: y, rx: 3.6, ry: 2.7, fill: "#fff",
      transform: `rotate(24 ${x} ${y})`
    }));
    return;
  }
  if (dur === 24 || dur === 36) {
    // Engraved half note (tilted hollow oval)
    g.appendChild(el("ellipse", {
      cx: x, cy: y, rx: 5.7, ry: 4.0, fill: color,
      transform: `rotate(-22 ${x} ${y})`
    }));
    g.appendChild(el("ellipse", {
      cx: x, cy: y, rx: 3.9, ry: 1.9, fill: "#fff",
      transform: `rotate(-22 ${x} ${y})`
    }));
    if (dur === 36) g.appendChild(el("circle", { cx: x + 9.6, cy: y - 4.5, r: 2.0, fill: color }));
    return;
  }
  // Filled notehead (quarter=12, dot4=18, triplet-quarter=8, dot8=9, 8th=6, triplet-8th=4, 16th=3)
  g.appendChild(el("ellipse", {
    cx: x, cy: y, rx: 5.3, ry: 3.8, fill: color,
    transform: `rotate(-22 ${x} ${y})`
  }));
  if (dur === 9 || dur === 18) {
    g.appendChild(el("circle", { cx: x + 9.2, cy: y - 4.5, r: 1.9, fill: color }));
  }
  if (art === "staccato") {
    // Crisp staccato dot centered on notehead side (opposite stem)
    g.appendChild(el("circle", { cx: x, cy: stemDown ? y - 10.5 : y + 11.5, r: 2.05, fill: color }));
  }
}

function drawKeySigFlats(g, x0, midY, flats, clef = "bass") {
  const posList = clef === "treble" ? TREBLE_FLAT_SIG_POS : BASS_FLAT_SIG_POS;
  for (let i = 0; i < flats && i < posList.length; i++) {
    const fy = midY - posList[i] * 5 + 5.5;
    g.appendChild(el("text", {
      x: x0 + i * 9.5, y: fy, fill: "#111",
      "font-family": 'Georgia, "Times New Roman", serif',
      "font-size": 19, "font-weight": 500
    }, "♭"));
  }
}

function drawAccidental(g, x, y, acc) {
  const sym = acc === -1 ? "♭" : "♮";
  g.appendChild(el("text", {
    x, y: y + 5.2, fill: "#111",
    "font-family": 'Georgia, "Times New Roman", serif',
    "font-size": acc === -1 ? 17.5 : 16.5, "font-weight": 600,
    "text-anchor": "middle"
  }, sym));
}

function drawLedgerLines(g, nx, midY, staffPos) {
  if (staffPos >= 6) {
    for (let p = 6; p <= staffPos; p += 2) {
      const ly = midY - p * 5;
      g.appendChild(el("line", { x1: nx - 8.5, y1: ly, x2: nx + 8.5, y2: ly, stroke: "#3f3f46", "stroke-width": 1.05 }));
    }
  } else if (staffPos <= -6) {
    for (let p = -6; p >= staffPos; p -= 2) {
      const ly = midY - p * 5;
      g.appendChild(el("line", { x1: nx - 8.5, y1: ly, x2: nx + 8.5, y2: ly, stroke: "#3f3f46", "stroke-width": 1.05 }));
    }
  }
}

export function drawFlagDown(g, sx, botY, doubleFlag, color = "#111") {
  const flagPath = (y0) => el("path", {
    d: `M ${sx} ${y0} C ${sx + 1.8} ${y0 - 6.5}, ${sx + 11} ${y0 - 9.5}, ${sx + 8.8} ${y0 - 20.5}
        C ${sx + 9} ${y0 - 14}, ${sx + 3.8} ${y0 - 10}, ${sx} ${y0 - 6} Z`,
    fill: color
  });
  g.appendChild(flagPath(botY));
  if (doubleFlag) g.appendChild(flagPath(botY - 7));
}

export function drawTuplet(g, x1, x2, topY, withBracket) {
  const mx = (x1 + x2) / 2;
  if (!withBracket) {
    g.appendChild(el("text", {
      x: mx, y: topY - 6, fill: "#111",
      "font-family": 'Georgia, "Times New Roman", serif',
      "font-style": "italic", "font-weight": "700", "font-size": 12.5,
      "text-anchor": "middle"
    }, "3"));
    return;
  }
  const by = topY - 10;
  const gap = 8;
  const lx = x1 - 4;
  const rx = x2 + 5;
  if (mx - gap > lx + 2) {
    g.appendChild(el("path", {
      d: `M ${lx} ${by + 5} L ${lx} ${by} L ${mx - gap} ${by}`,
      fill: "none", stroke: "#111", "stroke-width": 1.15
    }));
    g.appendChild(el("path", {
      d: `M ${mx + gap} ${by} L ${rx} ${by} L ${rx} ${by + 5}`,
      fill: "none", stroke: "#111", "stroke-width": 1.15
    }));
  }
  g.appendChild(el("text", {
    x: mx, y: by + 4, fill: "#111",
    "font-family": 'Georgia, "Times New Roman", serif',
    "font-style": "italic", "font-weight": "700", "font-size": 12,
    "text-anchor": "middle"
  }, "3"));
}

export function drawFlag(g, sx, topY, doubleFlag) {
  const flagPath = (y0) => el("path", {
    d: `M ${sx} ${y0} C ${sx + 1.8} ${y0 + 6.5}, ${sx + 11} ${y0 + 9.5}, ${sx + 8.8} ${y0 + 20.5}
        C ${sx + 9} ${y0 + 14}, ${sx + 3.8} ${y0 + 10}, ${sx} ${y0 + 6} Z`,
    fill: "#111"
  });
  g.appendChild(flagPath(topY));
  if (doubleFlag) g.appendChild(flagPath(topY + 7));
}

export function drawTie(g, x1, x2, y) {
  const mx = (x1 + x2) / 2;
  const dip = Math.min(16, Math.max(9, (x2 - x1) * 0.18));
  g.appendChild(el("path", {
    d: `M ${x1 + 2} ${y + 7.5} Q ${mx} ${y + 7.5 + dip + 2.2}, ${x2 - 2} ${y + 7.5}
        Q ${mx} ${y + 7.5 + dip - 0.6}, ${x1 + 2} ${y + 7.5} Z`,
    fill: "#111"
  }));
}

export function renderScore(svg, phrase) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const ts = TIME_SIGS[phrase.timeSig || "4/4"] || TIME_SIGS["4/4"];
  const numBars = phrase.bars.length;
  const isNarrow = window.innerWidth <= 640;
  let barsPerSystem;
  if (phrase.timeSig === "5/4") {
    // 5/4 has 25% more beats per bar: use 1 bar/line on mobile and 2-3 bars/line on desktop for clean spacing
    barsPerSystem = isNarrow ? 1 : (numBars <= 2 ? numBars : (numBars <= 4 ? 2 : 3));
  } else {
    barsPerSystem = numBars <= 2 ? numBars : (isNarrow ? 2 : 4);
  }
  const numSystems = Math.ceil(numBars / barsPerSystem);
  const W = isNarrow ? 600 : 1120;
  const hasPitch = Boolean(app.pitchMode && phrase.pitchMeta);
  const pitchFlats = hasPitch ? (phrase.pitchMeta.flats || 0) : 0;
  const keyAcc = hasPitch ? getKeySignatureAcc(phrase.pitchMeta.key) : null;
  const sysH = hasPitch ? 196 : 164;
  const H = numSystems * sysH + 10;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const leftPad = 14;
  const rightPad = 16;
  const flatsW = pitchFlats > 0 ? (pitchFlats * 9.5 + 6) : 0;
  const clefArea = 72 + flatsW; // Bass clef + flat key sig + time sig on first system
  const barLayouts = [];

  // Map target & rest feedback by (bar, beat, slot)
  const fbMap = new Map();
  for (let ti = 0; ti < phrase.targets.length; ti++) {
    const tgt = phrase.targets[ti];
    tgt._idx = ti;
    fbMap.set(`${tgt.bar}:${tgt.beat}:${tgt.slotInBeat}`, tgt);
  }
  const restFbMap = new Map();
  for (const rst of (phrase.rests || [])) {
    restFbMap.set(`${rst.bar}:${rst.beat}:${rst.slotInBeat}`, rst);
  }

  for (let sys = 0; sys < numSystems; sys++) {
    const staffTop = sys * sysH + (hasPitch ? 68 : 58);
    const midY = staffTop + 20;
    const stemTopY = midY - 35;
    const g = el("g");
    svg.appendChild(g);

    // 5 staff lines
    for (let li = 0; li < 5; li++) {
      const ly = staffTop + li * 10;
      g.appendChild(el("line", {
        x1: leftPad, y1: ly, x2: W - rightPad, y2: ly,
        stroke: "#3f3f46", "stroke-width": 1.0
      }));
    }

    // Opening barline
    g.appendChild(el("line", {
      x1: leftPad, y1: staffTop, x2: leftPad, y2: staffTop + 40,
      stroke: "#111", "stroke-width": 1.4
    }));

    // Bass or Treble clef (+ flat key signature on every system + time signature on first system)
    const activeClef = hasPitch ? (phrase.pitchMeta.clef || "bass") : "bass";
    if (activeClef === "treble") {
      drawTrebleClef(g, leftPad + 6, staffTop);
    } else {
      drawBassClef(g, leftPad + 6, staffTop);
    }
    if (pitchFlats > 0) {
      drawKeySigFlats(g, leftPad + 37, midY, pitchFlats, activeClef);
    }
    const headerW = sys === 0 ? clefArea : (42 + flatsW);
    if (sys === 0) drawTimeSig(g, leftPad + 54 + flatsW, staffTop, ts.num, ts.den);

    const sysBars = Math.min(barsPerSystem, numBars - sys * barsPerSystem);
    const usableW = (W - rightPad) - (leftPad + headerW);
    const barW = usableW / barsPerSystem;

    for (let off = 0; off < sysBars; off++) {
      const bIdx = sys * barsPerSystem + off;
      const barX0 = leftPad + headerW + off * barW;
      const barX1 = barX0 + barW;
      const innerPadL = barsPerSystem >= 4 ? 17 : (barsPerSystem === 3 ? 21 : 26);
      const innerPadR = barsPerSystem >= 4 ? 12 : (barsPerSystem === 3 ? 15 : 18);
      const innerW = barW - innerPadL - innerPadR;
      const tickX = (barTick) => barX0 + innerPadL + (barTick / ts.barTicks) * innerW;
      const slotX = (bt, slot) => tickX(bt * ts.beatTicks + slot);
      barLayouts[bIdx] = { staffTop, barX0, barX1, innerPadL, innerW, barTicks: ts.barTicks, beatsPerBar: ts.beatsPerBar, beatTicks: ts.beatTicks };

      // Highlight currently selected beat in the Custom Score Editor directly on the sheet music
      if (typeof edState !== "undefined" && edState.open && edState.selBar === bIdx) {
        const hx0 = Math.max(barX0 + 2, tickX(edState.selBeat * ts.beatTicks) - 9);
        const hx1 = Math.min(barX1 - 2, tickX((edState.selBeat + 1) * ts.beatTicks) - 5);
        g.appendChild(el("rect", {
          x: hx0, y: staffTop - 32,
          width: Math.max(18, hx1 - hx0), height: 86, rx: 6,
          fill: "rgba(37, 99, 235, 0.10)",
          stroke: "rgba(37, 99, 235, 0.55)",
          "stroke-width": 1.4,
          "stroke-dasharray": "4 2.5"
        }));
      }

      // Subtle measure number
      g.appendChild(el("text", {
        x: barX0 + 3, y: staffTop - (hasPitch ? 52 : 40),
        "font-family": "Georgia, serif", "font-size": 10.5, fill: "#9ca3af"
      }, `${bIdx + 1}`));

      // Jazz chord symbol above each bar when Pitch BETA is active
      if (hasPitch && phrase.pitchMeta.chords && phrase.pitchMeta.chords[bIdx]) {
        const chSym = phrase.pitchMeta.chords[bIdx].symbol;
        g.appendChild(el("text", {
          x: barX0 + innerPadL - 5, y: staffTop - 36,
          "font-family": 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          "font-size": 13.5, "font-weight": 800, fill: "#1e293b", "letter-spacing": "-0.02em"
        }, chSym));
      }

      // Subtle Gap Click mute-bar shading & label
      if (typeof isGapBar === "function" && isGapBar(bIdx, app.gapClick)) {
        g.appendChild(el("rect", {
          x: barX0 + 2, y: staffTop - 32,
          width: Math.max(20, barW - 4), height: 84, rx: 6,
          fill: "rgba(245, 158, 11, 0.08)",
          stroke: "rgba(245, 158, 11, 0.36)",
          "stroke-width": 1.1,
          "stroke-dasharray": "4 3"
        }));
        g.appendChild(el("text", {
          x: barX1 - 6, y: staffTop - 40,
          "font-family": "ui-monospace, Menlo, monospace", "font-size": 9.5, "font-weight": 700,
          fill: "#d97706", "text-anchor": "end"
        }, "GAP 🔇"));
      }

      // Subtle beat/click numbers above staff (toggleable: 1..clicksPerBar)
      if (app.showBeatNums) {
        for (let c = 0; c < ts.clicksPerBar; c++) {
          g.appendChild(el("text", {
            x: tickX(c * ts.clickTicks), y: staffTop - 42,
            "font-family": "ui-sans-serif, system-ui, sans-serif",
            "font-size": 10, "font-weight": 600, fill: "#a1a1aa", "text-anchor": "middle"
          }, String(c + 1)));
        }
      }

      const beats = phrase.bars[bIdx];
      const barAccState = hasPitch ? new Map() : null;
      const hideFeedback = app.blindGrade && (app.state === "COUNTIN" || app.state === "PLAY");

      // Draw each beat / compound group
      for (let bt = 0; bt < ts.beatsPerBar; bt++) {
        const events = beats[bt];
        const beatG = el("g", {
          class: "beat-fade",
          "data-fade-tick": String(bIdx * ts.barTicks + bt * ts.beatTicks)
        });
        g.appendChild(beatG);
        const beamGroups = [];
        let curBeam = [];
        const beatSingleNotes = [];
        let beatMinY = midY;

        for (const ev of events) {
          const nx = slotX(bt, ev.slot);
          if (ev.rest) {
            drawRest(beatG, ev.dur, nx, midY);
            if (curBeam.length) { beamGroups.push(curBeam); curBeam = []; }
          } else {
            const p = (hasPitch && ev.pitch) ? ev.pitch : null;
            const ny = p ? (midY - p.staffPos * 5) : midY;
            if (ny < beatMinY) beatMinY = ny;

            // Check if pitch was played wrong (AUDIO/KEY/MIDI Pitch BETA) or active in Free-Tempo mode
            const tgtMatch = fbMap.get(`${bIdx}:${bt}:${ev.slot}`);
            const isFreeActive = hasPitch && app.pitchFreeMode && !ev.tiedIn && tgtMatch && (tgtMatch._idx === app.pitchFreeIdx);
            if (isFreeActive) {
              // Crisp teal spotlight halo around the active note waiting for user input in Free-Tempo mode
              beatG.appendChild(el("circle", {
                cx: nx, cy: ny, r: 11.5,
                fill: "rgba(20, 184, 166, 0.16)",
                stroke: "#0d9488", "stroke-width": 1.8
              }));
            }
            const noteColor = (hasPitch && !hideFeedback && tgtMatch && tgtMatch.pitchOk === false)
              ? "#dc2626"
              : (hasPitch && app.pitchFreeMode && tgtMatch && tgtMatch.pitchOk === true ? "#16a34a" : "#111");

            if (p) {
              drawLedgerLines(beatG, nx, midY, p.staffPos);
              // Bar-scoped flat / natural accidental (never prints redundant key-sig flats)
              if (!ev.tiedIn) {
                const aKey = `${p.writtenOct}:${p.letter}`;
                const activeAcc = barAccState.has(aKey) ? barAccState.get(aKey) : keyAcc[p.letter];
                if (p.acc !== activeAcc) {
                  drawAccidental(beatG, nx - 12.2, ny, p.acc);
                  barAccState.set(aKey, p.acc);
                }
              }
            }

            const isBeamable = (ev.dur !== 48 && ev.dur <= 9 && ev.dur !== 8);
            if (!hasPitch) {
              // Original 1-line rhythm mode (100% preserved)
              drawNotehead(beatG, ev.dur, nx, midY, ev.art);
              if (ev.dur !== 48) {
                const sx = nx + 4.7;
                beatG.appendChild(el("line", {
                  x1: sx, y1: midY - 1.5, x2: sx, y2: stemTopY,
                  stroke: "#111", "stroke-width": 1.35
                }));
                if (isBeamable) {
                  curBeam.push({ ev, nx, ny: midY, sx, staffPos: 0, color: "#111" });
                } else if (curBeam.length) {
                  beamGroups.push(curBeam);
                  curBeam = [];
                }
              }
            } else {
              // 5-line pitched bass clef mode: defer stems on beamable runs so group stem direction is unified
              if (isBeamable) {
                curBeam.push({ ev, nx, ny, staffPos: p ? p.staffPos : 0, color: noteColor });
              } else {
                if (curBeam.length) { beamGroups.push(curBeam); curBeam = []; }
                const sDown = p ? (p.staffPos >= 0) : false;
                drawNotehead(beatG, ev.dur, nx, ny, ev.art, noteColor, sDown);
                if (ev.dur !== 48) {
                  const sx = sDown ? (nx - 4.7) : (nx + 4.7);
                  const yEnd = sDown ? (ny + 33) : (ny - 33);
                  beatG.appendChild(el("line", {
                    x1: sx, y1: sDown ? ny + 1.5 : ny - 1.5, x2: sx, y2: yEnd,
                    stroke: noteColor, "stroke-width": 1.35
                  }));
                }
                beatSingleNotes.push({ ev, nx, ny, sDown, p });
              }
              // Optional note-name (Fixed) or scale-degree (Relative/Movable-Do) learning hint
              if (app.pitchShowHints && p && !ev.tiedIn) {
                const hintY = p.staffPos >= 0 ? (ny - 11) : (ny + 16);
                const hintLabel = app.pitchRelative
                  ? getRelativeDegreeName(p.midi, phrase.pitchMeta.key)
                  : p.name;
                beatG.appendChild(el("text", {
                  x: nx, y: hintY, fill: app.pitchRelative ? "#0f766e" : "#64748b",
                  "font-family": "ui-sans-serif, system-ui, sans-serif",
                  "font-size": 9.2, "font-weight": 700, "text-anchor": "middle"
                }, hintLabel));
              }
            }
          }
        }
        if (curBeam.length) beamGroups.push(curBeam);

        // Beams or flags for each contiguous beamable run inside the beat/group
        for (const beamable of beamGroups) {
          if (!hasPitch) {
            if (beamable.length === 1) {
              const b0 = beamable[0];
              drawFlag(beatG, b0.sx, stemTopY, b0.ev.dur === 3);
            } else if (beamable.length >= 2) {
              const xFirst = beamable[0].sx - 0.65;
              const xLast = beamable[beamable.length - 1].sx + 0.65;
              beatG.appendChild(el("rect", {
                x: xFirst, y: stemTopY, width: xLast - xFirst, height: 4.5, fill: "#111"
              }));
              const connected = new Array(beamable.length).fill(false);
              const y2 = stemTopY + 7.0;
              for (let i = 0; i < beamable.length - 1; i++) {
                const a = beamable[i], b = beamable[i + 1];
                if (a.ev.dur === 3 && b.ev.dur === 3 && a.ev.slot + a.ev.dur === b.ev.slot) {
                  beatG.appendChild(el("rect", {
                    x: a.sx - 0.65, y: y2, width: (b.sx - a.sx) + 1.3, height: 4.0, fill: "#111"
                  }));
                  connected[i] = true;
                  connected[i + 1] = true;
                }
              }
              for (let i = 0; i < beamable.length; i++) {
                const item = beamable[i];
                if (item.ev.dur === 3 && !connected[i]) {
                  const stubW = 9.5;
                  const sx = i < beamable.length - 1 ? item.sx - 0.65 : item.sx - stubW + 0.65;
                  beatG.appendChild(el("rect", {
                    x: sx, y: y2, width: stubW, height: 4.0, fill: "#111"
                  }));
                }
              }
            }
          } else {
            // Pitched 5-line beamable group: unified stem direction based on average staff position
            const avgPos = beamable.reduce((s, it) => s + it.staffPos, 0) / beamable.length;
            const sDown = avgPos >= 0;
            for (const it of beamable) {
              drawNotehead(beatG, it.ev.dur, it.nx, it.ny, it.ev.art, it.color, sDown);
              it.sx = sDown ? (it.nx - 4.7) : (it.nx + 4.7);
            }
            if (beamable.length === 1) {
              const b0 = beamable[0];
              const yEnd = sDown ? (b0.ny + 33) : (b0.ny - 33);
              beatG.appendChild(el("line", {
                x1: b0.sx, y1: sDown ? b0.ny + 1.5 : b0.ny - 1.5, x2: b0.sx, y2: yEnd,
                stroke: b0.color, "stroke-width": 1.35
              }));
              if (sDown) drawFlagDown(beatG, b0.sx, yEnd, b0.ev.dur === 3, b0.color);
              else drawFlag(beatG, b0.sx, yEnd, b0.ev.dur === 3);
            } else {
              const beamY = sDown
                ? Math.max(midY + 14, Math.max(...beamable.map(it => it.ny)) + 29)
                : Math.min(midY - 14, Math.min(...beamable.map(it => it.ny)) - 29);
              for (const it of beamable) {
                beatG.appendChild(el("line", {
                  x1: it.sx, y1: sDown ? it.ny + 1.5 : it.ny - 1.5, x2: it.sx, y2: beamY,
                  stroke: it.color, "stroke-width": 1.35
                }));
              }
              const xFirst = beamable[0].sx - 0.65;
              const xLast = beamable[beamable.length - 1].sx + 0.65;
              const mainY = sDown ? (beamY - 4.5) : beamY;
              beatG.appendChild(el("rect", {
                x: xFirst, y: mainY, width: xLast - xFirst, height: 4.5, fill: "#111"
              }));
              const connected = new Array(beamable.length).fill(false);
              const y2 = sDown ? (beamY - 11.5) : (beamY + 7.0);
              for (let i = 0; i < beamable.length - 1; i++) {
                const a = beamable[i], b = beamable[i + 1];
                if (a.ev.dur === 3 && b.ev.dur === 3 && a.ev.slot + a.ev.dur === b.ev.slot) {
                  beatG.appendChild(el("rect", {
                    x: a.sx - 0.65, y: y2, width: (b.sx - a.sx) + 1.3, height: 4.0, fill: "#111"
                  }));
                  connected[i] = true;
                  connected[i + 1] = true;
                }
              }
              for (let i = 0; i < beamable.length; i++) {
                const item = beamable[i];
                if (item.ev.dur === 3 && !connected[i]) {
                  const stubW = 9.5;
                  const sx = i < beamable.length - 1 ? item.sx - 0.65 : item.sx - stubW + 0.65;
                  beatG.appendChild(el("rect", {
                    x: sx, y: y2, width: stubW, height: 4.0, fill: "#111"
                  }));
                }
              }
            }
          }
        }

        // Tuplet numerals / brackets: 1-beat 8th triplets ("8t") and 2-beat quarter triplets ("4t")
        const tupTopY = hasPitch ? Math.min(stemTopY, beatMinY - 22) : stemTopY;
        if (events.length && events.some(e => e.tuplet === "8t")) {
          const xStart = slotX(bt, events[0].slot) + (events[0].rest ? 0 : 4.7);
          const lastEv = events[events.length - 1];
          const xEnd = slotX(bt, lastEv.slot) + (lastEv.rest ? 4 : 4.7);
          const allBeamed3 = !hasPitch && beamGroups.length === 1 && beamGroups[0].length === 3 && !events.some(e => e.rest);
          drawTuplet(beatG, xStart, xEnd, tupTopY, !allBeamed3);
        }
        if (events.length && events[0].tuplet === "4t" && events[0].slot === 0 && bt + 1 < ts.beatsPerBar) {
          const nextEvents = beats[bt + 1];
          const lastSlot = nextEvents.length ? nextEvents[nextEvents.length - 1].slot : 4;
          const xStart = slotX(bt, 0) + 4.7;
          const xEnd = slotX(bt + 1, lastSlot) + 4.7;
          drawTuplet(beatG, xStart, xEnd, tupTopY, true);
        }

        // Cross-beat tie
        if (bt > 0 && beats[bt - 1].length && events.length) {
          const prevEv = beats[bt - 1][beats[bt - 1].length - 1];
          const currEv = events[0];
          if (prevEv.tiedOut && currEv.tiedIn) {
            const tieY = (hasPitch && currEv.pitch) ? (midY - currEv.pitch.staffPos * 5) : midY;
            drawTie(beatG, slotX(bt - 1, prevEv.slot), slotX(bt, currEv.slot), tieY);
          }
        }

        // Feedback markers beneath noteheads & rests (hidden during take when blindGrade is ON)
        const fbBaseY = staffTop + (hasPitch ? 82 : 59);
        for (const ev of events) {
          if (hideFeedback) break;
          if (ev.rest) {
            const rst = restFbMap.get(`${bIdx}:${bt}:${ev.slot}`);
            if (rst && rst.error) {
              const nx = slotX(bt, ev.slot);
              const fbY = fbBaseY;
              const bg = el("rect", {
                x: nx - 9, y: midY - 16, width: 18, height: 32, rx: 4,
                fill: "rgba(220, 38, 38, 0.14)"
              });
              g.appendChild(bg);
              const rNode = el("text", {
                x: nx, y: fbY, fill: "#dc2626",
                "font-size": 14, "font-weight": 800, "text-anchor": "middle",
                "font-family": "ui-sans-serif, system-ui, sans-serif"
              }, "×");
              rNode.appendChild(el("title", {}, rst.errorKind === "HIT" ? t("restHitTip") : t("restRingTip")));
              g.appendChild(rNode);
            } else if (rst && rst.passed) {
              const nx = slotX(bt, ev.slot);
              const fbY = fbBaseY;
              const rNode = el("text", {
                x: nx, y: fbY, fill: "#16a34a",
                "font-size": 13, "font-weight": 800, "text-anchor": "middle",
                "font-family": "ui-sans-serif, system-ui, sans-serif"
              }, "★");
              rNode.appendChild(el("title", {}, t("restPassTip")));
              g.appendChild(rNode);
            }
            continue;
          }
          if (ev.tiedIn) continue;
          const tgt = fbMap.get(`${bIdx}:${bt}:${ev.slot}`);
          if (!tgt) continue;
          const nx = slotX(bt, ev.slot);
          const fbY = fbBaseY;
          let sym = "", color = "";
          if (hasPitch && app.pitchFreeMode && tgt.pitchOk !== null) {
            if (tgt.pitchOk === true) {
              sym = tgt.hadWrongTry ? "✓" : "★";
              color = tgt.hadWrongTry ? "#d97706" : "#16a34a";
            } else {
              sym = "×";
              color = "#dc2626";
            }
          } else if (tgt.hit && tgt.errMs !== null) {
            const tw = getTimingThresholds(app.bpm);
            const ae = Math.abs(tgt.errMs);
            if (ae <= tw.tight) { sym = "★"; color = "#16a34a"; }
            else if (ae <= tw.ok) { sym = tgt.errMs > 0 ? "+" : "−"; color = "#d97706"; }
            else { sym = tgt.errMs > 0 ? ">" : "<"; color = "#dc2626"; }
            // In Pitch BETA (AUDIO/KEY/MIDI), if pitch was wrong, override color to crimson and show played note tag
            if (hasPitch && tgt.pitchOk === false) {
              color = "#dc2626";
            }
          } else if (tgt.missed) {
            sym = "×"; color = "#dc2626";
          }
          if (sym) {
            const tNode = el("text", {
              x: nx, y: fbY, fill: color,
              "font-size": sym === "★" ? 13 : 14,
              "font-weight": 800, "text-anchor": "middle",
              "font-family": "ui-sans-serif, system-ui, sans-serif"
            }, sym);
            if (tgt.errMs !== null) {
              const sign = tgt.errMs >= 0 ? "+" : "";
              let tip = `${sign}${tgt.errMs.toFixed(1)} ms`;
              if (hasPitch && tgt.pitch && tgt.detectedPitch) {
                tip += tgt.pitchOk
                  ? ` · Pitch ✓ (${tgt.pitch.name})`
                  : ` · Pitch ✗ (${tgt.pitch.name} ≠ ${tgt.detectedPitch})`;
              }
              tNode.appendChild(el("title", {}, tip));
            }
            g.appendChild(tNode);
          }
          if (hasPitch && tgt.pitchOk === false && tgt.detectedPitch) {
            g.appendChild(el("text", {
              x: nx, y: fbY + 11, fill: "#dc2626",
              "font-size": 9, "font-weight": 800, "text-anchor": "middle",
              "font-family": "ui-sans-serif, system-ui, sans-serif"
            }, `≠${tgt.detectedPitch}`));
          }

          // Sustain / Articulation bar beneath notehead (AUDIO sustain + staccato reverse-sustain + ghost mute check)
          if (tgt.hit && tgt.sustainStatus) {
            const endTickInBar = bt * ts.beatTicks + ev.slot + tgt.durSlots;
            const rawEndX = tickX(endTickInBar);
            const spanW = Math.max(12, Math.min(barX1 - 6, rawEndX) - nx - 3);
            const susY = staffTop + (hasPitch ? 96 : 67);
            const barG = el("g");
            // Expected duration track
            barG.appendChild(el("rect", {
              x: nx - 2, y: susY, width: spanW + 2, height: 4, rx: 2, fill: "#e5e7eb"
            }));
            const ratio = tgt.sustainRatio ?? 1;
            let fillColor = "#16a34a";
            let actualW = Math.max(4, Math.min(1, ratio) * (spanW + 2));
            let tipText = "";

            if (tgt.art === "staccato") {
              // Highlight ideal 50% half-value sustain zone on the track
              barG.appendChild(el("rect", {
                x: nx - 2, y: susY, width: (spanW + 2) * 0.5, height: 4, rx: 2, fill: "#cbd5e1"
              }));
              if (tgt.sustainStatus === "OK") {
                fillColor = "#16a34a";
                actualW = Math.max(4, Math.min(0.58, ratio) * (spanW + 2));
                tipText = t("stacOkTip", Math.round(ratio * 100));
              } else if (tgt.sustainStatus === "SHORT") {
                fillColor = "#d97706";
                actualW = Math.max(3, Math.min(0.26, ratio) * (spanW + 2));
                tipText = t("stacShortTip", Math.round(ratio * 100));
              } else {
                fillColor = "#dc2626";
                actualW = Math.max((spanW + 2) * 0.58, Math.min(1, ratio) * (spanW + 2));
                tipText = t("stacLongTip", Math.round(ratio * 100));
              }
            } else if (tgt.art === "ghost") {
              if (tgt.sustainStatus === "OK") {
                fillColor = "#16a34a";
                actualW = Math.max(5, Math.min(0.35, ratio) * (spanW + 2));
                tipText = t("ghostOkTip", tgt.ghostHeldMs);
              } else {
                fillColor = "#dc2626";
                actualW = Math.max(8, Math.min(1, Math.max(0.75, ratio)) * (spanW + 2));
                tipText = t("ghostRingTip", tgt.ghostHeldMs);
              }
            } else if (tgt.ghostWrongKey) {
              fillColor = "#dc2626";
              actualW = spanW + 2;
              tipText = t("ghostWrongKeyTip");
            } else {
              tipText = t("susOkTip", Math.round(ratio * 100));
              if (tgt.sustainStatus === "SHORT") {
                fillColor = "#d97706";
                actualW = Math.max(4, Math.min(0.95, ratio) * (spanW + 2));
                tipText = t("susShortTip", Math.round(ratio * 100));
              } else if (tgt.sustainStatus === "LONG") {
                fillColor = "#dc2626";
                actualW = Math.min(barX1 - nx, spanW + 8);
                tipText = t("susLongTip", Math.round(tgt.bleedMs));
              }
            }

            barG.appendChild(el("rect", {
              x: nx - 2, y: susY, width: actualW, height: 4, rx: 2, fill: fillColor
            }));
            // Subtle 50% target notch on staccato notes
            if (tgt.art === "staccato") {
              const midMarkX = nx - 2 + (spanW + 2) * 0.5;
              barG.appendChild(el("line", {
                x1: midMarkX, y1: susY - 1.5, x2: midMarkX, y2: susY + 5.5,
                stroke: "#475569", "stroke-width": 1.1
              }));
            }
            barG.appendChild(el("title", {}, tipText));
            g.appendChild(barG);
          }
        }
      }

      // Right barline (final double barline on very last bar)
      const isFinal = (bIdx === numBars - 1);
      if (isFinal) {
        g.appendChild(el("line", {
          x1: barX1 - 6.5, y1: staffTop, x2: barX1 - 6.5, y2: staffTop + 40,
          stroke: "#111", "stroke-width": 1.3
        }));
        g.appendChild(el("rect", {
          x: barX1 - 3.2, y: staffTop, width: 3.8, height: 40, fill: "#111"
        }));
      } else {
        g.appendChild(el("line", {
          x1: barX1, y1: staffTop, x2: barX1, y2: staffTop + 40,
          stroke: "#111", "stroke-width": 1.3
        }));
      }
    }
  }

  // Optional beginner guide cursor line (hidden by default; moved at 60fps in frame() when showCursor is ON)
  svg.appendChild(el("line", {
    id: "scoreCursor",
    x1: 0, y1: 0, x2: 0, y2: 0,
    stroke: "rgba(37, 99, 235, 0.58)",
    "stroke-width": 2.5,
    "stroke-linecap": "round",
    visibility: "hidden",
  }));
  app.scoreLayout = { barLayouts, barTicks: ts.barTicks };
}

