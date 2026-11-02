import { useEffect, useMemo, useRef, useState } from 'react';
import { shuffle, sleep, parseNumberList, formatNumberList, presetGaps, fitArray, gridTracks } from './utils';
import { readRosterFile, rosterSummary, downloadRosterTemplate } from './roster';
import { sound } from './sound';
import ResultOverlay from './ResultOverlay';
import Confetti from './Confetti';
import RosterCloud from './RosterCloud';
import './swap.css';
import './cloud.css';
import './desk-text.css';
import './screens.css';
import './roles.css';

const STORE_KEY = 'random-seating:v2';

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStore(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // 저장할 수 없는 환경(시크릿 창 등)은 무시
  }
}

// shuffle: 섞는 시간, roll: 한 자리 번호가 돌아가는 시간, hold: 공개 직전 멈칫하는 시간
const SPEEDS = {
  slow: { label: '천천히 (긴장감 MAX)', shuffle: 3200, roll: 750, pause: 180, hold: 260, countdown: true },
  normal: { label: '보통 속도', shuffle: 2600, roll: 400, pause: 80, hold: 0, countdown: true },
  fast: { label: '빠르게', shuffle: 1400, roll: 150, pause: 20, hold: 0, countdown: false },
  click: { label: '클릭해서 한 자리씩', shuffle: 2600, roll: 550, pause: 0, hold: 200, countdown: true },
};

const PAIR_PRESETS = [
  { v: '1', label: '모두 떨어짐' },
  { v: '2', label: '2명씩 짝' },
  { v: '3', label: '3명씩' },
  { v: '0', label: '모두 붙임' },
];

const emptySeat = () => ({ status: 'empty', studentNum: null });
// 뽑기 때 한 자리씩 공개되는 자리 (뽑힌 학생 자리 + 지정석)
const isDrawTarget = (s) => (s.status === 'empty' && !!s.studentNum) || s.status === 'fixed';

function Icon({ name, style }) {
  return (
    <span className="material-symbols-rounded" style={style}>
      {name}
    </span>
  );
}

