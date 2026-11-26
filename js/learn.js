// Interactive Bass Clef, 4-String Fretboard, Rhythm Duration & Warm-up Quiz Module (learn.html)
import { ensureAudioCtx, scheduleBassNote, scheduleGhostNote, scheduleClick, stopScheduledAudio } from "./audio-out.js";
import { el, drawBassClef, drawNotehead, drawRest, drawFlag } from "./engraver.js";
import { JAZZ_KEYS, BASS_FLAT_SIG_POS, FLAT_PC_NAMES, getKeySignatureAcc, spellBassMidi, midiToFreq } from "./pitch-gen.js";
import { comparePitchClass } from "./pitch-detect.js";
import { registerMidiCallbacks, startMidiInput, stopMidiInput, midiIn } from "./midi-in.js";

// Solfege names for KO/JA readability alongside English note names
const SOLFEGE_KO = ["도", "레♭", "레", "미♭", "미", "파", "솔♭", "솔", "라♭", "라", "시♭", "시"];
const SOLFEGE_JA = ["ド", "レ♭", "レ", "ミ♭", "ミ", "ファ", "ソ♭", "ソ", "ラ♭", "ラ", "シ♭", "シ"];

// Standard 4-string electric bass open strings (top-to-bottom on fretboard diagram: G2=43, D2=38, A1=33, E1=28)
const BASS_STRINGS = [
  { name: "G (1번줄)", short: "G", midi: 43 },
  { name: "D (2번줄)", short: "D", midi: 38 },
  { name: "A (3번줄)", short: "A", midi: 33 },
  { name: "E (4번줄)", short: "E", midi: 28 },
];

// Same shifted ergonomic QWERTY piano layout as main app (C = E -> e4r5ty7u8i9op, left q2w = A Bb B)
const LEARN_KEY_TO_MIDI = {
  KeyQ: 33, Digit2: 34, KeyW: 35,
  KeyE: 36, Digit4: 37, KeyR: 38, Digit5: 39, KeyT: 40,
  KeyY: 41, Digit7: 42, KeyU: 43, Digit8: 44, KeyI: 45, Digit9: 46, KeyO: 47,
  KeyP: 48,
};

