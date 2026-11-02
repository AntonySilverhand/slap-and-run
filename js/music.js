'use strict';
// =====================================================================
//  Procedural soundtrack that reacts to the game: a calm groove on the
//  menus, full beat while running, and an extra lead line that swells
//  as more people chase you.
// =====================================================================
const Music = (() => {
  let started = false, timer = null, nextT = 0, step = 0, master = null;
  const L = {}; // layer gains
  const BPM = 124, SIX = 60 / BPM / 4;
  const CHORDS = [[48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]]; // C G Am F
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  function voice(out, f, t, dur, type, gain, f2) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function hit(out, t, dur, freq, q, gain, type = 'bandpass') {
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = AC.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }
  function playStep(s, t) {
    const b = s % 16, chord = CHORDS[Math.floor(s / 16) % 4];
    // drums
    if (b % 4 === 0) voice(L.drums, 150, t, 0.16, 'sine', 0.9, 45);
    if (b === 4 || b === 12) hit(L.drums, t, 0.14, 1800, 0.8, 0.5);
    if (b % 2 === 0) hit(L.hats, t, 0.04, 8000, 1, 0.25, 'highpass');
    if (b % 4 === 2) hit(L.hats, t, 0.09, 9000, 1, 0.18, 'highpass');
    // bass
    if ([0, 3, 6, 8, 11, 14].includes(b)) voice(L.bass, hz(chord[0] - 12 + (b === 14 ? 7 : 0)), t, 0.2, 'square', 0.22);
    // pad (menus)
    if (b === 0) for (const n of chord) voice(L.pad, hz(n), t, SIX * 15, 'triangle', 0.05);
    // lead arpeggio (chase layer)
    const arp = [0, 2, 1, 3, 2, 1, 3, 2];
    if (b % 2 === 0) voice(L.lead, hz(chord[arp[(b / 2) % 8]] + 12), t, 0.16, 'square', 0.07);
    if (b === 0 || b === 10) voice(L.lead, hz(chord[3] + 24), t, 0.3, 'triangle', 0.06);
  }
  function schedule() {
    if (!AC) return;
    while (nextT < AC.currentTime + 0.15) { playStep(step, nextT); nextT += SIX; step = (step + 1) % 64; }
    mix();
  }
  function set(g, v) { g.gain.setTargetAtTime(v, AC.currentTime, 0.4); }
  function mix() {
    const on = save.music && !muted && !document.hidden;
    let nc = 0;
    if (gs === 'play') for (const q of peds) if (q.state === 'chase') nc++;
    const playing = gs === 'play', menu = gs === 'title' || gs === 'over' || gs === 'paused';
    set(master, on ? 0.55 : 0);
    set(L.drums, playing ? 0.9 : gs === 'dying' ? 0.2 : 0);
    set(L.hats, playing ? 0.35 + Math.min(0.5, nc * 0.12) : 0);
    set(L.bass, playing ? 0.9 : menu ? 0.45 : 0.3);
    set(L.pad, menu ? 0.9 : 0.25);
    set(L.lead, playing ? Math.min(1, nc / 3) : 0);
  }
  function start() {
    if (started || !ac()) return;
    started = true;
    master = AC.createGain(); master.gain.value = 0; master.connect(AC.destination);
    for (const k of ['drums', 'hats', 'bass', 'pad', 'lead']) { L[k] = AC.createGain(); L[k].gain.value = 0; L[k].connect(master); }
    nextT = AC.currentTime + 0.1;
    timer = setInterval(schedule, 30);
  }
  function toggle() { save.music = !save.music; persist(); if (save.music) start(); }
  return { start, toggle };
})();
