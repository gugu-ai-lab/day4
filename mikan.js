// 제주 감귤 대탐험 — 남극탐험 스타일 의사(擬似) 3D 러너
(() => {
'use strict';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const FONT = '"Jua","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ───────────────────────── 화면/투영 ─────────────────────────
let W, H, HZ, UNIT;
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  HZ = H * 0.36;
  UNIT = Math.min(W * 0.115, H * 0.2);
}
addEventListener('resize', resize); resize();

const K = 7, PD = 1.6;                       // 원근 상수 / 플레이어 거리
const sc = d => K / (d + K);
const gy = d => HZ + (H * 0.9 - HZ) * sc(d);
let sway = 0, camX = 0, pos = 0, t = 0;
const curveX = d => sway * d * d * 0.0016;
const proj = (wx, d) => { const s = sc(d); return { x: W / 2 + (wx + curveX(d) - camX) * s * UNIT, y: gy(d), pu: s * UNIT, s }; };

// ───────────────────────── 테마 ─────────────────────────
const THEMES = [
  { name: '해안도로',  skyT: '#52c4ff', skyB: '#e2f8ff', g1: '#7bd66c', g2: '#6ccb5e', r1: '#8d91a8', r2: '#80849c', sea: '#38b6ea', mt: '#6fae9f', hill: '#8ae07a', sun: '#fff4a8', deco: ['palm', 'mtree', 'palm', 'statue'], fx: 'none' },
  { name: '유채꽃밭',  skyT: '#8ad8ff', skyB: '#fff0f8', g1: '#ffe24f', g2: '#ffd424', r1: '#b9a08a', r2: '#ad9580', sea: null,      mt: '#8fb9a4', hill: '#a9e57e', sun: '#fffbd0', deco: ['canola', 'canola', 'mtree', 'statue'], fx: 'petal' },
  { name: '한라산 설원', skyT: '#8aa8ff', skyB: '#eef4ff', g1: '#f6faff', g2: '#e1ecfa', r1: '#9ca9c7', r2: '#8f9cbd', sea: null,    mt: '#b9c8e8', hill: '#dbe7fb', sun: '#ffffff', deco: ['pine', 'pine', 'statue'], fx: 'snow', snow: true },
  { name: '노을 바다',  skyT: '#ff6f9f', skyB: '#ffd89a', g1: '#d98e62', g2: '#cf8158', r1: '#7f6c92', r2: '#725f86', sea: '#ff9a78', mt: '#9c5d86', hill: '#e0996d', sun: '#fff0b0', deco: ['palm', 'palm', 'mtree', 'statue'], fx: 'none' },
  { name: '별빛 밤하늘', skyT: '#080c3a', skyB: '#3d3a92', g1: '#31529a', g2: '#294a8f', r1: '#4d5384', r2: '#444a79', sea: '#1f3a8e', mt: '#2c3a80', hill: '#3a5fb0', sun: '#fffbe0', deco: ['lantern', 'lantern', 'statue'], fx: 'firefly', night: true },
];
function stageDef(n) {
  const L = Math.min(1500, 650 + n * 110);
  const base = Math.min(27, 14 + n * 1.3);
  return { n, theme: THEMES[(n - 1) % 5], L, base, time: Math.round(L / base * 1.12 + 7), curv: Math.min(1, 0.5 + n * 0.12) };
}

// ───────────────────────── 사운드 (WebAudio 합성) ─────────────────────────
const Snd = (() => {
  let ac, master, sfx, bgm, noiseBuf, timer = null, step = 0, nextT = 0, bgmStage = 1, muted = false;
  const mtof = s => 261.63 * Math.pow(2, s / 12);
  const pent = p => [0, 2, 4, 7, 9][((p % 5) + 5) % 5] + 12 * Math.floor(p / 5);
  const MEL = [5,7,8,7,5,4,3,4, 4,5,7,5,4,3,2,3, 5,7,9,7,8,7,5,4, 3,4,5,3,2,3,-1,-1];
  const CH = [0, -3, -5, -7], TRANS = [0, 2, -2, 5, 3], BPM = [150, 158, 146, 138, 128];
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.85; sfx.connect(master);
    bgm = ac.createGain(); bgm.gain.value = 0.32; bgm.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function tone(f, dur, o = {}) {
    if (!ac) return;
    const { type = 'square', vol = 0.18, to = null, at = 0, bus = sfx, att = 0.006 } = o;
    const s = ac.currentTime + Math.max(0, at), osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, s);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, s + dur);
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + att); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    osc.connect(g); g.connect(bus); osc.start(s); osc.stop(s + dur + 0.03);
  }
  function noise(dur, vol, hp = 2000, o = {}) {
    if (!ac) return;
    const { at = 0, bus = sfx, lp = 0 } = o;
    const s = ac.currentTime + Math.max(0, at), src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = noiseBuf; f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp;
    g.gain.setValueAtTime(vol, s); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    src.connect(f); f.connect(g); g.connect(bus); src.start(s); src.stop(s + dur + 0.02);
  }
  function playStep(idx, at) {
    const tr = TRANS[(bgmStage - 1) % 5], bar = Math.floor((idx % 32) / 8), i = idx % 32, d = 60 / BPM[(bgmStage - 1) % 5] / 2;
    const rel = at - ac.currentTime, m = MEL[i];
    if (m >= 0) {
      tone(mtof(tr + pent(m)), d * 0.95, { type: 'square', vol: 0.09, at: rel, bus: bgm });
      tone(mtof(tr + pent(m) + 12), d * 0.6, { type: 'triangle', vol: 0.1, at: rel, bus: bgm });
    }
    const root = tr + CH[bar] - 12;
    if (i % 2 === 0) tone(mtof(root), d * 1.8, { type: 'triangle', vol: 0.34, at: rel, bus: bgm });
    if (i % 4 === 0) tone(110, 0.14, { type: 'sine', vol: 0.5, to: 40, at: rel, bus: bgm });
    if (i % 2 === 1) noise(0.04, 0.12, 7000, { at: rel, bus: bgm });
    if (i % 8 === 4) [0, 4, 7].forEach(n => tone(mtof(root + 12 + n), d * 1.4, { type: 'triangle', vol: 0.08, at: rel, bus: bgm }));
  }
  function sched() {
    if (!ac) return;
    const d = 60 / BPM[(bgmStage - 1) % 5] / 2;
    while (nextT < ac.currentTime + 0.16) { playStep(step, nextT); nextT += d; step++; }
  }
  return {
    init,
    get muted() { return muted; },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.6; return muted; },
    startBgm(st) { if (!ac) return; this.stopBgm(); bgmStage = st; step = 0; nextT = ac.currentTime + 0.08; timer = setInterval(sched, 30); },
    stopBgm() { if (timer) clearInterval(timer); timer = null; },
    jump() { tone(280, 0.18, { to: 760, vol: 0.16 }); tone(420, 0.1, { type: 'triangle', to: 900, vol: 0.12, at: 0.02 }); },
    land() { noise(0.09, 0.22, 0, { lp: 500 }); tone(140, 0.08, { type: 'sine', to: 70, vol: 0.25 }); },
    step(k) { tone(k ? 170 : 130, 0.04, { type: 'triangle', vol: 0.07 }); },
    coin(c) { const p = 5 + Math.min(c, 14); tone(mtof(pent(p)) * 2, 0.1, { vol: 0.13 }); tone(mtof(pent(p)) * 4, 0.16, { type: 'triangle', vol: 0.1, at: 0.05 }); },
    gold() { [0, 4, 7, 12, 16].forEach((n, i) => tone(mtof(n + 12) * 2, 0.14, { vol: 0.13, at: i * 0.05 })); },
    power() { [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => tone(mtof(n + 7) * 2, 0.12, { type: 'triangle', vol: 0.2, at: i * 0.055 })); },
    hit() { tone(300, 0.3, { type: 'sawtooth', to: 70, vol: 0.2 }); noise(0.18, 0.28, 0, { lp: 900 }); },
    fall() { tone(700, 0.9, { type: 'sine', to: 60, vol: 0.28 }); tone(520, 0.9, { type: 'triangle', to: 40, vol: 0.2, at: 0.05 }); },
    shield() { tone(900, 0.25, { type: 'triangle', to: 300, vol: 0.2 }); noise(0.2, 0.15, 4000); },
    smash() { noise(0.15, 0.3, 0, { lp: 1500 }); tone(220, 0.12, { to: 440, vol: 0.14 }); },
    tick() { tone(1000, 0.07, { vol: 0.12 }); },
    banner() { [0, 7, 12].forEach((n, i) => tone(mtof(n + 12) * 2, 0.14, { type: 'triangle', vol: 0.18, at: i * 0.09 })); },
    clear() { [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((n, i) => { tone(mtof(n + 12) * 2, 0.2, { vol: 0.15, at: i * 0.1 }); tone(mtof(n) , 0.25, { type: 'triangle', vol: 0.2, at: i * 0.1 }); }); },
    over() { [7, 5, 3, 0, -5].forEach((n, i) => tone(mtof(n + 12), 0.4, { type: 'triangle', vol: 0.25, at: i * 0.22 })); },
    click() { tone(660, 0.08, { type: 'triangle', vol: 0.18 }); },
  };
})();

