// Klang-Bausteine und Rezepte für alle erzeugten Sounds (Klangkonzept: docs/SOUNDS.md).
// Jeder Sound besteht aus Schichten: Anschlag (Klick/Rauschen), Körper (Ton, Pitch-Fall) und Ausklang (Hall-Anteil).
// Tonhöhen in C (Menü-Musik c-Moll): Erfolg C-Dur, Misserfolg c-Moll. Was oft kommt, streut leicht in Tonhöhe und Pegel.
// Belohnungen und Menü klingen nach einer Familie: Marimba/Glocke (FM) statt Rechteckwellen.

let ac = null, bus = null, noiseBuf = null, level = 1;
// Pegel-Abgleich je Sound in dB, gemessen mit tools/sound-lab (lautestes 100-ms-Fenster gegen die Lautstärke-Leiter in
// docs/SOUNDS.md, Spitze bleibt unter -2 dB). Häufige oder dezente Sounds zielen 4 dB unter ihre Stufe, höchstens +18 dB.
const TRIM = { hammer: -4, chip: 7, head: 5, bounce: 7, post: 1, wallhit: 13, bumper: 4, swing: 18, jump: 16, land: 11, slide: 18, bomb: 15, pound: -1, stomp: 6, bump: 7, pop: 13, full: 10, arm: 15, charged: 18, super: -1, launch: 8, zap: 11, freeze: 11, burn: 14, quake: -6, tick: 18, emote: 18, puSpawn: 18, pu: 11, count: 18, go: 17, whistle: 11, whistle1: 11, goal: 7, ohh: 18, win: 16, lose: 18, click: 18, coin: 13, levelup: 9, "chest-shake": 16, "chest-open": -5, "chest-selten": 9, "chest-episch": 9, "chest-legend": 1, "chest-head": -9, "chest-item": 12, shards: 14 };
/** Verbindet die Bausteine mit dem Mischpult aus webaudio.js. bus: { ui, body, fx, big, verb } */
export function initSynth(ctx, buses, noise) { ac = ctx; bus = buses; noiseBuf = noise; }

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
/** ±p Streuung um 1 */
const spread = p => 1 + (Math.random() * 2 - 1) * p;
// C-Dur-Töne als MIDI: C4 = 60
const C = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, G5: 79, A5: 81, C6: 84, E6: 88, G6: 91, C7: 96 };

// ---------- Ausgang einer Stimme: Pegel-Hüllkurve -> Panorama -> Kategorie-Bus (+ Hall-Anteil) ----------
function outNode(t, { cat = "fx", pan = 0, send = 0 } = {}) {
  const g = ac.createGain(), p = ac.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p); p.connect(bus[cat] || bus.fx);
  if (send > 0) { const s = ac.createGain(); s.gain.value = send; p.connect(s); s.connect(bus.verb); }
  return g;
}
/** Hüllkurve: schneller Anstieg a, Halten h, exponentieller Ausklang d */
function envelope(g, t, vol, a, h, d) {
  vol *= level;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  if (h > 0) g.gain.setValueAtTime(Math.max(0.0002, vol), t + a + h);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + d);
  return t + a + h + d;
}

/** Ton: 1-3 leicht verstimmte Oszillatoren, optional Tonhöhen-Fall und Tiefpass mit eigener Hüllkurve */
export function tone(dt, o) {
  if (!ac) return;
  const t = ac.currentTime + dt, { type = "sine", f0, f1 = f0, glide = o.d || 0.1, vol = 0.2, a = 0.004, h = 0, d = 0.15, voices = 1, det = 8, lp = 0, lp1 = 0, q = 0.7 } = o;
  const g = outNode(t, o), end = envelope(g, t, vol / Math.sqrt(voices), a, h, d);
  let dst = g;
  if (lp) {
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.Q.value = q; f.frequency.setValueAtTime(lp, t);
    if (lp1) f.frequency.exponentialRampToValueAtTime(Math.max(40, lp1), t + a + h + d);
    f.connect(g); dst = f;
  }
  for (let i = 0; i < voices; i++) {
    const osc = ac.createOscillator(); osc.type = type;
    osc.detune.value = voices > 1 ? (i / (voices - 1) - 0.5) * 2 * det : 0;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + glide);
    osc.connect(dst); osc.start(t); osc.stop(end + 0.05);
  }
}

