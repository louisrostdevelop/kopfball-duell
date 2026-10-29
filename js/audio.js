// Alle Sounds werden live erzeugt (keine Dateien nötig)
let ac = null, master, sfxBus, musBus, crowdGain, crowdFilter, noiseBuf;
let sfxOn = true, musOn = true, musicPlaying = false, musTimer = null, nextNote = 0, stepIdx = 0, musicMode = "menu";

export function unlock() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(comp);
  musBus = ac.createGain(); musBus.gain.value = musOn ? 0.32 : 0; musBus.connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // Publikums-Rauschen (Dauerschleife)
  const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  crowdFilter = ac.createBiquadFilter(); crowdFilter.type = "bandpass"; crowdFilter.frequency.value = 700; crowdFilter.Q.value = 0.6;
  crowdGain = ac.createGain(); crowdGain.gain.value = 0;
  n.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(sfxBus); n.start();
  if (musicPlaying) startLoop();
}
export function setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? 1 : 0; }
export function setMusic(on) { musOn = on; if (musBus) musBus.gain.setTargetAtTime(on ? 0.32 : 0, ac.currentTime, 0.1); }

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function osc(type, f0, f1, dur, vol, t = 0, bus = sfxBus) {
  if (!ac) return; const s = ac.currentTime + t, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, s); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), s + dur);
  env(g, s, 0.005, vol, dur); o.connect(g); g.connect(bus); o.start(s); o.stop(s + dur + 0.05);
}
function noise(dur, vol, type, freq, q = 1, t = 0, f1, bus = sfxBus) {
  if (!ac) return; const s = ac.currentTime + t, n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, s); if (f1) f.frequency.exponentialRampToValueAtTime(f1, s + dur); f.Q.value = q;
  env(g, s, 0.004, vol, dur); n.connect(f); f.connect(g); g.connect(bus); n.start(s, Math.random()); n.stop(s + dur + 0.05);
}

export function sfx(kind, v = 1) {
  if (!ac) return;
  switch (kind) {
    case "kick": osc("sine", 150 * Math.min(1.3, v), 45, 0.16, 0.7 * Math.min(1.4, v)); noise(0.05, 0.35, "highpass", 2000); if (v > 1.4) { noise(0.25, 0.3, "bandpass", 400, 1, 0, 3000); } break;
    case "head": osc("triangle", 360, 170, 0.12, 0.35); noise(0.03, 0.15, "bandpass", 1500, 2); break;
    case "bounce": osc("sine", 90, 50, 0.1, Math.min(0.4, 0.1 + v * 0.0004)); break;
    case "post": osc("sine", 920, 900, 0.5, 0.25); osc("sine", 1380, 1370, 0.35, 0.15); osc("square", 230, 220, 0.08, 0.1); break;
    case "jump": osc("square", 260, 520, 0.08, 0.05); break;
    case "land": osc("sine", 110, 60, 0.08, 0.2); break;
    case "swing": noise(0.1, 0.12, "bandpass", 900, 1.5, 0, 2400); break;
    case "whistle": [0, 0.2, 0.42].forEach((t, i) => { const d = i === 2 ? 0.55 : 0.13; whistleNote(t, d); }); break;
    case "whistle1": whistleNote(0, 0.35); break;
    case "goal": {
      osc("sawtooth", 220, 220, 1.2, 0.18); osc("sawtooth", 277, 277, 1.2, 0.14); osc("sawtooth", 330, 330, 1.2, 0.14);
      osc("sawtooth", 440, 440, 0.9, 0.08, 0.05);
      noise(2.4, 0.5, "bandpass", 900, 0.5, 0, 1400);
      roar(1.2); break;
    }
    case "full": [0, 0.07, 0.14].forEach((t, i) => osc("triangle", 660 * Math.pow(1.26, i), 660 * Math.pow(1.26, i), 0.12, 0.18, t)); break;
    case "arm": osc("sawtooth", 200, 900, 0.3, 0.12); break;
    case "super": noise(0.6, 0.45, "bandpass", 300, 0.8, 0, 4000); osc("sawtooth", 110, 55, 0.5, 0.25); osc("square", 880, 1760, 0.25, 0.06); break;
    case "launch": noise(0.4, 0.35, "highpass", 800, 0.7, 0, 5000); break;
    case "zap": noise(0.06, 0.3, "highpass", 3000); osc("square", 1200, 300, 0.06, 0.06); break;
    case "pu": [0, 0.06, 0.12, 0.18].forEach((t, i) => osc("square", 523 * Math.pow(1.335, i), 523 * Math.pow(1.335, i), 0.09, 0.08, t)); break;
    case "puSpawn": osc("sine", 880, 1320, 0.15, 0.08); break;
    case "freeze": osc("triangle", 1800, 900, 0.3, 0.15); noise(0.3, 0.2, "highpass", 5000); break;
    case "stomp": osc("square", 300, 80, 0.15, 0.2); osc("triangle", 900, 1400, 0.1, 0.1, 0.05); break;
    case "burn": noise(0.4, 0.4, "lowpass", 1500, 1, 0, 200); break;
    case "quake": osc("sine", 70, 30, 0.6, 0.8); noise(0.6, 0.5, "lowpass", 400, 1, 0, 80); break;
    case "charged": osc("triangle", 1000, 1000, 0.08, 0.1); break;
    case "tick": osc("square", 1400, 1400, 0.03, 0.05); break;
    case "click": osc("triangle", 700, 500, 0.05, 0.12); break;
    case "coin": osc("square", 988, 988, 0.06, 0.07); osc("square", 1319, 1319, 0.2, 0.07, 0.06); break;
    case "levelup": [0, 0.1, 0.2, 0.3, 0.45].forEach((t, i) => osc("square", [523, 659, 784, 1047, 1319][i], [523, 659, 784, 1047, 1319][i], 0.16, 0.08, t)); break;
    case "count": osc("square", 660, 660, 0.1, 0.1); break;
    case "go": osc("square", 1320, 1320, 0.25, 0.12); break;
    case "emote": osc("sine", 600, 900, 0.1, 0.12); break;
    case "lose": [0, 0.18, 0.36].forEach((t, i) => osc("triangle", [392, 349, 262][i], [392, 349, 262][i], 0.3, 0.12, t)); break;
    case "win": [0, 0.12, 0.24, 0.36].forEach((t, i) => osc("square", [523, 659, 784, 1047][i], [523, 659, 784, 1047][i], 0.22, 0.09, t)); break;
    case "wallhit": osc("square", 400, 200, 0.12, 0.12); break;
    case "ohh": noise(1.1, 0.25, "bandpass", 500, 0.8, 0, 380); break;
  }
}
function whistleNote(t, d) {
  if (!ac) return; const s = ac.currentTime + t, o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
  o.type = "sine"; o.frequency.value = 2300; l.frequency.value = 38; lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency);
  env(g, s, 0.01, 0.14, d); o.connect(g); g.connect(sfxBus); o.start(s); l.start(s); o.stop(s + d + 0.05); l.stop(s + d + 0.05);
}
function roar(sec) {
  if (!crowdGain) return; const t = ac.currentTime;
  crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setTargetAtTime(0.5, t, 0.05); crowdGain.gain.setTargetAtTime(0.06, t + sec, 0.6);
}
export function crowd(level) { if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0.03 + level * 0.12, ac.currentTime, 0.4); }
export function crowdOff() { if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0, ac.currentTime, 0.3); }

