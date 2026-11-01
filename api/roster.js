// ─────────────────────────────────────────────────────────────
//  명렬표 암호문 보관 API (Vercel 함수 + Upstash Redis)
//
//  서버는 학생 이름을 볼 수 없다. 브라우저가 비밀번호로 암호화한
//  암호문과, 비밀번호에서 유도한 인증키의 SHA-256 해시만 저장한다.
//
//  POST /api/roster  { action, ... }
//    create { salt, iv, ct, verifier } → { code, expiresAt }
//    salt   { code }                   → { salt }
//    get    { code, auth }             → { iv, ct, expiresAt }
//    delete { code, auth }             → { ok }
// ─────────────────────────────────────────────────────────────
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I/L 제외
const CODE_RE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const MAX_CT = 120000; // 암호문 최대 길이(base64) ≈ 학생 1000명 분량을 넉넉히 넘음

// 시도 제한
const IP_WINDOW = 600; // 10분
const IP_MAX_REQ = 60; // 10분에 60회
const IP_MAX_CREATE = 10; // 10분에 새 보관 10회
const CODE_FAIL_MAX = 5; // 한 코드에 비밀번호 5번 틀리면
const CODE_LOCK = 1800; //   30분 잠금
const IP_FAIL_MAX = 15; // 한 IP가 1시간에 15번 틀리면
const IP_FAIL_WINDOW = 3600; //   1시간 차단

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function redis(...cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(`redis: ${data.error || r.status}`);
  return data.result;
}

async function hit(key, windowSec) {
  const n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, windowSec);
  return n;
}

const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');

// 학년말(3월 1일 0시 KST 직전)에 자동 삭제. 2월~12월에 올리면 다음 해 2월 말까지.
function schoolYearEnd(now = Date.now()) {
  const kst = new Date(now + 9 * 3600 * 1000);
  const year = kst.getUTCMonth() >= 1 ? kst.getUTCFullYear() + 1 : kst.getUTCFullYear();
  return Math.floor((Date.UTC(year, 2, 1) - 9 * 3600 * 1000) / 1000); // 초 단위 (EXAT)
}

function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || String(req.headers['x-real-ip'] || '') || 'unknown').slice(0, 64);
}

const isB64 = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max && B64_RE.test(v);

function checkCode(code) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) throw new HttpError(400, '불러오기 코드 형식이 올바르지 않아요.');
}

async function loadRecord(code) {
  const raw = await redis('GET', `roster:${code}`);
  if (!raw) throw new HttpError(404, '코드에 해당하는 자료가 없어요. 코드를 확인하거나, 보관 기간이 지나 삭제되었을 수 있어요.');
  return JSON.parse(raw);
}

// 비밀번호(인증키) 확인. 틀리면 코드별·IP별로 횟수를 세고 잠근다.
async function verify(code, auth, ip) {
  if (Number(await redis('GET', `fail:code:${code}`)) >= CODE_FAIL_MAX) {
    throw new HttpError(429, '비밀번호를 여러 번 틀려 이 코드가 30분 동안 잠겼어요. 잠시 후 다시 시도해 주세요.');
  }
  if (Number(await redis('GET', `fail:ip:${ip}`)) >= IP_FAIL_MAX) {
    throw new HttpError(429, '비밀번호를 너무 많이 틀렸어요. 1시간 뒤에 다시 시도해 주세요.');
  }
  if (!isB64(auth, 40, 48)) throw new HttpError(400, '요청 형식이 올바르지 않아요.');
  const rec = await loadRecord(code);
  const given = Buffer.from(sha256hex(Buffer.from(auth, 'base64')), 'hex');
  const stored = Buffer.from(rec.verifier, 'hex');
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    const n = await hit(`fail:code:${code}`, CODE_LOCK);
    await hit(`fail:ip:${ip}`, IP_FAIL_WINDOW);
    const left = Math.max(0, CODE_FAIL_MAX - n);
    throw new HttpError(
      401,
      left > 0 ? `비밀번호가 맞지 않아요. (${left}번 더 틀리면 30분 동안 잠겨요)` : '비밀번호를 여러 번 틀려 이 코드가 30분 동안 잠겼어요.',
    );
  }
  await redis('DEL', `fail:code:${code}`);
  return rec;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, body) => res.status(status).json(body);

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      throw new HttpError(405, '허용되지 않는 요청이에요.');
    }
    // 이 사이트 화면에서 보낸 요청만 받는다 (다른 사이트에서 몰래 호출 방지)
    const origin = req.headers.origin;
    if (origin) {
      let host = '';
      try {
        host = new URL(origin).host;
      } catch {
        // 잘못된 Origin
      }
      if (host !== req.headers.host) throw new HttpError(403, '허용되지 않는 요청이에요.');
    }
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      throw new HttpError(415, '요청 형식이 올바르지 않아요.');
    }
    if (!REDIS_URL || !REDIS_TOKEN) {
      throw new HttpError(503, '서버 보관소가 아직 설정되지 않았어요. (관리자: Vercel Storage에서 Upstash Redis 연결 필요)');
    }

    const ip = clientIp(req);
    if ((await hit(`rate:${ip}`, IP_WINDOW)) > IP_MAX_REQ) {
      throw new HttpError(429, '요청이 너무 많아요. 10분 뒤에 다시 시도해 주세요.');
    }

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const { action } = body;

    if (action === 'create') {
      const { salt, iv, ct, verifier } = body;
      if (!isB64(salt, 24, 24) || !isB64(iv, 16, 16) || !isB64(ct, 24, MAX_CT) || typeof verifier !== 'string' || !HEX64_RE.test(verifier)) {
        throw new HttpError(400, '요청 형식이 올바르지 않거나 자료가 너무 커요.');
      }
      if ((await hit(`create:${ip}`, IP_WINDOW)) > IP_MAX_CREATE) {
        throw new HttpError(429, '짧은 시간에 너무 많이 올렸어요. 10분 뒤에 다시 시도해 주세요.');
      }
      const expiresAt = schoolYearEnd();
      const record = JSON.stringify({ v: 1, salt, iv, ct, verifier, createdAt: Date.now(), expiresAt: expiresAt * 1000 });
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const ok = await redis('SET', `roster:${code}`, record, 'EXAT', expiresAt, 'NX');
        if (ok === 'OK') return send(200, { code, expiresAt: expiresAt * 1000 });
      }
      throw new HttpError(500, '코드를 만들지 못했어요. 다시 시도해 주세요.');
    }

    if (action === 'salt') {
      checkCode(body.code);
      const rec = await loadRecord(body.code);
      return send(200, { salt: rec.salt });
    }

    if (action === 'get') {
      checkCode(body.code);
      const rec = await verify(body.code, body.auth, ip);
      return send(200, { iv: rec.iv, ct: rec.ct, expiresAt: rec.expiresAt });
    }

    if (action === 'delete') {
      checkCode(body.code);
      await verify(body.code, body.auth, ip);
      await redis('DEL', `roster:${body.code}`);
      return send(200, { ok: true });
    }

    throw new HttpError(400, '알 수 없는 요청이에요.');
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message });
    console.error('roster api error:', e?.message);
    return send(500, { error: '서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
}