const LEARN_I18N = {
  ko: {
    brandSub: "📖 기초 학습 (오선보 · 음표)",
    backHome: "← 실전 트레이너로 돌아가기",
    heroTitle: "낮은음자리표(Bass Clef) 오선보 & 음표 박자 입문",
    heroDesc: "오선보를 처음 보셔도 괜찮습니다. 아래 음표를 직접 눌러 소리와 4현 베이스 지판 위치를 확인하고, 키보드(e4r5ty7u8i9op)나 MIDI로 천천히 따라 누르며 익혀보세요.",
    sec1Title: "1. 낮은음자리표(5선보) 음정 눌러서 익히기",
    lblKey: "조표(♭)",
    playScale: "▶ 스케일 순서대로 듣기",
    mnem1Title: "📍 기준점: 4째 줄 = F (파)",
    mnem1Desc: "낮은음자리표(𝄢)의 두 점 사이에 끼인 <strong>위에서 두 번째(4째) 줄</strong>이 바로 <strong>F(파)</strong>입니다. 여기서 한 칸씩 위아래로 세면 모든 음을 읽을 수 있어요.",
    mnem2Title: "📏 줄(Lines) 아래→위: G · B · D · F · A",
    mnem2Desc: "<strong>솔 - 시 - 레 - 파 - 라</strong> (영어 암기법: <em>Good Boys Do Fine Always</em>). 줄 위에 걸친 음표 5개만 외워도 초견 속도가 2배 빨라집니다.",
    mnem3Title: "⬜ 칸(Spaces) 아래→위: A · C · E · G",
    mnem3Desc: "<strong>라 - 도 - 미 - 솔</strong> (영어 암기법: <em>All Cows Eat Grass</em>). 줄과 줄 사이 빈칸 4개의 음입니다.",
    readoutInit: "음표를 클릭하거나 키보드(e4r5ty7u8i9op)를 눌러보세요!",
    readoutSubInit: "소리 + 계이름 + 4현 베이스 지판 위치가 표시됩니다",
    readoutFmt: (sp, solf, frets) => `${sp.name} (${solf}) · ${Math.round(sp.freq)}Hz`,
    readoutFrets: (list) => list.length ? `4현 베이스 지판: ${list.join("  /  ")}` : "4현 베이스 0~12프렛 외 음역",
    sec2Title: "2. 음표 · 쉼표 박자 길이 소리로 체험하기",
    sec2Sub: "카드를 클릭하면 <strong>4박 메트로놈 클릭</strong>과 함께 해당 음표/쉼표 리듬이 실제 소리로 재생됩니다.",
    sec3Title: "3. 10문제 낮은음자리표 워밍업 퀴즈 (박자 없음)",
    sec3Desc: "시간 제한이나 메트로놈 없이 천천히 음표를 읽고 아래 버튼, 키보드(<strong>e4r5ty7u8i9op</strong>), 또는 MIDI 건반으로 눌러보세요. (옥타브 무관 정답!)",
    quizMidi: "🎹 MIDI 연결",
    quizMidiOn: "🎹 MIDI 연결됨",
    quizRestart: "↻ 새 10문제",
    quizPrompt: "이 음표는 무슨 음일까요?",
    quizProg: (cur, tot, ok) => `문제 ${cur} / ${tot} · 첫 시도 정답 ${ok}`,
    quizOk: (name, solf) => `✓ 정답! ${name} (${solf})`,
    quizWrong: (played, target) => `✗ ${played} 눌렀어요 — 다시 찾아보세요!`,
    quizDone: (ok, tot) => `🎉 10문제 완주! 첫 시도 정답 ${ok}/${tot} (${Math.round(ok / tot * 100)}%)`,
    ctaTitle: "이제 실전 초견으로 넘어가 볼까요?",
    ctaDesc: "실전 트레이너에서 <strong>⋯ 도구 → 🎼 음정 초견 BETA → 🎯 자유 템포</strong>를 켜면 재즈 코드 진행 악보로 바로 이어서 연습할 수 있습니다.",
    ctaLink: "🎸 실전 초견 트레이너 시작 →",
    rhythmTiles: [
      { id: "whole", dur: 48, rest: false, title: "온음표 (4박)", desc: "1박에 치고 4박 끝까지 길게 유지", beats: [[0, 4]] },
      { id: "half", dur: 24, rest: false, title: "2분음표 (2박)", desc: "2박씩 두 번 연주 (1·3박)", beats: [[0, 2], [2, 2]] },
      { id: "quarter", dur: 12, rest: false, title: "4분음표 (1박)", desc: "메트로놈 클릭마다 정확히 1음 (1·2·3·4)", beats: [[0, 1], [1, 1], [2, 1], [3, 1]] },
      { id: "eighth", dur: 6, rest: false, title: "8분음표 (½박)", desc: "한 박을 반으로 쪼개기 (1 & 2 & 3 & 4 &)", beats: [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]] },
      { id: "sixteenth", dur: 3, rest: false, title: "16분음표 (¼박)", desc: "한 박에 4음 (1 e & a)", beats: [[0, 0.25], [0.25, 0.25], [0.5, 0.25], [0.75, 0.25], [1, 1], [2, 0.25], [2.25, 0.25], [2.5, 0.25], [2.75, 0.25], [3, 1]] },
      { id: "triplet", dur: 4, rest: false, title: "8분 3연음 (⅓박)", desc: "한 박을 균등하게 3등분 (따-다-다)", beats: [[0, 1/3], [1/3, 1/3], [2/3, 1/3], [1, 1], [2, 1/3], [2+1/3, 1/3], [2+2/3, 1/3], [3, 1]] },
      { id: "qrest", dur: 12, rest: true, title: "4분쉼표 (1박 쉼)", desc: "2박·4박에서 손으로 줄을 깔끔히 뮤트!", beats: [[0, 0.9], [2, 0.9]] },
      { id: "stac", dur: 12, rest: false, art: "staccato", title: "스타카토 (•)", desc: "원래 음표 길이의 절반(50%)만 울리고 끊기", beats: [[0, 0.45], [1, 0.45], [2, 0.45], [3, 0.45]] },
      { id: "ghost", dur: 6, rest: false, art: "ghost", title: "고스트 노트 (×)", desc: "음정 없이 줄을 살짝 대고 '퍽' 퍼커시브 뮤트", beats: [[0, 0.5], [0.5, 0.2, true], [1, 0.5], [1.5, 0.2, true], [2, 0.5], [2.5, 0.2, true], [3, 0.5]] },
    ],
  },
  en: {
    brandSub: "📖 Learn Basics (Bass Clef & Rhythm)",
    backHome: "← Back to Trainer",
    heroTitle: "Interactive Bass Clef & Rhythm Note Values Guide",
    heroDesc: "New to reading sheet music? Click any note on the 5-line bass clef below to hear its bass pitch and see its 4-string fretboard positions, then try the untimed 10-note warm-up quiz via keyboard (e4r5ty7u8i9op) or MIDI.",
    sec1Title: "1. Interactive Bass Clef Explorer (Click or Press Keys)",
    lblKey: "Key (♭)",
    playScale: "▶ Play Scale",
    mnem1Title: "📍 Anchor: 4th Line = F",
    mnem1Desc: "The two dots of the Bass Clef (𝄢) straddle the <strong>4th line from the bottom = F</strong>. Count up or down step-by-step from F to read any note.",
    mnem2Title: "📏 Lines (Bottom→Top): G · B · D · F · A",
    mnem2Desc: "<em>Good Boys Do Fine Always</em>. Memorizing these 5 line notes doubles your bass clef sight-reading speed.",
    mnem3Title: "⬜ Spaces (Bottom→Top): A · C · E · G",
    mnem3Desc: "<em>All Cows Eat Grass</em>. The 4 spaces sitting cleanly between the staff lines.",
    readoutInit: "Click any note above or press e4r5ty7u8i9op on your keyboard!",
    readoutSubInit: "Plays real bass tone + highlights 4-string fretboard positions",
    readoutFmt: (sp) => `${sp.name}${sp.soundingOct} · ${Math.round(sp.freq)}Hz`,
    readoutFrets: (list) => list.length ? `4-String Bass Frets: ${list.join("  /  ")}` : "Outside 0–12th fret range",
    sec2Title: "2. Interactive Note & Rest Values (Hear with Metronome)",
    sec2Sub: "Click any card to hear how the note or rest aligns against <strong>4 metronome clicks</strong>.",
    sec3Title: "3. Untimed 10-Note Bass Clef Warm-up Quiz",
    sec3Desc: "No metronome pressure — identify each note using the buttons below, your keyboard (<strong>e4r5ty7u8i9op</strong>), or a USB MIDI keyboard (octave-agnostic!).",
    quizMidi: "🎹 Connect MIDI",
    quizMidiOn: "🎹 MIDI On",
    quizRestart: "↻ New 10 Notes",
    quizPrompt: "Which note is shown on the staff?",
    quizProg: (cur, tot, ok) => `Question ${cur} / ${tot} · First-try ${ok}`,
    quizOk: (name) => `✓ Correct! ${name}`,
    quizWrong: (played) => `✗ You played ${played} — try again!`,
    quizDone: (ok, tot) => `🎉 Done! First-try accuracy ${ok}/${tot} (${Math.round(ok / tot * 100)}%)`,
    ctaTitle: "Ready for real sight-reading?",
    ctaDesc: "Open <strong>⋯ Tools → 🎼 Pitch Sight-Read BETA → 🎯 Free Tempo</strong> in the main trainer to practice real jazz progressions.",
    ctaLink: "🎸 Open Main Trainer →",
    rhythmTiles: [
      { id: "whole", dur: 48, rest: false, title: "Whole Note (4 beats)", desc: "Ring cleanly across all 4 clicks", beats: [[0, 4]] },
      { id: "half", dur: 24, rest: false, title: "Half Note (2 beats)", desc: "Play on beats 1 & 3, sustain 2 beats each", beats: [[0, 2], [2, 2]] },
      { id: "quarter", dur: 12, rest: false, title: "Quarter Note (1 beat)", desc: "One note per metronome click (1-2-3-4)", beats: [[0, 1], [1, 1], [2, 1], [3, 1]] },
      { id: "eighth", dur: 6, rest: false, title: "8th Notes (½ beat)", desc: "Split each beat in two (1 & 2 & 3 & 4 &)", beats: [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]] },
      { id: "sixteenth", dur: 3, rest: false, title: "16th Notes (¼ beat)", desc: "Four subdivisions per beat (1 e & a)", beats: [[0, 0.25], [0.25, 0.25], [0.5, 0.25], [0.75, 0.25], [1, 1], [2, 0.25], [2.25, 0.25], [2.5, 0.25], [2.75, 0.25], [3, 1]] },
      { id: "triplet", dur: 4, rest: false, title: "8th Triplets (⅓ beat)", desc: "Three equal notes inside one beat", beats: [[0, 1/3], [1/3, 1/3], [2/3, 1/3], [1, 1], [2, 1/3], [2+1/3, 1/3], [2+2/3, 1/3], [3, 1]] },
      { id: "qrest", dur: 12, rest: true, title: "Quarter Rest (1 beat)", desc: "Mute cleanly on beats 2 & 4!", beats: [[0, 0.9], [2, 0.9]] },
      { id: "stac", dur: 12, rest: false, art: "staccato", title: "Staccato (•)", desc: "Sustain half the note value (50%), then mute", beats: [[0, 0.45], [1, 0.45], [2, 0.45], [3, 0.45]] },
      { id: "ghost", dur: 6, rest: false, art: "ghost", title: "Ghost Note (×)", desc: "Percussive muted thump with zero pitch", beats: [[0, 0.5], [0.5, 0.2, true], [1, 0.5], [1.5, 0.2, true], [2, 0.5], [2.5, 0.2, true], [3, 0.5]] },
    ],
  },
  ja: {
    brandSub: "📖 基礎学習 (ヘ音記号・音符)",
    backHome: "← トレーナーへ戻る",
    heroTitle: "ヘ音記号(Bass Clef) 五線譜 & 音符の長さ入門",
    heroDesc: "五線譜が初めてでも大丈夫。下の音符を押してベース音と4弦ベース指板を確認し、キーボード(e4r5ty7u8i9op)やMIDIで10問クイズに挑戦してみましょう。",
    sec1Title: "1. ヘ音記号(5線譜)の音を押して覚える",
    lblKey: "調号(♭)",
    playScale: "▶ スケールを順番に聴く",
    mnem1Title: "📍 基準: 第4線 = F (ファ)",
    mnem1Desc: "ヘ音記号(𝄢)の2つの点に挟まれた<strong>下から4番目の線</strong>が<strong>F(ファ)</strong>です。ここを基準に1音ずつ数えられます。",
    mnem2Title: "📏 線(Lines) 下→上: G · B · D · F · A",
    mnem2Desc: "<strong>ソ - シ - レ - ファ - ラ</strong>。線の上にある5音を覚えるだけで初見スピードが倍増します。",
    mnem3Title: "⬜ 間(Spaces) 下→上: A · C · E · G",
    mnem3Desc: "<strong>ラ - ド - ミ - ソ</strong>。線と線の間にある4音です。",
    readoutInit: "音符をクリックするかキーボード(e4r5ty7u8i9op)を押してください！",
    readoutSubInit: "音 + ドレミ + 4弦ベース指板位置を表示します",
    readoutFmt: (sp, solf) => `${sp.name} (${solf}) · ${Math.round(sp.freq)}Hz`,
    readoutFrets: (list) => list.length ? `4弦ベース指板: ${list.join("  /  ")}` : "0〜12フレット範囲外",
    sec2Title: "2. 音符・休符の長さを音で体験",
    sec2Sub: "カードをクリックすると<strong>4拍メトロノーム</strong>と一緒に実際のリズムが再生されます。",
    sec3Title: "3. 10問 ヘ音記号ウォームアップクイズ (拍なし)",
    sec3Desc: "テンポ制限なしで1音ずつ確認できます。下のボタン、キーボード(<strong>e4r5ty7u8i9op</strong>)、MIDI鍵盤に対応 (オクターブ不問)。",
    quizMidi: "🎹 MIDI接続",
    quizMidiOn: "🎹 MIDI接続済",
    quizRestart: "↻ 新しい10問",
    quizPrompt: "この音符は何の音でしょう？",
    quizProg: (cur, tot, ok) => `問題 ${cur} / ${tot} · 一発正解 ${ok}`,
    quizOk: (name, solf) => `✓ 正解！ ${name} (${solf})`,
    quizWrong: (played) => `✗ ${played} を押しました — もう一度！`,
    quizDone: (ok, tot) => `🎉 10問クリア！ 一発正解 ${ok}/${tot} (${Math.round(ok / tot * 100)}%)`,
    ctaTitle: "実戦初見トレーニングへ進みましょう！",
    ctaDesc: "メイントレーナーの <strong>⋯ ツール → 🎼 音程初見 BETA → 🎯 フリーテンポ</strong> でジャズコード進行譜面を練習できます。",
    ctaLink: "🎸 メイントレーナーを開く →",
    rhythmTiles: [
      { id: "whole", dur: 48, rest: false, title: "全音符 (4拍)", desc: "1拍目で弾き4拍目までしっかり伸ばす", beats: [[0, 4]] },
      { id: "half", dur: 24, rest: false, title: "2分音符 (2拍)", desc: "1拍目・3拍目で2拍ずつ伸ばす", beats: [[0, 2], [2, 2]] },
      { id: "quarter", dur: 12, rest: false, title: "4分音符 (1拍)", desc: "クリックごとに1音 (1・2・3・4)", beats: [[0, 1], [1, 1], [2, 1], [3, 1]] },
      { id: "eighth", dur: 6, rest: false, title: "8分音符 (½拍)", desc: "1拍を2等分 (1 & 2 & 3 & 4 &)", beats: [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]] },
      { id: "sixteenth", dur: 3, rest: false, title: "16分音符 (¼拍)", desc: "1拍を4等分 (1 e & a)", beats: [[0, 0.25], [0.25, 0.25], [0.5, 0.25], [0.75, 0.25], [1, 1], [2, 0.25], [2.25, 0.25], [2.5, 0.25], [2.75, 0.25], [3, 1]] },
      { id: "triplet", dur: 4, rest: false, title: "8分3連符 (⅓拍)", desc: "1拍を均等に3等分", beats: [[0, 1/3], [1/3, 1/3], [2/3, 1/3], [1, 1], [2, 1/3], [2+1/3, 1/3], [2+2/3, 1/3], [3, 1]] },
      { id: "qrest", dur: 12, rest: true, title: "4分休符 (1拍休む)", desc: "2拍・4拍でしっかりミュート！", beats: [[0, 0.9], [2, 0.9]] },
      { id: "stac", dur: 12, rest: false, art: "staccato", title: "スタッカート (•)", desc: "元の音価の半分(50%)で切る", beats: [[0, 0.45], [1, 0.45], [2, 0.45], [3, 0.45]] },
      { id: "ghost", dur: 6, rest: false, art: "ghost", title: "ゴーストノート (×)", desc: "音程なしのパーカッシブ・ミュート", beats: [[0, 0.5], [0.5, 0.2, true], [1, 0.5], [1.5, 0.2, true], [2, 0.5], [2.5, 0.2, true], [3, 0.5]] },
    ],
  },
};

