'use strict';
// =====================================================================
//  SLAP & RUN!  —  game logic (rendering lives in view3d.js / hud.js)
//  World coords: x = along the street, y = depth (0 = building side,
//  460 = near side), z = height above the ground.
// =====================================================================

// ---------- helpers ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick2(r, arr) { return arr[(r() * arr.length) | 0]; }
function weighted(table, wf) {
  let tot = 0; for (const k in table) tot += wf(k);
  let r = Math.random() * tot;
  for (const k in table) { r -= wf(k); if (r <= 0) return k; }
  return Object.keys(table)[0];
}
const fmtTime = t => { const s = Math.floor(t); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---------- world constants ----------
const GROUND_H = 460;
const SW_TOP_END = 118, ROAD_END = 332, CENTER_LINE = 225;
const Y_MIN = 8, Y_MAX = GROUND_H - 6;
const LANES = [{ y: 172, dir: 1, timer: 4 }, { y: 280, dir: -1, timer: 6 }];
// chasers are always measured against BASE_SPEED; the player's own speed can be upgraded in the shop
const BASE_SPEED = 230;
const PLAYER_BASE_SPEED = 345;   // player walk: +50% over the original 230
const PLAYER_SPRINT_SPEED = 533; // player sprint: +30% over the original 410
let PLAYER_SPEED = PLAYER_BASE_SPEED;
let SPRINT_SPEED = PLAYER_SPRINT_SPEED, STAMINA_REGEN = 22;
const SPRINT_DRAIN = 36;
let STAMINA_NATURAL = 100, STAMINA_MAX = 200;
const WINDED_RECOVER = 25;
let MAX_HEARTS = 8;
let SLAP_CD = 0.4, SLAP_REACH = 52;
const SLAP_DEPTH = 30, CATCH_PAD = 4, MEGA_REACH = 150;
const COMBO_WINDOW = 2.6;
const CHUNK = 900;
let MAX_ITEMS = 3;

// the renderer keeps these up to date: left edge of the view and visible width (world units)
let camX = -550, VW = 1100, camCX = 0; // camCX = smoothed centre the camera follows

// ---------- graphics quality (auto-adapts to the device; G cycles it manually) ----------
const QUALITY = {
  high:   { label: 'HIGH',   dpr: 2,    pad: 1300, decor: true,  skyline: true,  maxParts: 400, crowd: 1.0,  rigRange: 420, faces: true,  tex: 1 },
  medium: { label: 'MEDIUM', dpr: 1.5,  pad: 1000, decor: true,  skyline: true,  maxParts: 260, crowd: 0.85, rigRange: 260, faces: true,  tex: 1 },
  low:    { label: 'LOW',    dpr: 1,    pad: 750,  decor: false, skyline: false, maxParts: 150, crowd: 0.7,  rigRange: 140, faces: false, tex: 0.6 },
  potato: { label: 'POTATO', dpr: 0.7,  pad: 500,  decor: false, skyline: false, maxParts: 80,  crowd: 0.55, rigRange: 40,  faces: false, tex: 0.45 },
};
const QLEVELS = ['potato', 'low', 'medium', 'high'];
const IS_TOUCH_DEVICE = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
function deviceDefaultQuality() {
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  if (IS_TOUCH_DEVICE) return (mem <= 3 || cores <= 4) ? 'low' : 'medium';
  return (mem <= 2 || cores <= 2) ? 'medium' : 'high';
}
let qualityMode = 'auto';
try { qualityMode = localStorage.getItem('slaprun_quality') || 'auto'; } catch (e) { }
let qualityLevel = qualityMode === 'auto' ? deviceDefaultQuality() : qualityMode;
let Q = QUALITY[qualityLevel];
const qualityListeners = [];
function setQualityLevel(lv) {
  if (!QUALITY[lv] || lv === qualityLevel) return;
  qualityLevel = lv; Q = QUALITY[lv];
  for (const f of qualityListeners) f();
}
function cycleQualityMode() {
  const modes = ['auto', 'high', 'medium', 'low', 'potato'];
  qualityMode = modes[(modes.indexOf(qualityMode) + 1) % modes.length];
  try { localStorage.setItem('slaprun_quality', qualityMode); } catch (e) { }
  setQualityLevel(qualityMode === 'auto' ? deviceDefaultQuality() : qualityMode);
  autoQ.lockedUp = false;
}
// auto mode: watch real frame times and step quality down (or carefully back up)
const autoQ = { acc: 0, n: 0, win: 0, good: 0, lastChange: 0, lockedUp: false, lastDown: -99 };
function trackFrameTime(ms, now) {
  if (qualityMode !== 'auto' || ms > 120) return; // ignore tab switches / hitches
  autoQ.acc += ms; autoQ.n++; autoQ.win += ms;
  if (autoQ.win < 2000) return;
  const avg = autoQ.acc / autoQ.n;
  autoQ.acc = autoQ.n = autoQ.win = 0;
  const i = QLEVELS.indexOf(qualityLevel);
  if (avg > 21 && i > 0 && now - autoQ.lastChange > 2500) {
    if (now - autoQ.lastUp < 8000) autoQ.lockedUp = true; // stepping up didn't hold — stay down
    setQualityLevel(QLEVELS[i - 1]); autoQ.lastChange = now; autoQ.good = 0;
  } else if (avg < 18.5) {
    autoQ.good++;
    if (autoQ.good >= 8 && !autoQ.lockedUp && i < QLEVELS.length - 1 && QLEVELS.indexOf(deviceDefaultQuality()) >= i + 1) {
      setQualityLevel(QLEVELS[i + 1]); autoQ.lastChange = autoQ.lastUp = now; autoQ.good = 0;
    }
  } else autoQ.good = 0;
}
autoQ.lastUp = -99999;
let showFps = false;
try { showFps = localStorage.getItem('slaprun_fps') === '1'; } catch (e) { }
function toggleFps() { showFps = !showFps; try { localStorage.setItem('slaprun_fps', showFps ? '1' : '0'); } catch (e) { } }
function buzz(ms) { if (touchMode && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { } }

// ---------- audio (all synthesized) ----------
let AC = null, noiseBuf = null, muted = false;
function ac() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const len = AC.sampleRate * 0.6;
      noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function noise(dur, freq, q, gain, type = 'bandpass', freqEnd = 0, delay = 0) {
  const a = ac(); if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}
function tone(freq, dur, type, gain, freqEnd = 0, delay = 0) {
  const a = ac(); if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  slap() { noise(0.13, 2600, 0.7, 1.0); noise(0.05, 6500, 0.6, 0.6, 'highpass'); tone(230, 0.09, 'sine', 0.5, 70); },
  slapSoft() { noise(0.08, 2600, 0.7, 0.35); },
  whiff() { noise(0.16, 500, 1.3, 0.25, 'bandpass', 2600); },
  sprint() { noise(0.3, 350, 0.9, 0.3, 'bandpass', 1900); },
  angry() { tone(170, 0.28, 'sawtooth', 0.09, 110); tone(178, 0.28, 'square', 0.04, 104); },
  horn() { tone(415, 0.32, 'square', 0.06); tone(523, 0.32, 'square', 0.05); tone(415, 0.25, 'square', 0.06, 0, 0.4); tone(523, 0.25, 'square', 0.05, 0, 0.4); },
  hurt() { tone(520, 0.3, 'triangle', 0.3, 140); },
  block() { tone(900, 0.06, 'square', 0.1); noise(0.07, 3200, 2, 0.35); },
  crash() { noise(0.35, 900, 0.5, 0.8, 'lowpass', 180); tone(95, 0.3, 'sine', 0.5, 40); },
  combo(n) { tone(480 + n * 90, 0.12, 'triangle', 0.16); },
  over() { tone(420, 0.25, 'triangle', 0.25, 320); tone(320, 0.3, 'triangle', 0.25, 220, 0.25); tone(220, 0.7, 'triangle', 0.25, 90, 0.55); },
  box() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.16, 0, i * 0.07)); },
  power() { tone(440, 0.35, 'square', 0.06, 1320); tone(660, 0.3, 'triangle', 0.12, 1760, 0.05); },
  pickup() { tone(700, 0.15, 'triangle', 0.2, 1200); },
  slip() { tone(300, 0.3, 'triangle', 0.22, 1100); noise(0.15, 1500, 1, 0.2); },
  whistle() { tone(2100, 0.18, 'sine', 0.13, 2300); tone(2100, 0.3, 'sine', 0.13, 2350, 0.22); },
  bark() { tone(320, 0.09, 'square', 0.1, 180); noise(0.08, 700, 1, 0.25, 'lowpass'); tone(320, 0.09, 'square', 0.1, 180, 0.16); },
  ufo() { tone(180, 1.4, 'sine', 0.15, 520); tone(186, 1.4, 'triangle', 0.08, 540); },
  beam() { tone(500, 0.8, 'sine', 0.12, 1400); tone(505, 0.8, 'sine', 0.08, 1500); },
  airhorn() { tone(233, 0.9, 'sawtooth', 0.16); tone(294, 0.9, 'sawtooth', 0.13); tone(349, 0.9, 'sawtooth', 0.11); },
  pop() { noise(0.12, 4000, 0.5, 0.6, 'highpass'); tone(600, 0.1, 'sine', 0.2, 200); },
  fanfare() { [523, 659, 784, 659, 1046].forEach((f, i) => tone(f, 0.14, 'square', 0.06, 0, i * 0.09)); },
  clown() { tone(620, 0.12, 'square', 0.1, 420); tone(620, 0.12, 'square', 0.1, 420, 0.16); },
  splash() { noise(0.4, 1200, 0.6, 0.6, 'lowpass', 300); tone(400, 0.25, 'sine', 0.2, 120); },
  smoke() { noise(0.7, 600, 0.5, 0.5, 'lowpass', 200); },
  freeze() { tone(1800, 0.5, 'sine', 0.1, 600); noise(0.4, 6000, 1, 0.25, 'highpass'); },
  splat() { noise(0.15, 900, 0.8, 0.6, 'lowpass', 300); },
  coins() { [1300, 1600, 1950, 1600, 2100].forEach((f, i) => tone(f, 0.08, 'square', 0.05, 0, i * 0.06)); },
  jingle() { [784, 659, 784, 880, 784, 659, 523].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, 0, i * 0.18)); },
  coo() { tone(500, 0.15, 'sine', 0.08, 380); noise(0.3, 2500, 1, 0.2); },
  wind() { noise(1.2, 300, 0.4, 0.4, 'bandpass', 1200); },
  hide() { tone(300, 0.15, 'sine', 0.15, 200); },
};

// ---------- people ----------
const SKINS = ['#ffe0c4', '#f6d2b6', '#f3c9a5', '#e8b48f', '#d9a066', '#c98b5e', '#a86b42', '#8d5524', '#6e4529', '#4a2e1d'];
const HAIRS = ['#1a1a1a', '#2b1d14', '#3b2416', '#5a3a1e', '#7b4a24', '#a0522d', '#b33a3a', '#d9b36c', '#e8d28a', '#7a7a7a', '#bdbdbd'];
const FUN_HAIR = ['#e84393', '#0984e3', '#00b894', '#a29bfe', '#fd79a8', '#00cec9', '#e17055'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#f1c40f', '#ecf0f1', '#34495e', '#fd79a8', '#00b894', '#6c5ce7',
  '#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#fab1a0', '#81ecec', '#b2bec3', '#2d3436', '#6ab04c', '#c7ecee', '#e056fd', '#f0932b'];
const PANTS = ['#2d3436', '#34495e', '#1e3799', '#576574', '#6d4c41', '#222f3e', '#4a69bd', '#8e7f6f', '#b8a07e', '#3c6382', '#78464d'];
const SHOES = ['#222222', '#5d4037', '#ffffff', '#7f8c8d', '#c0392b', '#2980b9', '#f1c40f'];
const GENERIC_HAIR = ['short', 'short', 'sidepart', 'long', 'long', 'ponytail', 'spiky', 'bald', 'cap', 'afro', 'curly', 'buzz', 'bob', 'beanie', 'bun', 'braids', 'hijab'];
const SLAP_WORDS = ['SLAP!', 'WHACK!', 'SMACK!', 'THWAP!', 'POW!', 'KA-SLAP!'];

// points, chase speed (x player walk speed), walk speed range, size, knockdown & anger multipliers, spawn weight
const TYPES = {
  normal:     { name: 'Pedestrian', pts: 100, chase: 1.15, walk: [45, 75], size: 1.0, down: 1.0, anger: 1.0, w: 20 },
  suit:       { name: 'Office worker', pts: 130, chase: 1.2, walk: [70, 95], size: 1.02, down: 1.0, anger: 0.9, w: 8 },
  jogger:     { name: 'Jogger', pts: 220, chase: 1.38, walk: [125, 160], size: 0.98, down: 0.9, anger: 0.8, w: 6, noPause: true },
  granny:     { name: 'Granny', pts: 180, chase: 1.1, walk: [22, 38], size: 0.86, down: 1.25, anger: 1.7, w: 4 },
  grandpa:    { name: 'Grandpa', pts: 170, chase: 1.05, walk: [20, 34], size: 0.9, down: 1.3, anger: 1.8, w: 3 },
  big:        { name: 'Gym bro', pts: 260, chase: 1.12, walk: [40, 60], size: 1.22, down: 0.6, anger: 1.2, w: 4 },
  tourist:    { name: 'Tourist', pts: 150, chase: 1.08, walk: [30, 50], size: 1.0, down: 1.0, anger: 1.0, w: 5 },
  skater:     { name: 'Skater', pts: 210, chase: 1.42, walk: [110, 150], size: 0.95, down: 1.0, anger: 0.6, w: 3, noPause: true },
  cop:        { name: 'Cop', pts: 350, chase: 1.22, walk: [40, 60], size: 1.05, down: 0.8, anger: 1.5, w: 2.5 },
  musician:   { name: 'Busker', pts: 160, chase: 1.12, walk: [0, 0], size: 1.0, down: 1.0, anger: 1.1, w: 2.5 },
  karate:     { name: 'Karate master', pts: 300, chase: 1.3, walk: [50, 70], size: 1.0, down: 0.7, anger: 1.1, w: 2.5 },
  mime:       { name: 'Mime', pts: 190, chase: 1.2, walk: [35, 55], size: 0.97, down: 1.0, anger: 1.0, w: 2.5 },
  delivery:   { name: 'Pizza rider', pts: 170, chase: 1.28, walk: [90, 120], size: 1.0, down: 1.0, anger: 0.9, w: 3 },
  phone:      { name: 'Phone talker', pts: 120, chase: 1.15, walk: [35, 55], size: 1.0, down: 1.0, anger: 1.0, w: 5 },
  dogwalker:  { name: 'Dog walker', pts: 200, chase: 1.1, walk: [35, 50], size: 1.0, down: 1.0, anger: 1.0, w: 3.5 },
  punk:       { name: 'Punk', pts: 240, chase: 1.3, walk: [50, 70], size: 1.02, down: 0.9, anger: 1.4, w: 2.5 },
  chef:       { name: 'Chef', pts: 150, chase: 1.18, walk: [45, 65], size: 1.04, down: 1.0, anger: 1.1, w: 2.5 },
  hipster:    { name: 'Hipster', pts: 140, chase: 1.15, walk: [40, 60], size: 1.0, down: 1.0, anger: 1.0, w: 4 },
  influencer: { name: 'Influencer', pts: 180, chase: 1.15, walk: [35, 55], size: 1.0, down: 1.0, anger: 1.0, w: 3 },
  builder:    { name: 'Builder', pts: 200, chase: 1.15, walk: [40, 60], size: 1.08, down: 0.8, anger: 1.1, w: 3 },
  hero:       { name: 'Cosplay hero', pts: 280, chase: 1.45, walk: [60, 85], size: 1.0, down: 0.9, anger: 0.7, w: 2 },
  clown:      { name: 'Clown', pts: 210, chase: 1.1, walk: [35, 55], size: 1.0, down: 1.1, anger: 1.0, w: 2 },
  nurse:      { name: 'Nurse', pts: 150, chase: 1.22, walk: [55, 75], size: 1.0, down: 1.0, anger: 0.9, w: 3 },
  mailman:    { name: 'Mail carrier', pts: 170, chase: 1.25, walk: [55, 75], size: 1.0, down: 1.0, anger: 1.0, w: 3 },
  dog:        { name: 'Dog', pts: 0, chase: 1.5, walk: [0, 0], size: 1.0, down: 1.0, anger: 0.5, w: 0 },
};

// neighbourhoods change the scenery and who you meet
const DISTRICTS = {
  shops:       { name: 'MARKET STREET', sub: 'Shops, cafes and plenty of faces', mult: {} },
  downtown:    { name: 'DOWNTOWN', sub: 'Suits, phones and influencers', mult: { suit: 3, phone: 2, influencer: 2.5, cop: 1.5, delivery: 1.5, jogger: 0.5, grandpa: 0.4 } },
  park:        { name: 'CITY PARK', sub: 'Joggers, dogs, buskers and pigeons', mult: { jogger: 3, dogwalker: 3, granny: 2, tourist: 2, musician: 2, hipster: 1.5, hero: 1.5, suit: 0.3, builder: 0.3 } },
  residential: { name: 'MAPLE LANE', sub: 'Grannies, mail carriers and dogs', mult: { grandpa: 2.5, granny: 2, dogwalker: 2.5, mailman: 3, builder: 2, nurse: 1.5, suit: 0.5, influencer: 0.5 } },
};
function districtOf(i) {
  const g = Math.floor(i / 3);
  if (g === 0 || g === -1) return 'shops';
  const r = mulberry32(g * 7919 + 77)();
  return ['shops', 'downtown', 'park', 'residential'][(r * 4) | 0];
}
const districtAt = x => districtOf(Math.floor(x / CHUNK));
function randTypeAt(x) {
  const m = DISTRICTS[districtAt(x)].mult;
  return weighted(TYPES, k => TYPES[k].w * (m[k] || 1));
}