// ───────────────────────── 상태 ─────────────────────────
const S = { state: 'title', stage: 1, def: stageDef(1), score: 0, lives: 3, timeLeft: 60, combo: 0, comboT: 0, maxCombo: 0, got: 0, total: 1,
            banner: 0, clearT: 0, over: '', shake: 0, flash: 0, wind: 0, lastTick: 0, hi: 0, stageScore0: 0, bonus: null };
try { S.hi = +localStorage.getItem('mikanHi') || 0; } catch (e) {}
const P = { x: 0, vx: 0, jy: 0, vy: 0, ground: true, sq: 0, run: 0, spd: 12, inv: 0, stun: 0, fall: 0, shield: 0, magnet: 0, dash: 0, stepK: 0, ice: false };
let objs = [], parts = [], texts = [];
const keys = { left: 0, right: 0, up: 0, down: 0, jumpBuf: 0 };

function startGame() { S.stage = 1; S.score = 0; S.lives = 3; startStage(); }
function startStage() {
  const d = S.def = stageDef(S.stage);
  genStage(d);
  pos = 0; S.timeLeft = d.time; S.combo = 0; S.comboT = 0; S.maxCombo = 0; S.got = 0; S.banner = 2.6; S.clearT = 0; S.stageScore0 = S.score; S.bonus = null;
  Object.assign(P, { x: 0, vx: 0, jy: 0, vy: 0, ground: true, sq: 0, spd: 10, inv: 0, stun: 0, fall: 0, shield: 0, magnet: 0, dash: 0, ice: false });
  parts = []; texts = []; S.state = 'play';
  Snd.startBgm(S.stage); Snd.banner();
}

// ───────────────────────── 스테이지 생성 ─────────────────────────
function genStage(d) {
  objs = []; let z = 42, total = 0;
  const n = d.n, lanes = [-2, 0, 2];
  const mand = (x, zz, h = 0.55, gold = false) => { objs.push({ t: gold ? 'gold' : 'mand', x, z: zz, h, ph: rnd(0, 6) }); total++; };
  const gap = () => Math.max(6, 15 - n * 0.9) * rnd(0.8, 1.25);
  while (z < d.L - 40) {
    const r = Math.random(), lane = pick(lanes);
    if (r < 0.22) {                                   // 감귤 줄
      const len = Math.floor(rnd(4, 9));
      for (let i = 0; i < len; i++) mand(lane, z + i * 1.8);
      z += len * 1.8;
    } else if (r < 0.34) {                            // 지그재그 감귤
      const len = Math.floor(rnd(7, 12));
      for (let i = 0; i < len; i++) mand(Math.sin(i * 0.8) * 2, z + i * 1.7);
      z += len * 1.7;
    } else if (r < 0.50) {                            // 구멍 + 공중 감귤 아치
      const full = Math.random() < 0.3 + Math.min(0.25, n * 0.03);
      objs.push({ t: 'hole', x: full ? 0 : lane, z, full });
      for (let i = 0; i < 7; i++) mand(full ? lane : lane, z - 5.1 + i * 1.7, 0.7 + Math.sin(i / 6 * Math.PI) * 1.0);
      z += 4;
    } else if (r < 0.60) {                            // 용암 바위
      objs.push({ t: 'rock', x: lane, z });
      for (let i = 0; i < 4; i++) mand(lane, z - 3.2 + i * 1.6, 0.6 + Math.sin(i / 3 * Math.PI) * 0.9);
      z += 3;
    } else if (r < 0.69) {                            // 돌하르방 (피해야 함)
      objs.push({ t: 'hareubang', x: lane, z });
      const other = lanes.filter(l => l !== lane);
      for (let i = 0; i < 5; i++) mand(pick(other), z - 4 + i * 1.8);
      z += 3;
    } else if (r < 0.77 && n >= 1) {                  // 게
      objs.push({ t: 'crab', x: 0, bx: 0, rg: 2.0, sp: rnd(1.6, 2.6), z, ph: rnd(0, 6) }); z += 2;
    } else if (r < 0.82 && n >= 3) {                  // 조랑말
      objs.push({ t: 'pony', x: 0, bx: 0, rg: 2.4, sp: rnd(1.0, 1.6), z, ph: rnd(0, 6) }); z += 2;
    } else if (r < 0.88 && n >= 2) {                  // 벽: 두 레인 막힘
      const free = pick(lanes);
      lanes.filter(l => l !== free).forEach(l => objs.push({ t: Math.random() < 0.5 ? 'rock' : 'hareubang', x: l, z }));
      for (let i = 0; i < 6; i++) mand(free, z - 4 + i * 1.7);
      z += 3;
    } else if (r < 0.92 && (n >= 3 || d.theme.snow)) { // 얼음판
      objs.push({ t: 'ice', x: 0, z, len: 9 });
      for (let i = 0; i < 6; i++) mand(lane, z - 3 + i * 1.6);
      z += 9;
    } else if (r < 0.97) {                            // 파워업
      objs.push({ t: 'pow', k: pick(['mag', 'shield', 'dash', 'clock', 'clock', n > 1 ? 'heart' : 'shield']), x: lane, z, ph: rnd(0, 6) });
      z += 2;
    } else {                                          // 황금 감귤
      mand(lane, z, 0.9, true); z += 2;
    }
    z += gap();
  }
  S.total = Math.max(1, total);
}

// ───────────────────────── 입력 ─────────────────────────
function action() {
  Snd.init();
  if (S.state === 'title') { Snd.click(); startGame(); }
  else if (S.state === 'clear' && S.clearT > 1.6) { Snd.click(); S.stage++; startStage(); }
  else if (S.state === 'over' && S.clearT > 0.8) { Snd.click(); S.state = 'title'; Snd.stopBgm(); }
}
function jump() { keys.jumpBuf = 0.14; }
addEventListener('keydown', e => {
  const k = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = 1;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = 1;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') keys.up = 1;
  if (k === 'ArrowDown' || k === 's' || k === 'S') keys.down = 1;
  if ((k === ' ' || k === 'Enter') && !e.repeat) { Snd.init(); if (S.state === 'play') jump(); else action(); }
  if ((k === 'p' || k === 'P' || k === 'Escape') && !e.repeat) togglePause();
  if (k === 'm' || k === 'M') toggleMute();
});
addEventListener('keyup', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = 0;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = 0;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') keys.up = 0;
  if (k === 'ArrowDown' || k === 's' || k === 'S') keys.down = 0;
});
function togglePause() {
  if (S.state === 'play') { S.state = 'paused'; Snd.stopBgm(); }
  else if (S.state === 'paused') { S.state = 'play'; Snd.startBgm(S.stage); }
}
function toggleMute() { Snd.init(); document.getElementById('mute').textContent = Snd.toggle() ? '🔇' : '🔊'; }
document.getElementById('mute').addEventListener('click', e => { e.stopPropagation(); toggleMute(); });
document.getElementById('mute').addEventListener('pointerdown', e => e.stopPropagation());
cv.addEventListener('pointerdown', () => { Snd.init(); if (S.state !== 'play') action(); });
addEventListener('blur', () => { if (S.state === 'play') togglePause(); });
function hold(id, key, fn) {
  const el = document.getElementById(id);
  const on = e => { e.preventDefault(); e.stopPropagation(); Snd.init(); if (fn) fn(); else keys[key] = 1; };
  const off = e => { e.preventDefault(); if (!fn) keys[key] = 0; };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
}
hold('bl', 'left'); hold('br', 'right'); hold('bb', 'up'); hold('bj', null, () => { if (S.state === 'play') jump(); else action(); });

// ───────────────────────── 효과 ─────────────────────────
function burst(x, y, n, cols, spd = 220, grav = 500, life = 0.7) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), v = rnd(spd * 0.3, spd);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, g: grav, life: life * rnd(0.6, 1.2), max: life, c: pick(cols), r: rnd(2, 5), s: Math.random() < 0.5 });
  }
}
function floatText(str, x, y, col = '#fff', size = 26) { texts.push({ s: str, x, y, col, size, life: 1.0 }); }
const playerScreen = () => proj(P.x, PD);
function addScore(v) { S.score += v; if (S.score > S.hi) { S.hi = S.score; try { localStorage.setItem('mikanHi', S.hi); } catch (e) {} } }

