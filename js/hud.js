'use strict';
// =====================================================================
//  2D overlay: HUD, menus, speech bubbles, pop-up text and particle FX,
//  drawn on a transparent canvas above the 3D scene.
// =====================================================================

const ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, UI = 1;
function resizeAll() {
  DPR = Math.min(window.devicePixelRatio || 1, Q.dpr >= 1.5 ? 2 : 1.25);
  CW = window.innerWidth; CH = window.innerHeight;
  cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  // scale UI from the shorter side so phones, foldables and tablets stay readable
  UI = clamp(Math.min(CW / 900, CH / 640, Math.min(CW, CH) / 560), 0.7, 1.5);
  if (typeof readSafeArea === 'function') readSafeArea();
  V.resize(CW, CH);
}
window.addEventListener('resize', resizeAll);

// ---------- drawing helpers ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }
function ellipse(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); ctx.fill(); }
function poly(pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); }
function txt(s, x, y, size, color, align = 'center', outline = true) {
  size = Math.max(9, size);
  ctx.font = '900 ' + size + 'px "Arial Black","Segoe UI Black",Impact,system-ui,sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.17);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
function drawStar(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}
function heart(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
}
function drawVein(x, y, r) {
  ctx.strokeStyle = '#ff1e1e'; ctx.lineWidth = Math.max(1.5, r * 0.7); ctx.lineCap = 'round';
  for (const [ox, oy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    const a = Math.atan2(-oy, -ox);
    ctx.arc(x + ox * r, y + oy * r, r * 0.8, a - 0.9, a + 0.9);
    ctx.stroke();
  }
}
function drawBanana(x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.strokeStyle = '#f6c90e'; ctx.lineWidth = r * 0.55; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -r * 0.9, r, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  ctx.fillStyle = '#5d4037'; circle(Math.cos(0.2 * Math.PI) * r, -r * 0.9 + Math.sin(0.2 * Math.PI) * r, r * 0.18);
  ctx.restore();
}
function drawIcon(k, x, y, r) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (k) {
    case 'ufo':
      ctx.fillStyle = '#a4f4ff'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.12, r * 0.42, r * 0.42, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#b2bec3'; ellipse(x, y + r * 0.1, r, r * 0.3);
      ctx.fillStyle = '#ffd32a'; for (let i = -2; i <= 2; i++) circle(x + i * r * 0.35, y + r * 0.18, r * 0.08);
      ctx.fillStyle = 'rgba(123,237,159,0.6)'; poly([x - r * 0.3, y + r * 0.35, x + r * 0.3, y + r * 0.35, x + r * 0.6, y + r * 0.95, x - r * 0.6, y + r * 0.95]);
      break;
    case 'banana': drawBanana(x, y + r * 0.6, r * 0.8, 0); break;
    case 'mega':
      ctx.fillStyle = '#ffcc99'; ctx.strokeStyle = '#7f5539'; ctx.lineWidth = Math.max(1, r * 0.08);
      for (let i = 0; i < 4; i++) { rr(x - r * 0.55 + i * r * 0.3, y - r * 0.85, r * 0.24, r * 0.8, r * 0.12); ctx.fill(); ctx.stroke(); }
      rr(x - r * 0.6, y - r * 0.2, r * 1.15, r * 0.9, r * 0.3); ctx.fill(); ctx.stroke();
      ellipse(x + r * 0.62, y + r * 0.05, r * 0.18, r * 0.42, -0.6);
      break;
    case 'skates':
      ctx.fillStyle = '#ff4757'; rr(x - r * 0.55, y - r * 0.75, r * 0.6, r * 1.0, r * 0.15); ctx.fill();
      rr(x - r * 0.55, y - r * 0.05, r * 1.15, r * 0.4, r * 0.15); ctx.fill();
      ctx.fillStyle = '#2f3542'; circle(x - r * 0.3, y + r * 0.58, r * 0.2); circle(x + r * 0.35, y + r * 0.58, r * 0.2);
      ctx.fillStyle = '#ffd32a'; poly([x + r * 0.7, y - r * 0.6, x + r, y - r * 0.4, x + r * 0.7, y - r * 0.2]);
      break;
    case 'disguise':
      ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.arc(x - r * 0.4, y - r * 0.25, r * 0.3, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + r * 0.4, y - r * 0.25, r * 0.3, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#f1c27d'; ellipse(x, y + r * 0.12, r * 0.22, r * 0.32);
      ctx.fillStyle = '#111'; ellipse(x, y + r * 0.5, r * 0.6, r * 0.18);
      ctx.fillRect(x - r * 0.75, y - r * 0.75, r * 0.6, r * 0.14); ctx.fillRect(x + r * 0.15, y - r * 0.75, r * 0.6, r * 0.14);
      break;
    case 'decoy':
      ctx.fillStyle = '#ffb703'; rr(x - r * 0.35, y - r * 0.2, r * 0.7, r * 0.9, r * 0.25); ctx.fill();
      ctx.fillStyle = '#f1c27d'; circle(x, y - r * 0.5, r * 0.32);
      ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(x, y - r * 0.55, r * 0.34, Math.PI, TAU); ctx.fill();
      break;
    case 'energy':
      ctx.fillStyle = '#2ed573'; rr(x - r * 0.4, y - r * 0.8, r * 0.8, r * 1.6, r * 0.18); ctx.fill();
      ctx.fillStyle = '#b2bec3'; ctx.fillRect(x - r * 0.35, y - r * 0.9, r * 0.7, r * 0.15);
      ctx.fillStyle = '#ffd32a'; poly([x + r * 0.1, y - r * 0.6, x - r * 0.25, y + r * 0.05, x, y + r * 0.05, x - r * 0.1, y + r * 0.6, x + r * 0.25, y - r * 0.1, x, y - r * 0.1]);
      break;
    case 'shield':
      ctx.fillStyle = 'rgba(72,219,251,0.3)'; circle(x, y, r * 0.85);
      ctx.strokeStyle = '#48dbfb'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(x, y, r * 0.55, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
      break;
    case 'horn':
      ctx.fillStyle = '#ff4757'; rr(x - r * 0.9, y - r * 0.3, r * 0.6, r * 0.75, r * 0.15); ctx.fill();
      ctx.fillStyle = '#ff9f43'; poly([x - r * 0.3, y - r * 0.05, x + r * 0.8, y - r * 0.6, x + r * 0.8, y + r * 0.5, x - r * 0.3, y + r * 0.2]);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.08;
      ctx.beginPath(); ctx.arc(x + r * 0.8, y, r * 0.35, -0.8, 0.8); ctx.stroke();
      break;
    case 'smoke':
      ctx.fillStyle = '#2d3436'; circle(x, y + r * 0.15, r * 0.6);
      ctx.fillStyle = '#636e72'; ctx.fillRect(x - r * 0.15, y - r * 0.6, r * 0.3, r * 0.2);
      ctx.strokeStyle = '#e17055'; ctx.lineWidth = r * 0.1; line(x, y - r * 0.6, x + r * 0.35, y - r * 0.9);
      ctx.fillStyle = '#ffd32a'; drawStar(x + r * 0.4, y - r * 0.92, r * 0.18, '#ffd32a');
      break;
    case 'cash':
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#27ae60' : '#2ecc71'; rr(x - r * 0.8 + i * r * 0.15, y - r * 0.5 + i * r * 0.2, r * 1.3, r * 0.7, r * 0.1); ctx.fill(); }
      txt('$', x + r * 0.1, y + r * 0.45, r * 0.8, '#ffffff', 'center', false);
      break;
    case 'pie':
      ctx.fillStyle = '#d4a373'; ellipse(x, y + r * 0.2, r * 0.85, r * 0.4);
      ctx.fillStyle = '#fffaf0'; ellipse(x, y, r * 0.75, r * 0.35); circle(x - r * 0.3, y - r * 0.15, r * 0.25); circle(x + r * 0.2, y - r * 0.2, r * 0.28);
      ctx.fillStyle = '#e74c3c'; circle(x, y - r * 0.35, r * 0.15);
      break;
    case 'flowers':
      ctx.strokeStyle = '#27ae60'; ctx.lineWidth = r * 0.12; line(x, y + r * 0.8, x - r * 0.3, y - r * 0.2); line(x, y + r * 0.8, x + r * 0.3, y - r * 0.2); line(x, y + r * 0.8, x, y - r * 0.4);
      for (const [fx2, fy2, c] of [[-0.3, -0.3, '#e84393'], [0.3, -0.3, '#fdcb6e'], [0, -0.55, '#ff7675']]) { ctx.fillStyle = c; circle(x + fx2 * r, y + fy2 * r, r * 0.25); }
      break;
    case 'freeze':
      ctx.fillStyle = '#74b9ff'; rr(x - r * 0.8, y - r * 0.2, r * 1.0, r * 0.45, r * 0.1); ctx.fill();
      ctx.fillStyle = '#0984e3'; rr(x - r * 0.6, y + r * 0.2, r * 0.25, r * 0.5, r * 0.08); ctx.fill();
      ctx.strokeStyle = '#81ecec'; ctx.lineWidth = r * 0.12;
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line(x + r * 0.55 - Math.cos(a) * r * 0.35, y - Math.sin(a) * r * 0.35, x + r * 0.55 + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35); }
      break;
    case 'tornado':
      ctx.strokeStyle = '#a29bfe'; ctx.lineWidth = r * 0.16;
      for (let i = 0; i < 4; i++) { const w = r * (0.9 - i * 0.2); line(x - w + i * r * 0.08, y - r * 0.7 + i * r * 0.45, x + w + i * r * 0.08, y - r * 0.7 + i * r * 0.45); }
      break;
    case 'heart': heart(x, y, r * 0.7, '#ff4757'); break;
    case 'nitro':
      ctx.fillStyle = '#2d3436'; rr(x - r * 0.3, y - r * 0.8, r * 0.6, r * 1.2, r * 0.2); ctx.fill();
      ctx.fillStyle = '#e74c3c'; poly([x - r * 0.3, y - r * 0.8, x + r * 0.3, y - r * 0.8, x, y - r * 1.1]);
      ctx.fillStyle = '#ff9f1a'; poly([x - r * 0.3, y + r * 0.4, x + r * 0.3, y + r * 0.4, x, y + r * 1.0]);
      ctx.fillStyle = '#ffd32a'; poly([x - r * 0.15, y + r * 0.4, x + r * 0.15, y + r * 0.4, x, y + r * 0.75]);
      break;
    case 'hawk':
      ctx.fillStyle = '#8d5a2b'; ellipse(x, y, r * 0.5, r * 0.28);
      poly([x - r * 0.1, y - r * 0.05, x - r * 0.95, y - r * 0.6, x - r * 0.55, y + r * 0.05]); poly([x + r * 0.1, y - r * 0.05, x + r * 0.95, y - r * 0.6, x + r * 0.55, y + r * 0.05]);
      ctx.fillStyle = '#f5f5f5'; circle(x + r * 0.45, y - r * 0.12, r * 0.2);
      ctx.fillStyle = '#f1c40f'; poly([x + r * 0.62, y - r * 0.16, x + r * 0.85, y - r * 0.06, x + r * 0.62, y]);
      break;
    case 'giant':
      ctx.fillStyle = '#e056fd'; circle(x, y - r * 0.55, r * 0.3); rr(x - r * 0.35, y - r * 0.25, r * 0.7, r * 0.9, r * 0.2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.12; line(x + r * 0.7, y + r * 0.6, x + r * 0.7, y - r * 0.7); line(x + r * 0.45, y - r * 0.45, x + r * 0.7, y - r * 0.75); line(x + r * 0.95, y - r * 0.45, x + r * 0.7, y - r * 0.75);
      break;
    case 'aura': for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4; drawIcon('aura1', x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.4); } break;
    case 'aura1':
      ctx.fillStyle = '#ffcc99'; ctx.strokeStyle = '#7f5539'; ctx.lineWidth = Math.max(1, r * 0.1);
      circle(x, y + r * 0.15, r * 0.55); ctx.stroke();
      for (let i = 0; i < 4; i++) { rr(x - r * 0.5 + i * r * 0.27, y - r * 0.8, r * 0.22, r * 0.6, r * 0.1); ctx.fill(); }
      break;
    case 'rapid':
      drawIcon('aura1', x + r * 0.2, y, r * 0.9);
      ctx.strokeStyle = '#ffdd59'; ctx.lineWidth = r * 0.12; for (let i = 0; i < 3; i++) line(x - r * 0.95, y - r * 0.4 + i * r * 0.4, x - r * 0.45, y - r * 0.4 + i * r * 0.4);
      break;
    case 'golden':
      ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#b7950b'; ctx.lineWidth = Math.max(1, r * 0.1);
      circle(x, y + r * 0.15, r * 0.55); ctx.stroke();
      for (let i = 0; i < 4; i++) { rr(x - r * 0.5 + i * r * 0.27, y - r * 0.8, r * 0.22, r * 0.6, r * 0.1); ctx.fill(); }
      drawStar(x + r * 0.7, y - r * 0.7, r * 0.3, '#ffffff');
      break;
    case 'rush':
      ctx.fillStyle = '#5d3a1a'; ellipse(x - r * 0.1, y + r * 0.1, r * 0.6, r * 0.38); circle(x + r * 0.5, y - r * 0.05, r * 0.3);
      ctx.fillStyle = '#f5f0e1'; poly([x + r * 0.35, y - r * 0.25, x + r * 0.2, y - r * 0.85, x + r * 0.5, y - r * 0.3]); poly([x + r * 0.65, y - r * 0.25, x + r * 0.9, y - r * 0.8, x + r * 0.75, y - r * 0.2]);
      ctx.fillStyle = '#3e2412'; for (const lx of [-0.45, -0.15, 0.1, 0.3]) ctx.fillRect(x + lx * r, y + r * 0.35, r * 0.12, r * 0.45);
      break;
    case 'boomerang':
      ctx.strokeStyle = '#fdcb6e'; ctx.lineWidth = r * 0.14; ctx.setLineDash([r * 0.2, r * 0.15]);
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.85, r * 0.45, 0, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke(); ctx.setLineDash([]);
      drawIcon('aura1', x + r * 0.55, y - r * 0.1, r * 0.55);
      break;
    case 'crowd':
      ctx.strokeStyle = '#0984e3'; ctx.lineWidth = r * 0.35; ctx.beginPath(); ctx.arc(x, y - r * 0.05, r * 0.55, Math.PI, TAU); ctx.stroke();
      ctx.fillStyle = '#dfe6e9'; ctx.fillRect(x - r * 0.72, y - r * 0.05, r * 0.35, r * 0.4); ctx.fillRect(x + r * 0.37, y - r * 0.05, r * 0.35, r * 0.4);
      ctx.fillStyle = '#ffffff'; circle(x, y + r * 0.7, r * 0.15);
      break;
    case 'chain':
      ctx.fillStyle = '#74b9ff'; poly([x + r * 0.15, y - r * 0.9, x - r * 0.5, y + r * 0.1, x - r * 0.05, y + r * 0.1, x - r * 0.25, y + r * 0.9, x + r * 0.5, y - r * 0.15, x + r * 0.05, y - r * 0.15]);
      break;
    case 'box':
      ctx.fillStyle = '#e1a32a'; rr(x - r * 0.75, y - r * 0.7, r * 1.5, r * 1.4, r * 0.2); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.fillRect(x - r * 0.12, y - r * 0.7, r * 0.24, r * 1.4);
      txt('?', x, y + r * 0.35, r * 1.0, '#ffffff');
      break;
    case 'coin': drawCoin(x, y, r * 0.8); break;
  }
  ctx.restore();
}
function drawCoin(x, y, r) {
  ctx.fillStyle = '#e1a32a'; circle(x, y + r * 0.12, r);
  ctx.fillStyle = '#ffd32a'; circle(x, y, r);
  ctx.strokeStyle = '#e1a32a'; ctx.lineWidth = Math.max(1, r * 0.18); ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.stroke();
}

// ---------- world-space overlay ----------
const tanV = Math.tan(19 * Math.PI / 180);
let PX = 1; // pixels per world unit at the street centre
function headPos(p) {
  const s = p.size || 1, lie = p.lie || 0, ht = (p.look && p.look.ht) || 1;
  if (p.type === 'dog') return { x: p.x, h: (p.z || 0) + 34 * p.look.big, y: p.y };
  return { x: p.x + (p.fallDir || 1) * lie * 72 * s, h: (p.z || 0) + (1 - lie) * 86 * s * ht + lie * 14, y: p.y };
}
function drawWorldOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  PX = CH / (2 * tanV * V.camDist);
  const bubbles = [];
  const all = peds.slice(); all.push(player); if (decoy) all.push(decoy);
  for (const p of all) {
    if (Math.abs(p.x - player.x) > VW) continue;
    const hp = headPos(p);
    const s = V.project(hp.x, hp.h, hp.y);
    if (!s.ok) continue;
    const k = PX * s.k;
    const st = p.isPlayer ? (p.downT > 0 ? 'down' : '') : p.state;
    if (st === 'down' || st === 'getup') {
      for (let i = 0; i < 3; i++) {
        const a = gameTime * 6 + i * TAU / 3;
        drawStar(s.x + Math.cos(a) * 16 * k, s.y - 6 * k + Math.sin(a) * 5 * k, 4.5 * k, '#ffd32a');
      }
    }
    const lost = st === 'chase' && !decoy && (power.disguise > 0 || player.hidden || p.smokeT > 0);
    if (st === 'chase' && !lost) {
      const w = 34 * k, by = s.y - 22 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(s.x - w / 2 - 1, by - 1, w + 2, 6 * k / 1.2);
      ctx.fillStyle = '#ff3838'; ctx.fillRect(s.x - w / 2, by, w * clamp(p.anger / p.angerMax, 0, 1), 4 * k / 1.2);
      if (p.type !== 'dog') drawVein(s.x + 14 * k, s.y - 10 * k, 3.5 * k);
    }
    if (lost) txt('?', s.x + Math.sin(gameTime * 4) * 4, s.y - 14 * k, 20 * k, '#dfe6e9');
    if (st === 'walk' && p.shock > 0) txt('!', s.x, s.y - 12 * k, 20 * k, '#ffdd59');
    if (st === 'frozen') txt('BRRR', s.x, s.y - 18 * k, 12 * k, '#81ecec');
    if (st === 'tired' && !p.say) txt('huff', s.x + Math.sin(gameTime * 5) * 3, s.y - 14 * k, 11 * k, '#dfe6e9');
    if (p.isDecoy) txt('DECOY', s.x, s.y - 20 * k, 12 * k, '#ffa502');
    if (p.isPlayer && (gs === 'play' || gs === 'title') && p.downT <= 0) {
      const ay = s.y - 22 * k + Math.sin(gameTime * 6) * 3;
      ctx.fillStyle = player.hidden ? '#dfe6e9' : '#ffdd59'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      poly([s.x - 7, ay - 9, s.x + 7, ay - 9, s.x, ay]); ctx.stroke();
      if (player.hidden) txt('HIDDEN', s.x, ay - 14, 12, '#dfe6e9');
    }
    if (p.say) bubbles.push({ x: s.x, y: s.y - 18 * k, text: p.say.text, a: clamp(p.say.t * 3, 0, 1), k });
  }
  // e-bike / scooter danger lanes
  for (const r of riders) {
    const pulse = 0.14 + 0.1 * Math.abs(Math.sin(gameTime * 8));
    const a1 = V.project(r.x, 0, r.y - 13), a2 = V.project(r.x + r.dir * 460, 0, r.y - 13), b2 = V.project(r.x + r.dir * 460, 0, r.y + 13), b1 = V.project(r.x, 0, r.y + 13);
    ctx.fillStyle = 'rgba(255,159,67,' + pulse + ')';
    poly([a1.x, a1.y, a2.x, a2.y, b2.x, b2.y, b1.x, b1.y]);
    const s = V.project(r.x, 30, r.y);
    if ((s.x < 0 || s.x > CW) && ((gameTime * 6) | 0) % 2 === 0) {
      const x = s.x < 0 ? 26 : CW - 26, y = clamp(s.y, 90, CH - 40);
      ctx.fillStyle = '#ff9f43'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill(); ctx.stroke();
      txt(r.kind === 'ebike' ? 'BIKE' : 'SCOOT', x, y + 4, 8, '#ffffff');
    }
  }
  // particles
  for (const p of parts) {
    const s = V.project(p.x, p.z, p.y);
    if (!s.ok) continue;
    const k = PX * s.k;
    const a = clamp(p.life * 3, 0, 1);
    ctx.globalAlpha = p.kind === 'dust' ? a * 0.6 : p.kind === 'smoke' ? Math.min(0.8, p.life) : a;
    switch (p.kind) {
      case 'star': drawStar(s.x, s.y, p.size * k, p.color); break;
      case 'ring': {
        const c = V.project(p.x, 0, p.y), ex = V.project(p.x + p.r, 0, p.y), ez = V.project(p.x, 0, p.y + p.r);
        ctx.strokeStyle = p.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.abs(ex.x - c.x) + 1, Math.abs(ez.y - c.y) + 1, 0, 0, TAU); ctx.stroke();
        break;
      }
      case 'flash': ctx.fillStyle = 'rgba(255,255,255,0.9)'; circle(s.x, s.y, p.size * k * (1 + (0.25 - p.life) * 4)); break;
      case 'note': txt(p.color === '#2d3436' ? '♪' : '♫', s.x, s.y, p.size * k, p.color, 'center', false); break;
      case 'confetti': ctx.fillStyle = p.color; ctx.fillRect(s.x, s.y, p.size * k, p.size * k * 0.6); break;
      case 'cash':
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.sin(gameTime * 6 + p.x) * 0.6);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(-p.size * k, -p.size * k * 0.5, p.size * k * 2, p.size * k);
        ctx.fillStyle = '#1e8449'; ctx.fillRect(-p.size * k * 0.3, -p.size * k * 0.3, p.size * k * 0.6, p.size * k * 0.6);
        ctx.restore(); break;
      case 'letter':
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.sin(gameTime * 5 + p.x) * 0.8);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-p.size * k, -p.size * k * 0.6, p.size * k * 2, p.size * k * 1.2);
        ctx.strokeStyle = '#b2bec3'; ctx.lineWidth = 1; line(-p.size * k, -p.size * k * 0.6, 0, 0); line(p.size * k, -p.size * k * 0.6, 0, 0);
        ctx.restore(); break;
      case 'feather': ctx.fillStyle = '#95a5a6'; ellipse(s.x, s.y, 4 * k, 2 * k, gameTime * 4 + p.x); ctx.fillStyle = '#636e72'; ellipse(s.x + 3 * k, s.y - 2 * k, 2 * k, 1.5 * k); break;
      case 'heartp': heart(s.x, s.y, p.size * k, p.color); break;
      case 'zap': {
        const e = V.project(p.x2, p.z2, p.y2);
        ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x, s.y);
        for (let i = 1; i < 6; i++) ctx.lineTo(lerp(s.x, e.x, i / 6) + rand(-8, 8), lerp(s.y, e.y, i / 6) + rand(-8, 8));
        ctx.lineTo(e.x, e.y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
        break;
      }
      case 'smoke': ctx.fillStyle = p.color; circle(s.x, s.y, p.size * k); break;
      default: ctx.fillStyle = p.color; circle(s.x, s.y, p.size * k);
    }
  }
  ctx.globalAlpha = 1;
  // slap aura: hands orbiting the player
  if (power.aura > 0 && gs === 'play') {
    const c = V.project(player.x, 45, player.y), k = PX * c.k;
    for (let i = 0; i < 4; i++) { const a = gameTime * 7 + i * TAU / 4; drawIcon('aura1', c.x + Math.cos(a) * 62 * k, c.y + Math.sin(a) * 24 * k, 11 * k); }
  }
  // box opening roulette
  if (opening) {
    const keysP = Object.keys(POWERS);
    const kk = opening.t > 0.15 ? keysP[((gameTime * 14) | 0) % keysP.length] : opening.result;
    const s = V.project(player.x, 140, player.y);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 2.5;
    rr(s.x - 24, s.y - 24, 48, 48, 9); ctx.fill(); ctx.stroke();
    drawIcon(kk, s.x, s.y, 18);
  }
  // pop-up text
  for (const p of pops) {
    const s = V.project(p.x, p.z, p.y);
    if (!s.ok) continue;
    const age = p.max - p.life;
    const sc = p.big ? 1 + 0.7 * Math.max(0, 1 - age / 0.12) : 1;
    ctx.globalAlpha = clamp(p.life / p.max * 2.5, 0, 1);
    txt(p.text, s.x, s.y, Math.max(11, p.size * PX * s.k * sc), p.color);
  }
  ctx.globalAlpha = 1;
  // speech bubbles
  for (const b of bubbles) {
    const fs = Math.max(10, 11 * b.k);
    ctx.font = 'bold ' + fs + 'px system-ui,"Segoe UI",sans-serif';
    const w = ctx.measureText(b.text).width + fs, h = fs * 1.6;
    ctx.globalAlpha = b.a;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 1.5;
    rr(b.x - w / 2, b.y - h, w, h, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; poly([b.x - 4, b.y - 1, b.x + 4, b.y - 1, b.x, b.y + 5]);
    ctx.beginPath(); ctx.moveTo(b.x - 4, b.y); ctx.lineTo(b.x, b.y + 5); ctx.lineTo(b.x + 4, b.y); ctx.stroke();
    ctx.fillStyle = '#2d3436'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.text, b.x, b.y - h / 2);
  }
  ctx.globalAlpha = 1;
  lastBubbleCount = bubbles.length;
  // off-screen indicators
  const edge = (wx, wy, h) => { const s = V.project(wx, h, wy); return s; };
  for (const q of peds) {
    if (q.state !== 'chase') continue;
    const s = edge(q.x, q.y, 40);
    if (s.x > 0 && s.x < CW && s.ok) continue;
    const left = s.x <= 0 || (!s.ok && q.x < player.x), x = left ? 18 : CW - 18;
    const y = clamp(s.y, 90, CH - 30);
    ctx.fillStyle = '#ff3838'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    if (left) poly([x - 10, y, x + 6, y - 11, x + 6, y + 11]); else poly([x + 10, y, x - 6, y - 11, x - 6, y + 11]);
    ctx.stroke();
    txt(Math.round(Math.abs(q.x - player.x) / 10) + 'm', left ? x + 24 : x - 24, y + 5, 12, '#ffffff');
  }
  for (const c of cruisers) {
    if (c.state === 'wrecked') continue;
    const s = edge(c.x, c.y, 30);
    if (s.x > 0 && s.x < CW && s.ok) continue;
    const left = s.x <= 0, x = left ? 22 : CW - 22, y = clamp(s.y, 90, CH - 30);
    ctx.fillStyle = ((gameTime * 8) | 0) % 2 ? '#ff3838' : '#3867d6'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill(); ctx.stroke();
    txt('COP', x, y + 4, 9, '#ffffff');
  }
  for (const it of items) {
    if (it.kind === 'pizza' || it.kind === 'coin') continue;
    const s = edge(it.x, it.y, 20);
    if (s.x > 0 && s.x < CW) continue;
    const left = s.x <= 0, x = left ? 20 : CW - 20, y = clamp(s.y, 90, CH - 30);
    if (it.kind === 'box') {
      ctx.fillStyle = '#f6c343'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill(); ctx.stroke();
      txt('?', x, y + 5, 14, '#ffffff');
    } else heart(x, y, 10 + Math.sin(gameTime * 8) * 1.5, '#ff4757');
  }
  for (const c of cars) {
    const s = edge(c.x - c.dir * c.len / 2, c.y, 20);
    const off = (c.dir > 0 && s.x < 0) || (c.dir < 0 && s.x > CW);
    if (!off || ((gameTime * 8) | 0) % 2) continue;
    const x = c.dir > 0 ? 28 : CW - 28, y = clamp(V.project(player.x, 10, c.y).y, 90, CH - 30);
    ctx.fillStyle = '#feca57'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
    poly([x, y - 18, x + 17, y + 12, x - 17, y + 12]); ctx.stroke();
    txt('!', x, y + 9, 18, '#000', 'center', false);
  }
}

