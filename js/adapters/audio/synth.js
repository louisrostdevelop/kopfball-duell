// Klang-Bausteine und Rezepte für alle erzeugten Sounds.
// Jeder Sound besteht aus Schichten: Anschlag (Klick/Rauschen), Körper (Ton, Pitch-Fall) und Ausklang (Hall-Anteil).
// Tonhöhen in C (Menü-Musik c-Moll): Erfolg C-Dur, Misserfolg c-Moll. Was oft kommt, streut leicht in Tonhöhe und Pegel.
// Belohnungen und Menü klingen nach einer Familie: Marimba/Glocke (FM) statt Rechteckwellen.

let ac = null, bus = null, noiseBuf = null, level = 1;
// Pegel-Abgleich je Sound in dB, messbar mit tools/sound-lab (lautestes 100-ms-Fenster gegen die Lautstärke-Leiter der
// Kategorien, Spitze bleibt unter -2 dB). Häufige oder dezente Sounds zielen 4 dB unter ihre Stufe, höchstens +18 dB.
const TRIM = { hammer: -4, chip: 7, head: 5, bounce: 7, post: 1, wallhit: 13, bumper: 4, swing: 18, jump: 16, land: 11, slide: 18, bomb: 15, pound: -1, stomp: 6, bump: 7, pop: 13, full: 10, arm: 15, super: -1, launch: 8, zap: 11, freeze: 11, burn: 14, quake: -6, tick: 18, emote: 18, puSpawn: 14, pu: 11, "pu-atk": 11, "pu-def": 11, "pu-mov": 11, "pu-chaos": 15, "pu-gold": 11, puPop: 14, puBoing: 6, puPuff: 17, piep: 18, puWing: 16, crack: 12, shatter: 7.5, portal: 10, magnet: 10, puFloat: 7, puWind: 16, puTime: 0.5, count: 18, go: 17, whistle: 11, whistle1: 11, goal: 7, ohh: 18, win: 16, lose: 18, click: 18, coin: 13, levelup: 9, "chest-shake": 16, "chest-open": -5, "chest-selten": 9, "chest-episch": 9, "chest-legend": 1, "chest-head": -9, "chest-item": 12, shards: 14 };
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
    // Einsammeln (Schauraum tools/powerups): Akkord je Familie, Whoosh des fliegenden Symbols, Stempel beim Landen
    case "pu-atk": case "pu-def": case "pu-mov": case "pu-chaos": case "pu-gold": puPick(kind.slice(3)); return true;
    case "puPop": // Kugel läuft ab und zerplatzt
      tone(0, { type: "sine", f0: 520 * sp, f1: 1150, glide: 0.1, vol: 0.14, d: 0.12, cat: "fx", pan });
      hiss(0, { type: "highpass", f0: 4000, vol: 0.05, d: 0.015, cat: "fx", pan });
      return true;
    case "puBoing": boing(0, 220 * sp, 530 * sp, 0.3, 0.26, { cat: "fx", send: 0.12 }); return true;   // Riesenschuh, Riesenkopf, Riesentor
    case "puPuff": hiss(0, { type: "lowpass", f0: 900, f1: 260, q: 0.7, vol: 0.32, a: 0.01, d: 0.3, cat: "fx", send: 0.1 }); return true;   // Mini
    case "piep": tone(0, { type: "square", f0: 1500 * sp, vol: 0.06, d: 0.07, lp: 5000, cat: "fx", pan }); tone(0.09, { type: "square", f0: 1900 * sp, vol: 0.06, d: 0.07, lp: 5000, cat: "fx", pan }); return true;
    case "puWing": // Doppelsprung mit Flügeln: Luftstoß und Plopp
      hiss(0, { type: "bandpass", f0: 1400 * sp, f1: 3200, q: 1, vol: 0.2, a: 0.02, d: 0.2, cat: "fx", pan });
      tone(0, { type: "sine", f0: 520 * sp, f1: 1150, glide: 0.1, vol: 0.08, d: 0.12, cat: "fx", pan });
      return true;
    case "crack": // Riss: Torwand, Doppelgänger, Eisblock
      hiss(0, { type: "highpass", f0: 3000 * sp, vol: 0.15 * k, d: 0.08, cat: "fx", pan });
      tone(0, { type: "square", f0: 1800 * sp, vol: 0.05 * k, d: 0.05, lp: 6000, cat: "fx", pan });
      return true;
    case "shatter": // Klirren: Wand bricht, Eis springt, Blase platzt
      hiss(0, { type: "highpass", f0: 2200, f1: 5000, vol: 0.16 * k, d: 0.35, cat: "fx", send: 0.2 });
      for (let i = 0; i < 5; i++) tone(i * 0.03, { type: "triangle", f0: rnd(1400, 3000), vol: 0.08 * k, d: 0.12, cat: "fx", pan: rnd(-0.3, 0.3), send: 0.2 });
      return true;
    case "portal": // Zischen: Ball fährt durchs Portal
      hiss(0, { type: "bandpass", f0: 4000, f1: 800, q: 1.5, vol: 0.13, a: 0.02, d: 0.3, cat: "fx", send: 0.25 });
      tone(0, { type: "sawtooth", f0: 1200 * sp, f1: 300, glide: 0.18, vol: 0.04, d: 0.18, lp: 4000, cat: "fx" });
      tone(0.12, { type: "sine", f0: 900, f1: 450, glide: 0.2, vol: 0.16, d: 0.2, cat: "fx", send: 0.2 });
      return true;
    case "magnet": // Ball klebt am Schuh
      tone(0, { type: "sine", f0: 300 * sp, f1: 480, glide: 0.2, vol: 0.14, d: 0.25, cat: "fx", pan });
      fm(0, { f: 640 * sp, ratio: 1.48, index: 2, idxD: 0.03, vol: 0.1, d: 0.1, cat: "fx", pan });
      return true;
    case "puFloat": // Schwerelos: zwei Sinustöne schweben nach oben
      tone(0, { type: "sine", f0: 330, f1: 495, glide: 1.1, vol: 0.09, a: 0.05, d: 1.1, cat: "fx", send: 0.3 });
      tone(0.1, { type: "sine", f0: 495, f1: 742, glide: 1.1, vol: 0.06, a: 0.05, d: 1.1, cat: "fx", send: 0.3 });
      return true;
    case "puWind": hiss(0, { type: "bandpass", f0: 500, f1: 1400, q: 0.8, vol: 0.18, a: 0.25, h: 0.35, d: 0.9, flutter: 6, cat: "fx" }); return true;
    case "puTime": tone(0, { type: "sine", f0: 110, f1: 66, glide: 0.8, vol: 0.22, a: 0.02, d: 0.8, cat: "fx", send: 0.3 }); return true;   // Zeitblase: tiefer Ton fällt

    // ----- Spielablauf -----
    case "count": bell(0, C.C5, 0.13, { d: 0.35 }); return true;
    case "go": [C.C6, C.E6, C.G6].forEach(m => bell(0, m, 0.1, { d: 0.6 })); return true;
    case "whistle": [[0, 0.13], [0.2, 0.13], [0.42, 0.6]].forEach(([t, d]) => whistle(t, d)); return true;
    case "whistle1": whistle(0, 0.38); return true;
    case "goal": // Netz rauscht, kurzer heller Akkord. Den Rest trägt der Jubel (roar). Keine Hupe: die wäre auf Dauer lästig
      hiss(0, { type: "highpass", f0: 3200, f1: 1400, q: 0.7, vol: 0.2, a: 0.004, d: 0.32, cat: "big", send: 0.25 });
      [C.C5, C.E5, C.G5].forEach((m, i) => mallet(0.03 + i * 0.055, m, 0.12, { d: 0.45 }));
      bell(0.2, C.C6, 0.08, { d: 0.9 }); sparkle(0.22, 3, 0.03);
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