let lang = "ko";
try {
  const saved = localStorage.getItem("rhythm_practice_lang");
  if (saved && LEARN_I18N[saved]) lang = saved;
} catch (_) {}

let activeKey = "C";
let selectedMidi = 41; // F2 (written F3 — the bass clef anchor!)
let scaleNotes = [];

// Quiz state
const quiz = {
  items: [],
  idx: 0,
  firstTryOk: 0,
  hadWrong: false,
  done: false,
};

function lt(k) {
  return LEARN_I18N[lang][k] ?? LEARN_I18N.ko[k];
}

function getDiatonicBassNotes(keyId) {
  const keyAcc = getKeySignatureAcc(keyId);
  const letterPc = [0, 2, 4, 5, 7, 9, 11];
  const notes = [];
  // Build diatonic scale from E1(28) up to C3(48)
  for (let oct = 1; oct <= 3; oct++) {
    for (let l = 0; l < 7; l++) {
      const midi = (oct + 1) * 12 + letterPc[l] + keyAcc[l];
      if (midi >= 28 && midi <= 48) {
        notes.push(spellBassMidi(midi, keyId));
      }
    }
  }
  return notes;
}

function findFretPositions(midi) {
  const res = [];
  for (const s of BASS_STRINGS) {
    const fret = midi - s.midi;
    if (fret >= 0 && fret <= 12) {
      res.push({ str: s, fret, label: `${s.short}현 ${fret}프렛` });
    }
  }
  return res;
}