// ---------- responsive layout helpers ----------
const SA = { t: 0, r: 0, b: 0, l: 0 }; // safe-area insets (notches, rounded corners)
function readSafeArea() {
  const el = document.getElementById('safe');
  if (!el) return;
  const cs = getComputedStyle(el);
  SA.t = parseFloat(cs.paddingTop) || 0; SA.r = parseFloat(cs.paddingRight) || 0;
  SA.b = parseFloat(cs.paddingBottom) || 0; SA.l = parseFloat(cs.paddingLeft) || 0;
}
const isNarrow = () => CW / UI < 760;       // phones in portrait, folded foldables
const isShort = () => CH < 520;              // phones in landscape
function fontPx(size) { return '900 ' + size + 'px "Arial Black","Segoe UI Black",Impact,system-ui,sans-serif'; }
function fitSize(s, size, maxW) {
  ctx.font = fontPx(size);
  const w = ctx.measureText(s).width;
  return w > maxW ? Math.max(9, size * maxW / w) : size;
}
function fitTxt(s, x, y, size, color, maxW, align = 'center') { txt(s, x, y, fitSize(s, size, maxW), color, align); }
function wrapLines(s, size, maxW) {
  ctx.font = fontPx(Math.max(9, size)); // measure at the size txt() will actually draw
  const words = s.split(' '), out = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}
