// 효과음은 파일 없이 Web Audio로 합성
// 모든 소리는 master(컴프레서 → 볼륨)를 거쳐 크고 단단하게 들리도록 함
let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;
let riserNodes = null;

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = 1.6;
    comp.connect(master).connect(ctx.destination);
    master.input = comp;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const out = () => master.input;

function tone(freq, dur, { type = 'sine', gain = 0.3, delay = 0, slideTo = null, attack = 0.005, lowpass = null } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    node = o.connect(f);
  }
  node.connect(g).connect(out());
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, { gain = 0.3, delay = 0, type = 'bandpass', freq = 1500, freqTo = null, q = 1, attack = 0.002 } = {}) {
  const c = ac();
  if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out());
  s.start(t);
  s.stop(t + dur + 0.05);
}

// 팀파니처럼 쿵 울리는 저음
function boom(delay = 0, gain = 0.9, from = 120, to = 40, dur = 0.6) {
  tone(from, dur, { type: 'sine', gain, delay, slideTo: to, attack: 0.003 });
  noise(0.05, { gain: gain * 0.4, delay, type: 'lowpass', freq: 400 });
}

export const sound = {
  setEnabled(v) {
    enabled = v;
    if (!v) this.stopRiser();
  },
  unlock() {
    ac();
  },
  // 드럼롤 한 타 (intensity 0~1): 스네어 + 탐
  drum(intensity = 0.5) {
    noise(0.09, { gain: 0.35 + 0.4 * intensity, type: 'highpass', freq: 1200, q: 0.7 });
    noise(0.06, { gain: 0.2 + 0.2 * intensity, freq: 3500, q: 1 });
    tone(180 - 60 * intensity, 0.09, { type: 'triangle', gain: 0.25 + 0.3 * intensity, slideTo: 90 });
  },
  // 섞는 동안 점점 올라가는 긴장음
  startRiser(seconds) {
    const c = ac();
    if (!c) return;
    this.stopRiser();
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + seconds);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + seconds);
    const oscs = [0, 7].map((detune) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = detune;
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(880, t + seconds);
      o.connect(f);
      o.start(t);
      return o;
    });
    f.connect(g).connect(out());
    riserNodes = { oscs, g };
  },
  stopRiser() {
    if (!riserNodes || !ctx) return;
    const t = ctx.currentTime;
    riserNodes.g.gain.cancelScheduledValues(t);
    riserNodes.g.gain.setValueAtTime(riserNodes.g.gain.value, t);
    riserNodes.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    riserNodes.oscs.forEach((o) => o.stop(t + 0.1));
    riserNodes = null;
  },
  // 심벌 + 큰 북
  crash() {
    this.stopRiser();
    noise(2.2, { gain: 0.7, type: 'highpass', freq: 3000, q: 0.4 });
    noise(0.8, { gain: 0.4, freq: 6000, q: 0.8 });
    boom(0, 1, 110, 35, 0.9);
  },
  // 카운트다운: 쿵 + 삑
  beep(final = false) {
    boom(0, 0.8, final ? 160 : 120, 45, 0.45);
    tone(final ? 1320 : 880, final ? 0.5 : 0.18, { type: 'square', gain: 0.16, lowpass: 3000 });
    if (final) tone(1760, 0.5, { type: 'triangle', gain: 0.12, delay: 0.02 });
  },
  // 번호가 돌아갈 때 딸깍
  tick(pitch = 1) {
    tone(900 * pitch, 0.04, { type: 'square', gain: 0.12, lowpass: 4000 });
    noise(0.02, { gain: 0.12, type: 'highpass', freq: 4000 });
  },
  // 공개 직전 멈칫 (심장 박동)
  heartbeat() {
    boom(0, 1, 75, 40, 0.18);
    boom(0.2, 0.8, 70, 38, 0.2);
  },
  // 한 자리 공개: 쾅 + 반짝 화음
  ding() {
    boom(0, 0.6, 140, 60, 0.25);
    [1046.5, 1318.5, 1568].forEach((f, i) => tone(f, 0.55, { type: 'triangle', gain: 0.2, delay: i * 0.035 }));
    tone(2093, 0.7, { gain: 0.1, delay: 0.1 });
    noise(0.35, { gain: 0.18, type: 'highpass', freq: 7000, delay: 0.05 });
  },
  whoosh() {
    noise(0.6, { gain: 0.45, freq: 300, freqTo: 5000, q: 1.2, attack: 0.15 });
  },
  // 마지막 팡파르: 금관 느낌(톱니파+필터) + 팀파니 + 심벌
  fanfare() {
    const brass = (f, delay, dur, gain = 0.2) => {
      tone(f, dur, { type: 'sawtooth', gain, delay, lowpass: 2200, attack: 0.03 });
      tone(f * 1.003, dur, { type: 'sawtooth', gain: gain * 0.6, delay, lowpass: 1800, attack: 0.03 });
    };
    const seq = [
      [392, 0, 0.16],
      [392, 0.16, 0.16],
      [392, 0.32, 0.16],
      [523.25, 0.48, 0.5],
      [466.16, 0.98, 0.25],
      [523.25, 1.23, 0.18],
    ];
    seq.forEach(([f, d, l]) => brass(f, d, l));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => brass(f, 1.42, 1.6, 0.13));
    boom(0, 0.7, 100, 50, 0.3);
    boom(0.48, 0.9, 110, 40, 0.5);
    boom(1.42, 1, 110, 35, 1);
    noise(2.5, { gain: 0.6, type: 'highpass', freq: 3000, q: 0.4, delay: 1.42 });
  },
};