// what people say
const LINES = {
  hit: {
    default: ['OW!', 'HEY!', 'WHAT?!', 'MY FACE!', 'RUDE!', 'OUCH!', 'WHY?!'],
    granny: ['WELL I NEVER!', 'YOU RASCAL!', 'MY DENTURES!'], grandpa: ['IN MY DAY...!', 'WHIPPERSNAPPER!'],
    cop: ['ASSAULTING AN OFFICER?!', "THAT'S A FELONY!"], karate: ['IMPOSSIBLE!', 'MY HONOR!'], mime: ['...!', '( silent scream )'],
    tourist: ['MY VACATION!', 'NOT IN THE GUIDEBOOK!'], chef: ['MAMMA MIA!', 'MY SOUFFLE!'], suit: ['I HAVE A MEETING!', 'MY LAWYER WILL HEAR OF THIS!'],
    skater: ['NOT COOL, DUDE!', 'BOGUS!'], punk: ["YOU'RE DEAD!", "OH, IT'S ON!"], delivery: ['MY PIZZA!', 'NO TIP FOR YOU!'],
    dogwalker: ['GET HIM, REX!', "SIC 'EM!"], hipster: ['MY OAT LATTE!', 'SO MAINSTREAM!'], phone: ["I'LL CALL YOU BACK!", 'DID YOU SEE THAT?!'],
    big: ['YOU MESSED UP.', 'BAD IDEA, PAL.'], jogger: ['MY PERSONAL BEST!', 'MY CARDIO!'], musician: ['MY GUITAR!', 'OFF-KEY!'],
    influencer: ['THIS IS GOING VIRAL!', 'DID YOU GET THAT?!'], builder: ['HARD HAT AREA!', 'OI, MATE!'], hero: ['MY SECRET IDENTITY!', 'VILLAIN!'],
    clown: ['HONK HONK?!', 'NOT FUNNY!'], nurse: ["I'M ON MY BREAK!", 'DO NO HARM?!'], mailman: ['YOUR MAIL IS LATE NOW!', 'RETURN TO SENDER!'],
  },
  chase: {
    default: ['COME BACK HERE!', 'GET BACK HERE!', "YOU'RE GONNA GET IT!", 'OI!'],
    granny: ["I'LL GET YOU!", 'COME HERE, YOUNG MAN!'], cop: ['STOP! POLICE!', 'FREEZE!'], karate: ['HI-YAH!', 'PREPARE YOURSELF!'],
    mime: ['...'], dog: ['WOOF!', 'GRRR!', 'BARK BARK!'], punk: ['GET OVER HERE!'], skater: ["YOU CAN'T OUTSKATE ME!"],
    hero: ['JUSTICE IS SWIFT!', 'UP, UP AND AFTER YOU!'], influencer: ['FOLLOW ME... I MEAN, STOP!'], clown: ['HONK HONK!'],
  },
  idle: {
    phone: ['blah blah blah', 'no WAY', 'uh-huh', 'lol', 'anyway...'], tourist: ['Wow!', 'So pretty!', '*click*'],
    hipster: ['*sip*', 'it was better on vinyl'], chef: ['Bellissimo!'], cop: ['Move along.', 'Nice day.'],
    dog: ['woof'], skater: ['Rad!', 'Sick!'], musician: ['La la la~'], suit: ['Synergy...', 'Per my last email'],
    jogger: ['huff huff'], granny: ['Lovely weather.'], punk: ['Whatever.'], mime: ['...'],
    influencer: ['Hey guys!', 'Smash that like!', "We're LIVE!"], builder: ['Lunch break yet?'], hero: ['*heroic pose*'],
    clown: ['Honk!'], nurse: ['Double shift...'], mailman: ['Nice dog... nice dog...'],
  },
  tired: {
    default: ['huff... puff...', 'I give up...', 'not... worth it'], granny: ['my hip...'], grandpa: ['my back...'],
    cop: ['need... donut...'], mime: ['...'], jogger: ['out of... breath?!'], big: ['leg day... skipped...'], hero: ['even heroes... rest...'],
  },
  gasp: { default: ['OMG!', 'DID YOU SEE THAT?!', 'YIKES!', 'SO RUDE!', 'WOW.'] },
  laugh: { default: ['HAHAHA!', 'NICE ONE!', 'HA! LEGEND!'] },
  lost: { default: ["Where'd he go?", '???', 'Huh?', 'Who are you?'] },
  thanks: { default: ['Aww, thanks!', 'For me?!', 'Apology accepted!', 'How sweet!'] },
  money: { default: ['MONEY!', 'Ooh, cash!', 'Mine!', '$$$'] },
  icecream: { default: ['ICE CREAM!', 'One scoop please!', 'Vanilla!'] },
};

function makeLook(type) {
  const L = {
    skin: pick(SKINS), hair: chance(0.08) ? pick(FUN_HAIR) : pick(HAIRS), hairStyle: pick(GENERIC_HAIR),
    hat: pick(SHIRTS), shirt: pick(SHIRTS), shirt2: pick(SHIRTS),
    top: pick(['tee', 'tee', 'stripes', 'jacket', 'hoodie', 'sweater', 'dress', 'tank', 'plaid']),
    pants: pick(PANTS), bottom: pick(['pants', 'pants', 'pants', 'shorts', 'skirt']), shoes: pick(SHOES),
    wd: rand(0.88, 1.18), ht: rand(0.94, 1.08),
  };
  if (L.top === 'dress') L.bottom = 'none';
  L.glasses = chance(0.15); L.shades = !L.glasses && chance(0.08);
  L.headphones = chance(0.1); L.phonesColor = pick(['#222222', '#e74c3c', '#ffffff', '#0984e3']);
  L.backpack = chance(0.15); L.packColor = pick(SHIRTS);
  L.scarf = chance(0.08); L.scarfColor = pick(SHIRTS);
  L.earrings = chance(0.18);
  L.beard = chance(0.12); L.mustache = !L.beard && chance(0.1);
  switch (type) {
    case 'suit':
      L.top = 'suit'; L.shirt = pick(['#2f3640', '#353b48', '#40407a', '#2c3e50', '#5d4037']); L.pants = L.shirt; L.bottom = chance(0.3) ? 'skirt' : 'pants';
      L.tie = pick(['#c0392b', '#2980b9', '#8e44ad', '#16a085']); L.hairStyle = pick(['short', 'sidepart', 'bald', 'bob', 'ponytail']);
      L.shoes = '#111111'; L.case = true; L.backpack = false; L.headphones = false;
      break;
    case 'jogger':
      L.top = 'tank'; L.bottom = 'shorts'; L.shirt = pick(['#00e676', '#ff4081', '#00b0ff', '#ffea00', '#ff9100']);
      L.band = pick(['#ff1744', '#ffffff', '#2979ff']); L.hairStyle = pick(['short', 'spiky', 'ponytail', 'buzz', 'braids']);
      L.shoes = pick(['#ff5252', '#ffffff', '#40c4ff']); L.headphones = chance(0.4); L.backpack = false;
      break;
    case 'granny':
      L.hair = pick(['#e0e0e0', '#cfd8dc', '#b0bec5']); L.hairStyle = pick(['bun', 'curly', 'bob']);
      L.top = chance(0.6) ? 'dress' : 'sweater'; L.bottom = L.top === 'dress' ? 'none' : 'skirt';
      L.shirt = pick(['#a55eea', '#e77f9b', '#778ca3', '#4b7bec', '#20bf6b']); L.glasses = true; L.shades = false;
      L.bag = pick(['#8e44ad', '#6d4c41', '#c0392b']); L.beard = L.mustache = false; L.headphones = false; L.backpack = false; L.ht = 0.95;
      break;
    case 'grandpa':
      L.hair = pick(['#e0e0e0', '#bdbdbd', '#9e9e9e']); L.hairStyle = pick(['flatcap', 'bald', 'flatcap']); L.hat = pick(['#6d4c41', '#7f8c8d', '#2d3436']);
      L.top = 'sweater'; L.shirt = pick(['#8d6e63', '#a1887f', '#5d6d7e', '#7d6608']); L.bottom = 'pants'; L.pants = pick(['#5d4037', '#7f8c8d', '#4e342e']);
      L.cane = true; L.mustache = chance(0.5); L.beard = false; L.glasses = chance(0.5); L.headphones = false; L.backpack = false;
      break;
    case 'big':
      L.top = 'tank'; L.shirt = pick(['#ecf0f1', '#2d3436', '#b71540', '#3c6382']); L.bottom = 'pants';
      L.hairStyle = pick(['bald', 'buzz', 'spiky', 'cap']); L.beard = chance(0.6); L.wd = 1.35;
      break;
    case 'tourist':
      L.top = 'hawaiian'; L.shirt = pick(['#ff7675', '#00cec9', '#fdcb6e', '#a29bfe', '#55efc4']); L.shirt2 = pick(['#ffffff', '#ffeaa7', '#e84393']);
      L.bottom = 'shorts'; L.pants = pick(['#b8a07e', '#8e7f6f', '#4a69bd']); L.hairStyle = 'sunhat'; L.hat = pick(['#f5deb3', '#ffffff', '#f6e58d']);
      L.camera = true; L.shades = chance(0.5); L.glasses = false; L.backpack = chance(0.5);
      break;
    case 'skater':
      L.top = pick(['hoodie', 'tee', 'stripes']); L.bottom = 'pants'; L.pants = pick(['#4a69bd', '#2d3436', '#8e7f6f']);
      L.hairStyle = pick(['beanie', 'cap', 'long', 'spiky']); L.capBack = true; L.board = true; L.boardColor = pick(['#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6']);
      L.headphones = chance(0.3); L.backpack = false;
      break;
    case 'cop':
      L.top = 'uniform'; L.shirt = '#1e3a8a'; L.pants = '#172554'; L.bottom = 'pants'; L.shoes = '#111111';
      L.hairStyle = 'cophat'; L.hat = '#172554'; L.mustache = chance(0.4); L.beard = false; L.shades = chance(0.3); L.glasses = false;
      L.headphones = false; L.backpack = false; L.scarf = false;
      break;
    case 'musician':
      L.top = 'jacket'; L.shirt = pick(['#2d3436', '#6d4c41', '#1e3799', '#78464d']); L.hairStyle = pick(['long', 'beanie', 'afro', 'curly', 'ponytail']);
      L.guitar = true; L.backpack = false; L.headphones = false;
      break;
    case 'karate':
      L.top = 'gi'; L.shirt = '#f5f5f5'; L.pants = '#f5f5f5'; L.bottom = 'pants'; L.barefoot = true;
      L.band = chance(0.6) ? '#e74c3c' : null; L.hairStyle = pick(['short', 'ponytail', 'buzz', 'bun', 'bald']);
      L.glasses = L.shades = L.headphones = L.backpack = L.scarf = false;
      break;
    case 'mime':
      L.skin = '#f7f7f7'; L.top = 'stripes'; L.shirt = '#ffffff'; L.shirt2 = '#111111'; L.pants = '#111111'; L.bottom = 'pants';
      L.hairStyle = 'beret'; L.hat = '#111111'; L.gloves = true; L.lips = true; L.shoes = '#111111';
      L.glasses = L.shades = L.headphones = L.backpack = L.beard = L.mustache = false; L.scarf = chance(0.5); L.scarfColor = '#e74c3c';
      break;
    case 'delivery':
      L.top = 'tee'; L.shirt = '#d63031'; L.hairStyle = 'cap'; L.hat = '#d63031'; L.pizza = true; L.backpack = false; L.bottom = 'pants';
      break;
    case 'phone': L.phone = true; break;
    case 'dogwalker': L.leash = true; L.backpack = false; break;
    case 'punk':
      L.hairStyle = 'mohawk'; L.hair = pick(FUN_HAIR); L.top = 'jacket'; L.shirt = '#1e1e1e'; L.shirt2 = pick(['#e74c3c', '#ffffff', '#f1c40f']);
      L.spikes = true; L.pants = pick(['#1e1e1e', '#2d3436', '#b71540']); L.bottom = 'pants'; L.shoes = '#111111'; L.earrings = true;
      break;
    case 'chef':
      L.top = 'chef'; L.shirt = '#f5f5f5'; L.hairStyle = 'toque'; L.pants = '#4b4b4b'; L.bottom = 'pants';
      L.mustache = chance(0.4); L.backpack = false; L.headphones = false;
      break;
    case 'hipster':
      L.hairStyle = pick(['beanie', 'bun', 'sidepart']); L.beard = chance(0.7); L.glasses = true; L.shades = false;
      L.top = pick(['plaid', 'sweater', 'jacket']); L.coffee = true; L.bottom = 'pants'; L.pants = pick(['#4a69bd', '#b8a07e', '#2d3436']);
      break;
    case 'influencer':
      L.selfie = true; L.top = pick(['tee', 'jacket', 'dress']); L.bottom = L.top === 'dress' ? 'none' : pick(['pants', 'skirt']);
      L.shirt = pick(['#fd79a8', '#e056fd', '#ffffff', '#55efc4', '#ffeaa7']); L.shades = chance(0.6); L.glasses = false;
      L.hairStyle = pick(['long', 'ponytail', 'bob', 'sidepart', 'bun']); L.earrings = true;
      break;
    case 'builder':
      L.hairStyle = 'hardhat'; L.hat = '#f9ca24'; L.top = 'vest'; L.shirt = '#ff7f00'; L.shirt2 = pick(['#2d3436', '#576574', '#ecf0f1']);
      L.bottom = 'pants'; L.pants = '#4a69bd'; L.shoes = '#6d4c41'; L.beard = chance(0.4); L.wd = rand(1.05, 1.25); L.plank = chance(0.5);
      break;
    case 'hero':
      L.top = 'hero'; L.shirt = pick(['#0984e3', '#d63031', '#00b894', '#6c5ce7', '#2d3436']); L.shirt2 = pick(['#f1c40f', '#ffffff', '#e74c3c']);
      L.pants = L.shirt; L.bottom = 'pants'; L.cape = pick(['#d63031', '#f1c40f', '#2d3436', '#e84393']); L.mask = L.cape;
      L.hairStyle = pick(['short', 'sidepart', 'spiky', 'ponytail']); L.shoes = L.cape; L.glasses = L.shades = false; L.backpack = false;
      break;
    case 'clown':
      L.hairStyle = 'afro'; L.hair = pick(FUN_HAIR); L.top = 'polka'; L.shirt = pick(['#f1c40f', '#ffffff', '#55efc4']); L.shirt2 = pick(['#e74c3c', '#0984e3', '#6c5ce7']);
      L.pants = pick(['#e74c3c', '#0984e3', '#6c5ce7']); L.bottom = 'pants'; L.shoes = '#e74c3c'; L.bigShoes = true; L.redNose = true;
      L.skin = '#fbe9e7'; L.glasses = L.shades = L.beard = L.mustache = false;
      break;
    case 'nurse':
      L.top = 'scrubs'; L.shirt = pick(['#00a8a8', '#74b9ff', '#a29bfe', '#55efc4']); L.pants = L.shirt; L.bottom = 'pants'; L.shoes = '#ffffff';
      L.hairStyle = pick(['ponytail', 'bun', 'short', 'bob', 'hijab']); L.hat = pick(SHIRTS); L.backpack = false;
      break;
    case 'mailman':
      L.top = 'uniform'; L.shirt = '#7f9cb8'; L.pants = '#34495e'; L.bottom = 'shorts'; L.hairStyle = 'cap'; L.hat = '#34495e';
      L.mailbag = true; L.backpack = false; L.badgeless = true;
      break;
  }
  return L;
}
function makeDogLook() {
  return { fur: pick(['#8d6e63', '#f5deb3', '#3e2723', '#fafafa', '#c68642', '#9e9e9e', '#212121', '#e0a96d']), collar: pick(['#e74c3c', '#3498db', '#2ecc71', '#f1c40f']), big: rand(0.85, 1.25) };
}
const PLAYER_LOOK = { skin: '#f1c27d', hair: '#3b2416', hairStyle: 'cap', hat: '#e63946', shirt: '#ffb703', top: 'tee', pants: '#264653', bottom: 'pants', shoes: '#ffffff', player: true, shades: true, wd: 1, ht: 1 };

function sidewalkY() { return Math.random() < 0.5 ? rand(30, 104) : rand(350, 440); }
function sidewalkYNear(y) { return y < CENTER_LINE ? rand(30, 104) : rand(350, 440); }