/** FM-Glocke/Marimba: Träger f, Modulator f*ratio, Modulationstiefe klingt schneller ab als der Ton */
export function fm(dt, o) {
  if (!ac) return;
  const t = ac.currentTime + dt, { f, ratio = 3.5, index = 2, idxD = 0.08, vol = 0.15, a = 0.002, d = 0.4 } = o;
  const g = outNode(t, o), end = envelope(g, t, vol, a, 0, d);
  const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain();
  car.frequency.value = f; mod.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.02), t + idxD);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g);
  car.start(t); mod.start(t); car.stop(end + 0.05); mod.stop(end + 0.05);
}

/** Gefiltertes Rauschen (Anschlag, Whoosh, Rascheln). f0 -> f1 Filterfahrt */
export function hiss(dt, o) {
  if (!ac) return;
  const t = ac.currentTime + dt, { type = "bandpass", f0 = 1000, f1 = 0, q = 1, vol = 0.2, a = 0.003, h = 0, d = 0.1, flutter = 0 } = o;
  const g = outNode(t, o), end = envelope(g, t, vol, a, h, d);
  const n = ac.createBufferSource(), f = ac.createBiquadFilter();
  n.buffer = noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), end);
  let src = n;
  if (flutter) { // Rascheln: Lautstärke zittert
    const am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    am.gain.value = 0.6; lfo.type = "square"; lfo.frequency.value = flutter; lg.gain.value = 0.4;
    lfo.connect(lg); lg.connect(am.gain); n.connect(am); src = am; lfo.start(t); lfo.stop(end + 0.05);
  }
  src.connect(f); f.connect(g); n.start(t, Math.random() * 1.5); n.stop(end + 0.05);
}

/** Tiefer Wumms mit Klick: Sinus mit schnellem Tonhöhen-Fall */
function thump(dt, f0, f1, d, vol, o = {}) {
  tone(dt, { type: "sine", f0, f1, glide: d * 0.6, vol, a: 0.002, d, cat: "body", ...o });
  hiss(dt, { type: "highpass", f0: 3500, vol: vol * 0.22, a: 0.001, d: 0.012, cat: "body", pan: o.pan || 0 });
}
/** Gummi-Feder: Ton mit Vibrato, der nach oben schnellt */
function boing(dt, f0, f1, d, vol, o = {}) {
  if (!ac) return;
  const t = ac.currentTime + dt, g = outNode(t, { cat: "body", ...o }), end = envelope(g, t, vol, 0.003, 0, d);
  const osc = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
  osc.type = "triangle"; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + d * 0.4);
  lfo.frequency.setValueAtTime(28, t); lfo.frequency.exponentialRampToValueAtTime(8, end); lg.gain.setValueAtTime(f1 * 0.12, t); lg.gain.exponentialRampToValueAtTime(1, end);
  lfo.connect(lg); lg.connect(osc.frequency); osc.connect(g); osc.start(t); lfo.start(t); osc.stop(end + 0.05); lfo.stop(end + 0.05);
}
/** Marimba-Ton in MIDI */
const mallet = (dt, m, vol, o = {}) => fm(dt, { f: mtof(m), ratio: 4, index: 1.6, idxD: 0.05, vol, d: o.d || 0.35, cat: "ui", send: 0.12, ...o });
/** Glocke in MIDI (unharmonisch, klingt länger) */
const bell = (dt, m, vol, o = {}) => fm(dt, { f: mtof(m), ratio: 3.53, index: 2.4, idxD: 0.25, vol, d: o.d || 0.9, cat: "ui", send: 0.25, ...o });
/** Glitzern: viele leise hohe Glocken */
function sparkle(dt, n, vol, o = {}) { for (let i = 0; i < n; i++) bell(dt + i * rnd(0.025, 0.05), [C.C6, C.E6, C.G6, C.C7][Math.floor(Math.random() * 4)] + 12 * (Math.random() < 0.3), vol * rnd(0.5, 1), { d: 0.35, pan: rnd(-0.5, 0.5), ...o }); }
/** Synth-Blechbläser (für Fanfaren): verstimmte Sägezähne, Filter öffnet sich */
const brass = (dt, m, vol, d, o = {}) => tone(dt, { type: "sawtooth", f0: mtof(m), voices: 3, det: 10, vol, a: 0.03, h: d * 0.5, d: d * 0.5, lp: 600, lp1: 3200, q: 1.2, cat: "big", send: 0.25, ...o });

