// Ton: Mischpult, echte Dateien, Publikum und Menü-Musik. Die Sounds selbst stehen in synth.js (live erzeugt).
// Liegen echte Dateien in audio/sfx (Liste: audio/sfx/manifest.json, node tools/sound-manifest.mjs), spielt das Spiel
// stattdessen diese. Namen wie die Rezepte in synth.js.
//
// Mischpult: Kategorie-Busse (ui, body, fx, big) mit Pegeln nach einer Lautstärke-Leiter, ein kurzer
// Stadion-Hall als Send, leichte Sättigung, Bus-Kompressor und Limiter vor dem Ausgang. Große Momente ducken die Musik.
import { initSynth, play, MENU_TRACKS } from "./synth.js";

let ac = null, master, mix, verbIn, sfxVerb, musVerb, musBus, crowdGain, noiseBuf, crowdNodes = [], musSrc = null;
let cheerBus, cheerTone, crowdDuck, stingBus, bowlSfx, sting = null, lastSting = -1;
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
  if (ac) { if (ac.state === "suspended" && !document.hidden) ac.resume().catch(() => {}); return; }
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
  // Hall-Anteile laufen an mix und musBus vorbei: eigene Schalter je Quelle, sonst bleibt bei "aus" der Hall hörbar
  sfxVerb = ac.createGain(); sfxVerb.gain.value = sfxOn ? 1 : 0; sfxVerb.connect(verbIn);
  musVerb = ac.createGain(); musVerb.gain.value = musOn ? 1 : 0; musVerb.connect(verbIn);
  musBus = ac.createGain(); musBus.gain.value = musOn ? MUS_LEVEL : 0; musBus.connect(glue);
  // Stadion-Hall für Jubel und Wiederholungs-Musik: größer und dunkler als der Raum-Hall, kurz verzögert, damit der Anschlag klar bleibt
  const bowl = ac.createConvolver(); bowl.buffer = impulse(2.4, 3.2);
  const bowlIn = ac.createDelay(0.1); bowlIn.delayTime.value = 0.03;
  const bowlHp = ac.createBiquadFilter(); bowlHp.type = "highpass"; bowlHp.frequency.value = 300;
  const bowlLp = ac.createBiquadFilter(); bowlLp.type = "lowpass"; bowlLp.frequency.value = 5500;
  const bowlOut = ac.createGain(); bowlOut.gain.value = 0.5;
  bowlIn.connect(bowlHp); bowlHp.connect(bowlLp); bowlLp.connect(bowl); bowl.connect(bowlOut); bowlOut.connect(glue);
  stingBus = ac.createGain(); stingBus.gain.value = musOn ? 1 : 0; stingBus.connect(glue);
  const stingSend = ac.createGain(); stingSend.gain.value = 0.28; stingBus.connect(stingSend); stingSend.connect(bowlIn);
  bowlSfx = ac.createGain(); bowlSfx.gain.value = sfxOn ? 0.22 : 0; bowlSfx.connect(bowlIn);
  cheerBus = ac.createGain(); cheerTone = ac.createBiquadFilter(); cheerTone.type = "lowpass"; cheerTone.frequency.value = 16000; cheerTone.Q.value = 0.5;
  cheerBus.connect(cheerTone); cheerTone.connect(buses.big); cheerTone.connect(bowlSfx);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  initSynth(ac, { ...buses, verb: sfxVerb, music: musBus, musVerb }, noiseBuf);
  crowdDuck = ac.createGain(); crowdDuck.connect(buses.fx);
  crowdGain = ac.createGain(); crowdGain.gain.value = 0; crowdGain.connect(crowdDuck);
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
function roar(sec, lvl = 0.55) {
  if (!crowdGain) return; const t = ac.currentTime;
  crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setTargetAtTime(lvl, t, 0.05); crowdGain.gain.setTargetAtTime(0.07, t + sec, 0.7);
}
export function crowd(level) { if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0.03 + level * 0.12, ac.currentTime, 0.4); }
export function crowdOff() { if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0, ac.currentTime, 0.3); }

