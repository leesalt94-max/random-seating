import { useState, useEffect } from 'react';

// Fisher-Yates Shuffle
function shuffleArray(array) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

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

function App() {
  const [view, setView] = useState('setup');
  const [rows, setRows] = useState('');
  const [cols, setCols] = useState('');
  const [seats, setSeats] = useState([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedDesk, setSelectedDesk] = useState(null);
  const [fixedNumInput, setFixedNumInput] = useState('');

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
    
    // Create empty board with object structure
    const initialSeats = Array.from({ length: total }, () => ({
      status: 'empty',
      studentNum: null
    }));
    setSeats(initialSeats);
    setRevealedCount(0);
    setView('board');
  };

  const handleDrawAll = () => {
    if (isDrawing || revealedCount === seats.length) return;
    setIsDrawing(true);
    
    // 1. Calculate how many students we need to seat
    const validSeatsCount = seats.filter(s => s.status !== 'excluded').length;
    // 2. Identify which student numbers are already fixed
    const fixedStudents = seats.filter(s => s.status === 'fixed').map(s => parseInt(s.studentNum, 10));
    
    // 3. Create pool of remaining student numbers
    const pool = [];
    for (let i = 1; i <= validSeatsCount; i++) {
      if (!fixedStudents.includes(i)) {
        pool.push(i);
      }
    }
    
    // 4. Shuffle the pool
    const shuffled = shuffleArray(pool);
    let poolIndex = 0;
    
    // 5. Assign to empty seats
    const finalSeats = seats.map(s => {
      if (s.status === 'empty') {
        const nextNum = shuffled[poolIndex++];
        return { ...s, studentNum: nextNum || '?' }; // fallback if pool runs out, though math should match
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
  };

  // Modal interactions
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
          <div className="input-group setup-inputs">
            <div className="input-wrapper">
              <label className="input-label">가로 (분단 수)</label>
              <input 
                type="number" 
                className="student-input" 
                placeholder="예: 6" 
                value={cols}
                onChange={(e) => setCols(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
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
                placeholder="예: 4" 
                value={rows}
                onChange={(e) => setRows(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                min="1"
                max="20"
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

  return (
    <div className="app-container">
      <div className="board-view">
        <div className="blackboard-texture"></div>
        
        <div className="board-header">
          <button className="control-btn" onClick={handleReset} disabled={isDrawing}>
            돌아가기
          </button>
          <div className="teacher-desk">교 탁 (칠판)</div>
          <div className="controls">
            <button 
              className="control-btn primary" 
              onClick={handleDrawAll}
              disabled={isDrawing || revealedCount === seats.length}
            >
              자리 뽑기!
            </button>
          </div>
        </div>

        {isPreparing && (
          <p className="hint-text">
            자리 뽑기 전에 책상을 클릭하여 '제외석'이나 '지정석'을 설정할 수 있습니다.
          </p>
        )}

        <div className="desk-grid-container">
          <div 
            className="desk-grid" 
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
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

      {/* Configuration Modal */}
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
              <button className="modal-btn" onClick={() => setSelectedDesk(null)} style={{ marginTop: '1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)' }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