function collect(o) {
  o.dead = true;
  const gold = o.t === 'gold';
  S.combo++; S.comboT = 2.0; S.maxCombo = Math.max(S.maxCombo, S.combo); S.got++;
  const mult = Math.min(5, 1 + Math.floor(S.combo / 5)), v = (gold ? 50 : 10) * mult;
  addScore(v);
  const p = proj(o.x, o.z - pos), y = p.y - o.h * p.pu;
  burst(p.x, y, gold ? 22 : 8, gold ? ['#ffe14d', '#fff', '#ffb300'] : ['#ffb347', '#ffd54f', '#fff'], gold ? 300 : 180, 400, 0.6);
  floatText('+' + v + (mult > 1 ? ' x' + mult : ''), p.x, y - 20, gold ? '#ffe14d' : '#fff');
  if (gold) Snd.gold(); else Snd.coin(S.combo);
  if (S.combo > 0 && S.combo % 10 === 0) { floatText('COMBO ' + S.combo + '!', W / 2, H * 0.3, '#ff7ab8', 44); S.flash = 0.25; }
}
function powerUp(o) {
  o.dead = true; Snd.power();
  const p = proj(o.x, o.z - pos);
  burst(p.x, p.y - p.pu, 24, ['#fff', '#7be3ff', '#ffe14d', '#ff9ccf'], 300, 300, 0.8);
  const msg = { mag: ['🧲 자석!', () => P.magnet = 8], shield: ['🛡 하르방 방패!', () => P.shield = 1], dash: ['⚡ 한라봉 대시!', () => P.dash = 4],
                clock: ['⏰ +6초', () => S.timeLeft += 6], heart: ['💖 하트 +1', () => S.lives = Math.min(5, S.lives + 1)] }[o.k];
  msg[1](); floatText(msg[0], W / 2, H * 0.32, '#fff', 36);
  addScore(30);
}
function stumble(o) {
  if (P.dash > 0) { o.dead = true; const p = proj(o.x, o.z - pos); burst(p.x, p.y - p.pu, 18, ['#fff', '#ffb347', '#bbb'], 340, 600); Snd.smash(); addScore(20); floatText('+20', p.x, p.y - p.pu * 2, '#ffe14d'); S.shake = 0.15; return; }
  if (P.inv > 0 || o.hit) return;
  o.hit = true;
  if (P.shield > 0) { P.shield = 0; P.inv = 1.0; Snd.shield(); const p = playerScreen(); burst(p.x, p.y - p.pu, 20, ['#7be3ff', '#fff'], 280, 200); floatText('방패 깨짐!', p.x, p.y - p.pu * 2.5, '#7be3ff'); return; }
  S.combo = 0; P.stun = 1.0; P.inv = 1.4; S.timeLeft = Math.max(0, S.timeLeft - 2); S.shake = 0.4; P.vy = 5; P.ground = false;
  const p = playerScreen();
  burst(p.x, p.y - p.pu, 14, ['#ffb347', '#fff', '#ff6b6b'], 260, 600);
  floatText('아야! -2초', p.x, p.y - p.pu * 2.6, '#ff6b6b', 30); Snd.hit();
}
function dropHole(o) {
  if (P.dash > 0 || P.inv > 0 || o.hit) return;
  o.hit = true;
  if (P.shield > 0) { P.shield = 0; P.vy = 10; P.ground = false; P.inv = 1; Snd.shield(); floatText('방패가 구해줌!', W / 2, H * 0.4, '#7be3ff'); return; }
  S.lives--; S.combo = 0; P.fall = 1.0; S.shake = 0.5; Snd.fall();
  pos = Math.max(pos, o.z - PD + 2);
}

// ───────────────────────── 업데이트 ─────────────────────────
function update(dt) {
  t += dt;
  const def = S.def;
  if (S.state === 'title') { pos += 13 * dt; sway = Math.sin(pos * 0.006) * 0.8; P.run += dt * 11; P.jy = Math.abs(Math.sin(t * 3)) * 0.35; updateFx(dt); return; }
  if (S.state === 'paused') return;
  const playing = S.state === 'play';
  S.clearT += dt;

  // 입력 → 가로 이동
  let ax = playing && P.fall <= 0 ? keys.right - keys.left : 0;
  const ice = P.ice && P.ground;
  S.wind = def.n >= 3 ? Math.sin(t * 0.55) * Math.sin(t * 1.3 + 1) * Math.min(4, 1.8 + def.n * 0.3) : 0;
  const tv = ax * 8.2 + (playing ? S.wind * 0.55 : 0);
  P.vx = lerp(P.vx, tv, 1 - Math.exp(-(ice ? 1.6 : 13) * dt));
  P.x = clamp(P.x + P.vx * dt, -2.7, 2.7);

  // 속도
  let target = def.base * (P.dash > 0 ? 1.7 : 1) * (keys.up ? 1.32 : keys.down ? 0.68 : 1) * (P.stun > 0 ? 0.3 : 1) * (P.fall > 0 ? 0.1 : 1);
  if (!playing) target = S.state === 'clear' ? 7 : 3;
  P.spd = lerp(P.spd, target, 1 - Math.exp(-4 * dt));
  pos += P.spd * dt;
  sway = (Math.sin(pos * 0.007) + Math.sin(pos * 0.0029 + 1) * 0.7) * Math.min(1, pos / 120) * def.curv;
  camX = lerp(camX, P.x * 0.6, 1 - Math.exp(-8 * dt));

  // 점프 / 중력
  keys.jumpBuf = Math.max(0, keys.jumpBuf - dt);
  if (keys.jumpBuf > 0 && P.ground && P.fall <= 0 && playing) { P.vy = 10.2; P.ground = false; P.sq = -0.3; keys.jumpBuf = 0; Snd.jump(); const p = playerScreen(); burst(p.x, p.y, 6, ['#fff', '#d8f5ff'], 120, 200, 0.4); }
  if (!P.ground) {
    P.vy -= 27 * dt; P.jy += P.vy * dt;
    if (P.jy <= 0) { P.jy = 0; P.vy = 0; P.ground = true; P.sq = 0.38; Snd.land(); const p = playerScreen(); burst(p.x, p.y, 8, ['#fff', '#e8d8b0'], 150, 300, 0.4); }
  }
  P.sq = lerp(P.sq, 0, 1 - Math.exp(-12 * dt));
  if (P.ground && playing && P.fall <= 0) {
    const before = Math.floor(P.run / Math.PI); P.run += P.spd * dt * 0.75;
    if (Math.floor(P.run / Math.PI) !== before) Snd.step(P.stepK ^= 1);
  } else P.run += dt * 3;

  // 타이머류
  for (const k of ['inv', 'stun', 'magnet', 'dash', 'shake', 'flash', 'banner']) { const o = k === 'shake' || k === 'flash' || k === 'banner' ? S : P; o[k] = Math.max(0, o[k] - dt); }
  if (P.fall > 0) { P.fall -= dt; if (P.fall <= 0) { if (S.lives <= 0) return gameOver('구멍에 빠졌어요 😵'); P.inv = 2.0; P.jy = 0; P.vy = 0; P.ground = true; P.x = clamp(P.x, -2, 2); } }
  S.comboT = Math.max(0, S.comboT - dt); if (S.comboT === 0) S.combo = 0;

  if (playing) {
    S.timeLeft -= dt;
    if (S.timeLeft < 10 && Math.floor(S.timeLeft) !== S.lastTick) { S.lastTick = Math.floor(S.timeLeft); if (S.timeLeft > 0) Snd.tick(); }
    if (S.timeLeft <= 0) { S.timeLeft = 0; return gameOver('시간 초과 ⏰'); }
    if (pos + PD >= def.L) return stageClear();
    P.ice = false;
    // 충돌
    const band = 0.75 + P.spd * dt * 0.6;
    for (const o of objs) {
      if (o.dead) continue;
      const d = o.z - pos;
      if (d < -4 || d > 150) continue;
      if (o.t === 'crab' || o.t === 'pony') o.x = o.bx + Math.sin(t * o.sp + o.ph) * o.rg;
      const mag = P.magnet > 0 || P.dash > 0;
      if ((o.t === 'mand' || o.t === 'gold') && mag && d < 13 && d > PD - 1) { o.x = lerp(o.x, P.x, 1 - Math.exp(-5 * dt)); o.h = lerp(o.h, P.jy + 0.6, 1 - Math.exp(-3 * dt)); }
      const dd = Math.abs(d - PD), dx = Math.abs(o.x - P.x);
      if (o.t === 'ice') { if (d < PD + o.len / 2 && d > PD - o.len / 2) P.ice = true; continue; }
      if (P.fall > 0) continue;
      if (o.t === 'mand' || o.t === 'gold') { if (dd < band && dx < (mag ? 3.4 : 1.05) && (mag || Math.abs(o.h - P.jy) < 1.0)) collect(o); }
      else if (o.t === 'pow') { if (dd < band && dx < 1.2 && Math.abs(1.2 - P.jy) < 1.6) powerUp(o); }
      else if (o.t === 'hole') { if (dd < 1.15 && P.jy < 0.3 && (o.full || dx < 1.15)) dropHole(o); }
      else if (o.t === 'rock') { if (dd < band && dx < 1.0 && P.jy < 0.85) stumble(o); }
      else if (o.t === 'crab') { if (dd < band && dx < 0.95 && P.jy < 0.8) stumble(o); }
      else if (o.t === 'pony') { if (dd < band && dx < 1.15 && P.jy < 1.5) stumble(o); }
      else if (o.t === 'hareubang') { if (dd < band && dx < 0.95 && P.jy < 2.3) stumble(o); }
    }
  } else if (S.state === 'clear' && S.clearT < 2.2 && Math.random() < 0.6) {
    burst(rnd(0, W), -10, 1, ['#ff9ccf', '#ffe14d', '#7be3ff', '#ff8a3d', '#9cff9c'], 60, 120, 2.4);
  }
  updateFx(dt);
}
function updateFx(dt) {
  for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.life > 0);
  for (const f of texts) { f.life -= dt; f.y -= 38 * dt; }
  texts = texts.filter(f => f.life > 0);
  // 속도/부스트 연출 파티클
  if (S.state === 'play' && P.dash > 0 && Math.random() < 0.7) { const p = playerScreen(); parts.push({ x: p.x + rnd(-20, 20), y: p.y - p.pu * 0.4, vx: rnd(-40, 40), vy: rnd(60, 160), g: 0, life: 0.4, max: 0.4, c: pick(['#ffe14d', '#ff8a3d', '#fff']), r: rnd(3, 7), s: false }); }
  if (objs.length > 400) objs = objs.filter(o => !o.dead);
}
function gameOver(reason) {
  S.state = 'over'; S.over = reason; S.clearT = 0; Snd.stopBgm(); Snd.over();
}
function stageClear() {
  S.state = 'clear'; S.clearT = 0; Snd.stopBgm(); Snd.clear();
  const ratio = S.got / S.total, stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
  const timeB = Math.floor(S.timeLeft) * 30, starB = stars * 200;
  addScore(timeB + starB + 500);
  S.bonus = { stars, timeB, starB, ratio };
  S.lives = Math.min(5, S.lives + (stars === 3 ? 1 : 0));
}

