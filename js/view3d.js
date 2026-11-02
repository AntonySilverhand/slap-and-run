'use strict';
// =====================================================================
//  3D renderer (Three.js). Game x -> X, game y (depth) -> Z, height -> Y.
//  Characters face +X in their local space.
// =====================================================================

const V = (() => {
  const glCanvas = document.getElementById('gl');
  // phones have dense screens already, so skip MSAA there
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !IS_TOUCH_DEVICE, powerPreference: 'high-performance' });
  const applyDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  applyDpr();
  const scene = new THREE.Scene();
  const FOV = 38;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 5, 7000);
  const DAY_SKY = new THREE.Color('#8ec9f2'), DUSK_SKY = new THREE.Color('#f5a26b'), NIGHT_SKY = new THREE.Color('#1b2340');
  scene.background = DAY_SKY.clone();
  scene.fog = new THREE.Fog(scene.background, 1700, 4600);
  const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x8a7f70, 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(-0.45, 1, 0.75);
  scene.add(sun);

  // ---------- material & geometry caches ----------
  const grad = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const matCache = new Map();
  function mat(color, opt) {
    const key = color + (opt ? JSON.stringify(opt) : '');
    let m = matCache.get(key);
    if (!m) { m = new THREE.MeshToonMaterial(Object.assign({ color: new THREE.Color(color), gradientMap: grad }, opt || {})); matCache.set(key, m); }
    return m;
  }
  const basicCache = new Map();
  function basic(color, opacity = 1) {
    const key = color + opacity;
    let m = basicCache.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); basicCache.set(key, m); }
    return m;
  }
  const geoCache = new Map();
  const r2 = v => Math.round(v * 2) / 2;
  function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
  const box = (w, h, d) => geo('b' + r2(w) + ',' + r2(h) + ',' + r2(d), () => new THREE.BoxGeometry(r2(w), r2(h), r2(d)));
  const sph = (r, ws = 14, hs = 10) => geo('s' + r2(r) + ',' + ws, () => new THREE.SphereGeometry(r2(r), ws, hs));
  const cyl = (rt, rb, h, seg = 12, open = false) => geo('c' + r2(rt) + ',' + r2(rb) + ',' + r2(h) + ',' + seg + open, () => new THREE.CylinderGeometry(r2(rt), r2(rb), r2(h), seg, 1, open));
  const cone = (r, h, seg = 8) => geo('k' + r2(r) + ',' + r2(h) + ',' + seg, () => new THREE.ConeGeometry(r2(r), r2(h), seg));
  const dome = (r, frac = 0.55) => geo('d' + r2(r) + ',' + frac, () => new THREE.SphereGeometry(r2(r), 16, 8, 0, TAU, 0, Math.PI * frac));
  const torus = (r, t, arc = TAU) => geo('t' + r + ',' + t + ',' + arc, () => new THREE.TorusGeometry(r, t, 6, 14, arc));
  const disc = r => geo('o' + r, () => new THREE.CircleGeometry(r, 20));
  function mesh(g, m, x = 0, y = 0, z = 0, parent) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    if (parent) parent.add(o);
    return o;
  }
  // ---------- draw-call reduction ----------
  // Static meshes are baked together. Plain-coloured toon/basic meshes go into ONE mesh per
  // group using vertex colours (so different colours still merge); textured, transparent or
  // special materials merge only with meshes that share the exact same material.
  const vcToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
  const vcBasic = new THREE.MeshBasicMaterial({ vertexColors: true });
  const isPlain = m => !m.map && !m.transparent && m.side === THREE.FrontSide && !m.userData.keep && !m.vertexColors;
  function bucketKey(m) {
    if (isPlain(m) && m.isMeshToonMaterial) return vcToon;
    if (isPlain(m) && m.isMeshBasicMaterial) return vcBasic;
    return m;
  }
  function mergeGeos(geos, cols) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = cols ? new Float32Array(n * 3) : null;
    let o = 0;
    geos.forEach((g, i) => {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (col) { const k = cols[i]; for (let j = 0; j < c; j++) { col[(o + j) * 3] = k.r; col[(o + j) * 3 + 1] = k.g; col[(o + j) * 3 + 2] = k.b; } }
      o += c;
    });
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    r.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) r.setAttribute('color', new THREE.BufferAttribute(col, 3));
    r.computeBoundingSphere();
    return r;
  }
  const mergeable = m => m.isMesh && !m.userData.dyn && !m.children.length && !Array.isArray(m.material) && (m.material.isMeshToonMaterial || m.material.isMeshBasicMaterial);
  function bake(list, matrixOf, key) {
    const geos = list.map(ch => { const g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone(); g.applyMatrix4(matrixOf(ch)); return g; });
    const vc = key === vcToon || key === vcBasic;
    const merged = mergeGeos(geos, vc ? list.map(ch => ch.material.color) : null);
    geos.forEach(g => g.dispose());
    return merged;
  }
  // merge within each group separately (keeps animated limbs independent) — used for characters
  function mergePerGroup(root, own) {
    const groups = [];
    root.traverse(n => { if (n.isGroup || n === root) groups.push(n); });
    for (const node of groups) {
      const buckets = new Map();
      for (const ch of node.children) if (mergeable(ch)) { const k = bucketKey(ch.material); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(ch); }
      for (const [k, list] of buckets) {
        if (list.length < 2) continue;
        const merged = bake(list, ch => { ch.updateMatrix(); return ch.matrix; }, k);
        for (const ch of list) node.remove(ch);
        node.add(new THREE.Mesh(merged, k)); own.push(merged);
      }
    }
  }
  // flatten a whole static subtree into one mesh per bucket — used for street scenery
  function mergeDeep(G, own) {
    G.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(G.matrixWorld).invert();
    const buckets = new Map();
    const visit = (n) => {
      for (const ch of n.children.slice()) {
        if (ch.userData.dyn) continue;
        if (mergeable(ch)) { const k = bucketKey(ch.material); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(ch); }
        else visit(ch);
      }
    };
    visit(G);
    const mtx = new THREE.Matrix4();
    for (const [k, list] of buckets) {
      if (list.length < 2) continue;
      const merged = bake(list, ch => mtx.multiplyMatrices(inv, ch.matrixWorld), k);
      for (const ch of list) ch.parent.remove(ch);
      G.add(new THREE.Mesh(merged, k)); own.push(merged);
    }
  }
  // flag toggled/animated props so merging leaves them alone (skeleton groups are merged *within*)
  const SKELETON = new Set(['root', 'tilt', 'yaw', 'body', 'up', 'head', 'legs', 'arms', 'tail', 'L', 'h', 'own', 'handF', 'handB']);
  function markDyn(R) {
    for (const k in R) {
      if (SKELETON.has(k)) continue;
      const v = R[k];
      const mark = o => { if (o && o.isObject3D) o.userData.dyn = true; };
      if (Array.isArray(v)) v.forEach(mark); else mark(v);
    }
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  function blob(r, parent, sx = 1) {
    const b = new THREE.Mesh(disc(r), blobMat);
    b.rotation.x = -Math.PI / 2; b.position.y = 0.6; b.scale.x = sx;
    parent.add(b);
    return b;
  }
  const handTex = canvasTex(64, 64, (g) => {
    g.fillStyle = 'rgba(225,25,40,0.8)';
    g.beginPath(); g.ellipse(32, 40, 13, 11, 0, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) { const a = -2.3 + i * 0.42; g.beginPath(); g.ellipse(32 + Math.cos(a) * 20, 40 + Math.sin(a) * 20, 4, 9, a + Math.PI / 2, 0, TAU); g.fill(); }
    g.beginPath(); g.ellipse(14, 46, 4, 8, -0.9, 0, TAU); g.fill();
  });
  const handMat = new THREE.MeshBasicMaterial({ map: handTex, transparent: true, depthWrite: false });
  const qTex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#e1a32a'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#b07d18'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
    g.fillStyle = '#c0392b'; g.fillRect(27, 0, 10, 64);
    g.font = '900 44px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = '#2d3436'; g.strokeText('?', 32, 35); g.fillStyle = '#fff'; g.fillText('?', 32, 35);
  });

  // ---------- ground ----------
  const groundG = new THREE.Group(); scene.add(groundG);
  const TILE = 240;
  const roadTex = canvasTex(256, 228, (g, w, h) => {
    g.fillStyle = '#3d4048'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    const k = h / 214;
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, 8 * k, w, 2.5); g.fillRect(0, h - 10 * k, w, 2.5);
    g.fillStyle = '#f1c40f';
    for (let x = 0; x < w; x += w / 2) g.fillRect(x, (CENTER_LINE - SW_TOP_END) * k - 2, w / 4, 5);
  });
  roadTex.wrapS = THREE.RepeatWrapping;
  const walkTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d3ccbf'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = 3;
    g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  });
  walkTex.wrapS = walkTex.wrapT = THREE.RepeatWrapping;
  const W = 9000;
  function strip(z0, z1, material, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, z1 - z0), material);
    m.rotation.x = -Math.PI / 2; m.position.set(0, y, (z0 + z1) / 2);
    groundG.add(m);
    return m;
  }
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  roadTex.repeat.set(W / TILE, 1);
  strip(SW_TOP_END, ROAD_END, roadMat);
  const walk1 = walkTex.clone(); walk1.needsUpdate = true; walk1.repeat.set(W / 64, SW_TOP_END / 64);
  const walk2 = walkTex.clone(); walk2.needsUpdate = true; walk2.repeat.set(W / 64, (GROUND_H - ROAD_END) / 64);
  strip(0, SW_TOP_END, new THREE.MeshLambertMaterial({ map: walk1 }));
  strip(ROAD_END, GROUND_H + 8, new THREE.MeshLambertMaterial({ map: walk2 }));
  strip(GROUND_H + 8, 1400, new THREE.MeshLambertMaterial({ color: new THREE.Color('#9fae7c') }), -0.5);
  strip(-2500, 0, new THREE.MeshLambertMaterial({ color: new THREE.Color('#b4ab9c') }), -0.5);
  const curbMat = mat('#a59f94');
  mesh(new THREE.BoxGeometry(W, 6, 8), curbMat, 0, 3, SW_TOP_END - 4, groundG);
  mesh(new THREE.BoxGeometry(W, 6, 8), curbMat, 0, 3, ROAD_END + 4, groundG);
  mesh(new THREE.BoxGeometry(W, 10, 10), mat('#7f8c8d'), 0, 5, GROUND_H + 13, groundG);

  // ---------- chunk scenery ----------
  const chunkViews = new Map();
  function drawFacade(g, ge, b, kind, ox, oy, sc) {
    const Wd = Math.max(16, Math.round(b.w)), H = Math.round(b.h);
    const r = mulberry32(b.seed);
    g.setTransform(sc, 0, 0, sc, ox, oy); ge.setTransform(sc, 0, 0, sc, ox, oy);
    g.fillStyle = b.color; g.fillRect(0, 0, Wd, H);
    for (let i = 0; i < 120; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(r() * Wd, r() * H, 3, 3); }
    const win = (x, y, w, h, glass) => {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
      const lit = r() < 0.35;
      g.fillStyle = glass || (lit ? '#ffeaa7' : '#cfe8ff'); g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, y + 2, Math.max(2, w * 0.2), h - 4);
      if (lit) { ge.fillStyle = '#ffd98a'; ge.fillRect(x, y, w, h); }
    };
    if (kind === 'tower') {
      const cols = Math.max(2, Math.floor(Wd / 26)), gap = Wd / cols;
      for (let y = 14; y < H - 70; y += 24) for (let cI = 0; cI < cols; cI++) win(cI * gap + 4, y, gap - 8, 16, r() < 0.3 ? '#ffeaa7' : '#9fc5e8');
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, H - 60, Wd, 60);
      g.fillStyle = '#a8d8ea'; g.fillRect(8, H - 52, Wd - 16, 48);
      g.fillStyle = '#2d3436'; for (let x = 8; x < Wd - 8; x += 30) g.fillRect(x, H - 52, 3, 48);
      ge.fillStyle = '#7fa6c4'; ge.fillRect(8, H - 52, Wd - 16, 48);
    } else if (kind === 'house') {
      g.fillStyle = '#6d4c41'; g.fillRect(Wd / 2 - 12, H - 42, 24, 42);
      g.fillStyle = '#f1c40f'; g.fillRect(Wd / 2 + 6, H - 22, 3, 3);
      win(14, H - 36, 24, 20); win(Wd - 38, H - 36, 24, 20);
      if (H > 105) { win(14, H - 94, 24, 20); win(Wd / 2 - 12, H - 94, 24, 20); win(Wd - 38, H - 94, 24, 20); }
    } else {
      const winBottom = b.shop ? H - 64 : H - 46;
      const cols = Math.max(1, Math.floor((Wd - 16) / 34));
      const gap = (Wd - cols * 18) / (cols + 1);
      for (let y = 18; y + 20 < winBottom; y += 32) for (let cI = 0; cI < cols; cI++) win(gap + cI * (18 + gap), y, 18, 20);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, Wd, 7);
      if (b.shop) {
        g.fillStyle = '#2d3436'; g.fillRect(8, H - 48, Wd - 16, 48);
        g.fillStyle = '#a8d8ea'; g.fillRect(12, H - 44, Wd - 50, 40);
        ge.fillStyle = '#c2a36b'; ge.fillRect(12, H - 44, Wd - 50, 40);
        g.fillStyle = '#6d4c41'; g.fillRect(Wd - 34, H - 42, 20, 42);
        const sw = Math.min(Wd - 20, 14 + b.sign.length * 9);
        g.fillStyle = '#2d3436'; g.fillRect(Wd / 2 - sw / 2, H - 84, sw, 16);
        g.font = '900 11px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#ffeaa7'; g.fillText(b.sign, Wd / 2, H - 76);
        ge.fillStyle = '#ffeaa7'; ge.font = g.font; ge.textAlign = 'center'; ge.textBaseline = 'middle'; ge.fillText(b.sign, Wd / 2, H - 76);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(Wd / 2 - 13, H - 40, 26, 40);
      }
    }
  }
  const nightMats = []; // facade materials whose window glow follows the day/night cycle
  function makeTree(parent, x, z, s, leaf) {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s);
    mesh(cyl(5, 7, 70, 8), mat('#6d4c41'), 0, 35, 0, t);
    mesh(sph(30), mat(leaf || '#27ae60'), 0, 95, 0, t);
    mesh(sph(22), mat('#2ecc71'), -18, 80, 8, t);
    mesh(sph(20), mat('#219150'), 18, 84, -6, t);
    parent.add(t);
    return t;
  }
  function buildChunk(c) {
    const G = new THREE.Group();
    const own = []; // disposables
    const nm = []; // this chunk's night-glow facade materials
    const add = (m) => { G.add(m); return m; };
    // far skyline for depth
    const r = mulberry32(c.i * 31337 + 5);
    for (let k = 0; k < (Q.skyline ? 5 : 0); k++) {
      const w = 120 + r() * 160, h = 220 + r() * 520;
      const m = new THREE.Mesh(box(w, h, 120), basic(c.district === 'park' ? '#a9c3b8' : '#a7b8cc'));
      m.position.set(c.i * CHUNK + r() * CHUNK, h / 2, -900 - r() * 500);
      add(m);
    }
    if (c.district === 'park') {
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK + 2, 880), mat('#7cb342'));
      own.push(grass.geometry);
      grass.rotation.x = -Math.PI / 2; grass.position.set(c.i * CHUNK + CHUNK / 2, 0.2, -442);
      add(grass);
      for (const t of c.trees) makeTree(G, t.x, t.y, t.s, pick2(r, ['#27ae60', '#2ecc71', '#6ab04c', '#e1b12c']));
      for (let x = c.i * CHUNK; x < (c.i + 1) * CHUNK; x += 60) mesh(box(4, 22, 4), mat('#6d4c41'), x, 11, -6, G);
      const rail = mesh(new THREE.BoxGeometry(CHUNK, 3, 3), mat('#8d6e63'), c.i * CHUNK + CHUNK / 2, 18, -6, G); own.push(rail.geometry);
      if (c.fountain) {
        const f = new THREE.Group(); f.position.set(c.fountain.x, 0, c.fountain.y);
        mesh(cyl(60, 64, 16, 24), mat('#b2bec3'), 0, 8, 0, f);
        mesh(cyl(55, 55, 2, 24), mat('#74b9ff'), 0, 15, 0, f);
        mesh(cyl(8, 10, 50, 12), mat('#dfe6e9'), 0, 25, 0, f);
        mesh(cyl(24, 18, 6, 16), mat('#b2bec3'), 0, 50, 0, f);
        G.add(f);
      }
    }
    if (c.buildings.length) {
      const sc = Q.tex, base = c.i * CHUNK;
      const maxH = Math.max(16, ...c.buildings.map(b => b.h));
      const cw = Math.ceil(CHUNK * sc), chh = Math.ceil(maxH * sc);
      const ca = document.createElement('canvas'); ca.width = cw; ca.height = chh;
      const ea = document.createElement('canvas'); ea.width = cw; ea.height = chh;
      const g2 = ca.getContext('2d'), e2 = ea.getContext('2d');
      e2.fillStyle = '#000'; e2.fillRect(0, 0, cw, chh);
      const planes = [];
      for (const b of c.buildings) {
        const depth = b.kind === 'tower' ? 220 : b.kind === 'house' ? 110 : 140;
        const setback = b.kind === 'house' ? 26 : 2;
        drawFacade(g2, e2, b, b.kind, (b.x - base) * sc, chh - b.h * sc, sc);
        mesh(box(b.w - 2, b.h, depth), mat(b.color), b.x + b.w / 2, b.h / 2, -depth / 2 - setback, G);
        mesh(box(b.w - 2, 2, depth), mat(b.kind === 'tower' ? '#57606f' : '#8c7b6b'), b.x + b.w / 2, b.h + 1, -depth / 2 - setback, G);
        const pl = new THREE.PlaneGeometry(b.w - 2, b.h);
        const uv = pl.attributes.uv, u0 = (b.x + 1 - base) / CHUNK, u1 = (b.x + b.w - 1 - base) / CHUNK, vt = b.h * sc / chh;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), uv.getY(i) * vt);
        pl.translate(b.x + b.w / 2, b.h / 2, -setback + 0.6);
        planes.push(pl);
        if (b.kind === 'house') {
          const shape = new THREE.Shape([new THREE.Vector2(-depth / 2 - 8, 0), new THREE.Vector2(depth / 2 + 8, 0), new THREE.Vector2(0, 46)]);
          const rg = new THREE.ExtrudeGeometry(shape, { depth: b.w + 6, bevelEnabled: false }); own.push(rg);
          const roofM = mesh(rg, mat(b.roof), b.x - 2, b.h, -depth / 2 - setback, G);
          roofM.rotation.y = Math.PI / 2;
          for (let x = b.x + 6; x < b.x + b.w - 4; x += 14) mesh(box(3, 18, 3), mat('#ffffff'), x, 9, -6, G);
          if (b.garden) { mesh(sph(12), mat('#2ecc71'), b.x + 22, 8, -14, G); mesh(sph(10), mat('#e84393'), b.x + b.w - 24, 7, -14, G); }
        } else if (b.kind === 'tower') {
          mesh(box(b.w - 20, 14, depth - 30), mat('#636e72'), b.x + b.w / 2, b.h + 7, -depth / 2 - 2, G);
        } else {
          mesh(box(b.w + 2, 6, 6), mat(shadeHex(b.color, -30)), b.x + b.w / 2, b.h + 1, 1, G);
        }
        if (b.shop) { // striped awning built from boxes so it batches with everything else
          const n = Math.max(3, Math.floor((b.w - 6) / 16)), sw = (b.w - 6) / n;
          for (let k = 0; k < n; k++) {
            const st = mesh(box(sw, 2, 20), mat(k % 2 ? '#ffffff' : b.awning), b.x + 3 + sw * (k + 0.5), 60, 9, G);
            st.rotation.x = 0.35;
          }
        }
      }
      const tex = new THREE.CanvasTexture(ca), emi = new THREE.CanvasTexture(ea);
      tex.colorSpace = emi.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const front = new THREE.MeshToonMaterial({ map: tex, gradientMap: grad, emissiveMap: emi, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
      const fg = mergeGeos(planes.map(p => p.toNonIndexed())); planes.forEach(p => p.dispose());
      const fm = new THREE.Mesh(fg, front); fm.userData.dyn = true; G.add(fm);
      own.push(tex, emi, front, fg); nightMats.push(front); nm.push(front);
    }
    for (const o of c.obstacles) G.add(makeObstacle(o));
    for (const b of c.booths) G.add(makeBooth(b));
    for (const h of c.holes) G.add(makeHole(h));
    if (c.crosswalk !== null) {
      for (let yy = SW_TOP_END + 16; yy < ROAD_END - 18; yy += 22) {
        const s = new THREE.Mesh(box(90, 0.6, 12), mat('#eeeeee'));
        s.position.set(c.crosswalk, 0.4, yy + 6); G.add(s);
      }
    }
    // near-side greenery so the foreground isn't empty
    const rn = mulberry32(c.i * 777 + 3);
    for (let x = c.i * CHUNK + 30; Q.decor && x < (c.i + 1) * CHUNK; x += 110 + rn() * 130) {
      if (rn() < 0.6) {
        const w = 40 + rn() * 60;
        mesh(box(w, 18, 22), mat('#3f8f3a'), x, 9, 492, G);
        for (let k = 0; k < 4; k++) mesh(sph(3, 6, 4), mat(pick2(rn, ['#e84393', '#fdcb6e', '#ffffff', '#ff7675'])), x - w / 2 + rn() * w, 19, 486 + rn() * 12, G);
      } else makeTree(G, x, 520 + rn() * 50, 0.6 + rn() * 0.25, pick2(rn, ['#27ae60', '#6ab04c', '#e1b12c']));
    }
    const flockViews = c.flocks.map(f => { const fg = makeFlock(f); mergeDeep(fg, own); fg.userData.dyn = true; G.add(fg); return { f, g: fg }; });
    mergeDeep(G, own);
    scene.add(G);
    return { G, own, flockViews, nm };
  }
  function shadeHex(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xcfcfcf });
  lampMat.userData.keep = true;
  function makeObstacle(o) {
    const g = new THREE.Group();
    g.position.set(o.x, 0, o.y);
    switch (o.kind) {
      case 'lamp': {
        mesh(cyl(6, 7, 10, 10), mat('#263238'), 0, 5, 0, g);
        mesh(cyl(2.6, 3, 150, 8), mat('#37474f'), 0, 80, 0, g);
        const arm = mesh(box(30, 3, 3), mat('#37474f'), 0, 154, 13, g); arm.rotation.y = Math.PI / 2;
        mesh(box(16, 5, 10), mat('#455a64'), 0, 151, 26, g);
        mesh(box(12, 2, 8), lampMat, 0, 148, 26, g);
        break;
      }
      case 'hydrant':
        mesh(cyl(7, 7, 24, 12), mat('#c0392b'), 0, 12, 0, g);
        mesh(sph(7), mat('#e74c3c'), 0, 24, 0, g);
        mesh(cyl(2.5, 2.5, 22, 8), mat('#e74c3c'), 0, 17, 0, g).rotation.x = Math.PI / 2;
        break;
      case 'trash':
        mesh(cyl(12, 11, 34, 14), mat('#2e7d32'), 0, 17, 0, g);
        mesh(cyl(13.5, 13.5, 5, 14), mat('#1b5e20'), 0, 36, 0, g);
        break;
      case 'bench':
        for (const sx of [-36, 36]) { mesh(box(4, 20, 18), mat('#4e342e'), sx, 10, 0, g); mesh(box(4, 26, 3), mat('#4e342e'), sx, 32, -8, g); }
        mesh(box(84, 4, 18), mat('#a1887f'), 0, 21, 0, g);
        mesh(box(84, 5, 2), mat('#a1887f'), 0, 38, -8, g);
        mesh(box(84, 5, 2), mat('#a1887f'), 0, 30, -8, g);
        break;
      case 'planter':
        mesh(box(44, 26, 34), mat('#7f8c8d'), 0, 13, 0, g);
        makeTree(g, 0, 0, 0.75);
        break;
      case 'tree':
        makeTree(g, 0, 0, 1.05);
        break;
    }
    return g;
  }
  function makeBooth(b) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.y);
    if (b.kind === 'potty') {
      mesh(box(34, 92, 34), mat('#0984e3'), 0, 46, 0, g);
      mesh(box(36, 6, 36), mat('#74b9ff'), 0, 95, 0, g);
      mesh(box(2, 70, 24), mat('#0652dd'), 18, 40, 0, g);
      mesh(box(3, 4, 8), mat('#d63031'), 19.5, 60, 6, g);
    } else {
      const red = mat('#c0392b'), glass = mat('#aee1f9', { transparent: true, opacity: 0.35 });
      for (const [x, z] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) mesh(box(4, 100, 4), red, x, 50, z, g);
      mesh(box(38, 10, 38), red, 0, 103, 0, g);
      mesh(box(30, 6, 1), mat('#ffffff'), 0, 103, 19.5, g);
      for (const [x, z, ry] of [[0, -17, 0], [-17, 0, Math.PI / 2], [17, 0, Math.PI / 2], [0, 17, 0]]) {
        const p = mesh(box(30, 86, 1.5), glass, x, 52, z, g); p.rotation.y = ry; p.renderOrder = 2;
      }
      mesh(box(10, 14, 6), mat('#2d3436'), 0, 60, -14, g);
    }
    return g;
  }
  function makeHole(h) {
    const g = new THREE.Group(); g.position.set(h.x, 0, h.y);
    const hole = mesh(disc(14), basic('#0b0b0b'), 0, 0.7, 0, g); hole.rotation.x = -Math.PI / 2;
    const ring = mesh(torus(14, 1.6), mat('#636e72'), 0, 0.8, 0, g); ring.rotation.x = Math.PI / 2;
    const lid = mesh(cyl(13, 13, 2, 18), mat('#7f8c8d'), 22, 2, 10, g); lid.rotation.z = 0.15;
    const c1 = mesh(cone(6, 20, 10), mat('#ff7f00'), -20, 10, -8, g);
    mesh(cyl(6.5, 6.5, 3, 10), mat('#ffffff'), -20, 11, -8, g);
    return g;
  }
  function makeFlock(f) {
    const g = new THREE.Group();
    const r = mulberry32((f.seed * 1000) | 0);
    for (let i = 0; i < f.n; i++) {
      const pg = new THREE.Group();
      pg.position.set(f.x + (r() - 0.5) * 50, 0, f.y + (r() - 0.5) * 30);
      pg.rotation.y = r() * TAU;
      mesh(sph(4.5), mat('#95a5a6'), 0, 5, 0, pg).scale.set(1.4, 0.9, 1);
      const head = mesh(sph(2.6), mat('#636e72'), 5, 8, 0, pg);
      mesh(cone(0.9, 2.5, 6), mat('#f39c12'), 7.5, 8, 0, pg).rotation.z = -Math.PI / 2;
      g.add(pg);
    }
    return g;
  }
  function disposeChunk(cvw) {
    scene.remove(cvw.G);
    for (const o of cvw.own) o.dispose();
    for (const m of cvw.nm) { const i = nightMats.indexOf(m); if (i >= 0) nightMats.splice(i, 1); }
  }
  function syncChunks() {
    const a = Math.floor((camX - Q.pad) / CHUNK), b = Math.floor((camX + VW + Q.pad) / CHUNK);
    for (let i = a; i <= b; i++) if (!chunkViews.has(i)) chunkViews.set(i, buildChunk(getChunk(i)));
    for (const [i, cvw] of chunkViews) if (i < a - 1 || i > b + 1) { disposeChunk(cvw); chunkViews.delete(i); }
    for (const cvw of chunkViews.values()) {
      for (const fv of cvw.flockViews) {
        const away = gameTime - fv.f.scatterT < 25;
        fv.g.visible = !away;
      }
    }
  }

  // ---------- characters ----------
  const iceMat = new THREE.MeshToonMaterial({ color: 0xaef5ff, gradientMap: grad, transparent: true, opacity: 0.45, depthWrite: false });
  function buildRig(p) {
    const L = p.look;
    const root = new THREE.Group();
    const R = { root, L, h: p.facing > 0 ? 0 : Math.PI };
    R.blob = blob(16, root);
    const tilt = new THREE.Group(); root.add(tilt); R.tilt = tilt;
    const yaw = new THREE.Group(); tilt.add(yaw); R.yaw = yaw;
    const body = new THREE.Group(); yaw.add(body); R.body = body;
    const ht = L.ht || 1, wd = r2((L.wd || 1) * 20) / 20;
    body.scale.set(p.size, p.size * ht, p.size);
    const skin = mat(L.skin);
    const bare = L.bottom === 'shorts' || L.bottom === 'skirt' || L.bottom === 'none';
    const legMat = bare ? skin : mat(L.pants);
    const shoeMat = mat(L.barefoot ? L.skin : L.shoes);
    R.legs = [];
    for (const side of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0, 30, side * 5.5 * wd); body.add(piv);
      mesh(cyl(bare ? 3 : 3.8, bare ? 2.8 : 3.4, 30, 8), legMat, 0, -15, 0, piv);
      const shoe = mesh(box(L.bigShoes ? 20 : 10, 4.5, 6.5), shoeMat, L.bigShoes ? 5 : 2.5, -29, 0, piv);
      R.legs.push(piv);
      const sk = new THREE.Group(); sk.visible = false; piv.add(sk);
      mesh(box(14, 2, 6), mat('#2f3542'), 2.5, -32, 0, sk);
      for (const wx of [-2, 7]) mesh(sph(2.6, 8, 6), mat('#ff4757'), wx, -34.5, 0, sk);
      (R.skates = R.skates || []).push(sk);
    }
    if (!bare) mesh(box(20 * wd, 7, 13), legMat, 0, 30, 0, body);
    if (L.bottom === 'shorts') mesh(box(21 * wd, 12, 14), mat(L.pants), 0, 30, 0, body);
    if (L.bottom === 'skirt') mesh(cyl(10.5 * wd, 14 * wd, 20, 12), mat(L.pants), 0, 27, 0, body);
    if (L.board) {
      const bd = new THREE.Group(); body.add(bd); R.board = bd;
      mesh(box(42, 3, 12), mat(L.boardColor), 0, 1.5, 0, bd);
      for (const [x, z] of [[-13, -4], [-13, 4], [13, -4], [13, 4]]) mesh(sph(2.4, 8, 6), mat('#eeeeee'), x, -1, z, bd);
    }
    // upper body pivots at the hips so it can lean
    const up = new THREE.Group(); up.position.y = 30; body.add(up); R.up = up;
    const shirt = mat(L.shirt), shirt2 = mat(L.shirt2 || L.shirt);
    const tw = 20 * wd;
    const torso = (m = shirt) => mesh(box(tw, 32, 13), m, 0, 15, 0, up);
    switch (L.top) {
      case 'dress': mesh(cyl(9 * wd, 15 * wd, 45, 14), shirt, 0, 8.5, 0, up); break;
      case 'stripes': torso(); for (let y = 3; y < 30; y += 7) mesh(box(tw + 0.6, 3.2, 13.6), shirt2, 0, y, 0, up); break;
      case 'plaid': torso(); for (let y = 4; y < 30; y += 8) mesh(box(tw + 0.6, 2, 13.6), shirt2, 0, y, 0, up); for (const z of [-4, 0, 4]) mesh(box(tw + 0.8, 31, 1.5), shirt2, 0, 15, z, up); break;
      case 'jacket': torso(); mesh(box(1, 30, 6), shirt2, tw / 2 + 0.3, 15, 0, up); break;
      case 'suit': torso(); mesh(box(1, 9, 6), mat('#ecf0f1'), tw / 2 + 0.3, 26, 0, up); mesh(box(1.2, 18, 2.4), mat(L.tie), tw / 2 + 0.8, 20, 0, up); break;
      case 'hoodie': torso(); mesh(sph(7), shirt, -6, 32, 0, up).scale.set(1, 0.7, 1.4); mesh(box(1, 8, 9), mat(shadeHex(L.shirt, -30)), tw / 2 + 0.3, 6, 0, up); break;
      case 'sweater': torso(); mesh(box(tw + 0.6, 4, 13.6), mat(shadeHex(L.shirt, -35)), 0, 2, 0, up); break;
      case 'hawaiian': torso(); for (const [y, z] of [[24, -4], [16, 3], [8, -2], [26, 4], [6, 5]]) mesh(sph(1.8, 6, 4), shirt2, tw / 2 + 0.5, y, z, up); break;
      case 'uniform': torso(); if (!L.badgeless) mesh(box(1, 3.5, 3.5), mat('#f1c40f'), tw / 2 + 0.4, 25, 3, up); mesh(box(tw + 0.6, 3.5, 13.6), mat('#111111'), 0, 2.5, 0, up); break;
      case 'gi': torso(); mesh(box(tw + 0.6, 3.5, 13.6), mat('#111111'), 0, 5, 0, up); mesh(box(1, 20, 1.5), mat('#bdbdbd'), tw / 2 + 0.3, 21, 0, up).rotation.x = 0.4; break;
      case 'chef': torso(); for (let y = 6; y < 30; y += 7) for (const z of [-2.5, 2.5]) mesh(sph(1.1, 6, 4), mat('#7f8c8d'), tw / 2 + 0.5, y, z, up); break;
      case 'vest': torso(shirt2); mesh(box(tw + 1.4, 26, 14.2), shirt, 0, 15, 0, up); for (const y of [9, 19]) mesh(box(tw + 1.8, 2.2, 14.6), mat('#ecf0f1'), 0, y, 0, up); break;
      case 'hero': torso(); mesh(box(1, 8, 8), shirt2, tw / 2 + 0.4, 21, 0, up); break;
      case 'polka': torso(); for (const [y, z] of [[25, -3], [17, 3], [9, -3], [5, 4], [22, 5]]) mesh(sph(2, 6, 4), shirt2, tw / 2 + 0.5, y, z, up); for (const y of [10, 22]) for (const z of [-7, 7]) mesh(sph(2, 6, 4), shirt2, 0, y, z, up); break;
      case 'scrubs': torso(); mesh(box(1, 6, 5), mat(shadeHex(L.shirt, -40)), tw / 2 + 0.3, 27, 0, up); mesh(box(1, 6, 5), mat(shadeHex(L.shirt, -25)), tw / 2 + 0.3, 16, 3.5, up); break;
      case 'tank': torso(); break;
      default: torso();
    }
    if (L.player) { mesh(box(tw + 0.6, 3, 13.6), mat('#e63946'), 0, 19, 0, up); }
    if (L.bib) mesh(box(1, 10, 11), mat('#ffffff'), tw / 2 + 0.5, 16, 0, up);
    if (L.spikes) for (const z of [-8, -4, 4, 8]) mesh(cone(1.5, 5, 6), mat('#dfe6e9'), 0, 33, z, up);
    if (L.scarf) { mesh(cyl(8, 8, 5, 12), mat(L.scarfColor), 0, 31, 0, up); mesh(box(4, 12, 4), mat(L.scarfColor), 8, 24, 4, up); }
    if (L.camera) { mesh(box(5, 7, 10), mat('#222222'), tw / 2 + 2, 22, 0, up); mesh(cyl(2.2, 2.2, 3, 8), mat('#7f8c8d'), tw / 2 + 5, 22, 0, up).rotation.z = Math.PI / 2; }
    if (L.backpack) mesh(box(9, 24, 15), mat(L.packColor), -tw / 2 - 4, 16, 0, up);
    if (L.mailbag) { mesh(box(10, 12, 5), mat('#6d4c41'), 2, 4, 10, up); mesh(box(1.5, 30, 1.5), mat('#4e342e'), 0, 18, 7, up).rotation.x = 0.5; }
    if (L.cape) { const cp = new THREE.Group(); cp.position.set(-7, 31, 0); up.add(cp); mesh(box(1.5, 40, 20), mat(L.cape), -0.5, -20, 0, cp); R.cape = cp; }
    if (L.guitar) {
      const gt = new THREE.Group(); gt.position.set(tw / 2 + 3, 12, 1); gt.rotation.x = -0.15; up.add(gt); R.guitar = gt;
      mesh(sph(8), mat('#b5651d'), 0, -2, 0, gt).scale.set(0.45, 1, 1);
      mesh(sph(6.5), mat('#b5651d'), 0, 9, 0, gt).scale.set(0.45, 1, 1);
      mesh(box(2, 30, 3), mat('#5d4037'), 0, 22, -10, gt).rotation.x = 0.9;
    }
    if (L.pizza) { R.pizza = mesh(box(26, 4, 26), mat('#f5f0e1'), 20, 22, 0, up); mesh(cyl(4, 4, 0.6, 10), mat('#d63031'), 0, 2.2, 0, R.pizza); }
    if (L.plank) { R.plank = mesh(box(70, 4, 8), mat('#d4a373'), 0, 33, -11, up); }
    // arms
    R.arms = [];
    const sleeve = (L.top === 'tank' || L.top === 'dress') ? null : (L.top === 'vest' ? shirt2 : shirt);
    const handMatA = mat(L.gloves ? '#ffffff' : L.skin);
    const goldMat = L.goldGlove ? mat('#f1c40f') : null;
    for (const side of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0, 26, side * (tw / 2 + 3.4)); up.add(piv);
      if (sleeve) mesh(cyl(3.9, 3.6, 14, 8), sleeve, 0, -6, 0, piv);
      mesh(cyl(3.1, 2.9, 22, 8), skin, 0, -12, 0, piv);
      mesh(sph(L.goldGlove && side === 1 ? 5.6 : 4.3, 10, 8), L.goldGlove && side === 1 ? goldMat : handMatA, 0, -25, 0, piv);
      const hand = new THREE.Group(); hand.position.y = -25; piv.add(hand);
      R.arms.push(piv);
      if (side === -1) R.handB = hand; else R.handF = hand;
    }
    const hF = R.handF, hB = R.handB;
    if (L.case) mesh(box(16, 12, 4), mat('#5d4037'), 0, -8, 0, hB);
    if (L.bag) mesh(box(12, 11, 6), mat(L.bag), 0, -7, 0, hB);
    R.phone = mesh(box(3, 9, 5), mat('#2d3436'), 1, 3, 0, hF); R.phone.visible = false;
    if (L.selfie) { R.selfie = new THREE.Group(); hF.add(R.selfie); mesh(cyl(0.8, 0.8, 34, 6), mat('#2d3436'), 0, 17, 0, R.selfie); mesh(box(2, 9, 5), mat('#2d3436'), 0, 35, 0, R.selfie); }
    if (L.coffee) { R.coffee = mesh(cyl(3.5, 3, 11, 10), mat('#ffffff'), 0, 4, 0, hF); mesh(cyl(3.6, 3.4, 4, 10), mat('#8d6e63'), 0, 0, 0, R.coffee); }
    if (L.cane) { R.cane = new THREE.Group(); hF.add(R.cane); mesh(cyl(1.3, 1.3, 30, 6), mat('#6d4c41'), 0, -15, 0, R.cane); }
    R.icecream = new THREE.Group(); hF.add(R.icecream); R.icecream.visible = false;
    mesh(cone(3.5, 11, 8), mat('#e1b12c'), 0, 2, 0, R.icecream).rotation.x = Math.PI;
    mesh(sph(4.2, 10, 8), mat(pick(['#fd79a8', '#ffffff', '#6d4c41', '#55efc4'])), 0, 9, 0, R.icecream);
    R.flowers = new THREE.Group(); hF.add(R.flowers); R.flowers.visible = false;
    mesh(cyl(1.4, 1, 12, 6), mat('#27ae60'), 0, 5, 0, R.flowers);
    for (const [x, z, c] of [[0, 0, '#e84393'], [2.5, 2, '#fdcb6e'], [-2.5, 1.5, '#ff7675'], [1, -2.5, '#a29bfe']]) mesh(sph(2.6, 8, 6), mat(c), x, 12, z, R.flowers);
    R.camHand = mesh(box(6, 6, 10), mat('#222222'), 3, 0, 0, hF); R.camHand.visible = false;
    if (L.player) { R.megaHand = mesh(sph(11, 12, 10), handMatA, 2, 0, 0, hF); R.megaHand.visible = false; }
    // head
    const head = new THREE.Group(); head.position.y = 43; up.add(head); R.head = head;
    const faces = Q.faces || L.player;
    if (faces) { R.skinMat = new THREE.MeshToonMaterial({ color: new THREE.Color(L.skin), gradientMap: grad, emissive: new THREE.Color('#ff0000'), emissiveIntensity: 0 }); R.skinMat.userData.keep = true; }
    const headMat = R.skinMat || skin;
    mesh(cyl(4, 4.5, 8, 8), skin, 0, -11, 0, head);
    mesh(sph(12, faces ? 18 : 12, faces ? 14 : 9), headMat, 0, 0, 0, head);
    mesh(sph(L.redNose ? 4.2 : 3, 8, 6), L.redNose ? mat('#e74c3c') : headMat, 11.5, 0.5, 0, head);
    for (const z of [-11.5, 11.5]) mesh(sph(3, 8, 6), skin, -1, 0.5, z, head);
    if (L.earrings) for (const z of [-11.8, 11.8]) mesh(sph(1.4, 6, 4), mat('#f1c40f'), -1, -4, z, head);
    const black = mat('#1e1e1e');
    if (!faces) {
      for (const z of [-4.5, 4.5]) mesh(sph(1.9, 6, 4), black, 10.4, 2.5, z, head);
      mesh(box(1.4, 1.2, 5), mat(L.lips ? '#d63031' : '#5a2a1a'), 11.4, -5, 0, head);
    } else {
    R.eyes = new THREE.Group(); head.add(R.eyes);
    for (const z of [-4.5, 4.5]) mesh(sph(1.9, 8, 6), black, 10.4, 2.5, z, R.eyes);
    R.eyesX = new THREE.Group(); head.add(R.eyesX); R.eyesX.visible = false;
    for (const z of [-4.5, 4.5]) for (const rx of [0.8, -0.8]) { const b = mesh(box(1.2, 1.2, 5.5), black, 11.2, 2.5, z, R.eyesX); b.rotation.x = rx; }
    R.eyesBig = new THREE.Group(); head.add(R.eyesBig); R.eyesBig.visible = false;
    for (const z of [-4.5, 4.5]) { mesh(sph(3, 10, 8), mat('#ffffff'), 9.6, 2.5, z, R.eyesBig); mesh(sph(1.5, 8, 6), black, 12.2, 2.5, z, R.eyesBig); }
    R.brows = new THREE.Group(); head.add(R.brows); R.brows.visible = false;   // angry
    for (const z of [-4.5, 4.5]) { const b = mesh(box(1.6, 1.6, 6.5), black, 11, 7, z, R.brows); b.rotation.x = z > 0 ? 0.45 : -0.45; }
    R.browsT = new THREE.Group(); head.add(R.browsT); R.browsT.visible = false; // tired
    for (const z of [-4.5, 4.5]) { const b = mesh(box(1.6, 1.6, 6.5), black, 11, 7, z, R.browsT); b.rotation.x = z > 0 ? -0.45 : 0.45; }
    const lip = mat(L.lips ? '#d63031' : '#5a2a1a');
    R.mouthLine = mesh(box(1.4, 1.2, 5), lip, 11.4, -5, 0, head);
    R.mouthOpen = mesh(sph(2.6, 10, 8), mat('#7a1010'), 10.8, -5, 0, head); R.mouthOpen.scale.set(0.6, 1, 1.2); R.mouthOpen.visible = false;
    R.mouthSmile = mesh(torus(3, 0.7, Math.PI), lip, 11.3, -3.5, 0, head); R.mouthSmile.rotation.set(0, Math.PI / 2, Math.PI); R.mouthSmile.visible = false;
    }
    if (L.shades) { mesh(box(2, 4.2, 17), mat('#111111'), 11.3, 3, 0, head); mesh(box(20, 1.4, 1.4), mat('#111111'), 1, 3, 11.8, head); mesh(box(20, 1.4, 1.4), mat('#111111'), 1, 3, -11.8, head); }
    if (L.glasses) { for (const z of [-4.5, 4.5]) { const g = mesh(torus(3.4, 0.5), mat('#555555'), 11.4, 2.5, z, head); g.rotation.y = Math.PI / 2; } }
    if (L.mask) { mesh(cyl(12.6, 12.6, 5, 18, true), mat(L.mask, { side: THREE.DoubleSide }), 0, 2.8, 0, head); for (const z of [-4.5, 4.5]) mesh(sph(1.9, 8, 6), mat('#ffffff'), 12.2, 2.8, z, head); }
    if (L.band) mesh(cyl(12.7, 12.7, 3.5, 18, true), mat(L.band, { side: THREE.DoubleSide }), 0, 7, 0, head);
    if (L.beard) { const b = mesh(sph(10, 12, 8), mat(L.hair), 3.5, -5, 0, head); b.scale.set(0.9, 0.75, 1.05); }
    if (L.mustache) mesh(box(2.4, 1.8, 7), mat(L.hair), 11.8, -2.4, 0, head);
    if (L.headphones) { const hb = mesh(torus(13.2, 1.1, Math.PI), mat(L.phonesColor), -1, 0, 0, head); hb.rotation.y = Math.PI / 2; for (const z of [-12, 12]) mesh(cyl(4, 4, 3, 10), mat(L.phonesColor), -1, 0.5, z, head).rotation.x = Math.PI / 2; }
    R.cream = mesh(sph(8, 10, 8), mat('#fffaf0'), 8.5, 0, 0, head); R.cream.scale.set(0.6, 1.1, 1.3); R.cream.visible = false;
    R.prints = [];
    for (const z of [-1, 1]) { const pl = mesh(geo('pl10', () => new THREE.PlaneGeometry(10, 10)), handMat, 5.5, -1, z * 11.9, head); pl.rotation.y = z > 0 ? 0 : Math.PI; pl.visible = false; R.prints.push(pl); }
    buildHair(L, head);
    if (L.player) {
      R.disguise = new THREE.Group(); head.add(R.disguise); R.disguise.visible = false;
      mesh(sph(4.6, 10, 8), headMat, 12.5, 0, 0, R.disguise);
      mesh(box(3, 2.4, 11), black, 12.5, -3, 0, R.disguise);
      for (const z of [-4.5, 4.5]) { const g = mesh(torus(3.6, 0.7), black, 11.8, 2.8, z, R.disguise); g.rotation.y = Math.PI / 2; mesh(box(1.8, 2.4, 6), black, 11.5, 8, z, R.disguise); }
      R.shield = mesh(sph(46, 20, 14), new THREE.MeshBasicMaterial({ color: 0x48dbfb, transparent: true, opacity: 0.18, depthWrite: false }), 0, 42, 0, root);
      R.shield.scale.set(0.75, 1.1, 0.75); R.shield.visible = false;
    }
    R.ice = mesh(box(40, 92, 40), iceMat, 0, 46, 0, root);
    R.ice.visible = false;
    markDyn(R);
    R.own = [];
    mergePerGroup(root, R.own);
    return R;
  }
  function buildHair(L, head) {
    const hm = mat(L.hair), hat = mat(L.hat || '#555555');
    const cap = (r, m, tiltBack = 0.35, frac = 0.55) => { const d = mesh(dome(r, frac), m, 0, 0, 0, head); d.rotation.z = tiltBack; return d; };
    switch (L.hairStyle) {
      case 'short': cap(12.9, hm); break;
      case 'sidepart': cap(13, hm); mesh(sph(5), hm, 6, 9, 4, head).scale.set(1.4, 0.6, 1.2); break;
      case 'long': cap(13.1, hm); mesh(box(9, 24, 22), hm, -7, -7, 0, head); break;
      case 'ponytail': cap(13, hm); mesh(sph(5), hm, -15, -2, 0, head).scale.set(0.8, 1.7, 0.8); mesh(sph(2.2, 8, 6), mat('#e84393'), -13, 4, 0, head); break;
      case 'braids': cap(13, hm); for (const z of [-5, 5]) mesh(cyl(2.2, 1.8, 24, 6), hm, -10, -12, z, head); break;
      case 'bob': cap(13.3, hm); mesh(box(10, 15, 26), hm, -5, -3, 0, head); break;
      case 'curly': for (const [x, y, z] of [[-6, 8, -6], [-6, 8, 6], [0, 11, 0], [5, 9, -5], [5, 9, 5], [-10, 2, 0], [-9, 0, -8], [-9, 0, 8], [-2, 11, -7], [-2, 11, 7]]) mesh(sph(5.5, 8, 6), hm, x, y, z, head); break;
      case 'afro': mesh(sph(15.5, 16, 12), hm, -4.5, 5, 0, head); break;
      case 'buzz': cap(12.3, hm, 0.35, 0.5); break;
      case 'spiky': cap(12.9, hm); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const c = mesh(cone(3, 10, 6), hm, -2 + Math.cos(a) * 6, 12, Math.sin(a) * 6, head); c.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); } break;
      case 'mohawk': for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36; const c = mesh(cone(2.8, 13, 6), hm, Math.sin(a) * 12.5, Math.cos(a) * 12.5 + 3, 0, head); c.rotation.z = -a; } break;
      case 'bald': for (const z of [-11.2, 11.2]) mesh(box(6, 5, 1.5), hm, -5, 0, z, head); break;
      case 'bun': cap(12.9, hm); mesh(sph(6), hm, -7, 11, 0, head); break;
      case 'cap': cap(13.5, hat, 0.2); mesh(box(15, 1.6, 18), hat, L.capBack ? -14 : 14, 5, 0, head); break;
      case 'beanie': cap(14, hat, 0.15, 0.6); mesh(cyl(14, 14, 4, 16), mat(shadeHex(L.hat, -35)), 0, 5, 0, head); mesh(sph(3.4, 8, 6), mat(shadeHex(L.hat, 30)), -2, 15, 0, head); break;
      case 'hijab': mesh(sph(14, 16, 12), hat, -4.5, 1.5, 0, head); mesh(cyl(12, 15, 16, 14), hat, -2, -12, 0, head); break;
      case 'flatcap': for (const z of [-11.2, 11.2]) mesh(box(6, 5, 1.5), hm, -5, 0, z, head); cap(13.4, hat, 0.1, 0.45); mesh(box(12, 2, 20), hat, 12, 6, 0, head).rotation.z = -0.15; break;
      case 'cophat': mesh(cyl(13, 12.6, 8, 16), hat, 0, 8, 0, head); mesh(cyl(15, 15, 3, 16), hat, -1, 13, 0, head); mesh(box(12, 1.5, 20), mat('#111111'), 12, 5, 0, head); mesh(box(1, 4, 4), mat('#f1c40f'), 13.2, 9, 0, head); break;
      case 'sunhat': cap(12.7, hat, 0.1); mesh(cyl(23, 23, 1.4, 20), hat, 0, 5.5, 0, head); mesh(cyl(12.9, 12.9, 2.5, 16, true), mat('#e17055', { side: THREE.DoubleSide }), 0, 7.5, 0, head); break;
      case 'toque': mesh(cyl(10, 11, 20, 14), mat('#ffffff'), 0, 17, 0, head); for (const [x, z] of [[-5, 0], [5, 0], [0, 5], [0, -5]]) mesh(sph(7.5, 10, 8), mat('#ffffff'), x, 28, z, head); mesh(cyl(12.4, 12.4, 4, 16), mat('#ecf0f1'), 0, 7, 0, head); break;
      case 'beret': { const b = mesh(sph(13.5, 14, 8), hat, -1, 10, 0, head); b.scale.set(1, 0.35, 1); b.rotation.z = 0.25; break; }
      case 'cowboy': mesh(cyl(24, 24, 1.6, 20), hat, 0, 5, 0, head).scale.set(1, 1, 0.8); mesh(cyl(11, 13, 14, 16), hat, -1, 12, 0, head); mesh(cyl(13.2, 13.2, 3, 16), mat('#3e2723'), -1, 7, 0, head); break;
      case 'tophat': mesh(cyl(18, 18, 1.6, 20), hat, 0, 6, 0, head); mesh(cyl(11, 11, 24, 16), hat, 0, 18, 0, head); mesh(cyl(11.3, 11.3, 4, 16), mat('#c0392b'), 0, 9, 0, head); break;
      case 'crown': cap(12.9, hm); mesh(cyl(12, 12, 8, 16, true), mat('#f1c40f', { side: THREE.DoubleSide }), 0, 12, 0, head); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; mesh(cone(2.6, 7, 6), mat('#f1c40f'), Math.cos(a) * 11, 19, Math.sin(a) * 11, head); mesh(sph(1.4, 6, 4), mat(i % 2 ? '#e74c3c' : '#0984e3'), Math.cos(a) * 12, 12, Math.sin(a) * 12, head); } break;
      case 'hardhat': cap(13.8, hat, 0.05, 0.55); mesh(cyl(15.5, 15.5, 1.4, 18), hat, 1.5, 4, 0, head); mesh(box(18, 2.5, 3), mat(shadeHex(L.hat, -30)), 0, 13, 0, head); break;
    }
  }
  function buildDog(d) {
    const L = d.look, root = new THREE.Group();
    const R = { root, dog: true, h: d.facing > 0 ? 0 : Math.PI };
    R.blob = blob(14, root);
    const yaw = new THREE.Group(); root.add(yaw); R.yaw = yaw;
    const b = new THREE.Group(); b.scale.setScalar(L.big); yaw.add(b);
    const fur = mat(L.fur), dark = mat(shadeHex(L.fur, -35));
    mesh(sph(8, 12, 8), fur, 0, 15, 0, b).scale.set(1.9, 0.9, 0.95);
    const head = new THREE.Group(); head.position.set(14, 22, 0); b.add(head); R.head = head;
    mesh(sph(6.5, 12, 8), fur, 0, 0, 0, head);
    mesh(sph(3.8, 10, 6), mat(shadeHex(L.fur, 25)), 6, -2, 0, head).scale.set(1.3, 0.85, 0.9);
    mesh(sph(1.6, 6, 4), mat('#111111'), 10.5, -1, 0, head);
    for (const z of [-3, 3]) { mesh(sph(1.2, 6, 4), mat('#111111'), 4.5, 2.5, z, head); const e = mesh(sph(3, 8, 6), dark, -1, 4, z * 1.4, head); e.scale.set(0.6, 1.5, 0.5); }
    mesh(cyl(4.5, 4.5, 2.5, 10), mat(L.collar), -4, -4, 0, head).rotation.z = Math.PI / 2 - 0.3;
    R.legs = [];
    for (const [x, z] of [[-9, -4], [-9, 4], [9, -4], [9, 4]]) {
      const piv = new THREE.Group(); piv.position.set(x, 12, z); b.add(piv);
      mesh(cyl(1.9, 1.6, 12, 6), dark, 0, -6, 0, piv);
      R.legs.push(piv);
    }
    const tail = new THREE.Group(); tail.position.set(-14, 17, 0); b.add(tail); R.tail = tail;
    mesh(cyl(1.4, 1, 11, 6), fur, 0, 5, 0, tail);
    R.ice = mesh(box(46, 40, 26), iceMat, 0, 20, 0, root);
    R.ice.visible = false;
    markDyn(R);
    R.own = [];
    mergePerGroup(root, R.own);
    return R;
  }
  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * Math.min(1, t);
  }
  function poseOf(p) {
    const L = p.look;
    const st = p.isPlayer ? (p.downT > 0 ? 'down' : 'player') : p.state;
    const down = st === 'down' || st === 'getup';
    const chasing = st === 'chase';
    const abducted = st === 'abducted';
    const dancing = st === 'walk' && p.danceT > 0;
    const lost = chasing && !decoy && (power.disguise > 0 || player.hidden || p.smokeT > 0);
    const atGoal = st === 'distracted' && p.goal && Math.hypot(p.goal.x - p.x, p.goal.y - p.y) < 12;
    const happy = !p.isPlayer && ((p.happyT > 0 && st === 'walk') || (st === 'revenge' && p.slapT <= 0) || dancing || atGoal);
    const shock = (p.shock > 0 && st === 'walk') || abducted || lost;
    const tired = st === 'tired';
    const frozen = st === 'frozen';
    const mood = down ? 'down' : (chasing && !lost) || frozen || (st === 'revenge' && p.slapT > 0) ? 'angry' : happy ? 'happy' : shock ? 'shock' : tired ? 'tired' : 'normal';
    const m = p.moveAmt || 0, ph = p.phase || 0;
    const onBoard = L.board && !down && !abducted;
    let la = Math.sin(ph) * 0.65 * m;
    if (onBoard) la = 0.3;
    if (dancing) la = Math.sin(gameTime * 8 + ph) * 0.5;
    let lean = 0;
    if (tired) lean = 0.55; else if (chasing && !lost) lean = 0.2;
    else if (p.isPlayer) lean = p.sprinting ? 0.38 : 0.1 * m;
    let fa = -Math.sin(ph) * 0.6 * m, ba = Math.sin(ph) * 0.6 * m;
    const calm = st === 'walk' && !dancing && !shock && !happy;
    let phone = false, selfie = false, camHand = false;
    if (onBoard) { fa = 1.1; ba = -0.7; }
    if (calm || st === 'decoy' || st === 'player') {
      if (L.phone) { fa = 2.75; phone = true; }
      if (L.selfie) { fa = 2.2; selfie = true; }
      if (L.pizza) { fa = 1.35; ba = 1.3; }
      if (L.coffee || L.icecream || L.flowers) fa = 0.95 + Math.sin(ph) * 0.1;
      if (L.cane) fa = 0.45 + Math.sin(ph) * 0.15 * m;
      if (L.leash) fa = 0.9;
      if (L.guitar) { fa = 1.0 + Math.sin(gameTime * 12) * 0.25; ba = 1.7; }
      if (p.photoT > 0) { fa = 2.05; ba = 1.95; camHand = !L.selfie; }
      if (p.mimeT > 0) { fa = 1.55 + Math.sin(gameTime * 3) * 0.06; ba = 1.8 + Math.cos(gameTime * 3) * 0.06; }
    }
    if (chasing && !lost) { fa = 1.4 + Math.sin(ph * 1.3) * 0.35; ba = 1.15 - Math.sin(ph * 1.3) * 0.35; }
    else if (lost) { fa = 2.6; ba = 0.3; }
    else if (tired) { fa = 0.15; ba = 0.05; }
    else if (shock) { fa = 2.7; ba = 2.5; }
    else if (happy) { fa = 2.8 + Math.sin(gameTime * 14) * 0.3; ba = 2.6 - Math.sin(gameTime * 14) * 0.3; }
    else if (down) { fa = 2.9; ba = 2.6; }
    if (p.slapT > 0) { const k = 1 - p.slapT / 0.25; fa = k < 0.3 ? lerp(0.3, -1.1, k / 0.3) : lerp(-1.1, 1.8, Math.min(1, (k - 0.3) / 0.22)); phone = selfie = false; }
    if (p.blockT > 0) { fa = 2.3; ba = 1.9; phone = selfie = false; }
    return { st, down, chasing, lost, mood, la, fa, ba, lean, phone, selfie, camHand, onBoard, calm, dancing, abducted, frozen };
  }
  function updateRig(R, p, dt) {
    const P = poseOf(p);
    const lie = p.lie || 0;
    R.root.position.set(p.x, p.z || 0, p.y);
    if (P.dancing) R.root.position.y += Math.abs(Math.sin(gameTime * 8 + p.phase)) * 6;
    if (P.onBoard) R.root.position.y += 5;
    // heading: follow movement in 3D, otherwise left/right facing
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    let want = p.facing > 0 ? 0 : Math.PI;
    if (sp > 25 && !(p.slapT > 0) && !P.down) want = Math.atan2(-(p.vy || 0), p.vx || 0);
    if (P.onBoard && sp > 25) want = Math.atan2(-(p.vy || 0), p.vx || 0);
    if (!P.frozen) R.h = angleLerp(R.h, want, dt * 12);
    R.yaw.rotation.y = R.h;
    R.tilt.rotation.z = -p.fallDir * lie * Math.PI / 2;
    R.tilt.position.y = lie * 9;
    R.blob.scale.set(1 + lie * 1.6, 1, 1); R.blob.position.x = p.fallDir * lie * 34;
    if (P.abducted) { R.tilt.rotation.z = Math.sin(gameTime * 3 + p.phase) * 0.3; R.blob.visible = false; } else R.blob.visible = (p.z || 0) >= 0;
    if (p.isDecoy) R.tilt.rotation.z = Math.sin(gameTime * 4) * 0.06 + (p.wob > 0 ? Math.sin(gameTime * 40) * 0.25 : 0);
    if (!P.frozen) {
      R.legs[0].rotation.z = -P.la; R.legs[1].rotation.z = P.la;
      R.up.rotation.z = -P.lean;
      R.arms[0].rotation.z = P.ba; R.arms[1].rotation.z = P.fa;
    }
    // face
    const mood = P.mood;
    if (R.eyes) { // full expressions (medium/high quality)
      R.eyes.visible = mood !== 'down' && mood !== 'shock';
      R.eyesX.visible = mood === 'down';
      R.eyesBig.visible = mood === 'shock';
      R.brows.visible = mood === 'angry';
      R.browsT.visible = mood === 'tired';
      R.mouthLine.visible = mood === 'normal' && !p.isPlayer;
      R.mouthOpen.visible = mood === 'angry' || mood === 'down' || mood === 'shock' || mood === 'tired';
      if (mood === 'angry') R.mouthOpen.scale.y = 1 + Math.abs(Math.sin(gameTime * 12)) * 0.5;
      R.mouthSmile.visible = mood === 'happy' || (p.isPlayer && mood !== 'down');
    }
    if (R.skinMat) R.skinMat.emissiveIntensity = P.chasing && !P.lost ? 0.15 + 0.35 * clamp(p.anger / p.angerMax, 0, 1) : 0;
    for (const pl of R.prints) pl.visible = !!p.marked;
    R.cream.visible = (p.creamT || 0) > 0;
    // props
    const L = p.look;
    R.phone.visible = P.phone;
    if (R.selfie) R.selfie.visible = P.selfie || (P.calm && !!L.selfie);
    if (R.coffee) R.coffee.visible = !!L.coffee && (P.calm || P.st === 'decoy');
    if (R.cane) { R.cane.visible = !P.down && !P.chasing; R.cane.rotation.z = -(P.fa + P.lean); }
    if (R.pizza) R.pizza.visible = !!L.pizza && P.calm;
    if (R.guitar) R.guitar.visible = P.calm;
    if (R.board) R.board.visible = P.onBoard;
    if (R.cape) R.cape.rotation.z = -0.15 - (p.moveAmt || 0) * 0.7 + Math.sin(gameTime * 10) * 0.05 * (p.moveAmt || 0);
    R.icecream.visible = !!L.icecream && !P.down && !P.chasing;
    R.flowers.visible = !!L.flowers && !P.down && !P.chasing;
    R.camHand.visible = P.camHand;
    R.ice.visible = P.frozen;
    if (p.isPlayer) {
      R.disguise.visible = power.disguise > 0;
      R.shield.visible = power.shield > 0;
      if (R.shield.visible) R.shield.scale.set(0.75 + Math.sin(gameTime * 6) * 0.02, 1.1, 0.75);
      R.megaHand.visible = power.mega > 0;
      for (const s of R.skates) s.visible = power.skates > 0;
      const blink = p.invuln > 0 && p.downT <= 0 && ((p.invuln * 10) | 0) % 2 === 0;
      R.root.visible = !p.hidden && !blink;
    }
  }
  function updateDogRig(R, d, dt) {
    R.root.position.set(d.x, d.z || 0, d.y);
    const sp = Math.hypot(d.vx || 0, d.vy || 0);
    let want = d.facing > 0 ? 0 : Math.PI;
    if (sp > 20) want = Math.atan2(-d.vy, d.vx);
    if (d.state !== 'frozen') R.h = angleLerp(R.h, want, dt * 10);
    R.yaw.rotation.y = R.h;
    const m = d.moveAmt || 0, ph = d.phase * 1.4;
    if (d.state !== 'frozen') R.legs.forEach((l, i) => { l.rotation.z = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 * m; });
    const angry = d.state === 'chase' || d.state === 'revenge';
    R.tail.rotation.z = 0.6 + Math.sin(gameTime * (angry ? 25 : 12)) * 0.4;
    R.tail.rotation.x = Math.sin(gameTime * (angry ? 25 : 12)) * 0.5;
    R.ice.visible = d.state === 'frozen';
    if (d.state === 'abducted') R.yaw.rotation.z = Math.sin(gameTime * 3) * 0.4;
  }

  // ---------- vehicles & props ----------
  function buildCar(c) {
    const g = new THREE.Group();
    const L = c.len, body = mat(c.color);
    const sh = mesh(box(L, 1, c.depth), blobMat, 0, 0.6, 0, g);
    if (c.bus) {
      mesh(box(L, c.h - 14, c.depth - 6), body, 0, c.h / 2 + 5, 0, g);
      mesh(box(L - 12, 4, c.depth - 14), mat(shadeHex(c.color, 30)), 0, c.h + 0, 0, g);
      for (let x = -L / 2 + 22; x < L / 2 - 40; x += 34) for (const z of [-1, 1]) mesh(box(26, 22, 1), mat('#2d3436'), x, c.h - 22, z * (c.depth / 2 - 2.6), g);
      mesh(box(1, 30, c.depth - 14), mat('#74b9ff'), L / 2 + 0.2, c.h - 26, 0, g);
      mesh(box(L + 0.5, 5, c.depth - 5), mat('#2d3436'), 0, 22, 0, g);
    } else {
      mesh(box(L, 24, c.depth - 6), body, 0, 20, 0, g);
      mesh(box(L * 0.46, 20, c.depth - 12), body, -L * 0.05, 41, 0, g);
      mesh(box(L * 0.46 + 0.6, 14, c.depth - 11), mat('#2d3e50'), -L * 0.05, 42, 0, g);
      mesh(box(L * 0.46 - 6, 2, c.depth - 14), mat(shadeHex(c.color, 30)), -L * 0.05, 51.5, 0, g);
      if (c.taxi) { mesh(box(22, 7, 12), mat('#2d3436'), -L * 0.05, 56, 0, g); mesh(box(22.6, 2, 12.6), mat('#ffffff'), -L * 0.05, 56, 0, g); }
      mesh(box(L + 0.5, 3, c.depth - 5.4), mat(shadeHex(c.color, -40)), 0, 14, 0, g);
    }
    for (const z of [-1, 1]) {
      mesh(box(1, 6, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }), L / 2 + 0.2, 22, z * (c.depth / 2 - 10), g);
      mesh(box(1, 6, 8), new THREE.MeshBasicMaterial({ color: 0xff3838 }), -L / 2 - 0.2, 22, z * (c.depth / 2 - 10), g);
    }
    g.userData.wheels = [];
    for (const x of [-L * 0.32, L * 0.32]) for (const z of [-1, 1]) {
      const w = mesh(cyl(11, 11, 7, 14), mat('#1e1e1e'), x, 11, z * (c.depth / 2 - 4), g);
      w.rotation.x = Math.PI / 2;
      mesh(cyl(5, 5, 7.4, 10), mat('#95a5a6'), 0, 0, 0, w);
      g.userData.wheels.push(w);
    }
    g.rotation.y = c.dir > 0 ? 0 : Math.PI;
    return g;
  }
  function buildTruck() {
    const g = new THREE.Group();
    mesh(box(150, 70, 26), mat('#ffffff'), 0, 45, 0, g);
    mesh(box(150.5, 14, 26.5), mat('#fd79a8'), 0, 22, 0, g);
    mesh(box(70, 30, 1), mat('#2d3436'), 10, 52, 13.2, g);
    mesh(box(80, 3, 10), mat('#fd79a8'), 10, 36, 16, g);
    const cn = mesh(cone(9, 28, 10), mat('#e1b12c'), 40, 92, 0, g); cn.rotation.x = Math.PI;
    mesh(sph(11), mat('#fd79a8'), 40, 110, 0, g);
    mesh(sph(8), mat('#ffffff'), 40, 122, 0, g);
    for (const x of [-48, 48]) for (const z of [-1, 1]) { const w = mesh(cyl(11, 11, 6, 12), mat('#1e1e1e'), x, 11, z * 11, g); w.rotation.x = Math.PI / 2; }
    const sign = canvasTex(256, 48, (gg, w, h) => { gg.fillStyle = '#fd79a8'; gg.fillRect(0, 0, w, h); gg.font = '900 30px Arial Black, Impact, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillStyle = '#fff'; gg.fillText('ICE CREAM', w / 2, h / 2 + 2); });
    mesh(new THREE.PlaneGeometry(100, 19), new THREE.MeshBasicMaterial({ map: sign }), -10, 72, 13.3, g);
    return g;
  }
  function buildBox() {
    const g = new THREE.Group();
    g.userData.crate = mesh(box(26, 26, 26), new THREE.MeshToonMaterial({ map: qTex, gradientMap: grad, emissive: new THREE.Color('#ffd32a'), emissiveIntensity: 0.25 }), 0, 15, 0, g);
    const chute = new THREE.Group(); g.add(chute); g.userData.chute = chute;
    mesh(dome(30, 0.5), mat('#ff6b81', { side: THREE.DoubleSide }), 0, 70, 0, chute);
    for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) { const s = mesh(cyl(0.4, 0.4, 44, 4), mat('#555555'), x * 0.7, 48, z * 0.7, chute); s.rotation.set(z * 0.012, 0, -x * 0.012); }
    g.userData.shadow = blob(16, g);
    return g;
  }
  function buildPizza() {
    const g = new THREE.Group();
    mesh(box(30, 6, 30), mat('#f5f0e1'), 0, 3, 0, g);
    const sl = mesh(cone(10, 2, 3), mat('#fdcb6e'), 0, 7, 0, g); sl.rotation.y = 0.5;
    mesh(sph(5, 10, 8), mat('#ff4757'), 0, 22, 0, g).scale.set(1, 0.9, 0.4);
    return g;
  }
  const heartGeo = (() => {
    const h = new THREE.Shape();
    h.moveTo(0, -9); h.bezierCurveTo(-14, 2, -9, 13, 0, 6); h.bezierCurveTo(9, 13, 14, 2, 0, -9);
    const g = new THREE.ExtrudeGeometry(h, { depth: 5, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 1.5, bevelSegments: 2, curveSegments: 8 });
    g.translate(0, 0, -2.5);
    return g;
  })();
  function buildHeartItem() {
    const g = new THREE.Group();
    const h = mesh(heartGeo, new THREE.MeshToonMaterial({ color: 0xff4757, gradientMap: grad, emissive: new THREE.Color('#ff4757'), emissiveIntensity: 0.35 }), 0, 22, 0, g);
    h.scale.setScalar(1.3); g.userData.spin = h;
    g.userData.shadow = blob(12, g);
    return g;
  }
  function buildMedkit() {
    const g = new THREE.Group();
    const k = new THREE.Group(); k.position.y = 14; g.add(k); g.userData.spin = k;
    mesh(box(24, 16, 14), mat('#ffffff'), 0, 0, 0, k);
    mesh(box(14, 4, 14.6), mat('#e74c3c'), 0, 0, 0, k);
    mesh(box(4, 12, 14.6), mat('#e74c3c'), 0, 0, 0, k);
    mesh(box(10, 3, 4), mat('#7f8c8d'), 0, 9, 0, k);
    g.userData.shadow = blob(12, g);
    return g;
  }
  const coinMat = new THREE.MeshToonMaterial({ color: 0xffd32a, gradientMap: grad, emissive: new THREE.Color('#f39c12'), emissiveIntensity: 0.4 });
  function buildCoin() {
    const g = new THREE.Group();
    const c = mesh(cyl(8, 8, 2.4, 16), coinMat, 0, 12, 0, g); c.rotation.x = Math.PI / 2; g.userData.spin = c;
    mesh(box(2, 8, 2.8), mat('#e1a32a'), 0, 0, 0, c).rotation.x = -Math.PI / 2;
    g.userData.shadow = blob(7, g);
    return g;
  }
  function buildRider(r) {
    const g = new THREE.Group();
    const bike = new THREE.Group(); g.add(bike);
    const dark = mat('#2d3436'), jacket = mat(r.color), skin = mat(r.skin);
    g.userData.wheels = [];
    if (r.kind === 'ebike') {
      for (const x of [-20, 20]) { const w = mesh(torus(9, 2.2), dark, x, 10, 0, bike); g.userData.wheels.push(w); }
      mesh(box(42, 3, 3), mat('#636e72'), 0, 16, 0, bike).rotation.z = 0.12;
      mesh(box(3, 26, 3), mat('#636e72'), 16, 22, 0, bike).rotation.z = -0.3;
      mesh(box(3, 3, 18), dark, 20, 34, 0, bike);
      mesh(box(10, 3, 7), dark, -6, 26, 0, bike);
      mesh(box(22, 20, 20), jacket, -20, 36, 0, bike); // delivery box
      mesh(box(22.4, 4, 20.4), mat('#ffffff'), -20, 40, 0, bike);
      mesh(box(6, 16, 10), mat('#2d3436'), -2, 16, 0, bike); // battery
      // seated rider
      for (const z of [-5, 5]) { const l = mesh(box(16, 5, 5), mat('#2d3436'), 2, 26, z, g); l.rotation.z = -0.3; mesh(box(5, 14, 5), mat('#2d3436'), 9, 18, z, g); }
      mesh(box(14, 26, 14), jacket, 0, 41, 0, g).rotation.z = -0.35;
      for (const z of [-8, 8]) mesh(box(20, 4, 4), jacket, 11, 46, z, g).rotation.z = -0.4;
      mesh(sph(9, 12, 10), skin, 8, 60, 0, g);
      mesh(dome(10.5, 0.55), mat('#2d3436'), 7, 61, 0, g);
    } else {
      for (const x of [-14, 14]) { const w = mesh(cyl(5, 5, 4, 12), dark, x, 5, 0, bike); w.rotation.x = Math.PI / 2; g.userData.wheels.push(w); }
      mesh(box(34, 3, 11), mat('#636e72'), 0, 9, 0, bike);
      mesh(box(3, 46, 3), mat('#636e72'), 16, 32, 0, bike).rotation.z = -0.15;
      mesh(box(3, 3, 20), dark, 19, 55, 0, bike);
      // standing rider
      for (const z of [-4, 4]) mesh(box(5, 30, 5), mat('#34495e'), z * 0.5, 25, z, g);
      mesh(box(13, 26, 14), jacket, 2, 52, 0, g).rotation.z = -0.15;
      for (const z of [-8, 8]) mesh(box(18, 4, 4), jacket, 10, 58, z, g).rotation.z = -0.2;
      mesh(sph(9, 12, 10), skin, 6, 73, 0, g);
      mesh(dome(10.5, 0.55), mat(r.color), 5, 74, 0, g);
    }
    for (const w of g.userData.wheels) w.userData.dyn = true;
    mergePerGroup(g, (g.userData.own = []));
    g.userData.shadow = blob(16, g, 2.2);
    g.rotation.y = r.dir > 0 ? 0 : Math.PI;
    return g;
  }
  function buildBanana() {
    const g = new THREE.Group();
    const b = mesh(torus(7, 2.6, Math.PI * 0.9), mat('#f6c90e'), 0, 3, 0, g);
    b.rotation.x = -Math.PI / 2;
    return g;
  }
  function buildUfo() {
    const g = new THREE.Group();
    const sauce = new THREE.Group(); g.add(sauce); g.userData.saucer = sauce;
    mesh(sph(54, 24, 12), mat('#b2bec3'), 0, 0, 0, sauce).scale.set(1, 0.24, 1);
    mesh(dome(20, 0.5), new THREE.MeshToonMaterial({ color: 0xa0e6ff, gradientMap: grad, transparent: true, opacity: 0.75 }), 0, 6, 0, sauce);
    mesh(sph(6.5), mat('#7bed9f'), 0, 12, 0, sauce);
    g.userData.lights = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; g.userData.lights.push(mesh(sph(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd32a }), Math.cos(a) * 46, -2, Math.sin(a) * 46, sauce)); }
    const beam = mesh(geo('beam', () => new THREE.CylinderGeometry(14, 50, 1, 24, 1, true)), new THREE.MeshBasicMaterial({ color: 0x7bed9f, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, g);
    g.userData.beam = beam;
    return g;
  }
  function buildTornado() {
    const g = new THREE.Group();
    const m = new THREE.MeshToonMaterial({ color: 0xa4b0be, gradientMap: grad, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 7; i++) { const t = mesh(cyl(10 + i * 6, 6 + i * 6, 18, 14, true), m, 0, 9 + i * 17, 0, g); t.userData.k = i; }
    return g;
  }
  function buildPie() {
    const g = new THREE.Group();
    mesh(cyl(7, 6, 3, 12), mat('#d4a373'), 0, 0, 0, g);
    mesh(sph(6.5, 10, 6), mat('#fffaf0'), 0, 2, 0, g).scale.set(1, 0.45, 1);
    return g;
  }

  // ---------- object tracking ----------
  const live = new Map();
  let frameId = 0;
  function track(obj, make) {
    let r = live.get(obj);
    if (!r) { r = { o: make(obj) }; scene.add(r.o.root || r.o); live.set(obj, r); }
    r.seen = frameId;
    return r.o;
  }
  function sweep() {
    for (const [obj, r] of live) {
      if (r.seen === frameId) continue;
      const o = r.o.root || r.o;
      scene.remove(o);
      if (r.o.skinMat) r.o.skinMat.dispose();
      if (r.o.own) for (const g of r.o.own) g.dispose();
      if (r.o.userData && r.o.userData.own) for (const g of r.o.userData.own) g.dispose();
      live.delete(obj);
    }
  }
  let leash = null;
  function leashLine() {
    if (!leash) {
      leash = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc0392b }));
      leash.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 40), 3));
      leash.frustumCulled = false;
      scene.add(leash);
    }
    return leash;
  }

  // ---------- camera & frame ----------
  let cx = 0, camDist = 960, inited = false;
  const camDir = new THREE.Vector3();
  let CWv = 1, CHv = 1;
  function resize(w, h) {
    CWv = w; CHv = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function project(x, h, y) {
    _v.set(x, h, y);
    const d = _v.distanceTo(camera.position);
    _v.project(camera);
    return { x: (_v.x * 0.5 + 0.5) * CWv, y: (-_v.y * 0.5 + 0.5) * CHv, k: camDist / d, ok: _v.z < 1 };
  }
  function dayNight() {
    // a full day every 4 minutes of play: day -> sunset -> night -> dawn
    const t = ((elapsed + 40) % 240) / 240;
    let night;
    if (t < 0.55) night = 0; else if (t < 0.65) night = (t - 0.55) / 0.1; else if (t < 0.85) night = 1; else if (t < 0.95) night = 1 - (t - 0.85) / 0.1; else night = 0;
    const dusk = (t > 0.5 && t < 0.7) || (t > 0.8 && t < 0.97) ? Math.sin(Math.min(1, night * 2) * Math.PI) : 0;
    const sky = DAY_SKY.clone().lerp(NIGHT_SKY, night).lerp(DUSK_SKY, dusk * 0.5);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    hemi.intensity = lerp(2.2, 0.8, night); sun.intensity = lerp(2.2, 0.35, night);
    sun.color.set(dusk > 0.2 ? '#ffb38a' : '#fff2dd');
    for (const m of nightMats) m.emissiveIntensity = night * 0.9;
    lampMat.color.set(night > 0.3 ? '#fff59d' : '#cfcfcf');
    return night;
  }
  function frame(dt) {
    frameId++;
    // camera follows the player
    cx = camCX;
    // framing adapts to the screen shape: wide desktop -> square foldable/tablet -> tall phone
    const aspect = CWv / CHv, tanH = Math.tan(FOV / 2 * Math.PI / 180);
    const tall = clamp((1.35 - aspect) / (1.35 - 0.5), 0, 1); // 0 = landscape, 1 = tall portrait
    const pitch = lerp(33, 52, tall) * Math.PI / 180;
    camDir.set(0, Math.sin(pitch), Math.cos(pitch));
    const minVW = lerp(760, 470, tall);
    camDist = lerp(980, 900, tall);
    if (2 * camDist * tanH * aspect < minVW) camDist = minVW / (2 * tanH * aspect);
    if (2 * camDist * tanH * aspect > 1400) camDist = 1400 / (2 * tanH * aspect); // ultra-wide: move in closer
    VW = 2 * camDist * tanH * aspect;
    camX = cx - VW / 2;
    camDist *= 1 - camPunch;
    const target = _w.set(cx, 30, lerp(185, 235, tall));
    camera.position.copy(target).addScaledVector(camDir, camDist);
    if (shake > 0) { camera.position.x += rand(-shake, shake) * 0.7; camera.position.y += rand(-shake, shake) * 0.7; }
    camera.lookAt(target);
    groundG.position.x = Math.round(cx / TILE) * TILE;
    const night = dayNight();

    syncChunks();
    // characters
    const pr = track(player, buildRig); updateRig(pr, player, dt);
    if (decoy) { const dr = track(decoy, buildRig); updateRig(dr, decoy, dt); }
    let li = 0;
    const lp = leashLine().geometry.attributes.position;
    for (const q of peds) {
      if (Math.abs(q.x - cx) > VW * 0.5 + Q.rigRange) continue;
      if (q.type === 'dog') {
        const R = track(q, buildDog); updateDogRig(R, q, dt);
        const o = q.owner;
        if (o && q.state === 'walk' && o.state === 'walk' && !o.danceT && li < 40) {
          const orR = live.get(o);
          if (orR && orR.o.handF) {
            orR.o.handF.getWorldPosition(_v);
            R.head.getWorldPosition(_w);
            lp.setXYZ(li * 2, _v.x, _v.y, _v.z); lp.setXYZ(li * 2 + 1, _w.x, _w.y - 3, _w.z); li++;
          }
        }
      } else { const R = track(q, buildRig); updateRig(R, q, dt); }
    }
    leash.geometry.setDrawRange(0, li * 2); lp.needsUpdate = true;
    for (const c of cars) {
      if (Math.abs(c.x - cx) > VW * 0.5 + 900) continue;
      const g = track(c, buildCar);
      g.position.set(c.x, 0, c.y);
      for (const w of g.userData.wheels) w.rotation.y = c.wheel;
    }
    if (truck) { const g = track(truck, buildTruck); g.position.set(truck.x, 0, truck.y); }
    for (const r of riders) {
      if (Math.abs(r.x - cx) > VW * 0.5 + 700) continue;
      const g = track(r, buildRider);
      g.position.set(r.x, 0, r.y);
      for (const w of g.userData.wheels) { if (r.kind === 'ebike') w.rotation.z = -r.wheel; else w.rotation.y = r.wheel; }
    }
    for (const it of items) {
      const g = track(it, it.kind === 'box' ? buildBox : it.kind === 'heart' ? buildHeartItem : it.kind === 'medkit' ? buildMedkit : it.kind === 'coin' ? buildCoin : buildPizza);
      g.position.set(it.x, it.z, it.y);
      if (g.userData.spin) {
        g.userData.spin.rotation.y = gameTime * 2.5;
        g.userData.spin.position.y = (it.kind === 'heart' ? 22 : it.kind === 'coin' ? 12 : 14) + Math.sin(gameTime * 4 + it.x) * 3;
        g.userData.shadow.position.y = -it.z + 0.6;
      } else if (it.kind === 'box') {
        g.userData.chute.visible = it.z > 30;
        g.userData.crate.rotation.y = gameTime * 1.5 + it.bob;
        g.userData.crate.position.y = 15 + (it.z > 0 ? 0 : Math.sin(gameTime * 4 + it.bob) * 3);
        g.userData.shadow.position.y = -it.z + 0.6;
      } else g.rotation.y = gameTime;
    }
    for (const b of bananas) { const g = track(b, buildBanana); g.position.set(b.x, 0, b.y); g.rotation.y = b.rot; }
    for (const pi of pies) { if (pi.t < 0) continue; const g = track(pi, buildPie); g.position.set(pi.x, pi.z, pi.y); g.rotation.z = gameTime * 10; }
    for (const tn of tornados) {
      const g = track(tn, buildTornado);
      g.position.set(tn.x, 0, tn.y);
      g.children.forEach(c => { c.rotation.y = gameTime * (8 + c.userData.k); c.position.x = Math.sin(gameTime * 5 + c.userData.k) * 4; });
      g.scale.setScalar(Math.min(1, tn.t * 3, tn.life * 2));
    }
    if (ufo) {
      const g = track(ufo, buildUfo);
      g.position.set(ufo.x, ufo.alt, ufo.y);
      g.userData.saucer.rotation.y = gameTime * 2;
      g.userData.lights.forEach((l, i) => l.material.color.set(((gameTime * 10 + i) | 0) % 2 ? '#ffd32a' : '#ff4757'));
      const beam = g.userData.beam;
      beam.visible = ufo.state === 'beam';
      beam.scale.y = ufo.alt; beam.position.y = -ufo.alt / 2;
    }
    sweep();
    renderer.render(scene, camera);
    return night;
  }
  qualityListeners.push(() => {
    applyDpr();
    for (const [i, cvw] of chunkViews) { disposeChunk(cvw); chunkViews.delete(i); }
  });
  // compile every shader variant up front so nothing hitches the first time it appears
  function warmup() {
    const W = new THREE.Group();
    const sample = { look: Object.assign({}, PLAYER_LOOK), facing: 1, size: 1 };
    const R = buildRig(sample);
    const parts = [R.root, buildDog({ look: makeDogLook(), facing: 1 }).root, buildBox(), buildHeartItem(), buildMedkit(), buildPizza(), buildBanana(), buildUfo(), buildTornado(), buildPie(), buildTruck(),
      buildCar({ len: 150, depth: 56, h: 46, color: '#e74c3c', dir: 1, taxi: true }), buildCoin(), buildRider({ kind: 'ebike', dir: 1, color: '#e74c3c', skin: '#e8b48f' }), buildRider({ kind: 'scooter', dir: -1, color: '#0984e3', skin: '#8d5524' }), leashLine()];
    for (const o of parts) { if (o.parent) o.parent.remove(o); W.add(o); }
    W.traverse(o => { o.visible = true; });
    W.position.set(cx, 0, 200);
    scene.add(W);
    renderer.compile(scene, camera);
    scene.remove(W);
    leash = null;
  }
  function stats() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }; }
  return { frame, resize, project, stats, warmup, get camDist() { return camDist; } };
})();
