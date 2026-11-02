// ─────────────────────────────────────────────────────────────
//  명렬표 · 자리 배치 결과 암호문 보관 API (Vercel 함수 + Upstash Redis)
//
//  서버는 학생 이름을 볼 수 없다. 브라우저가 비밀번호로 암호화한
//  암호문과, 비밀번호에서 유도한 인증키의 SHA-256 해시만 저장한다.
//
//  POST /api/roster  { action, ... }
//    create { kind, code | auto:{label}, salt, iv, ct, verifier } → { code, kind, expiresAt }
//    salt   { code }        → { salt }
//    get    { code, auth }  → { kind, iv, ct, expiresAt }
//    delete { code, auth }  → { ok }
//
//  code 는 브라우저가 정규화한 값(공백 제거). 명렬표와 결과는 같은 코드 공간을 쓴다.
// ─────────────────────────────────────────────────────────────
import { createHash, timingSafeEqual } from 'node:crypto';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// 정규화된 코드: 한글·영문·숫자와 일부 기호, 2~40자 (src/secure.js 의 canonCode 와 같은 규칙)
const CODE_RE = /^[가-힣ㄱ-ㅎA-Z0-9#_.()-]{2,40}$/;
const LABEL_RE = /^[가-힣A-Za-z0-9-]{1,20}$/;
const KINDS = new Set(['roster', 'result']);
const MAX_ORDINAL = 50;
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

// 올린 날(한국 시간) 기준 "26년11월"
function yearMonthPrefix(now = Date.now()) {
  const kst = new Date(now + 9 * 3600 * 1000);
  return `${String(kst.getUTCFullYear() % 100).padStart(2, '0')}년${kst.getUTCMonth() + 1}월`;
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || String(req.headers['x-real-ip'] || '') || 'unknown').slice(0, 64);
}

const isB64 = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max && B64_RE.test(v);

function checkCode(code) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) throw new HttpError(400, '코드 형식이 올바르지 않아요.');
}

const keyOf = (code) => `code:${code}`;
const legacyKeyOf = (code) => `roster:${code}`; // 처음 버전(명렬표 전용)에서 만든 코드

async function loadRecord(code) {
  let raw = await redis('GET', keyOf(code));
  if (!raw) raw = await redis('GET', legacyKeyOf(code));
  if (!raw) throw new HttpError(404, '이 코드로 보관된 자료가 없어요. 코드를 확인하거나, 보관 기간이 지나 삭제되었을 수 있어요.');
  return JSON.parse(raw);
}

async function isTaken(code) {
  return Boolean((await redis('EXISTS', keyOf(code))) || (await redis('EXISTS', legacyKeyOf(code))));
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
      const { kind, salt, iv, ct, verifier } = body;
      if (
        !KINDS.has(kind) ||
        !isB64(salt, 24, 24) ||
        !isB64(iv, 16, 16) ||
        !isB64(ct, 24, MAX_CT) ||
        typeof verifier !== 'string' ||
        !HEX64_RE.test(verifier)
      ) {
        throw new HttpError(400, '요청 형식이 올바르지 않거나 자료가 너무 커요.');
      }
      if ((await hit(`create:${ip}`, IP_WINDOW)) > IP_MAX_CREATE) {
        throw new HttpError(429, '짧은 시간에 너무 많이 올렸어요. 10분 뒤에 다시 시도해 주세요.');
      }
      const expiresAt = schoolYearEnd();
      const record = JSON.stringify({ v: 2, kind, salt, iv, ct, verifier, createdAt: Date.now(), expiresAt: expiresAt * 1000 });
      const put = async (code) =>
        !(await isTaken(code)) && (await redis('SET', keyOf(code), record, 'EXAT', expiresAt, 'NX')) === 'OK';

      // 추천 코드: 같은 달·같은 반에서 비어 있는 첫 순번 ("…첫번째", 결과는 "…첫번째결과")
      if (body.auto) {
        const label = typeof body.auto.label === 'string' ? body.auto.label.replace(/\s+/g, '') : '';
        if (!LABEL_RE.test(label) || /\d$/.test(label)) {
          throw new HttpError(400, '반 이름은 한글·영문·숫자·하이픈(-)으로, 숫자로 끝나지 않게 적어 주세요. (예: 1-5반)');
        }
        const prefix = `${yearMonthPrefix()}${label.toUpperCase()}`;
        for (let n = 1; n <= MAX_ORDINAL; n++) {
          const code = `${prefix}#${n}${kind === 'result' ? '결과' : ''}`;
          if (await put(code)) return send(200, { code, kind, expiresAt: expiresAt * 1000 });
        }
        throw new HttpError(409, '이번 달 이 반 이름으로 너무 많이 보관했어요. 쓰지 않는 보관본을 지우거나 코드를 직접 정해 주세요.');
      }

      // 교사가 직접 정한 코드: 이미 있으면 덮어쓰지 않는다
      checkCode(body.code);
      if (await put(body.code)) return send(200, { code: body.code, kind, expiresAt: expiresAt * 1000 });
      throw new HttpError(409, '이미 쓰고 있는 코드예요. 다른 코드를 정해 주세요.');
    }

    if (action === 'salt') {
      checkCode(body.code);
      const rec = await loadRecord(body.code);
      return send(200, { salt: rec.salt });
    }

    if (action === 'get') {
      checkCode(body.code);
      const rec = await verify(body.code, body.auth, ip);
      return send(200, { kind: rec.kind || 'roster', iv: rec.iv, ct: rec.ct, expiresAt: rec.expiresAt });
    }

    if (action === 'delete') {
      checkCode(body.code);
      await verify(body.code, body.auth, ip);
      await redis('DEL', keyOf(body.code));
      await redis('DEL', legacyKeyOf(body.code));
      return send(200, { ok: true });
    }

    throw new HttpError(400, '알 수 없는 요청이에요.');
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message });
    console.error('roster api error:', e?.message);
    return send(500, { error: '서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
}