// ───────────────────────── 렌더: 배경 ─────────────────────────
function txt(s, x, y, size, col = '#fff', align = 'center', stroke = '#5a2a00') {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function panel(x, y, w, h, fill = 'rgba(40,20,70,.55)', r = 16) { rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke(); }
function ell(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
function circ(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fillStyle = fill; ctx.fill(); }

function drawSky(th) {
  const sh = -(camX * 6 + sway * 40);
  const g = ctx.createLinearGradient(0, 0, 0, HZ); g.addColorStop(0, th.skyT); g.addColorStop(1, th.skyB);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, HZ + 2);
  // 별 / 오로라
  if (th.night || S.def.n % 5 === 4) {
    const cnt = th.night ? 90 : 25;
    for (let i = 0; i < cnt; i++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)); circ(hash(i) * W, hash(i + 50) * HZ * 0.8, 1 + hash(i + 9) * 1.6, '#fff'); }
    ctx.globalAlpha = 1;
  }
  if (th.night) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 46; ctx.lineCap = 'round';
    ['#46ffb0', '#7a8bff', '#ff7ae0'].forEach((c, k) => {
      ctx.strokeStyle = c; ctx.globalAlpha = 0.13; ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 24) { const y = HZ * (0.3 + k * 0.1) + Math.sin(x * 0.008 + t * 0.7 + k * 2) * 24; x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    });
    ctx.restore();
  }
  // 해/달
  const sx = W * 0.78 + sh * 0.1, sy = HZ * (S.def.n % 5 === 4 ? 0.62 : 0.34), sr = Math.min(W, H) * 0.06;
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 3.2); glow.addColorStop(0, th.night ? 'rgba(255,251,200,.5)' : 'rgba(255,240,160,.7)'); glow.addColorStop(1, 'rgba(255,240,160,0)');
  ctx.fillStyle = glow; ctx.fillRect(sx - sr * 3.2, sy - sr * 3.2, sr * 6.4, sr * 6.4);
  if (th.night) {   // 초승달
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.moveTo(sx + sr * 0.45 + sr * 0.85, sy - sr * 0.2); ctx.arc(sx + sr * 0.45, sy - sr * 0.2, sr * 0.85, 0, TAU); ctx.fillStyle = th.sun; ctx.fill('evenodd');
  } else circ(sx, sy, sr, th.sun);
  // 구름
  ctx.globalAlpha = th.night ? 0.25 : 0.9;
  for (let i = 0; i < 6; i++) {
    const cx = (((hash(i + 3) * (W + 300)) + t * (6 + i * 2) + sh * 0.3) % (W + 300) + (W + 300)) % (W + 300) - 150, cy = HZ * (0.14 + hash(i + 7) * 0.4), s = 22 + hash(i) * 22;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, s, 0, TAU); ctx.arc(cx + s * 0.9, cy + s * 0.15, s * 0.8, 0, TAU); ctx.arc(cx - s * 0.9, cy + s * 0.2, s * 0.7, 0, TAU); ctx.arc(cx + s * 1.7, cy + s * 0.3, s * 0.55, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 한라산
  const bx = W * 0.5 + sh * 0.4, w = Math.max(W * 0.95, 700), h = HZ * 0.62;
  ctx.fillStyle = th.mt; ctx.beginPath(); ctx.moveTo(bx - w / 2, HZ);
  ctx.bezierCurveTo(bx - w * 0.25, HZ - h * 0.18, bx - w * 0.18, HZ - h * 0.9, bx - w * 0.07, HZ - h);
  ctx.lineTo(bx - w * 0.035, HZ - h * 0.92); ctx.lineTo(bx + w * 0.035, HZ - h * 0.92); ctx.lineTo(bx + w * 0.07, HZ - h);
  ctx.bezierCurveTo(bx + w * 0.18, HZ - h * 0.9, bx + w * 0.25, HZ - h * 0.18, bx + w / 2, HZ); ctx.closePath(); ctx.fill();
  ctx.fillStyle = th.snow ? '#fff' : 'rgba(255,255,255,.18)'; ctx.beginPath();
  ctx.moveTo(bx - w * 0.115, HZ - h * 0.78); ctx.lineTo(bx - w * 0.07, HZ - h); ctx.lineTo(bx - w * 0.035, HZ - h * 0.92); ctx.lineTo(bx + w * 0.035, HZ - h * 0.92); ctx.lineTo(bx + w * 0.07, HZ - h); ctx.lineTo(bx + w * 0.115, HZ - h * 0.78);
  ctx.lineTo(bx + w * 0.05, HZ - h * 0.84); ctx.lineTo(bx, HZ - h * 0.76); ctx.lineTo(bx - w * 0.05, HZ - h * 0.84); ctx.closePath(); ctx.fill();
  // 오름(작은 언덕) 또는 바다
  if (th.sea) {
    const sg = ctx.createLinearGradient(0, HZ - 22, 0, HZ); sg.addColorStop(0, th.sea); sg.addColorStop(1, th.night ? '#2d4fb0' : '#7fd6ff');
    ctx.fillStyle = sg; ctx.fillRect(0, HZ - 22, W, 23);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 26; i++) { const a = Math.abs(Math.sin(t * 1.5 + i * 1.7)); ctx.globalAlpha = a * 0.8; ctx.fillRect(hash(i + 20) * W + sh * 0.2, HZ - 20 + hash(i + 60) * 18, 8 + hash(i) * 14, 2); }
    ctx.globalAlpha = 1;
  } else {
    for (let L = 0; L < 2; L++) {
      ctx.fillStyle = L ? th.hill : th.mt; ctx.globalAlpha = L ? 1 : 0.5; ctx.beginPath(); ctx.moveTo(0, HZ + 1);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, HZ - (14 + 12 * L) - Math.sin((x + sh * (0.5 + L * 0.3)) * (0.006 + L * 0.004) + L * 2) * (10 + 8 * L) - 8);
      ctx.lineTo(W, HZ + 1); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
function drawGround(th) {
  const base = H * 0.9 - HZ;
  for (let y = Math.ceil(HZ); y < H; y += 2) {
    const s = (y + 1 - HZ) / base, d = K / s - K, z = pos + d, stripe = Math.floor(z / 2.5) & 1;
    const xc = W / 2 + (curveX(d) - camX) * s * UNIT, rh = 3.3 * s * UNIT, cw = 0.3 * s * UNIT;
    ctx.fillStyle = stripe ? th.g1 : th.g2; ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = stripe ? th.r1 : th.r2; ctx.fillRect(xc - rh, y, rh * 2, 2);
    ctx.fillStyle = (Math.floor(z / 1.25) & 1) ? '#fff' : '#ff8a3d';
    ctx.fillRect(xc - rh - cw, y, cw, 2); ctx.fillRect(xc + rh, y, cw, 2);
    if (stripe) { ctx.fillStyle = 'rgba(255,255,255,.7)'; const lw = Math.max(1, 0.08 * s * UNIT); ctx.fillRect(xc - s * UNIT - lw / 2, y, lw, 2); ctx.fillRect(xc + s * UNIT - lw / 2, y, lw, 2); }
  }
  const fg = ctx.createLinearGradient(0, HZ, 0, HZ + H * 0.1); fg.addColorStop(0, th.skyB); fg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.7; ctx.fillStyle = fg; ctx.fillRect(0, HZ, W, H * 0.1); ctx.globalAlpha = 1;
}
function drawWeather(th) {
  if (th.fx === 'none') return;
  const n = th.fx === 'snow' ? 90 : th.fx === 'petal' ? 40 : 30;
  for (let i = 0; i < n; i++) {
    const sp = 0.5 + hash(i + 9), x = ((hash(i) * W + Math.sin(t * 0.8 + i) * 30 - P.vx * 6 * sp + S.wind * 20 * t * 0) % W + W) % W;
    if (th.fx === 'firefly') { const y = HZ * 0.9 + hash(i + 3) * H * 0.5 + Math.sin(t + i) * 14; ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)); circ(x, y, 3, '#fff3a0'); circ(x, y, 7, 'rgba(255,240,150,.25)'); }
    else { const y = (hash(i + 3) * H + t * (th.fx === 'snow' ? 70 : 45) * sp) % H; ctx.globalAlpha = 0.9; if (th.fx === 'snow') circ(x, y, 1.5 + hash(i) * 2.5, '#fff'); else ell(x, y, 5, 3, hash(i) > 0.5 ? '#ffb7d9' : '#fff'); }
  }
  ctx.globalAlpha = 1;
}

