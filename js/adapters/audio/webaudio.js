// Ton: Mischpult, echte Dateien, Publikum und Menü-Musik. Die Sounds selbst stehen in synth.js (live erzeugt).
// Liegen echte Dateien in audio/sfx (Liste: audio/sfx/manifest.json, node tools/sound-manifest.mjs), spielt das Spiel
// stattdessen diese. Namen wie in docs/SOUNDS.md.
//
// Mischpult: Kategorie-Busse (ui, body, fx, big) mit Pegeln nach der Lautstärke-Leiter in docs/SOUNDS.md, ein kurzer
// Stadion-Hall als Send, leichte Sättigung, Bus-Kompressor und Limiter vor dem Ausgang. Große Momente ducken die Musik.
import { initSynth, inst, play } from "./synth.js";

let ac = null, master, mix, verbIn, musBus, crowdGain, noiseBuf, crowdNodes = [], musSrc = null;
const buses = {};
let sfxOn = true, musOn = true, musicPlaying = false, musTimer = null, nextNote = 0, stepIdx = 0, musicMode = "menu";
const MUS_LEVEL = 0.3;
// Pegel je Kategorie (Lautstärke-Leiter: Menü leise, Ball mittel, Effekte laut, Tor/Sieg am lautesten)
const CAT = { ui: 0.5, body: 0.85, fx: 1, big: 1.15 };
// Diese Sounds ducken die Musik kurz
const DUCK = new Set(["goal", "super", "win", "lose", "levelup", "chest-legend", "chest-head", "chest-open"]);

// Seite im Hintergrund (anderer Tab, App gewechselt, Handy gesperrt): Ton komplett anhalten, sonst laufen z. B.
// Website und installierte App gleichzeitig. Zurück im Vordergrund geht es weiter.
let hiddenStop = false;
function onVisibility() {
  if (!ac) return;
  if (document.hidden) { if (ac.state === "running") { hiddenStop = true; ac.suspend().catch(() => {}); } }
  else if (hiddenStop) { hiddenStop = false; ac.resume().catch(() => {}); }
}
if (globalThis.document) { document.addEventListener("visibilitychange", onVisibility); addEventListener("pagehide", () => { if (ac && ac.state === "running") { hiddenStop = true; ac.suspend().catch(() => {}); } }); addEventListener("pageshow", onVisibility); }

export function unlock() {
  if (ac) { if (ac.state === "suspended" && !document.hidden) ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
  // Ausgang: Limiter -> Lautstärke
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  const limit = ac.createDynamicsCompressor(); limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.12; limit.connect(master);
  const glue = ac.createDynamicsCompressor(); glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = 0.006; glue.release.value = 0.18; glue.connect(limit);
  // leichte Sättigung (macht dünne Töne voller), danach sanfte Klangregelung
  const drive = ac.createWaveShaper(); drive.curve = softClip(1.6); drive.oversample = "2x";
  const low = ac.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 140; low.gain.value = 2.5;
  const high = ac.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 7000; high.gain.value = -2;
  mix = ac.createGain(); mix.gain.value = sfxOn ? 1 : 0;
  mix.connect(drive); drive.connect(low); low.connect(high); high.connect(glue);
  for (const [k, v] of Object.entries(CAT)) { buses[k] = ac.createGain(); buses[k].gain.value = v; buses[k].connect(mix); }
  // Hall: kurzer, heller Stadion-Raum (erzeugte Impulsantwort)
  const verb = ac.createConvolver(); verb.buffer = impulse(1.1, 2.6);
  const verbOut = ac.createGain(); verbOut.gain.value = 0.32; verbIn = ac.createGain();
  const verbHp = ac.createBiquadFilter(); verbHp.type = "highpass"; verbHp.frequency.value = 250;
  verbIn.connect(verbHp); verbHp.connect(verb); verb.connect(verbOut); verbOut.connect(glue);
  musBus = ac.createGain(); musBus.gain.value = musOn ? MUS_LEVEL : 0; musBus.connect(glue);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  initSynth(ac, { ...buses, verb: verbIn, music: musBus }, noiseBuf);
  crowdGain = ac.createGain(); crowdGain.gain.value = 0; crowdGain.connect(buses.fx);
  startCrowd();
  if (musicPlaying) startLoop();
  loadFiles();
}

function softClip(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } return c; }
/** Stereo-Impulsantwort: Rauschen, das exponentiell abklingt, hohe Anteile schneller */
function impulse(sec, decay) {
  const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < len; i++) { const t = i / len; lp += (Math.random() * 2 - 1 - lp) * (0.9 - t * 0.6); d[i] = lp * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1); }
  }
  return b;
}