// ---------- power-ups & events ----------
const POWERS = {
  // --- slap more & go faster (the common ones) ---
  nitro:    { name: 'NITRO', desc: 'Rocket burst — double speed!', w: 10, color: '#ff9f1a', dur: 2.5 },
  hawk:     { name: 'HAWK FORM', desc: 'Become a hawk — swoop down and slap!', w: 8, color: '#c8a165', dur: 7 },
  giant:    { name: 'GIANT MODE', desc: 'Huge reach, faster, chasers bounce off', w: 8, color: '#e056fd', dur: 8 },
  aura:     { name: 'SLAP AURA', desc: 'Spinning hands slap everyone near you', w: 9, color: '#ff6b81', dur: 7 },
  rapid:    { name: 'RAPID HANDS', desc: '3x faster slaps, longer reach', w: 9, color: '#ffdd59', dur: 8 },
  golden:   { name: 'GOLDEN HAND', desc: 'Double points, triple coins per slap', w: 8, color: '#f1c40f', dur: 10 },
  rush:     { name: 'RAGING BULL', desc: 'Become a bull and trample everyone', w: 9, color: '#e17055', dur: 2.2 },
  boomerang:{ name: 'BOOMERANG HAND', desc: 'A giant hand slaps its way out and back', w: 9, color: '#fdcb6e' },
  crowd:    { name: 'PEOPLE MAGNET', desc: 'Pulls nearby people right to your hand', w: 8, color: '#0984e3', dur: 6 },
  chain:    { name: 'CHAIN SLAP', desc: 'Every slap zaps 3 more people', w: 9, color: '#74b9ff', dur: 10 },
  mega:     { name: 'MEGA SLAP', desc: 'Giant slaps flatten everyone!', w: 9, color: '#ff6b81', dur: 7 },
  skates:   { name: 'ROCKET SKATES', desc: 'Super speed!', w: 8, color: '#70a1ff', dur: 9 },
  energy:   { name: 'ENERGY DRINK', desc: 'Unlimited sprint!', w: 8, color: '#2ed573', dur: 8 },
  // --- defence ---
  shield:   { name: 'BUBBLE SHIELD', desc: 'Blocks the next catch', w: 6, color: '#48dbfb', dur: 25 },
  heart:    { name: 'PIZZA HEART', desc: '+1 heart', w: 12, color: '#ff4757', instant: true },
  // --- stopping people (rare now) ---
  ufo:      { name: 'UFO STRIKE', desc: 'A UFO beams up the crowd around you!', w: 8, color: '#7bed9f' },
  banana:   { name: 'BANANA TRAIL', desc: 'Drop peels — chasers slip!', w: 3, color: '#ffd32a', dur: 8 },
  tornado:  { name: 'TORNADO', desc: 'Blow the crowd away', w: 4, color: '#a29bfe' },
  horn:     { name: 'AIR HORN', desc: 'Knocks everyone nearby flat', w: 3, color: '#ff9f43' },
  pie:      { name: 'CREAM PIES', desc: 'Pie to the face for your chasers', w: 3, color: '#fff3e0' },
  freeze:   { name: 'FREEZE RAY', desc: 'Ice-cold chasers', w: 3, color: '#81ecec' },
  disguise: { name: 'DISGUISE', desc: 'Chasers lose track of you', w: 2, color: '#a4b0be', dur: 7 },
  decoy:    { name: 'DECOY DUMMY', desc: 'Chasers attack a fake you', w: 2, color: '#ffa502' },
  smoke:    { name: 'SMOKE BOMB', desc: 'Vanish in a puff of smoke', w: 2, color: '#b2bec3' },
  cash:     { name: 'CASH RAIN', desc: 'Chasers stop to grab the money', w: 2, color: '#2ecc71' },
  flowers:  { name: 'SORRY FLOWERS', desc: 'Chasers forgive you', w: 2, color: '#fd79a8' },
};
const EVENTS = {
  marathon:  { name: 'MARATHON!', desc: 'A wave of joggers is coming through!', color: '#00e676', w: 3 },
  happyhour: { name: 'DOUBLE POINTS!', desc: 'Every slap scores x2', color: '#ffdd59', w: 3, dur: 15 },
  rushhour:  { name: 'RUSH HOUR!', desc: 'Crazy traffic — lure chasers into the road', color: '#ff9f43', w: 2, dur: 15 },
  boxrain:   { name: 'MYSTERY BOX RAIN!', desc: 'Grab the boxes!', color: '#f6b93b', w: 3 },
  flashmob:  { name: 'FLASH MOB!', desc: 'Everybody dance... and get slapped', color: '#e056fd', w: 2 },
  patrol:    { name: 'POLICE PATROL!', desc: 'Cops chase anyone they see slapping', color: '#4a69bd', w: 2 },
  icecream:  { name: 'ICE CREAM TRUCK!', desc: 'Chasers drop everything for a cone', color: '#fd79a8', w: 2.5 },
  policechase: { name: 'POLICE CHASE!', desc: 'Lead the cruisers into traffic to wreck them', color: '#4a69bd', w: 3 },
  streetrace:  { name: 'STREET RACE!', desc: 'Racers flying by — lure chasers into the road', color: '#ff4757', w: 2, dur: 14 },
};

// ---------- procedural street chunks ----------
const BUILD_COLORS = ['#d98e73', '#c4a484', '#8fa3b8', '#e6c79c', '#b56576', '#6d9773', '#a3a3c2', '#e09f3e', '#9e7b9b', '#7fb7be'];
const TOWER_COLORS = ['#7f8fa6', '#596275', '#8395a7', '#576574', '#a4b0be', '#4b6584'];
const HOUSE_COLORS = ['#fab1a0', '#ffeaa7', '#81ecec', '#dfe6e9', '#a29bfe', '#fdcb6e', '#e17055', '#b8e994'];
const AWNINGS = ['#e74c3c', '#27ae60', '#2980b9', '#8e44ad', '#f39c12', '#16a085'];
const SIGNS = ['CAFE', 'DELI', 'PIZZA', 'BOOKS', 'SHOES', 'BAKERY', 'PHARMACY', 'BARBER', 'NOODLES', 'FLOWERS', 'GYM', 'TOYS', 'TACOS', 'LAUNDRY', 'SUSHI', 'VINYL'];
const OB_KINDS = [['lamp', 12, 10, 3], ['hydrant', 18, 14, 2], ['trash', 26, 20, 2], ['bench', 84, 20, 1.5], ['planter', 44, 34, 1.5]];
const chunks = new Map();
function getChunk(i) {
  let c = chunks.get(i);
  if (c) return c;
  const r = mulberry32(i * 99991 + 12345);
  const district = districtOf(i);
  c = { i, district, buildings: [], obstacles: [], booths: [], holes: [], flocks: [], trees: [], crosswalk: r() < 0.35 ? i * CHUNK + 150 + r() * 600 : null };
  let x = i * CHUNK; const end = (i + 1) * CHUNK;
  if (district === 'park') {
    for (let k = 0; k < 9; k++) c.trees.push({ x: i * CHUNK + r() * CHUNK, y: -40 - r() * 260, s: 0.8 + r() * 0.7 });
    if (r() < 0.6) c.fountain = { x: i * CHUNK + 200 + r() * 500, y: -120 };
  } else {
    while (x < end) {
      let w, b;
      if (district === 'downtown') {
        w = (140 + r() * 130) | 0;
        b = { kind: 'tower', h: 230 + r() * 280, color: pick2(r, TOWER_COLORS), shop: r() < 0.3 };
      } else if (district === 'residential') {
        w = (120 + r() * 70) | 0;
        b = { kind: 'house', h: 85 + r() * 40, color: pick2(r, HOUSE_COLORS), roof: pick2(r, ['#c0392b', '#6d4c41', '#2d3436', '#8e44ad']), shop: false, garden: r() < 0.5 };
      } else {
        w = (110 + r() * 170) | 0;
        b = { kind: 'shop', h: 95 + r() * 75, color: pick2(r, BUILD_COLORS), shop: r() < 0.55 };
      }
      if (x + w > end - 70) w = end - x;
      b.x = x; b.w = w; b.awning = pick2(r, AWNINGS); b.sign = pick2(r, SIGNS); b.lit = r(); b.seed = (r() * 1e6) | 0;
      c.buildings.push(b);
      x += w;
    }
  }
  const n = 3 + ((r() * 3) | 0) + (district === 'park' ? 2 : 0);
  const kinds = district === 'park' ? [['tree', 30, 30, 4], ['bench', 84, 20, 3], ['trash', 26, 20, 1], ['lamp', 12, 10, 2]] : OB_KINDS;
  const totW = kinds.reduce((a, k) => a + k[3], 0);
  const free = (ox, y, wd) => !c.obstacles.some(o => Math.abs(o.x - ox) < o.w / 2 + wd / 2 + 50 && Math.abs(o.y - y) < 60);
  for (let k = 0; k < n; k++) {
    let q = r() * totW, kd = kinds[0];
    for (const K of kinds) { q -= K[3]; if (q <= 0) { kd = K; break; } }
    const top = r() < 0.5, curb = kd[0] === 'lamp' || kd[0] === 'hydrant';
    const y = top ? (curb ? 104 : 24) : (curb ? 346 : (kd[0] === 'planter' || kd[0] === 'tree' ? 432 : 438));
    const ox = i * CHUNK + 50 + r() * (CHUNK - 100);
    if (Math.abs(ox) < 240) continue;
    if (!free(ox, y, kd[1])) continue;
    c.obstacles.push({ kind: kd[0], x: ox, y, w: kd[1], h: kd[2] });
  }
  // places to hide
  if (r() < (district === 'park' ? 0.25 : 0.45)) {
    const bx = i * CHUNK + 80 + r() * (CHUNK - 160), by = r() < 0.5 ? 28 : 434;
    if (Math.abs(bx) > 200 && free(bx, by, 40)) c.booths.push({ x: bx, y: by, kind: district === 'park' ? 'potty' : 'booth' });
  }
  // open manholes — chasers fall in, you know to jump over
  if (r() < 0.5) {
    const hx = i * CHUNK + 60 + r() * (CHUNK - 120);
    const hy = r() < 0.75 ? 145 + r() * 160 : (r() < 0.5 ? 60 : 395);
    if (Math.abs(hx) > 250 && free(hx, hy, 30)) c.holes.push({ x: hx, y: hy });
  }
  // pigeons
  const flocks = district === 'park' ? 2 : r() < 0.5 ? 1 : 0;
  for (let k = 0; k < flocks; k++) {
    const fx = i * CHUNK + 60 + r() * (CHUNK - 120), fy = r() < 0.5 ? 50 + r() * 40 : 370 + r() * 50;
    c.flocks.push({ x: fx, y: fy, n: 4 + ((r() * 5) | 0), scatterT: -99, seed: r() * 100 });
  }
  chunks.set(i, c);
  return c;
}

// ---------- game state ----------
let gs = 'title'; // title | play | paused | dying | over
let player, peds = [], cars = [], parts = [], pops = [], items = [], bananas = [], inventory = [];
let pies = [], tornados = [], truck = null;
let ufo = null, decoy = null, opening = null, activeEvent = null, banner = null;
let power = {};
const activeObs = [], activeBooths = [], activeHoles = [], activeFlocks = [];
let lastBubbleCount = 0;
let shake = 0, hitStop = 0, elapsed = 0, gameTime = 0, camPunch = 0, announce = null;
let riders = [], cruisers = [], riderTimer = 12, coinTimer = 5, missionTick = 0;
let score = 0, slaps = 0, combo = 0, bestCombo = 0, lastSlapT = -99, carHits = 0, boxesOpened = 0, escapes = 0;
let overT = 0, dyingT = 0, newBest = false, boxTimer = 0, eventTimer = 0, heartTimer = 0, nextEscapeHeart = 6, curDistrict = 'shops';
let best = 0;
try { best = +localStorage.getItem('slaprun_best') || 0; } catch (e) { }
function resetPowers() { power = { nitro: 0, hawk: 0, giant: 0, aura: 0, rapid: 0, golden: 0, rush: 0, crowd: 0, chain: 0, mega: 0, skates: 0, energy: 0, shield: 0, banana: 0, disguise: 0 }; boomerangs = []; }
let boomerangs = [];
// live slap stats (power-ups change reach, speed of slapping and who auto-slap may hit)
const slapReach = () => (SLAP_REACH + (power.rapid > 0 ? 25 : 0)) * player.size;
const slapDepth = () => SLAP_DEPTH * player.size * (power.rapid > 0 ? 1.3 : 1);
const slapCooldown = () => SLAP_CD * (power.rapid > 0 ? 0.3 : 1);
const untouchable = () => power.hawk > 0 || power.rush > 0 || power.giant > 0;
resetPowers();

function spawnPed(x, y, type) {
  const T = TYPES[type];
  const dog = type === 'dog';
  return {
    x, y, z: 0, vx: 0, vy: 0, type, T, size: T.size, r: dog ? 9 : 13 * T.size,
    facing: Math.random() < 0.5 ? 1 : -1, phase: Math.random() * 6, moveAmt: 0,
    state: 'walk', timer: 0, pause: 0, walkSpeed: rand(T.walk[0], T.walk[1]),
    dirX: Math.random() < 0.5 ? 1 : -1, targetY: y,
    slaps: 0, anger: 0, angerMax: 1, chaseSpeed: 0, ramp: 0, angryAfter: false,
    marked: false, look: dog ? makeDogLook() : makeLook(type), fallDir: 1, lie: 0, kvx: 0, kvy: 0,
    slapT: 0, blockT: 0, shock: 0, happyT: 0, photoT: 0, mimeT: 0, danceT: 0, smokeT: 0, creamT: 0, say: null,
  };
}
function addPed(x, y, type) {
  if (type === 'musician') y = Math.random() < 0.5 ? rand(26, 40) : rand(430, 444);
  const q = spawnPed(x, y, type);
  peds.push(q);
  if (type === 'dogwalker') {
    const d = spawnPed(x - q.dirX * 28, y + 6, 'dog');
    d.owner = q; q.dog = d;
    peds.push(d);
  }
  return q;
}
function removePed(q) {
  const i = peds.indexOf(q);
  if (i >= 0) peds.splice(i, 1);
  if (q.dog) q.dog.owner = null;
  if (q.owner) q.owner.dog = null;
}
function newPlayer() {
  return {
    isPlayer: true, x: 0, y: 225, z: 0, vx: 0, vy: 0, r: 13, size: 1, facing: 1, phase: 0, moveAmt: 0,
    slapT: 0, slapCd: 0, sprinting: false, winded: false, stamina: STAMINA_NATURAL, hearts: MAX_HEARTS, invuln: 0,
    downT: 0, lie: 0, kvx: 0, fallDir: 1, look: playerLook(), burstT: 0, trailT: 0, state: 'player', blockT: 0, shock: 0, happyT: 0, bananaT: 0,
    hidden: false, hideT: 0, seenT: 0, creamT: 0,
  };
}
function refreshObs() {
  activeObs.length = 0; activeBooths.length = 0; activeHoles.length = 0; activeFlocks.length = 0;
  const a = Math.floor((camX - 1400) / CHUNK), b = Math.floor((camX + VW + 1400) / CHUNK);
  for (let i = a; i <= b; i++) {
    const c = getChunk(i);
    for (const o of c.obstacles) activeObs.push(o);
    for (const o of c.booths) activeBooths.push(o);
    for (const o of c.holes) activeHoles.push(o);
    for (const o of c.flocks) activeFlocks.push(o);
  }
  if (truck) activeObs.push(truck.ob);
}
function reset() {
  applyUpgrades();
  player = newPlayer();
  riders = []; cruisers = []; riderTimer = 12; coinTimer = 5; announce = null; camPunch = 0;
  peds = []; cars = []; parts = []; pops = []; items = []; bananas = []; inventory = []; pies = []; tornados = [];
  truck = null; ufo = null; decoy = null; opening = null; activeEvent = null; banner = null;
  resetPowers();
  camCX = player.x; camX = player.x - VW / 2;
  elapsed = 0; score = 0; slaps = 0; combo = 0; bestCombo = 0; lastSlapT = -99; carHits = 0; boxesOpened = 0; escapes = 0;
  overT = 0; newBest = false; boxTimer = 6; eventTimer = 20; heartTimer = 14; nextEscapeHeart = 6; curDistrict = districtAt(player.x);
  for (const c of chunks.values()) for (const f of c.flocks) f.scatterT = -99;
  LANES[0].timer = 4; LANES[1].timer = 6.5;
  refreshObs();
  for (let i = 0; i < Math.round(16 * Q.crowd); i++) {
    let x;
    do { x = camX + rand(-300, VW + 300); } while (Math.abs(x - player.x) < 170);
    addPed(x, sidewalkY(), randTypeAt(x));
  }
}
function startGame() {
  reset(); gs = 'play';
  missionsStartRun();
  Music.start();
  if (lvl('headstart')) { let k; do { k = rollPower(); } while (POWERS[k].instant); inventory.push(k); popup(player.x, player.y, 120, 'HEAD START: ' + POWERS[k].name, POWERS[k].color, 15, 2); }
}
// chasers get a little quicker the longer a run lasts, so upgrades never make you untouchable
const difficultySpeed = () => 1 + Math.min(0.12, elapsed / 1500);
function addEscape() { escapes++; addCoins(3); missionEvent('escape'); }
function closeCall(x, y) {
  if (gs !== 'play' || player.downT > 0) return;
  runClose++;
  const pts = addScore(50); addCoins(2);
  player.stamina = Math.min(STAMINA_MAX, player.stamina + 8);
  popup(x, y, 120, 'CLOSE CALL! +' + pts, '#48dbfb', 17, 1.0, true);
  sfx.close(); missionEvent('close');
}
const onScreen = q => q.x - camX > -40 && q.x - camX < VW + 40;
function addScore(pts) {
  const m = activeEvent && activeEvent.key === 'happyhour' ? 2 : 1;
  score += pts * m;
  return pts * m;
}
function say(q, kind, force = false) {
  const tbl = LINES[kind]; if (!tbl) return;
  const arr = tbl[q.type] || tbl.default; if (!arr) return;
  if (q.say && !force) return;
  q.say = { text: pick(arr), t: kind === 'idle' ? 1.8 : 1.5 };
}
function showBanner(title, sub, color, dur) { banner = { title, sub, color, t: dur, max: dur }; }
function popup(x, y, z, text, color, size, life, big = false) { pops.push({ x, y, z, text, color, size, life, max: life, big }); }
function fx(kind, x, y, z, o = {}) { if (parts.length >= Q.maxParts && kind !== 'ring') return; parts.push(Object.assign({ kind, x, y, z, vx: 0, vy: 0, vz: 0, g: 0, life: 0.6, size: 4, color: '#fff' }, o)); }
function dust(x, y, n) {
  for (let i = 0; i < n; i++) fx('dust', x + rand(-12, 12), y + rand(-4, 4), rand(0, 6), { vx: rand(-50, 50), vy: rand(-10, 10), vz: rand(10, 40), life: rand(0.35, 0.6), size: rand(5, 9), color: '#d8d2c4' });
}
function confetti(x, y, z, n) {
  for (let i = 0; i < n; i++) fx('confetti', x, y, z, { vx: rand(-160, 160), vy: rand(-50, 50), vz: rand(120, 340), g: 600, life: rand(0.6, 1.1), size: rand(2.5, 4.5), color: pick(['#ff4757', '#ffd32a', '#2ed573', '#1e90ff', '#e056fd', '#ffffff']) });
}
const isGone = q => q.state === 'abducted' || q.state === 'fell';
const isFlat = q => q.state === 'down' || q.state === 'getup';
const chasersNear = (range) => peds.filter(q => (q.state === 'chase' || q.state === 'latched') && Math.abs(q.x - player.x) < range && Math.abs(q.y - player.y) < range);