// ───────────────────────── 렌더: 스프라이트 ─────────────────────────
function drawHareubang(p, big) {
  const u = p.pu, x = p.x, y = p.y, c = '#8c8a95', dk = '#6d6b78';
  ell(x, y, u * 0.9, u * 0.22, 'rgba(0,0,0,.22)');
  rr(x - u * 0.62, y - u * 2.3, u * 1.24, u * 2.2, u * 0.45); ctx.fillStyle = c; ctx.fill();
  ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(x, y - u * 2.45, u * 0.85, u * 0.28, 0, 0, TAU); ctx.fill();   // 모자 챙
  rr(x - u * 0.5, y - u * 3.05, u * 1.0, u * 0.7, u * 0.3); ctx.fill();
  ell(x - u * 0.62, y - u * 1.15, u * 0.2, u * 0.5, c); ell(x + u * 0.62, y - u * 1.15, u * 0.2, u * 0.5, c);
  ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = Math.max(1.5, u * 0.07); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - u * 0.4, y - u * 1.95); ctx.lineTo(x - u * 0.16, y - u * 1.9); ctx.moveTo(x + u * 0.4, y - u * 1.95); ctx.lineTo(x + u * 0.16, y - u * 1.9); ctx.stroke();
  ell(x, y - u * 1.7, u * 0.19, u * 0.14, dk);
  ell(x - u * 0.38, y - u * 1.7, u * 0.12, u * 0.08, 'rgba(255,130,150,.8)'); ell(x + u * 0.38, y - u * 1.7, u * 0.12, u * 0.08, 'rgba(255,130,150,.8)');
  ctx.beginPath(); ctx.arc(x, y - u * 1.45, u * 0.18, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ell(x, y - u * 0.9, u * 0.45, u * 0.12, dk);
}
function drawMand(x, y, r, gold, spin) {
  if (gold) { const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4); g.addColorStop(0, 'rgba(255,240,120,.7)'); g.addColorStop(1, 'rgba(255,240,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8); }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, gold ? '#fff6a0' : '#ffd27a'); g.addColorStop(0.5, gold ? '#ffd21f' : '#ff9a1f'); g.addColorStop(1, gold ? '#e0a000' : '#e8690a');
  ctx.beginPath(); ctx.ellipse(x, y, r * (1 + 0.08 * Math.sin(spin)), r * 0.92, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ell(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.13, 'rgba(255,255,255,.75)');
  ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(x + r * 0.22, y - r * 0.95, r * 0.4, r * 0.17, -0.5, 0, TAU); ctx.fill();
  circ(x, y - r * 0.88, r * 0.1, '#6b4a1e');
  if (gold) { ctx.fillStyle = '#fff'; const a = Math.abs(Math.sin(spin * 0.7)); ctx.globalAlpha = a; ctx.fillRect(x + r * 0.7, y - r * 0.9 - r * 0.3, 2, r * 0.6); ctx.fillRect(x + r * 0.7 - r * 0.3, y - r * 0.9, r * 0.6, 2); ctx.globalAlpha = 1; }
}
function emoji(ch, x, y, size, flip) {
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000'; ctx.fillText(ch, 0, 0); ctx.restore();
}
function drawObj(o, d) {
  const p = proj(o.x, d), u = p.pu, fade = clamp((140 - d) / 40, 0, 1);
  ctx.globalAlpha = fade;
  switch (o.t) {
    case 'mand': case 'gold': {
      const h = o.h + Math.sin(t * 5 + o.ph) * 0.1;
      ell(p.x, p.y, u * 0.38, u * 0.1, 'rgba(0,0,0,.2)'); drawMand(p.x, p.y - h * u, u * 0.42, o.t === 'gold', t * 4 + o.ph); break;
    }
    case 'pow': {
      const h = 1.2 + Math.sin(t * 3 + o.ph) * 0.15;
      ell(p.x, p.y, u * 0.5, u * 0.13, 'rgba(0,0,0,.2)');
      const cy = p.y - h * u, g = ctx.createRadialGradient(p.x, cy, u * 0.1, p.x, cy, u * 0.75); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(160,230,255,.55)');
      circ(p.x, cy, u * 0.72, g); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      emoji({ mag: '🧲', shield: '🛡️', dash: '⚡', clock: '⏰', heart: '💖' }[o.k], p.x, cy + u * 0.28, u * 0.8); break;
    }
    case 'hole': {
      const rx = (o.full ? 3.15 : 1.0) * u, y0 = gy(d + 1.3), y1 = gy(d - 1.3), cy = (y0 + y1) / 2, ry = (y1 - y0) / 2;
      ell(p.x, cy, rx * 1.1, ry * 1.2, '#ff8a3d'); ell(p.x, cy, rx * 1.02, ry * 1.1, '#7a4a2a');
      const g = ctx.createRadialGradient(p.x, cy, 1, p.x, cy, rx); g.addColorStop(0, '#05030a'); g.addColorStop(1, '#2a1830');
      ctx.beginPath(); ctx.ellipse(p.x, cy, rx * 0.92, ry * 0.95, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
      if (!o.full) { circ(p.x - u * 0.22, cy, u * 0.07, '#fff'); circ(p.x + u * 0.22, cy, u * 0.07, '#fff'); }   // 구멍 속 눈
      break;
    }
    case 'ice': {
      const y0 = gy(d + o.len / 2), y1 = gy(d - o.len / 2);
      ctx.beginPath(); ctx.ellipse(p.x, (y0 + y1) / 2, 3.1 * u, (y1 - y0) / 2, 0, 0, TAU); ctx.fillStyle = 'rgba(190,240,255,.8)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { const a = Math.abs(Math.sin(t * 3 + i)); ctx.globalAlpha = fade * a; ctx.fillRect(p.x + (hash(i + o.z) - 0.5) * 5 * u, (y0 + y1) / 2 + (hash(i + 4) - 0.5) * (y1 - y0) * 0.7, 3, 3); }
      break;
    }
    case 'rock': {
      ell(p.x, p.y, u * 0.85, u * 0.2, 'rgba(0,0,0,.25)');
      ctx.beginPath(); ctx.moveTo(p.x - u * 0.8, p.y); ctx.quadraticCurveTo(p.x - u * 0.9, p.y - u * 0.9, p.x - u * 0.2, p.y - u * 1.0); ctx.quadraticCurveTo(p.x + u * 0.8, p.y - u * 1.0, p.x + u * 0.8, p.y); ctx.closePath();
      ctx.fillStyle = '#4a4650'; ctx.fill(); ell(p.x - u * 0.2, p.y - u * 0.75, u * 0.3, u * 0.12, 'rgba(255,255,255,.15)');
      circ(p.x - u * 0.22, p.y - u * 0.5, u * 0.09, '#fff'); circ(p.x + u * 0.22, p.y - u * 0.5, u * 0.09, '#fff'); circ(p.x - u * 0.22, p.y - u * 0.5, u * 0.045, '#222'); circ(p.x + u * 0.22, p.y - u * 0.5, u * 0.045, '#222');
      ell(p.x - u * 0.42, p.y - u * 0.36, u * 0.1, u * 0.06, 'rgba(255,120,140,.7)'); ell(p.x + u * 0.42, p.y - u * 0.36, u * 0.1, u * 0.06, 'rgba(255,120,140,.7)');
      ctx.fillStyle = '#ff7b2b'; ctx.fillRect(p.x - u * 0.5, p.y - u * 0.98, u * 0.35, u * 0.07); break;
    }
    case 'crab': {
      ell(p.x, p.y, u * 0.7, u * 0.16, 'rgba(0,0,0,.22)'); emoji('🦀', p.x, p.y - u * 0.05, u * 1.3); break;
    }
    case 'pony': {
      ell(p.x, p.y, u * 1.0, u * 0.2, 'rgba(0,0,0,.22)'); emoji('🐴', p.x, p.y - u * 0.1 - Math.abs(Math.sin(t * 9)) * u * 0.2, u * 2.0, Math.cos(t * o.sp + o.ph) > 0); break;
    }
    case 'hareubang': drawHareubang(p); break;
  }
  ctx.globalAlpha = 1;
}
function drawScenery(kind, p, side, seed) {
  const u = p.pu, x = p.x, y = p.y;
  ell(x, y, u * 0.9, u * 0.2, 'rgba(0,0,0,.15)');
  if (kind === 'palm') {
    const h = 3.8 * u;
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = u * 0.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + side * u * -0.5, y - h * 0.5, x + side * u * -0.15, y - h); ctx.stroke();
    const tx = x + side * u * -0.15, ty = y - h;
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(tx, ty); ctx.rotate(Math.PI * (1.05 + i * 0.18) + Math.sin(t * 1.6 + i + seed) * 0.05); ctx.beginPath(); ctx.ellipse(u * 1.0, 0, u * 1.15, u * 0.26, 0, 0, TAU); ctx.fillStyle = i % 2 ? '#3ea84a' : '#58c35a'; ctx.fill(); ctx.restore(); }
    circ(tx - u * 0.15, ty + u * 0.15, u * 0.2, '#7a4a1a'); circ(tx + u * 0.15, ty + u * 0.2, u * 0.2, '#7a4a1a');
  } else if (kind === 'pine') {
    ctx.fillStyle = '#7a5230'; ctx.fillRect(x - u * 0.18, y - u * 1.0, u * 0.36, u * 1.0);
    for (let i = 0; i < 3; i++) { const by = y - u * (0.8 + i * 1.0), w = u * (1.3 - i * 0.3);
      ctx.fillStyle = '#2f8f5b'; ctx.beginPath(); ctx.moveTo(x - w, by); ctx.lineTo(x, by - u * 1.5); ctx.lineTo(x + w, by); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - w * 0.55, by - u * 0.8); ctx.lineTo(x, by - u * 1.5); ctx.lineTo(x + w * 0.55, by - u * 0.8); ctx.quadraticCurveTo(x, by - u * 0.55, x - w * 0.55, by - u * 0.8); ctx.fill(); }
  } else if (kind === 'canola') {
    for (let i = 0; i < 6; i++) { const ox = (i - 2.5) * u * 0.32, hh = u * (0.9 + hash(i + seed) * 0.7);
      ctx.strokeStyle = '#3d9b3d'; ctx.lineWidth = Math.max(1.5, u * 0.07); ctx.beginPath(); ctx.moveTo(x + ox, y); ctx.lineTo(x + ox + Math.sin(t * 2 + i) * u * 0.08, y - hh); ctx.stroke();
      circ(x + ox, y - hh, u * 0.2, i % 2 ? '#ff9ccf' : '#fff'); circ(x + ox, y - hh, u * 0.08, '#ffd21f'); }
  } else if (kind === 'mtree' || kind === 'lantern') {
    const night = kind === 'lantern';
    ctx.fillStyle = '#6d4a2a'; ctx.fillRect(x - u * 0.16, y - u * 1.6, u * 0.32, u * 1.6);
    circ(x, y - u * 2.3, u * 1.1, night ? '#1f6b55' : '#3fae4e'); circ(x - u * 0.7, y - u * 1.9, u * 0.8, night ? '#1a5c4a' : '#4fc25a'); circ(x + u * 0.7, y - u * 1.9, u * 0.8, night ? '#1a5c4a' : '#4fc25a');
    for (let i = 0; i < 6; i++) { const ox = (hash(i + seed) - 0.5) * u * 2, oy = -u * (1.6 + hash(i + 7 + seed) * 1.2);
      if (night) { circ(x + ox, y + oy, u * 0.45, 'rgba(255,200,80,.25)'); } circ(x + ox, y + oy, u * 0.18, night ? '#ffe28a' : '#ff9a1f'); }
  } else drawHareubang(p);
}
function drawGoal(d) {
  const L = S.def.L, a = proj(-3.6, d), b = proj(3.6, d), u = a.pu;
  const y0 = gy(d + 0.8), y1 = gy(d - 0.8);
  for (let i = 0; i < 12; i++) { const x0 = lerp(a.x, b.x, i / 12), x1 = lerp(a.x, b.x, (i + 1) / 12); ctx.fillStyle = i % 2 ? '#fff' : '#222'; ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0); }
  ctx.fillStyle = '#ff5a8a'; ctx.fillRect(a.x - u * 0.2, a.y - u * 5, u * 0.4, u * 5); ctx.fillRect(b.x - u * 0.2, b.y - u * 5, u * 0.4, u * 5);
  rr(a.x - u * 0.2, a.y - u * 5.4, b.x - a.x + u * 0.4, u * 1.4, u * 0.4); ctx.fillStyle = '#ffb02e'; ctx.fill(); ctx.lineWidth = Math.max(2, u * 0.1); ctx.strokeStyle = '#fff'; ctx.stroke();
  txt('🍊 GOAL 🍊', (a.x + b.x) / 2, a.y - u * 4.7, u * 1.0, '#fff', 'center', '#b34700');
  for (let i = 0; i <= 8; i++) { const x = lerp(a.x, b.x, i / 8); drawMand(x, a.y - u * 3.8 + Math.sin(i * 1.3 + t * 3) * u * 0.1, u * 0.28, false, t * 4 + i); }
}

