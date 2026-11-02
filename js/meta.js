'use strict';
// =====================================================================
//  Meta-progression: coins, shop upgrades, cosmetics, background missions
//  and the Slap Book. Everything is saved on the device (localStorage).
// =====================================================================

// ---------- save ----------
const SAVE_KEY = 'slaprun_save_v1';
function defaultSave() {
  return {
    coins: 0, up: {},
    owned: { hat_red: true, shirt_yellow: true, trail_none: true, glove_none: true },
    eq: { hat: 'hat_red', shirt: 'shirt_yellow', trail: 'trail_none', glove: 'glove_none' },
    book: {}, missions: [], done: 0,
    rec: { combo: 0, time: 0, slaps: 0, escapes: 0, score: 0 },
    stats: { runs: 0, slaps: 0, escapes: 0, coins: 0, time: 0, close: 0, traffic: 0, boxes: 0, xp: 0 },
    music: true,
  };
}
// ---------- player profiles (device-based, no login) ----------
const PROFILES_KEY = 'slaprun_profiles', MAX_PROFILES = 6;
const PROFILE_COLORS = ['#ffb703', '#ff6b6b', '#48dbfb', '#7bed9f', '#e056fd', '#ff9f43'];
const saveKeyFor = id => SAVE_KEY + '_' + id;
const profiles = (() => {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PROFILES_KEY)); } catch (e) { }
  if (!p || !Array.isArray(p.list) || !p.list.length) {
    p = { list: [{ id: 'p1', name: 'Player 1', color: PROFILE_COLORS[0] }], current: 'p1' };
    try { // carry over progress saved before profiles existed
      const legacy = localStorage.getItem(SAVE_KEY);
      if (legacy && !localStorage.getItem(saveKeyFor('p1'))) localStorage.setItem(saveKeyFor('p1'), legacy);
      localStorage.setItem(PROFILES_KEY, JSON.stringify(p));
    } catch (e) { }
  }
  if (!p.list.some(x => x.id === p.current)) p.current = p.list[0].id;
  return p;
})();
function persistProfiles() { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch (e) { } }
const currentProfile = () => profiles.list.find(x => x.id === profiles.current);
function mergeSave(s) {
  const d = defaultSave();
  if (s) for (const k in d) if (s[k] !== undefined) d[k] = (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) ? Object.assign(d[k], s[k]) : s[k];
  return d;
}
function readSave(id) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(saveKeyFor(id))); } catch (e) { }
  const d = mergeSave(s);
  if (id === 'p1') { try { d.rec.score = Math.max(d.rec.score || 0, +localStorage.getItem('slaprun_best') || 0); } catch (e) { } }
  return d;
}
const save = readSave(profiles.current);
best = save.rec.score || 0;
function persist() { try { localStorage.setItem(saveKeyFor(profiles.current), JSON.stringify(save)); } catch (e) { } }
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---------- toasts: small, non-blocking notes at the side of the screen ----------
const toasts = [];
function toast(text, color = '#ffffff') {
  toasts.push({ text, color, t: 3.4 });
  if (toasts.length > 4) toasts.shift();
  sfx.ding();
}

