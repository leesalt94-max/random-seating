import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

// Fisher-Yates Shuffle
function shuffleArray(array) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

// 더미 학생 데이터 (30명)
const DUMMY_STUDENTS = {
  1: '김민준', 2: '이서연', 3: '박지호', 4: '최수아', 5: '정우진',
  6: '강하은', 7: '조민서', 8: '윤지원', 9: '임도현', 10: '한채원',
  11: '오세준', 12: '신예린', 13: '서태양', 14: '권나연', 15: '배준혁',
  16: '유소희', 17: '문지훈', 18: '김아린', 19: '이현우', 20: '박서진',
  21: '최민아', 22: '정시후', 23: '강도윤', 24: '조예서', 25: '윤태오',
  26: '임수빈', 27: '한지민', 28: '오준서', 29: '신다은', 30: '서민재'
};

// ========================
//   PRINT VIEW COMPONENT
// ========================
function PrintView({ seats, cols, onClose }) {
  const printRef = useRef(null);
  const [nameMap, setNameMap] = useState(DUMMY_STUDENTS);
  const [usingDummy, setUsingDummy] = useState(true);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [className, setClassName] = useState('1학년 1반');
  // 기본값: 교사 시점 (칠판을 등지고 학생과 마주보는 방향 → 좌우 반전)
  const [teacherView, setTeacherView] = useState(true);

  const numCols = parseInt(cols) || 1;

  // ── 교사 시점 변환 ──────────────────────────────────
  // 교사는 칠판을 등지고 학생을 바라보므로 각 행의 좌우가 반전
  const displaySeats = (() => {
    if (!teacherView) return seats;
    const result = [];
    for (let r = 0; r < seats.length; r += numCols) {
      const row = seats.slice(r, r + numCols);
      result.push(...[...row].reverse());
    }
    return result;
  })();

  // Excel/CSV 업로드 파싱
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const map = {};
        data.forEach((row) => {
          const num = parseInt(row[0]);
          const name = row[1];
          if (!isNaN(num) && name) {
            map[num] = String(name).trim();
          }
        });
        if (Object.keys(map).length === 0) {
          alert('파일에서 번호/이름 데이터를 찾지 못했습니다.\nA열: 번호, B열: 이름 형식으로 작성해주세요.');
          return;
        }
        setNameMap(map);
        setUsingDummy(false);
      } catch {
        alert('파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // 브라우저 인쇄 (PDF 저장 가능)
  const handlePrint = () => {
    window.print();
  };

  // 이미지로 저장
  const handleSaveImage = async () => {
    if (!printRef.current || isSavingImage) return;
    setIsSavingImage(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `자리배치표_${className}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingImage(false);
    }
  };

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="print-overlay">
      {/* 상단 컨트롤 패널 (인쇄 시 숨김) */}
      <div className="print-controls no-print">
        <button className="pctrl-btn close-btn" onClick={onClose}>
          <span className="material-symbols-rounded">close</span> 닫기
        </button>

        <div className="pctrl-center">
          <input
            type="text"
            className="class-name-input"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="반 이름 입력"
          />
          <label className="pctrl-btn upload-btn">
            <span className="material-symbols-rounded">upload_file</span> 엑셀 업로드
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              hidden
            />
          </label>
          {usingDummy && (
            <span className="dummy-badge">더미 데이터 사용 중</span>
          )}
        </div>

        <div className="pctrl-right">
          {/* 시점 전환 토글 */}
          <button
            className={`pctrl-btn view-toggle-btn ${teacherView ? 'teacher-active' : ''}`}
            onClick={() => setTeacherView(v => !v)}
            title={teacherView ? '교사 시점 (클릭 시 학생 시점으로 전환)' : '학생 시점 (클릭 시 교사 시점으로 전환)'}
          >
            <span className="material-symbols-rounded">
              {teacherView ? 'person_pin' : 'groups'}
            </span>
            {teacherView ? '교사 시점' : '학생 시점'}
          </button>

          <button
            className="pctrl-btn image-btn"
            onClick={handleSaveImage}
            disabled={isSavingImage}
          >
            {isSavingImage
              ? <><span className="material-symbols-rounded spin">progress_activity</span> 저장 중...</>
              : <><span className="material-symbols-rounded">image</span> 이미지 저장</>
            }
          </button>
          <button className="pctrl-btn print-btn" onClick={handlePrint}>
            <span className="material-symbols-rounded">print</span> PDF 인쇄
          </button>
        </div>
      </div>

      {/* 인쇄 안내 */}
      {usingDummy && (
        <div className="dummy-notice no-print">
          <span className="material-symbols-rounded" style={{fontSize:'1rem',verticalAlign:'middle'}}>info</span>{' '}
          현재 <strong>더미 데이터</strong>가 사용 중입니다. 실제 학생 명단 엑셀(A열: 번호 / B열: 이름)을 업로드하세요.
        </div>
      )}

      {/* 인쇄될 자리배치표 */}
      <div className="print-sheet-wrapper">
        <div className="print-sheet" ref={printRef}>

          {/* 문서 헤더 */}
          <div className="ps-header">
            <h1 className="ps-title">{className} 자리배치표</h1>
            <p className="ps-date">
              {today}&nbsp;
              <span className={`ps-view-label ${teacherView ? 'teacher' : 'student'}`}>
                {teacherView ? '📐 교사 시점' : '🎒 학생 시점'}
              </span>
            </p>
          </div>

          {/* 학생 시점: 칠판이 위쪽 */}
          {!teacherView && (
            <div className="ps-teacher-desk">
              <span>
                <span className="material-symbols-rounded" style={{fontSize:'1.1em',verticalAlign:'middle'}}>menu_book</span>
                {' '}교 탁 / 칠 판
              </span>
            </div>
          )}

          {/* 시점 안내 배너 */}
          <div className={`ps-perspective-banner ${teacherView ? 'ps-perspective-teacher' : 'ps-perspective-student'}`}>
            {teacherView
              ? '← 교사 기준: 왼쪽 분단 / 앞줄이 교사 바로 앞 →'
              : '← 학생 기준: 왼쪽 분단 / 앞줄이 칠판 바로 앞 →'
            }
          </div>

          {/* 자리 그리드 */}
          <div
            className="ps-grid"
            style={{ gridTemplateColumns: `repeat(${numCols}, 1fr)` }}
          >
            {displaySeats.map((seat, index) => {
              if (seat.status === 'excluded') {
                return (
                  <div key={index} className="ps-cell excluded">
                    <span className="cell-x">빈자리</span>
                  </div>
                );
              }
              const num = seat.studentNum;
              const name = num ? (nameMap[num] || '?') : '-';
              return (
                <div key={index} className={`ps-cell ${seat.status === 'fixed' ? 'fixed' : ''}`}>
                  <span className="cell-num">{num ? `${num}번` : ''}</span>
                  <span className="cell-name">{name}</span>
                </div>
              );
            })}
          </div>

          {/* 교사 시점: 칠판이 아래쪽 (교사 등 뒤) */}
          {teacherView && (
            <div className="ps-teacher-desk ps-desk-bottom">
              <span>
                <span className="material-symbols-rounded" style={{fontSize:'1.1em',verticalAlign:'middle'}}>menu_book</span>
                {' '}교 탁 / 칠 판 &nbsp;|&nbsp; 교사 위치
              </span>
            </div>
          )}

          {/* 더미 안내 (인쇄물에도 표시) */}
          {usingDummy && (
            <p className="ps-dummy-note">※ 더미 데이터 적용됨 — 실제 명단으로 교체 후 인쇄하세요</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================
//    DESK COMPONENT
// ========================
function Desk({ seat, isRevealed, onClick, isPreparing }) {
  const { status, studentNum } = seat;
  const classes = [
    'desk-wrapper',
    isRevealed ? 'flipped' : '',
    status === 'excluded' ? 'excluded' : '',
    status === 'fixed' ? 'fixed' : '',
    isPreparing ? 'clickable' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={isPreparing ? onClick : undefined}>
      <div className="desk-inner">
        <div className="desk-front"></div>
        <div className="desk-back">{status === 'excluded' ? '' : studentNum}</div>
      </div>
    </div>
  );
}

// ========================
//      MAIN APP
// ========================
function App() {
  const [view, setView] = useState('setup');
  const [rows, setRows] = useState('');
  const [cols, setCols] = useState('');
  const [seats, setSeats] = useState([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedDesk, setSelectedDesk] = useState(null);
  const [fixedNumInput, setFixedNumInput] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  // Initialize board
  const handleStart = () => {
    const r = parseInt(rows, 10);
    const c = parseInt(cols, 10);
    if (isNaN(r) || r <= 0 || isNaN(c) || c <= 0) {
      alert('가로(분단수)와 세로(줄수)를 올바르게 입력해주세요!');
      return;
    }
    const total = r * c;
    if (total > 150) {
      alert('자리가 너무 많습니다 (최대 150석)');
      return;
    }
    const initialSeats = Array.from({ length: total }, () => ({
      status: 'empty',
      studentNum: null
    }));
    setSeats(initialSeats);
    setRevealedCount(0);
    setShowPrint(false);
    setView('board');
  };

  const handleDrawAll = () => {
    if (isDrawing || revealedCount === seats.length) return;
    setIsDrawing(true);

    const validSeatsCount = seats.filter(s => s.status !== 'excluded').length;
    const fixedStudents = seats.filter(s => s.status === 'fixed').map(s => parseInt(s.studentNum, 10));

    const pool = [];
    for (let i = 1; i <= validSeatsCount; i++) {
      if (!fixedStudents.includes(i)) pool.push(i);
    }

    const shuffled = shuffleArray(pool);
    let poolIndex = 0;

    const finalSeats = seats.map(s => {
      if (s.status === 'empty') {
        const nextNum = shuffled[poolIndex++];
        return { ...s, studentNum: nextNum || '?' };
      }
      return s;
    });

    setSeats(finalSeats);
    setRevealedCount(0);

    let count = 0;
    const interval = setInterval(() => {
      count++;
      setRevealedCount(count);
      if (count >= seats.length) {
        clearInterval(interval);
        setIsDrawing(false);
      }
    }, 200);
  };

  const handleReset = () => {
    setView('setup');
    setSeats([]);
    setRevealedCount(0);
    setIsDrawing(false);
    setShowPrint(false);
  };

  const openModal = (index) => {
    if (isDrawing || revealedCount > 0) return;
    setSelectedDesk(index);
    setFixedNumInput(seats[index].studentNum || '');
  };

  const updateSeatStatus = (status) => {
    if (selectedDesk === null) return;
    const newSeats = [...seats];
    let num = null;
    if (status === 'fixed') {
      num = parseInt(fixedNumInput, 10);
      if (isNaN(num) || num <= 0) {
        alert('올바른 학생 번호를 입력하세요.');
        return;
      }
    }
    newSeats[selectedDesk] = { status, studentNum: num };
    setSeats(newSeats);
    setSelectedDesk(null);
  };

  if (view === 'setup') {
    return (
      <div className="app-container">
        <div className="setup-view">
          <h1 className="setup-title">우리반 자리배치표</h1>
          <div className="input-group">
            <div className="input-wrapper">
              <label className="input-label">가로 (분단 수)</label>
              <input
                type="number"
                className="student-input"
                placeholder="예: 6"
                value={cols}
                onChange={(e) => setCols(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                min="1" max="20" autoFocus
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
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                min="1" max="20"
              />
            </div>
          </div>
          <button className="start-btn" onClick={handleStart}>
            자리판 만들기
          </button>
        </div>
      </div>
    );
  }

  const isPreparing = !isDrawing && revealedCount === 0;
  const allRevealed = !isDrawing && seats.length > 0 && revealedCount >= seats.length;

  return (
    <div className="app-container">
      <div className="board-view">
        <div className="blackboard-texture"></div>

        <div className="board-header">
          <button className="control-btn" onClick={handleReset} disabled={isDrawing}>
            <span className="material-symbols-rounded">arrow_back</span> 돌아가기
          </button>
          <div className="teacher-desk">교 탁 (칠판)</div>
          <div className="controls">
            {allRevealed ? (
              <button className="control-btn success" onClick={() => setShowPrint(true)}>
                <span className="material-symbols-rounded">print</span> 인쇄하기
              </button>
            ) : (
              <button
                className="control-btn primary"
                onClick={handleDrawAll}
                disabled={isDrawing || revealedCount === seats.length}
              >
                <span className="material-symbols-rounded">shuffle</span> 자리 뽑기!
              </button>
            )}
          </div>
        </div>

        {isPreparing && (
          <p className="hint-text">
            <span className="material-symbols-rounded" style={{fontSize:'1em',verticalAlign:'middle'}}>touch_app</span> 책상 클릭 → 제외/지정석 설정 가능
          </p>
        )}

        <div className="desk-grid-container">
          <div
            className="desk-grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(55px, 1fr))`,
              width: '100%',
            }}
          >
            {seats.map((seat, index) => (
              <Desk
                key={index}
                seat={seat}
                isRevealed={index < revealedCount || seat.status === 'fixed'}
                onClick={() => openModal(index)}
                isPreparing={isPreparing}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 자리 설정 모달 */}
      {selectedDesk !== null && (
        <div className="modal-overlay" onClick={() => setSelectedDesk(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">자리 설정</h2>
            <input
              type="number"
              className="modal-input"
              placeholder="학생 번호 입력"
              value={fixedNumInput}
              onChange={(e) => setFixedNumInput(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-btn success" onClick={() => updateSeatStatus('fixed')}>
                이 학생으로 고정하기
              </button>
              <button className="modal-btn danger" onClick={() => updateSeatStatus('excluded')}>
                이 자리 제외하기 (빈 자리)
              </button>
              <button className="modal-btn" onClick={() => updateSeatStatus('empty')}>
                일반 자리로 초기화
              </button>
              <button
                className="modal-btn"
                onClick={() => setSelectedDesk(null)}
                style={{ marginTop: '0.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 인쇄 뷰 */}
      {showPrint && (
        <PrintView
          seats={seats}
          cols={cols}
          rows={rows}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}

export default App;