function drawLedger(g, x, midY, pos) {
  if (pos >= 6) {
    for (let p = 6; p <= pos; p += 2) {
      const ly = midY - p * 5;
      g.appendChild(el("line", { x1: x - 9, y1: ly, x2: x + 9, y2: ly, stroke: "#3f3f46", "stroke-width": 1.1 }));
    }
  } else if (pos <= -6) {
    for (let p = -6; p >= pos; p -= 2) {
      const ly = midY - p * 5;
      g.appendChild(el("line", { x1: x - 9, y1: ly, x2: x + 9, y2: ly, stroke: "#3f3f46", "stroke-width": 1.1 }));
    }
  }
}

function renderExplorer() {
  const svg = document.getElementById("explorerSvg");
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  scaleNotes = getDiatonicBassNotes(activeKey);
  const flats = (JAZZ_KEYS[activeKey] || JAZZ_KEYS.C).flats;
  const staffTop = 44;
  const midY = staffTop + 20;

  // 5 staff lines
  for (let i = 0; i < 5; i++) {
    const ly = staffTop + i * 10;
    const isFLine = i === 1; // 4th line from bottom = F!
    svg.appendChild(el("line", {
      x1: 14, y1: ly, x2: 906, y2: ly,
      stroke: isFLine ? "#0d9488" : "#3f3f46",
      "stroke-width": isFLine ? 1.35 : 1.0,
      opacity: isFLine ? 0.75 : 1,
    }));
  }
  svg.appendChild(el("line", { x1: 14, y1: staffTop, x2: 14, y2: staffTop + 40, stroke: "#111", "stroke-width": 1.5 }));
  svg.appendChild(el("line", { x1: 906, y1: staffTop, x2: 906, y2: staffTop + 40, stroke: "#111", "stroke-width": 1.5 }));
  drawBassClef(svg, 20, staffTop);

  // Flat key signature
  for (let i = 0; i < flats && i < BASS_FLAT_SIG_POS.length; i++) {
    const fy = midY - BASS_FLAT_SIG_POS[i] * 5 + 5.5;
    svg.appendChild(el("text", {
      x: 54 + i * 10, y: fy, fill: "#111",
      "font-family": 'Georgia, "Times New Roman", serif', "font-size": 19
    }, "♭"));
  }

  const startX = 76 + flats * 10;
  const usableW = 890 - startX;
  const stepX = usableW / Math.max(1, scaleNotes.length);

  scaleNotes.forEach((sp, idx) => {
    const nx = startX + stepX * (idx + 0.5);
    const ny = midY - sp.staffPos * 5;
    const isSel = (sp.midi % 12) === (selectedMidi % 12) && sp.midi === selectedMidi;
    const isAnchorF = sp.letter === 3 && sp.writtenOct === 3;

    const g = el("g", { class: "note-hit-node" });
    g.appendChild(el("rect", { x: nx - 18, y: staffTop - 24, width: 36, height: 112, fill: "transparent" }));
    g.appendChild(el("circle", {
      class: "note-hover-halo", cx: nx, cy: ny, r: 12,
      fill: isSel ? "rgba(13, 148, 136, 0.22)" : "rgba(13, 148, 136, 0.12)",
      stroke: isSel ? "#0d9488" : "none", "stroke-width": 1.8,
      opacity: isSel ? 1 : 0,
    }));
    drawLedger(g, nx, midY, sp.staffPos);
    drawNotehead(g, 12, nx, ny, null, isSel ? "#0f766e" : (isAnchorF ? "#0d9488" : "#111"));

    // Note name label below staff
    g.appendChild(el("text", {
      x: nx, y: staffTop + 74,
      fill: isSel ? "#0f766e" : "#334155",
      "font-size": 12, "font-weight": isSel ? 800 : 700, "text-anchor": "middle",
      "font-family": "ui-sans-serif, system-ui, sans-serif"
    }, sp.name));
    if (lang !== "en") {
      const solf = (lang === "ja" ? SOLFEGE_JA : SOLFEGE_KO)[sp.pc];
      g.appendChild(el("text", {
        x: nx, y: staffTop + 89,
        fill: "#64748b", "font-size": 10.5, "font-weight": 600, "text-anchor": "middle",
        "font-family": "ui-sans-serif, system-ui, sans-serif"
      }, solf));
    }
    g.addEventListener("click", () => selectExplorerNote(sp.midi, true));
    svg.appendChild(g);
  });
}