// ---------- Publikum: drei Rausch-Bänder, deren Lautstärke langsam und unregelmäßig schwankt (Gemurmel) ----------
function startCrowd() {
  crowdNodes = [[320, 0.7, 0.23], [780, 0.6, 0.37], [1900, 0.8, 0.53]].map(([f, q, rate]) => {
    const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    n.buffer = noiseBuf; n.loop = true; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
    g.gain.value = f > 1000 ? 0.35 : 0.7; lfo.frequency.value = rate; lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(g.gain); n.connect(bp); bp.connect(g); g.connect(crowdGain);
    n.start(0, Math.random()); lfo.start();
    return n;
  });
}
function roar(sec) {
  if (!crowdGain) return; const t = ac.currentTime;
  crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setTargetAtTime(0.55, t, 0.05); crowdGain.gain.setTargetAtTime(0.07, t + sec, 0.7);
}
export function crowd(level) { if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0.03 + level * 0.12, ac.currentTime, 0.4); }
export function crowdOff() { if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0, ac.currentTime, 0.3); }

// ---------- Echte Sound-Dateien ----------
// manifest.json: { "kick": ["kick_1", "kick_2"], "goal": ["goal"] }. Je Name eine oder mehrere Varianten; das Spiel nimmt
// .ogg oder (Safari ohne Ogg) .m4a. Fehlt eine Datei oder lässt sie sich nicht lesen, bleibt der erzeugte Sound.
const files = {};
const decode = b => new Promise(res => { ac.decodeAudioData(b, res, () => res(null)); });
async function loadFiles() {
  try {
    const m = await (await fetch("audio/sfx/manifest.json")).json();
    const a = document.createElement("audio"), ext = a.canPlayType('audio/ogg; codecs="opus"') || a.canPlayType('audio/ogg; codecs="vorbis"') ? ".ogg" : ".m4a";
    // Namen mit _altN sind Kandidaten zur Auswahl im Sound-Lab, das Spiel lädt sie nicht
    await Promise.all(Object.entries(m).filter(([name]) => !/_alt\d+$/.test(name)).map(async ([name, list]) => {
      const bufs = await Promise.all(list.map(f => fetch(`audio/sfx/${f}${ext}`).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => b && decode(b)).catch(() => null)));
      if (bufs.some(Boolean)) files[name] = bufs.filter(Boolean);
    }));
    if (files.crowd && crowdNodes.length) { crowdNodes.forEach(n => n.stop()); crowdNodes = []; playFile("crowd", 1, true, crowdGain); }
    if (files["music-menu"] && musicPlaying) { clearInterval(musTimer); musTimer = null; startLoop(); }
  } catch (_) { /* keine Liste: alles bleibt erzeugt */ }
}
// Kategorie einer Datei für den Pegel (wie die erzeugten Sounds)
const fileCat = name => (/^(click|coin|tick|count|chest-item|shards)$/.test(name) ? "ui" : /^(goal|win|lose|levelup|chest-|super$|gfx-)/.test(name) ? "big" : /^(kick|hammer|chip|head|bounce|wallhit|bumper|swing|jump|land|slide|pound|stomp|squash|bump|pop)$/.test(name) ? "body" : "fx");
/** Spielt eine Datei (zufällige Variante, Tonhöhe leicht gestreut, v = Stärke wie beim erzeugten Sound) */
function playFile(name, v = 1, loop = false, dest = null, at = 0) {
  const list = files[name]; if (!list) return null;
  const src = ac.createBufferSource(), g = ac.createGain(), k = Math.min(1.5, Math.max(0.2, v ?? 1));
  src.buffer = list[Math.floor(Math.random() * list.length)]; src.loop = loop;
  if (!loop) src.playbackRate.value = 0.96 + Math.random() * 0.08 + (k - 1) * 0.06;
  g.gain.value = loop ? 1 : Math.min(1.4, 0.55 + 0.45 * k);
  src.connect(g); g.connect(dest || buses[fileCat(name)]);
  if (!loop && dest === null) { const s = ac.createGain(); s.gain.value = 0.12; g.connect(s); s.connect(verbIn); }
  src.start(ac.currentTime + at);
  return src;
}