// lays out a block of wrapped text lines, shrinking everything if it won't fit vertically
function drawBlock(entries, top, bottom, maxW) {
  let f = 1;
  for (let pass = 0; pass < 4; pass++) {
    let h = 0;
    for (const e of entries) h += wrapLines(e.text, e.size * f, maxW).length * e.size * f * 1.3 + (e.gap || 0) * f;
    if (top + h <= bottom) break;
    f *= Math.max(0.6, (bottom - top) / h);
  }
  let y = top;
  for (const e of entries) {
    const sz = e.size * f;
    for (const l of wrapLines(e.text, sz, maxW)) { y += sz * 1.3; txt(l, CW / 2, y - sz * 0.3, sz, e.color); }
    y += (e.gap || 0) * f;
  }
  return y;
}
// on-screen buttons (pause/title menus) — rebuilt every frame, hit-tested on click/tap
let uiButtons = [];
function button(label, x, y, w, h, action, color = '#ffffff') {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.strokeStyle = color; ctx.lineWidth = 2;
  rr(x - w / 2, y - h / 2, w, h, h / 2.6); ctx.fill(); ctx.stroke();
  fitTxt(label, x, y + h * 0.18, h * 0.42, color, w - 16);
  uiButtons.push({ x: x - w / 2, y: y - h / 2, w, h, action });
}
function hitButton(x, y) {
  for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return true; }
  return false;
}
const canFullscreen = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function toggleFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement, { navigationUI: 'hide' });
  } catch (e) { }
}
const qualityText = () => 'GRAPHICS: ' + (qualityMode === 'auto' ? 'AUTO (' + Q.label + ')' : Q.label);