function renderFretboard(midi) {
  const svg = document.getElementById("fretboardSvg");
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const leftX = 58;
  const rightX = 898;
  const frets = 12;
  const fretW = (rightX - leftX) / frets;
  const strYs = [22, 44, 66, 88];

  // Fret inlays (3, 5, 7, 9, 12)
  for (const f of [3, 5, 7, 9, 12]) {
    const cx = leftX + (f - 0.5) * fretW;
    if (f === 12) {
      svg.appendChild(el("circle", { cx, cy: 33, r: 4, fill: "#475569" }));
      svg.appendChild(el("circle", { cx, cy: 77, r: 4, fill: "#475569" }));
    } else {
      svg.appendChild(el("circle", { cx, cy: 55, r: 4.5, fill: "#475569" }));
    }
  }
  // Nut + Frets
  svg.appendChild(el("line", { x1: leftX, y1: 16, x2: leftX, y2: 94, stroke: "#f8fafc", "stroke-width": 4.5 }));
  for (let f = 1; f <= frets; f++) {
    const x = leftX + f * fretW;
    svg.appendChild(el("line", { x1: x, y1: 18, x2: x, y2: 92, stroke: "#64748b", "stroke-width": 1.3 }));
    svg.appendChild(el("text", {
      x: leftX + (f - 0.5) * fretW, y: 109, fill: "#94a3b8",
      "font-size": 10.5, "font-weight": 700, "text-anchor": "middle",
      "font-family": "ui-monospace, Menlo, monospace"
    }, String(f)));
  }

  // 4 Bass Strings (G, D, A, E)
  BASS_STRINGS.forEach((s, si) => {
    const y = strYs[si];
    svg.appendChild(el("line", {
      x1: leftX, y1: y, x2: rightX, y2: y,
      stroke: "#cbd5e1", "stroke-width": 1.2 + si * 0.65
    }));
    svg.appendChild(el("text", {
      x: 24, y: y + 4, fill: "#e2e8f0",
      "font-size": 12, "font-weight": 800, "text-anchor": "middle",
      "font-family": "ui-sans-serif, system-ui, sans-serif"
    }, s.short));

    // Highlight exact pitch & octave-equivalent positions on this string
    for (let f = 0; f <= frets; f++) {
      const m = s.midi + f;
      const isExact = m === midi;
      const isSamePc = (m % 12) === (midi % 12);
      if (isExact || isSamePc) {
        const cx = f === 0 ? leftX - 11 : leftX + (f - 0.5) * fretW;
        svg.appendChild(el("circle", {
          cx, cy: y, r: isExact ? 10 : 7.5,
          fill: isExact ? "#14b8a6" : "rgba(20, 184, 166, 0.35)",
          stroke: isExact ? "#ccfbf1" : "#5eead4",
          "stroke-width": isExact ? 2 : 1.2,
        }));
        svg.appendChild(el("text", {
          x: cx, y: y + 3.5, fill: "#fff",
          "font-size": isExact ? 10 : 8.5, "font-weight": 800, "text-anchor": "middle",
          "font-family": "ui-sans-serif, system-ui, sans-serif"
        }, FLAT_PC_NAMES[m % 12]));
      }
    }
  });
}