// ---------- collision / steering ----------
function collide(e) {
  for (const o of activeObs) {
    const hw = o.w / 2, hh = o.h / 2;
    if (Math.abs(o.x - e.x) > hw + e.r || Math.abs(o.y - e.y) > hh + e.r) continue;
    const cx = clamp(e.x, o.x - hw, o.x + hw), cy = clamp(e.y, o.y - hh, o.y + hh);
    const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= e.r * e.r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2), push = e.r - d;
      e.x += dx / d * push; e.y += dy / d * push;
    } else {
      const px = hw + e.r - Math.abs(e.x - o.x), py = hh + e.r - Math.abs(e.y - o.y);
      if (px < py) e.x += (e.x < o.x ? -1 : 1) * px; else e.y += (e.y < o.y ? -1 : 1) * py;
    }
  }
}
function moveEntity(e, dx, dy) {
  e.x += dx; e.y += dy;
  collide(e);
  e.y = clamp(e.y, Y_MIN, Y_MAX);
}
function steer(e, dx, dy) {
  let ax = 0, ay = 0;
  for (const o of activeObs) {
    const hw = o.w / 2, hh = o.h / 2;
    if (Math.abs(o.x - e.x) > hw + 70 || Math.abs(o.y - e.y) > hh + 70) continue;
    const cx = clamp(e.x, o.x - hw, o.x + hw), cy = clamp(e.y, o.y - hh, o.y + hh);
    let nx = e.x - cx, ny = e.y - cy;
    const d = Math.hypot(nx, ny), R = e.r + 42;
    if (d >= R || d < 0.01) continue;
    nx /= d; ny /= d;
    const toward = -(dx * nx + dy * ny);
    if (toward <= 0) continue;
    const w = (1 - d / R) * toward * 2;
    let tx = -ny, ty = nx;
    const dot = tx * dx + ty * dy;
    if (Math.abs(dot) < 0.05) { if (ty * (CENTER_LINE - e.y) < 0) { tx = -tx; ty = -ty; } }
    else if (dot < 0) { tx = -tx; ty = -ty; }
    ax += nx * w * 0.5 + tx * w; ay += ny * w * 0.5 + ty * w;
  }
  const rx = dx + ax, ry = dy + ay, l = Math.hypot(rx, ry) || 1;
  return [rx / l, ry / l];
}
function separate() {
  for (let i = 0; i < peds.length; i++) {
    const a = peds[i];
    if (a.state === 'down' || isGone(a) || a.type === 'dog') continue;
    for (let j = i + 1; j < peds.length; j++) {
      const b = peds[j];
      if (b.state === 'down' || isGone(b) || b.type === 'dog') continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) > 40) continue;
      const dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

// ---------- input ----------
const cv = document.getElementById('hud');
const keys = {};
let touchMode = false, sprintTouch = null;
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0, active: false };
function getInput() {
  let ix = 0, iy = 0;
  if (keys.ArrowLeft || keys.KeyA) ix -= 1;
  if (keys.ArrowRight || keys.KeyD) ix += 1;
  if (keys.ArrowUp || keys.KeyW) iy -= 1;
  if (keys.ArrowDown || keys.KeyS) iy += 1;
  if (joy.active) { ix += joy.vx; iy += joy.vy; }
  const l = Math.hypot(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  return [ix, iy];
}
const sprintHeld = () => !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyK || sprintTouch !== null);
function primary() {
  if (typeof menu !== 'undefined' && menu) return; // a shop/book/settings panel is open
  if (gs === 'title') startGame();
  else if (gs === 'over') { if (overT > 0.9) startGame(); }
  else if (gs === 'paused') gs = 'play';
  else if (gs === 'play') trySlap();
}
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  ac();
  touchMode = false;
  if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') primary();
  else if (e.code === 'KeyE' || e.code === 'KeyQ' || e.code === 'KeyL') useItem(0);
  else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') useItem(+e.code.slice(5) - 1);
  else if (e.code === 'KeyP' || e.code === 'Escape') { if (gs === 'play') gs = 'paused'; else if (gs === 'paused') gs = 'play'; }
  else if (e.code === 'KeyM') muted = !muted;
  else if (e.code === 'KeyG') cycleQualityMode();
  else if (e.code === 'KeyF') toggleFps();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; sprintTouch = null; if (gs === 'play') gs = 'paused'; });
document.addEventListener('visibilitychange', () => { if (document.hidden && gs === 'play') gs = 'paused'; });

// ---------- slapping ----------
const UNSLAPPABLE = new Set(['down', 'getup', 'revenge', 'abducted', 'fell', 'frozen', 'distracted']);
function findTarget(dir, auto = false) {
  let bestQ = null, bd = 1e9;
  for (const q of peds) {
    if (q.type === 'dog' || UNSLAPPABLE.has(q.state)) continue; // no dog slapping, ever
    if (auto && q.state === 'chase' && !(power.rapid > 0 || power.giant > 0)) continue; // normally a manual gamble
    const dx = (q.x - player.x) * dir, dy = Math.abs(q.y - player.y);
    if (dx > -6 && dx < slapReach() + q.r && dy < slapDepth()) {
      const d = dx + dy;
      if (d < bd) { bd = d; bestQ = q; }
    }
  }
  return bestQ;
}
function trySlap(auto = false) {
  const p = player;
  if (gs !== 'play' || p.downT > 0 || p.slapCd > 0 || p.hidden) return;
  if (power.mega > 0) { megaSlap(auto); return; }
  let tgt = findTarget(p.facing, auto);
  if (!tgt) { const back = findTarget(-p.facing, auto); if (back) { p.facing = -p.facing; tgt = back; } }
  if (!tgt && auto) return;
  p.slapCd = slapCooldown(); p.slapT = 0.25;
  if (!tgt) { sfx.whiff(); return; }
  if (tgt.type === 'karate' && tgt.state === 'walk' && chance(0.35)) {
    tgt.blockT = 0.45; p.slapCd = 0.8; sfx.block();
    popup(tgt.x, tgt.y, 92 * tgt.size, 'BLOCKED!', '#74b9ff', 22, 0.9);
    say(tgt, 'chase', true);
    startChase(tgt, 7);
    return;
  }
  const blockChance = tgt.state === 'chase' ? Math.min(0.65, 0.22 * (tgt.slaps - 1) + (tgt.type === 'big' || tgt.type === 'karate' ? 0.15 : 0)) : 0;
  if (Math.random() < blockChance) {
    tgt.blockT = 0.4; p.slapCd = 0.75; sfx.block();
    popup(tgt.x, tgt.y, 92 * tgt.size, 'BLOCKED!', '#74b9ff', 22, 0.9);
    return;
  }
  slapHit(tgt, p.facing);
}
function megaSlap(auto) {
  const p = player;
  const hits = peds.filter(q => q.type !== 'dog' && !UNSLAPPABLE.has(q.state) && Math.abs(q.x - p.x) < MEGA_REACH && Math.abs(q.y - p.y) < 70);
  if (!hits.length) { if (!auto) { p.slapCd = SLAP_CD; p.slapT = 0.25; sfx.whiff(); } return; }
  p.slapCd = 0.45; p.slapT = 0.25;
  p.facing = hits[0].x >= p.x ? 1 : -1;
  fx('ring', p.x, p.y, 0, { r: 20, grow: 300, life: 0.45, color: '#ff6b81' });
  shake = Math.max(shake, 13);
  for (const q of hits) slapHit(q, q.x >= p.x ? 1 : -1);
}
function knockDown(q, dir, force, time) {
  q.state = 'down'; q.timer = time; q.fallDir = dir;
  q.kvx = dir * force; q.kvy = rand(-30, 30);
  q.slapT = 0; q.blockT = 0; q.shock = 0; q.photoT = 0; q.mimeT = 0; q.danceT = 0;
  dust(q.x, q.y, 6);
}
function startChase(q, angerSec) {
  q.state = 'chase'; q.ramp = 0.3; q.angryAfter = true;
  if (angerSec) q.angerMax = angerSec * q.T.anger;
  if (!q.chaseSpeed) q.chaseSpeed = BASE_SPEED * q.T.chase * difficultySpeed() * rand(0.96, 1.05);
  q.anger = q.angerMax;
  q.photoT = q.mimeT = q.danceT = q.shock = 0;
}
function slapHit(q, dir, chained = false) {
  const p = player;
  const wasChase = q.state === 'chase', wasTired = q.state === 'tired';
  q.slaps++; q.marked = true; q.angryAfter = true;
  const T = q.T;
  knockDown(q, dir, 340, Math.max(0.6, 1.9 * T.down * Math.pow(0.75, q.slaps - 1)));
  const base = Math.min(10, 5.5 + elapsed / 45);
  q.angerMax = (base + (q.slaps - 1) * 2.2) * T.anger;
  q.chaseSpeed = BASE_SPEED * T.chase * difficultySpeed() * (1 + 0.05 * Math.min(6, q.slaps - 1)) * rand(0.96, 1.05);

  combo = (elapsed - lastSlapT < COMBO_WINDOW) ? Math.min(8, combo + 1) : 1;
  lastSlapT = elapsed;
  bestCombo = Math.max(bestCombo, combo);
  addCoins((1 + (combo >= 3 ? 1 : 0)) * (power.golden > 0 ? 3 : 1)); bookSlap(q.type);
  missionEvent('slap', 1, { type: q.type }); missionEvent('combo', combo);
  const ann = { 3: 'TRIPLE SLAP!', 5: 'SLAP-TASTIC!', 8: 'UNSTOPPABLE!' }[combo];
  if (ann && (!announce || announce.text !== ann)) { announce = { text: ann, t: 1.1, max: 1.1 }; sfx.announce(); }
  p.burstT = lvl('burst') ? 0.6 : 0; camPunch = Math.max(camPunch, 0.035);
  let nc = 0;
  for (const o of peds) if (o !== q && o.state === 'chase') nc++;
  let mult = combo * (1 + 0.5 * nc) * (power.golden > 0 ? 2 : 1);
  if (wasChase) mult *= 1.5;
  if (wasTired) mult *= 1.3;
  if (q.type === 'influencer') mult *= 2;
  const pts = addScore(Math.round(T.pts * mult / 10) * 10);
  slaps++;

  const hz = 78 * q.size;
  popup(q.x, q.y, hz + 12, pick(SLAP_WORDS), '#ffdd59', 34, 0.8, true);
  popup(q.x, q.y, hz - 14, '+' + pts, '#ffffff', 20, 1.1);
  if (q.type === 'influencer') popup(q.x, q.y, hz + 46, 'GONE VIRAL! x2', '#e056fd', 18, 1.2);
  else if (wasChase) popup(q.x, q.y, hz + 46, 'SECONDS!', '#ff9f43', 18, 1.2);
  else if (wasTired) popup(q.x, q.y, hz + 46, 'CHEEKY!', '#ff9f43', 18, 1.2);
  say(q, 'hit', true);
  if (combo > 1) sfx.combo(combo);
  if (power.chain > 0 && !chained) {
    const zaps = peds.filter(o => o !== q && o.type !== 'dog' && !UNSLAPPABLE.has(o.state) && Math.hypot(o.x - q.x, o.y - q.y) < 170)
      .sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y)).slice(0, 3);
    let from = q;
    for (const o of zaps) {
      fx('zap', from.x, from.y, 60, { x2: o.x, y2: o.y, z2: 60, life: 0.3, color: '#74b9ff' });
      from = o;
      slapHit(o, o.x >= q.x ? 1 : -1, true);
    }
  }
  if ((combo === 5 || combo === 8) && p.hearts < MAX_HEARTS) dropHeart(q.x - dir * 30, q.y, 'heart', 'COMBO HEART!');
  const gain = 10 + 8 * (combo - 1);
  p.stamina = Math.min(STAMINA_MAX, p.stamina + gain);
  if (gain >= 18) popup(p.x, p.y, 112, '+SPRINT!', '#4cd137', 16, 0.9);
  for (let i = 0; i < 9; i++) {
    fx('star', q.x - dir * 4, q.y, hz, { vx: rand(-60, 60) + dir * 120, vy: rand(-40, 40), vz: rand(60, 220), g: 500, life: rand(0.4, 0.8), size: rand(3, 6), color: pick(['#ffd32a', '#fff200', '#ffffff', '#ff9f1a']) });
  }
  shake = Math.max(shake, 7); sfx.slap(); buzz(15);
  if (q.type === 'clown') sfx.clown();

  const L = q.look;
  if (L.pizza) { L.pizza = false; items.push({ kind: 'pizza', x: q.x + dir * 34, y: q.y, z: 40, vz: 150, life: 14 }); }
  if (q.type === 'nurse' && !q.droppedKit) { q.droppedKit = true; items.push({ kind: 'medkit', x: q.x + dir * 34, y: q.y, z: 40, vz: 150, life: 14 }); }
  if (L.coffee) {
    L.coffee = false;
    for (let i = 0; i < 10; i++) fx('drop', q.x, q.y, 50, { vx: rand(-80, 80) + dir * 60, vy: rand(-20, 20), vz: rand(50, 180), g: 500, life: 0.6, size: 2.5, color: '#6f4e37' });
  }
  if (L.mailbag) for (let i = 0; i < 8; i++) fx('letter', q.x, q.y, 50, { vx: rand(-90, 90), vy: rand(-30, 30), vz: rand(80, 220), g: 160, life: rand(1, 1.6), size: 6, color: '#ffffff' });
  if (q.dog && q.dog.state === 'walk' && gs === 'play') { q.dog.state = 'alert'; q.dog.timer = 0.6; q.dog.say = { text: 'GRRR...', t: 1 }; sfx.bark(); }

  for (const o of peds) {
    if (o === q || o.type === 'dog' || o.state !== 'walk') continue;
    const dx = Math.abs(o.x - q.x), dy = Math.abs(o.y - q.y);
    if (o.type === 'cop' && dx < 380 && dy < 260) { startChase(o, 7); say(o, 'chase', true); sfx.whistle(); continue; }
    if (dx > 230 || dy > 160) continue;
    if (o.type === 'phone') continue;
    if (o.type === 'punk' || o.type === 'clown') { o.happyT = 1.6; say(o, 'laugh'); continue; }
    if (o.type === 'influencer') { o.photoT = 1.2; o.flashed = false; say(o, 'hit'); continue; }
    o.shock = rand(0.7, 1.1);
    if (chance(0.25)) say(o, 'gasp');
  }
}
function hurtPlayer(src) {
  const p = player;
  if (gs !== 'play' || p.invuln > 0 || p.downT > 0) return false;
  if (untouchable()) {
    if (src.state === 'chase' && src.type !== 'dog' && power.hawk <= 0) { knockDown(src, src.x < p.x ? -1 : 1, 380, 1.3); src.angryAfter = true; popup(src.x, src.y, 96, power.giant > 0 ? 'BOING!' : 'OUT OF MY WAY!', '#e056fd', 15, 0.8); }
    return false;
  }
  if (power.shield > 0) {
    power.shield = 0; p.invuln = 1.2; sfx.block(); sfx.pop();
    popup(p.x, p.y, 100, 'SHIELD!', '#48dbfb', 26, 1.0, true);
    fx('ring', p.x, p.y, 0, { r: 20, grow: 260, life: 0.4, color: '#48dbfb' });
    if (src.type === 'dog') src.state = 'walk';
    else if (src.state === 'chase') { knockDown(src, src.x < p.x ? -1 : 1, 320, 1.4); src.angryAfter = true; }
    return false;
  }
  p.hearts--; p.invuln = 3.0; p.downT = 0.9; p.sprinting = false; p.hidden = false;
  p.fallDir = src.x < p.x ? 1 : -1; p.kvx = p.fallDir * 280;
  shake = 16; hitStop = 0.09; camPunch = 0.07; sfx.slap(); sfx.hurt(); buzz([60, 40, 60]);
  popup(p.x, p.y, 96, src.type === 'dog' ? 'CHOMP!' : 'OUCH!', '#ff4757', 30, 1.0, true);
  if (p.hearts <= 0) {
    gs = 'dying'; dyingT = 1.8; p.downT = 999; sfx.over(); camPunch = 0.1;
    endRun();
    newBest = score > best;
    if (newBest) best = score; // saved per player profile by endRun()
    for (const q of peds) if (q.state === 'chase') { q.state = 'revenge'; q.timer = rand(0.3, 1.0); q.decoyHit = false; }
  }
  return true;
}
function toWalk(q, happy) {
  q.state = 'walk'; q.dirX = Math.random() < 0.5 ? 1 : -1;
  if (happy) { q.happyT = 4; q.dirX = q.x < player.x ? -1 : 1; }
  q.targetY = sidewalkYNear(q.y); q.pause = 0; q.anger = 0; q.angryAfter = false; q.decoyHit = false; q.lost = null; q.smokeT = 0; q.goal = null;
}
// make a chaser give up for good (counts as an escape)
function pacify(q, kind, pts, label, color) {
  if (q.type === 'dog') { toWalk(q, false); return; }
  const was = q.state === 'chase' || q.angryAfter;
  toWalk(q, true);
  if (kind) say(q, kind, true);
  if (was && pts) {
    addEscape();
    const got = addScore(pts);
    popup(q.x, q.y, 96, label + ' +' + got, color, 16, 1.1);
  }
}
function distract(q, gx, gy, time, kind) {
  q.state = 'distracted'; q.goal = { x: gx, y: clamp(gy, Y_MIN, Y_MAX) }; q.timer = time; q.distractKind = kind;
  q.photoT = q.mimeT = q.danceT = q.shock = 0;
  if (kind) say(q, kind, true);
}