// Akkorde der Familien wie im Schauraum (Chaos klingt schräg, Gold mit Glitzern)
const PU_CHORD = { atk: [C.G4, C.C5, C.G5, C.C6], def: [C.C5, C.E5, C.B4 + 12, C.E6], mov: [C.A4, C.D5, C.D5 + 4, C.B4 + 12], chaos: [C.D4 + 1, C.A4 + 1, C.D5 + 1, C.A5 + 1], gold: [C.C5, C.G5, C.C6, C.G6] };
function puPick(fam) {
  const ch = PU_CHORD[fam] || PU_CHORD.atk;
  hiss(0, { type: "highpass", f0: 2500, vol: 0.12, d: 0.1, cat: "fx" });
  ch.forEach((m, i) => (fam === "chaos"
    ? tone(0.03 + i * 0.055, { type: "square", f0: mtof(m), vol: 0.035, d: 0.26, lp: 2600, cat: "fx", send: 0.1 })
    : mallet(0.03 + i * 0.055, m, 0.13, { cat: "fx", d: 0.3 })));
  if (fam === "gold") sparkle(0.22, 4, 0.05);
  hiss(0.06, { type: "bandpass", f0: 900, f1: 3000, q: 0.8, vol: 0.1, a: 0.03, d: 0.22, cat: "fx" });   // Symbol fliegt
  tone(0.38, { type: "sine", f0: 160, f1: 80, glide: 0.1, vol: 0.2, d: 0.12, cat: "fx" });             // und landet
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

// ---------- Musik-Instrumente (für den Sequenzer in webaudio.js, schreiben auf bus.music, Hall auf bus.musVerb) ----------
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
    f.connect(g); g.connect(bus.music); const s = ac.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(bus.musVerb);
    [-9, 9].forEach(det => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + d + 0.05); });
  },
  lead(t, m, d, vol) {
    const g = ac.createGain(), car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), f = mtof(m);
    car.frequency.value = f; mod.frequency.value = f * 2; mg.gain.setValueAtTime(f * 1.5, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + d * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(bus.music); const s = ac.createGain(); s.gain.value = 0.35; g.connect(s); s.connect(bus.musVerb);
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
      const s = ac.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(bus.musVerb);
    } else { f.type = "highpass"; f.frequency.value = 7500; g.gain.setValueAtTime(0.14 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === "o" ? 0.18 : 0.035)); }
    n.connect(f); f.connect(g); n.start(t, Math.random()); n.stop(t + 0.25);
  },

  // ----- leise Instrumente für die ruhigen Menü-Stücke: weiche Einsätze (kein Knacken), wenig über 6 kHz, 1-2 Oszillatoren je Ton -----
  /** Warme Fläche: Dreieck + Sinus leicht verstimmt, Tiefpass atmet langsam. a/r = Ein-/Ausblenden in s */
  warm(t, m, d, vol, { a = 1, r = 1, lp = 900, send = 0.5, pan = 0, air = 0 } = {}) {
    vol *= mlev;
    const g = musOut(send, pan), f = ac.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.4;
    f.frequency.setValueAtTime(lp * 0.7, t); f.frequency.linearRampToValueAtTime(lp, t + d * 0.5); f.frequency.linearRampToValueAtTime(lp * 0.7, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + d - r); g.gain.linearRampToValueAtTime(0, t + d);
    f.connect(g);
    [["triangle", -6, 1], ["sine", 6, 1], ...(air ? [["sine", 3, 2]] : [])].forEach(([type, det, mul], i) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = mtof(m) * mul; o.detune.value = det;
      if (i === 2) { const og = ac.createGain(); og.gain.value = air; o.connect(og); og.connect(f); } else o.connect(f);
      o.start(t); o.stop(t + d + 0.05);
    });
  },
  /** E-Piano (FM 1:1, Modulation klingt schnell ab): weicher Anschlag, Ausklang auf 35 %, dann loslassen */
  epiano(t, m, d, vol, { send = 0.3, pan = 0 } = {}) {
    vol *= mlev;
    // FM 1:1 erzeugt auch 0 Hz (Gleichanteil): Hochpass davor
    const g = musOut(send, pan), f = mtof(m), car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 60; hp.Q.value = 0.6; hp.connect(g);
    car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.06, t + 0.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.setTargetAtTime(vol * 0.4, t + 0.01, 0.5); g.gain.setTargetAtTime(0, t + d, 0.15);
    mod.connect(mg); mg.connect(car.frequency); car.connect(hp); car.start(t); mod.start(t); car.stop(t + d + 1); mod.stop(t + d + 1);
  },
  /** Gezupft: Dreieck, Tiefpass fällt von 2,2 kHz, viel Hall */
  pluck(t, m, d, vol, { send = 0.5, pan = 0 } = {}) {
    vol *= mlev;
    const g = musOut(send, pan), f = ac.createBiquadFilter(), o = ac.createOscillator();
    f.type = "lowpass"; f.Q.value = 0.6; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(350, t + d);
    o.type = "triangle"; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f); f.connect(g); o.start(t); o.stop(t + d + 0.05);
  },
  /** Runder Bass: Sinus + leise Oktave (damit er auch aus Handy-Lautsprechern hörbar bleibt) */
  sub(t, m, d, vol) {
    vol *= mlev;
    const g = musOut(0), o = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain();
    o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 2; g2.gain.value = 0.3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + Math.max(0.03, d - 0.08)); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); o2.connect(g2); g2.connect(g); o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
  },
  /** Leises Schlagzeug: k = weiche Bassdrum, s = gedämpfte Snare, b = Besen (kurz), w = Besen-Wischer (lang) */
  soft(t, kind, vel = 1) {
    vel *= mlev;
    if (kind === "k") {
      // Hochpass gegen Gleichanteil (ein abklingender Sinus ist nicht symmetrisch)
      const g = musOut(0), o = ac.createOscillator(), hp = ac.createBiquadFilter(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
      hp.type = "highpass"; hp.frequency.value = 38; hp.Q.value = 0.6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(hp); hp.connect(g); o.start(t); o.stop(t + 0.32);
      return;
    }
    const snare = kind === "s", len = snare ? 0.12 : kind === "w" ? 0.22 : 0.07;
    const g = musOut(snare ? 0.2 : 0.1), n = ac.createBufferSource(), bp = ac.createBiquadFilter(), lp = ac.createBiquadFilter();
    n.buffer = noiseBuf; bp.type = "bandpass"; bp.frequency.value = snare ? 1400 : 3200; bp.Q.value = snare ? 0.9 : 0.6; lp.type = "lowpass"; lp.frequency.value = snare ? 4000 : 5500;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((snare ? 0.12 : 0.05) * vel, t + (kind === "w" ? 0.05 : 0.004)); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(bp); bp.connect(lp); lp.connect(g); n.start(t, hash(t * 1000, 1) * 1.5); n.stop(t + len + 0.02);
    if (snare) {
      const o = ac.createOscillator(), og = musOut(0); o.type = "triangle"; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.09 * vel, t + 0.003); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09); o.connect(og); o.start(t); o.stop(t + 0.1);
    }
  },
  /** Rausch-Fläche (fernes Publikum, Plattenrauschen): Band f/q, langsam ein- und ausblenden, optional Gemurmel (Pegel schwankt) */
  air(t, d, vol, { f = 600, q = 0.7, lp = 0, a = d * 0.4, send = 0.5, murmur = 0, seed = 0 } = {}) {
    vol *= mlev;
    const g = musOut(send), n = ac.createBufferSource(), bp = ac.createBiquadFilter(); let last = bp;
    n.buffer = noiseBuf; n.loop = true; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q; n.connect(bp);
    if (lp) { const l = ac.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = lp; bp.connect(l); last = l; }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + d - a); g.gain.linearRampToValueAtTime(0, t + d);
    if (murmur) {
      const am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(); am.gain.value = 1 - murmur; lfo.frequency.value = 0.2 + hash(seed, 2) * 0.3; lg.gain.value = murmur;
      lfo.connect(lg); lg.connect(am.gain); last.connect(am); am.connect(g); lfo.start(t); lfo.stop(t + d + 0.05);
    } else last.connect(g);
    n.start(t, hash(seed, 3) * 1.5); n.stop(t + d + 0.05);
  },
  /** Staub auf der Platte: winziges, dumpfes Knistern */
  dust(t, vol) {
    vol *= mlev;
    const g = musOut(0), n = ac.createBufferSource(), lp = ac.createBiquadFilter(); n.buffer = noiseBuf; lp.type = "lowpass"; lp.frequency.value = 3000;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.006);
    n.connect(lp); lp.connect(g); n.start(t, hash(t * 1000, 4) * 1.5); n.stop(t + 0.01);
  },
};
/** Pegel des laufenden Stücks (setzt quiet() vor jedem Schritt), gilt für die leisen Instrumente */
let mlev = 1;
/** Ausgang der leisen Instrumente: Pegel -> (Panorama) -> Musik-Bus, Hall-Anteil auf den Musik-Hall (folgt dem Musik-Schalter) */
function musOut(send, pan = 0) {
  const g = ac.createGain(); let out = g;
  if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  out.connect(bus.music);
  if (send > 0) { const s = ac.createGain(); s.gain.value = send; out.connect(s); s.connect(bus.musVerb); }
  return g;
}
/** Fester Zufall (0..1) aus Schritt und Sorte: jeder Durchlauf der Schleife klingt gleich, also nahtlos */
function hash(i, k = 0) {
  let x = (Math.floor(i) * 374761393 + k * 668265263 + 1013904223) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ---------- Menü-Musik: Stücke für den Sequenzer in webaudio.js ----------
// Jedes Stück: bpm, steps (Länge der Schleife in 16teln), step(i, t, s16, mode) plant Schritt i (0..steps-1) zur Zeit t.
// Welches im Spiel läuft, steht in webaudio.js (MENU_TRACK); "klassik" ist das treibende, die anderen sind ruhig.
const ch = (r, ...v) => ({ r, v });
/** Ruhiges Stück mit eigenem Gesamtpegel in dB (abgeglichen mit tools/sound-lab bzw. Offline-Messung) */
const quiet = (db, def) => ({ ...def, step(i, t, s16, mode) { mlev = Math.pow(10, db / 20); def.step(i, t, s16, mode); } });

// klassik: c-Moll, 112 BPM, 4 Takte (8,6 s), Four-on-the-floor, Sägezahn-Bass in 16teln, Lead-Melodie im Menü
const K_BASS = [36, 36, 48, 36, 39, 39, 51, 39, 41, 41, 53, 41, 43, 43, 55, 46];
const K_CHORDS = [[60, 63, 67], [63, 67, 70], [65, 68, 72], [67, 70, 74]];
const K_LEAD = [72, -1, 75, 72, 79, -1, 77, 75, 72, -1, 70, 72, 75, -1, -1, -1, 77, -1, 75, 77, 79, -1, 82, 79, 77, -1, 75, 72, 70, -1, 72, -1];
const klassik = {
  bpm: 112, steps: 64,
  step(i, t, S16, mode) {
    const s = i % 16, bar = Math.floor(i / 16), swing = s % 2 ? S16 * 0.08 : 0, tt = t + swing;
    if (s % 4 === 0) inst.drum(t, "k");
    if (s === 4 || s === 12) inst.drum(t, "s");
    if (s % 2 === 0) inst.drum(tt, s === 14 ? "o" : "h", s % 4 === 0 ? 1 : 0.6);
    else if (Math.random() < 0.25) inst.drum(tt, "h", 0.35);
    inst.bass(t, K_BASS[s] + (bar === 3 ? -2 : 0), S16 * 0.85, 0.2);
    if (s === 0) K_CHORDS[bar].forEach(m => inst.pad(t, m, S16 * 15, 0.045));
    if (mode === "menu") { const l = K_LEAD[(bar % 2) * 16 + s]; if (l > 0) inst.lead(tt, l, S16 * 1.8, 0.07); }
  },
};

// A lounge: c-Moll, 78 BPM, 32 Takte (98 s) in vier Teilen A B A' C, Akkord je 2 Takte. Warme Fläche, runder Bass,
// Besen im Swing (ab Takt 3), nur vereinzelte E-Piano-Töne. Höchstens 28 Quellen gleichzeitig (beim Akkordwechsel).
const L_PROG = [
  [ch(36, 51, 55, 58, 62), ch(44, 55, 58, 60, 63), ch(41, 51, 55, 56, 60), ch(43, 50, 53, 55, 60)],   // Cm9  Abmaj9  Fm9  G7sus
  [ch(39, 53, 55, 58, 62), ch(38, 53, 56, 60, 62), ch(36, 51, 55, 58, 62), ch(43, 50, 53, 59, 63)],   // Ebmaj9  Dm7b5  Cm9  G7b13
  [ch(36, 51, 55, 58, 62), ch(44, 55, 58, 60, 63), ch(41, 51, 55, 56, 60), ch(46, 53, 57, 58, 62)],   // Cm9  Abmaj9  Fm9  Bb6
  [ch(44, 55, 58, 60, 63), ch(43, 53, 55, 58, 62), ch(41, 51, 55, 56, 60), ch(43, 50, 53, 59, 63)],   // Abmaj9  Eb/G  Fm9  G7b13
];
const L_NOTES = [63, 65, 67, 70, 72, 75];   // c-Moll-Pentatonik, nur einzelne Töne, keine Melodie
const lounge = quiet(-1, {
  bpm: 78, steps: 32 * 16,
  step(i, t, S16) {
    const s = i % 16, bar = Math.floor(i / 16), sec = bar >> 3, c = L_PROG[sec][(bar >> 1) & 3], first = bar % 2 === 0;
    const sw = s % 4 === 2 ? S16 * 0.33 : 0, bar2 = S16 * 32;
    if (s === 0 && first) c.v.forEach((m, k) => inst.warm(t, m, bar2 + 0.9, 0.028, { a: 0.9, r: 1.1, lp: 850, pan: (k - 1.5) * 0.25 }));
    if (s === 0) inst.sub(t, c.r, S16 * (first ? 9 : 6), 0.07);
    if (s === 10 && hash(i, 1) < 0.6) inst.sub(t + sw, c.r + (hash(i, 2) < 0.4 ? 7 : 0), S16 * 3, 0.05);
    const drums = !(bar < 2 || (bar >= 24 && bar < 26));
    if (drums && s % 2 === 0) inst.soft(t + sw, "b", (s % 4 === 0 ? 0.55 : 0.85) * (0.8 + hash(i, 3) * 0.4));
    if (drums && sec % 2 === 1 && (s === 4 || s === 12)) inst.soft(t, "w", 0.6);
    if (drums && sec > 0 && s === 0) inst.soft(t, "k", 0.2);
    if (sec % 2 === 1 && s === 0 && first) c.v.forEach((m, k) => inst.epiano(t + k * 0.015, m + 12, S16 * 6, 0.016, { pan: (k - 1.5) * 0.3 }));
    if ((s === 6 || s === 14) && hash(i, 7) < 0.09) inst.epiano(t + sw, L_NOTES[Math.floor(hash(i, 8) * L_NOTES.length)], S16 * 4, 0.03, { send: 0.45, pan: hash(i, 9) * 0.6 - 0.3 });
  },
});

// B stadion: a-Moll/C-Dur, 66 BPM, 24 Takte (87 s) in drei Teilen, Akkord je 2 Takte. Luftige Fläche mit Oberton,
// fernes Publikum als Rauschen, das alle 4 Takte langsam an- und abschwillt, ab und zu ein gezupftes Arpeggio,
// im Mittelteil ein leiser Puls. Kein Schlagzeug sonst. Höchstens ~35 Quellen gleichzeitig (lange Überblendungen), im Schnitt 9 neue Knoten/s.
const S_PROG = [
  ch(41, 52, 55, 57, 60), ch(40, 50, 55, 60, 64), ch(45, 55, 59, 60, 64), ch(43, 50, 52, 55, 57),   // Fmaj9  C/E  Am9  G6sus2
  ch(41, 52, 55, 57, 60), ch(45, 55, 59, 60, 64), ch(38, 53, 57, 60, 64), ch(40, 50, 55, 59, 64),   // Fmaj9  Am9  Dm9  Em7
  ch(46, 53, 57, 62, 64), ch(41, 52, 55, 57, 60), ch(45, 55, 59, 60, 64), ch(43, 50, 52, 55, 57),   // Bbmaj7#11  Fmaj9  Am9  G6sus2
];
const stadion = quiet(-0.5, {
  bpm: 66, steps: 24 * 16,
  step(i, t, S16) {
    const s = i % 16, bar = Math.floor(i / 16), c = S_PROG[bar >> 1], first = bar % 2 === 0, bar2 = S16 * 32;
    if (s === 0 && first) {
      c.v.forEach((m, k) => inst.warm(t, m, bar2 + 2, 0.026, { a: 1.6, r: 2, lp: 1300, send: 0.75, pan: (k - 1.5) * 0.4, air: k >= 2 ? 0.35 : 0 }));
      inst.sub(t, c.r, bar2 + 0.5, 0.045);
    }
    if (s === 0 && bar % 4 === 0) {
      const d = S16 * 64 + 2.5, v = 0.06 + hash(bar, 5) * 0.04;
      inst.air(t, d, v, { f: 520, q: 0.8, a: d * 0.45, send: 0.8, murmur: 0.35, seed: bar });
      inst.air(t, d, v * 0.55, { f: 1150, q: 1.1, lp: 2500, a: d * 0.5, send: 0.8, murmur: 0.4, seed: bar + 100 });
    }
    if (bar % 2 === 1 && s >= 8 && s % 2 === 0 && hash(bar, 6) < 0.75) {
      const n = (s - 8) / 2; if (n < 4 && !(n === 3 && hash(bar, 7) < 0.5)) inst.pluck(t, c.v[n] + 12, 1.1, 0.04, { send: 0.7, pan: n * 0.2 - 0.3 });
    }
    if (bar >= 8 && bar < 16 && (s === 0 || s === 8)) inst.soft(t, "k", s === 0 ? 0.18 : 0.1);
  },
});

// C lofi: C-Dur/d-Moll, 80 BPM, 32 Takte (96 s) in vier Teilen A B A' B', Akkord je Takt. E-Piano-Akkorde mit Swing,
// weiche Bassdrum, gedämpfte Snare, Besen-Hihat, leises Plattenrauschen. B' beginnt mit 2 Takten ohne Schlagzeug.
// Höchstens 22 Quellen gleichzeitig.
const F_A = [ch(38, 53, 57, 60, 64), ch(43, 53, 57, 59, 64), ch(36, 52, 55, 59, 62), ch(45, 55, 59, 60, 64)];   // Dm9  G13  Cmaj9  Am9
const F_A2 = [ch(38, 53, 57, 60, 64), ch(43, 53, 57, 59, 64), ch(40, 50, 55, 59, 62), ch(45, 55, 61, 65, 67)];  // Dm9  G13  Em7  A7b13
const F_B = [ch(41, 52, 55, 57, 60), ch(40, 50, 55, 59, 62), ch(38, 53, 57, 60, 64), ch(36, 52, 55, 59, 62)];   // Fmaj9  Em7  Dm9  Cmaj9
const F_B2 = [ch(41, 52, 55, 57, 60), ch(40, 50, 53, 56, 59), ch(45, 55, 59, 60, 64), ch(43, 53, 57, 60, 64)];  // Fmaj9  E7b9  Am9  G13sus
const F_SEC = [[...F_A, ...F_A2], [...F_B, ...F_B2], [...F_A, ...F_A2], [...F_B, ...F_B2]];
const lofi = quiet(0, {
  bpm: 80, steps: 32 * 16,
  step(i, t, S16) {
    const s = i % 16, bar = Math.floor(i / 16), sec = bar >> 3, c = F_SEC[sec][bar & 7], sw = s % 2 ? S16 * 0.22 : 0, tt = t + sw;
    const strum = (at, d, vol) => c.v.forEach((m, k) => inst.epiano(at + k * 0.012, m, d, vol * (k === 3 ? 0.8 : 1), { pan: (k - 1.5) * 0.25 }));
    const again = hash(bar, 2) < 0.7;
    if (s === 0) strum(t, S16 * (again ? 10 : 15), 0.05);
    if (s === 10 && again) strum(t, S16 * 5.5, 0.034);
    if (s === 0) inst.sub(t, c.r, S16 * 6, 0.075);
    if (s === 7 && hash(bar, 3) < 0.5) inst.sub(tt, c.r + 12, S16 * 2, 0.04);
    if (s === 10) inst.sub(t, c.r + (hash(bar, 4) < 0.5 ? 7 : 0), S16 * 4, 0.06);
    const drums = !(sec === 3 && bar < 26) && bar !== 31;
    if (drums) {
      if (s === 0 || s === 10 || (s === 7 && hash(bar, 5) < 0.4)) inst.soft(tt, "k", s === 0 ? 0.3 : 0.22);
      if (s === 4 || s === 12) inst.soft(t + S16 * 0.1, "s", 0.55);
      if (s % 2 === 0) inst.soft(tt, "b", s % 4 === 0 ? 0.5 : 0.8);
      else if (hash(i, 6) < 0.15) inst.soft(tt, "b", 0.35);
    }
    if (s === 0 && bar % 4 === 0) inst.air(t, S16 * 64 + 0.6, 0.012, { f: 1800, q: 0.5, lp: 4000, a: 0.3, send: 0, seed: bar });
    if (hash(i, 9) < 0.06) inst.dust(t + hash(i, 10) * S16, 0.03 + hash(i, 11) * 0.04);
  },
});

export const MENU_TRACKS = { klassik, lounge, stadion, lofi };