// ---------- HUD ----------
let menu = null, shopTab = 'SKILLS', panelScroll = 0, panelMax = 0, dispScore = 0, panelNote = null;
const note = (text, color = '#7bed9f') => { panelNote = { text, color, t: gameTime + 3 }; };
function openMenu(m) { menu = m; panelScroll = 0; sfx.ding(); }
function touchButtons() { // slapping is automatic, so the only action button is SPRINT
  const u = clamp(Math.min(CW, CH) / 420, 0.75, 1.35);
  return { sprint: { x: CW - SA.r - 82 * u, y: CH - SA.b - 92 * u, r: 52 * u }, u };
}
function slotRects() {
  const out = [];
  if (touchMode && isShort()) { // landscape phone: a row left of SPRINT so the street stays clear
    const B = touchButtons(), s = 42 * B.u, gap = 8 * B.u;
    for (let i = 0; i < MAX_ITEMS; i++) out.push({ x: B.sprint.x - B.sprint.r - 14 * B.u - (i + 1) * s - i * gap, y: B.sprint.y - s / 2, s });
  } else if (touchMode) { // a column above the SPRINT button, within reach of the right thumb
    const B = touchButtons(), s = (MAX_ITEMS > 3 ? 40 : 46) * B.u, gap = 8 * B.u;
    for (let i = 0; i < MAX_ITEMS; i++) out.push({ x: B.sprint.x - s / 2, y: B.sprint.y - B.sprint.r - 14 * B.u - (i + 1) * s - i * gap, s });
  } else {
    const u = UI, s = 50 * u, gap = 10 * u, total = MAX_ITEMS * s + (MAX_ITEMS - 1) * gap;
    for (let i = 0; i < MAX_ITEMS; i++) out.push({ x: CW / 2 - total / 2 + i * (s + gap), y: CH - SA.b - s - 30 * u, s });
  }
  return out;
}
function coinLabel(x, y, size, align = 'left', text) {
  const s = text || save.coins.toLocaleString();
  ctx.font = fontPx(size);
  const w = ctx.measureText(s).width;
  const cx0 = align === 'left' ? x + size * 0.5 : align === 'right' ? x - w - size * 0.7 : x - w / 2 - size * 0.35;
  drawCoin(cx0, y - size * 0.36, size * 0.45);
  txt(s, align === 'left' ? x + size * 1.15 : align === 'right' ? x : x + size * 0.35, y, size, '#ffd32a', align === 'center' ? 'center' : align);
}
function drawHUD() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  uiButtons = [];
  const u = UI, cx = CW / 2, narrow = isNarrow(), compact = narrow || isShort(), L0 = SA.l + 16 * u, R0 = CW - SA.r - 16 * u, T0 = SA.t;
  if (gs === 'title') { drawTitle(); drawPanel(); return; }
  if (gs === 'over') { drawOver(); drawPanel(); drawFps(); return; } // results only, no in-run HUD behind them
  // left: score, stats, coins (the score rolls up)
  dispScore += (score - dispScore) * 0.2; if (Math.abs(score - dispScore) < 1) dispScore = score;
  txt(Math.round(dispScore).toLocaleString(), L0, T0 + 42 * u, 36 * u, '#ffffff', 'left');
  fitTxt('SLAPS ' + slaps + '   ESCAPES ' + escapes + '   ' + fmtTime(elapsed), L0, T0 + 63 * u, 13 * u, '#ffe082', narrow ? CW * 0.5 : 380 * u, 'left');
  coinLabel(L0, T0 + 84 * u, 15 * u);
  let py = T0 + 112 * u, px = L0 + 14 * u;
  for (const k in power) {
    if (power[k] <= 0) continue;
    const P = POWERS[k], f = clamp(power[k] / P.dur, 0, 1);
    if (compact) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; circle(px, py, 15 * u);
      ctx.strokeStyle = P.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 15 * u, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      drawIcon(k, px, py, 10 * u);
      px += 36 * u;
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(L0, py - 14 * u, 170 * u, 28 * u, 8 * u); ctx.fill();
      drawIcon(k, L0 + 16 * u, py, 11 * u);
      txt(P.name, L0 + 34 * u, py + 1 * u, 11 * u, P.color, 'left');
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(L0 + 34 * u, py + 5 * u, 128 * u, 4 * u);
      ctx.fillStyle = P.color; ctx.fillRect(L0 + 34 * u, py + 5 * u, 128 * u * f, 4 * u);
      py += 32 * u;
    }
  }
  // right: hearts, sprint, district
  const hs = (narrow ? 11 : 13) * u * (MAX_HEARTS > 8 ? 0.85 : 1);
  for (let i = 0; i < MAX_HEARTS; i++) heart(R0 - 12 * u - i * hs * 2.5, T0 + 30 * u, hs, i < player.hearts ? '#ff4757' : 'rgba(255,255,255,0.25)');
  const bw = (narrow ? 110 : 150) * u, bh = 12 * u, bx = R0 - bw, by = T0 + 52 * u;
  const infinite = power.energy > 0;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(bx - 3, by - 3, bw + 6, bh + 6, 4); ctx.fill();
  if (infinite) { ctx.fillStyle = 'hsl(' + ((gameTime * 300) % 360) + ',90%,60%)'; ctx.fillRect(bx, by, bw, bh); }
  else {
    ctx.fillStyle = player.winded ? '#7f8c8d' : player.sprinting ? '#7bed9f' : '#4cd137';
    ctx.fillRect(bx, by, bw * Math.min(player.stamina, STAMINA_NATURAL) / STAMINA_MAX, bh);
    if (player.stamina > STAMINA_NATURAL) { ctx.fillStyle = '#ffd32a'; ctx.fillRect(bx + bw * STAMINA_NATURAL / STAMINA_MAX, by, bw * (player.stamina - STAMINA_NATURAL) / STAMINA_MAX, bh); }
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(bx + bw * STAMINA_NATURAL / STAMINA_MAX, by, 2, bh);
  }
  const label = infinite ? 'SPRINT ∞' : player.winded ? 'WINDED!' : 'SPRINT ' + (player.stamina / SPRINT_DRAIN).toFixed(1) + 's';
  if (narrow) txt(label, R0, by + bh + 16 * u, 12 * u, player.winded && !infinite ? '#ff6b6b' : '#ffffff', 'right');
  else txt(label, bx - 8 * u, by + bh, 13 * u, player.winded && !infinite ? '#ff6b6b' : '#ffffff', 'right');
  txt(DISTRICTS[curDistrict].name, R0, by + bh + (narrow ? 32 : 20) * u, 11 * u, 'rgba(255,255,255,0.8)', 'right');
  // centre messages
  let y = T0 + (narrow ? 132 : 44) * u;
  const cw = narrow ? CW * 0.9 : CW * 0.5;
  if (combo > 1) {
    const f = clamp(1 - (elapsed - lastSlapT) / COMBO_WINDOW, 0, 1);
    fitTxt('COMBO x' + combo, cx, y, (28 + combo * 2) * u, combo >= 5 ? '#ff6b81' : '#ffdd59', cw);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - 80 * u, y + 8 * u, 160 * u, 6 * u);
    ctx.fillStyle = '#ffdd59'; ctx.fillRect(cx - 80 * u, y + 8 * u, 160 * u * f, 6 * u);
    y += 38 * u;
  }
  let nc = 0;
  for (const q of peds) if (q.state === 'chase') nc++;
  if (nc > 0 && gs === 'play') {
    const pulse = 1 + Math.sin(gameTime * 10) * 0.05;
    fitTxt(nc + ' CHASING YOU!', cx, y, 18 * u * pulse, '#ff6b6b', cw);
    txt('HEAT BONUS x' + (1 + 0.5 * nc).toFixed(1), cx, y + 18 * u, 12 * u, '#ffa502');
    y += 40 * u;
  }
  if (activeEvent) { const E = EVENTS[activeEvent.key]; fitTxt(E.name + '  ' + Math.ceil(activeEvent.t) + 's', cx, y, 15 * u, E.color, cw); }
  // item slots
  const SR = slotRects();
  for (let i = 0; i < MAX_ITEMS; i++) {
    const r = SR[i], k = inventory[i];
    ctx.fillStyle = k ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.3)';
    ctx.strokeStyle = k ? POWERS[k].color : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
    rr(r.x, r.y, r.s, r.s, r.s * 0.2); ctx.fill(); ctx.stroke();
    if (k) drawIcon(k, r.x + r.s / 2, r.y + r.s / 2, r.s * 0.34);
    if (!touchMode) txt(String(i + 1), r.x + 8 * u, r.y + 14 * u, 11 * u, '#ffffff', 'center');
  }
  if (!touchMode && inventory.length) fitTxt('E = use  ' + POWERS[inventory[0]].name, SR[0].x + (SR[MAX_ITEMS - 1].x + SR[0].s - SR[0].x) / 2, SR[0].y - 8 * u, 11 * u, '#ffffff', CW * 0.6);
  if (gs === 'play' && slaps === 0 && elapsed < 25) fitTxt('Just run into someone — the slap is automatic!', cx, touchMode ? CH * 0.62 : CH - SA.b - 105 * u, 18 * u, '#ffffff', CW * 0.9);
  if (!touchMode && gs === 'play' && !isShort()) {
    ctx.globalAlpha = 0.7;
    fitTxt('WASD move · hold SHIFT sprint · E item · SPACE re-slap chaser · hide in phone booths · P pause · M sound ' + (muted ? 'OFF' : 'ON'), L0, CH - SA.b - 8 * u, 10 * u, '#ffffff', CW - L0 * 2, 'left');
    ctx.globalAlpha = 1;
  }
  if (touchMode && gs === 'play') drawTouch();
  if (touchMode && gs === 'play') {
    if (narrow) button('II', cx, T0 + 104 * u, 40 * u, 30 * u, () => { gs = 'paused'; });
    else button('II', R0 - MAX_HEARTS * hs * 2.5 - 30 * u, T0 + 28 * u, 40 * u, 30 * u, () => { gs = 'paused'; });
  }
  drawToasts();
  if (announce) { // combo announcer: pops in the lower middle, never blocks the street for long
    const age = announce.max - announce.t, sc = 1 + 0.8 * Math.max(0, 1 - age / 0.12);
    ctx.globalAlpha = clamp(announce.t * 3, 0, 1);
    fitTxt(announce.text, cx, CH * 0.66, 40 * u * sc, 'hsl(' + ((gameTime * 400) % 360) + ',95%,65%)', CW * 0.9);
    ctx.globalAlpha = 1;
  }
  if (banner) {
    const age = banner.max - banner.t, sc = 1 + 0.5 * Math.max(0, 1 - age / 0.15);
    ctx.globalAlpha = clamp(banner.t * 2.5, 0, 1);
    fitTxt(banner.title, cx, CH * 0.36, 46 * u * sc, banner.color, CW * 0.92);
    fitTxt(banner.sub, cx, CH * 0.36 + 28 * u, 17 * u, '#ffffff', CW * 0.92);
    ctx.globalAlpha = 1;
  }
  if (gs === 'paused') drawPause();
  if (gs === 'over') drawOver();
  drawPanel();
  drawFps();
}
// small notes that slide in at the side — missions done, Slap Book entries, unlocks
function drawToasts() {
  if (!toasts.length) return;
  const u = UI, x = SA.l + 14 * u, maxW = Math.min(CW * 0.62, 460 * u);
  let y = isNarrow() ? CH * 0.5 : CH * 0.42;
  for (const t of toasts) {
    const a = clamp(Math.min(t.t * 2.5, (3.4 - t.t) * 6), 0, 1), slide = (1 - clamp((3.4 - t.t) * 6, 0, 1)) * -40 * u;
    const size = fitSize(t.text, 12 * u, maxW - 24 * u);
    ctx.font = fontPx(size);
    const w = ctx.measureText(t.text).width + 24 * u, h = 26 * u;
    ctx.globalAlpha = a * 0.85; ctx.fillStyle = 'rgba(10,12,20,0.8)'; rr(x + slide, y - h + 6 * u, w, h, 8 * u); ctx.fill();
    ctx.fillStyle = t.color; ctx.fillRect(x + slide, y - h + 6 * u, 4 * u, h);
    ctx.globalAlpha = a; txt(t.text, x + slide + 12 * u, y - 3 * u, size, t.color, 'left');
    y += h + 6 * u;
  }
  ctx.globalAlpha = 1;
}
let fpsShown = 60, fpsAcc = 0, fpsN = 0;
function drawFps() {
  if (!showFps) return;
  txt(fpsShown + ' FPS · ' + Q.label, SA.l + 10, CH - SA.b - (touchMode ? 8 : 24) * UI, 12, fpsShown >= 50 ? '#7bed9f' : fpsShown >= 30 ? '#ffd32a' : '#ff6b6b', 'left');
}
function drawTouch() {
  const B = touchButtons(), u = B.u;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
  ctx.fillStyle = sprintTouch !== null ? 'rgba(123,237,159,0.95)' : player.winded ? 'rgba(127,140,141,0.7)' : 'rgba(76,209,55,0.85)';
  circle(B.sprint.x, B.sprint.y, B.sprint.r);
  ctx.beginPath(); ctx.arc(B.sprint.x, B.sprint.y, B.sprint.r, 0, TAU); ctx.stroke();
  txt('SPRINT', B.sprint.x, B.sprint.y + 6 * u, 16 * u, '#ffffff');
  if (joy.active) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; circle(joy.ox, joy.oy, 60 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; circle(joy.ox + joy.vx * 60 * u, joy.oy + joy.vy * 60 * u, 24 * u);
  } else if (elapsed < 8) {
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
    circle(SA.l + 90 * u, CH - SA.b - 100 * u, 50 * u);
    ctx.globalAlpha = 0.85; txt('DRAG TO MOVE', SA.l + 90 * u, CH - SA.b - 96 * u, 11 * u, '#2d3436', 'center', false);
  }
  ctx.globalAlpha = 1;
}
// compact mission list (shown on title / pause / busted — never during play)
function drawMissions(x, y, w, size) {
  txt('MISSIONS  ·  they complete as you play', x, y, size * 0.85, '#7bed9f', 'left');
  y += size * 0.5;
  for (const m of save.missions) {
    y += size * 1.45;
    const f = clamp(m.prog / m.goal, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(x, y - size * 1.1, w, size * 1.35, size * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(123,237,159,0.35)'; rr(x, y - size * 1.1, Math.max(size * 0.6, w * f), size * 1.35, size * 0.3); ctx.fill();
    const prog = m.max ? Math.min(m.prog, m.goal) + '/' + m.goal : Math.min(m.prog, m.goal) + '/' + m.goal;
    fitTxt(m.text, x + size * 0.5, y, size * 0.8, '#ffffff', w - size * 8.2, 'left');
    txt(prog, x + w - size * 4, y, size * 0.72, '#dfe6e9', 'right');
    coinLabel(x + w - size * 0.4, y, size * 0.75, 'right', String(m.reward));
  }
  return y + size * 0.6;
}
function drawPause() {
  const u = UI, cx = CW / 2, bw = Math.min(CW * 0.8, 300 * u);
  ctx.fillStyle = 'rgba(10,12,20,0.65)'; ctx.fillRect(0, 0, CW, CH);
  let y = SA.t + Math.max(CH * 0.18, 60 * u);
  fitTxt('PAUSED', cx, y, 56 * u, '#ffffff', CW * 0.9);
  y += 46 * u;
  button('RESUME', cx, y, bw, 46 * u, () => { gs = 'play'; }, '#ff6b6b'); y += 56 * u;
  button('SETTINGS', cx, y, bw, 40 * u, () => openMenu('settings'), '#7bed9f'); y += 50 * u;
  button('QUIT TO TITLE', cx, y, bw, 40 * u, () => { persist(); reset(); gs = 'title'; }, '#dfe6e9'); y += 40 * u;
  drawMissions(cx - Math.min(CW * 0.9, 460 * u) / 2, y + 10 * u, Math.min(CW * 0.9, 460 * u), 16 * u);
}
function drawTitle() {
  const u0 = UI, cx = CW / 2, maxW = CW * 0.92 - SA.l - SA.r;
  ctx.fillStyle = 'rgba(10,12,20,0.5)'; ctx.fillRect(0, 0, CW, CH);
  const u = u0 * Math.min(1, (CH - SA.t - SA.b - 16) / (470 * u0)); // squeeze on short screens
  let y = SA.t + 10 * u;
  const logo = fitSize('SLAP & RUN!', 78 * u, maxW);
  ctx.save(); ctx.translate(cx, y + logo * 0.9); ctx.rotate(-0.05 + Math.sin(gameTime * 2) * 0.015);
  txt('SLAP & RUN!', 0, 0, logo, '#ffdd59'); ctx.restore();
  y += logo * 1.25;
  fitTxt('Slap strangers. They get up angry — and run FASTER than you.', cx, y, 16 * u, '#ffffff', maxW); y += 26 * u;
  const pf = currentProfile(), lv = levelInfo(save.stats.xp);
  button(pf.name + '  ·  LV ' + lv.level + '   ', cx - 70 * u, y - 5 * u, 150 * u, 28 * u, () => openMenu('profile'), pf.color);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(cx - 130 * u, y + 7 * u, 120 * u, 3 * u);
  ctx.fillStyle = pf.color; ctx.fillRect(cx - 130 * u, y + 7 * u, 120 * u * lv.into / lv.need, 3 * u);
  coinLabel(cx + 70 * u, y + 1 * u, 18 * u, 'center');
  if (best > 0) txt('BEST ' + best.toLocaleString(), cx + 70 * u, y + 19 * u, 11 * u, '#ffe082');
  y += 46 * u;
  const bw = Math.min(maxW, 360 * u);
  button(IS_TOUCH_DEVICE || touchMode ? 'PLAY' : 'PLAY   [SPACE]', cx, y, bw, 52 * u, () => { if (!menu) startFromTap(); }, '#ff6b6b'); y += 50 * u;
  const sw = (bw - 16 * u) / 3;
  button('SHOP', cx - sw - 8 * u, y, sw, 38 * u, () => openMenu('shop'), '#ffd32a');
  button('SLAP BOOK ' + bookCount() + '/' + BOOK_TYPES.length, cx, y, sw, 38 * u, () => openMenu('book'), '#e056fd');
  button('SETTINGS', cx + sw + 8 * u, y, sw, 38 * u, () => openMenu('settings'), '#7bed9f');
  y += 46 * u;
  y = drawMissions(cx - bw / 2, y, bw, 15 * u);
  const hint = touchMode || IS_TOUCH_DEVICE ? 'Drag to move · slaps are automatic · hold SPRINT · tap items to use them'
    : 'WASD move · slaps are automatic · hold SHIFT to sprint · E uses items · SPACE re-slaps a chaser';
  ctx.globalAlpha = 0.8; fitTxt(hint, cx, Math.min(CH - SA.b - 10 * u, y + 20 * u), 12 * u, '#c8d6e5', maxW); ctx.globalAlpha = 1;
}
function drawOver() {
  const u0 = UI, cx = CW / 2, maxW = CW * 0.92;
  const u = u0 * Math.min(1, (CH - SA.t - SA.b - 16) / (500 * u0));
  ctx.fillStyle = 'rgba(10,12,20,' + Math.min(0.72, overT * 1.2) + ')'; ctx.fillRect(0, 0, CW, CH);
  let y = SA.t + 66 * u;
  fitTxt('BUSTED!', cx, y, 64 * u, '#ff4757', maxW); y += 44 * u;
  fitTxt('SCORE  ' + score.toLocaleString(), cx, y, 32 * u, '#ffffff', maxW);
  if (newBest && ((gameTime * 3) | 0) % 2 === 0) txt('NEW BEST!', cx, y + 24 * u, 17 * u, '#ffdd59');
  y += 52 * u;
  coinLabel(cx, y, 22 * u, 'center', '+' + runCoins + ' coins'); y += 18 * u;
  txt('(includes +' + runBonus + ' end-of-run bonus)  ·  total ' + save.coins.toLocaleString(), cx, y, 11 * u, '#dfe6e9');
  y += 22 * u;
  const lvi = levelInfo(save.stats.xp);
  fitTxt(currentProfile().name + '  +' + runXp + ' XP  ·  LV ' + lvi.level + '  (' + lvi.into + '/' + lvi.need + ')', cx, y, 13 * u, '#a29bfe', maxW);
  if (runLevelUp && ((gameTime * 3) | 0) % 2 === 0) fitTxt('LEVEL UP! You reached LV ' + runLevelUp + ' (+' + 25 * runLevelUp + ' coins)', cx, y + 20 * u, 15 * u, '#e056fd', maxW);
  y += runLevelUp ? 44 * u : 26 * u;
  for (const r of newRecords.slice(0, 2)) { fitTxt('NEW RECORD: ' + r + '!', cx, y, 15 * u, '#ffdd59', maxW); y += 21 * u; }
  for (const m of runDone.slice(0, 3)) { fitTxt('MISSION DONE: ' + m.text + '  +' + m.reward, cx, y, 13 * u, '#7bed9f', maxW); y += 19 * u; }
  fitTxt('Slaps ' + slaps + '  ·  Best combo x' + bestCombo + '  ·  Escapes ' + escapes + '  ·  Close calls ' + runClose + '  ·  ' + fmtTime(elapsed), cx, y + 4 * u, 13 * u, '#ffe082', maxW);
  y += 28 * u;
  const g = nextGoal();
  if (g) fitTxt(save.coins >= g.cost ? 'You can afford ' + g.name + ' (' + g.cost + ') — visit the shop!' : 'Next upgrade: ' + g.name + ' — ' + (g.cost - save.coins) + ' more coins', cx, y, 14 * u, save.coins >= g.cost ? '#7bed9f' : '#c8d6e5', maxW);
  y += 34 * u;
  if (overT > 0.9) {
    const bw = Math.min(maxW, 340 * u), sw = (bw - 10 * u) / 2;
    button(touchMode ? 'PLAY AGAIN' : 'PLAY AGAIN  [SPACE]', cx, y, bw, 48 * u, () => { if (!menu) startGame(); }, '#ff6b6b'); y += 54 * u;
    button('SHOP', cx - sw / 2 - 5 * u, y, sw, 38 * u, () => openMenu('shop'), '#ffd32a');
    button('SLAP BOOK', cx + sw / 2 + 5 * u, y, sw, 38 * u, () => openMenu('book'), '#e056fd');
  }
}

// ---------- panels: shop, Slap Book, settings ----------
const TYPE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#f1c40f', '#fd79a8', '#00b894', '#6c5ce7', '#ff7675', '#74b9ff'];
function drawPanel() {
  if (!menu) return;
  const u = UI;
  ctx.fillStyle = 'rgba(8,10,18,0.82)'; ctx.fillRect(0, 0, CW, CH);
  const pw = Math.min(CW - SA.l - SA.r - 16, 760 * u), ph = CH - SA.t - SA.b - 20;
  const px = (CW - pw) / 2, py = SA.t + 10;
  ctx.fillStyle = 'rgba(30,34,48,0.97)'; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
  rr(px, py, pw, ph, 16 * u); ctx.fill(); ctx.stroke();
  const title = { shop: 'SHOP', book: 'SLAP BOOK', settings: 'SETTINGS', profile: 'PLAYER' }[menu];
  txt(title, px + 18 * u, py + 36 * u, 26 * u, { shop: '#ffd32a', book: '#e056fd', settings: '#7bed9f', profile: '#48dbfb' }[menu], 'left');
  coinLabel(px + pw - 64 * u, py + 34 * u, 16 * u, 'right');
  button('X', px + pw - 30 * u, py + 28 * u, 36 * u, 32 * u, () => { menu = null; persist(); }, '#ff6b6b');
  let top = py + 56 * u;
  if (menu === 'shop') {
    const tabs = ['SKILLS', 'GEAR', 'PERKS', 'STYLE'], tw = (pw - 36 * u) / tabs.length;
    tabs.forEach((t, i) => button(t, px + 18 * u + tw * (i + 0.5), top + 16 * u, tw - 6 * u, 30 * u, () => { shopTab = t; panelScroll = 0; }, shopTab === t ? '#ffd32a' : '#8395a7'));
    top += 40 * u;
  }
  const area = { x: px + 12 * u, y: top, w: pw - 24 * u, h: py + ph - top - 12 * u };
  ctx.save();
  ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
  const contentH = menu === 'shop' ? drawShop(area, u) : menu === 'book' ? drawBook(area, u) : menu === 'profile' ? drawProfile(area, u) : drawSettings(area, u);
  ctx.restore();
  panelMax = Math.max(0, contentH - area.h);
  panelScroll = clamp(panelScroll, 0, panelMax);
  if (panelNote && panelNote.t > gameTime) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; const nw = Math.min(pw - 40, 520 * u); rr(px + (pw - nw) / 2, py + ph - 52 * u, nw, 38 * u, 10 * u); ctx.fill(); fitTxt(panelNote.text, px + pw / 2, py + ph - 27 * u, 13 * u, panelNote.color, nw - 20); }
  if (panelMax > 0) { // scrollbar
    const sh = area.h * area.h / contentH;
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(area.x + area.w - 4, area.y + (area.h - sh) * panelScroll / panelMax, 4, sh, 2); ctx.fill();
  }
}
// buttons inside the scrolling area are only clickable while visible
function areaButton(area, label, x, y, w, h, action, color) {
  if (y + h / 2 < area.y || y - h / 2 > area.y + area.h) return;
  button(label, x, y, w, h, action, color);
}
function drawShop(A, u) {
  let y = A.y - panelScroll + 6 * u;
  const rowH = 66 * u;
  if (shopTab !== 'STYLE') {
    for (const up of UPGRADES.filter(x => x.tab === shopTab)) {
      const L = lvl(up.id), maxed = L >= up.max, cost = upCost(up), afford = save.coins >= cost;
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(A.x, y, A.w - 8, rowH - 8 * u, 10 * u); ctx.fill();
      drawIcon(up.icon, A.x + 30 * u, y + rowH / 2 - 4 * u, 16 * u);
      txt(up.name, A.x + 58 * u, y + 24 * u, 16 * u, '#ffffff', 'left');
      for (let i = 0; i < up.max; i++) { ctx.fillStyle = i < L ? '#ffd32a' : 'rgba(255,255,255,0.2)'; rr(A.x + 58 * u + i * 16 * u, y + 32 * u, 12 * u, 6 * u, 3); ctx.fill(); }
      fitTxt(up.desc, A.x + 58 * u, y + 52 * u, 11 * u, '#c8d6e5', A.w - 200 * u, 'left');
      areaButton(A, maxed ? 'MAX' : 'BUY ' + cost, A.x + A.w - 72 * u, y + rowH / 2 - 4 * u, 120 * u, 36 * u, () => { if (!maxed) buyUpgrade(up); }, maxed ? '#8395a7' : afford ? '#7bed9f' : '#ff6b6b');
      y += rowH;
    }
    y += 6 * u;
    ctx.globalAlpha = 0.7; fitTxt('Upgrades help you slap and escape — but angry people stay faster than your normal run.', A.x + A.w / 2, y + 14 * u, 11 * u, '#c8d6e5', A.w - 20); ctx.globalAlpha = 1;
    y += 30 * u;
  } else {
    for (const [slot, head] of [['hat', 'HATS'], ['shirt', 'HOODIES'], ['trail', 'TRAILS'], ['glove', 'GLOVES']]) {
      txt(head, A.x + 6 * u, y + 20 * u, 14 * u, '#ffd32a', 'left'); y += 28 * u;
      for (const c of COSMETICS.filter(x => x.slot === slot)) {
        const owned = save.owned[c.id], eq = save.eq[slot] === c.id;
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(A.x, y, A.w - 8, 48 * u, 10 * u); ctx.fill();
        const sw = c.look ? (c.look.hat || c.look.shirt) : slot === 'trail' ? { trail_sparkle: '#ffffff', trail_flame: '#ff9f1a', trail_rainbow: 'hsl(' + ((gameTime * 200) % 360) + ',90%,60%)' }[c.id] || '#555' : c.id === 'glove_gold' ? '#f1c40f' : '#f1c27d';
        ctx.fillStyle = sw; circle(A.x + 26 * u, y + 24 * u, 13 * u);
        txt(c.name, A.x + 50 * u, y + 30 * u, 14 * u, '#ffffff', 'left');
        let label, col, act = () => buyCosmetic(c);
        if (eq) { label = 'EQUIPPED'; col = '#8395a7'; act = () => { }; }
        else if (owned) { label = 'EQUIP'; col = '#7bed9f'; }
        else if (c.unlock) { label = 'BOOK ' + bookCount() + '/' + c.unlock; col = '#e056fd'; act = () => { sfx.whiff(); }; }
        else { label = 'BUY ' + c.cost; col = save.coins >= c.cost ? '#7bed9f' : '#ff6b6b'; }
        areaButton(A, label, A.x + A.w - 72 * u, y + 24 * u, 120 * u, 32 * u, act, col);
        y += 54 * u;
      }
      y += 8 * u;
    }
  }
  return y + panelScroll - A.y;
}
function drawBook(A, u) {
  let y = A.y - panelScroll + 8 * u;
  const n = bookCount();
  fitTxt('You\'ve slapped ' + n + ' of ' + BOOK_TYPES.length + ' kinds of people. Pages fill in on their own as you play.', A.x + A.w / 2, y + 14 * u, 13 * u, '#ffffff', A.w - 20);
  y += 30 * u;
  for (const c of COSMETICS.filter(c => c.unlock)) {
    const got = save.owned[c.id];
    fitTxt((got ? 'UNLOCKED: ' : c.unlock + ' kinds → ') + c.name, A.x + A.w / 2, y + 12 * u, 12 * u, got ? '#7bed9f' : '#e056fd', A.w - 20);
    y += 20 * u;
  }
  y += 10 * u;
  const cols = Math.max(2, Math.floor(A.w / (150 * u))), cw = (A.w - 8) / cols, ch = 74 * u;
  BOOK_TYPES.forEach((t, i) => {
    const cx0 = A.x + (i % cols) * cw, cy0 = y + Math.floor(i / cols) * ch;
    const cnt = save.book[t] || 0;
    ctx.fillStyle = cnt ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)'; rr(cx0 + 3, cy0 + 3, cw - 6, ch - 6, 10 * u); ctx.fill();
    ctx.fillStyle = cnt ? TYPE_COLORS[i % TYPE_COLORS.length] : '#3d4048'; circle(cx0 + 26 * u, cy0 + ch / 2, 16 * u);
    txt(cnt ? TYPES[t].name.charAt(0) : '?', cx0 + 26 * u, cy0 + ch / 2 + 6 * u, 16 * u, '#ffffff');
    fitTxt(cnt ? TYPES[t].name : '???', cx0 + 50 * u, cy0 + ch / 2 - 2 * u, 13 * u, cnt ? '#ffffff' : '#636e72', cw - 58 * u, 'left');
    txt(cnt ? 'slapped x' + cnt : 'not met yet', cx0 + 50 * u, cy0 + ch / 2 + 16 * u, 10 * u, cnt ? '#ffd32a' : '#636e72', 'left');
  });
  y += Math.ceil(BOOK_TYPES.length / cols) * ch + 10 * u;
  return y + panelScroll - A.y;
}
function drawProfile(A, u) {
  let y = A.y - panelScroll + 8 * u;
  const pf = currentProfile(), st = save.stats, lv = levelInfo(st.xp), onTitle = gs === 'title';
  const x0 = A.x + 6 * u, w = A.w - 14 * u, mid = A.x + A.w / 2;
  ctx.fillStyle = pf.color; circle(x0 + 26 * u, y + 28 * u, 22 * u);
  txt(pf.name.charAt(0).toUpperCase(), x0 + 26 * u, y + 37 * u, 24 * u, '#ffffff');
  fitTxt(pf.name, x0 + 60 * u, y + 26 * u, 22 * u, '#ffffff', w - 200 * u, 'left');
  txt('LEVEL ' + lv.level + '   ·   ' + lv.into + ' / ' + lv.need + ' XP', x0 + 60 * u, y + 46 * u, 12 * u, '#a29bfe', 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; rr(x0 + 60 * u, y + 52 * u, Math.min(260 * u, w - 200 * u), 6 * u, 3); ctx.fill();
  ctx.fillStyle = pf.color; rr(x0 + 60 * u, y + 52 * u, Math.min(260 * u, w - 200 * u) * lv.into / lv.need, 6 * u, 3); ctx.fill();
  if (onTitle) areaButton(A, 'RENAME', A.x + A.w - 70 * u, y + 30 * u, 110 * u, 32 * u, () => { const n = window.prompt('Player name', pf.name); if (n !== null) { renameProfile(n); note('Renamed to ' + currentProfile().name); } }, '#48dbfb');
  y += 76 * u;
  // lifetime stats
  const t = st.time, hrs = Math.floor(t / 3600), mins = Math.floor((t % 3600) / 60);
  const rows = [
    ['Runs played', st.runs], ['Play time', (hrs ? hrs + 'h ' : '') + mins + 'm'], ['Faces slapped', st.slaps], ['Chasers escaped', st.escapes],
    ['Coins earned', st.coins], ['Close calls', st.close], ['Traffic takedowns', st.traffic], ['Boxes opened', st.boxes],
    ['Missions done', save.done], ['Slap Book', bookCount() + ' / ' + BOOK_TYPES.length],
    ['Best score', save.rec.score], ['Longest combo', 'x' + (save.rec.combo || 0)], ['Longest run', fmtTime(save.rec.time || 0)], ['Most slaps in a run', save.rec.slaps || 0],
  ];
  txt('LIFETIME STATS & RECORDS', x0, y + 14 * u, 13 * u, '#48dbfb', 'left'); y += 24 * u;
  const cols = A.w > 520 * u ? 2 : 1, cwid = (w - 10 * u) / cols, rh = 26 * u;
  rows.forEach(([k, v], i) => {
    const cx0 = x0 + (i % cols) * (cwid + 10 * u), cy0 = y + Math.floor(i / cols) * rh;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; rr(cx0, cy0, cwid, rh - 4 * u, 6 * u); ctx.fill();
    txt(k, cx0 + 10 * u, cy0 + 16 * u, 12 * u, '#c8d6e5', 'left');
    txt(typeof v === 'number' ? v.toLocaleString() : String(v), cx0 + cwid - 10 * u, cy0 + 16 * u, 12 * u, '#ffffff', 'right');
  });
  y += Math.ceil(rows.length / cols) * rh + 14 * u;
  // players on this device
  txt('PLAYERS ON THIS DEVICE', x0, y + 14 * u, 13 * u, '#48dbfb', 'left'); y += 24 * u;
  if (!onTitle) { ctx.globalAlpha = 0.7; fitTxt('Switch players from the title screen.', mid, y + 12 * u, 12 * u, '#c8d6e5', w); ctx.globalAlpha = 1; y += 26 * u; }
  for (const p of profiles.list) {
    const cur = p.id === profiles.current, ps = cur ? save : readSave(p.id), plv = levelInfo(ps.stats.xp).level;
    ctx.fillStyle = cur ? 'rgba(72,219,251,0.12)' : 'rgba(255,255,255,0.05)'; rr(x0, y, w, 44 * u, 10 * u); ctx.fill();
    ctx.fillStyle = p.color; circle(x0 + 22 * u, y + 22 * u, 13 * u);
    fitTxt(p.name + (cur ? '  (playing)' : ''), x0 + 44 * u, y + 20 * u, 14 * u, '#ffffff', w - 260 * u, 'left');
    txt('LV ' + plv + '  ·  ' + ps.coins.toLocaleString() + ' coins  ·  best ' + (ps.rec.score || 0).toLocaleString(), x0 + 44 * u, y + 36 * u, 10 * u, '#c8d6e5', 'left');
    if (onTitle && !cur) {
      areaButton(A, 'PLAY AS', x0 + w - 150 * u, y + 22 * u, 90 * u, 30 * u, () => { loadProfile(p.id); note('Now playing as ' + p.name); }, '#7bed9f');
      areaButton(A, 'DELETE', x0 + w - 50 * u, y + 22 * u, 80 * u, 30 * u, () => { if (window.confirm('Delete ' + p.name + ' and all their progress?')) { deleteProfile(p.id); note(p.name + ' deleted', '#ff6b6b'); } }, '#ff6b6b');
    }
    y += 50 * u;
  }
  const bw2 = Math.min(w, 300 * u), gap = 50 * u;
  if (onTitle && profiles.list.length < MAX_PROFILES) { areaButton(A, '+ NEW PLAYER', mid, y + 20 * u, bw2, 38 * u, () => { const n = window.prompt('New player name', 'Player ' + (profiles.list.length + 1)); if (n !== null) { newProfile(n); note('Welcome, ' + currentProfile().name + '!'); } }, '#7bed9f'); y += gap; }
  // moving progress between devices
  y += 6 * u;
  txt('MOVE PROGRESS TO ANOTHER DEVICE', x0, y + 14 * u, 13 * u, '#48dbfb', 'left'); y += 22 * u;
  ctx.globalAlpha = 0.8; for (const l of wrapLines('Progress is saved on this device only. Copy your backup code and paste it into the game on another phone or computer (or keep it somewhere safe in case browser data is cleared).', 11 * u, w)) { y += 15 * u; txt(l, x0, y, 11 * u, '#c8d6e5', 'left'); } ctx.globalAlpha = 1;
  y += 24 * u;
  areaButton(A, 'COPY BACKUP CODE', mid, y, bw2, 38 * u, () => {
    const code = exportCode();
    const fallback = () => window.prompt('Copy this backup code:', code);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => note('Backup code copied — paste it on your other device'), fallback);
    else fallback();
  }, '#ffeaa7');
  y += gap;
  if (onTitle) {
    areaButton(A, 'RESTORE FROM CODE', mid, y, bw2, 38 * u, () => {
      const code = window.prompt('Paste a backup code (it is added as a new player):', '');
      if (code === null) return;
      const r = importCode(code);
      if (r === 'full') note('This device already has ' + MAX_PROFILES + ' players — delete one first', '#ff6b6b');
      else if (r) note('Restored! Now playing as ' + r);
      else note('That code did not work — copy the whole code and try again', '#ff6b6b');
    }, '#ffeaa7');
    y += gap;
  }
  return y + panelScroll - A.y;
}
function drawSettings(A, u) {
  let y = A.y - panelScroll + 30 * u;
  const bw = Math.min(A.w - 20, 340 * u), x = A.x + A.w / 2, bh = 42 * u, gap = 54 * u;
  areaButton(A, qualityText(), x, y, bw, bh, cycleQualityMode, '#7bed9f'); y += gap;
  areaButton(A, 'SOUND: ' + (muted ? 'OFF' : 'ON'), x, y, bw, bh, () => { muted = !muted; }, '#74b9ff'); y += gap;
  areaButton(A, 'MUSIC: ' + (save.music ? 'ON' : 'OFF'), x, y, bw, bh, () => Music.toggle(), '#a29bfe'); y += gap;
  areaButton(A, 'FPS COUNTER: ' + (showFps ? 'ON' : 'OFF'), x, y, bw, bh, toggleFps, '#dfe6e9'); y += gap;
  if (IS_TOUCH_DEVICE && canFullscreen()) { areaButton(A, 'FULLSCREEN', x, y, bw, bh, toggleFullscreen, '#ffeaa7'); y += gap; }
  ctx.globalAlpha = 0.7;
  fitTxt('Keys: G graphics · M sound · F fps · B shop · N Slap Book', x, y, 11 * u, '#c8d6e5', A.w - 20);
  ctx.globalAlpha = 1;
  return y + 20 * u + panelScroll - A.y;
}