// ---------- items & power-ups ----------
function rollPower() { return weighted(POWERS, k => POWERS[k].w); }
function spawnBox(x, y) {
  if (x === undefined) {
    const side = chance(0.7) ? player.facing : -player.facing;
    x = player.x + side * rand(260, 650);
    y = rand(24, 440);
  }
  const tmp = { x, y, r: 16 };
  collide(tmp);
  items.push({ kind: 'box', x: tmp.x, y: clamp(tmp.y, Y_MIN + 6, Y_MAX - 6), z: rand(260, 380), vz: 0, life: 30, bob: Math.random() * 6 });
}
function openBox() {
  missionEvent('box');
  if (opening) finishOpening();
  opening = { t: 0.75, result: rollPower() };
  boxesOpened++;
  sfx.box();
  confetti(player.x, player.y, 40, 18);
}
function finishOpening() {
  const k = opening.result; opening = null;
  const P = POWERS[k];
  if (P.instant) { applyPower(k); return; }
  if (inventory.length < MAX_ITEMS) {
    inventory.push(k);
    sfx.pickup();
    popup(player.x, player.y, 128, 'GOT ' + P.name + '!', P.color, 18, 1.4, true);
    popup(player.x, player.y, 108, touchMode ? 'tap the slot to use' : 'press E to use', '#ffffff', 12, 1.4);
  } else {
    popup(player.x, player.y, 140, 'BAG FULL - AUTO-USED!', '#ffffff', 13, 1.2);
    applyPower(k);
  }
}
function useItem(i) {
  if (gs !== 'play' || player.downT > 0 || !inventory[i]) return;
  applyPower(inventory.splice(i, 1)[0]);
}
function applyPower(k) {
  const P = POWERS[k], p = player;
  showBanner(P.name, P.desc, P.color, 1.8);
  sfx.power();
  switch (k) {
    case 'ufo': summonUfo(); break;
    case 'decoy':
      if (decoy) popDecoy();
      decoy = { isDecoy: true, x: p.x, y: p.y, z: 0, life: 8, hits: 0, wob: 0, size: 1, facing: p.facing, phase: 0, moveAmt: 0, lie: 0, fallDir: 1,
        look: PLAYER_LOOK, slapT: 0, blockT: 0, shock: 0, happyT: 0, marked: false, state: 'decoy', r: 13 };
      confetti(p.x, p.y, 40, 12);
      break;
    case 'horn': airHorn(); break;
    case 'heart': healPlayer('+1 HEART'); break;
    case 'energy': power.energy = P.dur; p.stamina = STAMINA_MAX; p.winded = false; break;
    case 'disguise':
      power.disguise = P.dur;
      for (const q of peds) if (q.state === 'chase') say(q, 'lost', true);
      dust(p.x, p.y, 10);
      break;
    case 'smoke': {
      sfx.smoke();
      for (let i = 0; i < 26; i++) fx('smoke', p.x + rand(-40, 40), p.y + rand(-25, 25), rand(0, 50), { vx: rand(-40, 40), vy: rand(-15, 15), vz: rand(5, 30), life: rand(1.2, 2.2), size: rand(14, 26), color: '#b2bec3' });
      for (const q of chasersNear(380)) { q.smokeT = 5; say(q, 'lost', true); }
      break;
    }
    case 'cash': {
      sfx.coins();
      for (let i = 0; i < 40; i++) fx('cash', p.x + rand(-260, 260), p.y + rand(-120, 120), rand(150, 320), { vx: rand(-20, 20), vy: 0, vz: rand(-30, 0), g: 40, life: rand(2, 3.5), size: 7, color: '#2ecc71' });
      for (const q of chasersNear(650)) {
        distract(q, p.x + rand(-220, 220), p.y + rand(-100, 100), 5.5, 'money');
        addEscape(); const got = addScore(100); popup(q.x, q.y, 96, 'DISTRACTED +' + got, '#2ecc71', 15, 1.1);
      }
      break;
    }
    case 'pie': {
      const targets = chasersNear(650).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, 4);
      if (!targets.length) popup(p.x, p.y, 130, 'Nobody to pie... yet!', '#ffffff', 14, 1.2);
      targets.forEach((q, i) => pies.push({ x: p.x, y: p.y, z: 60, sx: p.x, sy: p.y, target: q, t: -i * 0.15, dur: 0.45 }));
      break;
    }
    case 'flowers': {
      const targets = chasersNear(500).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, 4);
      if (!targets.length) popup(p.x, p.y, 130, 'Saving them for later...', '#ffffff', 14, 1.2);
      for (const q of targets) {
        for (let i = 0; i < 6; i++) fx('heartp', q.x + rand(-10, 10), q.y, 80, { vx: rand(-20, 20), vz: rand(30, 70), life: rand(1, 1.6), size: rand(4, 7), color: '#fd79a8' });
        q.look.flowers = true;
        pacify(q, 'thanks', 150, 'FORGIVEN!', '#fd79a8');
      }
      break;
    }
    case 'freeze': {
      sfx.freeze();
      fx('ring', p.x, p.y, 0, { r: 20, grow: 1100, life: 0.5, color: '#81ecec' });
      for (const q of chasersNear(750)) {
        q.state = 'frozen'; q.timer = 4.5;
        const got = addScore(50); popup(q.x, q.y, 96, 'FROZEN +' + got, '#81ecec', 15, 1.1);
      }
      break;
    }
    case 'tornado':
      sfx.wind();
      tornados.push({ x: p.x + p.facing * 30, y: p.y, dir: p.facing, life: 3.6, t: 0, hit: new Set() });
      break;
    case 'boomerang': boomerangs.push({ x: p.x, y: p.y, ox: p.x, dir: p.facing, t: 0, hit: new Set() }); sfx.whiff(); break;
    case 'nitro': power.nitro = P.dur; camPunch = 0.08; sfx.sprint(); sfx.power(); break;
    case 'rush': power.rush = P.dur; p.rushDir = p.facing; camPunch = 0.06; transformPuff(); sfx.bull(); break;
    case 'hawk': power.hawk = P.dur; p.flying = true; transformPuff(); sfx.hawk(); break;
    default: power[k] = P.dur;
  }
}
function healPlayer(label) {
  const p = player;
  if (p.hearts < MAX_HEARTS) { p.hearts++; popup(p.x, p.y, 120, label, '#ff4757', 20, 1.2, true); }
  else { const pts = addScore(300); popup(p.x, p.y, 120, 'FULL HEALTH +' + pts, '#ff4757', 16, 1.1, true); }
  for (let i = 0; i < 6; i++) fx('heartp', p.x + rand(-12, 12), p.y, 70, { vx: rand(-20, 20), vz: rand(40, 80), life: rand(0.8, 1.2), size: rand(4, 6), color: '#ff4757' });
  sfx.pickup();
}
function dropHeart(x, y, kind, label) {
  items.push({ kind, x, y: clamp(y, Y_MIN + 6, Y_MAX - 6), z: 60, vz: 180, life: 18 });
  if (label) popup(x, y, 110, label, '#ff6b81', 16, 1.1);
}
function summonUfo() {
  const d = q => Math.abs(q.x - player.x);
  let targets = peds.filter(q => (q.state === 'chase' || q.state === 'latched' || q.state === 'frozen' || (isFlat(q) && q.angryAfter)) && d(q) < VW).sort((a, b) => d(a) - d(b)).slice(0, 10);
  const extra = peds.filter(q => (q.state === 'walk' || q.state === 'tired') && !targets.includes(q) && d(q) < VW * 0.6).sort((a, b) => d(a) - d(b));
  targets = targets.concat(extra.slice(0, Math.max(0, 10 - targets.length)));
  ufo = { x: camX - 120, y: player.y, alt: 250, state: 'seek', targets, target: null };
  sfx.ufo();
}
function transformPuff() { const p = player; for (let i = 0; i < 18; i++) fx('smoke', p.x + rand(-25, 25), p.y + rand(-15, 15), rand(10, 70), { vx: rand(-60, 60), vz: rand(10, 50), life: rand(0.5, 0.9), size: rand(10, 18), color: '#ecf0f1' }); confetti(p.x, p.y, 50, 10); }
function hawkLanding() { // diving back down: a shockwave slaps everyone around you
  const p = player;
  transformPuff();
  fx('ring', p.x, p.y, 0, { r: 20, grow: 420, life: 0.4, color: '#a4b0be' });
  shake = Math.max(shake, 12); camPunch = 0.07; sfx.crash();
  for (const q of peds) {
    if (q.type === 'dog' || UNSLAPPABLE.has(q.state)) continue;
    if (Math.hypot(q.x - p.x, q.y - p.y) < 120) slapHit(q, q.x >= p.x ? 1 : -1, true);
  }
}
function airHorn() {
  const p = player;
  sfx.airhorn(); shake = 16; camPunch = 0.08;
  fx('ring', p.x, p.y, 0, { r: 20, grow: 700, life: 0.5, color: '#ff9f43' });
  let n = 0;
  for (const q of peds) {
    if (isFlat(q) || isGone(q)) continue;
    if (Math.abs(q.x - p.x) > 330 || Math.abs(q.y - p.y) > 220) continue;
    if (q.type === 'dog') { q.state = 'walk'; say(q, 'chase', true); continue; }
    const wasChase = q.state === 'chase', keep = q.anger;
    knockDown(q, q.x >= p.x ? 1 : -1, 260, 1.8);
    q.angryAfter = wasChase;
    if (wasChase) { q.angerMax = Math.max(3, keep) + 1; n++; }
  }
  const pts = n ? addScore(100 * n) : 0;
  popup(p.x, p.y, 130, n ? 'HOOOONK! +' + pts : 'HOOOONK!', '#ff9f43', 26, 1.2, true);
}
function popDecoy() {
  sfx.pop();
  confetti(decoy.x, decoy.y, 40, 20);
  popup(decoy.x, decoy.y, 90, 'POP!', '#ffa502', 24, 0.8, true);
  decoy = null;
}

function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.life -= dt;
    it.vz -= 900 * dt; it.z += it.vz * dt;
    if (it.z < 0) { it.z = 0; it.vz = it.vz < -120 ? -it.vz * 0.35 : 0; }
    if (it.life <= 0 || Math.abs(it.x - player.x) > 1800) { items.splice(i, 1); continue; }
    const d = Math.hypot(it.x - player.x, it.y - player.y), magnetic = it.kind !== 'box';
    if (magnetic && gs === 'play' && it.z < 20 && d < magnetRange() * 2.2 && d > 1) { const pull = Math.min(d, 420 * dt); it.x += (player.x - it.x) / d * pull; it.y += (player.y - it.y) / d * pull; }
    if (gs === 'play' && player.downT <= 0 && it.z < 20 && d < (magnetic ? magnetRange() : 32)) {
      items.splice(i, 1);
      if (it.kind === 'coin') { const g = addCoins(it.value || 2); sfx.coin(); popup(it.x, it.y, 60, '+' + g, '#ffd32a', 12, 0.6); fx('star', it.x, it.y, 30, { vz: 80, life: 0.4, size: 4, color: '#ffd32a' }); }
      else if (it.kind === 'box') openBox();
      else healPlayer(it.kind === 'medkit' ? 'FIRST AID! +1 HEART' : it.kind === 'pizza' ? 'PIZZA! +1 HEART' : '+1 HEART');
    }
  }
  if (opening) { opening.t -= dt; if (opening.t <= 0) finishOpening(); }
}
function updatePowers(dt) {
  if (gs !== 'play') return;
  for (const k in power) if (power[k] > 0) power[k] = Math.max(0, power[k] - dt);
  const p = player;
  if (power.aura > 0) {
    p.auraT = (p.auraT || 0) - dt;
    if (p.auraT <= 0) {
      p.auraT = 0.22;
      let tgt = null, bd = 100;
      for (const q of peds) { if (q.type === 'dog' || UNSLAPPABLE.has(q.state)) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; tgt = q; } }
      if (tgt) { p.slapT = 0.25; slapHit(tgt, tgt.x >= p.x ? 1 : -1); }
    }
  }
  p.swoopT = Math.max(0, (p.swoopT || 0) - dt);
  if (power.hawk > 0) {
    p.hawkT = (p.hawkT || 0) - dt;
    if (p.hawkT <= 0) {
      let tgt = null, bd = 150;
      for (const q of peds) { if (q.type === 'dog' || UNSLAPPABLE.has(q.state)) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; tgt = q; } }
      if (tgt) {
        p.hawkT = 0.45; p.swoopT = 0.35; p.facing = tgt.x >= p.x ? 1 : -1;
        for (let i = 0; i < 6; i++) fx('feather', tgt.x, tgt.y, 70, { vx: rand(-80, 80), vz: rand(30, 120), g: 80, life: 1, size: 3, color: '#c8a165' });
        slapHit(tgt, p.facing);
        sfx.screech();
      } else p.hawkT = 0.15;
    }
  }
  if (power.rush > 0) for (const q of peds) {
    if (q.type === 'dog' || UNSLAPPABLE.has(q.state)) continue;
    if (Math.abs(q.x - p.x) < 40 * p.size && Math.abs(q.y - p.y) < 30 * p.size) slapHit(q, p.rushDir);
  }
  for (let i = boomerangs.length - 1; i >= 0; i--) {
    const b = boomerangs[i];
    b.t += dt;
    const k = b.t / 1.6; // out and back in 1.6s
    if (k >= 1) { boomerangs.splice(i, 1); continue; }
    const out = Math.sin(k * Math.PI) * 430;   // flies out, then curves back to wherever you are now
    b.x = b.ox * (1 - k) + p.x * k + b.dir * out;
    b.y = p.y + Math.sin(k * TAU) * 40;
    for (const q of peds) {
      if (q.type === 'dog' || b.hit.has(q) || UNSLAPPABLE.has(q.state)) continue;
      if (Math.abs(q.x - b.x) < 36 && Math.abs(q.y - b.y) < 30) { b.hit.add(q); slapHit(q, b.dir * (k < 0.5 ? 1 : -1), true); }
    }
  }
  if (power.banana > 0) {
    p.bananaT -= dt;
    if (p.bananaT <= 0 && Math.hypot(p.vx, p.vy) > 40) { bananas.push({ x: p.x - p.facing * 16, y: p.y, life: 25, rot: rand(-0.6, 0.6) }); p.bananaT = 0.28; }
  }
  for (let i = bananas.length - 1; i >= 0; i--) {
    const b = bananas[i];
    b.life -= dt;
    if (b.life <= 0 || Math.abs(b.x - p.x) > 1800) { bananas.splice(i, 1); continue; }
    for (const q of peds) {
      if (q.type === 'dog' || (q.state !== 'walk' && q.state !== 'chase')) continue;
      if (Math.abs(q.x - b.x) > 16 || Math.abs(q.y - b.y) > 12) continue;
      const wasChase = q.state === 'chase', keep = q.anger;
      knockDown(q, q.vx >= 0 ? 1 : -1, 220, wasChase ? 1.5 : 1.2);
      q.angryAfter = wasChase;
      sfx.slip();
      if (wasChase) { missionEvent('slip'); q.angerMax = Math.max(3, keep) + 1.5; const pts = addScore(150); popup(q.x, q.y, 90, 'SLIPPED! +' + pts, '#ffd32a', 18, 1.1, true); }
      else popup(q.x, q.y, 90, 'WHOA!', '#ffd32a', 16, 0.9);
      bananas.splice(i, 1);
      break;
    }
  }
  if (decoy) {
    decoy.life -= dt; decoy.wob = Math.max(0, decoy.wob - dt);
    if (decoy.life <= 0) popDecoy();
  }
  // cream pies in flight
  for (let i = pies.length - 1; i >= 0; i--) {
    const pi = pies[i];
    pi.t += dt;
    if (pi.t < 0) continue;
    const q = pi.target, k = Math.min(1, pi.t / pi.dur);
    pi.x = lerp(pi.sx, q.x, k); pi.y = lerp(pi.sy, q.y, k); pi.z = 60 + Math.sin(k * Math.PI) * 70 + (70 * q.size - 60) * k;
    if (k >= 1) {
      pies.splice(i, 1);
      if (!peds.includes(q) || isGone(q)) continue;
      sfx.splat();
      for (let j = 0; j < 10; j++) fx('drop', q.x, q.y, 70, { vx: rand(-90, 90), vy: rand(-20, 20), vz: rand(40, 160), g: 500, life: 0.6, size: 3, color: '#fffaf0' });
      const wasChase = q.state === 'chase';
      knockDown(q, q.x >= p.x ? 1 : -1, 160, 2.4);
      q.creamT = 6; q.angryAfter = wasChase;
      const got = addScore(120); popup(q.x, q.y, 100, 'SPLAT! +' + got, '#fff3e0', 18, 1.1, true);
    }
  }
  // tornados sweep through the crowd
  for (let i = tornados.length - 1; i >= 0; i--) {
    const tn = tornados[i];
    tn.life -= dt; tn.t += dt;
    tn.x += tn.dir * 330 * dt; tn.y = clamp(tn.y + Math.sin(tn.t * 3) * 90 * dt, Y_MIN, Y_MAX);
    if (Math.random() < dt * 20) fx('dust', tn.x + rand(-20, 20), tn.y, rand(0, 60), { vx: rand(-80, 80), vz: rand(40, 120), life: 0.5, size: rand(5, 10), color: '#a4b0be' });
    for (const q of peds) {
      if (q.type === 'dog' || tn.hit.has(q) || isFlat(q) || isGone(q)) continue;
      if (Math.abs(q.x - tn.x) > 55 || Math.abs(q.y - tn.y) > 45) continue;
      tn.hit.add(q);
      const wasChase = q.state === 'chase';
      knockDown(q, tn.dir, 950, 2.2);
      q.angryAfter = wasChase && chance(0.5);
      if (wasChase) { const got = addScore(100); popup(q.x, q.y, 110, 'WHOOSH! +' + got, '#a29bfe', 16, 1.1); }
    }
    if (tn.life <= 0) tornados.splice(i, 1);
  }
}
function updateUfo(dt) {
  if (!ufo) return;
  if (ufo.state === 'seek') {
    if (!ufo.target) {
      while (ufo.targets.length) {
        const c = ufo.targets.shift();
        if (peds.includes(c) && !isGone(c)) { ufo.target = c; break; }
      }
      if (!ufo.target) ufo.state = 'leave';
    }
    const t = ufo.target;
    if (t) {
      const dx = t.x - ufo.x, step = 1100 * dt;
      ufo.x += clamp(dx, -step, step);
      ufo.y += (t.y - ufo.y) * Math.min(1, dt * 8);
      if (Math.abs(dx) < 10) { ufo.state = 'beam'; t.wasAngry = t.state === 'chase' || t.state === 'latched' || !!t.angryAfter; t.state = 'abducted'; t.z = 0; t.lie = 0; t.say = null; sfx.beam(); }
    }
  } else if (ufo.state === 'beam') {
    const t = ufo.target;
    t.x += (ufo.x - t.x) * Math.min(1, dt * 6);
    t.z += 330 * dt;
    if (t.z >= ufo.alt - 20) {
      removePed(t); if (t.wasAngry) addEscape(); missionEvent('abduct'); addCoins(4);
      const pts = addScore(300);
      popup(ufo.x, ufo.y, ufo.alt - 40, 'CAUGHT BY ALIENS! +' + pts, '#7bed9f', 18, 1.2, true);
      ufo.target = null; ufo.state = 'seek';
    }
  } else {
    ufo.x += 700 * dt; ufo.alt += 350 * dt;
    if (ufo.alt > 900) ufo = null;
  }
}