// ---------- Rezepte ----------
// v = Stärke (Schuss, Kopfball, Aufprall …), 1 = normal. Rückgabe true = bekannt.
export function play(kind, v = 1) {
  if (!ac) return false;
  level = Math.pow(10, (TRIM[kind] || 0) / 20);
  try { return recipe(kind, v); } finally { level = 1; }
}
function recipe(kind, v) {
  const k = Math.max(0.3, Math.min(1.6, v)), pan = rnd(-0.12, 0.12), sp = spread(0.04);
  switch (kind) {
    // ----- Ball und Körper -----
    case "kick":
      thump(0, 120 * sp * (0.85 + k * 0.15), 48, 0.17, 0.75 * Math.min(1.3, k), { pan, send: 0.08 });
      hiss(0, { type: "lowpass", f0: 2600 * sp, f1: 400, q: 0.8, vol: 0.35 * k, d: 0.07, cat: "body", pan });
      if (k > 1.3) hiss(0.01, { type: "bandpass", f0: 700, f1: 3200, q: 0.8, vol: 0.18, d: 0.28, cat: "body", pan, send: 0.2 });
      return true;
    case "hammer":
      thump(0, 160 * sp, 36, 0.32, 0.95, { pan, send: 0.18 });
      tone(0, { type: "sawtooth", f0: 95, f1: 38, vol: 0.2, d: 0.18, lp: 900, lp1: 120, cat: "body", pan });
      hiss(0, { type: "lowpass", f0: 3500, f1: 300, q: 0.9, vol: 0.5, d: 0.1, cat: "body", pan });
      hiss(0.015, { type: "bandpass", f0: 500, f1: 4500, q: 0.7, vol: 0.3, d: 0.45, cat: "fx", pan, send: 0.3 });
      return true;
    case "chip":
      thump(0, 180 * sp, 90, 0.1, 0.4, { pan });
      mallet(0.01, C.C6, 0.12, { cat: "body", pan, d: 0.2 });
      hiss(0, { type: "highpass", f0: 2500, vol: 0.12, d: 0.04, cat: "body", pan });
      return true;
    case "head":
      thump(0, 150 * sp * (0.9 + k * 0.1), 80, 0.12, 0.5 * Math.min(1.3, k), { pan });
      hiss(0, { type: "bandpass", f0: 850 * sp, q: 4, vol: 0.4 * k, d: 0.07, cat: "body", pan, send: 0.08 });
      tone(0, { type: "triangle", f0: 320 * sp, f1: 190, vol: 0.12 * k, d: 0.09, cat: "body", pan });
      return true;
    case "bounce":
      thump(0, 95 * sp, 55, 0.09, Math.min(0.42, 0.08 + v * 0.0004), { pan });
      hiss(0, { type: "lowpass", f0: 900, vol: Math.min(0.1, v * 0.0001), d: 0.04, cat: "body", pan });
      return true;
    case "post": // Metall-Pling: unharmonische Teiltöne, klingen nach
      hiss(0, { type: "bandpass", f0: 3000, q: 2, vol: 0.25, d: 0.03, cat: "body", pan });
      [[880, 0.22, 0.9], [2420, 0.1, 0.6], [3960, 0.06, 0.4], [5300, 0.04, 0.25]].forEach(([f, vol, d]) => tone(0, { type: "sine", f0: f * sp, vol, d, cat: "fx", pan, send: 0.35 }));
      thump(0, 140, 70, 0.1, 0.4, { pan });
      return true;
    case "wallhit": // Holz-Klopfen
      hiss(0, { type: "bandpass", f0: 420 * sp, q: 3, vol: 0.4, d: 0.08, cat: "body", pan, send: 0.1 });
      tone(0, { type: "triangle", f0: 190 * sp, f1: 120, vol: 0.25, d: 0.1, cat: "body", pan });
      return true;
    case "bumper":
      boing(0, 240 * sp, 700 * sp, 0.3, 0.32 * Math.min(1.3, 0.6 + v), { pan, send: 0.15 });
      fm(0, { f: 520 * sp, ratio: 2.01, index: 1.2, vol: 0.12, d: 0.15, cat: "body", pan });
      return true;
    // ----- Arenen -----
    case "geyser": // Vulkan: Grollen, dann zischende Fontäne
      thump(0, 70, 32, 0.5, 0.7, { send: 0.3 });
      hiss(0.02, { type: "bandpass", f0: 400, f1: 2600, q: 0.6, vol: 0.45, a: 0.05, d: 0.7, cat: "fx", send: 0.35 });
      hiss(0.08, { type: "highpass", f0: 3500, vol: 0.18, a: 0.1, d: 0.6, flutter: 22, cat: "fx" });
      return true;
    case "noclip": // Backrooms: kurzes digitales Stottern, dann ein hohler Ton
      for (let i = 0; i < 6; i++) tone(i * 0.035, { type: "square", f0: rnd(300, 1800), f1: rnd(200, 900), vol: 0.06, d: 0.03, lp: 3000, cat: "fx", pan: rnd(-0.4, 0.4) });
      fm(0.2, { f: 220, ratio: 1.5, index: 2, idxD: 0.3, vol: 0.12, d: 0.5, cat: "fx", send: 0.4 });
      return true;
    case "grind": // Skatepark: Ball schrammt über die Stahlkante
      hiss(0, { type: "bandpass", f0: 2400 * sp, f1: 1600, q: 3, vol: 0.22 * k, a: 0.01, d: 0.18, flutter: 60, cat: "body", pan });
      tone(0, { type: "sawtooth", f0: 900 * sp, f1: 700, vol: 0.04, d: 0.12, lp: 2500, cat: "body", pan });
      return true;
    case "swing":
      hiss(0, { type: "bandpass", f0: 500 * sp, f1: 2600, q: 1.2, vol: 0.3, a: 0.03, d: 0.14, cat: "body", pan });
      return true;
    case "jump":
      tone(0, { type: "sine", f0: 260 * sp, f1: 560 * sp, glide: 0.06, vol: 0.1, d: 0.08, cat: "body", pan });
      hiss(0, { type: "lowpass", f0: 1200, vol: 0.06, d: 0.05, cat: "body", pan });
      return true;
    case "land":
      thump(0, 110 * sp, 55, 0.08, 0.26, { pan });
      hiss(0, { type: "lowpass", f0: 700, vol: 0.12, d: 0.06, cat: "body", pan });
      return true;
    case "slide": // Rutschen über Rasen
      hiss(0, { type: "bandpass", f0: 1900 * sp, f1: 900, q: 0.7, vol: 0.2, a: 0.02, d: 0.26, flutter: 38, cat: "body", pan });
      hiss(0, { type: "lowpass", f0: 600, vol: 0.12, d: 0.2, cat: "body", pan });
      return true;
    case "bomb": // kurzer Luftzug nach unten; der Fall dauert nur 0.1–0.25 s, danach kommt "pound"
      hiss(0, { type: "bandpass", f0: 3000 * sp, f1: 450, q: 1.3, vol: 0.3, a: 0.025, d: 0.15, cat: "fx", pan });
      hiss(0, { type: "lowpass", f0: 1400, f1: 300, vol: 0.14, a: 0.03, d: 0.14, cat: "fx", pan });
      tone(0, { type: "triangle", f0: 360 * sp, f1: 130, glide: 0.15, vol: 0.06, a: 0.02, d: 0.14, cat: "fx", pan });
      return true;
    case "pound":
      thump(0, 130 * sp, 34, 0.26, 0.55 * Math.min(1.3, 0.6 + v), { pan, send: 0.2 });
      hiss(0, { type: "lowpass", f0: 900, f1: 120, vol: 0.35, d: 0.2, cat: "body", pan });
      return true;
    case "stomp":
      boing(0, 180 * sp, 520 * sp, 0.28, 0.3, { pan, send: 0.1 });
      thump(0, 140, 70, 0.08, 0.3, { pan });
      return true;
    case "squash":
      thump(0, 100, 40, 0.2, 0.55, { pan });
      hiss(0, { type: "lowpass", f0: 1600, f1: 300, q: 2, vol: 0.4, d: 0.12, cat: "body", pan });
      boing(0.03, 170, 620 * (0.6 + v * 0.4), 0.22, 0.25 * (0.6 + v), { pan });
      return true;
    case "bump": // Cartoon-Bonk: Holzblock plus Wumms
      fm(0, { f: 640 * sp, ratio: 1.48, index: 3, idxD: 0.03, vol: 0.2 * Math.min(1.4, k), d: 0.12, cat: "body", pan });
      thump(0, 170 * sp, 70, 0.1, 0.32 * Math.min(1.5, k), { pan });
      return true;
    case "pop":
      tone(0, { type: "sine", f0: 380 * sp, f1: 1300, glide: 0.05, vol: 0.16, d: 0.06, cat: "body", pan });
      hiss(0, { type: "highpass", f0: 4000, vol: 0.06, d: 0.01, cat: "body", pan });
      return true;

    // ----- Supers -----
    case "full": [C.C5, C.E5, C.G5, C.C6].forEach((m, i) => mallet(i * 0.055, m, 0.14, { cat: "fx" })); sparkle(0.22, 3, 0.05); return true;
    case "arm":
      tone(0, { type: "sawtooth", f0: 160, f1: 820, glide: 0.32, vol: 0.12, voices: 2, a: 0.02, d: 0.3, lp: 400, lp1: 4000, cat: "fx", send: 0.15 });
      hiss(0, { type: "bandpass", f0: 600, f1: 5000, q: 1.5, vol: 0.08, a: 0.1, d: 0.22, cat: "fx" });
      return true;
    case "charged": bell(0, C.C7, 0.06, { d: 0.25, cat: "fx" }); return true;
    case "super":
      tone(0, { type: "sine", f0: 120, f1: 40, glide: 0.5, vol: 0.55, d: 0.55, cat: "big" });
      hiss(0, { type: "bandpass", f0: 300, f1: 5000, q: 0.8, vol: 0.4, a: 0.02, d: 0.55, cat: "big", send: 0.3 });
      [C.C4, C.E4, C.G4, C.C5].forEach(m => brass(0, m, 0.07, 0.45));
      sparkle(0.05, 4, 0.05);
      return true;
    case "launch":
      hiss(0, { type: "highpass", f0: 700, f1: 6000, q: 0.7, vol: 0.32, a: 0.02, d: 0.38, cat: "fx", send: 0.15 });
      tone(0, { type: "sawtooth", f0: 200, f1: 900, glide: 0.3, vol: 0.06, d: 0.3, lp: 2000, cat: "fx" });
      return true;
    case "zap":
      tone(0, { type: "square", f0: 1600 * sp, f1: 220, glide: 0.07, vol: 0.06, d: 0.07, lp: 5000, cat: "fx", pan });
      for (let i = 0; i < 3; i++) hiss(i * 0.02, { type: "highpass", f0: 3000 + i * 1500, vol: 0.18, d: 0.015, cat: "fx", pan });
      return true;
    case "freeze":
      [C.G6, C.C7, C.E6 + 0.4].forEach((m, i) => bell(i * 0.03, m, 0.07, { d: 0.6, cat: "fx" }));
      hiss(0, { type: "highpass", f0: 6000, vol: 0.12, d: 0.35, cat: "fx", send: 0.3 });
      return true;
    case "burn":
      hiss(0, { type: "lowpass", f0: 1600, f1: 300, q: 0.8, vol: 0.38, a: 0.02, d: 0.42, cat: "fx", send: 0.15 });
      for (let i = 0; i < 6; i++) hiss(rnd(0, 0.35), { type: "highpass", f0: 2500, vol: 0.12, d: 0.01, cat: "fx", pan: rnd(-0.3, 0.3) });
      return true;
    case "quake":
      tone(0, { type: "sine", f0: 62, f1: 28, glide: 0.7, vol: 0.85, d: 0.8, cat: "big" });
      hiss(0, { type: "lowpass", f0: 420, f1: 60, vol: 0.5, a: 0.01, d: 0.7, cat: "big", send: 0.3 });
      return true;
    case "tick": fm(0, { f: 1500, ratio: 2.7, index: 1.2, idxD: 0.012, vol: 0.2, d: 0.05, cat: "ui" }); return true;
    case "emote": tone(0, { type: "sine", f0: 420 * sp, f1: 980, glide: 0.06, vol: 0.12, d: 0.09, cat: "ui", send: 0.08 }); return true;

    // ----- Power-ups -----
    case "puSpawn": sparkle(0, 3, 0.04); return true;
    case "pu": [C.C5, C.E5, C.G5, C.C6].forEach((m, i) => mallet(i * 0.05, m, 0.13, { cat: "fx" })); sparkle(0.18, 4, 0.05); return true;

    // ----- Spielablauf -----
    case "count": bell(0, C.C5, 0.13, { d: 0.35 }); return true;
    case "go": [C.C6, C.E6, C.G6].forEach(m => bell(0, m, 0.1, { d: 0.6 })); return true;
    case "whistle": [[0, 0.13], [0.2, 0.13], [0.42, 0.6]].forEach(([t, d]) => whistle(t, d)); return true;
    case "whistle1": whistle(0, 0.38); return true;
    case "goal": // Stadion-Hupe: verstimmte Blechbläser mit leichtem Vibrato
      [C.C4 - 12, C.G4 - 12, C.C4, C.E4].forEach((m, i) => brass(0, m, i < 2 ? 0.1 : 0.07, 1.25, { cat: "big", lp: 700, lp1: 2400 }));
      hiss(0, { type: "bandpass", f0: 900, f1: 1400, q: 0.5, vol: 0.25, a: 0.05, d: 2, cat: "big", send: 0.3 });
      return true;
    case "ohh": // Publikum raunt: Formant „ooh“, Tonhöhe sinkt
      [[420, 520], [780, 640]].forEach(([f0, f1]) => hiss(0, { type: "bandpass", f0, f1, q: 4, vol: 0.28, a: 0.15, d: 0.95, cat: "big", send: 0.4 }));
      return true;
    case "win":
      [C.C5, C.E5, C.G5].forEach((m, i) => mallet(i * 0.11, m, 0.15, { d: 0.4 }));
      [C.C4, C.E4, C.G4, C.C5].forEach(m => brass(0.33, m, 0.06, 0.9, { cat: "ui" }));
      bell(0.33, C.C6, 0.1, { d: 1.2 }); sparkle(0.4, 5, 0.04);
      return true;
    case "lose": [C.G4, C.E4 - 1, C.C4].forEach((m, i) => mallet(i * 0.17, m, 0.15, { d: 0.5, idxD: 0.03 })); return true;

    // ----- Menü und Fortschritt -----
    case "click": fm(0, { f: 1100 * spread(0.06), ratio: 3.1, index: 1.4, idxD: 0.01, vol: 0.16, d: 0.045, cat: "ui" }); return true;
    case "coin": bell(0, C.B4 + 12, 0.09, { d: 0.15 }); bell(0.07, C.E6, 0.1, { d: 0.45 }); return true;
    case "levelup":
      [C.C5, C.E5, C.G5, C.C6, C.E6].forEach((m, i) => mallet(i * 0.07, m, 0.13, { d: 0.45 }));
      [C.C4, C.G4, C.E5].forEach(m => brass(0.3, m, 0.05, 0.6, { cat: "ui" })); sparkle(0.35, 4, 0.04);
      return true;
    case "chest-shake":
      hiss(0, { type: "bandpass", f0: rnd(1500, 2600), q: 3, vol: 0.1, d: 0.05, cat: "ui" });
      fm(0, { f: rnd(170, 220), ratio: 1.5, index: 2, idxD: 0.02, vol: 0.1, d: 0.06, cat: "ui" });
      return true;
    case "chest-open":
      thump(0, 150, 55, 0.22, 0.5, { cat: "big", send: 0.2 });
      hiss(0, { type: "highpass", f0: 1500, f1: 7000, q: 0.7, vol: 0.25, d: 0.35, cat: "big", send: 0.25 });
      mallet(0.03, C.C5, 0.12); mallet(0.08, C.C6, 0.1);
      return true;
    case "chest-selten": [C.C5, C.E5, C.G5].forEach((m, i) => mallet(i * 0.08, m, 0.14)); return true;
    case "chest-episch": [C.C5, C.E5, C.G5, C.C6].forEach((m, i) => mallet(i * 0.08, m, 0.14)); bell(0.32, C.G6, 0.08, { d: 1 }); sparkle(0.35, 4, 0.04); return true;
    case "chest-legend":
      [C.C5, C.E5, C.G5, C.C6, C.E6].forEach((m, i) => mallet(i * 0.07, m, 0.15));
      [C.C4, C.E4, C.G4, C.C5].forEach(m => brass(0.35, m, 0.06, 1.1, { cat: "big" }));
      bell(0.35, C.C7, 0.08, { d: 1.4 }); sparkle(0.4, 8, 0.05);
      return true;
    case "chest-head":
      [C.G4, C.C5, C.E5, C.G5, C.C6, C.E6, C.G6].forEach((m, i) => mallet(i * 0.06, m, 0.15));
      [C.C4 - 12, C.C4, C.E4, C.G4, C.C5].forEach(m => brass(0.42, m, 0.06, 1.4, { cat: "big" }));
      tone(0.42, { type: "sine", f0: 65, f1: 65, vol: 0.4, a: 0.02, d: 1.2, cat: "big" });
      bell(0.42, C.C7, 0.09, { d: 1.6 }); sparkle(0.45, 10, 0.05);
      return true;
    case "chest-item": mallet(0, C.C6, 0.11, { d: 0.15 }); bell(0.02, C.C7, 0.04, { d: 0.3 }); return true;
    case "shards": [C.E6 + 12, C.G6 + 12, C.C7 + 12].forEach((m, i) => bell(i * 0.04, m, 0.05, { d: 0.5 })); hiss(0, { type: "highpass", f0: 7000, vol: 0.07, d: 0.15, cat: "ui" }); return true;
  }
  return false;
}