// ---------- touch / mouse ----------
function updJoy() {
  const R = 60 * touchButtons().u;
  let dx = joy.x - joy.ox, dy = joy.y - joy.oy;
  const l = Math.hypot(dx, dy);
  if (l > R) { joy.ox += dx * (l - R) / l; joy.oy += dy * (l - R) / l; dx = joy.x - joy.ox; dy = joy.y - joy.oy; }
  const k = Math.hypot(dx, dy) < R * 0.15 ? 0 : 1 / R;
  joy.vx = dx * k; joy.vy = dy * k;
}
function startFromTap() {
  // small touch screens get fullscreen automatically when a run starts
  if (gs === 'title' && IS_TOUCH_DEVICE && Math.min(CW, CH) < 600 && canFullscreen() && !document.fullscreenElement) toggleFullscreen();
  primary();
}
let panelDrag = null; // panels scroll by dragging; a tap without dragging presses a button
cv.addEventListener('touchstart', e => {
  e.preventDefault(); touchMode = true; ac(); Music.start();
  const B = touchButtons();
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (menu) { panelDrag = { id: t.identifier, x, y, s0: panelScroll, moved: false }; continue; }
    if (hitButton(x, y)) continue;
    if (gs !== 'play') { if (gs === 'title' || (gs === 'over' && overT > 0.9)) startFromTap(); continue; }
    if (Math.hypot(x - B.sprint.x, y - B.sprint.y) < B.sprint.r * 1.25) { sprintTouch = t.identifier; continue; }
    const SR = slotRects();
    let hit = false;
    for (let i = 0; i < MAX_ITEMS; i++) { const r = SR[i]; if (x >= r.x - 6 && x <= r.x + r.s + 6 && y >= r.y - 6 && y <= r.y + r.s + 6) { useItem(i); hit = true; } }
    if (hit) continue;
    if (joy.id === null && x < CW * 0.6) { joy.id = t.identifier; joy.ox = joy.x = x; joy.oy = joy.y = y; joy.active = true; updJoy(); }
  }
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; updJoy(); }
    if (panelDrag && t.identifier === panelDrag.id) {
      const dy = t.clientY - panelDrag.y;
      if (Math.abs(dy) > 10) panelDrag.moved = true;
      if (panelDrag.moved) panelScroll = clamp(panelDrag.s0 - dy, 0, panelMax);
    }
  }
}, { passive: false });
function endTouch(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.id = null; joy.active = false; joy.vx = joy.vy = 0; }
    if (t.identifier === sprintTouch) sprintTouch = null;
    if (panelDrag && t.identifier === panelDrag.id) { if (!panelDrag.moved && e.type === 'touchend') hitButton(panelDrag.x, panelDrag.y); panelDrag = null; }
  }
}
cv.addEventListener('touchend', endTouch);
cv.addEventListener('touchcancel', endTouch);
let mouseDrag = null;
cv.addEventListener('mousedown', e => {
  ac(); Music.start();
  if (menu) { mouseDrag = { x: e.clientX, y: e.clientY, s0: panelScroll, moved: false }; return; }
  if (hitButton(e.clientX, e.clientY)) return;
  if (gs === 'play') trySlap(); else if (gs === 'title') primary();
});
window.addEventListener('mousemove', e => {
  if (!mouseDrag || !(e.buttons & 1)) return;
  const dy = e.clientY - mouseDrag.y;
  if (Math.abs(dy) > 6) mouseDrag.moved = true;
  if (mouseDrag.moved) panelScroll = clamp(mouseDrag.s0 - dy, 0, panelMax);
});
window.addEventListener('mouseup', () => { if (mouseDrag && !mouseDrag.moved) hitButton(mouseDrag.x, mouseDrag.y); mouseDrag = null; });
cv.addEventListener('wheel', e => { if (menu) { panelScroll = clamp(panelScroll + e.deltaY, 0, panelMax); e.preventDefault(); } }, { passive: false });
// menu keys run before the game's own key handler
window.addEventListener('keydown', e => {
  Music.start();
  if (menu) {
    if (e.code === 'Escape' || e.code === 'Backspace') { menu = null; persist(); }
    if (e.code === 'ArrowDown') panelScroll = clamp(panelScroll + 60, 0, panelMax);
    if (e.code === 'ArrowUp') panelScroll = clamp(panelScroll - 60, 0, panelMax);
    if (e.code !== 'KeyM' && e.code !== 'KeyF' && e.code !== 'KeyG') { e.stopImmediatePropagation(); e.preventDefault(); }
    return;
  }
  if (gs === 'title' || gs === 'over' || gs === 'paused') {
    if (e.code === 'KeyB' && gs !== 'paused') { openMenu('shop'); e.stopImmediatePropagation(); }
    else if (e.code === 'KeyN' && gs !== 'paused') { openMenu('book'); e.stopImmediatePropagation(); }
  }
}, true);
cv.addEventListener('contextmenu', e => e.preventDefault());
if (window.visualViewport) visualViewport.addEventListener('resize', resizeAll);
window.addEventListener('orientationchange', () => setTimeout(resizeAll, 250));
qualityListeners.push(resizeAll);

// ---------- main loop ----------
function render(dt = 0) {
  V.frame(dt);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  drawWorldOverlay();
  drawHUD();
}
resizeAll();
reset();
try { V.warmup(); } catch (e) { console.warn('warmup skipped', e); }
let last = performance.now();
function loop(now) {
  const raw = now - last;
  const dt = clamp(raw / 1000, 0, 0.05); // rAF timestamps can trail performance.now()
  last = now;
  update(dt);
  render(dt);
  trackFrameTime(raw, now);
  if (raw > 0 && raw < 250) { fpsAcc += raw; fpsN++; if (fpsAcc > 500) { fpsShown = Math.round(1000 * fpsN / fpsAcc); fpsAcc = fpsN = 0; } }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