/** Nur für das Sound-Lab (tools/sound-lab): Dateien aus audio/sfx ein- oder ausschalten, um erzeugt und aufgenommen zu vergleichen */
let filesOn = true;
export function useFiles(on) { filesOn = on; }
export function setSfx(on) { sfxOn = on; if (mix) mix.gain.value = on ? 1 : 0; }
export function setMusic(on) { musOn = on; if (musBus) musBus.gain.setTargetAtTime(on ? MUS_LEVEL : 0, ac.currentTime, 0.1); }
function duck(sec) {
  if (!musOn || !musBus) return; const t = ac.currentTime;
  musBus.gain.cancelScheduledValues(t); musBus.gain.setTargetAtTime(MUS_LEVEL * 0.35, t, 0.03); musBus.gain.setTargetAtTime(MUS_LEVEL, t + sec, 0.4);
}

export function sfx(kind, v = 1) {
  if (!ac || document.hidden) return;   // im Hintergrund nichts einreihen, sonst kommt beim Zurückkehren alles auf einmal
  if (DUCK.has(kind)) duck(kind === "goal" || kind === "chest-head" ? 1.6 : 0.9);
  if (kind === "goal") { roar(1.2); if (filesOn && files.roar) playFile("roar", 1, false, null, 0.15); }
  // Abpfiff: kurz, kurz, lang (aus den Aufnahmen der Einzelpfiffe zusammengesetzt)
  if (kind === "whistle" && filesOn && files.whistle1 && files.whistle) { playFile("whistle1"); playFile("whistle1", 1, false, null, 0.45); playFile("whistle", 1, false, null, 0.9); return; }
  if (filesOn && files[kind]) { playFile(kind, v); return; }
  if (play(kind, v)) return;
  legacy(kind);
}

// ---------- Torexplosionen (goalfx.js): eigene Sounds, unverändert übernommen, laufen jetzt durch das Mischpult ----------
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function osc(type, f0, f1, dur, vol, t = 0) {
  const s = ac.currentTime + t, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, s); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), s + dur);
  env(g, s, 0.005, vol, dur); o.connect(g); g.connect(buses.big); o.start(s); o.stop(s + dur + 0.05);
}
function noise(dur, vol, type, freq, q, t, f1) {
  q ??= 1; t ??= 0;
  const s = ac.currentTime + t, n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, s); if (f1) f.frequency.exponentialRampToValueAtTime(f1, s + dur); f.Q.value = q;
  env(g, s, 0.004, vol, dur); n.connect(f); f.connect(g); g.connect(buses.big); n.start(s, Math.random()); n.stop(s + dur + 0.05);
}
function legacy(kind) {
  switch (kind) {
    case "gfx-67": [0, 0.22, 0.44, 0.66, 0.88].forEach((t, i) => { const f = i % 2 ? 659 : 523; osc("square", f, f, 0.12, 0.09, t); osc("sine", f / 2, f / 4, 0.12, 0.2, t); }); break;
    case "gfx-crash": noise(0.6, 0.55, "highpass", 3500, 0.7, 0, 9000); osc("sine", 110, 35, 0.4, 0.7); [0.02, 0.06, 0.11, 0.17, 0.24].forEach(t => osc("triangle", 2400 + Math.random() * 2600, 1800, 0.12, 0.08, t)); noise(1.2, 0.2, "highpass", 2500, 0.5, 0.3); break;
    case "gfx-peak": osc("sine", 50, 120, 0.7, 0.6); noise(0.7, 0.4, "lowpass", 300, 1, 0, 900); [392, 494, 587].forEach(f => osc("sawtooth", f, f, 0.8, 0.07, 0.5)); osc("sawtooth", 784, 784, 0.6, 0.05, 0.7); break;
    case "gfx-brainrot": [0, 0.35, 0.6, 0.9, 1.15, 1.4].forEach((t, i) => osc("sine", 180 + i * 40, 700 + i * 90, 0.18, 0.22, t)); osc("sine", 1800, 300, 0.9, 0.1, 0.1); break;
    case "gfx-dank": [[0, 0.12], [0.18, 0.12], [0.36, 0.5]].forEach(([t, d]) => [440, 554, 659, 446].forEach(f => osc("sawtooth", f, f * 0.97, d, 0.07, t))); [0.05, 0.16, 0.27, 0.38, 0.49].forEach(t => osc("square", 1900, 1900, 0.02, 0.06, t)); break;
    case "gfx-ko": noise(0.12, 0.5, "lowpass", 1200, 1, 0.12, 200); osc("sine", 95, 38, 0.3, 0.8, 0.12); osc("triangle", 1250, 1250, 0.5, 0.12, 0.45); osc("triangle", 1250, 1250, 0.6, 0.12, 0.7); break;
    case "gfx-aura": [523, 659, 784, 988, 1175, 1319, 1568].forEach((f, i) => osc("sine", f, f, 0.3, 0.07, i * 0.07)); [262, 330, 392].forEach(f => osc("triangle", f, f, 1.6, 0.06, 0.2)); noise(1.4, 0.12, "highpass", 6000, 0.5, 0.1); break;
    case "gfx-glitch": for (let i = 0; i < 14; i++) { const t = i * 0.06 + Math.random() * 0.03, f = 100 + Math.random() * 1600; osc("square", f, f * (Math.random() < 0.5 ? 0.5 : 2), 0.05, 0.07, t); } noise(0.2, 0.3, "bandpass", 1200, 4, 0.1); noise(0.15, 0.3, "highpass", 4000, 1, 0.5); break;
    default:
      // Meisterschafts-Torexplosion (gfx-m-<kopf>): Fanfare in C, je Kopf etwas anders gestimmt, bis echte Sounds kommen
      if (kind.startsWith("gfx-m-")) {
        const h = [...kind].reduce((x, ch) => x + ch.charCodeAt(0), 0) % 4, root = [523, 587, 659, 784][h];
        [1, 1.25, 1.5, 2].forEach((m, i) => { osc("triangle", root * m, root * m, 0.3, 0.09, i * 0.08); osc("square", root * m, root * m, 0.12, 0.04, i * 0.08); });
        noise(0.8, 0.18, "highpass", 3000, 0.6, 0, 8000); osc("sine", 110, 55, 0.4, 0.4);
      }
  }
}