// ---------- street features: booths, manholes, pigeons, ice cream truck ----------
function updateStreet(dt) {
  const p = player;
  // hiding in a phone booth / porta-potty
  p.seenT = Math.max(0, p.seenT - dt);
  let inBooth = null;
  for (const b of activeBooths) if (Math.abs(b.x - p.x) < 18 && Math.abs(b.y - p.y) < 16) { inBooth = b; break; }
  const still = Math.hypot(p.vx, p.vy) < 30;
  if (inBooth && still && p.downT <= 0 && gs === 'play') {
    if (!p.hidden) {
      p.hideT += dt;
      if (p.hideT > 0.3) {
        const spotted = peds.some(q => q.state === 'chase' && Math.hypot(q.x - p.x, q.y - p.y) < 110);
        if (spotted) { if (p.seenT <= 0) { popup(p.x, p.y, 110, 'THEY SAW YOU!', '#ff6b6b', 16, 1.0); p.seenT = 1.2; } }
        else {
          p.hidden = true; sfx.hide(); missionEvent('hide');
          popup(p.x, p.y, 110, 'HIDDEN!', '#dfe6e9', 18, 1.0, true);
          for (const q of peds) if (q.state === 'chase') say(q, 'lost');
        }
      }
    }
  } else { p.hidden = false; p.hideT = 0; }
  // manholes swallow careless pedestrians
  for (const h of activeHoles) {
    for (const q of peds) {
      if (q.type === 'dog' || (q.state !== 'chase' && q.state !== 'walk')) continue;
      if (Math.abs(q.x - h.x) > 13 || Math.abs(q.y - h.y) > 10) continue;
      const wasChase = q.state === 'chase';
      q.state = 'fell'; q.timer = 0.7; q.x = h.x; q.y = h.y; q.say = null;
      sfx.splash();
      if (wasChase && gs === 'play') { addEscape(); missionEvent('manhole'); const got = addScore(200); popup(h.x, h.y, 70, 'SPLOOSH! +' + got, '#48dbfb', 20, 1.2, true); }
      else popup(h.x, h.y, 70, 'OOPS!', '#48dbfb', 16, 1.0);
    }
  }
  // pigeons scatter into the faces of whoever's chasing you
  for (const f of activeFlocks) {
    const since = gameTime - f.scatterT;
    if (since > 25 && Math.hypot(p.x - f.x, p.y - f.y) < 70 && gs === 'play') {
      f.scatterT = gameTime; f.hitSet = new Set(); sfx.coo();
      for (let i = 0; i < f.n * 2; i++) fx('feather', f.x + rand(-20, 20), f.y + rand(-10, 10), rand(5, 30), { vx: rand(-90, 90), vy: rand(-30, 30), vz: rand(60, 160), g: 60, life: rand(0.8, 1.4), size: 3, color: '#dfe6e9' });
    }
    if (since < 2.5 && f.hitSet) {
      for (const q of peds) {
        if (q.state !== 'chase' || q.type === 'dog' || f.hitSet.has(q)) continue;
        if (Math.hypot(q.x - f.x, q.y - f.y) > 120) continue;
        f.hitSet.add(q);
        knockDown(q, q.vx >= 0 ? 1 : -1, 80, 1.1); q.angryAfter = true;
        const got = addScore(80); popup(q.x, q.y, 100, 'PIGEON ATTACK! +' + got, '#dfe6e9', 15, 1.1);
      }
    }
  }
  // ice cream truck
  if (truck && !truck.healed && gs === 'play' && Math.abs(player.x - truck.x) < 95 && Math.abs(player.y - truck.y) < 60) { truck.healed = true; healPlayer('FREE ICE CREAM! +1 HEART'); }
  if (escapes >= nextEscapeHeart && gs === 'play') { nextEscapeHeart += 6; healPlayer('ESCAPE ARTIST! +1 HEART'); }
  if (truck) {
    truck.life -= dt;
    if (truck.life <= 0) { truck = null; }
  }
}
function spawnTruck() {
  const side = chance(0.5) ? 1 : -1;
  const x = player.x + side * rand(320, 460), y = 318;
  truck = { x, y, life: 13, ob: { kind: 'truck', x, y, w: 150, h: 26 } };
  sfx.jingle();
  for (const q of peds) {
    if (q.type === 'dog' || Math.abs(q.x - player.x) > 1100) continue;
    if (q.state === 'chase' || (isFlat(q) && q.angryAfter)) {
      if (isFlat(q)) continue;
      distract(q, x + rand(-70, 70), y + rand(30, 70), rand(9, 11), 'icecream');
      q.look.icecream = true;
      addEscape(); const got = addScore(100); popup(q.x, q.y, 96, 'ICE CREAM BREAK +' + got, '#fd79a8', 14, 1.1);
    } else if (q.state === 'walk' && Math.abs(q.x - x) < 350 && chance(0.5)) {
      distract(q, x + rand(-80, 80), y + rand(30, 80), rand(5, 9), null);
      q.look.icecream = true;
    }
  }
}

// ---------- events ----------
function startEvent(k) {
  const E = EVENTS[k];
  const px = player.x;
  switch (k) {
    case 'marathon': {
      const dir = chance(0.5) ? 1 : -1;
      for (let i = 0; i < 11; i++) {
        const x = dir > 0 ? camX - rand(60, 500) : camX + VW + rand(60, 500);
        const q = addPed(x, sidewalkY(), 'jogger');
        q.dirX = dir; q.marathon = true; q.walkSpeed = rand(150, 190); q.look.bib = 1 + ((Math.random() * 998) | 0);
      }
      break;
    }
    case 'boxrain':
      for (let i = 0; i < 4; i++) spawnBox(px + rand(-VW * 0.4, VW * 0.45), rand(24, 440));
      break;
    case 'flashmob':
      for (let i = 0; i < 10; i++) {
        let x;
        do { x = camX + rand(60, VW - 60); } while (Math.abs(x - px) < 90);
        addPed(x, sidewalkY(), randTypeAt(x)).danceT = rand(6, 9);
      }
      break;
    case 'patrol':
      for (let i = 0; i < 3; i++) {
        const side = i % 2 ? 1 : -1;
        addPed(side > 0 ? camX + VW + rand(40, 300) : camX - rand(40, 300), sidewalkY(), 'cop').dirX = -side;
      }
      break;
    case 'icecream': spawnTruck(); break;
    case 'policechase': spawnCruisers(elapsed > 120 ? 3 : 2); break;
  }
  if (E.dur) activeEvent = { key: k, t: E.dur, dur: E.dur };
  showBanner(E.name, E.desc, E.color, 2.6);
  sfx.fanfare();
}
function updateEvents(dt) {
  if (gs !== 'play') return;
  if (activeEvent) { activeEvent.t -= dt; if (activeEvent.t <= 0) activeEvent = null; }
  eventTimer -= dt;
  if (eventTimer <= 0 && !activeEvent) { startEvent(weighted(EVENTS, k => EVENTS[k].w)); eventTimer = rand(22, 32); }
  heartTimer -= dt;
  if (heartTimer <= 0) {
    heartTimer = rand(16, 24);
    if (player.hearts < MAX_HEARTS && items.filter(it => it.kind === 'heart').length < 2) {
      const side = chance(0.7) ? player.facing : -player.facing;
      dropHeart(player.x + side * rand(250, 600), rand(30, 430), 'heart', null);
    }
  }
  boxTimer -= dt;
  if (boxTimer <= 0) {
    if (items.filter(it => it.kind === 'box').length < 3) spawnBox();
    boxTimer = rand(9, 14) * boxIntervalMult();
  }
  const d = districtAt(player.x);
  if (d !== curDistrict) {
    curDistrict = d;
    missionEvent('district', 1, { district: d });
    if (!banner) showBanner(DISTRICTS[d].name, DISTRICTS[d].sub, '#ffffff', 2.2);
  }
}

