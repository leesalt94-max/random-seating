export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// "7, 13, 20-22" → [7, 13, 20, 21, 22]
export function parseNumberList(text) {
  const out = new Set();
  const normalized = String(text || '').replace(/\s*[-~]\s*/g, '-');
  for (const part of normalized.split(/[,\s/·]+/)) {
    if (!part) continue;
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      let a = +range[1];
      let b = +range[2];
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b && i - a < 500; i++) if (i > 0) out.add(i);
    } else {
      const n = parseInt(part, 10);
      if (n > 0) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// [7, 20, 21, 22] → "7, 20-22"
export function formatNumberList(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j - i >= 2 ? `${s[i]}-${s[j]}` : j > i ? `${s[i]}, ${s[j]}` : `${s[i]}`);
    i = j;
  }
  return parts.join(', ');
}

// 분단 사이 통로 여부 배열 (true = 통로, false = 붙임). size: '1' 모두 떨어짐, '2' 2명씩, '3' 3명씩, '0' 모두 붙임
export function presetGaps(cols, size) {
  const k = parseInt(size, 10);
  return Array.from({ length: Math.max(0, cols - 1) }, (_, i) =>
    k === 0 ? false : k === 1 ? true : (i + 1) % k === 0,
  );
}

export function fitArray(arr, n, fill = false) {
  return Array.from({ length: Math.max(0, n) }, (_, i) => (arr && arr[i] != null ? arr[i] : fill));
}

// 책상 트랙과 사이 간격 트랙을 번갈아 만든 grid-template 문자열
export function gridTracks(count, gaps, item, joined, aisle) {
  const t = [];
  for (let i = 0; i < count; i++) {
    t.push(item);
    if (i < count - 1) t.push(gaps[i] ? aisle : joined);
  }
  return t.join(' ');
}