// ---------- Musik: Sequenzer (c-Moll, 112 BPM), Instrumente aus synth.js ----------
const BPM = 112, S16 = 60 / BPM / 4;
const BASS = [36, 36, 48, 36, 39, 39, 51, 39, 41, 41, 53, 41, 43, 43, 55, 46];
const CHORDS = [[60, 63, 67], [63, 67, 70], [65, 68, 72], [67, 70, 74]];
const LEAD = [72, -1, 75, 72, 79, -1, 77, 75, 72, -1, 70, 72, 75, -1, -1, -1, 77, -1, 75, 77, 79, -1, 82, 79, 77, -1, 75, 72, 70, -1, 72, -1];
export function music(on, mode = "menu") {
  musicPlaying = on; musicMode = mode;
  if (!ac) return;
  if (on) startLoop(); else { clearInterval(musTimer); musTimer = null; if (musSrc) { musSrc.stop(); musSrc = null; } }
}
function startLoop() {
  if (files["music-menu"]) { if (!musSrc) musSrc = playFile("music-menu", 1, true, musBus); return; }
  if (musTimer) return;
  nextNote = ac.currentTime + 0.1; stepIdx = 0;
  musTimer = setInterval(sched, 25);
}
function sched() {
  while (nextNote < ac.currentTime + 0.12) { playStep(stepIdx, nextNote); nextNote += S16; stepIdx = (stepIdx + 1) % 64; }
}
function playStep(i, t) {
  const s = i % 16, bar = Math.floor(i / 16), swing = s % 2 ? S16 * 0.08 : 0, tt = t + swing;
  if (s % 4 === 0) inst.drum(t, "k");
  if (s === 4 || s === 12) inst.drum(t, "s");
  if (s % 2 === 0) inst.drum(tt, s === 14 ? "o" : "h", s % 4 === 0 ? 1 : 0.6);
  else if (Math.random() < 0.25) inst.drum(tt, "h", 0.35);
  inst.bass(t, BASS[s] + (bar === 3 ? -2 : 0), S16 * 0.85, 0.2);
  if (s === 0) CHORDS[bar].forEach(m => inst.pad(t, m, S16 * 15, 0.045));
  if (musicMode === "menu") { const l = LEAD[(bar % 2) * 16 + s]; if (l > 0) inst.lead(tt, l, S16 * 1.8, 0.07); }
}