// ---------- Musik: kleiner Sequenzer ----------
const BPM = 112, S16 = 60 / BPM / 4;
const BASS = [36, 36, 48, 36, 39, 39, 51, 39, 41, 41, 53, 41, 43, 43, 55, 46];
const CHORDS = [[60, 63, 67], [63, 67, 70], [65, 68, 72], [67, 70, 74]];
const LEAD = [72, -1, 75, 72, 79, -1, 77, 75, 72, -1, 70, 72, 75, -1, -1, -1, 77, -1, 75, 77, 79, -1, 82, 79, 77, -1, 75, 72, 70, -1, 72, -1];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export function music(on, mode = "menu") {
  musicPlaying = on; musicMode = mode;
  if (!ac) return;
  if (on) startLoop(); else { clearInterval(musTimer); musTimer = null; }
}
function startLoop() {
  if (musTimer) return;
  nextNote = ac.currentTime + 0.1; stepIdx = 0;
  musTimer = setInterval(sched, 25);
}
function sched() {
  while (nextNote < ac.currentTime + 0.12) { playStep(stepIdx, nextNote); nextNote += S16; stepIdx = (stepIdx + 1) % 64; }
}
function mnote(type, m, t, dur, vol, cut = 1800) {
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = type; o.frequency.value = mtof(m); f.type = "lowpass"; f.frequency.value = cut;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(musBus); o.start(t); o.stop(t + dur + 0.02);
}
function mdrum(kind, t) {
  if (kind === "k") { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(musBus); o.start(t); o.stop(t + 0.2); return; }
  const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf; f.type = kind === "h" ? "highpass" : "bandpass"; f.frequency.value = kind === "h" ? 7000 : 1800;
  const d = kind === "h" ? 0.04 : 0.15, v = kind === "h" ? 0.18 : 0.5;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  n.connect(f); f.connect(g); g.connect(musBus); n.start(t, Math.random()); n.stop(t + d + 0.02);
}
function playStep(i, t) {
  const s = i % 16, bar = Math.floor(i / 16);
  if (s % 4 === 0) mdrum("k", t);
  if (s === 4 || s === 12) mdrum("s", t);
  if (s % 2 === 0) mdrum("h", t);
  mnote("sawtooth", BASS[s] + (bar === 3 ? -2 : 0), t, S16 * 0.9, 0.22, 700);
  if (s === 0) CHORDS[bar].forEach(m => mnote("triangle", m, t, S16 * 14, 0.06, 2500));
  if (musicMode === "menu") { const l = LEAD[(bar % 2) * 16 + s]; if (l > 0) mnote("square", l, t, S16 * 1.6, 0.05, 3000); }
}