function Desk({ seat, revealed, active, frontValue, roster, clickable, pending, shuffling, joinL, joinR, onClick, style, swapMode, swapSelected, justSwapped, markFixed, role, roleMode }) {
  const { status, studentNum } = seat;
  const backName = studentNum && roster ? roster[studentNum] : null;
  const rollName = frontValue != null && roster ? roster[frontValue] : null;
  const cls = [
    'desk-wrapper',
    revealed ? 'flipped' : '',
    status === 'excluded' ? 'excluded' : '',
    markFixed && status === 'fixed' ? 'fixed' : '', // 지정석 표시는 자리 편집 중에만 (결과에서는 구분 없음)
    clickable ? 'clickable' : '',
    active ? 'active' : '',
    pending ? 'pending' : '',
    shuffling ? 'shuffling' : '',
    joinL ? 'join-l' : '',
    joinR ? 'join-r' : '',
    frontValue != null ? 'rolling' : '',
    swapMode ? 'swap-mode' : '',
    swapSelected ? 'swap-selected' : '',
    justSwapped ? 'just-swapped' : '',
    roleMode ? 'role-mode' : '',
    role ? `has-role role-${role === '회장' ? 'pres' : 'vice'}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} style={style} onClick={clickable ? onClick : undefined}>
      <div className="desk-inner">
        <div className="desk-front">
          {frontValue != null && (
            <span className={`roll ${rollName ? 'has-name' : ''}`}>
              <span className="roll-num">{rollName ? `${frontValue}번` : frontValue}</span>
              {rollName && (
                <span className="roll-name" style={{ '--len': rollName.length }}>
                  {rollName}
                </span>
              )}
            </span>
          )}
        </div>
        <div className={`desk-back ${backName ? 'has-name' : ''}`}>
          {status === 'excluded' ? (
            swapMode ? <span className="back-empty">빈자리</span> : null
          ) : studentNum ? (
            <>
              {role && <span className="role-badge">{role}</span>}
              <span className="back-num">{backName ? `${studentNum}번` : studentNum}</span>
              {backName && (
                <span className="back-name" style={{ '--len': backName.length }}>
                  {backName}
                </span>
              )}
            </>
          ) : (
            <span className="back-empty">빈자리</span>
          )}
        </div>
      </div>
    </div>
  );
}

// 설정 화면 옆에 뜨는 자리판 미리보기 (짝/통로, 제외·지정석 반영)
function LayoutPreview({ cols, rows, colGaps, rowGaps, marks }) {
  if (!(cols > 0 && rows > 0)) {
    return <div className="layout-preview empty">가로·세로를 입력하면 미리보기가 나와요</div>;
  }
  if (cols > 20 || rows > 20 || cols * rows > 150) {
    return <div className="layout-preview empty warn">자리가 너무 많아요 (최대 150석)</div>;
  }
  const w = Math.max(9, Math.min(28, Math.floor(210 / cols)));
  const h = Math.round(w * 0.72);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mark = marks?.[r * cols + c];
      cells.push(
        <span
          key={r * cols + c}
          className={`lp-desk ${mark === 'excluded' ? 'excluded' : mark === 'fixed' ? 'fixed' : ''}`}
          style={{ gridRow: r * 2 + 1, gridColumn: c * 2 + 1 }}
        />,
      );
    }
  }
  return (
    <div className="layout-preview" aria-label={`자리 미리보기 ${cols} × ${rows}`}>
      <div className="lp-banner">교 탁</div>
      <div
        className="lp-grid"
        style={{
          gridTemplateColumns: gridTracks(cols, colGaps, `${w}px`, '2px', `${Math.max(6, Math.round(w * 0.45))}px`),
          gridTemplateRows: gridTracks(rows, rowGaps, `${h}px`, '4px', `${Math.max(8, Math.round(h * 0.7))}px`),
        }}
      >
        {cells}
      </div>
      <div className="lp-caption">
        {cols} × {rows} = <b>{cols * rows}석</b>
      </div>
    </div>
  );
}

export default function App() {
  const saved = useMemo(loadStore, []);
  const [view, setView] = useState('setup');
  const [cols, setCols] = useState(saved.cols ?? '6');
  const [rows, setRows] = useState(saved.rows ?? '4');
  const [maxNum, setMaxNum] = useState(saved.maxNum ?? '');
  const [excludedText, setExcludedText] = useState(saved.excludedText ?? '');
  const [pairSize, setPairSize] = useState(saved.pairSize ?? '2');
  const [colGaps, setColGaps] = useState(saved.colGaps ?? []);
  const [rowGaps, setRowGaps] = useState(saved.rowGaps ?? []);
  const [dims, setDims] = useState(null);
  const [seats, setSeats] = useState([]);
  // 명렬표는 '이 기기에 기억하기'를 켠 경우에만 브라우저에 남긴다 (공용 전자칠판 보호, 기본 꺼짐)
  const [rememberRoster, setRememberRoster] = useState(saved.rememberRoster === true);
  const [roster, setRoster] = useState(saved.rememberRoster === true ? (saved.roster ?? null) : null);
  const [lastCode, setLastCode] = useState(saved.lastCode ?? '');
  const [cloud, setCloud] = useState(null); // 'upload' | 'upload-result' | 'download'
  // 회장·부회장: 학생 번호에 붙임 (자리를 바꿔도 따라감). 번호만 저장하므로 개인정보 아님
  const [roles, setRoles] = useState(() => (saved.roles && typeof saved.roles === 'object' ? saved.roles : {}));
  const [roleMode, setRoleMode] = useState(false);
  const [className, setClassName] = useState(saved.className ?? '1학년 1반');
  const [revealMode, setRevealMode] = useState(SPEEDS[saved.revealMode] ? saved.revealMode : 'normal');
  const [soundOn, setSoundOn] = useState(saved.soundOn ?? true);

  // 뽑기 진행 상태: prepare → shuffling → countdown → revealing → done
  const [phase, setPhase] = useState('prepare');
  const [revealed, setRevealed] = useState(() => new Set());
  const [activeIdx, setActiveIdx] = useState(null);
  const [rollValue, setRollValue] = useState(null);
  const [rollPool, setRollPool] = useState([]);
  const [flicker, setFlicker] = useState(0);
  const [countdown, setCountdown] = useState(null);

  const [editIdx, setEditIdx] = useState(null);
  const [editNum, setEditNum] = useState('');
  const [overlay, setOverlay] = useState(null);
  const [confetti, setConfetti] = useState(0);
  const [toast, setToast] = useState(null);

  // 자리 바꾸기 (배치 완료 후)
  const [swapMode, setSwapMode] = useState(false);
  const [swapFrom, setSwapFrom] = useState(null);
  const [swapHistory, setSwapHistory] = useState([]);
  const [justSwapped, setJustSwapped] = useState([]);
  const swapTimerRef = useRef(null);

  const runRef = useRef(0);
  const skipRef = useRef(false);
  const busyRef = useRef(false);
  const drawRef = useRef(null);

  useEffect(() => {
    sound.setEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    const seatSetup =
      dims && seats.length
        ? {
            cols: dims.cols,
            rows: dims.rows,
            cells: seats.map((s) => (s.status === 'excluded' ? 'x' : s.status === 'fixed' ? s.studentNum : 0)),
          }
        : saved.seatSetup;
    saveStore({
      cols,
      rows,
      maxNum,
      excludedText,
      pairSize,
      colGaps,
      rowGaps,
      seatSetup,
      roster: rememberRoster ? roster : null,
      rememberRoster,
      lastCode,
      roles,
      className,
      revealMode,
      soundOn,
    });
  }, [cols, rows, maxNum, excludedText, pairSize, colGaps, rowGaps, dims, seats, roster, rememberRoster, lastCode, roles, className, revealMode, soundOn, saved]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ms || 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg, ms) => setToast({ msg, ms, id: Date.now() });

  const onCloudSaved = (r) =>
    showToast(
      <div className="toast-saved">
        <b>✅ 정상적으로 등록되었어요.</b>
        <br />
        {r.kind === 'result' ? '결과' : '명렬표'} 불러오기 코드: 「<b>{r.display}</b>」
        <br />
        <small>처음 화면의 「저장한 결과·명렬표 불러오기」에서 코드와 비밀번호로 열 수 있어요.</small>
      </div>,
      9000,
    );

  const excludedNums = useMemo(() => parseNumberList(excludedText), [excludedText]);
  const excludedSet = useMemo(() => new Set(excludedNums), [excludedNums]);
  const rosterInfo = useMemo(() => rosterSummary(roster), [roster]);

  // ── 자리판 기준 계산 ──
  const usableSeats = seats.filter((s) => s.status !== 'excluded').length;
  const fixedSet = new Set(seats.filter((s) => s.status === 'fixed').map((s) => s.studentNum));
  const topNum = parseInt(maxNum, 10) > 0 ? parseInt(maxNum, 10) : usableSeats;
  const pool = [];
  for (let i = 1; i <= topNum; i++) if (!excludedSet.has(i) && !fixedSet.has(i)) pool.push(i);
  const drawableCount = seats.filter((s) => s.status === 'empty').length;
  const shortage = pool.length - drawableCount;

  // ── 설정 화면 기준 계산 ──
  const setupC = parseInt(cols, 10) || 0;
  const setupR = parseInt(rows, 10) || 0;
  const setupSeatTotal = setupC * setupR;
  const setupTop = parseInt(maxNum, 10) > 0 ? parseInt(maxNum, 10) : setupSeatTotal;
  const setupCount = setupTop - excludedNums.filter((n) => n <= setupTop).length;
  const templateCount = setupTop > 0 ? setupTop : 30;
  const previewMarks = (() => {
    if (dims && dims.cols === setupC && dims.rows === setupR && seats.length) return seats.map((s) => s.status);
    const st = saved.seatSetup;
    if (st && st.cols === setupC && st.rows === setupR && st.cells?.length === setupC * setupR)
      return st.cells.map((v) => (v === 'x' ? 'excluded' : v > 0 ? 'fixed' : 'empty'));
    return null;
  })();
  const previewGaps =
    pairSize === 'custom' && colGaps.length === Math.max(0, setupC - 1)
      ? colGaps
      : presetGaps(setupC || 6, pairSize === 'custom' ? '2' : pairSize);

  const onRosterFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await readRosterFile(file);
      if (!Object.keys(r).length) {
        alert('파일에서 번호/이름을 찾지 못했습니다.\n「양식 내려받기」로 받은 파일의 이름 칸에 학생 이름을 적어 다시 올려주세요.');
        return;
      }
      setRoster(r);
      showToast(`명렬표 ${Object.keys(r).length}명을 불러왔어요.`);
    } catch {
      alert('파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  const onCloudLoaded = (r) => {
    setCloud(null);
    if (r.kind === 'result') return loadResult(r.data);
    setRoster(r.data.roster);
    if (r.data.className) setClassName(r.data.className);
    showToast(`서버에서 명렬표 ${Object.keys(r.data.roster).length}명을 불러왔어요.`);
  };

  // 서버에 보관할 자리 배치 결과 (암호화 전 내용)
  const resultPayload = () => {
    const used = new Set(seats.map((s) => s.studentNum).filter(Boolean));
    const names = {};
    if (roster) for (const n of used) if (roster[n]) names[n] = roster[n];
    const usedRoles = {};
    for (const [n, r] of Object.entries(roles)) if (used.has(Number(n))) usedRoles[n] = r;
    return {
      cols: dims.cols,
      rows: dims.rows,
      colGaps,
      rowGaps,
      seats: seats.map((s) => ({ status: s.status, studentNum: s.studentNum })),
      roster: names,
      roles: usedRoles,
    };
  };

  // 서버에서 받은 결과를 자리판에 그대로 펼침
  const loadResult = (d) => {
    clearSwap();
    setRoleMode(false);
    runRef.current++;
    sound.stopRiser();
    setCols(String(d.cols));
    setRows(String(d.rows));
    setDims({ cols: d.cols, rows: d.rows });
    setColGaps(d.colGaps);
    setRowGaps(d.rowGaps);
    setPairSize('custom');
    setSeats(d.seats);
    if (Object.keys(d.roster).length) setRoster(d.roster);
    setRoles(d.roles);
    if (d.className) setClassName(d.className);
    drawRef.current = { seats: d.seats, remaining: [], left: 0, cfg: SPEEDS[revealMode] };
    setRevealed(new Set(d.seats.map((_, i) => i)));
    setActiveIdx(null);
    setRollValue(null);
    setCountdown(null);
    setPhase('done');
    setView('board');
    showToast('서버에서 자리 배치 결과를 불러왔어요.');
  };

  // ── 회장·부회장 표시 ── 누를 때마다 회장 → 부회장 → 해제 (회장은 한 명)
  const onRoleClick = (i) => {
    const n = seats[i].studentNum;
    if (!n) return;
    const cur = roles[n];
    const next = { ...roles };
    if (!cur) {
      for (const k of Object.keys(next)) if (next[k] === '회장') delete next[k];
      next[n] = '회장';
    } else if (cur === '회장') next[n] = '부회장';
    else delete next[n];
    setRoles(next);
    sound.tick?.(1.3);
  };

  const applyRosterNumbers = () => {
    if (!rosterInfo) return;
    setMaxNum(String(rosterInfo.max));
    setExcludedText(formatNumberList(rosterInfo.missing));
    showToast(
      `1~${rosterInfo.max}번${rosterInfo.missing.length ? `, 제외 ${formatNumberList(rosterInfo.missing)}` : ''}로 설정했어요.`,
    );
  };

  const clearSwap = () => {
    setSwapMode(false);
    setSwapFrom(null);
    setSwapHistory([]);
    setJustSwapped([]);
  };

  // ── 자리 바꾸기 ──
  // 학생 → 학생: 두 학생 자리 교환 / 학생 → 빈자리: 그 자리로 이동
  const seatLabel = (s) => {
    if (!s?.studentNum) return '빈자리';
    const name = roster?.[s.studentNum];
    return name ? `${s.studentNum}번 ${name}` : `${s.studentNum}번`;
  };

  const onSwapClick = (i) => {
    const s = seats[i];
    if (swapFrom === null) {
      if (!s.studentNum) return; // 첫 선택은 학생이 앉은 자리만
      sound.tick?.(1.2);
      setSwapFrom(i);
      return;
    }
    if (swapFrom === i) {
      setSwapFrom(null);
      return;
    }
    const next = [...seats];
    [next[swapFrom], next[i]] = [next[i], next[swapFrom]];
    const a = seats[swapFrom];
    setSwapHistory((h) => [...h, seats]);
    setSeats(next);
    setJustSwapped([swapFrom, i]);
    setSwapFrom(null);
    sound.ding?.();
    showToast(
      s.studentNum ? `${seatLabel(a)} ↔ ${seatLabel(s)} 자리를 바꿨어요.` : `${seatLabel(a)}을(를) 빈자리로 옮겼어요.`,
    );
    clearTimeout(swapTimerRef.current);
    swapTimerRef.current = setTimeout(() => setJustSwapped([]), 700);
  };

  const undoSwap = () => {
    if (!swapHistory.length) return;
    setSeats(swapHistory[swapHistory.length - 1]);
    setSwapHistory((h) => h.slice(0, -1));
    setSwapFrom(null);
    setJustSwapped([]);
  };

  const resetDraw = () => {
    clearSwap();
    setRoleMode(false);
    sound.stopRiser();
    runRef.current++;
    skipRef.current = false;
    busyRef.current = false;
    setPhase('prepare');
    setRevealed(new Set());
    setActiveIdx(null);
    setRollValue(null);
    setCountdown(null);
    setSeats((prev) => prev.map((s) => (s.status === 'empty' ? emptySeat() : s)));
  };

  const createBoard = () => {
    const c = parseInt(cols, 10);
    const r = parseInt(rows, 10);
    if (isNaN(c) || c <= 0 || isNaN(r) || r <= 0) {
      alert('가로(분단수)와 세로(줄수)를 올바르게 입력해주세요!');
      return;
    }
    if (c * r > 150) {
      alert('자리가 너무 많습니다 (최대 150석)');
      return;
    }
    let next;
    const st = saved.seatSetup;
    if (dims && dims.cols === c && dims.rows === r && seats.length === c * r) {
      next = seats;
    } else if (!seats.length && st && st.cols === c && st.rows === r && st.cells?.length === c * r) {
      next = st.cells.map((v) =>
        v === 'x' ? { status: 'excluded', studentNum: null } : v > 0 ? { status: 'fixed', studentNum: v } : emptySeat(),
      );
    } else {
      next = Array.from({ length: c * r }, emptySeat);
    }
    setSeats(next);
    setDims({ cols: c, rows: r });
    setColGaps(
      pairSize === 'custom' && colGaps.length === c - 1 ? colGaps : presetGaps(c, pairSize === 'custom' ? '2' : pairSize),
    );
    setRowGaps(fitArray(rowGaps, r - 1));
    resetDraw();
    setView('board');
  };

  const finish = () => {
    const d = drawRef.current;
    setRevealed(new Set(d.seats.map((_, i) => i)));
    setActiveIdx(null);
    setRollValue(null);
    setCountdown(null);
    setPhase('done');
    sound.fanfare();
    setConfetti(Date.now());
  };

  // 한 자리의 번호를 슬롯머신처럼 돌리다가 공개
  const rollAndReveal = async (idx, alive, rollMs, hold) => {
    const d = drawRef.current;
    const target = d.seats[idx].studentNum;
    setActiveIdx(idx);
    let t = 0;
    let step = 28;
    while (t < rollMs) {
      if (!alive()) return;
      if (skipRef.current) break;
      const rem = d.remaining;
      setRollValue(rem[Math.floor(Math.random() * rem.length)]);
      sound.tick(1 + (0.6 * t) / rollMs);
      await sleep(step);
      t += step;
      step = Math.min(step * 1.08, 130);
    }
    if (hold && alive() && !skipRef.current) {
      setRollValue('?');
      sound.heartbeat();
      await sleep(hold);
    }
    if (!alive()) return;
    d.remaining = d.remaining.filter((n) => n !== target);
    setRollValue(null);
    setActiveIdx(null);
    setRevealed((prev) => new Set(prev).add(idx));
    sound.ding();
  };

  const startDraw = async () => {
    if (phase !== 'prepare' && phase !== 'done') return;
    if (shortage > 0) return;
    if (!pool.length) {
      showToast('뽑을 번호가 없어요. 번호 설정을 확인하세요.');
      return;
    }
    const id = ++runRef.current;
    const alive = () => runRef.current === id;
    skipRef.current = false;
    busyRef.current = false;
    clearSwap();
    setRoleMode(false);
    sound.unlock();

    const cfg = SPEEDS[revealMode];
    const assigned = shuffle(pool);
    let k = 0;
    const next = seats.map((s) => (s.status === 'excluded' || s.status === 'fixed' ? s : { status: 'empty', studentNum: assigned[k++] ?? null }));
    // 지정석 학생도 뽑기 연출에 섞어서 공개 → 학생들이 누가 지정석인지 알 수 없게
    const fixedNums = next.filter((s) => s.status === 'fixed').map((s) => s.studentNum);
    drawRef.current = { seats: next, remaining: [...assigned, ...fixedNums], cfg };
    setSeats(next);
    setRevealed(new Set());
    setActiveIdx(null);
    setRollValue(null);
    setRollPool([...assigned, ...fixedNums]);

    // 1) 섞기 + 드럼롤 (점점 빨라짐)
    setPhase('shuffling');
    sound.whoosh();
    sound.startRiser(cfg.shuffle / 1000);
    const t0 = performance.now();
    let gap = 120;
    while (performance.now() - t0 < cfg.shuffle) {
      if (!alive()) return;
      if (skipRef.current) break;
      setFlicker((f) => f + 1);
      sound.drum(Math.min(1, (performance.now() - t0) / cfg.shuffle));
      await sleep(gap);
      gap = Math.max(40, gap * 0.94);
    }
    if (!alive()) return;
    sound.crash();

    // 2) 카운트다운
    if (cfg.countdown && !skipRef.current) {
      setPhase('countdown');
      for (const n of [3, 2, 1]) {
        if (!alive() || skipRef.current) break;
        setCountdown(n);
        sound.beep(false);
        await sleep(750);
      }
      setCountdown(null);
    }
    if (!alive()) return;

    // 학생 수보다 자리가 많으면 남는 자리는 바로 빈자리로 공개
    setRevealed(new Set(next.map((s, i) => (s.status === 'empty' && !s.studentNum ? i : -1)).filter((i) => i >= 0)));
    if (skipRef.current) {
      finish();
      return;
    }

    // 3) 한 자리씩 공개
    setPhase('revealing');
    sound.beep(true);
    if (revealMode === 'click') return;

    const order = shuffle(next.map((s, i) => (isDrawTarget(s) ? i : -1)).filter((i) => i >= 0));
    for (let i = 0; i < order.length; i++) {
      if (!alive()) return;
      if (skipRef.current) break;
      const last = i === order.length - 1;
      await rollAndReveal(order[i], alive, last && revealMode !== 'fast' ? cfg.roll * 1.8 : cfg.roll, cfg.hold + (last && revealMode !== 'fast' ? 400 : 0));
      if (!alive()) return;
      if (!skipRef.current) await sleep(cfg.pause);
    }
    if (alive()) finish();
  };

  const revealByClick = async (idx) => {
    if (busyRef.current) return;
    const d = drawRef.current;
    const s = d.seats[idx];
    if (!isDrawTarget(s) || revealed.has(idx)) return;
    busyRef.current = true;
    const id = runRef.current;
    const alive = () => runRef.current === id;
    await rollAndReveal(idx, alive, d.cfg.roll, d.cfg.hold);
    busyRef.current = false;
    if (!alive()) return;
    if (skipRef.current || d.remaining.length === 0) finish();
  };

  const revealAll = () => {
    skipRef.current = true;
    if (phase === 'revealing' && revealMode === 'click' && !busyRef.current) finish();
  };

  const onDeskClick = (i) => {
    if (phase === 'done' && roleMode) {
      onRoleClick(i);
    } else if (phase === 'done' && swapMode) {
      onSwapClick(i);
    } else if (phase === 'prepare') {
      setEditIdx(i);
      setEditNum(seats[i].status === 'fixed' ? String(seats[i].studentNum) : '');
    } else if (phase === 'revealing' && revealMode === 'click') {
      revealByClick(i);
    }
  };

  const applyEdit = (status) => {
    if (editIdx === null) return;
    let n = null;
    if (status === 'fixed') {
      n = parseInt(editNum, 10);
      if (isNaN(n) || n <= 0) {
        alert('올바른 학생 번호를 입력하세요.');
        return;
      }
      if (seats.some((s, i) => i !== editIdx && s.status === 'fixed' && s.studentNum === n)) {
        alert(`${n}번은 이미 다른 자리에 고정되어 있어요.`);
        return;
      }
      if (excludedSet.has(n)) {
        alert(`${n}번은 제외할 번호(전출 등)로 설정되어 있어요.`);
        return;
      }
    }
    const next = [...seats];
    next[editIdx] = { status, studentNum: n };
    setSeats(next);
    setEditIdx(null);
  };

  const toggleColGap = (i) => {
    setColGaps((g) => g.map((v, j) => (j === i ? !v : v)));
    setPairSize('custom');
  };
  const toggleRowGap = (i) => setRowGaps((g) => g.map((v, j) => (j === i ? !v : v)));

  const toastEl = toast && (
    <div className="toast no-print" key={toast.id}>
      {toast.msg}
    </div>
  );

  // ───────────────────────── 설정 화면 ─────────────────────────
  if (view === 'setup') {
    return (
      <div className="app-container">
        <div className="setup-view">
          <h1 className="setup-title">우리반 자리배치표</h1>
          <button className="load-btn" onClick={() => setCloud('download')}>
            <Icon name="cloud_download" /> 저장한 결과·명렬표 불러오기
          </button>
          <div className="setup-top">
          <div className="input-group">
            <div className="input-wrapper">
              <label className="input-label">가로 (분단 수)</label>
              <input
                type="number"
                className="student-input"
                placeholder="예: 6"
                value={cols}
                onChange={(e) => setCols(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createBoard()}
                min="1"
                max="20"
                autoFocus
              />
            </div>
            <span className="multiply-sign">×</span>
            <div className="input-wrapper">
              <label className="input-label">세로 (줄 수)</label>
              <input
                type="number"
                className="student-input"
                placeholder="예: 5"
                value={rows}
                onChange={(e) => setRows(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createBoard()}
                min="1"
                max="20"
              />
            </div>
          </div>
          <LayoutPreview
            cols={setupC}
            rows={setupR}
            colGaps={previewGaps}
            rowGaps={fitArray(rowGaps, setupR - 1)}
            marks={previewMarks}
          />
          </div>

          <div className="setup-cards">
            <section className="setup-card">
              <h2>
                <Icon name="pin" /> 뽑을 번호
              </h2>
              <div className="setup-row">
                <span>1번 ~</span>
                <input
                  type="number"
                  className="mini-input"
                  min="1"
                  max="999"
                  placeholder={setupSeatTotal || '자동'}
                  value={maxNum}
                  onChange={(e) => setMaxNum(e.target.value)}
                />
                <span>번</span>
              </div>
              <p className="setup-help">전학 온 학생이 있으면 마지막 번호를 늘려주세요. 비워두면 자리 수만큼 뽑아요.</p>
              <label className="setup-label" htmlFor="excluded-input">
                제외할 번호 (전출 등)
              </label>
              <input
                id="excluded-input"
                className="text-input"
                placeholder="예: 7, 13  (범위는 20-22)"
                value={excludedText}
                onChange={(e) => setExcludedText(e.target.value)}
              />
              {setupSeatTotal > 0 && (
                <div className={`summary ${setupCount > setupSeatTotal ? 'warn' : ''}`}>
                  1~{setupTop}번 중 <b>{setupCount}명</b>을 뽑아요
                  {excludedNums.length > 0 && <> (제외: {formatNumberList(excludedNums)})</>}
                  <br />
                  자리 {setupSeatTotal}석
                  {setupCount > setupSeatTotal
                    ? ` → ${setupCount - setupSeatTotal}석이 부족해요`
                    : setupCount < setupSeatTotal
                      ? ` → ${setupSeatTotal - setupCount}석은 빈자리 (자리판에서 빼도 돼요)`
                      : ' → 딱 맞아요 ✓'}
                </div>
              )}
            </section>

            <section className="setup-card">
              <h2>
                <Icon name="view_column" /> 짝 / 통로
              </h2>
              <div className="seg">
                {PAIR_PRESETS.map((p) => (
                  <button key={p.v} className={pairSize === p.v ? 'on' : ''} onClick={() => setPairSize(p.v)}>
                    {p.label}
                  </button>
                ))}
                {pairSize === 'custom' && <button className="on">직접 설정</button>}
              </div>
              <p className="setup-help">
                자리판에서 책상 사이를 누르면 붙임 ↔ 통로를 하나씩 바꿀 수 있어요. 줄(행) 사이에도 통로를 넣을 수 있어요.
              </p>
            </section>

            <section className="setup-card">
              <h2>
                <Icon name="badge" /> 명렬표 <span className="optional">선택</span>
              </h2>
              <p className="setup-help">
                명렬표를 올리면 뽑은 번호에 이름이 함께 나와요. 올리지 않아도 번호만으로 뽑을 수 있어요.
              </p>
              <ol className="roster-steps">
                <li>양식을 내려받아요 (번호 1~{templateCount}번이 채워져 있어요)</li>
                <li>이름 칸에 학생 이름을 적어요 (전출 학생은 비워 두기)</li>
                <li>저장한 파일을 다시 올려요</li>
              </ol>
              <div className="setup-row wrap">
                <button className="pill-btn ghost" onClick={() => downloadRosterTemplate(templateCount, className)}>
                  <Icon name="download" /> 양식 내려받기
                </button>
                <label className="pill-btn">
                  <Icon name="upload_file" /> {roster ? '다시 올리기' : '엑셀 올리기'}
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={onRosterFile} hidden />
                </label>
                {roster && (
                  <button className="pill-btn ghost" onClick={() => setRoster(null)}>
                    <Icon name="delete" /> 명렬표 지우기
                  </button>
                )}
              </div>
              {rosterInfo && (
                <div className="roster-info">
                  <span>
                    {rosterInfo.count}명 · 1~{rosterInfo.max}번
                    {rosterInfo.missing.length > 0 && ` · 비어 있는 번호 ${formatNumberList(rosterInfo.missing)}`}
                  </span>
                  <button className="link-btn" onClick={applyRosterNumbers}>
                    명렬표 번호대로 뽑기 설정
                  </button>
                </div>
              )}

              <div className="cloud-box">
                <div className="cloud-title">
                  <Icon name="shield_lock" /> 서버 보관 <span className="optional">선택</span>
                </div>
                <p className="setup-help">
                  비밀번호로 암호화해 서버에 보관하면, 다른 기기(전자칠판 등)에서 코드와 비밀번호로 불러올 수 있어요. 보관해 둔 자리 배치 결과도 여기서 불러와요.
                </p>
                <div className="setup-row wrap">
                  <button
                    className="pill-btn ghost"
                    onClick={() => setCloud('upload')}
                    disabled={!roster}
                    title={roster ? '' : '먼저 명렬표를 올려 주세요'}
                  >
                    <Icon name="cloud_upload" /> 서버에 보관
                  </button>
                  <button className="pill-btn ghost" onClick={() => setCloud('download')}>
                    <Icon name="cloud_download" /> 서버에서 불러오기
                  </button>
                </div>
              </div>

              <label className="remember-row">
                <input type="checkbox" checked={rememberRoster} onChange={(e) => setRememberRoster(e.target.checked)} />
                <span>
                  이 기기에 명렬표 기억하기
                  <small>개인 기기에서만 켜세요. 끄면 창을 닫을 때 이름이 남지 않아요.</small>
                </span>
              </label>
            </section>
          </div>

          <button className="start-btn" onClick={createBoard}>
            자리판 만들기
          </button>
        </div>
        {cloud && (
          <RosterCloud
            mode={cloud}
            roster={roster}
            className={className}
            lastCode={lastCode}
            onCode={setLastCode}
            onLoaded={onCloudLoaded}
            onSaved={onCloudSaved}
            getResult={resultPayload}
            onClose={() => setCloud(null)}
          />
        )}
        {toastEl}
      </div>
    );
  }

  // ───────────────────────── 자리판 화면 ─────────────────────────
  const C = dims.cols;
  const R = dims.rows;
  const editing = phase === 'prepare';
  const busy = phase === 'shuffling' || phase === 'countdown' || phase === 'revealing';
  const drawTotal = drawRef.current ? drawRef.current.seats.filter(isDrawTarget).length : 0;
  const drawDone = drawRef.current ? drawTotal - drawRef.current.remaining.length : 0;

  return (
    <div className="app-container">
      <div className="board-view">
        <div className="blackboard-texture" />
        <div className="board-header">
          <button
            className="control-btn"
            onClick={() => {
              if (phase === 'done') resetDraw();
              else {
                resetDraw();
                setView('setup');
              }
            }}
            disabled={busy || swapMode || roleMode}
          >
            <Icon name={phase === 'done' ? 'edit' : 'arrow_back'} /> {phase === 'done' ? '자리 편집' : '돌아가기'}
          </button>
          <div className="teacher-desk">교 탁 (칠판)</div>
          <div className="controls">
            {editing && (
              <button className="control-btn primary draw-btn" onClick={startDraw} disabled={shortage > 0 || !pool.length}>
                <Icon name="shuffle" /> 자리 뽑기!
              </button>
            )}
            {busy &&
              (phase === 'revealing' && revealMode === 'click' ? (
                <button className="control-btn" onClick={revealAll}>
                  <Icon name="visibility" /> 모두 공개
                </button>
              ) : (
                <button className="control-btn" onClick={() => (skipRef.current = true)}>
                  <Icon name="fast_forward" /> 건너뛰기
                </button>
              ))}
            {phase === 'done' && swapMode && (
              <>
                <button className="control-btn" onClick={undoSwap} disabled={!swapHistory.length}>
                  <Icon name="undo" /> 되돌리기
                </button>
                <button
                  className="control-btn swap-btn active"
                  onClick={() => {
                    setSwapMode(false);
                    setSwapFrom(null);
                  }}
                >
                  <Icon name="check" /> 바꾸기 완료
                </button>
              </>
            )}
            {phase === 'done' && roleMode && (
              <button className="control-btn swap-btn active" onClick={() => setRoleMode(false)}>
                <Icon name="check" /> 표시 완료
              </button>
            )}
            {phase === 'done' && !swapMode && !roleMode && (
              <>
                <button className="control-btn swap-btn" onClick={() => setSwapMode(true)}>
                  <Icon name="swap_horiz" /> 자리 바꾸기
                </button>
                <button className="control-btn swap-btn" onClick={() => setRoleMode(true)}>
                  <Icon name="military_tech" /> 회장·부회장
                </button>
                <button className="control-btn" onClick={() => setCloud('upload-result')}>
                  <Icon name="cloud_upload" /> 결과 보관
                </button>
                <button className="control-btn" onClick={startDraw}>
                  <Icon name="replay" /> 다시 뽑기
                </button>
                <button className="control-btn info" onClick={() => setOverlay('display')}>
                  <Icon name="tv" /> 전자칠판
                </button>
                <button className="control-btn success" onClick={() => setOverlay('print')}>
                  <Icon name="print" /> 인쇄하기
                </button>
              </>
            )}
          </div>
        </div>

        {editing && (
          <>
            <div className="board-toolbar">
              <span className={`status-chip ${shortage > 0 ? 'warn' : ''}`}>
                뽑을 번호 {pool.length}명 · 자리 {drawableCount}석
                {shortage > 0
                  ? ` — ${shortage}석 부족!`
                  : drawableCount > pool.length
                    ? ` (${drawableCount - pool.length}석 빈자리)`
                    : ' ✓'}
              </span>
              <label className="control-btn small tool-select" title="공개 방식">
                <Icon name="timer" />
                <select value={revealMode} onChange={(e) => setRevealMode(e.target.value)}>
                  {Object.entries(SPEEDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="control-btn small" onClick={() => setSoundOn((v) => !v)}>
                <Icon name={soundOn ? 'volume_up' : 'volume_off'} /> {soundOn ? '소리 켬' : '소리 끔'}
              </button>
              <label className="control-btn small">
                <Icon name="badge" /> {roster ? `명렬표 ${rosterInfo.count}명` : '명렬표 (선택)'}
                <input type="file" accept=".xlsx,.xls,.csv" onChange={onRosterFile} hidden />
              </label>
            </div>
            <p className="hint-text">
              {shortage > 0 ? (
                <>
                  <Icon name="warning" style={{ fontSize: '1em' }} /> 뽑을 번호가 자리보다 많아요. 제외한 책상을 되돌리거나
                  ‘돌아가기’에서 번호 설정을 확인하세요.
                </>
              ) : (
                <>
                  <Icon name="touch_app" style={{ fontSize: '1em' }} /> 책상 클릭 → 제외/지정석 설정 · 책상 사이 클릭 →
                  통로/붙임 전환
                </>
              )}
            </p>
          </>
        )}
        {phase === 'revealing' && (
          <p className="reveal-status">
            {revealMode === 'click' ? '반짝이는 책상을 눌러 한 자리씩 공개하세요! ' : '공개 중… '}
            {drawDone} / {drawTotal}
          </p>
        )}
        {phase === 'done' && !swapMode && !roleMode && (
          <p className="reveal-status">🎉 자리 배치 완료! 전자칠판 화면으로 띄우거나 인쇄하세요.</p>
        )}
        {phase === 'done' && roleMode && (
          <p className="reveal-status swap-hint">
            <Icon name="military_tech" style={{ fontSize: '1em' }} /> 학생 자리를 누를 때마다 회장 → 부회장 → 해제 순서로 바뀌어요
            (회장은 한 명)
          </p>
        )}
        {phase === 'done' && swapMode && (
          <p className="reveal-status swap-hint">
            <Icon name="swap_horiz" style={{ fontSize: '1em' }} />{' '}
            {swapFrom === null
              ? '옮길 학생의 자리를 누르세요'
              : `${seatLabel(seats[swapFrom])} 선택됨 → 바꿀 학생 자리나 빈자리를 누르세요 (다시 누르면 취소)`}
          </p>
        )}

        <div className="board-stage">
          <div className="desk-grid-container">
            <div
              className={`desk-grid ${editing ? 'editing' : ''} ${activeIdx != null ? 'spotlight' : ''}`}
              style={{
                gridTemplateColumns: gridTracks(C, colGaps, 'minmax(min(52px, 10.5vw), 1fr)', 'var(--join-w)', 'var(--aisle-w)'),
                gridTemplateRows: gridTracks(R, rowGaps, 'auto', 'var(--row-h)', 'var(--row-aisle-h)'),
                width: '100%',
                // 책상(4:3)이 화면 높이 안에 들어오도록 폭 제한
                maxWidth: `max(min(${C * 60}px, 100%), calc((100dvh - 18.75rem) * ${((C * 4 * 0.88) / (3 * R)).toFixed(3)}))`,
                margin: '0 auto',
              }}
            >
              {seats.map((s, i) => {
                const r = Math.floor(i / C);
                const c = i % C;
                // 뽑기 중에는 지정석도 다른 자리와 똑같이 뒤집혀 있다가 차례로 공개
                const drawable = isDrawTarget(s);
                const swapping = phase === 'done' && swapMode;
                const isRevealed =
                  (s.status === 'fixed' && editing) ||
                  (s.status !== 'excluded' && revealed.has(i)) ||
                  (swapping && s.status === 'excluded');
                const active = activeIdx === i;
                const frontValue = active
                  ? rollValue
                  : phase === 'shuffling' && drawable && rollPool.length
                    ? rollPool[(flicker * 7 + i * 13 + ((flicker * i) % 11)) % rollPool.length]
                    : null;
                const pending = phase === 'revealing' && revealMode === 'click' && drawable && !isRevealed && !active;
                return (
                  <Desk
                    key={i}
                    seat={s}
                    revealed={isRevealed}
                    active={active}
                    frontValue={frontValue}
                    roster={roster}
                    clickable={editing || pending || swapping || (phase === 'done' && roleMode && !!s.studentNum)}
                    pending={pending}
                    swapMode={swapping}
                    markFixed={editing}
                    role={phase === 'done' && s.studentNum ? roles[s.studentNum] : null}
                    roleMode={phase === 'done' && roleMode}
                    swapSelected={swapping && swapFrom === i}
                    justSwapped={justSwapped.includes(i)}
                    shuffling={phase === 'shuffling' && drawable}
                    joinL={c > 0 && !colGaps[c - 1]}
                    joinR={c < C - 1 && !colGaps[c]}
                    onClick={() => onDeskClick(i)}
                    style={{ gridRow: r * 2 + 1, gridColumn: c * 2 + 1, animationDelay: `${-((i * 37) % 10) * 0.03}s` }}
                  />
                );
              })}
              {editing &&
                colGaps.map((g, i) => (
                  <button
                    key={`cg${i}`}
                    className={`gap-strip col ${g ? 'aisle' : 'joined'}`}
                    style={{ gridColumn: i * 2 + 2, gridRow: '1 / -1' }}
                    onClick={() => toggleColGap(i)}
                    title={g ? '통로 → 붙이기' : '붙임 → 통로 만들기'}
                  >
                    {g ? <span className="gap-label">통로</span> : <Icon name="link" />}
                  </button>
                ))}
              {/* 줄 사이 띠는 책상 칸마다 따로 그려서 분단 사이 띠와 겹치지 않게 함 */}
              {editing &&
                rowGaps.flatMap((g, i) =>
                  Array.from({ length: C }, (_, c) => (
                    <button
                      key={`rg${i}-${c}`}
                      className={`gap-strip row ${g ? 'aisle' : ''}`}
                      style={{ gridRow: i * 2 + 2, gridColumn: c * 2 + 1 }}
                      onClick={() => toggleRowGap(i)}
                      title={g ? '통로 없애기' : '이 줄 사이에 통로 만들기'}
                    >
                      {g && c === Math.floor((C - 1) / 2) && <span className="gap-label">통 로</span>}
                    </button>
                  )),
                )}
            </div>
          </div>
          {phase === 'shuffling' && (
            <div className="stage-banner">
              <span>두구두구… 섞는 중!</span>
            </div>
          )}
          {phase === 'countdown' && countdown != null && (
            <div className="stage-banner countdown" key={countdown}>
              <span>{countdown}</span>
            </div>
          )}
        </div>
      </div>

      {editIdx !== null && (
        <div className="modal-overlay" onClick={() => setEditIdx(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">자리 설정</h2>
            <input
              type="number"
              className="modal-input"
              placeholder="학생 번호 입력"
              value={editNum}
              onChange={(e) => setEditNum(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyEdit('fixed')}
              autoFocus
            />
            {roster && roster[parseInt(editNum, 10)] && <p className="modal-name-preview">{roster[parseInt(editNum, 10)]}</p>}
            <div className="modal-actions">
              <button className="modal-btn success" onClick={() => applyEdit('fixed')}>
                이 학생으로 고정하기
              </button>
              <button className="modal-btn danger" onClick={() => applyEdit('excluded')}>
                이 자리 제외하기 (빈 자리)
              </button>
              <button className="modal-btn" onClick={() => applyEdit('empty')}>
                일반 자리로 초기화
              </button>
              <button
                className="modal-btn"
                onClick={() => setEditIdx(null)}
                style={{ marginTop: '0.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay && (
        <ResultOverlay
          mode={overlay}
          onClose={() => setOverlay(null)}
          layout={{ seats, cols: C, rows: R, colGaps, rowGaps, roles }}
          roster={roster}
          onRosterFile={onRosterFile}
          onTemplate={() => downloadRosterTemplate(topNum, className)}
          className={className}
          setClassName={setClassName}
        />
      )}
      {cloud && (
        <RosterCloud
          mode={cloud}
          roster={roster}
          className={className}
          lastCode={lastCode}
          onCode={setLastCode}
          onLoaded={onCloudLoaded}
          onSaved={onCloudSaved}
          getResult={resultPayload}
          onClose={() => setCloud(null)}
        />
      )}
      <Confetti burst={confetti} />
      {toastEl}
    </div>
  );
}