// ---------- update: player ----------
function updatePlayer(dt) {
  const p = player;
  p.slapT = Math.max(0, p.slapT - dt);
  p.slapCd = Math.max(0, p.slapCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  const [ix, iy] = gs === 'play' ? getInput() : [0, 0];
  let vx = 0, vy = 0;
  const infinite = power.energy > 0;
  if (p.downT > 0) {
    if (gs === 'play') p.downT -= dt;
    p.lie = p.downT > 0.3 ? Math.min(1, p.lie + dt * 8) : Math.max(0, p.downT / 0.3);
    p.kvx *= Math.exp(-5 * dt);
    vx = p.kvx;
    p.sprinting = false;
    if (p.downT <= 0) { p.downT = 0; p.lie = 0; p.kvx = 0; }
  } else {
    const moving = ix !== 0 || iy !== 0;
    if (p.stamina <= 0.01 && !infinite) p.winded = true;
    if (p.winded && (p.stamina >= WINDED_RECOVER || infinite)) p.winded = false;
    const sprint = gs === 'play' && sprintHeld() && moving && !p.winded && (p.stamina > 0 || infinite);
    if (sprint && !p.sprinting) sfx.sprint();
    p.sprinting = sprint;
    p.burstT = Math.max(0, p.burstT - dt);
    const dogged = peds.some(q => q.type === 'dog' && q.state === 'latched');
    const boost = (power.skates > 0 ? 1.55 : 1) * (p.burstT > 0 ? 1 + 0.07 * lvl('burst') : 1) * (dogged ? 0.6 : 1)
      * (power.nitro > 0 ? 2 : 1) * (power.hawk > 0 ? 1.8 : 1) * (power.giant > 0 ? 1.25 : 1);
    const spd = (sprint ? SPRINT_SPEED : PLAYER_SPEED) * boost;
    vx = ix * spd; vy = iy * spd * 0.82;
    if (sprint && !infinite) p.stamina = Math.max(0, p.stamina - SPRINT_DRAIN * dt);
    if ((sprint || power.skates > 0) && Math.random() < 0.5) dust(p.x, p.y, 1);
    p.trailT -= dt;
    if (save.eq.trail !== 'trail_none' && moving && p.trailT <= 0) {
      p.trailT = 0.05;
      const tr = save.eq.trail;
      const col = tr === 'trail_flame' ? pick(['#ff9f1a', '#ff4757', '#ffd32a']) : tr === 'trail_rainbow' ? 'hsl(' + ((gameTime * 360) % 360) + ',95%,60%)' : pick(['#ffffff', '#ffeaa7', '#81ecec']);
      fx(tr === 'trail_sparkle' ? 'star' : 'trail', p.x - p.facing * 10 + rand(-5, 5), p.y + rand(-4, 4), rand(5, 25), { vz: tr === 'trail_flame' ? 60 : 10, life: 0.5, size: tr === 'trail_sparkle' ? 3 : 4.5, color: col });
    }
    if (ix !== 0 && p.slapT <= 0) p.facing = ix > 0 ? 1 : -1;
    if (power.rush > 0) { vx = p.rushDir * PLAYER_SPEED * 3; vy = iy * PLAYER_SPEED; p.facing = p.rushDir; dust(p.x, p.y, 2); }
    if (power.nitro > 0 && Math.random() < 0.8) fx('trail', p.x - p.facing * 14, p.y + rand(-5, 5), rand(10, 40), { vz: 30, life: 0.4, size: 5, color: pick(['#ff9f1a', '#ff4757', '#ffd32a']) });
  }
  if (!p.sprinting && p.stamina < STAMINA_NATURAL) p.stamina = Math.min(STAMINA_NATURAL, p.stamina + STAMINA_REGEN * dt);
  if (infinite) p.stamina = STAMINA_MAX;
  p.vx = vx; p.vy = vy;
  // giant mode grows you smoothly; hawk form lifts you into the air (and dips for swoops)
  p.size += ((power.giant > 0 ? 1.8 : 1) - p.size) * Math.min(1, dt * 6); p.r = 13 * p.size;
  const flyZ = power.hawk > 0 ? 95 - Math.max(0, p.swoopT || 0) * 140 : 0;
  p.z += (flyZ - p.z) * Math.min(1, dt * 5);
  if (power.hawk > 0) { p.x += vx * dt; p.y = clamp(p.y + vy * dt, Y_MIN, Y_MAX); if (Math.random() < 0.15) fx('feather', p.x + rand(-20, 20), p.y, p.z, { vx: rand(-40, 40), vz: rand(-20, 20), g: 40, life: 1, size: 3, color: '#c8a165' }); }
  else moveEntity(p, vx * dt, vy * dt);
  if (p.flying && power.hawk <= 0) { p.flying = false; hawkLanding(); }
  const sp = Math.hypot(vx, vy);
  p.moveAmt = p.downT > 0 ? 0 : Math.min(1, sp / 120);
  p.phase += dt * Math.min(sp, 300) / 16;
}

// ---------- update: NPCs ----------
function walkBehaviour(q, dt) {
  if (power.crowd > 0 && gs === 'play' && q.type !== 'dog') {
    const dx = player.x - q.x, dy = player.y - q.y, d = Math.hypot(dx, dy);
    if (d < 340 && d > 20) { q.facing = dx > 0 ? 1 : -1; if (!q.say && Math.random() < dt * 0.5) q.say = { text: pick(['Whoa?!', 'My feet!', 'Huh?!']), t: 0.9 }; return [dx / d * 150, dy / d * 150]; }
  }
  if (q.dodgeT > 0) { q.dodgeT -= dt; return [0, q.dodgeDir * 170]; }
  if (q.danceT > 0) { q.danceT -= dt; return [0, 0]; }
  if (q.shock > 0) { q.facing = player.x > q.x ? 1 : -1; return [0, 0]; }
  if (q.photoT > 0) {
    q.photoT -= dt;
    if (!q.flashed && q.photoT < 0.6) {
      q.flashed = true;
      fx('flash', q.x + q.facing * 18, q.y, 70, { life: 0.25, size: 18 });
      if (onScreen(q) && lastBubbleCount < 4 && !q.say) q.say = { text: '*click*', t: 1 };
    }
    return [0, 0];
  }
  if (q.mimeT > 0) { q.mimeT -= dt; return [0, 0]; }
  let vx = 0, vy = 0;
  if (q.walkSpeed > 0) {
    if (q.pause > 0) q.pause -= dt;
    else {
      if (!q.T.noPause && !q.marathon && Math.random() < dt * 0.08) {
        q.pause = rand(0.8, 2.2);
        if ((q.type === 'tourist' || q.type === 'influencer') && chance(0.7)) { q.photoT = 1.3; q.flashed = false; }
        if (q.type === 'mime' && chance(0.6)) q.mimeT = 2.2;
      }
      if (!q.marathon && Math.random() < dt * 0.05) q.dirX *= -1;
      if (Math.random() < dt * 0.15) q.targetY = sidewalkYNear(q.y);
      vx = q.dirX * q.walkSpeed * (q.happyT > 0 ? 1.4 : 1);
    }
  } else if (q.type === 'musician' && onScreen(q) && Math.random() < dt * 1.6) {
    fx('note', q.x + q.facing * 10, q.y, 60, { vx: rand(-15, 15), vz: 40, life: 1.4, size: 13, color: pick(['#2d3436', '#6c5ce7', '#e84393']) });
  }
  const onRoad = q.y > SW_TOP_END - 6 && q.y < ROAD_END + 10;
  if (q.targetY > SW_TOP_END - 10 && q.targetY < ROAD_END + 14) q.targetY = sidewalkYNear(q.y);
  const dy = q.targetY - q.y;
  vy = onRoad ? Math.sign(dy) * 95 : clamp(dy * 1.5, -40, 40);
  if (onRoad) vx *= 0.3;
  if (q.walkSpeed <= 0 && !onRoad) vy = 0;
  const sp = Math.hypot(vx, vy);
  if (sp > 1) { const [sx, sy] = steer(q, vx / sp, vy / sp); vx = sx * sp; vy = sy * sp; }
  if (vx > 5) q.facing = 1; else if (vx < -5) q.facing = -1;
  return [vx, vy];
}
function chaseBehaviour(q, dt) {
  if (gs !== 'play') { toWalk(q, true); return [0, 0]; }
  q.smokeT = Math.max(0, q.smokeT - dt);
  const lostTrack = (power.disguise > 0 || player.hidden || q.smokeT > 0) && !decoy;
  q.anger -= dt * (lostTrack ? 2 : 1);
  q.ramp = Math.min(1, q.ramp + dt * 1.1);
  let tx, ty;
  if (decoy) { tx = decoy.x; ty = decoy.y; }
  else if (lostTrack) {
    q.lostT = (q.lostT || 0) - dt;
    if (!q.lost || q.lostT <= 0) { q.lost = { x: q.x + rand(-200, 200), y: clamp(q.y + rand(-120, 120), Y_MIN, Y_MAX) }; q.lostT = rand(1, 2); }
    tx = q.lost.x; ty = q.lost.y;
    if (!q.say && Math.random() < dt * 0.4) say(q, 'lost');
  } else { tx = player.x + player.vx * 0.2; ty = player.y + player.vy * 0.2; }
  const dx = tx - q.x, dy = ty - q.y, d = Math.hypot(dx, dy) || 1;
  const [sx, sy] = steer(q, dx / d, dy / d);
  const spd = q.chaseSpeed * (0.55 + 0.45 * q.ramp) * (q.blockT > 0 ? 0.3 : 1) * (lostTrack ? 0.4 : 1);
  const vx = sx * spd, vy = sy * spd * 0.9;
  if (Math.abs(dx) > 4) q.facing = dx > 0 ? 1 : -1;
  if (decoy && Math.hypot(decoy.x - q.x, decoy.y - q.y) < q.r + 18) {
    q.state = 'revenge'; q.timer = 0.55; q.slapT = q.type === 'dog' ? 0 : 0.25; q.decoyHit = true;
    decoy.hits++; decoy.wob = 0.3; decoy.marked = true;
    popup(decoy.x, decoy.y, 84, q.type === 'dog' ? 'CHOMP!' : 'SLAP!', '#ffdd59', 16, 0.6);
    sfx.slapSoft();
    return [0, 0];
  }
  if (!decoy && !lostTrack) {
    const pd = Math.hypot(player.x - q.x, player.y - q.y);
    q.closeCd = Math.max(0, (q.closeCd || 0) - dt);
    if (pd < q.r + player.r + CATCH_PAD + 14 && player.invuln <= 0) q.nearT = 0.8;
    else if (q.nearT > 0) { q.nearT -= dt; if (pd > 80 && q.closeCd <= 0) { q.nearT = 0; q.closeCd = 4; closeCall(player.x, player.y); } }
    if (pd < q.r + player.r + CATCH_PAD && hurtPlayer(q)) {
      q.nearT = 0;
      q.state = 'revenge'; q.timer = 0.7; q.slapT = q.type === 'dog' ? 0 : 0.25;
      return [0, 0];
    }
  }
  if (q.state === 'chase') {
    if (q.anger <= 0) { q.state = 'tired'; q.timer = 2.2; addEscape(); if (chance(0.6)) say(q, 'tired', true); }
    else if (Math.abs(q.x - player.x) > 1500) { toWalk(q, false); addEscape(); }
  }
  return [vx, vy];
}
function distractedBehaviour(q, dt) {
  q.timer -= dt;
  if (q.timer <= 0) { toWalk(q, true); return [0, 0]; }
  const g = q.goal;
  const dx = g.x - q.x, dy = g.y - q.y, d = Math.hypot(dx, dy);
  if (d < 10) {
    if (q.distractKind === 'money' && Math.random() < dt * 2) fx('cash', q.x + rand(-10, 10), q.y, 30, { vz: 60, g: 100, life: 0.6, size: 6, color: '#2ecc71' });
    if (truck) q.facing = truck.x > q.x ? 1 : -1;
    return [0, 0];
  }
  const sp = Math.min(Math.max(q.walkSpeed, 70) * 1.6, d * 4);
  const [sx, sy] = steer(q, dx / d, dy / d);
  if (Math.abs(dx) > 3) q.facing = dx > 0 ? 1 : -1;
  return [sx * sp, sy * sp];
}
// ---------- dogs: only defend their owner, never knock you down ----------
const DOG_SPEED = BASE_SPEED * 1.9; // faster than your walk, slower than your sprint
let dogTipShown = false;
function nearbyDecoyFor(d) { // someone else close to the dog that it would rather go after
  for (const o of peds) {
    if (o === d || o.type === 'dog' || o === d.owner || (o.state !== 'walk' && o.state !== 'chase')) continue;
    if (Math.hypot(o.x - d.x, o.y - d.y) < 46) return o;
  }
  return null;
}
function houndOnto(d, o) {
  const wasOnYou = d.state === 'chase' || d.state === 'latched';
  d.state = 'hound'; d.target = o; d.timer = 4;
  d.say = { text: 'WOOF!', t: 1 }; sfx.bark();
  if (wasOnYou && gs === 'play') { addEscape(); const got = addScore(100); popup(d.x, d.y, 70, 'DOG DISTRACTED! +' + got, '#fdcb6e', 15, 1.1); }
}
function dogChase(d, dt) {
  if (gs !== 'play') { toWalk(d, false); return [0, 0]; }
  d.huntT -= dt; d.smokeT = Math.max(0, d.smokeT - dt);
  d.anger = d.huntT; d.angerMax = 20;
  if (d.huntT <= 0 || Math.abs(d.x - player.x) > 1500 || ((power.disguise > 0 || player.hidden || d.smokeT > 0) && !decoy)) { toWalk(d, false); return [0, 0]; }
  const o = nearbyDecoyFor(d);
  if (o) { houndOnto(d, o); return [0, 0]; }
  const tx = decoy ? decoy.x : player.x, ty = decoy ? decoy.y : player.y;
  const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 1;
  d.ramp = Math.min(1, d.ramp + dt * 1.5);
  if (Math.abs(dx) > 3) d.facing = dx > 0 ? 1 : -1;
  if (dist < d.r + 18) {
    if (decoy) { popup(decoy.x, decoy.y, 84, 'CHOMP!', '#ffdd59', 16, 0.6); decoy.wob = 0.3; toWalk(d, false); return [0, 0]; }
    if (power.shield > 0 || untouchable()) { popup(player.x, player.y, 100, power.shield > 0 ? 'SHIELD!' : 'NOPE!', '#48dbfb', 16, 0.9); toWalk(d, false); return [0, 0]; }
    if (player.downT <= 0) {
      d.state = 'latched'; d.timer = 12;
      d.say = { text: 'GRRR!', t: 1.2 }; sfx.bark();
      popup(player.x, player.y, 112, dogTipShown ? 'DOG ON YOUR PANTS!' : 'DOG ON YOUR PANTS! Run past someone to shake it off', '#fdcb6e', dogTipShown ? 16 : 13, dogTipShown ? 1.0 : 2.2);
      dogTipShown = true;
      return [0, 0];
    }
  }
  const [sx, sy] = steer(d, dx / dist, dy / dist);
  const spd = DOG_SPEED * (0.6 + 0.4 * d.ramp);
  return [sx * spd, sy * spd];
}
function updateDog(d, dt) {
  switch (d.state) {
    case 'alert': // warning growl before the chase starts
      d.timer -= dt;
      d.facing = player.x > d.x ? 1 : -1;
      if (d.timer <= 0) { d.state = 'chase'; d.huntT = 20; d.ramp = 0.3; d.smokeT = 0; }
      return [0, 0];
    case 'chase': return dogChase(d, dt);
    case 'latched': {
      d.timer -= dt;
      if (gs !== 'play' || player.downT > 0 || d.timer <= 0 || untouchable()) { toWalk(d, false); return [0, 0]; }
      if (Math.random() < dt * 1.5) d.say = { text: pick(['GRRR!', 'WOOF!', '*tug*']), t: 0.8 };
      // pass close to someone else and the dog lets go of you for them
      for (const o of peds) {
        if (o === d || o.type === 'dog' || o === d.owner || (o.state !== 'walk' && o.state !== 'chase')) continue;
        if (Math.hypot(o.x - player.x, o.y - player.y) < 58) { houndOnto(d, o); return [0, 0]; }
      }
      const tx = player.x - player.facing * 20, ty = player.y + 5;
      d.facing = player.facing;
      return [(tx - d.x) * 14, (ty - d.y) * 14];
    }
    case 'hound': { // chasing someone else now
      d.timer -= dt;
      const t = d.target;
      if (!t || !peds.includes(t) || isGone(t) || isFlat(t) || d.timer <= 0) { toWalk(d, false); return [0, 0]; }
      const dx = t.x - d.x, dy = t.y - d.y, dist = Math.hypot(dx, dy) || 1;
      if (Math.abs(dx) > 3) d.facing = dx > 0 ? 1 : -1;
      if (dist < d.r + t.r + 4) {
        const wasChase = t.state === 'chase';
        knockDown(t, d.facing, 200, 1.4);
        t.angryAfter = wasChase;
        t.say = { text: pick(['AAAH!', 'BAD DOG!', 'NOT MY ANKLES!']), t: 1.2 };
        sfx.bark();
        if (wasChase && gs === 'play') { const got = addScore(150); popup(t.x, t.y, 96, 'DOG TACKLE! +' + got, '#fdcb6e', 15, 1.1); }
        toWalk(d, false);
        return [0, 0];
      }
      return [dx / dist * DOG_SPEED, dy / dist * DOG_SPEED];
    }
    case 'revenge':
      d.timer -= dt;
      if (Math.random() < dt * 2) say(d, 'chase');
      if (d.timer <= 0) {
        if (d.decoyHit && decoy && gs === 'play' && d.anger > 0) { d.state = 'chase'; d.decoyHit = false; }
        else toWalk(d, false);
      }
      return [0, 0];
    case 'frozen':
      d.timer -= dt; if (d.timer <= 0) toWalk(d, false); return [0, 0];
    case 'walk': break;
    default: toWalk(d, false); return [0, 0];
  }
  const o = d.owner;
  if (o && !isGone(o)) {
    const tx = o.x - o.facing * 28, ty = o.y + 6;
    const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
    if (dist > 8) {
      const sp = Math.min(170, dist * 2.5);
      if (dx > 3) d.facing = 1; else if (dx < -3) d.facing = -1;
      return [dx / dist * sp, dy / dist * sp];
    }
    d.facing = o.facing;
    return [0, 0];
  }
  if (Math.random() < dt * 0.1) d.dirX *= -1;
  d.facing = d.dirX;
  return [d.dirX * 60, clamp(d.targetY - d.y, -40, 40)];
}
function updatePeds(dt) {
  for (let i = peds.length - 1; i >= 0; i--) {
    const q = peds[i];
    q.slapT = Math.max(0, q.slapT - dt);
    q.blockT = Math.max(0, q.blockT - dt);
    q.shock = Math.max(0, q.shock - dt);
    q.happyT = Math.max(0, q.happyT - dt);
    q.creamT = Math.max(0, q.creamT - dt);
    if (q.say) { q.say.t -= dt; if (q.say.t <= 0) q.say = null; }
    if (q.state === 'abducted') continue;
    if (q.state === 'fell') {
      q.timer -= dt; q.z -= 140 * dt;
      if (q.timer <= 0) removePed(q);
      continue;
    }
    let vx = 0, vy = 0;
    if (q.type === 'dog') [vx, vy] = updateDog(q, dt);
    else switch (q.state) {
      case 'walk': [vx, vy] = walkBehaviour(q, dt); break;
      case 'down':
        q.timer -= dt;
        q.lie = Math.min(1, q.lie + dt * 7);
        q.kvx *= Math.exp(-5 * dt); q.kvy *= Math.exp(-5 * dt);
        vx = q.kvx; vy = q.kvy;
        if (q.timer <= 0) { q.state = 'getup'; q.timer = 0.45; }
        break;
      case 'getup':
        q.timer -= dt;
        q.lie = Math.max(0, q.timer / 0.45);
        if (q.timer <= 0) {
          q.lie = 0;
          if (gs !== 'play' || !q.angryAfter) toWalk(q, gs !== 'play');
          else {
            q.state = 'chase'; q.anger = q.angerMax; q.ramp = 0;
            if (onScreen(q)) { sfx.angry(); if (chance(0.5)) say(q, 'chase'); }
          }
        }
        break;
      case 'chase': [vx, vy] = chaseBehaviour(q, dt); break;
      case 'distracted': [vx, vy] = distractedBehaviour(q, dt); break;
      case 'frozen':
        q.timer -= dt;
        if (q.timer <= 0) { if (gs === 'play' && q.anger > 0) { q.state = 'chase'; q.ramp = 0; } else toWalk(q, false); }
        break;
      case 'tired':
        q.timer -= dt;
        if (Math.random() < dt * 3) fx('drop', q.x + rand(-8, 8), q.y, 80 * q.size, { vx: rand(-30, 30), vz: rand(40, 90), g: 300, life: 0.5, size: 2.5, color: '#74b9ff' });
        if (q.timer <= 0) toWalk(q, false);
        break;
      case 'revenge':
        q.timer -= dt;
        if (!q.decoyHit) q.facing = player.x > q.x ? 1 : -1;
        if (q.timer <= 0) {
          if (q.decoyHit && gs === 'play' && q.anger > 0) { q.decoyHit = false; q.state = 'chase'; }
          else toWalk(q, true);
        }
        break;
    }
    q.vx = vx; q.vy = vy;
    moveEntity(q, vx * dt, vy * dt);
    const sp = Math.hypot(vx, vy);
    q.moveAmt = isFlat(q) || q.state === 'frozen' ? 0 : Math.min(1, sp / 90);
    q.phase += dt * Math.min(sp, 320) / 15;
    if (q.state === 'walk' && !q.say && lastBubbleCount < 3 && Math.random() < dt * 0.05 && onScreen(q)) say(q, 'idle');
  }
}
function managePeds() {
  for (let i = peds.length - 1; i >= 0; i--) {
    const q = peds[i];
    if (Math.abs(q.x - player.x) > 1900 && q.state !== 'chase' && !isGone(q)) removePed(q);
  }
  const target = Math.round(Math.min(34, 16 + Math.floor(elapsed / 12)) * Q.crowd);
  let calm = 0;
  for (const q of peds) if (q.state === 'walk' && q.type !== 'dog' && Math.abs(q.x - player.x) < 1300) calm++;
  if (calm < target && Math.random() < 0.25) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? camX - rand(80, 500) : camX + VW + rand(80, 500);
    addPed(x, sidewalkY(), randTypeAt(x));
  }
}

