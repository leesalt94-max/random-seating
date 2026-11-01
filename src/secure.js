// ─────────────────────────────────────────────────────────────
//  명렬표 서버 보관 — 브라우저 안에서만 암호화/복호화 (종단간 암호화)
//
//  · 비밀번호 → PBKDF2-SHA256(60만 회, 무작위 salt) → 512비트
//      앞 256비트: AES-256-GCM 암호화 키 (브라우저 밖으로 나가지 않음)
//      뒤 256비트: 인증키 (서버는 이 값의 SHA-256만 저장해 비교)
//  · 서버에는 salt · iv · 암호문 · 인증키 해시만 저장된다.
//    비밀번호와 학생 이름은 서버로 전송되지 않는다.
// ─────────────────────────────────────────────────────────────

const ITERATIONS = 600000;
const AAD = new TextEncoder().encode('random-seating:roster:v1');
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

// "k7qm 4xpa" → "K7QM-4XPA"
export function normalizeCode(text) {
  const s = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

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

// 명렬표를 암호화해 서버에 보관 → { code, expiresAt }
export async function uploadRoster(roster, className, password) {
  const problem = passwordProblem(password);
  if (problem) throw new ApiError(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { aesKey, auth } = await deriveKeys(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, className, roster, savedAt: Date.now() }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, aesKey, plain);
  return call({ action: 'create', salt: b64(salt), iv: b64(iv), ct: b64(ct), verifier: await sha256Hex(auth) });
}

async function authFor(code, password) {
  const c = normalizeCode(code);
  if (!c) throw new ApiError('불러오기 코드는 8자리예요. (예: K7QM-4XPA)');
  if (!password) throw new ApiError('비밀번호를 입력해 주세요.');
  const { salt } = await call({ action: 'salt', code: c });
  return { c, ...(await deriveKeys(password, unb64(salt))) };
}

// 서버에서 받아 복호화 → { roster, className, savedAt, expiresAt }
export async function downloadRoster(code, password) {
  const { c, aesKey, auth } = await authFor(code, password);
  const { iv, ct, expiresAt } = await call({ action: 'get', code: c, auth });
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: AAD }, aesKey, unb64(ct));
  } catch {
    throw new ApiError('자료를 풀 수 없어요. 비밀번호를 확인해 주세요.');
  }
  const data = JSON.parse(new TextDecoder().decode(plain));
  const roster = {};
  for (const [k, v] of Object.entries(data.roster || {})) {
    const n = parseInt(k, 10);
    if (n > 0 && n < 1000 && typeof v === 'string') roster[n] = v.slice(0, 40);
  }
  return { roster, className: typeof data.className === 'string' ? data.className.slice(0, 40) : '', savedAt: data.savedAt, expiresAt };
}

export async function deleteRoster(code, password) {
  const { c, auth } = await authFor(code, password);
  await call({ action: 'delete', code: c, auth });
}