// ---------- shop: upgrades ----------
const UPGRADES = [
  { id: 'lungs',     tab: 'SKILLS', name: 'Big Lungs',       desc: '+15% sprint fuel per level',            max: 5, base: 60,  icon: 'energy' },
  { id: 'recover',   tab: 'SKILLS', name: 'Fast Recovery',   desc: '+15% sprint recharge per level',        max: 5, base: 50,  icon: 'energy' },
  { id: 'burst',     tab: 'SKILLS', name: 'Hit & Run',       desc: 'Speed burst right after every slap',    max: 5, base: 80,  icon: 'skates' },
  { id: 'skin',      tab: 'SKILLS', name: 'Thick Skin',      desc: '+1 max heart per level',                max: 3, base: 160, icon: 'heart' },
  { id: 'gloves',    tab: 'GEAR',   name: 'Slap Gloves',     desc: 'Longer reach and faster slaps',         max: 5, base: 70,  icon: 'mega' },
  { id: 'sneakers',  tab: 'GEAR',   name: 'Sneakers',        desc: '+3% running speed per level',           max: 4, base: 90,  icon: 'skates' },
  { id: 'backpack',  tab: 'GEAR',   name: 'Bigger Backpack', desc: '+1 item slot per level',                max: 2, base: 220, icon: 'box' },
  { id: 'magnet',    tab: 'GEAR',   name: 'Coin Magnet',     desc: 'Pulls in coins and hearts from afar',   max: 4, base: 60,  icon: 'coin' },
  { id: 'lucky',     tab: 'PERKS',  name: 'Lucky Finder',    desc: 'Mystery boxes appear more often',       max: 4, base: 80,  icon: 'box' },
  { id: 'headstart', tab: 'PERKS',  name: 'Head Start',      desc: 'Begin every run holding a random item', max: 1, base: 260, icon: 'decoy' },
  { id: 'pockets',   tab: 'PERKS',  name: 'Deep Pockets',    desc: '+10% coins from everything per level',  max: 5, base: 100, icon: 'cash' },
];
const lvl = id => save.up[id] || 0;
const upCost = u => Math.round(u.base * Math.pow(1.65, lvl(u.id)));
function buyUpgrade(u) {
  if (lvl(u.id) >= u.max) return false;
  const c = upCost(u);
  if (save.coins < c) { sfx.whiff(); return false; }
  save.coins -= c; save.up[u.id] = lvl(u.id) + 1;
  persist(); sfx.box();
  applyUpgrades();
  return true;
}
function applyUpgrades() {
  MAX_HEARTS = 8 + lvl('skin');
  STAMINA_NATURAL = Math.round(100 * (1 + 0.15 * lvl('lungs')));
  STAMINA_MAX = STAMINA_NATURAL * 2;
  STAMINA_REGEN = 22 * (1 + 0.15 * lvl('recover'));
  SLAP_REACH = 52 + 6 * lvl('gloves') + (save.eq.glove === 'glove_gold' ? 6 : 0);
  SLAP_CD = 0.4 * (1 - 0.06 * lvl('gloves'));
  PLAYER_SPEED = PLAYER_BASE_SPEED * (1 + 0.03 * lvl('sneakers'));
  SPRINT_SPEED = PLAYER_SPRINT_SPEED * (1 + 0.03 * lvl('sneakers'));
  MAX_ITEMS = 3 + lvl('backpack');
}
const magnetRange = () => 34 + 30 * lvl('magnet');
const boxIntervalMult = () => 1 - 0.1 * lvl('lucky');

// ---------- shop: style ----------
const COSMETICS = [
  { id: 'hat_red',      slot: 'hat',   name: 'Red Cap',         cost: 0,   look: { hairStyle: 'cap', hat: '#e63946' } },
  { id: 'hat_blue',     slot: 'hat',   name: 'Blue Cap',        cost: 60,  look: { hairStyle: 'cap', hat: '#0984e3' } },
  { id: 'hat_black',    slot: 'hat',   name: 'Black Cap',       cost: 60,  look: { hairStyle: 'cap', hat: '#2d3436' } },
  { id: 'hat_beanie',   slot: 'hat',   name: 'Pink Beanie',     cost: 90,  look: { hairStyle: 'beanie', hat: '#fd79a8' } },
  { id: 'hat_cowboy',   slot: 'hat',   name: 'Cowboy Hat',      cost: 180, look: { hairStyle: 'cowboy', hat: '#8d6e63' } },
  { id: 'hat_tophat',   slot: 'hat',   name: 'Top Hat',         cost: 260, look: { hairStyle: 'tophat', hat: '#1e1e1e' } },
  { id: 'hat_crown',    slot: 'hat',   name: 'Slap King Crown', cost: 0, unlock: 8,  look: { hairStyle: 'crown', hat: '#f1c40f' } },
  { id: 'shirt_yellow', slot: 'shirt', name: 'Yellow Hoodie',   cost: 0,   look: { shirt: '#ffb703' } },
  { id: 'shirt_red',    slot: 'shirt', name: 'Red Hoodie',      cost: 70,  look: { shirt: '#e74c3c' } },
  { id: 'shirt_teal',   slot: 'shirt', name: 'Teal Hoodie',     cost: 70,  look: { shirt: '#00b894' } },
  { id: 'shirt_purple', slot: 'shirt', name: 'Purple Hoodie',   cost: 90,  look: { shirt: '#6c5ce7' } },
  { id: 'shirt_black',  slot: 'shirt', name: 'Stealth Black',   cost: 120, look: { shirt: '#2d3436' } },
  { id: 'shirt_white',  slot: 'shirt', name: 'Clean White',     cost: 120, look: { shirt: '#ecf0f1' } },
  { id: 'trail_none',   slot: 'trail', name: 'No Trail',        cost: 0 },
  { id: 'trail_sparkle',slot: 'trail', name: 'Sparkle Trail',   cost: 150 },
  { id: 'trail_flame',  slot: 'trail', name: 'Flame Trail',     cost: 220 },
  { id: 'trail_rainbow',slot: 'trail', name: 'Rainbow Trail',   cost: 0, unlock: 16 },
  { id: 'glove_none',   slot: 'glove', name: 'Bare Hands',      cost: 0 },
  { id: 'glove_gold',   slot: 'glove', name: 'Golden Glove',    cost: 0, unlock: 24 },
];
const cosmetic = id => COSMETICS.find(c => c.id === id);
function playerLook() {
  const L = Object.assign({}, PLAYER_LOOK);
  for (const slot of ['hat', 'shirt']) { const c = cosmetic(save.eq[slot]); if (c && c.look) Object.assign(L, c.look); }
  L.goldGlove = save.eq.glove === 'glove_gold';
  return L;
}
function buyCosmetic(c) {
  if (save.owned[c.id]) { equipCosmetic(c); return; }
  if (c.unlock) { sfx.whiff(); return; }
  if (save.coins < c.cost) { sfx.whiff(); return; }
  save.coins -= c.cost; save.owned[c.id] = true; sfx.box();
  equipCosmetic(c);
}
function equipCosmetic(c) {
  save.eq[c.slot] = c.id;
  persist(); applyUpgrades();
  if (player && gs !== 'play') { const np = newPlayer(); np.x = player.x; np.y = player.y; np.facing = player.facing; player = np; }
}