// ---------- Echte Sound-Dateien ----------
// manifest.json: { "kick": ["kick_1", "kick_2"], "goal": ["goal"] }. Je Name eine oder mehrere Varianten; das Spiel nimmt
// .ogg oder (Safari ohne Ogg) .m4a. Fehlt eine Datei oder lässt sie sich nicht lesen, bleibt der erzeugte Sound.
const files = {};
const decode = b => new Promise(res => { ac.decodeAudioData(b, res, () => res(null)); });
const LAZY = new Set(["replay"]);   // erst beim ersten Spiel (prepareMatch), nicht beim Start
let manifest = null, lazyWanted = false, lazyDone = false;
const fileExt = () => { const a = document.createElement("audio"); return a.canPlayType('audio/ogg; codecs="opus"') || a.canPlayType('audio/ogg; codecs="vorbis"') ? ".ogg" : ".m4a"; };
async function loadSet(entries) {
  const ext = fileExt();
  await Promise.all(entries.map(async ([name, list]) => {
    const bufs = await Promise.all(list.map(f => fetch(`audio/sfx/${f}${ext}`).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => b && decode(b)).catch(() => null)));
    if (bufs.some(Boolean)) files[name] = bufs.filter(Boolean);
  }));
}
/** Vor dem ersten Spiel: seltene Dateien (Musik zur Wiederholung) nachladen */
export function prepareMatch() { lazyWanted = true; loadLazy(); }
function loadLazy() {
  if (!lazyWanted || lazyDone || !ac || !manifest) return;
  lazyDone = true;
  loadSet(Object.entries(manifest).filter(([name]) => LAZY.has(name))).catch(() => {});
}
async function loadFiles() {
  try {
    manifest = await (await fetch("audio/sfx/manifest.json")).json();
    // Namen mit _altN sind Kandidaten zur Auswahl im Sound-Lab, das Spiel lädt sie nicht
    await loadSet(Object.entries(manifest).filter(([name]) => !/_alt\d+$/.test(name) && !LAZY.has(name)));
    loadLazy();
    if (files.crowd && crowdNodes.length) { crowdNodes.forEach(n => n.stop()); crowdNodes = []; playFile("crowd", 1, true, crowdGain); }
    if (files["music-menu"] && musicPlaying) { clearInterval(musTimer); musTimer = null; startLoop(); }
  } catch (_) { /* keine Liste: alles bleibt erzeugt */ }
}
// Kategorie einer Datei für den Pegel (wie die erzeugten Sounds)
const fileCat = name => (/^(click|coin|tick|count|chest-item|shards)$/.test(name) ? "ui" : /^(goal|win|lose|levelup|chest-|super$|gfx-)/.test(name) ? "big" : /^(kick|hammer|chip|head|bounce|wallhit|bumper|swing|jump|land|slide|pound|stomp|squash|bump|pop)$/.test(name) ? "body" : "fx");
const FILE_TRIM = { post: -6 };   // dB je Aufnahme
/** Pegelfaktor einer Aufnahme */
export const fileLevel = name => Math.pow(10, (FILE_TRIM[name] || 0) / 20);
/** Index einer zufälligen Variante, nie dieselbe wie zuletzt (last; -1 = keine) */
export function pickVariant(n, last = -1, rnd = Math.random) {
  if (n <= 1) return 0;
  if (last < 0 || last >= n) return Math.floor(rnd() * n);
  const i = Math.floor(rnd() * (n - 1));
  return i >= last ? i + 1 : i;
}
const lastPick = {};
/** Spielt eine Datei (zufällige Variante, Tonhöhe leicht gestreut, v = Stärke wie beim erzeugten Sound, vol = Pegel) */
function playFile(name, v = 1, loop = false, dest = null, at = 0, vol = 1) {
  const list = files[name]; if (!list) return null;
  const src = ac.createBufferSource(), g = ac.createGain(), k = Math.min(1.5, Math.max(0.2, v ?? 1));
  const pick = pickVariant(list.length, lastPick[name] ?? -1); lastPick[name] = pick;
  src.buffer = list[pick]; src.loop = loop;
  if (!loop) src.playbackRate.value = 0.96 + Math.random() * 0.08 + (k - 1) * 0.06;
  g.gain.value = (loop ? 1 : Math.min(1.4, 0.55 + 0.45 * k)) * vol;
  src.connect(g); g.connect(dest || buses[fileCat(name)]);
  if (!loop && dest === null) { const s = ac.createGain(); s.gain.value = 0.12; g.connect(s); s.connect(sfxVerb); }
  src.start(ac.currentTime + at);
  return src;
}

/** Nur für das Sound-Lab (tools/sound-lab): Dateien aus audio/sfx ein- oder ausschalten, um erzeugt und aufgenommen zu vergleichen */
let filesOn = true;
export function useFiles(on) { filesOn = on; }
export function setSfx(on) { sfxOn = on; if (mix) { mix.gain.value = on ? 1 : 0; sfxVerb.gain.value = on ? 1 : 0; bowlSfx.gain.value = on ? 0.22 : 0; } }
export function setMusic(on) {
  musOn = on; if (!musBus) return;
  if (!on) stingStop();
  stingBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.1);
  // geplante Werte (Ducken holt die Musik sonst nach Sekunden zurück) verwerfen
  const t = ac.currentTime;
  for (const p of [musBus.gain, musVerb.gain]) { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
  musBus.gain.setTargetAtTime(on ? MUS_LEVEL : 0, t, 0.1); musVerb.gain.setTargetAtTime(on ? 1 : 0, t, 0.1);
}
function duck(sec) {
  if (!musOn || !musBus) return; const t = ac.currentTime;
  musBus.gain.cancelScheduledValues(t); musBus.gain.setTargetAtTime(MUS_LEVEL * 0.35, t, 0.03); musBus.gain.setTargetAtTime(MUS_LEVEL, t + sec, 0.4);
}

