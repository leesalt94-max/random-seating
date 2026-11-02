import { useState } from 'react';
import {
  uploadEncrypted,
  downloadEncrypted,
  deleteEncrypted,
  passwordProblem,
  codeProblem,
  canonCode,
  classLabel,
  labelProblem,
  suggestCode,
  CODE_EXAMPLE,
  MIN_PASSWORD,
} from './secure';

function Icon({ name }) {
  return <span className="material-symbols-rounded">{name}</span>;
}

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

// mode: 'upload' (명렬표 보관) | 'upload-result' (자리 배치 결과 보관) | 'download' (명렬표·결과 불러오기)
export default function RosterCloud({ mode, roster, className, lastCode, onCode, onLoaded, onSaved, onClose, getResult }) {
  const kind = mode === 'upload-result' ? 'result' : 'roster';
  const uploading = mode !== 'download';
  const suggestion = suggestCode(className, kind);
  const [code, setCode] = useState(uploading ? suggestion : lastCode || '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

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

  // 추천 코드를 그대로 두면 서버가 이번 달 비어 있는 순번으로 만들어 준다
  const autoLabel = (() => {
    if (code.trim() !== suggestion) return null;
    const label = classLabel(className);
    return labelProblem(label) ? null : label;
  })();
  const canon = canonCode(code);
  const shortCode = uploading && !autoLabel && canon && canon.length < 6;

  const summary = (() => {
    if (kind === 'roster') return `학생 ${Object.keys(roster || {}).length}명`;
    const r = getResult?.();
    if (!r) return '';
    const students = r.seats.filter((s) => s.studentNum).length;
    const roleCount = Object.keys(r.roles).length;
    return `자리 ${r.cols * r.rows}석 · 학생 ${students}명${Object.keys(r.roster).length ? ' (이름 포함)' : ''}${
      roleCount ? ` · 회장·부회장 ${roleCount}명` : ''
    }`;
  })();

  const doUpload = () => {
    const problem = (autoLabel ? null : codeProblem(code)) || passwordProblem(pw);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError('비밀번호 확인이 일치하지 않아요.');
    if (!agree) return setError('안내 사항을 확인하고 체크해 주세요.');
    run('암호화해서 보관하는 중…', async () => {
      const payload = kind === 'result' ? { kind, className, ...getResult() } : { className, roster };
      const r = await uploadEncrypted({ kind, payload, password: pw, codeText: code, autoLabel });
      setPw('');
      setPw2('');
      onCode(r.display);
      // 등록이 끝나면 창을 닫고, 실제 등록된 코드는 알림으로 보여 준다 (불러오기 칸에도 미리 채워짐)
      onSaved?.({ ...r, kind });
      onClose();
    });
  };

  const doDownload = () =>
    run('불러오는 중…', async () => {
      const r = await downloadEncrypted(code, pw);
      setPw('');
      onCode(code.trim().replace(/\s+/g, ' '));
      onLoaded(r);
    });

  const doDelete = () => {
    const problem = codeProblem(code);
    if (problem) return setError(problem);
    if (!pw) return setError('삭제하려면 비밀번호를 입력해 주세요.');
    const shown = code.trim().replace(/\s+/g, ' ');
    if (!window.confirm(`서버에서 「${shown}」 자료를 지울까요?\n지우면 이 코드로 다시 불러올 수 없어요.`)) return;
    run('삭제하는 중…', async () => {
      await deleteEncrypted(code, pw);
      setPw('');
      onCode('');
      setResult({ deleted: shown });
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(result.display);
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
          placeholder={uploading ? `비밀번호 (${MIN_PASSWORD}자 이상)` : '비밀번호'}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !uploading && doDownload()}
          autoComplete={uploading ? 'new-password' : 'current-password'}
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
      {uploading && (
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

  const codeInput = (
    <label className="rc-field">
      <span>{uploading ? '불러오기 코드' : '불러오기 코드 (명렬표 또는 결과)'}</span>
      <input
        className="modal-input rc-input rc-code-input"
        placeholder={`예: ${CODE_EXAMPLE}`}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onFocus={(e) => uploading && code === suggestion && e.target.select()}
        autoComplete="off"
        spellCheck={false}
        maxLength={60}
        disabled={!!busy}
        autoFocus={!uploading && !lastCode}
      />
      {uploading && (
        <small>
          {autoLabel ? (
            <>추천 코드예요. 그대로 두면 이번 달 비어 있는 순번(첫번째, 두번째…)으로 만들고, 원하는 코드로 바꿔도 돼요.</>
          ) : (
            <>
              직접 정한 코드로 보관해요. 이미 쓰고 있는 코드면 다른 코드를 정해 달라고 알려 드려요.{' '}
              <button type="button" className="link-btn" onClick={() => setCode(suggestion)}>
                추천 코드로 되돌리기
              </button>
            </>
          )}
        </small>
      )}
      {shortCode && <small className="rc-warn">짧은 코드는 다른 사람이 짐작하기 쉬워요. 비밀번호는 꼭 어렵게 정해 주세요.</small>}
    </label>
  );

  let body;
  if (result?.deleted) {
    body = (
      <>
        <p className="rc-done">
          <Icon name="delete" /> 서버에서 「<b>{result.deleted}</b>」 자료를 지웠어요.
        </p>
        <button className="modal-btn" onClick={onClose}>
          닫기
        </button>
      </>
    );
  } else if (uploading && result) {
    body = (
      <>
        <p className="rc-done">
          <Icon name="lock" /> 암호화해서 서버에 보관했어요.
        </p>
        <div className="rc-code">{result.display}</div>
        <button className="modal-btn" onClick={copyCode}>
          <Icon name={copied ? 'check' : 'content_copy'} /> {copied ? '복사했어요' : '코드 복사'}
        </button>
        <ul className="rc-notes">
          <li>
            다른 기기의 「서버에서 불러오기」에 <b>코드 + 비밀번호</b>를 넣으면{' '}
            {kind === 'result' ? '이 자리 배치 결과를 그대로 열어 인쇄할 수 있어요.' : '명렬표를 받을 수 있어요.'}
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
  } else if (uploading) {
    body = (
      <>
        <p className="rc-sub">{summary}</p>
        {codeInput}
        {pwInputs}
        <div className="rc-info">
          <Icon name="shield_lock" />
          <div>
            {kind === 'result' ? '자리 배치와 학생 이름은' : '명렬표는'} <b>이 기기 안에서 비밀번호로 암호화</b>한 뒤 서버로
            보내요. 서버에는 알아볼 수 없는 암호문만 남고, 비밀번호와 학생 이름은 전송되지 않아요.
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
        {codeInput}
        {pwInputs}
        <button className="modal-btn success" onClick={doDownload} disabled={!!busy}>
          <Icon name="cloud_download" /> {busy || '불러오기'}
        </button>
        <button className="link-btn rc-delete" onClick={doDelete} disabled={!!busy}>
          <Icon name="delete" /> 서버에서 이 자료 지우기
        </button>
      </>
    );
  }

  const title =
    mode === 'upload' ? '명렬표 서버 보관' : mode === 'upload-result' ? '자리 배치 결과 서버 보관' : '서버에서 불러오기';

  return (
    <div className="modal-overlay rc-overlay" onClick={close}>
      <div className="modal-content rc-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal-title">
          <Icon name={uploading ? 'cloud_upload' : 'cloud_download'} /> {title}
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