// ---------- Slap Book ----------
const BOOK_TYPES = Object.keys(TYPES).filter(k => k !== 'dog');
const bookCount = () => BOOK_TYPES.filter(t => save.book[t]).length;
function bookSlap(type) {
  const first = !save.book[type];
  save.book[type] = (save.book[type] || 0) + 1;
  if (!first) return;
  const n = bookCount();
  toast('NEW in Slap Book: ' + TYPES[type].name + '  (' + n + '/' + BOOK_TYPES.length + ')', '#ffd32a');
  for (const c of COSMETICS) if (c.unlock === n && !save.owned[c.id]) { save.owned[c.id] = true; toast('UNLOCKED: ' + c.name + '!', '#e056fd'); }
}

// ---------- background missions ----------
const plural = n => /[^aeiou]y$/.test(n) ? n.slice(0, -1) + 'ies' : /o$/.test(n) ? n + 'es' : n + 's';
const MISSIONS = [
  { k: 'slapType', make() { const t = pick(BOOK_TYPES.filter(x => TYPES[x].w >= 2.5)), n = pick([3, 5, 8]); return { text: 'Slap ' + n + ' ' + plural(TYPES[t].name), ev: 'slap', type: t, goal: n, reward: 30 + n * 8 }; } },
  { k: 'slaps',    run: true, make() { const n = pick([25, 40, 60]); return { text: 'Slap ' + n + ' faces in one run', ev: 'slap', goal: n, reward: 20 + n }; } },
  { k: 'combo',    run: true, max: true, make() { const n = pick([4, 5, 6, 8]); return { text: 'Reach a x' + n + ' combo', ev: 'combo', goal: n, reward: 20 + n * 10 }; } },
  { k: 'survive',  run: true, max: true, make() { const n = pick([60, 90, 120, 180]); return { text: 'Survive ' + (n % 60 ? n + 's' : n / 60 + ' min') + ' in one run', ev: 'time', goal: n, reward: Math.round(n / 1.5) }; } },
  { k: 'escapes',  run: true, make() { const n = pick([5, 8, 12]); return { text: 'Shake off ' + n + ' chasers in one run', ev: 'escape', goal: n, reward: 25 + n * 5 }; } },
  { k: 'traffic',  make() { const n = pick([3, 5, 8]); return { text: 'Get ' + n + ' chasers hit by traffic', ev: 'traffic', goal: n, reward: 30 + n * 10 }; } },
  { k: 'slip',     make() { const n = pick([3, 5, 10]); return { text: 'Make ' + n + ' chasers slip on bananas', ev: 'slip', goal: n, reward: 30 + n * 8 }; } },
  { k: 'manhole',  make() { const n = pick([2, 4, 6]); return { text: 'Send ' + n + ' chasers down manholes', ev: 'manhole', goal: n, reward: 40 + n * 12 }; } },
  { k: 'boxes',    make() { const n = pick([3, 5, 8]); return { text: 'Open ' + n + ' mystery boxes', ev: 'box', goal: n, reward: 25 + n * 8 }; } },
  { k: 'close',    run: true, make() { const n = pick([3, 5, 8]); return { text: 'Get ' + n + ' close calls in one run', ev: 'close', goal: n, reward: 30 + n * 8 }; } },
  { k: 'coins',    run: true, make() { const n = pick([30, 60, 100]); return { text: 'Grab ' + n + ' coins in one run', ev: 'coin', goal: n, reward: Math.round(n / 2) }; } },
  { k: 'heat',     run: true, max: true, make() { const n = pick([4, 6, 8]); return { text: 'Have ' + n + ' people chasing you at once', ev: 'heat', goal: n, reward: 20 + n * 10 }; } },
  { k: 'abduct',   make() { const n = pick([3, 6]); return { text: 'Get ' + n + ' people abducted by aliens', ev: 'abduct', goal: n, reward: 30 + n * 8 }; } },
  { k: 'hide',     make() { const n = pick([2, 4]); return { text: 'Hide in a phone booth ' + n + ' times', ev: 'hide', goal: n, reward: 30 + n * 10 }; } },
  { k: 'bike',     make() { const n = pick([2, 4, 6]); return { text: 'Get ' + n + ' chasers wiped out by e-bikes', ev: 'bike', goal: n, reward: 35 + n * 10 }; } },
  { k: 'visit',    run: true, make() { const d = pick(['downtown', 'park', 'residential']); return { text: 'Reach ' + DISTRICTS[d].name + ' in one run', ev: 'district', district: d, goal: 1, reward: 50 }; } },
];
function newMission(exclude) {
  const pool = MISSIONS.filter(m => !exclude.includes(m.k));
  const t = pick(pool.length ? pool : MISSIONS);
  const m = t.make();
  m.k = t.k; m.run = !!t.run; m.max = !!t.max; m.prog = 0;
  return m;
}
function ensureMissions() {
  save.missions = save.missions.filter(m => MISSIONS.some(t => t.k === m.k));
  while (save.missions.length < 3) save.missions.push(newMission(save.missions.map(m => m.k)));
}
ensureMissions();

