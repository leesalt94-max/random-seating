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
export default function ResultOverlay({ mode, onClose, layout, roster, onRosterFile, onTemplate, className, setClassName }) {
  const [teacherView, setTeacherView] = useState(mode === 'print');
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

  const saveImage = async () => {
    if (!sheetRef.current || saving) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(sheetRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const a = document.createElement('a');
      a.download = `자리배치표_${className}_${teacherView ? '교사시점' : '학생시점'}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch {
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

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
    <div className="print-overlay">
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
          <label className="pctrl-btn upload-btn">
            <Icon name="upload_file" /> {roster ? '명렬표 다시 올리기' : '명렬표 올리기 (선택)'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onRosterFile} hidden />
          </label>
          <button className="pctrl-btn upload-btn" onClick={onTemplate}>
            <Icon name="download" /> 양식 내려받기
          </button>
        </div>
        <div className="pctrl-right">
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
          <button className="pctrl-btn print-btn" onClick={() => window.print()}>
            <Icon name="print" /> PDF 인쇄
          </button>
        </div>
      </div>
      {!roster && (
        <div className="dummy-notice no-print">
          <Icon name="info" /> 번호만 표시됩니다. 이름도 넣으려면 「양식 내려받기」로 받은 파일에 이름을 적어 「명렬표 올리기」로 올리세요. (선택 사항)
        </div>
      )}
      <div className="print-sheet-wrapper">
        <div className="print-sheet" ref={sheetRef}>
          <div className="ps-header">
            <h1 className="ps-title">{className} 자리배치표</h1>
            <p className="ps-date">{date}</p>
          </div>
          {!teacherView && <DeskBanner className="ps-teacher-desk" />}
          {map}
          {teacherView && <DeskBanner teacherView className="ps-teacher-desk ps-desk-bottom" />}
        </div>
      </div>
    </div>
  );
}