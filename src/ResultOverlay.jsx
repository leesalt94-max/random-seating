import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import SeatMap from './SeatMap';

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-rounded ${className}`}>{name}</span>;
}

function DeskBanner({ teacherView, className }) {
  return (
    <div className={className}>
      <span>
        <Icon name="menu_book" /> 교 탁 / 칠 판{teacherView ? '  |  교사 위치' : ''}
      </span>
    </div>
  );
}

function ViewToggle({ teacherView, setTeacherView }) {
  return (
    <button
      className={`pctrl-btn view-toggle-btn ${teacherView ? 'teacher-active' : ''}`}
      onClick={() => setTeacherView((v) => !v)}
      title={teacherView ? '교사 시점 (클릭 시 학생 시점으로 전환)' : '학생 시점 (클릭 시 교사 시점으로 전환)'}
    >
      <Icon name={teacherView ? 'person_pin' : 'groups'} />
      {teacherView ? '교사 시점' : '학생 시점'}
    </button>
  );
}

// mode: 'print' (인쇄/이미지 저장) | 'display' (전자칠판 전체 화면)
// 명렬표 메뉴: 엑셀 올리기 · 양식 내려받기 (서버 보관·불러오기는 첫 화면에서)
function RosterMenu({ roster, onRosterFile, onTemplate }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const count = roster ? Object.keys(roster).length : 0;

  useEffect(() => {
    if (!open) return;
    const away = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const pick = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="roster-menu" ref={boxRef}>
      <button className={`pctrl-btn upload-btn ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name="badge" /> {count ? `명렬표 ${count}명` : '명렬표 (선택)'} <Icon name="expand_more" />
      </button>
      {open && (
        <div className="roster-menu-pop" role="menu">
          <label className="rm-item" role="menuitem">
            <Icon name="upload_file" /> {count ? '엑셀 다시 올리기' : '엑셀 올리기'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                setOpen(false);
                onRosterFile(e);
              }}
              hidden
            />
          </label>
          <div className="rm-sep" />
          <button className="rm-item" role="menuitem" onClick={pick(onTemplate)}>
            <Icon name="download" /> 엑셀 양식 내려받기
          </button>
        </div>
      )}
    </div>
  );
}