// per-run bookkeeping
let runDone = [], runCoins = 0, coinFrac = 0, runClose = 0, newRecords = [], runBonus = 0, runXp = 0, runLevelUp = 0;
function missionsStartRun() {
  for (const m of save.missions) if (m.run) m.prog = 0;
  runDone = []; runCoins = 0; coinFrac = 0; runClose = 0; newRecords = []; runBonus = 0; runXp = 0; runLevelUp = 0;
}
function missionEvent(ev, val = 1, data) {
  if (gs !== 'play') return;
  for (let i = 0; i < save.missions.length; i++) {
    const m = save.missions[i];
    if (m.ev !== ev) continue;
    if (m.type && (!data || data.type !== m.type)) continue;
    if (m.district && (!data || data.district !== m.district)) continue;
    m.prog = m.max ? Math.max(m.prog, val) : m.prog + val;
    if (m.prog >= m.goal) {
      save.coins += m.reward; runCoins += m.reward; save.done++;
      runDone.push(m);
      toast('MISSION DONE: ' + m.text + '   +' + m.reward + ' coins', '#7bed9f');
      sfx.mission();
      save.missions[i] = newMission(save.missions.map(x => x.k));
    }
  }
}
function addCoins(n) {
  const v = n * (1 + 0.1 * lvl('pockets')) + coinFrac;
  const g = Math.floor(v);
  coinFrac = v - g;
  if (g > 0) { save.coins += g; runCoins += g; missionEvent('coin', g); }
  return g;
}
// called once when a run ends
function endRun() {
  runBonus = Math.floor(score / 2500) + escapes;
  const before = gs; gs = 'play'; addCoins(runBonus); gs = before;
  const r = save.rec;
  const recs = [['score', score, 'Highest score'], ['combo', bestCombo, 'Longest combo'], ['time', Math.floor(elapsed), 'Longest run'], ['slaps', slaps, 'Most slaps'], ['escapes', escapes, 'Most escapes']];
  newRecords = [];
  for (const [k, v, label] of recs) if (v > (r[k] || 0)) { if (r[k]) newRecords.push(label); r[k] = v; }
  const st = save.stats;
  st.runs++; st.slaps += slaps; st.escapes += escapes; st.coins += runCoins; st.time += Math.floor(elapsed);
  st.close += runClose; st.traffic += carHits; st.boxes += boxesOpened;
  const lvBefore = levelInfo(st.xp).level;
  runXp = Math.round(score / 250 + slaps * 2 + escapes * 3 + elapsed / 2);
  st.xp += runXp;
  runLevelUp = 0;
  const after = levelInfo(st.xp).level;
  for (let L = lvBefore + 1; L <= after; L++) { save.coins += 25 * L; runLevelUp = L; }
  persist();
}
// cheapest thing the player can work towards next
function nextGoal() {
  let bestU = null;
  for (const u of UPGRADES) if (lvl(u.id) < u.max && (!bestU || upCost(u) < upCost(bestU))) bestU = u;
  return bestU ? { name: bestU.name + ' Lv' + (lvl(bestU.id) + 1), cost: upCost(bestU) } : null;
}
// extra sounds used by the meta layer
sfx.ding = () => { tone(1320, 0.08, 'sine', 0.08); tone(1760, 0.12, 'sine', 0.06, 0, 0.07); };
sfx.mission = () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, 0, i * 0.08)); };
sfx.coin = () => { tone(1568, 0.06, 'square', 0.05); tone(2093, 0.1, 'square', 0.05, 0, 0.05); };
sfx.bell = () => { tone(2600, 0.25, 'sine', 0.1); tone(2600, 0.25, 'sine', 0.08, 0, 0.18); };
sfx.close = () => { noise(0.25, 800, 0.7, 0.3, 'bandpass', 3000); tone(880, 0.12, 'triangle', 0.1, 1320); };
sfx.announce = () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, 'square', 0.07, 0, i * 0.05)); };