/** Schiri-Trillerpfeife: zwei Töne um 3,1 kHz, die Kugel in der Pfeife lässt ihn schnell flattern, dazu Atem */
function whistle(dt, d) {
  if (!ac) return;
  const t = ac.currentTime + dt, g = outNode(t, { cat: "fx", send: 0.2 }), end = envelope(g, t, 0.11, 0.012, d * 0.7, d * 0.3);
  const am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
  am.gain.value = 0.65; lfo.frequency.value = rnd(24, 30); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(am.gain); am.connect(g);
  [3080, 3160].forEach(f => { const o = ac.createOscillator(); o.frequency.value = f * spread(0.01); o.connect(am); o.start(t); o.stop(end + 0.05); });
  lfo.start(t); lfo.stop(end + 0.05);
  hiss(dt, { type: "bandpass", f0: 3200, q: 2, vol: 0.05, a: 0.01, h: d * 0.6, d: d * 0.4, cat: "fx" });
}

// ---------- Musik-Instrumente (für den Sequenzer in webaudio.js, schreiben auf bus.music) ----------
export const inst = {
  bass(t, m, d, vol) {
    const g = ac.createGain(), f = ac.createBiquadFilter(), o = ac.createOscillator(), s = ac.createOscillator();
    o.type = "sawtooth"; o.frequency.value = mtof(m); s.type = "sine"; s.frequency.value = mtof(m - 12);
    f.type = "lowpass"; f.Q.value = 4; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f); s.connect(g); f.connect(g); g.connect(bus.music);
    o.start(t); s.start(t); o.stop(t + d + 0.02); s.stop(t + d + 0.02);
  },
  pad(t, m, d, vol) {
    const g = ac.createGain(), f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800; f.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    f.connect(g); g.connect(bus.music); const s = ac.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(bus.verb);
    [-9, 9].forEach(det => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + d + 0.05); });
  },
  lead(t, m, d, vol) {
    const g = ac.createGain(), car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), f = mtof(m);
    car.frequency.value = f; mod.frequency.value = f * 2; mg.gain.setValueAtTime(f * 1.5, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + d * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(bus.music); const s = ac.createGain(); s.gain.value = 0.35; g.connect(s); s.connect(bus.verb);
    car.start(t); mod.start(t); car.stop(t + d + 0.02); mod.stop(t + d + 0.02);
  },
  drum(t, kind, vel = 1) {
    const g = ac.createGain(); g.connect(bus.music);
    if (kind === "k") {
      const o = ac.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      g.gain.setValueAtTime(0.9 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g); o.start(t); o.stop(t + 0.24);
      return;
    }
    const n = ac.createBufferSource(), f = ac.createBiquadFilter(); n.buffer = noiseBuf;
    if (kind === "s") {
      f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.8;
      const o = ac.createOscillator(), og = ac.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      og.gain.setValueAtTime(0.35 * vel, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(og); og.connect(bus.music); o.start(t); o.stop(t + 0.12);
      g.gain.setValueAtTime(0.45 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      const s = ac.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(bus.verb);
    } else { f.type = "highpass"; f.frequency.value = 7500; g.gain.setValueAtTime(0.14 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === "o" ? 0.18 : 0.035)); }
    n.connect(f); f.connect(g); n.start(t, Math.random()); n.stop(t + 0.25);
  },
};
