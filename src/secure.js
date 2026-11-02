// ─────────────────────────────────────────────────────────────
//  명렬표 · 자리 배치 결과 서버 보관 — 브라우저 안에서만 암호화/복호화 (종단간 암호화)
//
//  · 비밀번호 → PBKDF2-SHA256(60만 회, 무작위 salt) → 512비트
//      앞 256비트: AES-256-GCM 암호화 키 (브라우저 밖으로 나가지 않음)
//      뒤 256비트: 인증키 (서버는 이 값의 SHA-256만 저장해 비교)
//  · 서버에는 salt · iv · 암호문 · 인증키 해시만 저장된다.
//    비밀번호와 학생 이름은 서버로 전송되지 않는다.
//  · 자료 종류(명렬표/결과)는 AES-GCM 추가 인증 데이터(AAD)에 묶어, 서버가 바꿔치기할 수 없다.
// ─────────────────────────────────────────────────────────────

const ITERATIONS = 600000;
const AAD = {
  roster: new TextEncoder().encode('random-seating:roster:v1'),
  result: new TextEncoder().encode('random-seating:result:v1'),
};
const API = '/api/roster';

export const MIN_PASSWORD = 8;

const WEAK = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
  'password', 'password1', 'qwertyui', 'qwer1234', 'asdf1234', '1q2w3e4r', '1q2w3e4r!',
  'abcd1234', 'a1234567', 'iloveyou', '비밀번호', 'admin123',
]);

export function passwordProblem(pw) {
  if (!pw || pw.length < MIN_PASSWORD) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`;
  if (pw.length > 128) return '비밀번호가 너무 길어요.';
  if (/^(.)\1+$/.test(pw) || WEAK.has(pw.toLowerCase())) return '너무 쉬운 비밀번호예요. 다른 비밀번호를 써 주세요.';
  return null;
}

// ─────────────────────────── 코드 ───────────────────────────
// 교사가 원하는 코드를 자유롭게 정할 수 있다. 추천 형식은 "26년 11월 1-5반 첫번째 (결과)".
// 서버에는 띄어쓰기를 뺀 정규형으로 저장하므로, 띄어쓰기·영문 대소문자가 달라도 같은 코드다.
// 추천 형식은 "첫 번째"/"1번째"/"2026년"처럼 적어도 같은 코드로 알아본다.
const ORD = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열',
  '열한', '열두', '열세', '열네', '열다섯', '열여섯', '열일곱', '열여덟', '열아홉', '스무'];
const ORD_ALIAS = { 한: 1, 둘: 2, 셋: 3, 넷: 4, 스물: 20 };
const ORD_WORDS = [...ORD, ...Object.keys(ORD_ALIAS)].sort((a, b) => b.length - a.length);
const REC_PARSE = new RegExp(
  `^(?:20)?(\\d{2})년(\\d{1,2})월(.+?)(\\d{1,2}|${ORD_WORDS.join('|')})(?:번째|번|째)(결과)?$`,
);
const REC_CANON = /^(\d{2})년(\d{1,2})월(.+)#(\d+)(결과)?$/;
const CODE_CHARS = /^[가-힣ㄱ-ㅎA-Z0-9#\-_.()]{2,40}$/u;

export const CODE_EXAMPLE = '26년 11월 1-5반 첫번째';
export const ordinalWord = (n) => (n >= 1 && n <= ORD.length ? ORD[n - 1] : String(n));

// 반 이름 → 추천 코드용 짧은 이름. "1학년 5반" → "1-5반"
export function classLabel(className) {
  const s = String(className || '').trim();
  const m = s.match(/(\d+)\s*학년\s*(\d+)\s*반/);
  if (m) return `${m[1]}-${m[2]}반`;
  return s.replace(/\s+/g, '').replace(/[^가-힣A-Za-z0-9-]/g, '').slice(0, 20);
}

export function labelProblem(label) {
  if (!label) return '반 이름을 적어 주세요. (예: 1-5반)';
  if (!/^[가-힣A-Za-z0-9-]{1,20}$/.test(label)) return '반 이름은 한글·영문·숫자·하이픈(-)으로 20자까지 적어 주세요.';
  if (/\d$/.test(label)) return '반 이름은 숫자로 끝나지 않게 적어 주세요. (예: 1-5 → 1-5반)';
  return null;
}

// 추천 코드 (화면 표기). 실제 순번은 서버가 비어 있는 첫 번호로 정한다.
export function suggestCode(className, kind) {
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}년 ${d.getMonth() + 1}월 ${classLabel(className)} 첫번째${kind === 'result' ? ' 결과' : ''}`;
}

// 입력 → 정규형 (쓸 수 없는 코드면 null)
export function canonCode(text) {
  const s = String(text || '').normalize('NFC').replace(/\s+/g, '');
  const m = s.match(REC_PARSE);
  if (m) {
    const month = parseInt(m[2], 10);
    const o = m[4];
    const n = /^\d+$/.test(o) ? parseInt(o, 10) : ORD.indexOf(o) + 1 || ORD_ALIAS[o];
    if (month >= 1 && month <= 12 && n >= 1 && n <= 50 && !labelProblem(m[3])) {
      return `${m[1]}년${month}월${m[3].toUpperCase()}#${n}${m[5] || ''}`;
    }
  }
  const plain = s.replace(/[a-z]/g, (c) => c.toUpperCase());
  return CODE_CHARS.test(plain) ? plain : null;
}

