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
  }
  ctx.restore();
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
      case 'smoke': ctx.fillStyle = p.color; circle(s.x, s.y, p.size * k); break;
      default: ctx.fillStyle = p.color; circle(s.x, s.y, p.size * k);
    }
  }
  ctx.globalAlpha = 1;
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
  for (const it of items) {
    if (it.kind === 'pizza') continue;
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
  ctx.font = fontPx(size);
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
function touchButtons() {
  const u = clamp(Math.min(CW, CH) / 420, 0.75, 1.35);
  return { slap: { x: CW - SA.r - 82 * u, y: CH - SA.b - 95 * u, r: 50 * u }, sprint: { x: CW - SA.r - 196 * u, y: CH - SA.b - 64 * u, r: 44 * u }, u };
}
function slotRects() {
  const out = [];
  if (touchMode && isShort()) { // landscape phone: a row left of SPRINT so the street stays clear
    const B = touchButtons(), s = 42 * B.u, gap = 8 * B.u;
    for (let i = 0; i < MAX_ITEMS; i++) out.push({ x: B.sprint.x - B.sprint.r - 14 * B.u - (i + 1) * s - i * gap, y: B.sprint.y - s / 2, s });
  } else if (touchMode) { // a column above the SLAP button, within reach of the right thumb
    const B = touchButtons(), s = 46 * B.u, gap = 8 * B.u;
    for (let i = 0; i < MAX_ITEMS; i++) out.push({ x: B.slap.x - s / 2, y: B.slap.y - B.slap.r - 14 * B.u - (i + 1) * s - i * gap, s });
  } else {
    const u = UI, s = 50 * u, gap = 10 * u, total = MAX_ITEMS * s + (MAX_ITEMS - 1) * gap;
    for (let i = 0; i < MAX_ITEMS; i++) out.push({ x: CW / 2 - total / 2 + i * (s + gap), y: CH - SA.b - s - 30 * u, s });
  }
  return out;
}
function drawHUD() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  uiButtons = [];
  const u = UI, cx = CW / 2, narrow = isNarrow(), compact = narrow || isShort(), L0 = SA.l + 16 * u, R0 = CW - SA.r - 16 * u, T0 = SA.t;
  if (gs === 'title') { drawTitle(); return; }
  // left: score & stats
  txt(score.toLocaleString(), L0, T0 + 42 * u, 36 * u, '#ffffff', 'left');
  fitTxt('SLAPS ' + slaps + '   ESCAPES ' + escapes + '   ' + fmtTime(elapsed), L0, T0 + 64 * u, 14 * u, '#ffe082', narrow ? CW * 0.5 : 380 * u, 'left');
  // active power-ups: list on wide screens, compact icon row on narrow ones
  let py = T0 + 92 * u, px = L0 + 14 * u;
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
  const hs = narrow ? 11 * u : 13 * u;
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
  // centre messages (pushed below the corner widgets on narrow screens)
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
  if (!touchMode && inventory.length) fitTxt('E = use  ' + POWERS[inventory[0]].name, SR[1].x + SR[1].s / 2, SR[0].y - 8 * u, 11 * u, '#ffffff', CW * 0.6);
  if (gs === 'play' && slaps === 0 && elapsed < 25) fitTxt('Just run into someone — the slap is automatic!', cx, touchMode ? CH * 0.62 : CH - SA.b - 105 * u, 18 * u, '#ffffff', CW * 0.9);
  if (!touchMode && gs === 'play' && !isShort()) {
    ctx.globalAlpha = 0.7;
    fitTxt('WASD move · hold SHIFT sprint · E item · SPACE re-slap chaser · hide in phone booths · P pause · G graphics · M sound ' + (muted ? 'OFF' : 'ON'), L0, CH - SA.b - 8 * u, 10 * u, '#ffffff', CW - L0 * 2, 'left');
    ctx.globalAlpha = 1;
  }
  if (touchMode && gs === 'play') drawTouch();
  if (touchMode && gs === 'play') {
    if (narrow) button('II', cx, T0 + 104 * u, 40 * u, 30 * u, () => { gs = 'paused'; });
    else button('II', R0 - MAX_HEARTS * hs * 2.5 - 30 * u, T0 + 28 * u, 40 * u, 30 * u, () => { gs = 'paused'; });
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
  drawFps();
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
  ctx.fillStyle = 'rgba(231,76,60,0.85)'; circle(B.slap.x, B.slap.y, B.slap.r);
  ctx.beginPath(); ctx.arc(B.slap.x, B.slap.y, B.slap.r, 0, TAU); ctx.stroke();
  txt('SLAP', B.slap.x, B.slap.y + 7 * u, 18 * u, '#ffffff');
  ctx.fillStyle = sprintTouch !== null ? 'rgba(123,237,159,0.95)' : player.winded ? 'rgba(127,140,141,0.7)' : 'rgba(76,209,55,0.85)';
  circle(B.sprint.x, B.sprint.y, B.sprint.r);
  ctx.beginPath(); ctx.arc(B.sprint.x, B.sprint.y, B.sprint.r, 0, TAU); ctx.stroke();
  txt('SPRINT', B.sprint.x, B.sprint.y + 5 * u, 13 * u, '#ffffff');
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
function menuButtons(y, u) {
  const bw = Math.min(CW * 0.8, 300 * u), bh = 40 * u, gap = 12 * u, cx = CW / 2;
  button(qualityText(), cx, y, bw, bh, cycleQualityMode, '#7bed9f'); y += bh + gap;
  button('SOUND: ' + (muted ? 'OFF' : 'ON'), cx, y, bw, bh, () => { muted = !muted; }, '#74b9ff'); y += bh + gap;
  button('FPS COUNTER: ' + (showFps ? 'ON' : 'OFF'), cx, y, bw, bh, toggleFps, '#dfe6e9'); y += bh + gap;
  if (IS_TOUCH_DEVICE && canFullscreen()) { button('FULLSCREEN', cx, y, bw, bh, toggleFullscreen, '#ffeaa7'); y += bh + gap; }
  return y;
}
function drawPause() {
  const u = UI, cx = CW / 2;
  ctx.fillStyle = 'rgba(10,12,20,0.65)'; ctx.fillRect(0, 0, CW, CH);
  let y = CH * 0.28;
  fitTxt('PAUSED', cx, y, 60 * u, '#ffffff', CW * 0.9);
  y += 50 * u;
  button('RESUME', cx, y, Math.min(CW * 0.8, 300 * u), 46 * u, () => { gs = 'play'; }, '#ff6b6b');
  menuButtons(y + 58 * u, u);
}
function drawTitle() {
  const u = UI, cx = CW / 2, maxW = CW * 0.92 - SA.l - SA.r, short = isShort();
  ctx.fillStyle = 'rgba(10,12,20,0.5)'; ctx.fillRect(0, 0, CW, CH);
  const logo = fitSize('SLAP & RUN!', (short ? 60 : 84) * u, maxW);
  ctx.save();
  ctx.translate(cx, SA.t + logo * 1.05); ctx.rotate(-0.05 + Math.sin(gameTime * 2) * 0.015);
  txt('SLAP & RUN!', 0, 0, logo, '#ffdd59');
  ctx.restore();
  const controls = touchMode || IS_TOUCH_DEVICE
    ? [{ text: 'Drag on the left side to move — slaps are automatic!', size: 16 * u, color: '#ffe082' },
       { text: 'Hold SPRINT to run fast · tap the item slots to use items', size: 16 * u, color: '#ffe082', gap: 8 * u }]
    : [{ text: 'MOVE — WASD / Arrows   ·   SLAP — automatic, just run into people', size: 16 * u, color: '#ffe082' },
       { text: 'SPRINT — hold SHIFT   ·   ITEMS — grab ? boxes, use with E or 1-3', size: 16 * u, color: '#ffe082' },
       { text: 'RE-SLAP A CHASER — SPACE   ·   PAUSE — P   ·   GRAPHICS — G   ·   FPS — F   ·   SOUND — M', size: 14 * u, color: '#ffe082', gap: 8 * u }];
  const entries = [
    { text: 'Slap strangers. They get back up angry — and they run FASTER than you.', size: 17 * u, color: '#ffffff' },
    { text: 'Slap as many as you dare. You have 8 hearts — grab floating hearts, first-aid kits, pizza and combo bonuses to refill them.', size: 15 * u, color: '#dfe6e9', gap: 12 * u },
    ...controls,
    { text: 'Shake off the haters: sprint, hide in phone booths, lure them into traffic or open manholes, run through pigeons, wait for the ice cream truck — or use UFOs, pies, freeze rays, tornados, cash and flowers.', size: 13 * u, color: '#c8d6e5' },
    { text: '24 kinds of people across 4 neighbourhoods, with day and night.', size: 13 * u, color: '#c8d6e5' },
  ];
  const nBtn = short ? 1 : 3 + (IS_TOUCH_DEVICE && canFullscreen() ? 1 : 0);
  const btnH = 40 * u, footer = nBtn * (btnH + 12 * u) + 60 * u;
  const end = drawBlock(entries, SA.t + logo * 1.35, CH - SA.b - footer, maxW);
  let y = Math.max(end + 30 * u, CH - SA.b - footer + 26 * u);
  if (((gameTime * 2) | 0) % 2 === 0) fitTxt(touchMode || IS_TOUCH_DEVICE ? 'TAP TO START' : 'PRESS SPACE TO START', cx, y, 28 * u, '#ff6b6b', maxW);
  if (best > 0) txt('BEST ' + best.toLocaleString(), cx, y + 22 * u, 13 * u, '#ffe082');
  y += 44 * u;
  if (short) { const bw = Math.min(CW * 0.42, 260 * u); button(qualityText(), cx - bw / 2 - 6 * u, y + 6 * u, bw, btnH * 0.85, cycleQualityMode, '#7bed9f'); button('SOUND: ' + (muted ? 'OFF' : 'ON'), cx + bw / 2 + 6 * u, y + 6 * u, bw, btnH * 0.85, () => { muted = !muted; }, '#74b9ff'); }
  else menuButtons(y + 10 * u, u);
}
function drawOver() {
  const u = UI, cx = CW / 2, maxW = CW * 0.92;
  ctx.fillStyle = 'rgba(10,12,20,' + Math.min(0.7, overT * 1.2) + ')'; ctx.fillRect(0, 0, CW, CH);
  let y = SA.t + Math.max(CH * 0.2, 70 * u);
  fitTxt('BUSTED!', cx, y, 80 * u, '#ff4757', maxW);
  y += 52 * u;
  fitTxt('SCORE  ' + score.toLocaleString(), cx, y, 36 * u, '#ffffff', maxW);
  if (newBest && ((gameTime * 3) | 0) % 2 === 0) txt('NEW BEST!', cx, y + 30 * u, 20 * u, '#ffdd59');
  const end = drawBlock([
    { text: 'Faces slapped: ' + slaps + '   ·   Best combo: x' + bestCombo + '   ·   Escapes: ' + escapes, size: 17 * u, color: '#ffe082' },
    { text: 'Traffic takedowns: ' + carHits + '   ·   Boxes opened: ' + boxesOpened + '   ·   Survived: ' + fmtTime(elapsed), size: 17 * u, color: '#ffe082' },
    { text: 'Best score: ' + best.toLocaleString(), size: 15 * u, color: '#c8d6e5' },
  ], y + 44 * u, CH - SA.b - 70 * u, maxW);
  if (overT > 0.9 && ((gameTime * 2) | 0) % 2 === 0) fitTxt(touchMode ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', cx, Math.min(end + 44 * u, CH - SA.b - 24 * u), 26 * u, '#ff6b6b', maxW);
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
cv.addEventListener('touchstart', e => {
  e.preventDefault(); touchMode = true; ac();
  const B = touchButtons();
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (hitButton(x, y)) continue;
    if (gs !== 'play') { if (gs !== 'paused') startFromTap(); continue; }
    if (Math.hypot(x - B.slap.x, y - B.slap.y) < B.slap.r * 1.2) { trySlap(); continue; }
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
  for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; updJoy(); }
}, { passive: false });
function endTouch(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.id = null; joy.active = false; joy.vx = joy.vy = 0; }
    if (t.identifier === sprintTouch) sprintTouch = null;
  }
}
cv.addEventListener('touchend', endTouch);
cv.addEventListener('touchcancel', endTouch);
cv.addEventListener('mousedown', e => {
  ac();
  if (hitButton(e.clientX, e.clientY)) return;
  if (gs === 'play') trySlap(); else if (gs !== 'paused') primary();
});
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