// ---------- levels ----------
function levelInfo(xp) {
  let level = 1, need = 150, rest = xp;
  while (rest >= need) { rest -= need; level++; need = 150 + (level - 1) * 100; }
  return { level, into: rest, need };
}

// ---------- profile management ----------
function loadProfile(id) {
  persist();
  profiles.current = id; persistProfiles();
  const fresh = readSave(id);
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, fresh);
  ensureMissions();
  best = save.rec.score || 0;
  applyUpgrades();
  if (player && gs !== 'play') { const np = newPlayer(); np.x = player.x; np.y = player.y; np.facing = player.facing; player = np; }
}
function cleanName(n, fallback) {
  n = String(n || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16);
  return n || fallback;
}
function newProfile(name) {
  if (profiles.list.length >= MAX_PROFILES) return false;
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  const used = profiles.list.map(p => p.color);
  let nm = cleanName(name, 'Player ' + (profiles.list.length + 1));
  for (let i = 2; profiles.list.some(p => p.name === nm); i++) nm = cleanName(name, 'Player').slice(0, 12) + ' (' + i + ')';
  profiles.list.push({ id, name: nm, color: PROFILE_COLORS.find(c => !used.includes(c)) || pick(PROFILE_COLORS) });
  loadProfile(id);
  return true;
}
function renameProfile(name) { const p = currentProfile(); p.name = cleanName(name, p.name); persistProfiles(); }
function deleteProfile(id) {
  if (profiles.list.length <= 1) return false;
  if (id === profiles.current) loadProfile(profiles.list.find(p => p.id !== id).id);
  profiles.list = profiles.list.filter(p => p.id !== id);
  try { localStorage.removeItem(saveKeyFor(id)); } catch (e) { }
  persistProfiles();
  return true;
}
// backup codes let a player move their progress to another device without an account
function exportCode() {
  persist();
  const p = currentProfile();
  return 'SLAPRUN1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ name: p.name, color: p.color, save }))));
}
function importCode(code) {
  try {
    code = String(code || '').trim();
    if (!code.startsWith('SLAPRUN1:')) return null;
    const data = JSON.parse(decodeURIComponent(escape(atob(code.slice(9)))));
    if (!data || !data.save || typeof data.save.coins !== 'number') return null;
    if (profiles.list.length >= MAX_PROFILES) return 'full';
    const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    let name = cleanName(data.name, 'Imported');
    for (let i = 2; profiles.list.some(p => p.name === name); i++) name = cleanName(data.name, 'Imported').slice(0, 12) + ' (' + i + ')';
    profiles.list.push({ id, name, color: data.color || pick(PROFILE_COLORS) });
    try { localStorage.setItem(saveKeyFor(id), JSON.stringify(mergeSave(data.save))); } catch (e) { }
    loadProfile(id);
    return name;
  } catch (e) { return null; }
}