function selectExplorerNote(midi, playSound = true) {
  selectedMidi = midi;
  const sp = spellBassMidi(midi, activeKey);
  if (playSound) {
    const ctx = ensureAudioCtx();
    scheduleBassNote(ctx, ctx.currentTime, 0.65, sp.freq);
  }
  const solf = (lang === "ja" ? SOLFEGE_JA : SOLFEGE_KO)[sp.pc];
  document.getElementById("noteReadoutMain").textContent = lt("readoutFmt")(sp, solf);
  const frets = findFretPositions(midi).map(f => `${f.str.short} / ${f.fret}F`);
  document.getElementById("noteReadoutSub").textContent = lt("readoutFrets")(frets);
  renderExplorer();
  renderFretboard(midi);
}

// Section 2: Interactive Note & Rest Rhythm Tiles
function renderRhythmTiles() {
  const grid = document.getElementById("rhythmGrid");
  grid.innerHTML = "";
  const tiles = lt("rhythmTiles");
  for (const tile of tiles) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "rhythm-tile";
    const svg = el("svg", { viewBox: "0 0 120 54" });
    // Mini 1-line staff
    svg.appendChild(el("line", { x1: 12, y1: 30, x2: 108, y2: 30, stroke: "#cbd5e1", "stroke-width": 1.2 }));
    if (tile.rest) {
      drawRest(svg, tile.dur, 60, 30);
    } else if (tile.id === "triplet") {
      [34, 60, 86].forEach(x => {
        drawNotehead(svg, 6, x, 30);
        svg.appendChild(el("line", { x1: x + 4.7, y1: 28, x2: x + 4.7, y2: 8, stroke: "#111", "stroke-width": 1.3 }));
      });
      svg.appendChild(el("rect", { x: 38, y: 8, width: 53, height: 3.8, fill: "#111" }));
      svg.appendChild(el("text", { x: 64, y: 6, "font-size": 10, "font-weight": 700, "font-style": "italic", "text-anchor": "middle" }, "3"));
    } else {
      drawNotehead(svg, tile.dur, 60, 30, tile.art || null);
      if (tile.dur !== 48) {
        svg.appendChild(el("line", { x1: 64.7, y1: 28.5, x2: 64.7, y2: 6, stroke: "#111", "stroke-width": 1.35 }));
        if (tile.dur === 6) drawFlag(svg, 64.7, 6, false);
        else if (tile.dur === 3) drawFlag(svg, 64.7, 6, true);
      }
    }
    card.appendChild(svg);
    const titleEl = document.createElement("div");
    titleEl.className = "rhythm-tile-title";
    titleEl.textContent = tile.title;
    const descEl = document.createElement("div");
    descEl.className = "rhythm-tile-desc";
    descEl.textContent = tile.desc;
    card.appendChild(titleEl);
    card.appendChild(descEl);

    card.addEventListener("click", () => {
      stopScheduledAudio();
      document.querySelectorAll(".rhythm-tile.playing").forEach(n => n.classList.remove("playing"));
      card.classList.add("playing");
      const ctx = ensureAudioCtx();
      const beatSec = 60 / 80; // Comfortable 80 BPM for learning
      const t0 = ctx.currentTime + 0.06;
      for (let b = 0; b < 4; b++) {
        scheduleClick(ctx, t0 + b * beatSec, b === 0 ? 1318.51 : 880, b === 0 ? 0.30 : 0.18);
      }
      for (const [bOff, durB, isGhost] of tile.beats) {
        if (isGhost) {
          scheduleGhostNote(ctx, t0 + bOff * beatSec);
        } else {
          scheduleBassNote(ctx, t0 + bOff * beatSec, Math.max(0.08, durB * beatSec * 0.92), 73.42);
        }
      }
      window.setTimeout(() => card.classList.remove("playing"), beatSec * 4 * 1000 + 80);
    });
    grid.appendChild(card);
  }
}