// ---------- traffic ----------
const CAR_COLORS = ['#e74c3c', '#2980b9', '#ecf0f1', '#2c3e50', '#16a085', '#8e44ad', '#d35400', '#7f8c8d'];
function spawnCar(L) {
  if (activeEvent && activeEvent.key === 'streetrace' && chance(0.75)) { // low, loud and very fast
    cars.push({ x: L.dir > 0 ? camX - 520 : camX + VW + 520, y: L.y, dir: L.dir, speed: rand(950, 1150), len: 140, depth: 56, h: 36, sports: true,
      color: pick(['#ff4757', '#ffd32a', '#2ed573', '#1e90ff', '#ff6b81', '#ffa502']), honked: false, wheel: 0 });
    return;
  }
  const bus = Math.random() < 0.15, taxi = !bus && Math.random() < 0.2;
  const len = bus ? 250 : rand(130, 165);
  cars.push({
    x: L.dir > 0 ? camX - 320 - len / 2 : camX + VW + 320 + len / 2, y: L.y, dir: L.dir,
    speed: bus ? rand(380, 460) : rand(430, 660), len, depth: 56, h: bus ? 82 : 46,
    bus, color: bus ? '#f39c12' : taxi ? '#f9ca24' : pick(CAR_COLORS), taxi, honked: false, wheel: 0,
  });
}
function updateCars(dt) {
  if (gs === 'play') {
    const ev = activeEvent && activeEvent.key, rush = ev === 'rushhour' ? 3 : ev === 'streetrace' ? 2.2 : 1;
    for (const L of LANES) {
      L.timer -= dt * rush;
      if (L.timer <= 0) { spawnCar(L); L.timer = rand(2.6, 6.5) * Math.max(0.55, 1 - elapsed / 240); }
    }
  }
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.wrecked) { c.wreckT -= dt; c.speed *= Math.exp(-4 * dt); if (Math.random() < dt * 5) fx('smoke', c.x, c.y, 50, { vz: 40, life: 1.2, size: 12, color: '#2d3436' }); if (c.wreckT <= 0) { cars.splice(i, 1); continue; } }
    c.x += c.dir * c.speed * dt;
    c.wheel += c.speed * dt / 11;
    if (!c.honked && gs === 'play') {
      const ahead = (player.x - c.x) * c.dir;
      if (ahead > 0 && ahead < 450 && Math.abs(player.y - c.y) < c.depth / 2 + 30) { c.honked = true; sfx.horn(); }
    }
    const hx = c.len / 2, hy = c.depth / 2;
    if (!c.passed && (player.x - c.x) * c.dir < -hx) { c.passed = true; const dy = Math.abs(player.y - c.y); if (dy >= hy + 4 && dy < hy + 42 && player.invuln <= 0) closeCall(player.x, player.y); }
    if (!c.wrecked && Math.abs(player.x - c.x) < hx + player.r && Math.abs(player.y - c.y) < hy + 4) {
      if (hurtPlayer(c)) {
        player.fallDir = c.dir; player.kvx = c.dir * 650; sfx.crash();
        popup(player.x, player.y, 130, 'HONK!', '#feca57', 24, 1.0);
      }
    }
    for (const q of peds) {
      if (c.wrecked || q.type === 'dog' || isFlat(q) || isGone(q) || q.state === 'frozen') continue;
      if (Math.abs(q.x - c.x) < hx + q.r && Math.abs(q.y - c.y) < hy + 4) {
        const wasChase = q.state === 'chase';
        const keep = q.anger;
        knockDown(q, c.dir, 700, 2.3);
        q.angryAfter = wasChase;
        if (wasChase) q.angerMax = Math.max(3, keep) + 2;
        sfx.crash();
        if (wasChase && gs === 'play') {
          const pts = addScore(250); carHits++; missionEvent('traffic');
          popup(q.x, q.y, 100, 'BEEP BEEP! +' + pts, '#48dbfb', 22, 1.3, true);
        }
      }
    }
    if ((c.dir > 0 && c.x > camX + VW + 1200) || (c.dir < 0 && c.x < camX - 1200)) cars.splice(i, 1);
  }
}
function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt;
    if (p.kind === 'dust' || p.kind === 'smoke') { p.size += dt * 14; p.vx *= Math.exp(-3 * dt); }
    if (p.kind === 'ring') p.r += p.grow * dt;
    if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life -= dt; p.z += 40 * dt;
    if (p.life <= 0) pops.splice(i, 1);
  }
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
}

function update(dt) {
  gameTime += dt;
  if (gs === 'paused') return;
  if (hitStop > 0) { hitStop -= dt; return; }
  if (gs === 'dying') dt *= 0.6;
  if (gs === 'play') elapsed += dt;
  refreshObs();
  updatePlayer(dt);
  if (gs === 'play') trySlap(true); // auto-slap anyone you run into
  updatePeds(dt);
  if (gs !== 'title') { updateCars(dt); updateRiders(dt); updateCruisers(dt); updateItems(dt); updatePowers(dt); updateUfo(dt); updateStreet(dt); updateEvents(dt); updateMeta(dt); }
  separate();
  managePeds();
  updateFx(dt);
  // camera follow lives in the game logic so spawning works even if nothing is drawn
  const ctx0 = player.x + player.facing * 50;
  if (Math.abs(ctx0 - camCX) > 1500) camCX = ctx0; else camCX += (ctx0 - camCX) * Math.min(1, dt * 4);
  camX = camCX - VW / 2;
  shake = Math.max(0, shake - dt * 40);
  camPunch = Math.max(0, camPunch - dt * 0.3);
  if (combo > 0 && elapsed - lastSlapT > COMBO_WINDOW) combo = 0;
  if (gs === 'dying') { dyingT -= dt; if (dyingT <= 0) { gs = 'over'; overT = 0; } }
  else if (gs === 'over') overT += dt;
}

// ---------- e-bikes & scooters: fast sidewalk hazards ----------
const RIDER_LANES = [64, 392];
function spawnRider() {
  const dir = chance(0.5) ? 1 : -1, kind = chance(0.6) ? 'ebike' : 'scooter';
  riders.push({
    x: dir > 0 ? camX - 260 : camX + VW + 260, y: pick(RIDER_LANES) + rand(-6, 6), dir, kind,
    speed: kind === 'ebike' ? rand(330, 420) : rand(260, 330), rang: false, passed: false, wheel: 0,
    color: pick(['#e74c3c', '#00b894', '#fdcb6e', '#0984e3', '#e056fd']), skin: pick(SKINS),
  });
}
function updateRiders(dt) {
  if (gs === 'play') {
    const m = { downtown: 0.6, shops: 0.85, park: 1, residential: 1.3 }[curDistrict] || 1;
    riderTimer -= dt;
    if (riderTimer <= 0) { spawnRider(); riderTimer = rand(5, 10) * m * Math.max(0.6, 1 - elapsed / 300); }
  }
  const p = player;
  for (let i = riders.length - 1; i >= 0; i--) {
    const r = riders[i];
    r.x += r.dir * r.speed * dt; r.wheel += r.speed * dt / 9;
    const ahead = (p.x - r.x) * r.dir, dy = Math.abs(p.y - r.y);
    if (!r.rang && ahead > 0 && ahead < 520 && dy < 60 && gs === 'play') { r.rang = true; sfx.bell(); }
    if (!r.passed && ahead < -20) { r.passed = true; if (dy >= 16 && dy < 50 && p.invuln <= 0) closeCall(p.x, p.y); }
    if (Math.abs(p.x - r.x) < 24 && dy < 16 && hurtPlayer(r)) {
      p.fallDir = r.dir; p.kvx = r.dir * 420; sfx.crash();
      popup(p.x, p.y, 130, 'BIKE!', '#feca57', 22, 1.0);
    }
    for (const q of peds) {
      if (q.type === 'dog' || isFlat(q) || isGone(q) || q.state === 'frozen') continue;
      const qa = (q.x - r.x) * r.dir, qdy = Math.abs(q.y - r.y);
      if (q.state === 'walk' && qa > 0 && qa < 170 && qdy < 22 && !(q.dodgeT > 0)) { q.dodgeT = 0.45; q.dodgeDir = q.y >= r.y ? 1 : -1; }
      if (Math.abs(q.x - r.x) < 22 + q.r && qdy < 14) {
        const wasChase = q.state === 'chase', keep = q.anger;
        knockDown(q, r.dir, 480, 1.7);
        q.angryAfter = wasChase;
        sfx.crash();
        if (wasChase && gs === 'play') {
          q.angerMax = Math.max(3, keep) + 1;
          missionEvent('bike');
          const pts = addScore(200); popup(q.x, q.y, 100, 'WIPEOUT! +' + pts, '#fdcb6e', 18, 1.1, true);
        }
      }
    }
    if ((r.dir > 0 && r.x > camX + VW + 700) || (r.dir < 0 && r.x < camX - 700)) riders.splice(i, 1);
  }
}
// ---------- coins, toasts, announcer, background mission ticks ----------
function spawnCoinTrail() {
  const side = chance(0.75) ? player.facing : -player.facing;
  const x0 = player.x + side * rand(220, 520);
  const lane = chance(0.35) ? rand(150, 300) : sidewalkY(); // road trails are riskier
  const n = 5 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) items.push({ kind: 'coin', x: x0 + side * i * 38, y: clamp(lane + Math.sin(i * 0.8) * 12, Y_MIN + 6, Y_MAX - 6), z: 0, vz: 0, life: 22, value: lane > SW_TOP_END && lane < ROAD_END ? 3 : 2 });
}
function updateMeta(dt) {
  for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].t -= dt; if (toasts[i].t <= 0) toasts.splice(i, 1); }
  if (announce) { announce.t -= dt; if (announce.t <= 0) announce = null; }
  if (gs !== 'play') return;
  coinTimer -= dt;
  if (coinTimer <= 0) { coinTimer = rand(7, 12); if (items.filter(it => it.kind === 'coin').length < 14) spawnCoinTrail(); }
  missionTick -= dt;
  if (missionTick <= 0) {
    missionTick = 1;
    let nc = 0; for (const q of peds) if (q.state === 'chase') nc++;
    missionEvent('heat', nc); missionEvent('time', Math.floor(elapsed));
  }
}

// ---------- police cruisers: fast, but they turn wide — wreck them in traffic ----------
const COP_VMAX = 390, COP_TURN = 2.4, COP_R = 30;
function spawnCruisers(n) {
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0, L = LANES[left ? 0 : 1];
    cruisers.push({ x: left ? camX - 300 - i * 120 : camX + VW + 300 + i * 120, y: L.y, h: left ? 0 : Math.PI, v: 260, state: 'chase', t: 0, life: 28, spin: 0, wheel: 0 });
  }
  sfx.siren();
}
function wreckCruiser(c, label, pts) {
  if (c.state === 'wrecked') return;
  c.state = 'wrecked'; c.t = 3; c.spin = rand(-7, 7); c.v *= 0.5;
  sfx.bigcrash(); shake = Math.max(shake, 14); camPunch = Math.max(camPunch, 0.06);
  for (let i = 0; i < 14; i++) fx('smoke', c.x + rand(-20, 20), c.y + rand(-10, 10), rand(10, 50), { vx: rand(-60, 60), vz: rand(20, 70), life: rand(0.8, 1.6), size: rand(10, 20), color: '#636e72' });
  confetti(c.x, c.y, 40, 8);
  if (gs === 'play') {
    const got = addScore(pts); addCoins(10); addEscape(); missionEvent('copcrash');
    popup(c.x, c.y, 110, label + ' +' + got, '#48dbfb', 20, 1.4, true);
  }
}
function updateCruisers(dt) {
  if (!cruisers.length) return;
  const p = player;
  p.sirenT = (p.sirenT || 0) - dt;
  if (p.sirenT <= 0 && cruisers.some(c => c.state === 'chase')) { p.sirenT = 0.8; sfx.siren(); }
  for (let i = cruisers.length - 1; i >= 0; i--) {
    const c = cruisers[i];
    c.wheel += c.v * dt / 11;
    if (c.state === 'wrecked') {
      c.t -= dt; c.v *= Math.exp(-3 * dt); c.h += c.spin * dt; c.spin *= Math.exp(-2 * dt);
      c.x += Math.cos(c.h) * c.v * dt; c.y = clamp(c.y + Math.sin(c.h) * c.v * dt, 20, 445);
      if (Math.random() < dt * 6) fx('smoke', c.x, c.y, 40, { vz: 40, life: 1.2, size: 12, color: '#2d3436' });
      if (c.t <= 0) cruisers.splice(i, 1);
      continue;
    }
    c.life -= dt;
    if (c.state === 'stunned') { c.t -= dt; c.v *= Math.exp(-4 * dt); if (c.t <= 0) c.state = 'chase'; }
    else {
      const leaving = c.life <= 0 || gs !== 'play';
      if (leaving && !c.left) { c.left = true; popup(c.x, c.y, 90, 'THE COPS GAVE UP', '#74b9ff', 14, 1.2); }
      const lost = power.disguise > 0 || p.hidden;
      // aim where you're heading; when leaving, drive off the nearest edge of the screen
      const tx = leaving ? c.x + (c.x < p.x ? -2000 : 2000) : p.x + p.vx * 0.35, ty = leaving ? (c.y < CENTER_LINE ? 172 : 280) : p.y + p.vy * 0.35;
      const want = lost ? c.h : Math.atan2(ty - c.y, tx - c.x);
      let dA = ((want - c.h + Math.PI) % TAU + TAU) % TAU - Math.PI;
      // overshot you? brake hard and spin round tightly instead of cruising away
      const behind = Math.abs(dA) > 1.2;
      const turn = COP_TURN + (1 - c.v / COP_VMAX) * 4;
      c.h += clamp(dA, -turn * dt, turn * dt);
      if (behind) c.v = Math.max(110, c.v - 700 * dt);
      else c.v = Math.min(COP_VMAX, c.v + 320 * dt);
    }
    c.x += Math.cos(c.h) * c.v * dt;
    const ny = c.y + Math.sin(c.h) * c.v * dt;
    if (ny < 22 || ny > 442) c.v *= 0.97; // scraping along the buildings / kerb
    c.y = clamp(ny, 22, 442);
    if (c.life <= -6 || Math.abs(c.x - p.x) > 2600) { cruisers.splice(i, 1); continue; }
    // hits you
    if (c.state === 'chase' && Math.hypot(p.x - c.x, p.y - c.y) < COP_R + p.r && hurtPlayer(c)) {
      c.state = 'stunned'; c.t = 1.2; p.fallDir = Math.cos(c.h) >= 0 ? 1 : -1; p.kvx = p.fallDir * 420;
      popup(p.x, p.y, 130, 'BUSTED BY A COP CAR!', '#4a69bd', 16, 1.1);
    }
    // bowls over pedestrians
    for (const q of peds) {
      if (q.type === 'dog' || isFlat(q) || isGone(q)) continue;
      if (Math.hypot(q.x - c.x, q.y - c.y) < COP_R + q.r) { const wasChase = q.state === 'chase'; knockDown(q, Math.cos(c.h) >= 0 ? 1 : -1, 500, 1.6); q.angryAfter = wasChase; }
    }
    // crashes: lamp posts, hydrants, benches...
    for (const o of activeObs) {
      if (Math.abs(o.x - c.x) > o.w / 2 + COP_R || Math.abs(o.y - c.y) > o.h / 2 + COP_R) continue;
      const cx = clamp(c.x, o.x - o.w / 2, o.x + o.w / 2), cy = clamp(c.y, o.y - o.h / 2, o.y + o.h / 2);
      if (Math.hypot(c.x - cx, c.y - cy) < COP_R) { wreckCruiser(c, { lamp: 'LAMP POST!', hydrant: 'HYDRANT!', bench: 'BENCH CRASH!', trash: 'TRASHED!', truck: 'ICE CREAM CRASH!' }[o.kind] || 'CRASH!', 400); break; }
    }
    if (c.state === 'wrecked') continue;
    // ...traffic...
    for (const car of cars) {
      if (car.wrecked) continue;
      if (Math.abs(car.x - c.x) < car.len / 2 + COP_R && Math.abs(car.y - c.y) < car.depth / 2 + COP_R * 0.6) {
        car.wrecked = true; car.wreckT = 3;
        wreckCruiser(c, car.bus ? 'BUS CRASH!' : 'CAR CRASH!', 500);
        break;
      }
    }
    if (c.state === 'wrecked') continue;
    // ...and each other
    for (const o of cruisers) {
      if (o === c || o.state === 'wrecked') continue;
      if (Math.hypot(o.x - c.x, o.y - c.y) < COP_R * 2) { wreckCruiser(c, 'PILE-UP!', 800); wreckCruiser(o, 'PILE-UP!', 0); break; }
    }
  }
}