export function sfx(kind, v = 1) {
  if (!ac || document.hidden) return;   // im Hintergrund nichts einreihen, sonst kommt beim Zurückkehren alles auf einmal
  if (DUCK.has(kind)) duck(kind === "goal" || kind === "chest-head" ? 1.6 : 0.9);
  if (kind === "goal") { roar(1.2, 0.25 + 0.2 * v); if (filesOn && files.roar) playFile("roar", 1, false, cheerBus, 0.15, 0.4 + 0.35 * v); }   // v: 0,6 normales Tor, 1 großer Moment
  // Abpfiff: kurz, kurz, lang (aus den Aufnahmen der Einzelpfiffe zusammengesetzt)
  if (kind === "whistle" && filesOn && files.whistle1 && files.whistle) { playFile("whistle1"); playFile("whistle1", 1, false, null, 0.45); playFile("whistle", 1, false, null, 0.9); return; }
  if (filesOn && files[kind]) { playFile(kind, v, false, null, 0, fileLevel(kind)); return; }
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

// ---------- Musik: Sequenzer, Stücke und Instrumente aus synth.js ----------
// Menü-Musik: Name aus MENU_TRACKS (die anderen Stücke lassen sich im Sound-Labor vergleichen)
const MENU_TRACK = "lofi";
let track = MENU_TRACKS[MENU_TRACK];
/** Nur für das Sound-Lab: Stück wechseln (läuft die Musik, beginnt das neue Stück sofort von vorn) */
export function setMenuTrack(name) {
  if (!MENU_TRACKS[name] || track === MENU_TRACKS[name]) return;
  track = MENU_TRACKS[name];
  if (musTimer) { clearInterval(musTimer); musTimer = null; startLoop(); }
}
// ---------- Musik zur Torwiederholung (Jubel und Publikum gehen darunter) ----------
const STING = 0.4, STING_DUCK = 0.45;
const cue = { cur: null, used: new WeakSet() };
/** Was bei Schlüssel key (die laufende Wiederholung, null = keine) zu tun ist: "start", "stop", "restart" oder null */
export function replayCue(c, key) {
  if (key === c.cur) return null;
  const was = c.cur; c.cur = key;
  if (key && !c.used.has(key)) { c.used.add(key); return was ? "restart" : "start"; }
  return was ? "stop" : null;
}
/** Jedes Bild aufrufen: key = Objekt der laufenden Wiederholung oder null */
export function replayMusic(key) {
  const a = replayCue(cue, key || null);
  if (!a || !ac) return;
  if (a !== "start") stingStop();
  if (a !== "stop") stingStart();
}
// Jubel und Publikum leiser und etwas dunkler, damit die Musik obenauf sitzt; zurück langsamer als hin
function duckCheer(on) {
  const t = ac.currentTime;
  for (const n of [cheerBus, crowdDuck]) { n.gain.cancelScheduledValues(t); n.gain.setTargetAtTime(on ? STING_DUCK : 1, t, on ? 0.15 : 0.5); }
  cheerTone.frequency.cancelScheduledValues(t); cheerTone.frequency.setTargetAtTime(on ? 3800 : 16000, t, on ? 0.15 : 0.5);
}
// Einstieg: leiser und dumpf, öffnet sich in einer halben Sekunde; Ausstieg: wird dunkler und leiser, der Hall klingt aus
function stingStart() {
  const list = files.replay;
  if (!list || !musOn || !filesOn || document.hidden || ac.state !== "running") return;
  const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  lastSting = pickVariant(list.length, lastSting); src.buffer = list[lastSting];
  f.type = "lowpass"; f.Q.value = 0.5; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(18000, t + 0.5);
  g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(STING, t, 0.08);
  src.connect(f); f.connect(g); g.connect(stingBus); src.start(t);
  const me = { src, f, g };
  src.onended = () => { if (sting === me) { sting = null; duckCheer(false); } };
  sting = me;
  duckCheer(true);
}
function stingStop() {
  if (!sting) return;
  const t = ac.currentTime, { src, f, g } = sting;
  sting = null;
  for (const p of [g.gain, f.frequency]) { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
  g.gain.setTargetAtTime(0, t, 0.16); f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
  try { src.stop(t + 1); } catch (_) { /* schon gestoppt */ }
  duckCheer(false);
}

/** Für Tests: Zustand des Mischpults (Pegel zum jetzigen Zeitpunkt) */
export function state() {
  const v = n => (n ? n.gain.value : null);
  return { ctx: ac ? ac.state : "none", sfxOn, musOn, musicPlaying, sfx: v(mix), sfxVerb: v(sfxVerb), music: v(musBus), musVerb: v(musVerb), loop: !!(musTimer || musSrc),
    sting: !!sting, stingN: lastSting, stingFiles: (files.replay || []).length, cheer: v(cheerBus), cheerTone: cheerTone ? cheerTone.frequency.value : null, crowdDuck: v(crowdDuck) };
}
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
  const s16 = 60 / track.bpm / 4;
  while (nextNote < ac.currentTime + 0.12) { track.step(stepIdx, nextNote, s16, musicMode); nextNote += s16; stepIdx = (stepIdx + 1) % track.steps; }
}