// ───────────────────────── 렌더: 플레이어 ─────────────────────────
function drawPlayer(pp) {
  const p = pp || proj(P.x, PD), u = p.pu, R = 0.62 * u;
  const fall = P.fall > 0 ? 1 - P.fall / 1.0 : 0;
  const bob = P.ground && S.state !== 'paused' ? Math.abs(Math.sin(P.run)) * 0.14 * u : 0;
  ell(p.x, p.y, R * (1 - Math.min(P.jy, 2.2) * 0.14) * (1 - fall), u * 0.2 * (1 - Math.min(P.jy, 2.2) * 0.1) * (1 - fall), 'rgba(0,0,0,.25)');
  let by = p.y - P.jy * u - bob + fall * u * 1.0;
  ctx.save();
  if (P.inv > 0 && P.fall <= 0 && Math.floor(t * 18) % 2) ctx.globalAlpha = 0.45;
  ctx.translate(p.x, by);
  if (P.dash > 0) { for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.18; ell(0, u * 0.25 + i * u * 0.5, R * (1.1 - i * 0.25), u * 0.3, '#ffe14d'); } ctx.globalAlpha = (P.inv > 0 && Math.floor(t * 18) % 2) ? 0.45 : 1; }
  ctx.rotate(fall * 5); ctx.scale((1 + P.sq) * (1 - fall * 0.9), (1 - P.sq) * (1 - fall * 0.9));
  ctx.translate(0, -(R + u * 0.2));
  const lean = clamp(P.vx / 8, -1, 1);
  // 발
  const ph = Math.sin(P.run), lift = P.ground ? u * 0.16 : u * 0.28;
  ell(-R * 0.4, R * 0.95 - Math.max(0, ph) * lift, u * 0.3, u * 0.2, '#fff6e0'); ell(R * 0.4, R * 0.95 - Math.max(0, -ph) * lift, u * 0.3, u * 0.2, '#fff6e0');
  // 팔
  const arm = P.ground ? ph * 0.5 : -0.9;
  ell(-R * 0.98, R * 0.1 + arm * u * 0.2, u * 0.17, u * 0.26, '#ff8a1f'); ell(R * 0.98, R * 0.1 - arm * u * 0.2, u * 0.17, u * 0.26, '#ff8a1f');
  // 몸
  const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.05); g.addColorStop(0, '#ffcf70'); g.addColorStop(0.55, '#ff9d22'); g.addColorStop(1, '#ec6a0c');
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.02, R * 0.95, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ell(-R * 0.45, -R * 0.55, R * 0.22, R * 0.12, 'rgba(255,255,255,.7)');
  // 잎
  ctx.save(); ctx.translate(lean * R * 0.1, -R * 0.93); ctx.rotate(Math.sin(P.run * 2) * 0.15 - lean * 0.2);
  ctx.fillStyle = '#43b84f'; ctx.beginPath(); ctx.ellipse(R * 0.28, -R * 0.1, R * 0.4, R * 0.16, -0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5fd06a'; ctx.beginPath(); ctx.ellipse(-R * 0.22, -R * 0.06, R * 0.3, R * 0.13, 0.5, 0, TAU); ctx.fill(); circ(0, 0, R * 0.09, '#6b4a1e'); ctx.restore();
  // 얼굴
  const ex = lean * R * 0.1, ey = -R * 0.05;
  if (S.state !== 'title') {   // 플레이 중: 뒷모습 (귤 껍질 결 + 꼭지 자국)
    ctx.strokeStyle = 'rgba(190,80,0,.3)'; ctx.lineWidth = Math.max(1.5, u * 0.05); ctx.lineCap = 'round';
    for (const k of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.ellipse(k * R * 0.9, R * 0.05, R * (0.28 + Math.abs(k) * 0.2), R * 0.8, 0, -1.2, 1.2 + (k > 0 ? 0 : 0)); ctx.stroke(); }
    ell(lean * R * 0.1, R * 0.62, R * 0.2, R * 0.08, 'rgba(160,60,0,.3)');
  } else for (const sd of [-1, 1]) { circ(ex + sd * R * 0.33, ey, R * 0.2, '#fff'); circ(ex + sd * R * 0.33 + lean * R * 0.06, ey + R * 0.02, R * 0.12, '#2a1a10'); circ(ex + sd * R * 0.33 + R * 0.04, ey - R * 0.05, R * 0.045, '#fff'); ell(ex + sd * R * 0.62, ey + R * 0.28, R * 0.14, R * 0.08, 'rgba(255,90,120,.65)'); }
  ctx.strokeStyle = '#7a2e00'; ctx.lineWidth = Math.max(2, u * 0.06); ctx.lineCap = 'round';
  if (S.state !== 'title') { /* 뒷모습: 입 없음 */ }
  else if (!P.ground || P.stun > 0) { ell(ex, ey + R * 0.42, R * 0.1, R * 0.13, '#7a2e00'); }
  else { ctx.beginPath(); ctx.arc(ex, ey + R * 0.28, R * 0.16, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }
  ctx.restore();
  // 보호막 / 자석
  if (P.shield > 0) { const cy = by - R - u * 0.2; ctx.beginPath(); ctx.arc(p.x, cy, R * 1.35, 0, TAU); ctx.fillStyle = 'rgba(140,230,255,.25)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); }
  if (P.magnet > 0) { const cy = by - R - u * 0.2, r = R * (1.5 + 0.2 * Math.sin(t * 8)); ctx.beginPath(); ctx.arc(p.x, cy, r, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(200,120,255,.7)'; ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]); }
}

// ───────────────────────── 렌더: HUD ─────────────────────────
function drawHUD() {
  const def = S.def, m = Math.max(12, W * 0.015), sz = clamp(W * 0.032, 18, 30);
  panel(m, m, Math.min(230, W * 0.4), 70, 'rgba(255,120,40,.65)');
  txt('SCORE', m + 14, m + 20, sz * 0.62, '#ffe9b0', 'left'); txt(String(S.score), m + 14, m + 48, sz * 1.1, '#fff', 'left');
  const tw = Math.min(150, W * 0.28), low = S.timeLeft < 10;
  panel(W - m - tw, m, tw, 70, low && Math.floor(t * 4) % 2 ? 'rgba(220,40,60,.8)' : 'rgba(40,120,220,.65)');
  txt('TIME', W - m - tw + 14, m + 20, sz * 0.62, '#cfe8ff', 'left'); txt('⏱ ' + Math.ceil(S.timeLeft), W - m - tw / 2, m + 48, sz * 1.15, '#fff', 'center');
  // 진행바
  const bw = Math.min(W * 0.34, 380), bx = W / 2 - bw / 2, by = m + 8;
  panel(bx - 12, m, bw + 24, 54, 'rgba(40,20,70,.55)', 27);
  txt(`STAGE ${def.n} · ${def.theme.name}`, W / 2, m + 17, sz * 0.62, '#fff');
  rr(bx, by + 26, bw, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
  const pr = clamp(pos / def.L, 0, 1); rr(bx, by + 26, Math.max(10, bw * pr), 10, 5); ctx.fillStyle = '#ffd54f'; ctx.fill();
  drawMand(bx + bw * pr, by + 31, 10, false, t * 3); txt('🏁', bx + bw + 2, by + 31, 18, '#fff', 'center', null);
  // 하트
  for (let i = 0; i < Math.max(3, S.lives); i++) txt(i < S.lives ? '❤️' : '🤍', m + 18 + i * (sz * 1.1), m + 96, sz * 0.95, '#fff', 'center', null);
  // 파워업
  let py = m + 130;
  [['🧲', P.magnet, 8], ['⚡', P.dash, 4], ['🛡️', P.shield ? 1 : 0, 1]].forEach(([e, v, mx]) => {
    if (v <= 0) return; panel(m, py, 86, 34, 'rgba(40,20,70,.55)', 17); txt(e, m + 20, py + 18, 20, '#fff', 'center', null);
    rr(m + 38, py + 12, 40, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill(); rr(m + 38, py + 12, Math.max(6, 40 * v / mx), 10, 5); ctx.fillStyle = '#7be3ff'; ctx.fill(); py += 40;
  });
  // 콤보
  if (S.combo >= 3) { const mult = Math.min(5, 1 + Math.floor(S.combo / 5)), k = 1 + 0.08 * Math.sin(t * 14); ctx.save(); ctx.translate(W - m - 10, H * 0.34); ctx.scale(k, k); txt(`${S.combo} COMBO`, 0, 0, sz * 1.4, '#ffe14d', 'right', '#b34700'); txt(`x${mult} 점수`, 0, sz * 1.1, sz * 0.8, '#fff', 'right', '#b34700'); ctx.restore(); }
  // 감귤 수집
  txt(`🍊 ${S.got}/${S.total}`, W - m - Math.min(150, W * 0.28) / 2, m + 96, sz * 0.8, '#fff', 'center');
  if (Math.abs(S.wind) > 1.3) txt((S.wind > 0 ? '💨 →' : '← 💨') + ' 바람!', W / 2, H * 0.2, sz * 1.0, '#fff');
  if (S.banner > 0) {
    const a = Math.min(1, S.banner * 2, (2.6 - S.banner) * 4); ctx.globalAlpha = a;
    const yy = H * 0.3 - (1 - a) * 30; txt(`STAGE ${def.n}`, W / 2, yy, sz * 2.6, '#fff', 'center', '#e0561a'); txt(def.theme.name, W / 2, yy + sz * 2.0, sz * 1.5, '#ffe9b0', 'center', '#a63d00');
    txt(`${S.total}개 중 감귤을 모아 별 3개를 노려요!`, W / 2, yy + sz * 3.4, sz * 0.8, '#fff', 'center', '#6a2a00'); ctx.globalAlpha = 1;
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${S.flash * 0.9})`; ctx.fillRect(0, 0, W, H); }
}
function star(x, y, r, on) {
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr_ = i % 2 ? r * 0.48 : r; ctx.lineTo(x + Math.cos(a) * rr_, y + Math.sin(a) * rr_); } ctx.closePath();
  ctx.fillStyle = on ? '#ffd21f' : 'rgba(255,255,255,.35)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = on ? '#c47a00' : 'rgba(255,255,255,.6)'; ctx.lineJoin = 'round'; ctx.stroke();
}
function drawTitle() {
  ctx.fillStyle = 'rgba(30,10,60,.35)'; ctx.fillRect(0, 0, W, H);
  const s = Math.min(W / 700, H / 640, 1.3), cx = W / 2, cy = H * 0.34;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.rotate(Math.sin(t * 2) * 0.03);
  txt('제주 감귤', 0, -52, 92, '#ffb02e', 'center', '#b34700'); txt('대탐험', 0, 40, 92, '#fff', 'center', '#e0561a');
  ctx.restore();
  const baseY = Math.max(cy + 100 * s + 70, Math.min(cy + 200 * s, H * 0.6 - 16)), cu = 50 * s + 14;
  drawPlayer({ x: cx, y: baseY, pu: cu });   // 타이틀에서만 정면(얼굴) 캐릭터
  for (let i = 0; i < 7; i++) if (i !== 3) drawMand(cx + (i - 3) * 62 * s, baseY - cu * 0.9 + Math.sin(t * 4 + i) * 8, 18 * s + 6, i === 2 || i === 4 ? i === 4 : false, t * 4 + i);
  const bw = Math.min(560, W * 0.9), by = H * 0.6;
  panel(cx - bw / 2, by, bw, 138 * Math.max(0.8, s), 'rgba(40,20,70,.6)');
  const f = Math.max(15, 20 * s);
  txt('← → 좌우 이동   ·   SPACE 점프   ·   ↑ 가속 ↓ 감속', cx, by + 30, f, '#fff', 'center', null);
  txt('구멍은 점프로 넘고 🗿 돌하르방은 피해요!', cx, by + 30 + f * 1.5, f, '#ffe9b0', 'center', null);
  txt('감귤을 모아 콤보를 이어가고, 시간 안에 골인! 🏁', cx, by + 30 + f * 3, f, '#ffe9b0', 'center', null);
  txt('P 일시정지   ·   M 소리', cx, by + 30 + f * 4.5, f * 0.85, '#cdb8ff', 'center', null);
  const bl = 0.75 + 0.25 * Math.sin(t * 5); ctx.globalAlpha = bl;
  txt('SPACE 또는 터치로 시작!', cx, H * 0.6 + 138 * Math.max(0.8, s) + 44, Math.max(24, 34 * s), '#fff', 'center', '#e0561a'); ctx.globalAlpha = 1;
  if (S.hi) txt(`🏆 최고 점수 ${S.hi}`, cx, H - 36, 22, '#fff', 'center', '#6a2a00');
}
function drawClear() {
  if (S.clearT < 0.9) return; const b = S.bonus, a = Math.min(1, (S.clearT - 0.9) * 2);
  ctx.globalAlpha = a; const pw = Math.min(500, W * 0.92), ph = 330, x = W / 2 - pw / 2, y = H * 0.5 - ph / 2;
  panel(x, y, pw, ph, 'rgba(255,120,60,.82)', 26);
  txt(`STAGE ${S.def.n} CLEAR!`, W / 2, y + 44, 46, '#fff', 'center', '#a63d00');
  for (let i = 0; i < 3; i++) { const on = i < b.stars && S.clearT > 1.3 + i * 0.35; star(W / 2 + (i - 1) * 74, y + 112 + (i === 1 ? -8 : 0), 32, on); }
  const f = 22, ly = y + 176;
  txt(`🍊 감귤 ${S.got}/${S.total} (${Math.round(b.ratio * 100)}%)`, W / 2, ly, f, '#fff', 'center', null);
  txt(`⏱ 남은 시간 +${b.timeB}   ⭐ 별 보너스 +${b.starB}`, W / 2, ly + 34, f * 0.9, '#ffe9b0', 'center', null);
  txt(`최고 콤보 ${S.maxCombo}   ·   점수 ${S.score}`, W / 2, ly + 68, f, '#fff', 'center', null);
  if (S.clearT > 1.6) { ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 6)); txt('SPACE ▶ 다음 스테이지', W / 2, y + ph - 28, 28, '#fff', 'center', '#a63d00'); }
  ctx.globalAlpha = 1;
}
function drawOver() {
  const a = Math.min(1, S.clearT * 1.5); ctx.fillStyle = `rgba(20,0,40,${a * 0.55})`; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = a;
  const pw = Math.min(480, W * 0.92), ph = 290, x = W / 2 - pw / 2, y = H / 2 - ph / 2;
  panel(x, y, pw, ph, 'rgba(90,40,140,.85)', 26);
  txt('GAME OVER', W / 2, y + 52, 54, '#ff9ccf', 'center', '#4a1a6a'); txt(S.over, W / 2, y + 108, 26, '#fff', 'center', null);
  txt(`스테이지 ${S.stage}  ·  점수 ${S.score}`, W / 2, y + 156, 28, '#ffe9b0', 'center', null); txt(`🏆 최고 ${S.hi}`, W / 2, y + 194, 24, '#fff', 'center', null);
  if (S.clearT > 0.8) { ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 6)); txt('SPACE ▶ 다시 도전', W / 2, y + ph - 34, 28, '#fff', 'center', '#4a1a6a'); }
  ctx.globalAlpha = 1;
}

function render() {
  const th = S.def.theme, shake = S.shake > 0 ? S.shake * 14 : 0;
  ctx.save(); if (shake) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  drawSky(th); drawGround(th);
  // 원근 순서대로 그리기(먼 것 → 가까운 것)
  const list = [];
  for (let i = Math.floor(pos / 6); i < (pos + 140) / 6; i++) for (const side of [-1, 1]) {
    const hsh = hash(i * 2 + (side > 0 ? 1 : 0) + S.def.n * 31), d = i * 6 - pos;
    if (hsh > 0.6 || d < -2) continue;
    const kind = th.deco[Math.floor(hash(i * 5 + side) * th.deco.length)], wx = side * (4.7 + hash(i * 7 + side) * 4.5);
    list.push([d, () => { ctx.globalAlpha = clamp((140 - d) / 40, 0, 1); drawScenery(kind, proj(wx, d), side, i); ctx.globalAlpha = 1; }]);
  }
  if (S.state !== 'title') {
    for (const o of objs) { if (o.dead) continue; const d = o.z - pos; if (d > -2 && d < 150) list.push([d, () => drawObj(o, d)]); }
    const gd = S.def.L - pos; if (gd > -2 && gd < 150) list.push([gd, () => drawGoal(gd)]);
  }
  if (S.state !== 'title') list.push([PD, () => drawPlayer()]);
  list.sort((a, b) => b[0] - a[0]); for (const [, f] of list) f();
  drawWeather(th);
  for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1); if (p.s) { ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r, p.y - 0.5, p.r * 2, 1.5); ctx.fillRect(p.x - 0.5, p.y - p.r, 1.5, p.r * 2); circ(p.x, p.y, p.r * 0.6, p.c); } else circ(p.x, p.y, p.r, p.c); }
  ctx.globalAlpha = 1;
  if (P.spd > S.def.base * 1.4 || P.dash > 0) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; for (let i = 0; i < 14; i++) { const a = hash(i + Math.floor(t * 20)) * TAU, r0 = Math.min(W, H) * 0.4, r1 = r0 + 90; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0 * 1.3, H * 0.5 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * r1 * 1.4, H * 0.5 + Math.sin(a) * r1); ctx.stroke(); } }
  for (const f of texts) { ctx.globalAlpha = clamp(f.life * 2, 0, 1); txt(f.s, f.x, f.y, f.size, f.col, 'center', '#5a2a00'); }
  ctx.globalAlpha = 1; ctx.restore();
  if (S.state === 'title') drawTitle(); else { drawHUD(); if (S.state === 'clear') drawClear(); if (S.state === 'over') drawOver();
    if (S.state === 'paused') { ctx.fillStyle = 'rgba(20,0,40,.55)'; ctx.fillRect(0, 0, W, H); txt('⏸ 일시정지', W / 2, H / 2 - 20, 56, '#fff', 'center', '#4a1a6a'); txt('P 또는 ESC로 계속하기', W / 2, H / 2 + 40, 24, '#ffe9b0', 'center', null); } }
}

// ───────────────────────── 루프 ─────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); render(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