// Section 3: 10-Note Untimed Warm-up Quiz
function startQuiz() {
  const pool = getDiatonicBassNotes(activeKey);
  quiz.items = [];
  let prev = null;
  for (let i = 0; i < 10; i++) {
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (prev && pick.midi === prev.midi && pool.length > 1) {
      pick = pool[(pool.indexOf(pick) + 2) % pool.length];
    }
    quiz.items.push(pick);
    prev = pick;
  }
  quiz.idx = 0;
  quiz.firstTryOk = 0;
  quiz.hadWrong = false;
  quiz.done = false;
  document.getElementById("quizStatus").style.color = "#111827";
  document.getElementById("quizStatus").textContent = lt("quizPrompt");
  renderQuiz();
}

function renderQuiz() {
  const progEl = document.getElementById("quizProgress");
  progEl.textContent = lt("quizProg")(Math.min(quiz.idx + 1, quiz.items.length), quiz.items.length, quiz.firstTryOk);

  const svg = document.getElementById("quizSvg");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const staffTop = 34;
  const midY = staffTop + 20;
  const flats = (JAZZ_KEYS[activeKey] || JAZZ_KEYS.C).flats;

  for (let i = 0; i < 5; i++) {
    svg.appendChild(el("line", { x1: 12, y1: staffTop + i * 10, x2: 248, y2: staffTop + i * 10, stroke: "#3f3f46", "stroke-width": 1.1 }));
  }
  drawBassClef(svg, 16, staffTop);
  for (let i = 0; i < flats && i < BASS_FLAT_SIG_POS.length; i++) {
    svg.appendChild(el("text", {
      x: 50 + i * 10, y: midY - BASS_FLAT_SIG_POS[i] * 5 + 5.5, fill: "#111",
      "font-family": 'Georgia, "Times New Roman", serif', "font-size": 19
    }, "♭"));
  }

  const cur = quiz.items[Math.min(quiz.idx, quiz.items.length - 1)];
  if (cur) {
    const nx = 164;
    const ny = midY - cur.staffPos * 5;
    drawLedger(svg, nx, midY, cur.staffPos);
    drawNotehead(svg, 24, nx, ny, null, quiz.done ? "#16a34a" : "#111");
  }
}

function buildQuizButtons() {
  const wrap = document.getElementById("quizBtns");
  wrap.innerHTML = "";
  const seenPc = new Set();
  const pool = getDiatonicBassNotes(activeKey);
  const uniqueNotes = [];
  for (const sp of pool) {
    if (!seenPc.has(sp.pc)) {
      seenPc.add(sp.pc);
      uniqueNotes.push(sp);
    }
  }
  uniqueNotes.sort((a, b) => a.letter - b.letter);
  for (const sp of uniqueNotes) {
    const btn = document.createElement("button");
    btn.type = "button";
    const solf = (lang === "ja" ? SOLFEGE_JA : SOLFEGE_KO)[sp.pc];
    btn.textContent = lang === "en" ? sp.name : `${sp.name} (${solf})`;
    btn.dataset.pc = String(sp.pc);
    btn.addEventListener("click", () => checkQuizAnswer(sp.midi, btn));
    wrap.appendChild(btn);
  }
}