export function codeProblem(text) {
  const s = String(text || '').trim();
  if (!s) return '코드를 적어 주세요.';
  if (s.replace(/\s+/g, '').length < 2) return '코드는 2자 이상으로 정해 주세요.';
  if (!canonCode(s)) return '코드에는 한글·영문·숫자와 - _ . ( ) # 만 쓸 수 있어요. (40자까지)';
  return null;
}

// 정규형 → 화면 표기
export function displayCode(canon) {
  const m = String(canon || '').match(REC_CANON);
  if (!m) return String(canon || '');
  return `${m[1]}년 ${m[2]}월 ${m[3]} ${ordinalWord(parseInt(m[4], 10))}번째${m[5] ? ' 결과' : ''}`;
}

// ─────────────────────────── 암호화 ───────────────────────────
const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function deriveKeys(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, 512),
  );
  const aesKey = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const auth = bits.slice(32);
  bits.fill(0);
  return { aesKey, auth: b64(auth) };
}

async function sha256Hex(b64str) {
  return hex(await crypto.subtle.digest('SHA-256', unb64(b64str)));
}

class ApiError extends Error {}

async function call(body) {
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    // 응답 본문이 없거나 JSON이 아님
  }
  if (!res.ok) throw new ApiError(data.error || `서버 오류가 발생했어요. (${res.status})`);
  return data;
}

// 암호화해서 서버에 보관 → { code(화면 표기), expiresAt }
//   codeText 가 추천 코드 그대로면 서버가 빈 순번을 골라 주고(auto), 아니면 그 코드 그대로 쓴다.
export async function uploadEncrypted({ kind, payload, password, codeText, autoLabel }) {
  const problem = passwordProblem(password) || (autoLabel ? labelProblem(autoLabel) : codeProblem(codeText));
  if (problem) throw new ApiError(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { aesKey, auth } = await deriveKeys(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, ...payload, savedAt: Date.now() }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD[kind] }, aesKey, plain);
  const where = autoLabel ? { auto: { label: autoLabel } } : { code: canonCode(codeText) };
  const r = await call({ action: 'create', kind, ...where, salt: b64(salt), iv: b64(iv), ct: b64(ct), verifier: await sha256Hex(auth) });
  return { ...r, display: autoLabel ? displayCode(r.code) : String(codeText).trim().replace(/\s+/g, ' ') };
}

async function authFor(codeText, password) {
  const problem = codeProblem(codeText);
  if (problem) throw new ApiError(problem);
  if (!password) throw new ApiError('비밀번호를 입력해 주세요.');
  const c = canonCode(codeText);
  const { salt } = await call({ action: 'salt', code: c });
  return { c, ...(await deriveKeys(password, unb64(salt))) };
}

const cleanName = (v) => (typeof v === 'string' ? v.slice(0, 40) : null);
function cleanRoster(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const n = parseInt(k, 10);
    const name = cleanName(v);
    if (n > 0 && n < 1000 && name) out[n] = name;
  }
  return out;
}

// 결과 자료 검사 (암호문이 풀렸더라도 형식이 이상하면 쓰지 않는다)
function cleanResult(d) {
  const cols = parseInt(d.cols, 10);
  const rows = parseInt(d.rows, 10);
  if (!(cols >= 1 && cols <= 20 && rows >= 1 && rows <= 20 && cols * rows <= 150)) throw new ApiError('자리 배치 자료가 올바르지 않아요.');
  if (!Array.isArray(d.seats) || d.seats.length !== cols * rows) throw new ApiError('자리 배치 자료가 올바르지 않아요.');
  const seats = d.seats.map((s) => {
    const status = ['empty', 'fixed', 'excluded'].includes(s?.status) ? s.status : 'empty';
    const n = parseInt(s?.studentNum, 10);
    return { status, studentNum: status !== 'excluded' && n > 0 && n < 1000 ? n : null };
  });
  const gaps = (arr, len) => Array.from({ length: len }, (_, i) => Boolean(Array.isArray(arr) && arr[i]));
  const roles = {};
  for (const [k, v] of Object.entries(d.roles || {})) {
    const n = parseInt(k, 10);
    if (n > 0 && n < 1000 && (v === '회장' || v === '부회장')) roles[n] = v;
  }
  return {
    cols,
    rows,
    seats,
    colGaps: gaps(d.colGaps, cols - 1),
    rowGaps: gaps(d.rowGaps, rows - 1),
    roster: cleanRoster(d.roster),
    roles,
    className: cleanName(d.className) || '',
  };
}

// 서버에서 받아 복호화 → { kind, data, expiresAt, code }
export async function downloadEncrypted(codeText, password) {
  const { c, aesKey, auth } = await authFor(codeText, password);
  const { kind, iv, ct, expiresAt } = await call({ action: 'get', code: c, auth });
  if (!AAD[kind]) throw new ApiError('알 수 없는 자료예요.');
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: AAD[kind] }, aesKey, unb64(ct));
  } catch {
    throw new ApiError('자료를 풀 수 없어요. 비밀번호를 확인해 주세요.');
  }
  const raw = JSON.parse(new TextDecoder().decode(plain));
  const data =
    kind === 'result'
      ? cleanResult(raw)
      : { roster: cleanRoster(raw.roster), className: cleanName(raw.className) || '' };
  return { kind, data, expiresAt, code: c };
}

export async function deleteEncrypted(codeText, password) {
  const { c, auth } = await authFor(codeText, password);
  await call({ action: 'delete', code: c, auth });
}
