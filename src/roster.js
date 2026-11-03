import { read, utils, writeFile } from 'xlsx';

const NUM_HEADER = /^(번호|출석번호|학생번호|번|no\.?|num(ber)?)$/i;
const SKIP_NAME = /^(전출|전학|전출생|-|x|X)$/;
const NAME_HEADER = /^(이름|성명|학생명|학생이름|학생성명|name)$/i;

async function readWorkbook(file) {
  if (/\.csv$/i.test(file.name)) {
    // 한글 CSV는 UTF-8 또는 EUC-KR(엑셀 기본 저장)일 수 있음
    const buf = await file.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('euc-kr').decode(buf);
    }
    return read(text.replace(/^﻿/, ''), { type: 'string' });
  }
  return read(await file.arrayBuffer(), { type: 'array' });
}

// 양식 위쪽의 '학년' / '반' 칸 읽기 (바로 오른쪽 칸의 숫자). 없으면 null
function readClassInfo(rows) {
  let grade = null;
  let classNo = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const key = String(row[j]).replace(/\s/g, '');
      if (key !== '학년' && key !== '반') continue;
      const val = row.slice(j + 1).find((v) => String(v).trim() !== '');
      const n = parseInt(String(val ?? '').replace(/[^0-9]/g, ''), 10);
      if (!(n > 0 && n < 100)) continue;
      if (key === '학년' && grade == null) grade = n;
      if (key === '반' && classNo == null) classNo = n;
    }
  }
  return { grade, classNo };
}

// 반 이름 "1학년 5반" → { grade: 1, classNo: 5 }
export function parseClassName(name) {
  const m = String(name || '').match(/(\d+)\s*학년\s*(\d+)\s*반/);
  return m ? { grade: parseInt(m[1], 10), classNo: parseInt(m[2], 10) } : { grade: null, classNo: null };
}

// 명렬표 엑셀 → { roster: { 번호: 이름 }, grade, classNo }
export async function readRosterFileWithClass(file) {
  const wb = await readWorkbook(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  return { roster: parseRosterRows(rows), ...readClassInfo(rows) };
}

// 명렬표 엑셀 → { 번호: 이름 }
export async function readRosterFile(file) {
  return (await readRosterFileWithClass(file)).roster;
}

// '번호'/'이름' 머리글이 있으면 그 열을 쓰고, 없으면 각 행의 첫 숫자 칸 = 번호, 그 뒤 첫 글자 칸 = 이름
function parseRosterRows(rows) {

  let numCol = -1;
  let nameCol = -1;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((v) => String(v).replace(/\s/g, ''));
    const n = cells.findIndex((v) => NUM_HEADER.test(v));
    const m = cells.findIndex((v) => NAME_HEADER.test(v));
    if (n >= 0 && m >= 0) {
      numCol = n;
      nameCol = m;
      start = i + 1;
      break;
    }
  }

  const roster = {};
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    let num;
    let name;
    if (numCol >= 0) {
      num = parseInt(String(row[numCol]).trim(), 10);
      name = String(row[nameCol] ?? '').trim();
    } else {
      const ni = row.findIndex((v) => /^\s*\d+\s*번?\s*$/.test(String(v)));
      if (ni < 0) continue;
      num = parseInt(String(row[ni]), 10);
      const nm = row.slice(ni + 1).find((v) => String(v).trim() && !/^\s*[\d.]+\s*$/.test(String(v)));
      name = nm ? String(nm).trim() : '';
    }
    // 전출 학생은 이름 칸을 비우거나 '전출'이라고 적으면 명단에서 빠짐
    if (num > 0 && num < 1000 && name && !SKIP_NAME.test(name)) roster[num] = name;
  }
  return roster;
}

export function rosterSummary(roster) {
  const nums = Object.keys(roster || {}).map(Number).sort((a, b) => a - b);
  if (!nums.length) return null;
  const max = nums[nums.length - 1];
  const have = new Set(nums);
  const missing = [];
  for (let i = 1; i <= max; i++) if (!have.has(i)) missing.push(i);
  return { count: nums.length, max, missing };
}

// 명렬표 양식: 맨 위에 학년·반, 번호는 미리 채우고 이름 칸만 비워둔 엑셀
export function downloadRosterTemplate(count, className) {
  const { grade, classNo } = parseClassName(className);
  const rows = [['학년', grade ?? ''], ['반', classNo ?? ''], [], ['번호', '이름']];
  for (let i = 1; i <= count; i++) rows.push([i, '']);
  const sheet = utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 8 }, { wch: 16 }];

  const guide = utils.aoa_to_sheet([
    ['명렬표 작성 방법'],
    [''],
    ['1. 「명렬표」 시트 맨 위의 학년·반 칸에 숫자를 적고(예: 1, 5), 이름 칸에 학생 이름을 입력하세요.'],
    ['2. 전출 간 학생은 이름 칸을 비워 두거나 「전출」이라고 적으세요.'],
    ['3. 전학 온 학생이 있으면 맨 아래에 번호와 이름을 이어서 적으세요.'],
    ['4. 저장한 뒤 자리뽑기 화면의 「엑셀 올리기」로 이 파일을 올리세요.'],
    [''],
    ['※ 학년·반 칸과 「번호」「이름」 제목 줄의 위치는 바꾸지 마세요. 올리면 반 이름이 자동으로 「1학년 5반」처럼 채워져요.'],
  ]);
  guide['!cols'] = [{ wch: 70 }];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, sheet, '명렬표');
  utils.book_append_sheet(wb, guide, '작성 방법');
  const safeName = String(className || '').replace(/[\\/:*?"<>|]/g, '').trim();
  writeFile(wb, `명렬표_양식${safeName ? `_${safeName}` : ''}.xlsx`);
}