function checkQuizAnswer(midi, btnEl = null) {
  if (quiz.done) {
    startQuiz();
    return;
  }
  const cur = quiz.items[quiz.idx];
  if (!cur) return;
  const ctx = ensureAudioCtx();
  scheduleBassNote(ctx, ctx.currentTime, 0.35, midiToFreq(midi));

  const cmp = comparePitchClass(midi, cur.midi, 45);
  const statusEl = document.getElementById("quizStatus");
  if (cmp.ok) {
    if (!quiz.hadWrong) quiz.firstTryOk += 1;
    const solf = (lang === "ja" ? SOLFEGE_JA : SOLFEGE_KO)[cur.pc];
    statusEl.style.color = "#16a34a";
    statusEl.textContent = lt("quizOk")(cur.name, solf);
    if (btnEl) {
      btnEl.classList.add("q-ok");
      window.setTimeout(() => btnEl.classList.remove("q-ok"), 260);
    }
    quiz.idx += 1;
    quiz.hadWrong = false;
    if (quiz.idx >= quiz.items.length) {
      quiz.done = true;
      statusEl.textContent = lt("quizDone")(quiz.firstTryOk, quiz.items.length);
    }
    renderQuiz();
  } else {
    quiz.hadWrong = true;
    statusEl.style.color = "#dc2626";
    statusEl.textContent = lt("quizWrong")(cmp.detectedName, cur.name);
    if (btnEl) {
      btnEl.classList.add("q-err");
      window.setTimeout(() => btnEl.classList.remove("q-err"), 280);
    }
  }
}

function applyLearnLang(nextLang) {
  if (!LEARN_I18N[nextLang]) return;
  lang = nextLang;
  try { localStorage.setItem("rhythm_practice_lang", lang); } catch (_) {}
  document.documentElement.lang = lang;
  document.getElementById("learnLangSelect").value = lang;

  document.getElementById("lblBrandSub").textContent = lt("brandSub");
  document.getElementById("lnkBackHome").textContent = lt("backHome");
  document.getElementById("heroTitle").textContent = lt("heroTitle");
  document.getElementById("heroDesc").textContent = lt("heroDesc");
  document.getElementById("sec1Title").textContent = lt("sec1Title");
  document.getElementById("lblLearnKey").textContent = lt("lblKey");
  document.getElementById("btnLearnPlayScale").textContent = lt("playScale");
  document.getElementById("mnem1Title").textContent = lt("mnem1Title");
  document.getElementById("mnem1Desc").innerHTML = lt("mnem1Desc");
  document.getElementById("mnem2Title").textContent = lt("mnem2Title");
  document.getElementById("mnem2Desc").innerHTML = lt("mnem2Desc");
  document.getElementById("mnem3Title").textContent = lt("mnem3Title");
  document.getElementById("mnem3Desc").innerHTML = lt("mnem3Desc");
  document.getElementById("sec2Title").textContent = lt("sec2Title");
  document.getElementById("sec2Sub").innerHTML = lt("sec2Sub");
  document.getElementById("sec3Title").textContent = lt("sec3Title");
  document.getElementById("sec3Desc").innerHTML = lt("sec3Desc");
  document.getElementById("btnQuizMidi").textContent = midiIn.active ? lt("quizMidiOn") : lt("quizMidi");
  document.getElementById("btnQuizRestart").textContent = lt("quizRestart");
  document.getElementById("ctaTitle").textContent = lt("ctaTitle");
  document.getElementById("ctaDesc").innerHTML = lt("ctaDesc");
  document.getElementById("ctaLink").textContent = lt("ctaLink");

  renderExplorer();
  renderFretboard(selectedMidi);
  renderRhythmTiles();
  buildQuizButtons();
  renderQuiz();
}

// Events
document.getElementById("learnLangSelect").addEventListener("change", (e) => applyLearnLang(e.target.value));
document.getElementById("learnKeySelect").addEventListener("change", (e) => {
  activeKey = e.target.value;
  renderExplorer();
  buildQuizButtons();
  startQuiz();
});
document.getElementById("btnLearnPlayScale").addEventListener("click", () => {
  stopScheduledAudio();
  const ctx = ensureAudioCtx();
  const t0 = ctx.currentTime + 0.05;
  scaleNotes.forEach((sp, idx) => {
    scheduleBassNote(ctx, t0 + idx * 0.34, 0.30, sp.freq);
    window.setTimeout(() => selectExplorerNote(sp.midi, false), idx * 340 + 40);
  });
});
document.getElementById("btnQuizRestart").addEventListener("click", startQuiz);
document.getElementById("btnQuizMidi").addEventListener("click", async () => {
  if (midiIn.active) {
    stopMidiInput();
  } else {
    await startMidiInput();
  }
  document.getElementById("btnQuizMidi").textContent = midiIn.active ? lt("quizMidiOn") : lt("quizMidi");
});

// Keyboard (e4r5ty7u8i9op) & MIDI drive BOTH the explorer readout and active quiz!
window.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  const midi = LEARN_KEY_TO_MIDI[e.code];
  if (Number.isFinite(midi)) {
    e.preventDefault();
    selectExplorerNote(midi, false);
    checkQuizAnswer(midi);
  }
});

registerMidiCallbacks({
  onNoteOn: (midiNote) => {
    const playMidi = midiNote < 28 ? midiNote + 12 : (midiNote > 48 ? midiNote - 12 : midiNote);
    selectExplorerNote(playMidi, false);
    checkQuizAnswer(midiNote);
  },
  onStatusChange: () => {
    document.getElementById("btnQuizMidi").textContent = midiIn.active ? lt("quizMidiOn") : lt("quizMidi");
  },
});

// Boot
applyLearnLang(lang);
selectExplorerNote(41, false);
startQuiz();