export default function ResultOverlay({ mode, onClose, layout, roster, onRosterFile, onTemplate, className, setClassName }) {
  const [teacherView, setTeacherView] = useState(mode === 'print');
  // 인쇄물 날짜 표시 여부 (이 기기에 기억, 기본은 표시)
  const [showDate, setShowDate] = useState(() => {
    try {
      return localStorage.getItem('random-seating:print-date') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleDate = () =>
    setShowDate((v) => {
      try {
        localStorage.setItem('random-seating:print-date', v ? 'off' : 'on');
      } catch {
        // 저장할 수 없는 환경은 무시
      }
      return !v;
    });
  const [saving, setSaving] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const sheetRef = useRef(null);
  const rootRef = useRef(null);
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const map = <SeatMap {...layout} roster={roster} teacherView={teacherView} variant={mode} />;

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    const onKey = (e) => e.key === 'Escape' && !document.fullscreenElement && closeRef.current();
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  // 인쇄·이미지 저장 공통: 화면의 자리표를 그대로 찍어 A4 세로 종이 위쪽에 놓은 그림을 만든다.
  // 인쇄도 이 그림을 그대로 인쇄하므로, 인쇄물과 저장한 이미지가 똑같이 나온다.
  const renderPage = async () => {
    const el = sheetRef.current;
    const scale = Math.min(3, Math.max(2, 2400 / el.offsetWidth));
    const sheet = await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true });
    const A4 = 297 / 210;
    const margin = Math.round(sheet.width * 0.04);
    let pageW = sheet.width + margin * 2;
    let pageH = Math.round(pageW * A4);
    if (sheet.height + margin * 2 > pageH) {
      // 줄이 많아 세로로 길면 높이에 맞추고 좌우 가운데
      pageH = sheet.height + margin * 2;
      pageW = Math.round(pageH / A4);
    }
    const page = document.createElement('canvas');
    page.width = pageW;
    page.height = pageH;
    const ctx = page.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageW, pageH);
    ctx.drawImage(sheet, Math.round((pageW - sheet.width) / 2), margin); // 위쪽부터
    return page;
  };

  const saveImage = async () => {
    if (!sheetRef.current || saving) return;
    setSaving(true);
    try {
      const page = await renderPage();
      const a = document.createElement('a');
      a.download = `자리배치표_${className}_${teacherView ? '교사시점' : '학생시점'}.png`;
      a.href = page.toDataURL('image/png');
      a.click();
    } catch {
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const [printImg, setPrintImg] = useState(null);
  const [printing, setPrinting] = useState(false);
  const printImgRef = useRef(null);
  const doPrint = async () => {
    if (!sheetRef.current || printing) return;
    setPrinting(true);
    try {
      const page = await renderPage();
      setPrintImg(page.toDataURL('image/png'));
    } catch {
      setPrinting(false);
      alert('인쇄 준비 중 오류가 발생했습니다.');
    }
  };
  // 그림이 준비되면 인쇄 창을 연다 (인쇄용 그림은 화면에는 보이지 않음)
  useEffect(() => {
    if (!printImg) return;
    let cancelled = false;
    (async () => {
      try {
        await printImgRef.current?.decode?.();
      } catch {
        // decode를 지원하지 않으면 바로 인쇄
      }
      if (cancelled) return;
      setPrinting(false);
      window.print();
    })();
    return () => {
      cancelled = true;
    };
  }, [printImg]);

  if (mode === 'display') {
    return (
      <div className="display-overlay" ref={rootRef}>
        <div className="display-bar">
          <button className="pctrl-btn close-btn" onClick={onClose}>
            <Icon name="close" /> 닫기
          </button>
          <div className="display-title">
            {className} 자리배치 <span className="display-date">{date}</span>
          </div>
          <div className="pctrl-right">
            <ViewToggle teacherView={teacherView} setTeacherView={setTeacherView} />
            <button className="pctrl-btn close-btn" onClick={toggleFullscreen}>
              <Icon name={isFull ? 'fullscreen_exit' : 'fullscreen'} /> {isFull ? '창 모드' : '전체 화면'}
            </button>
          </div>
        </div>
        <div className="display-stage">
          {!teacherView && <DeskBanner className="display-desk" />}
          {map}
          {teacherView && <DeskBanner teacherView className="display-desk" />}
        </div>
      </div>
    );
  }

  return (
    <div className={`print-overlay ${printImg ? 'has-print-img' : ''}`}>
      <div className="print-page" aria-hidden="true">
        {printImg && <img ref={printImgRef} src={printImg} alt="" />}
      </div>
      <div className="print-controls no-print">
        <button className="pctrl-btn close-btn" onClick={onClose}>
          <Icon name="close" /> 닫기
        </button>
        <div className="pctrl-center">
          <input
            type="text"
            className="class-name-input"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="반 이름 입력"
          />
          <RosterMenu roster={roster} onRosterFile={onRosterFile} onTemplate={onTemplate} />
        </div>
        <div className="pctrl-right">
          <button
            className={`pctrl-btn view-toggle-btn ${showDate ? 'teacher-active' : ''}`}
            onClick={toggleDate}
            title={showDate ? '날짜 표시 중 (누르면 숨김)' : '날짜 숨김 (누르면 표시)'}
            aria-pressed={showDate}
          >
            <Icon name={showDate ? 'event_available' : 'event_busy'} /> {showDate ? '날짜 표시' : '날짜 숨김'}
          </button>
          <ViewToggle teacherView={teacherView} setTeacherView={setTeacherView} />
          <button className="pctrl-btn image-btn" onClick={saveImage} disabled={saving}>
            {saving ? (
              <>
                <Icon name="progress_activity" className="spin" /> 저장 중...
              </>
            ) : (
              <>
                <Icon name="image" /> 이미지 저장
              </>
            )}
          </button>
          <button className="pctrl-btn print-btn" onClick={doPrint} disabled={printing}>
            <Icon name={printing ? 'progress_activity' : 'print'} className={printing ? 'spin' : ''} /> {printing ? '준비 중…' : '인쇄'}
          </button>
        </div>
      </div>
      {!roster && (
        <div className="dummy-notice no-print">
          <Icon name="info" /> 번호만 표시됩니다. 이름도 넣으려면 위의 「명렬표」에서 엑셀을 올리거나, 자리판 화면의 「저장한 결과·명렬표 불러오기」로 서버에 보관한 명렬표를 불러오세요. (선택 사항)
        </div>
      )}
      <div className="print-sheet-wrapper">
        <div className="print-sheet" ref={sheetRef}>
          <div className="ps-header">
            <h1 className="ps-title">{className} 자리배치표</h1>
            {showDate && <p className="ps-date">{date}</p>}
          </div>
          {!teacherView && <DeskBanner className="ps-teacher-desk" />}
          {map}
          {teacherView && <DeskBanner teacherView className="ps-teacher-desk ps-desk-bottom" />}
        </div>
      </div>
    </div>
  );
}