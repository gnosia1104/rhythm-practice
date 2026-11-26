// -------------------------------------------------------------------------
// 0. Internationalization (KO / EN / JA)
// -------------------------------------------------------------------------
export const I18N = {
  ko: {
    btnStart: "▶ 시작 / 재시도",
    btnDockStart: "▶ 시작",
    btnStop: "■ 정지",
    btnNew: "새 악보",
    btnDockNew: "새 악보",
    btnDemo: "♪ 정답 듣기",
    lblLevel: "난이도",
    lvBtns: {
      1: "Lv1 · 정박 & 쉼표 기초",
      2: "Lv2 · 정박 8분 입문",
      3: "Lv3 · 8분 엇박 & 점4분",
      4: "Lv4 · 8분 싱코페이션",
      5: "Lv5 · 16분음표 기초",
      6: "Lv6 · 16분음표 심화",
    },
    tripletsOff: "3연음 OFF",
    triplets8: "3연음: 8분",
    triplets2b: "3연음: +2박",
    staccatoOn: "• 스타카토 ON",
    staccatoOff: "• 스타카토 OFF",
    ghostOn: "× 고스트 ON",
    ghostOff: "× 고스트 OFF",
    stacOkTip: (p) => `스타카토 ${p}% (양호 — 절반 길이 유지 후 깔끔히 컷)`,
    stacShortTip: (p) => `스타카토 ${p}% (너무 짧음 — 표기 길이의 절반(약 50%)만큼 유지하세요)`,
    stacLongTip: (p) => `스타카토 ${p}% (너무 긺 — 표기 길이의 절반(50%)에서 끊으세요)`,
    ghostOkTip: (ms) => ms != null ? `고스트 뮤트 양호 (${ms}ms 컷)` : "고스트 뮤트 양호 (×)",
    ghostRingTip: (ms) => ms != null ? `고스트 실패 (${ms}ms 울림 — 왼손 뮤트 퍼커시브로 치세요)` : "고스트 실패 — F/D 키(뮤트)로 입력하세요",
    ghostWrongKeyTip: "일반 음표에 고스트 키(F/D)를 입력했습니다",
    padGhostSub: "뮤트 · F/D",
    barsLabels: { 2: "2마디", 4: "4마디 (1줄)", 8: "8마디 (2줄)", 12: "12마디 (3줄)", 16: "16마디 (4줄)", 32: "32마디 (8줄)" },
    metroOn: "🔊 메트로놈 ON",
    metroOff: "🔇 메트로놈 OFF",
    beatsOn: "박자표기 ON",
    beatsOff: "박자표기 OFF",
    cursorOn: "커서 ON",
    cursorOff: "커서 OFF",
    gradeLive: "채점: 즉시",
    gradeEnd: "채점: 완료후",
    inputPrefix: "입력",
    btnInKey: "⌨️ 키",
    btnInAudio: "🎤 오디오",
    btnPad: "👆 패드",
    lblClickVol: "🔊 클릭",
    btnPrint: "🖨 PDF",
    btnSyncCal: "⏱ 보정",
    btnTour: "🧭 튜토리얼",
    btnGuide: "❓ 설명",
    tourPrev: "이전",
    tourNext: "다음 →",
    tourSkip: "건너뛰기",
    tourDone: "🎸 바로 시작!",
    tourWelcomeChips: ["⌨️ 키보드 (Space/J/K)", "📱 모바일 터치 패드", "🎸 실제 베이스 (오디오 입력)"],
    tourSteps: [
      {
        target: null,
        title: "🎸 Rhythm Sight-Reader에 오신 걸 환영합니다!",
        body: "설치 없이 브라우저에서 바로 연습하는 무료 베이스 · 리듬 초견 트레이너입니다. 30초 만에 핵심 기능을 한눈에 둘러볼까요? (언제든 상단 🧭 튜토리얼로 다시 볼 수 있어요.)",
      },
      {
        target: ".sheet-paper",
        title: "🎼 악보를 읽고 바로 연주해 보세요",
        body: "▶ 시작(Enter 또는 Space)을 누르면 1마디 카운트인 후 연주가 시작됩니다. 음표에 맞춰 Space / J / K(또는 모바일 터치 패드 · 실제 베이스)를 치고, 쉼표는 조용히 넘기세요. ♪ 정답 듣기(P)로 먼저 리듬을 들어볼 수도 있습니다.",
      },
      {
        target: ".status-strip",
        title: "🟢 메트로놈 LED & 실시간 타이밍 판정",
        body: "1박은 초록, 나머지 박은 노랑 LED가 깜빡입니다. ±35ms 이내는 초록(★ TIGHT), ±80ms는 노랑, 그 이상은 빨강으로 채점됩니다. 실전 감각을 키우려면 🔊 메트로놈 OFF나 채점: 완료후도 활용해 보세요!",
      },
      {
        target: "#btnDiffMenu",
        title: "🎚️ 6단계 난이도 & 3연음 · 스타카토 · 고스트",
        body: "Lv1 정박 기초부터 Lv6 16분음표 심화까지 단계별로 연습하고, 3연음 · • 스타카토(짧게 끊기) · × 고스트 노트(F/D 키)와 4/4·3/4·2/4·5/4·6/8 박자표를 자유롭게 조합할 수 있습니다.",
      },
      {
        target: "#inputGroup",
        title: "🎤 키보드 · 터치 패드 · 실제 베이스 연결",
        body: "⌨️ 키 · 🎤 오디오 · 👆 패드 3종 독립 토글로 원하는 입력을 자유롭게 조합하세요. 🎤 오디오를 켜면 오디오 인터페이스나 마이크를 통해 실제 베이스 연주(어택·서스테인·쉼표 뮤트)를 채점합니다. 지연이 느껴지면 ⋯ 도구 → ⏱ 보정(16박)으로 맞추세요.",
      },
      {
        target: "#btnDaily",
        title: "🏆 데일리 챌린지 · 에디터 · 점수 자랑하기",
        body: "매일 같은 악보로 도전하는 🏆 데일리(4/4)와 🔥 데일리+(변박), 직접 악보를 찍어 링크로 공유하는 ✏️ 에디터까지! 연주를 마치면 S+~C 랭크와 🖼️ 이미지 자랑 카드로 기록을 공유해 보세요.",
      },
    ],
    btnDaily: "🏆 데일리",
    btnDailyPlus: "🔥 데일리+",
    btnEditor: "✏️ 에디터",
    btnTechMenu: "🎼 리듬 옵션",
    btnOptsMenu: "⚙️ 연습 옵션",
    diffPanelTitle: "난이도 & 연습 설정",
    diffSecScore: "악보 · 박자 · 마디",
    btnToolsMenu: "⋯ 도구",
    toolsSecCreate: "제작 · 훈련",
    toolsSecUtil: "보정 · 출력",
    toolsSecHelp: "안내",
    btnDrill: "🧪 특수훈련",
    drillTitle: "🧪 특수 훈련",
    drillGapLbl: "🔇 갭 클릭",
    drillGapOpts: ["OFF", "1+1 (1 ON · 1 무음)", "2+2 (2 ON · 2 무음)", "1+3 (1 ON · 3 무음)"],
    drillFadeLbl: "👻 시야 방해",
    drillFadeOpts: ["OFF", "1박 전 숨김", "2박 전 숨김"],
    drillRushOff: "⚡ BPM 러쉬 OFF",
    drillRushOn: "⚡ BPM 러쉬 ON",
    drillRushBest: (bpm, rnd) => `최고 ${bpm} BPM (${rnd}R)`,
    drillReset: "초기화",
    drillIdleMsg: "실험적 특수 초견 훈련(베타): 갭 클릭(내적 박자), 시야 방해(선독 강제), BPM 러쉬(통과 시 +5 BPM 가속)를 조합해 보세요.",
    statusGapMute: "🔇 GAP 구간 — 내적 박자 유지!",
    drillGapResult: (acc, hits, total, mean) => `🔇 GAP 구간 성적: ${hits}/${total} (${acc.toFixed(0)}%) · 평균 ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}ms`,
    drillRushClear: (rnd, acc, nextBpm) => `⚡ R${rnd} CLEAR (${acc.toFixed(0)}%)! → ${nextBpm} BPM 자동 시작 (Esc 중지)`,
    drillRushFail: (rnd, peak, acc, minAcc) => `💥 RUSH 종료! ${rnd}라운드 클리어 · 최고 ${peak} BPM (${acc.toFixed(0)}% < ${minAcc}%)`,
    drillRushBadge: (rnd, nextBpm) => `⚡ R${rnd} CLEAR → ${nextBpm}BPM`,
    btnShareUrl: "🔗 공유",
    btnShareCopied: "✓ 복사됨!",
    btnShareResult: "📋 텍스트 자랑",
    btnBragCard: "🖼️ 이미지 자랑",
    bragSaved: "✓ 카드 저장됨!",
    edTitle: "✏️ 커스텀 악보 에디터",
    edBarsLbl: (n) => `${n}마디`,
    edImportCur: "현재 악보 가져오기",
    edClear: "초기화",
    edCopyUrl: "🔗 커스텀 링크 복사",
    edLoadCode: "📥 코드 불러오기",
    edCodePlaceholder: "커스텀 코드 또는 공유 URL 붙여넣기...",
    edDefaultMsg: "악보 위 박자(파란 박스)를 직접 클릭하거나 위 박자 버튼을 고른 뒤, 아래 리듬 아이콘을 눌러 채우세요.",
    edTiePrev: "⌒ 앞 박과 타이",
    edNoteHint: "음표 아티큘레이션 (클릭 전환):",
    edArtNormal: "일반",
    edArtStac: "• 스타카토",
    edArtGhost: "× 고스트",
    edCats: { basic: "기본/장음", eighth: "8분음표", sixteenth: "16분음표", triplet: "3연음", c68: "6/8 기본", c68_16: "6/8 16분" },
    edRestOnly: "쉼표 박자 (음표 없음)",
    edContBeat: "앞 박에서 이어지는 장음입니다 — 시작 박자를 선택해 편집하세요.",
    edUrlCopied: "커스텀 악보 공유 링크가 클립보드에 복사되었습니다!",
    edSeedCopied: "현재 악보 공유 링크(시드+설정)가 클립보드에 복사되었습니다!",
    edLoadedOk: "커스텀 악보를 불러왔습니다! Enter로 바로 연주해 보세요.",
    edSeedLoadedOk: (s) => `시드 ${s} (박자·난이도·마디수·BPM 포함) 불러오기 완료!`,
    edLoadFail: "유효하지 않은 시드/코드/링크입니다. 시드 코드(예: 44-L4SG-4B-80-A1B2), 커스텀 코드(C1_...), 또는 공유 URL을 입력하세요.",
    seedPrompt: "불러올 시드 코드(예: 44-L4SG-4B-80-A1B2), 커스텀 코드(C1_...), 또는 공유 URL을 입력하세요:",
    seedTooltip: "클릭해서 시드 코드 복사/입력 (박자·난이도·마디수·BPM 전부 포함)",
    dailyLoaded: (date, streak, isPlus) => `${isPlus ? "🔥 오늘의 데일리+" : "🏆 오늘의 데일리"} (${date})${streak > 0 ? ` · 연속 ${streak}일` : ""}`,
    dailyBest: (acc, tight) => `오늘 최고: ${acc}% (TIGHT ${tight})`,
    resultCopied: "✓ 결과 복사됨!",
    calTitle: "⏱ 싱크 보정",
    calStartBtn: "▶ 16박 측정",
    calStopBtn: "■ 중단",
    calResetBtn: "초기화",
    calIdleMsg: "박자가 일정하게 밀릴 때만 사용하세요 · 메트로놈 16박에 맞춰 Space/J/K 또는 베이스를 튕기면 자동 보정됩니다 (앞 4박은 준비).",
    calRunningMsg: "메트로놈에 맞춰 일정하게 탭/연주하세요 (1~4박 준비 · 5~16박 측정)...",
    calStatus: (b, n) => `싱크 보정 중  ${b} / ${n}`,
    calBadgeRunning: "보정 측정 중...",
    calApplied: (src, ms, n, spread) => `보정 완료! ${src} ${ms >= 0 ? "+" : ""}${ms}ms 자동 적용됨 (${n}/12박 측정 · 편차 ±${spread}ms)`,
    calTooFew: (n) => `입력이 부족합니다 (${n}/12박 · 최소 6박 필요) — 다시 측정해 주세요.`,
    calResetMsg: "보정값을 기본값(KEY 0ms / AUD 25ms)으로 초기화했습니다.",
    statusSub: "1박 초록 / 나머지 박 노랑 · 악보 위치 표시 없음",
    statusReady: "준비 완료 — Enter 또는 Space로 시작",
    statusGetReady: "준비하세요...",
    statusCountIn: (b, n = 4) => `카운트인  ${b} / ${n}`,
    statusDemo: "정답 베이스 미리듣기 중...",
    statusPlay: "연주 중 — 정박 메트로놈에 맞춰 입력하세요",
    statusDone: "완료! — Enter 재시도 · N 새 악보 · P 정답 듣기",
    badgeWait: "대기 중",
    badgeStopped: "정지됨",
    badgeDemo: "정답 재생 중",
    badgeCountIn: "카운트인...",
    badgeBlindPlay: "연주 중 (완료 후 공개)",
    badgeDone: (hits, total) => `결과 공개 (${hits}/${total})`,
    badgeDetected: (ch) => `[AUD Ch${ch}] 감지됨!`,
    audioTitle: "🎤 오디오 입력",
    sysDefault: "시스템 기본 입력",
    audioInputN: (n) => `오디오 입력 ${n}`,
    allChannels: (n) => `전체 채널 (${n}ch)`,
    btnReconnect: "↻ 재연결",
    btnNoiseCal: "🔇 노이즈 보정",
    btnMeasuring: "측정 중...",
    lblGain: "게인",
    lblThr: "임계값",
    lblLat: "지연보정",
    levelSilent: "무음",
    levelOff: "꺼짐",
    audioDefaultMsg: "헤드폰/오인페 라인 입력 권장 (스피커 메트로놈 유입 방지)",
    audioNoApi: "이 브라우저/환경에서는 마이크 API를 쓸 수 없습니다. HTTPS 주소(Chrome/Safari/Edge 최신 버전)에서 접속해 주세요.",
    audioBuiltinFile: (dev) => `⚠️ 현재 내장 마이크(${dev}) 연결됨 — 브라우저 주소창의 마이크 권한을 허용하고 오디오 바 드롭다운에서 인터페이스를 선택하세요 (HTTPS 접속 권장).`,
    audioBuiltinSelect: (dev) => `⚠️ 현재 내장 마이크(${dev})에 연결됨 — 위 드롭다운에서 사용할 오디오 인터페이스를 선택하세요.`,
    audioConnected: (dev, sr, ch) => `연결됨: ${dev} (${sr}kHz · ${ch}ch) — 대기 상태에서 줄을 튕겨 미터 반응을 확인하세요`,
    audioFail: (err, isFile) => `오디오 입력 연결 실패: ${err}${isFile ? " (로컬 file:// 대신 https://gnosia1104.github.io/rhythm-practice/ 에서 여세요)" : " (브라우저 주소창 마이크 권한 및 OS 개인정보 설정 확인)"}`,
    calMeasuring: "줄을 건드리지 말고 잠시 기다리세요 (바닥 노이즈 측정 중)...",
    calDone: (pct) => `노이즈 보정 완료 — 임계값 ${pct}%로 자동 설정됨`,
    tapHintHtml: `입력: <kbd>Space</kbd>/<kbd>J</kbd>/<kbd>K</kbd> (고스트 <kbd>F</kbd>/<kbd>D</kbd>) 또는 오디오 · <kbd>Enter</kbd> 시작 · <kbd>Esc</kbd> 정지 · <kbd>N</kbd> 새 악보 · <kbd>P</kbd> 정답 · <kbd>1</kbd>~<kbd>6</kbd>/<kbd>↑</kbd><kbd>↓</kbd> 난이도 · <kbd>T</kbd> 3연음 · <kbd>Q</kbd> 스타카토 · <kbd>X</kbd> 고스트 · <kbd>S</kbd> 박자표 · <kbd>L</kbd> 마디수 · <kbd>+</kbd><kbd>−</kbd> BPM · <kbd>M</kbd>/<kbd>B</kbd>/<kbd>C</kbd>/<kbd>G</kbd>/<kbd>I</kbd>`,
    legendHtml: `판정: <strong style="color:var(--green)">★ ≤35ms/쉼표통과</strong> · <strong style="color:var(--amber)">−/+ ≤80ms</strong> · <strong style="color:var(--red)">&lt;/&gt; &gt;80ms · × miss/쉼표에러</strong> · 서스테인(AUD): <strong style="color:var(--green)">▬ 양호</strong> / <strong style="color:var(--amber)">▬ 짧음</strong> / <strong style="color:var(--red)">▬ 침범</strong>`,
    summaryIdle: "연주를 마치면 타이밍 분포가 표시됩니다.",
    summaryHits: (hits, total, pct, tight, sign, mean, sd, extra, sus, restErrs) => {
      const susPart = sus && sus.total > 0 ? ` · 서스테인 ${sus.ok}/${sus.total} (짧음 ${sus.short} / 침범 ${sus.long})` : "";
      const restPart = restErrs > 0 ? ` · 쉼표에러 ${restErrs}` : "";
      return `적중 ${hits}/${total} (${pct}%) · TIGHT ${tight} · 평균 ${sign}${mean}ms · 편차 ${sd}ms · 여분 ${extra}${susPart}${restPart}`;
    },
    summaryZero: (total, extra, restErrs) => `적중 0/${total} · 여분 입력 ${extra}${restErrs > 0 ? ` · 쉼표에러 ${restErrs}` : ""}`,
    logEmpty: "아직 완료된 기록이 없습니다.",
    restHitTip: "쉼표에서 연주함 (에러)",
    restRingTip: "쉼표 구간에 음이 울림 (뮤트 필요)",
    restPassTip: "쉼표 통과 (양호)",
    susOkTip: (p) => `서스테인 ${p}% (양호)`,
    susShortTip: (p) => `서스테인 ${p}% (짧음 — 음을 더 유지하세요)`,
    susLongTip: (ms) => `서스테인 쉼표 침범 (+${ms}ms — 뮤트가 늦음)`,
    padLeftSub: "검지 · J",
    padRightSub: "중지 · K",
    guideTitle: "📖 사용 설명서 & 판정 기준 (클릭해서 펼치기)",
    guideOpen: "열기 ▾",
    guideClose: "접기 ▴",
    guideHtml: `
      <div class="guide-sec">
        <h3>1. 기본 연습 방법</h3>
        <ul>
          <li><strong>시작 / 정지</strong>: <kbd>Enter</kbd> 또는 <strong>▶ 시작</strong>을 누르면 1마디 카운트인(1박 초록 LED, 나머지 박 노랑 LED) 후 연주가 시작됩니다. 중간에 멈추려면 <kbd>Esc</kbd> 또는 <strong>■ 정지</strong>를 누르세요.</li>
          <li><strong>정답 미리듣기</strong>: <kbd>P</kbd> 또는 <strong>♪ 정답 듣기</strong>를 누르면 메트로놈에 맞춰 베이스 가이드 음(D)이 재생됩니다.</li>
          <li><strong>악보 커스터마이즈</strong>: 6단계 리듬 난이도(<kbd>1</kbd>~<kbd>6</kbd>, <kbd>↑</kbd><kbd>↓</kbd>: 정박 기초 → 정박 8분 → 8분 엇박 → 8분 싱코페이션 → 16분 기초 → 16분음표 심화)에 3연음(<kbd>T</kbd>) · 스타카토(<kbd>Q</kbd>) · 고스트(<kbd>X</kbd>)를 자유롭게 조합할 수 있습니다. 박자표(<kbd>S</kbd>), 마디 수(<kbd>L</kbd>, 2~32마디), BPM(<kbd>+</kbd>/<kbd>−</kbd>), <strong>박자표기(<kbd>B</kbd>)</strong>도 지원합니다.</li>
          <li><strong>시창(초견) · 특수 모드</strong>: 기본은 커서 없이 메트로놈과 LED만 보고 읽습니다. <strong>🔇 메트로놈 OFF(<kbd>M</kbd>)</strong> 시 카운트인 1마디만 울리고 본 연주에서는 소리·LED가 모두 꺼져 순수 내면 박자 훈련이 가능합니다. 입문용 <strong>커서(<kbd>C</kbd>)</strong>, <strong>채점: 완료후(<kbd>G</kbd>)</strong>, <strong>🏆 데일리(4/4) / 🔥 데일리+(변박)</strong>, <strong>✏️ 커스텀 에디터</strong>, 악보 우측 <strong>#시드 클릭·🔗 공유</strong>도 지원합니다.</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>2. 판정 기호 &amp; 서스테인 보는 법</h3>
        <ul>
          <li><strong style="color:var(--green)">★</strong> : 음표 정박(<code>±35ms</code> 이내) 또는 <strong>쉼표 통과</strong>(쉼표 끝까지 조용히 유지)</li>
          <li><strong style="color:var(--amber)">− / +</strong> : 약간 빠름(<code>−35~−80ms</code>) / 약간 느림(<code>+35~+80ms</code>)</li>
          <li><strong style="color:var(--red)">&lt; / &gt;</strong> : 많이 빠름(<code>&lt; −80ms</code>) / 많이 느림(<code>&gt; +80ms</code>)</li>
          <li><strong style="color:var(--red)">×</strong> : 음표를 놓침(miss) 또는 <strong>쉼표 구간에 치거나 음이 울림</strong>(쉼표 빨간 음영)</li>
          <li><strong>오디오 서스테인 바</strong>(<code>AUDIO</code>/<code>BOTH</code> 전용, 음표 아래 막대):
            <strong style="color:var(--green)">▬ 양호</strong>(충분히 유지) ·
            <strong style="color:var(--amber)">▬ 짧음</strong>(표기 길이의 62% 미만으로 빨리 끊음) ·
            <strong style="color:var(--red)">▬ 침범</strong>(뒤 쉼표까지 뮤트가 늦음)
          </li>
          <li><strong>스타카토(<code>•</code>) &amp; 고스트 노트(<code>×</code>)</strong>: <kbd>Q</kbd>(스타카토)를 켜면 음표 아래 점이 붙어 표기 길이의 <strong>절반(약 50%)만큼 유지한 뒤 깔끔히 끊었는지</strong>(너무 짧으면 노랑, 절반 넘게 길면 빨강) 채점합니다. <kbd>X</kbd>(고스트)를 켜면 <code>×</code> 데드노트가 등장하며, 오디오 모드에서는 퍼커시브 뮤트 여부를 자동 판별하고 키보드에서는 <kbd>F</kbd>/<kbd>D</kbd>(모바일은 <code>× GHOST</code> 패드)로 입력합니다.</li>
          <li>기호나 서스테인 바 위에 <strong>마우스를 올리면</strong> 정확한 <code>ms</code> 오차와 서스테인 <code>%</code> 툴팁이 표시됩니다.</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>3. 베이스 / 오디오 인터페이스 연결 팁</h3>
        <ul>
          <li><kbd>I</kbd> 키 또는 상단 <strong>🎤 오디오</strong> 토글 버튼을 켜면 오디오 인터페이스/마이크 입력이 활성화됩니다(<strong>⌨️ 키</strong>·<strong>👆 패드</strong>와 동시 사용 가능).</li>
          <li>오디오 바의 장치 목록에서 인터페이스를 고르고, 대기 상태에서 줄을 튕겨 미터와 <code>-XXdB (Ch1)</code> 반응을 확인하세요.</li>
          <li><strong>안 칠 때도 노이즈가 잡히면</strong>: 줄을 건드리지 않은 상태에서 <strong>🔇 노이즈 보정</strong>을 한 번 누르면 0.6초간 바닥 노이즈를 측정해 임계값을 자동 설정합니다.</li>
          <li><strong>미터 선 의미</strong>: 빨간선 = 어택 감지 임계값 / 파란선 = 서스테인 유지 하한선.</li>
          <li><strong>지연 보정 (⏱ 보정)</strong>: 블루투스 이어폰이나 오디오 인터페이스에서 박자가 일정하게 밀리면 툴바의 <strong>⏱ 보정</strong>을 눌러 16박 자동 측정을 실행하세요(키보드/오디오 모두 자동 저장).</li>
          <li><strong>내장 마이크만 잡힐 때</strong>: 브라우저 주소창 왼쪽 <strong>사이트 설정(마이크 권한 허용)</strong>을 확인한 뒤 오디오 바의 장치 드롭다운에서 오디오 인터페이스를 고르고 <strong>↻ 재연결</strong>을 누르세요. macOS에서는 상단 메뉴바 주황색 마이크 아이콘의 <strong>마이크 모드 → 표준</strong>(음성 분리 OFF)으로 설정해야 저음 베이스가 잘리지 않습니다.</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>4. 전체 단축키 (한글 입력 상태에서도 동작)</h3>
        <div class="shortcut-grid">
          <div><kbd>Space</kbd> / <kbd>J</kbd> / <kbd>K</kbd></div><div>리듬 입력 (대기 중엔 바로 시작)</div>
          <div><kbd>Enter</kbd> / <kbd>R</kbd></div><div>시작 / 같은 악보 재시도</div>
          <div><kbd>Esc</kbd></div><div>즉시 정지</div>
          <div><kbd>N</kbd> / <kbd>P</kbd></div><div>새 악보 생성 / 정답 베이스 듣기</div>
          <div><kbd>1</kbd>~<kbd>6</kbd> / <kbd>↑</kbd> <kbd>↓</kbd> / <kbd>T</kbd></div><div>난이도 6단계 선택 · ±1 조절 · 3연음 순환 (OFF→8분→+2박)</div>
          <div><kbd>Q</kbd> / <kbd>X</kbd> / <kbd>F</kbd> <kbd>D</kbd></div><div>스타카토 ON/OFF · 고스트 ON/OFF · 고스트 뮤트 입력</div>
          <div><kbd>S</kbd> / <kbd>L</kbd></div><div>박자표 변경 (4/4·3/4·2/4·5/4·6/8) · 마디 수 변경</div>
          <div><kbd>+</kbd> / <kbd>−</kbd></div><div>BPM ±5 조절</div>
          <div><kbd>M</kbd> / <kbd>B</kbd> / <kbd>C</kbd> / <kbd>G</kbd></div><div>메트로놈 · 박자표기 · 입문 커서 · 채점시점(즉시/완료후)</div>
          <div><kbd>I</kbd></div><div>입력 모드 전환 (KEY → AUDIO → BOTH)</div>
          <div><kbd>[</kbd> <kbd>]</kbd> / <kbd>,</kbd> <kbd>.</kbd></div><div>오디오 임계값 ±2% / 지연보정 ±5ms</div>
        </div>
      </div>`,
  },
  en: {
    btnStart: "▶ Start / Retry",
    btnDockStart: "▶ Start",
    btnStop: "■ Stop",
    btnNew: "New Score",
    btnDockNew: "Next",
    btnDemo: "♪ Play Demo",
    lblLevel: "Level",
    lvBtns: {
      1: "Lv1 · Quarter & Rest Basics",
      2: "Lv2 · Straight 8ths",
      3: "Lv3 · 8th Off-beats & Dotted",
      4: "Lv4 · 8th Syncopation",
      5: "Lv5 · 16th Basics",
      6: "Lv6 · 16th Notes Advanced",
    },
    tripletsOff: "Triplets OFF",
    triplets8: "Triplets: 8th",
    triplets2b: "Triplets: +2-Beat",
    staccatoOn: "• Staccato ON",
    staccatoOff: "• Staccato OFF",
    ghostOn: "× Ghost ON",
    ghostOff: "× Ghost OFF",
    stacOkTip: (p) => `Staccato ${p}% (Good — held ~half value & cut cleanly)`,
    stacShortTip: (p) => `Staccato ${p}% (Too short — sustain ~50% of written value before muting)`,
    stacLongTip: (p) => `Staccato ${p}% (Too long — cut off at ~50% of written value)`,
    ghostOkTip: (ms) => ms != null ? `Ghost mute OK (${ms}ms percussive)` : "Ghost mute OK (×)",
    ghostRingTip: (ms) => ms != null ? `Ghost rang out (${ms}ms — mute string with fretting hand)` : "Missed ghost — use F/D mute key",
    ghostWrongKeyTip: "Used ghost key (F/D) on a regular note",
    padGhostSub: "Mute · F/D",
    barsLabels: { 2: "2 bars", 4: "4 bars (1 line)", 8: "8 bars (2 lines)", 12: "12 bars (3 lines)", 16: "16 bars (4 lines)", 32: "32 bars (8 lines)" },
    metroOn: "🔊 Metronome ON",
    metroOff: "🔇 Metronome OFF",
    beatsOn: "Beats ON",
    beatsOff: "Beats OFF",
    cursorOn: "Cursor ON",
    cursorOff: "Cursor OFF",
    gradeLive: "Grade: Live",
    gradeEnd: "Grade: End",
    inputPrefix: "Input",
    btnInKey: "⌨️ Key",
    btnInAudio: "🎤 Audio",
    btnPad: "👆 Pad",
    lblClickVol: "🔊 Click",
    btnPrint: "🖨 PDF",
    btnSyncCal: "⏱ Sync",
    btnTour: "🧭 Tour",
    btnGuide: "❓ Guide",
    tourPrev: "Back",
    tourNext: "Next →",
    tourSkip: "Skip",
    tourDone: "🎸 Start Practicing!",
    tourWelcomeChips: ["⌨️ Keyboard (Space/J/K)", "📱 Mobile Touch Pads", "🎸 Real Bass (Audio Input)"],
    tourSteps: [
      {
        target: null,
        title: "🎸 Welcome to Rhythm Sight-Reader!",
        body: "A free browser-based bass & rhythm sight-reading trainer with zero install. Take a quick 30-second tour of the core features! (You can replay it anytime from 🧭 Tour.)",
      },
      {
        target: ".sheet-paper",
        title: "🎼 Read & Play Right Away",
        body: "Press ▶ Start (Enter or Space) for a 1-bar count-in, then tap Space / J / K (or mobile pads / real bass) on every note while staying silent on rests. Hit ♪ Demo (P) anytime to hear the exact rhythm first.",
      },
      {
        target: ".status-strip",
        title: "🟢 Metronome LED & Millisecond Grading",
        body: "Beat 1 flashes green; other beats flash amber. Within ±35ms scores green (★ TIGHT), ±80ms amber, and beyond red. Try 🔊 Metronome OFF or Grade: End when you're ready for a real sight-reading test!",
      },
      {
        target: "#btnDiffMenu",
        title: "🎚️ 6 Rhythm Levels + Triplets · Staccato · Ghost",
        body: "Progress from Lv1 Quarter Basics to Lv6 16th Notes Advanced, and mix in Triplets, • Staccato (short 50% release), × Ghost Notes (F/D keys), and 4/4 · 3/4 · 2/4 · 5/4 · 6/8 meters.",
      },
      {
        target: "#inputGroup",
        title: "🎤 Keyboard, Touch Pads, or Real Bass",
        body: "Mix and match ⌨️ Key · 🎤 Audio · 👆 Pad toggles independently. Turn on 🎤 Audio to grade real bass attacks, sustain length, and rest mutes via your audio interface or mic. Notice Bluetooth latency? Calibrate in ⋯ Tools → ⏱ Sync (16 beats).",
      },
      {
        target: "#btnDaily",
        title: "🏆 Daily Challenges, Custom Editor & Score Cards",
        body: "Tackle today's 🏆 Daily (4/4) or 🔥 Daily+ (odd meters), build & share custom grooves in ✏️ Editor, and brag about your S+–C rank with a downloadable 🖼️ Share Card PNG!",
      },
    ],
    btnDaily: "🏆 Daily",
    btnDailyPlus: "🔥 Daily+",
    btnEditor: "✏️ Editor",
    btnTechMenu: "🎼 Rhythm",
    btnOptsMenu: "⚙️ Options",
    diffPanelTitle: "Difficulty & Practice",
    diffSecScore: "Score · Meter · Bars",
    btnToolsMenu: "⋯ Tools",
    toolsSecCreate: "Create · Drills",
    toolsSecUtil: "Sync · Export",
    toolsSecHelp: "Help",
    btnDrill: "🧪 Drills",
    drillTitle: "🧪 Special Drills",
    drillGapLbl: "🔇 Gap Click",
    drillGapOpts: ["OFF", "1+1 (1 ON · 1 Mute)", "2+2 (2 ON · 2 Mute)", "1+3 (1 ON · 3 Mute)"],
    drillFadeLbl: "👻 Fade-out",
    drillFadeOpts: ["OFF", "Hide 1b ahead", "Hide 2b ahead"],
    drillRushOff: "⚡ BPM Rush OFF",
    drillRushOn: "⚡ BPM Rush ON",
    drillRushBest: (bpm, rnd) => `Best ${bpm} BPM (${rnd}R)`,
    drillReset: "Reset",
    drillIdleMsg: "Experimental sight-reading drills (Beta): mix Gap Click (internal clock), Look-ahead Fade-out, and BPM Rush (+5 BPM sudden death).",
    statusGapMute: "🔇 GAP BAR — Hold your internal clock!",
    drillGapResult: (acc, hits, total, mean) => `🔇 GAP Bars: ${hits}/${total} (${acc.toFixed(0)}%) · Mean ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}ms`,
    drillRushClear: (rnd, acc, nextBpm) => `⚡ R${rnd} CLEAR (${acc.toFixed(0)}%)! → ${nextBpm} BPM starting... (Esc to stop)`,
    drillRushFail: (rnd, peak, acc, minAcc) => `💥 RUSH OVER! ${rnd} rounds cleared · Peak ${peak} BPM (${acc.toFixed(0)}% < ${minAcc}%)`,
    drillRushBadge: (rnd, nextBpm) => `⚡ R${rnd} CLEAR → ${nextBpm}BPM`,
    btnShareUrl: "🔗 Share",
    btnShareCopied: "✓ Copied!",
    btnShareResult: "📋 Copy Text",
    btnBragCard: "🖼️ Share Card",
    bragSaved: "✓ Card Saved!",
    edTitle: "✏️ Custom Score Editor",
    edBarsLbl: (n) => `${n} ${n === 1 ? "bar" : "bars"}`,
    edImportCur: "Import Current",
    edClear: "Clear",
    edCopyUrl: "🔗 Copy Custom Link",
    edLoadCode: "📥 Load Code",
    edCodePlaceholder: "Paste custom code or shared URL...",
    edDefaultMsg: "Click any beat directly on the sheet music (blue box) or beat strip, then tap a rhythm icon below to stamp it.",
    edTiePrev: "⌒ Tie Prev",
    edNoteHint: "Note articulation (click to cycle):",
    edArtNormal: "Normal",
    edArtStac: "• Staccato",
    edArtGhost: "× Ghost",
    edCats: { basic: "Basic", eighth: "8th", sixteenth: "16th", triplet: "Triplets", c68: "6/8 Basic", c68_16: "6/8 16th" },
    edRestOnly: "Rest beat (no notes)",
    edContBeat: "Sustained from an earlier beat — select its starting beat to edit.",
    edUrlCopied: "Custom score link copied to clipboard!",
    edSeedCopied: "Shareable score link (seed + settings) copied to clipboard!",
    edLoadedOk: "Custom score loaded! Press Enter to play.",
    edSeedLoadedOk: (s) => `Loaded ${s} (meter, level, bars, BPM & toggles synced)!`,
    edLoadFail: "Invalid seed, custom code, or URL. Enter a seed code (e.g. 44-L4SG-4B-80-A1B2), C1_... code, or shared URL.",
    seedPrompt: "Enter a Seed Code (e.g. 44-L4SG-4B-80-A1B2), Custom Code (C1_...), or Shared URL:",
    seedTooltip: "Click to copy or load a full Seed Code (includes meter, level, bars & BPM)",
    dailyLoaded: (date, streak, isPlus) => `${isPlus ? "🔥 Daily+" : "🏆 Daily"} Challenge (${date})${streak > 0 ? ` · ${streak}-day streak` : ""}`,
    dailyBest: (acc, tight) => `Today's best: ${acc}% (TIGHT ${tight})`,
    resultCopied: "✓ Copied!",
    calTitle: "⏱ Sync Cal",
    calStartBtn: "▶ 16-Beat Test",
    calStopBtn: "■ Stop",
    calResetBtn: "Reset",
    calIdleMsg: "Optional — use if hits feel consistently early/late (e.g. Bluetooth or audio interface). Tap Space/J/K or pluck bass for 16 clicks (first 4 warm-up).",
    calRunningMsg: "Tap or pluck steadily on every click (beats 1–4 warm-up, 5–16 measured)...",
    calStatus: (b, n) => `Calibrating  ${b} / ${n}`,
    calBadgeRunning: "Calibrating...",
    calApplied: (src, ms, n, spread) => `Calibrated! Applied ${src} ${ms >= 0 ? "+" : ""}${ms}ms (${n}/12 taps · ±${spread}ms spread)`,
    calTooFew: (n) => `Not enough taps (${n}/12, need at least 6) — please try again.`,
    calResetMsg: "Reset offsets to defaults (KEY 0ms / AUD 25ms).",
    statusSub: "Beat 1 Green / Other beats Amber · No moving score cursor",
    statusReady: "Ready — Press Enter or Space to start",
    statusGetReady: "Get ready...",
    statusCountIn: (b, n = 4) => `Count-in  ${b} / ${n}`,
    statusDemo: "Playing demo bass...",
    statusPlay: "Playing — Follow the metronome click",
    statusDone: "Done! — Enter Retry · N New · P Demo",
    badgeWait: "Standby",
    badgeStopped: "Stopped",
    badgeDemo: "Demo playing",
    badgeCountIn: "Count-in...",
    badgeBlindPlay: "Playing (reveal at end)",
    badgeDone: (hits, total) => `Results (${hits}/${total})`,
    badgeDetected: (ch) => `[AUD Ch${ch}] Detected!`,
    audioTitle: "🎤 Audio Input",
    sysDefault: "System Default",
    audioInputN: (n) => `Audio Input ${n}`,
    allChannels: (n) => `All Channels (${n}ch)`,
    btnReconnect: "↻ Reconnect",
    btnNoiseCal: "🔇 Noise Cal",
    btnMeasuring: "Measuring...",
    lblGain: "Gain",
    lblThr: "Thresh",
    lblLat: "Latency",
    levelSilent: "Silent",
    levelOff: "Off",
    audioDefaultMsg: "Headphones / audio interface line-in recommended (avoids speaker metronome bleed)",
    audioNoApi: "Microphone API is unavailable in this browser. Please open the HTTPS site in Chrome, Safari, or Edge.",
    audioBuiltinFile: (dev) => `⚠️ Built-in mic (${dev}) active — grant microphone permission in the address bar and select your audio interface in the dropdown above (HTTPS required).`,
    audioBuiltinSelect: (dev) => `⚠️ Built-in mic (${dev}) active — select your audio interface in the dropdown above.`,
    audioConnected: (dev, sr, ch) => `Connected: ${dev} (${sr}kHz · ${ch}ch) — pluck a string while idle to check the meter`,
    audioFail: (err, isFile) => `Audio input failed: ${err}${isFile ? " (open https://gnosia1104.github.io/rhythm-practice/ instead of file://)" : " (check browser & OS microphone permissions)"}`,
    calMeasuring: "Keep strings muted — measuring idle noise floor...",
    calDone: (pct) => `Noise calibrated — threshold auto-set to ${pct}%`,
    tapHintHtml: `Play: <kbd>Space</kbd>/<kbd>J</kbd>/<kbd>K</kbd> (Ghost <kbd>F</kbd>/<kbd>D</kbd>) or Audio · <kbd>Enter</kbd> Start · <kbd>Esc</kbd> Stop · <kbd>N</kbd> New · <kbd>P</kbd> Demo · <kbd>1</kbd>–<kbd>6</kbd>/<kbd>↑</kbd><kbd>↓</kbd> Level · <kbd>T</kbd> Triplets · <kbd>Q</kbd> Staccato · <kbd>X</kbd> Ghost · <kbd>S</kbd> Meter · <kbd>L</kbd> Bars · <kbd>+</kbd><kbd>−</kbd> BPM · <kbd>M</kbd>/<kbd>B</kbd>/<kbd>C</kbd>/<kbd>G</kbd>/<kbd>I</kbd>`,
    legendHtml: `Grade: <strong style="color:var(--green)">★ ≤35ms/Rest OK</strong> · <strong style="color:var(--amber)">−/+ ≤80ms</strong> · <strong style="color:var(--red)">&lt;/&gt; &gt;80ms · × Miss/Rest Err</strong> · Sustain(AUD): <strong style="color:var(--green)">▬ OK</strong> / <strong style="color:var(--amber)">▬ Short</strong> / <strong style="color:var(--red)">▬ Bleed</strong>`,
    summaryIdle: "Finish a take to see your timing distribution.",
    summaryHits: (hits, total, pct, tight, sign, mean, sd, extra, sus, restErrs) => {
      const susPart = sus && sus.total > 0 ? ` · Sustain ${sus.ok}/${sus.total} (Short ${sus.short} / Bleed ${sus.long})` : "";
      const restPart = restErrs > 0 ? ` · Rest Err ${restErrs}` : "";
      return `Hits ${hits}/${total} (${pct}%) · TIGHT ${tight} · Mean ${sign}${mean}ms · SD ${sd}ms · Extra ${extra}${susPart}${restPart}`;
    },
    summaryZero: (total, extra, restErrs) => `Hits 0/${total} · Extra ${extra}${restErrs > 0 ? ` · Rest Err ${restErrs}` : ""}`,
    logEmpty: "No completed takes yet.",
    restHitTip: "Played during rest (Error)",
    restRingTip: "String rang into rest (Mute required)",
    restPassTip: "Rest passed cleanly",
    susOkTip: (p) => `Sustain ${p}% (Good)`,
    susShortTip: (p) => `Sustain ${p}% (Too short — hold longer)`,
    susLongTip: (ms) => `Rest bleed (+${ms}ms — mute earlier)`,
    padLeftSub: "Index · J",
    padRightSub: "Middle · K",
    guideTitle: "📖 User Guide & Grading Reference (Click to expand)",
    guideOpen: "Open ▾",
    guideClose: "Close ▴",
    guideHtml: `
      <div class="guide-sec">
        <h3>1. How to Practice</h3>
        <ul>
          <li><strong>Start / Stop</strong>: Press <kbd>Enter</kbd> or <strong>▶ Start</strong> for a 1-bar count-in (Beat 1 green LED, other beats amber LED). Press <kbd>Esc</kbd> or <strong>■ Stop</strong> anytime to abort while keeping the same sheet.</li>
          <li><strong>Demo Playback</strong>: Press <kbd>P</kbd> or <strong>♪ Play Demo</strong> to hear the exact rhythm played on bass (D) with the metronome.</li>
          <li><strong>Customize</strong>: Combine 6 rhythm levels (<kbd>1</kbd>–<kbd>6</kbd>, <kbd>↑</kbd><kbd>↓</kbd>: Quarter Basics → Straight 8ths → 8th Off-beats → Syncopation → 16th Basics → 16th Advanced) with independent Triplets (<kbd>T</kbd>), Staccato (<kbd>Q</kbd>), and Ghost Note (<kbd>X</kbd>) toggles, plus meter (<kbd>S</kbd>), length (<kbd>L</kbd>), BPM (<kbd>+</kbd>/<kbd>−</kbd>), and beat numbers (<kbd>B</kbd>).</li>
          <li><strong>True Sight-Reading &amp; Modes</strong>: Cursor is off by default. Turning <strong>🔇 Metronome OFF (<kbd>M</kbd>)</strong> plays the 1-bar count-in and then mutes both click and LED during play for pure internal-clock training. Also includes optional <strong>Cursor (<kbd>C</kbd>)</strong>, <strong>Grade: End (<kbd>G</kbd>)</strong>, <strong>🏆 Daily (4/4) / 🔥 Daily+ (odd meters)</strong>, <strong>✏️ Custom Editor</strong>, and clickable <strong>#Seed / 🔗 Share</strong> links.</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>2. Grading Symbols &amp; Sustain Bars</h3>
        <ul>
          <li><strong style="color:var(--green)">★</strong> : Tight attack (within <code>±35ms</code>) or <strong>Clean Rest</strong> (silent through the full rest)</li>
          <li><strong style="color:var(--amber)">− / +</strong> : Slightly early (<code>−35 to −80ms</code>) / Slightly late (<code>+35 to +80ms</code>)</li>
          <li><strong style="color:var(--red)">&lt; / &gt;</strong> : Very early (<code>&lt; −80ms</code>) / Very late (<code>&gt; +80ms</code>)</li>
          <li><strong style="color:var(--red)">×</strong> : Missed note or <strong>Rest Violation</strong> (played or rang during a rest, shaded red)</li>
          <li><strong>Audio Sustain Bar</strong> (<code>AUDIO</code>/<code>BOTH</code> only, below each note):
            <strong style="color:var(--green)">▬ OK</strong> (held well) ·
            <strong style="color:var(--amber)">▬ Short</strong> (cut off under 62% of written value) ·
            <strong style="color:var(--red)">▬ Bleed</strong> (rang past the note into a rest)
          </li>
          <li><strong>Staccato (<code>•</code>) &amp; Ghost Notes (<code>×</code>)</strong>: Enable <strong>Staccato (<kbd>Q</kbd>)</strong> to grade half-value articulation (hold ~<strong>50%</strong> of written duration, then mute cleanly—amber if too dead/short, red if held past half). Enable <strong>Ghost Notes (<kbd>X</kbd>)</strong> for percussive dead-notes (<code>×</code>)—auto-detected via fast percussive decay in Audio mode, or played with <kbd>F</kbd>/<kbd>D</kbd> (or the <code>× GHOST</code> touch pad) in Key mode.</li>
          <li><strong>Hover</strong> over any symbol or sustain bar for exact <code>ms</code> error and sustain <code>%</code> tooltips.</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>3. Bass &amp; Audio Interface Setup</h3>
        <ul>
          <li>Press <kbd>I</kbd> or toggle <strong>🎤 Audio</strong> in the input bar to enable your audio interface or mic (can be combined with <strong>⌨️ Key</strong> or <strong>👆 Pad</strong>).</li>
          <li>Choose your interface in the device dropdown and pluck a string while idle to verify the meter and <code>-XXdB (Ch1)</code> readout.</li>
          <li><strong>If idle noise triggers hits</strong>: Keep strings muted and click <strong>🔇 Noise Cal</strong> (measures 0.6s noise floor and sets threshold automatically).</li>
          <li><strong>Meter markers</strong>: Red line = attack threshold / Blue line = sustain hold floor.</li>
          <li><strong>Auto Latency Calibration (⏱ Sync)</strong>: If hits feel consistently delayed (Bluetooth headphones or audio interface), click <strong>⏱ Sync</strong> in the toolbar to run the 16-beat auto-calibration (saved locally for both KEY and AUDIO).</li>
          <li><strong>Stuck on Built-in Mic?</strong> Allow microphone access via the browser address-bar site icon, choose your interface in the Audio Bar dropdown, and click <strong>↻ Reconnect</strong>. On macOS, set the orange menu-bar Mic Mode to <strong>Standard</strong> (Voice Isolation filters out low bass notes).</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>4. Keyboard Shortcuts (IME-Independent)</h3>
        <div class="shortcut-grid">
          <div><kbd>Space</kbd> / <kbd>J</kbd> / <kbd>K</kbd></div><div>Tap rhythm (starts take if ready)</div>
          <div><kbd>Enter</kbd> / <kbd>R</kbd></div><div>Start / Retry current score</div>
          <div><kbd>Esc</kbd></div><div>Stop immediately</div>
          <div><kbd>N</kbd> / <kbd>P</kbd></div><div>New score / Play demo bass</div>
          <div><kbd>1</kbd>–<kbd>6</kbd> / <kbd>↑</kbd> <kbd>↓</kbd> / <kbd>T</kbd></div><div>6 difficulty levels (±1) · Triplets (OFF→8th→+2-Beat)</div>
          <div><kbd>Q</kbd> / <kbd>X</kbd> / <kbd>F</kbd> <kbd>D</kbd></div><div>Staccato ON/OFF · Ghost Notes ON/OFF · Ghost mute hit</div>
          <div><kbd>S</kbd> / <kbd>L</kbd></div><div>Cycle time signature (4/4..6/8) · Cycle bar count</div>
          <div><kbd>+</kbd> / <kbd>−</kbd></div><div>BPM ±5</div>
          <div><kbd>M</kbd> / <kbd>B</kbd> / <kbd>C</kbd> / <kbd>G</kbd></div><div>Metronome · Beat numbers · Guide cursor · Grading (Live/End)</div>
          <div><kbd>I</kbd></div><div>Cycle input mode (KEY → AUDIO → BOTH)</div>
          <div><kbd>[</kbd> <kbd>]</kbd> / <kbd>,</kbd> <kbd>.</kbd></div><div>Audio threshold ±2% / Latency ±5ms</div>
        </div>
      </div>`,
  },
  ja: {
    btnStart: "▶ 開始 / 再挑戦",
    btnDockStart: "▶ 開始",
    btnStop: "■ 停止",
    btnNew: "新しい譜面",
    btnDockNew: "次の譜面",
    btnDemo: "♪ お手本再生",
    lblLevel: "難易度",
    lvBtns: {
      1: "Lv1 · 4分＆休符基礎",
      2: "Lv2 · 表拍8分入門",
      3: "Lv3 · 8分裏拍＆付点",
      4: "Lv4 · 8分シンコペ",
      5: "Lv5 · 16分音符基礎",
      6: "Lv6 · 16分音符 応用",
    },
    tripletsOff: "3連符 OFF",
    triplets8: "3連符: 8分",
    triplets2b: "3連符: +2拍",
    staccatoOn: "• スタッカート ON",
    staccatoOff: "• スタッカート OFF",
    ghostOn: "× ゴースト ON",
    ghostOff: "× ゴースト OFF",
    stacOkTip: (p) => `スタッカート ${p}%（良好 — 半分の音価で綺麗にカット）`,
    stacShortTip: (p) => `スタッカート ${p}%（短すぎ — 音価の半分（約50%）まで伸ばしてから切ってください）`,
    stacLongTip: (p) => `スタッカート ${p}%（長い — 音価の半分（50%）で切ってください）`,
    ghostOkTip: (ms) => ms != null ? `ゴーストミュート良好（${ms}ms カット）` : "ゴーストミュート良好（×）",
    ghostRingTip: (ms) => ms != null ? `ゴースト失敗（${ms}ms 鳴り続け — 左手ミュートで弾いてください）` : "ゴースト失敗 — F/Dキー（ミュート）で入力してください",
    ghostWrongKeyTip: "通常の音符にゴーストキー（F/D）を入力しました",
    padGhostSub: "ミュート · F/D",
    barsLabels: { 2: "2小節", 4: "4小節 (1段)", 8: "8小節 (2段)", 12: "12小節 (3段)", 16: "16小節 (4段)", 32: "32小節 (8段)" },
    metroOn: "🔊 メトロノーム ON",
    metroOff: "🔇 メトロノーム OFF",
    beatsOn: "拍番号 ON",
    beatsOff: "拍番号 OFF",
    cursorOn: "カーソル ON",
    cursorOff: "カーソル OFF",
    gradeLive: "採点: 即時",
    gradeEnd: "採点: 終了後",
    inputPrefix: "入力",
    btnInKey: "⌨️ キー",
    btnInAudio: "🎤 音声",
    btnPad: "👆 パッド",
    lblClickVol: "🔊 クリック",
    btnPrint: "🖨 PDF",
    btnSyncCal: "⏱ 補正",
    btnTour: "🧭 ツアー",
    btnGuide: "❓ 使い方",
    tourPrev: "戻る",
    tourNext: "次へ →",
    tourSkip: "スキップ",
    tourDone: "🎸 練習を始める!",
    tourWelcomeChips: ["⌨️ キーボード (Space/J/K)", "📱 スマホタッチパッド", "🎸 生ベース (オーディオ入力)"],
    tourSteps: [
      {
        target: null,
        title: "🎸 Rhythm Sight-Reader へようこそ！",
        body: "インストール不要で今すぐ練習できるベース・リズム初見トレーナーです。30秒で主な機能をサクッとご案内します。（いつでも上部の 🧭 ツアーから見直せます）",
      },
      {
        target: ".sheet-paper",
        title: "🎼 譜面を読んでそのまま演奏",
        body: "▶ スタート（Enter / Space）で1小節カウントイン後に演奏開始。音符に合わせて Space / J / K（またはタッチパッド・生ベース）を弾き、休符はしっかりミュート！♪ 正解を聴く（P）で先にリズムを確認できます。",
      },
      {
        target: ".status-strip",
        title: "🟢 メトロノームLED＆リアルタイム判定",
        body: "1拍目は緑、他の拍は黄色LEDが光ります。±35ms以内は緑(★ TIGHT)、±80msは黄、それ以上は赤で判定。実戦練習には 🔊 メトロノームOFF や 採点: 終了後 もおすすめです。",
      },
      {
        target: "#btnDiffMenu",
        title: "🎚️ 6段階レベル＆3連符・スタッカート・ゴースト",
        body: "Lv1の基礎からLv6の16分音符応用まで段階的に上達でき、3連符・• スタッカート・× ゴーストノート（F/Dキー）や 4/4・3/4・2/4・5/4・6/8 拍子も自由に組み合わせられます。",
      },
      {
        target: "#inputGroup",
        title: "🎤 キーボード・パッド・生ベース接続",
        body: "⌨️ キー・🎤 音声・👆 パッドの3種トグルを自由に組み合わせられます。🎤 音声をオンにするとオーディオI/Fやマイクから生ベースのアタック・サステイン・休符ミュートまで採点可能。ズレを感じたら ⋯ ツール → ⏱ 補正（16拍）で調整できます。",
      },
      {
        target: "#btnDaily",
        title: "🏆 デイリー挑戦・エディタ・スコアカード共有",
        body: "毎日共通譜面に挑む 🏆 デイリー(4/4) / 🔥 デイリー+(変拍子) や自作譜面の ✏️ 編集機能を搭載！演奏後は S+〜C ランクと 🖼️ 画像カード で結果をシェアしましょう。",
      },
    ],
    btnDaily: "🏆 デイリー",
    btnDailyPlus: "🔥 デイリー+",
    btnEditor: "✏️ 編集",
    btnTechMenu: "🎼 リズム",
    btnOptsMenu: "⚙️ 練習設定",
    diffPanelTitle: "難易度 & 練習設定",
    diffSecScore: "譜面 · 拍子 · 小節",
    btnToolsMenu: "⋯ ツール",
    toolsSecCreate: "作成 · 特訓",
    toolsSecUtil: "補正 · 出力",
    toolsSecHelp: "ヘルプ",
    btnDrill: "🧪 特訓",
    drillTitle: "🧪 特殊トレーニング",
    drillGapLbl: "🔇 ギャップクリック",
    drillGapOpts: ["OFF", "1+1 (1 ON · 1 無音)", "2+2 (2 ON · 2 無音)", "1+3 (1 ON · 3 無音)"],
    drillFadeLbl: "👻 先読みフェード",
    drillFadeOpts: ["OFF", "1拍前に隠す", "2拍前に隠す"],
    drillRushOff: "⚡ BPMラッシュ OFF",
    drillRushOn: "⚡ BPMラッシュ ON",
    drillRushBest: (bpm, rnd) => `最高 ${bpm} BPM (${rnd}R)`,
    drillReset: "初期化",
    drillIdleMsg: "実験的な特殊初見トレーニング(ベータ): ギャップクリック・先読みフェードアウト・BPMラッシュ(+5 BPM加速)を組み合わせられます。",
    statusGapMute: "🔇 GAP区間 — 体内リズムを維持！",
    drillGapResult: (acc, hits, total, mean) => `🔇 GAP区間: ${hits}/${total} (${acc.toFixed(0)}%) · 平均 ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}ms`,
    drillRushClear: (rnd, acc, nextBpm) => `⚡ R${rnd} CLEAR (${acc.toFixed(0)}%)! → ${nextBpm} BPM 自動開始 (Esc停止)`,
    drillRushFail: (rnd, peak, acc, minAcc) => `💥 RUSH終了! ${rnd}ラウンド達成 · 最高 ${peak} BPM (${acc.toFixed(0)}% < ${minAcc}%)`,
    drillRushBadge: (rnd, nextBpm) => `⚡ R${rnd} CLEAR → ${nextBpm}BPM`,
    btnShareUrl: "🔗 共有",
    btnShareCopied: "✓ コピー済!",
    btnShareResult: "📋 テキスト共有",
    btnBragCard: "🖼️ 画像カード",
    bragSaved: "✓ 保存完了!",
    edTitle: "✏️ カスタム譜面エディタ",
    edBarsLbl: (n) => `${n}小節`,
    edImportCur: "現在の譜面を取込",
    edClear: "初期化",
    edCopyUrl: "🔗 カスタムURLコピー",
    edLoadCode: "📥 コード読込",
    edCodePlaceholder: "カスタムコードまたは共有URLを貼り付け...",
    edDefaultMsg: "譜面上の拍（青い枠）を直接クリックして選び、下のリズムアイコンを押すだけで編集できます。",
    edTiePrev: "⌒ 前の拍とタイ",
    edNoteHint: "音符アーティキュレーション（クリック切替）:",
    edArtNormal: "通常",
    edArtStac: "• スタッカート",
    edArtGhost: "× ゴースト",
    edCats: { basic: "基本", eighth: "8分", sixteenth: "16分", triplet: "3連符", c68: "6/8 基本", c68_16: "6/8 16分" },
    edRestOnly: "休符の拍（音符なし）",
    edContBeat: "前の拍から続く長い音符です — 開始拍を選んで編集してください。",
    edUrlCopied: "カスタム譜面の共有URLをコピーしました！",
    edSeedCopied: "現在の譜面URL（シード＋設定）をコピーしました！",
    edLoadedOk: "カスタム譜面を読み込みました！Enterで演奏できます。",
    edSeedLoadedOk: (s) => `シード ${s}（拍子・難易度・小節数・BPM含む）を読み込みました！`,
    edLoadFail: "無効なシード／コード／URLです。シードコード（例: 44-L4SG-4B-80-A1B2）・C1_コード・共有URLを確認してください。",
    seedPrompt: "シードコード（例: 44-L4SG-4B-80-A1B2）、カスタムコード（C1_...）、または共有URLを入力:",
    seedTooltip: "クリックしてシードコードをコピー／入力（拍子・難易度・小節数・BPMすべて含む）",
    dailyLoaded: (date, streak, isPlus) => `${isPlus ? "🔥 デイリー+" : "🏆 デイリー"} (${date})${streak > 0 ? ` · ${streak}日連続` : ""}`,
    dailyBest: (acc, tight) => `本日のベスト: ${acc}% (TIGHT ${tight})`,
    resultCopied: "✓ コピー済!",
    calTitle: "⏱ 遅延補正",
    calStartBtn: "▶ 16拍テスト",
    calStopBtn: "■ 中断",
    calResetBtn: "リセット",
    calIdleMsg: "判定が一定にずれる時だけお使いください（BluetoothやI/F向け）。メトロノーム16拍に合わせてSpace/J/Kまたはベースを弾くと自動補正します（1〜4拍は準備）。",
    calRunningMsg: "クリックに合わせて一定にタップ／演奏してください（1〜4拍準備・5〜16拍測定）...",
    calStatus: (b, n) => `遅延補正中  ${b} / ${n}`,
    calBadgeRunning: "補正測定中...",
    calApplied: (src, ms, n, spread) => `補正完了！ ${src} ${ms >= 0 ? "+" : ""}${ms}ms を自動適用しました（${n}/12拍測定・ばらつき ±${spread}ms）`,
    calTooFew: (n) => `入力が足りません（${n}/12拍・最低6拍必要）— もう一度お試しください。`,
    calResetMsg: "補正値を初期値（KEY 0ms / AUD 25ms）に戻しました。",
    statusSub: "1拍目 緑 / その他の拍 黄 · 譜面カーソル表示なし",
    statusReady: "準備完了 — Enter または Space で開始",
    statusGetReady: "準備してください...",
    statusCountIn: (b, n = 4) => `カウントイン  ${b} / ${n}`,
    statusDemo: "お手本ベース再生中...",
    statusPlay: "演奏中 — メトロノームに合わせて演奏してください",
    statusDone: "完了! — Enter 再挑戦 · N 新しい譜面 · P お手本",
    badgeWait: "待機中",
    badgeStopped: "停止",
    badgeDemo: "お手本再生中",
    badgeCountIn: "カウントイン...",
    badgeBlindPlay: "演奏中（終了後に公開）",
    badgeDone: (hits, total) => `採点結果 (${hits}/${total})`,
    badgeDetected: (ch) => `[AUD Ch${ch}] 検出!`,
    audioTitle: "🎤 オーディオ入力",
    sysDefault: "システム既定入力",
    audioInputN: (n) => `オーディオ入力 ${n}`,
    allChannels: (n) => `全チャンネル (${n}ch)`,
    btnReconnect: "↻ 再接続",
    btnNoiseCal: "🔇 ノイズ補正",
    btnMeasuring: "測定中...",
    lblGain: "ゲイン",
    lblThr: "しきい値",
    lblLat: "遅延補正",
    levelSilent: "無音",
    levelOff: "オフ",
    audioDefaultMsg: "ヘッドホン／オーディオインターフェースのライン入力推奨（クリック音回り込み防止）",
    audioNoApi: "この環境ではマイクAPIを使用できません。HTTPSサイトを最新のChrome / Safari / Edgeで開いてください。",
    audioBuiltinFile: (dev) => `⚠️ 内蔵マイク(${dev})に接続中 — アドレスバーでマイク権限を許可し、上のプルダウンからオーディオインターフェースを選択してください（HTTPS必須）。`,
    audioBuiltinSelect: (dev) => `⚠️ 内蔵マイク(${dev})に接続中 — 上のプルダウンからオーディオインターフェースを選択してください。`,
    audioConnected: (dev, sr, ch) => `接続済: ${dev} (${sr}kHz · ${ch}ch) — 待機中に弦を弾いてメーター反応を確認してください`,
    audioFail: (err, isFile) => `オーディオ入力接続失敗: ${err}${isFile ? " (file:// ではなく https://gnosia1104.github.io/rhythm-practice/ で開いてください)" : " (ブラウザおよびOSのマイク権限を確認)"}`,
    calMeasuring: "弦に触れずにお待ちください（フロアノイズ測定中）...",
    calDone: (pct) => `ノイズ補正完了 — しきい値を ${pct}% に自動設定しました`,
    tapHintHtml: `入力: <kbd>Space</kbd>/<kbd>J</kbd>/<kbd>K</kbd>（ゴースト <kbd>F</kbd>/<kbd>D</kbd>）またはオーディオ · <kbd>Enter</kbd> 開始 · <kbd>Esc</kbd> 停止 · <kbd>N</kbd> 新規 · <kbd>P</kbd> お手本 · <kbd>1</kbd>〜<kbd>6</kbd>/<kbd>↑</kbd><kbd>↓</kbd> 難易度 · <kbd>T</kbd> 3連符 · <kbd>Q</kbd> スタッカート · <kbd>X</kbd> ゴースト · <kbd>S</kbd> 拍子 · <kbd>L</kbd> 小節数 · <kbd>+</kbd><kbd>−</kbd> BPM · <kbd>M</kbd>/<kbd>B</kbd>/<kbd>C</kbd>/<kbd>G</kbd>/<kbd>I</kbd>`,
    legendHtml: `判定: <strong style="color:var(--green)">★ ≤35ms/休符OK</strong> · <strong style="color:var(--amber)">−/+ ≤80ms</strong> · <strong style="color:var(--red)">&lt;/&gt; &gt;80ms · × ミス/休符エラー</strong> · サステイン(AUD): <strong style="color:var(--green)">▬ 良好</strong> / <strong style="color:var(--amber)">▬ 短い</strong> / <strong style="color:var(--red)">▬ はみ出し</strong>`,
    summaryIdle: "演奏を終えるとタイミング分布が表示されます。",
    summaryHits: (hits, total, pct, tight, sign, mean, sd, extra, sus, restErrs) => {
      const susPart = sus && sus.total > 0 ? ` · サステイン ${sus.ok}/${sus.total} (短い ${sus.short} / はみ出し ${sus.long})` : "";
      const restPart = restErrs > 0 ? ` · 休符エラー ${restErrs}` : "";
      return `的中 ${hits}/${total} (${pct}%) · TIGHT ${tight} · 平均 ${sign}${mean}ms · 偏差 ${sd}ms · 余分 ${extra}${susPart}${restPart}`;
    },
    summaryZero: (total, extra, restErrs) => `的中 0/${total} · 余分入力 ${extra}${restErrs > 0 ? ` · 休符エラー ${restErrs}` : ""}`,
    logEmpty: "完了した記録はまだありません。",
    restHitTip: "休符で演奏しました（エラー）",
    restRingTip: "休符に音が残っています（ミュートが必要）",
    restPassTip: "休符クリア（良好）",
    susOkTip: (p) => `サステイン ${p}%（良好）`,
    susShortTip: (p) => `サステイン ${p}%（短い — 音をもう少し伸ばしてください）`,
    susLongTip: (ms) => `休符へのはみ出し (+${ms}ms — ミュートが遅い)`,
    padLeftSub: "人差指 · J",
    padRightSub: "中指 · K",
    guideTitle: "📖 使い方・判定ガイド（クリックで開く）",
    guideOpen: "開く ▾",
    guideClose: "閉じる ▴",
    guideHtml: `
      <div class="guide-sec">
        <h3>1. 基本的な練習方法</h3>
        <ul>
          <li><strong>開始 / 停止</strong>: <kbd>Enter</kbd> または <strong>▶ 開始</strong> で1小節カウントイン（1拍目 緑LED、その他の拍 黄LED）のあと演奏が始まります。途中で止めるには <kbd>Esc</kbd> または <strong>■ 停止</strong> を押してください。</li>
          <li><strong>お手本再生</strong>: <kbd>P</kbd> または <strong>♪ お手本再生</strong> でメトロノームに合わせたベースガイド音（D）を確認できます。</li>
          <li><strong>譜面設定</strong>: 6段階のリズム難易度（<kbd>1</kbd>〜<kbd>6</kbd>・<kbd>↑</kbd><kbd>↓</kbd>：4分基礎→表拍8分→8分裏拍→シンコペ→16分基礎→16分音符応用）に3連符（<kbd>T</kbd>）・スタッカート（<kbd>Q</kbd>）・ゴースト（<kbd>X</kbd>）を自由に組み合わせられます。拍子（<kbd>S</kbd>）・小節数（<kbd>L</kbd>）・BPM（<kbd>+</kbd>/<kbd>−</kbd>）・拍番号（<kbd>B</kbd>）も調整可能です。</li>
          <li><strong>初見（サイトリーディング）＆各種モード</strong>: 既定はカーソルなし。<strong>🔇 メトロノーム OFF（<kbd>M</kbd>）</strong>ではカウントイン1小節だけ鳴り、演奏中は音もLEDも消えて体内リズム訓練ができます。入門用<strong>カーソル（<kbd>C</kbd>）</strong>・<strong>採点: 終了後（<kbd>G</kbd>）</strong>・<strong>🏆 デイリー(4/4)／🔥 デイリー+(変拍子)</strong>・<strong>✏️ カスタム編集</strong>・<strong>#シード入力／🔗 共有</strong>も利用できます。</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>2. 判定記号とサステインの見方</h3>
        <ul>
          <li><strong style="color:var(--green)">★</strong> : ジャスト（<code>±35ms</code>以内）または <strong>休符クリア</strong>（休符の最後まで静かにミュート）</li>
          <li><strong style="color:var(--amber)">− / +</strong> : やや早い（<code>−35〜−80ms</code>）/ やや遅い（<code>+35〜+80ms</code>）</li>
          <li><strong style="color:var(--red)">&lt; / &gt;</strong> : かなり早い（<code>&lt; −80ms</code>）/ かなり遅い（<code>&gt; +80ms</code>）</li>
          <li><strong style="color:var(--red)">×</strong> : 音符ミス、または <strong>休符エラー</strong>（休符中に弾いた・音が鳴り続けた場合は赤ハイライト）</li>
          <li><strong>オーディオ・サステインバー</strong>（<code>AUDIO</code>/<code>BOTH</code>専用、音符の下のバー）:
            <strong style="color:var(--green)">▬ 良好</strong>（十分にキープ） ·
            <strong style="color:var(--amber)">▬ 短い</strong>（音価の62%未満で早く途切れた） ·
            <strong style="color:var(--red)">▬ はみ出し</strong>（次の休符までミュートが遅れた）
          </li>
          <li><strong>スタッカート（<code>•</code>）＆ゴーストノート（<code>×</code>）</strong>: <kbd>Q</kbd> でスタッカートをオンにすると音価の <strong>半分（約50%）伸ばしてから綺麗に切ったか</strong>（短すぎると黄、半分超えで赤）を判定します。<kbd>X</kbd> でゴーストノート（<code>×</code>）をオンにすると、オーディオではパーカッシブなミュート減衰を自動判別し、キーボードでは <kbd>F</kbd>/<kbd>D</kbd>（モバイルは <code>× GHOST</code> パッド）で入力します。</li>
          <li>記号やバーに <strong>マウスを合わせる</strong> と正確な <code>ms</code> 誤差やサステイン <code>%</code> が表示されます。</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>3. ベース／オーディオインターフェース接続のコツ</h3>
        <ul>
          <li><kbd>I</kbd> キーまたは上部の <strong>🎤 音声</strong> トグルをオンにするとオーディオI/F・マイク入力が有効になります（<strong>⌨️ キー</strong>・<strong>👆 パッド</strong>との同時使用も可能）。</li>
          <li>機器プルダウンからインターフェースを選び、待機中に弦を弾いてメーターと <code>-XXdB (Ch1)</code> の反応を確認してください。</li>
          <li><strong>弾いていないのにノイズが反応する場合</strong>: 弦をミュートした状態で <strong>🔇 ノイズ補正</strong> を押すと、0.6秒間ノイズを測定してしきい値を自動設定します。</li>
          <li><strong>メーターの基準線</strong>: 赤線 = アタック検出しきい値 / 青線 = サステイン維持ライン。</li>
          <li><strong>自動遅延補正（⏱ 補正）</strong>: BluetoothイヤホンやオーディオI/Fでタイミングが一定にずれる場合は、ツールバーの <strong>⏱ 補正</strong> から16拍自動テストを実行してください（KEY/AUDIOとも自動保存）。</li>
          <li><strong>内蔵マイクしか選ばれない場合</strong>: アドレスバーのサイト設定でマイク権限を許可し、オーディオバーのプルダウンからインターフェースを選んで <strong>↻ 再接続</strong> を押してください。macOSではメニューバーのオレンジ色マイクアイコンから <strong>マイクモード → 標準</strong>（声を分離OFF）にすると低音ベースが途切れません。</li>
        </ul>
      </div>
      <div class="guide-sec">
        <h3>4. ショートカット一覧（日本語・韓国語IMEオンでも動作）</h3>
        <div class="shortcut-grid">
          <div><kbd>Space</kbd> / <kbd>J</kbd> / <kbd>K</kbd></div><div>リズム入力（待機中はそのまま開始）</div>
          <div><kbd>Enter</kbd> / <kbd>R</kbd></div><div>開始 / 同じ譜面で再挑戦</div>
          <div><kbd>Esc</kbd></div><div>即座に停止</div>
          <div><kbd>N</kbd> / <kbd>P</kbd></div><div>新しい譜面 / お手本ベース再生</div>
          <div><kbd>1</kbd>〜<kbd>6</kbd> / <kbd>↑</kbd> <kbd>↓</kbd> / <kbd>T</kbd></div><div>難易度6段階選択 · ±1調整 · 3連符（OFF→8分→+2拍）</div>
          <div><kbd>Q</kbd> / <kbd>X</kbd> / <kbd>F</kbd> <kbd>D</kbd></div><div>スタッカート ON/OFF · ゴースト ON/OFF · ゴーストミュート入力</div>
          <div><kbd>S</kbd> / <kbd>L</kbd></div><div>拍子切替（4/4·3/4·2/4·5/4·6/8）· 小節数切替</div>
          <div><kbd>+</kbd> / <kbd>−</kbd></div><div>BPM ±5 調整</div>
          <div><kbd>M</kbd> / <kbd>B</kbd> / <kbd>C</kbd> / <kbd>G</kbd></div><div>メトロノーム · 拍番号 · 入門カーソル · 採点表示（即時/終了後）</div>
          <div><kbd>I</kbd></div><div>入力モード切替（KEY → AUDIO → BOTH）</div>
          <div><kbd>[</kbd> <kbd>]</kbd> / <kbd>,</kbd> <kbd>.</kbd></div><div>しきい値 ±2% / 遅延補正 ±5ms</div>
        </div>
      </div>`,
  },
};

export function detectDefaultLang() {
  const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || "en"];
  for (const raw of langs) {
    const lc = String(raw || "").toLowerCase();
    if (lc.startsWith("ko")) return "ko";
    if (lc.startsWith("ja")) return "ja";
    if (lc.startsWith("en")) return "en";
  }
  return "en";
}

let curLang = detectDefaultLang();
export function getCurLang() { return curLang; }
export function setCurLang(lang) {
  curLang = I18N[lang] ? lang : "en";
  return curLang;
}
try {
  const saved = localStorage.getItem("rhythm_practice_lang");
  if (saved && I18N[saved]) curLang = saved;
} catch (_) {}

export function t(key, ...args) {
  const entry = (I18N[curLang] && I18N[curLang][key]) ?? I18N.ko[key];
  return typeof entry === "function" ? entry(...args) : entry;
}

