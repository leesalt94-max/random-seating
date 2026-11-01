import { useState } from 'react';
import { uploadRoster, downloadRoster, deleteRoster, passwordProblem, normalizeCode, MIN_PASSWORD } from './secure';

function Icon({ name }) {
  return <span className="material-symbols-rounded">{name}</span>;
}

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

// mode: 'upload' (서버에 보관) | 'download' (서버에서 불러오기)
export default function RosterCloud({ mode, roster, className, lastCode, onCode, onLoaded, onClose }) {
  const [code, setCode] = useState(lastCode || '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const count = Object.keys(roster || {}).length;
  const close = () => {
    if (!busy) onClose();
  };

  const run = async (label, fn) => {
    setError('');
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e?.message || '오류가 발생했어요.');
    } finally {
      setBusy('');
    }
  };

  const doUpload = () => {
    const problem = passwordProblem(pw);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError('비밀번호 확인이 일치하지 않아요.');
    if (!agree) return setError('안내 사항을 확인하고 체크해 주세요.');
    run('암호화해서 보관하는 중…', async () => {
      const r = await uploadRoster(roster, className, pw);
      setPw('');
      setPw2('');
      setResult(r);
      onCode(r.code);
    });
  };

  const doDownload = () =>
    run('불러오는 중…', async () => {
      const r = await downloadRoster(code, pw);
      setPw('');
      onCode(normalizeCode(code));
      onLoaded(r);
    });

  const doDelete = () => {
    const c = normalizeCode(code);
    if (!c) return setError('불러오기 코드는 8자리예요. (예: K7QM-4XPA)');
    if (!pw) return setError('삭제하려면 비밀번호를 입력해 주세요.');
    if (!window.confirm(`서버에서 ${c} 명렬표를 지울까요?\n지우면 이 코드로 다시 불러올 수 없어요.`)) return;
    run('삭제하는 중…', async () => {
      await deleteRoster(c, pw);
      setPw('');
      onCode('');
      setResult({ deleted: c });
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
    } catch {
      // 복사 권한이 없으면 화면의 코드를 직접 적어 두면 됨
    }
  };

  const pwInputs = (
    <>
      <div className="rc-pw-row">
        <input
          type={showPw ? 'text' : 'password'}
          className="modal-input rc-input"
          placeholder={mode === 'upload' ? `비밀번호 (${MIN_PASSWORD}자 이상)` : '비밀번호'}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && mode === 'download' && doDownload()}
          autoComplete={mode === 'upload' ? 'new-password' : 'current-password'}
          maxLength={128}
          disabled={!!busy}
        />
        <button
          type="button"
          className="rc-eye"
          onClick={() => setShowPw((v) => !v)}
          title={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
        >
          <Icon name={showPw ? 'visibility_off' : 'visibility'} />
        </button>
      </div>
      {mode === 'upload' && (
        <input
          type={showPw ? 'text' : 'password'}
          className="modal-input rc-input"
          placeholder="비밀번호 확인"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          maxLength={128}
          disabled={!!busy}
        />
      )}
    </>
  );

  let body;
  if (result?.deleted) {
    body = (
      <>
        <p className="rc-done">
          <Icon name="delete" /> 서버에서 <b>{result.deleted}</b> 명렬표를 지웠어요.
        </p>
        <button className="modal-btn" onClick={onClose}>
          닫기
        </button>
      </>
    );
  } else if (mode === 'upload' && result) {
    body = (
      <>
        <p className="rc-done">
          <Icon name="lock" /> 암호화해서 서버에 보관했어요.
        </p>
        <div className="rc-code">{result.code}</div>
        <button className="modal-btn" onClick={copyCode}>
          <Icon name={copied ? 'check' : 'content_copy'} /> {copied ? '복사했어요' : '코드 복사'}
        </button>
        <ul className="rc-notes">
          <li>
            다른 기기에서 <b>불러오기 코드 + 비밀번호</b>를 넣으면 명렬표를 받을 수 있어요.
          </li>
          <li>
            <b>{fmtDate(result.expiresAt - 1000)}</b>까지 보관되고, 그 뒤 서버에서 자동으로 지워져요.
          </li>
          <li>비밀번호는 서버에 저장되지 않아 잊으면 되찾을 수 없어요. 코드와 비밀번호를 따로 적어 두세요.</li>
        </ul>
        <button className="modal-btn success" onClick={onClose}>
          확인
        </button>
      </>
    );
  } else if (mode === 'upload') {
    body = (
      <>
        <p className="rc-sub">
          {className} · 학생 <b>{count}명</b>
        </p>
        {pwInputs}
        <div className="rc-info">
          <Icon name="shield_lock" />
          <div>
            명렬표는 <b>이 기기 안에서 비밀번호로 암호화</b>한 뒤 서버로 보내요. 서버에는 알아볼 수 없는 암호문만 남고,
            비밀번호와 학생 이름은 전송되지 않아요.
          </div>
        </div>
        <label className="rc-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={!!busy} />
          <span>
            비밀번호를 잊으면 복구할 수 없고, 학년말(2월 말)에 자동 삭제된다는 것을 확인했어요. 학생 정보 보관은 학교 지침에
            맞게 사용할게요.
          </span>
        </label>
        <button className="modal-btn success" onClick={doUpload} disabled={!!busy}>
          <Icon name="cloud_upload" /> {busy || '암호화해서 서버에 보관'}
        </button>
      </>
    );
  } else {
    body = (
      <>
        <input
          className="modal-input rc-input rc-code-input"
          placeholder="불러오기 코드 (예: K7QM-4XPA)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          disabled={!!busy}
          autoFocus={!lastCode}
        />
        {pwInputs}
        <button className="modal-btn success" onClick={doDownload} disabled={!!busy}>
          <Icon name="cloud_download" /> {busy || '명렬표 불러오기'}
        </button>
        <button className="link-btn rc-delete" onClick={doDelete} disabled={!!busy}>
          <Icon name="delete" /> 서버에서 이 명렬표 지우기
        </button>
      </>
    );
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-content rc-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal-title">
          <Icon name={mode === 'upload' ? 'cloud_upload' : 'cloud_download'} />{' '}
          {mode === 'upload' ? '명렬표 서버 보관' : '서버에서 명렬표 불러오기'}
        </h2>
        {error && (
          <p className="rc-error" role="alert">
            {error}
          </p>
        )}
        {body}
        {!result && (
          <button
            className="modal-btn"
            onClick={close}
            disabled={!!busy}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            취소
          </button>
        )}
      </div>
    </div>
  );
}
