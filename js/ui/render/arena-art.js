// Die vier neuen Arenen: Hintergründe, Hindernisse im Stil der Arena und Umgebung (Glut, Blasen, Flackern).
// Vulkan (Geysire), Skatepark (Rampen), Tiefsee (Blasensäulen, Quallen), Backrooms (Noclip-Türen, Leuchtstoffröhren).
// Aufbau wie die alten Arenen: Himmel/Raum in mehreren Ebenen (hinten dunstig, vorne kräftig), Boden in Perspektive mit
// denselben Feldlinien (pitch aus render.js), feste Platzierung statt Zufallsgekritzel, Licht aus einer Richtung.
import { W, G, COL } from "../../content/config.js";
import { geyserState } from "../../content/layouts.js";

const TAU = Math.PI * 2, INK = COL.ink;
const lin = (b, y0, y1, stops) => { const g = b.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const rr = (b, x, y, w, h, r) => { b.beginPath(); if (b.roundRect) b.roundRect(x, y, w, h, r); else b.rect(x, y, w, h); };
/** weicher Lichtfleck */
function glow(b, x, y, r, col, a = 1) { const g = b.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); b.globalAlpha = a; b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2); b.globalAlpha = 1; }
/** Bergkette als Silhouette: h(x) gibt die Höhe über der Grundlinie */
function ridge(b, R, base, h, fill, rim) {
  b.beginPath(); b.moveTo(R.x0 - 10, base + 40);
  for (let x = R.x0 - 10; x <= R.x1 + 10; x += 12) b.lineTo(x, base - h(x));
  b.lineTo(R.x1 + 10, base + 40); b.closePath(); b.fillStyle = fill; b.fill();
  if (rim) { b.beginPath(); for (let x = R.x0 - 10; x <= R.x1 + 10; x += 12) b.lineTo(x, base - h(x)); b.strokeStyle = rim; b.lineWidth = 3; b.stroke(); }
}

export function makeArenaArt({ srand, FT, front, pitch }) {
  const persp = x => W / 2 + (x - W / 2) * 0.82;

  // ---------- Vulkan ----------
  function vulkan(b, R) {
    const cx = W / 2, rim = 168;
    b.fillStyle = lin(b, R.y0, FT, [[0, "#0a0210"], [0.4, "#250616"], [0.72, "#5e1216"], [1, "#b23a1a"]]); b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
    // Sterne ganz oben, kaum zu sehen
    for (let i = 0; i < 40; i++) { b.fillStyle = `rgba(255,200,180,${0.1 + srand() * 0.25})`; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), R.y0 + srand() * 90, 2, 2); }
    // Rauchsäule aus dem Krater
    for (let k = 11; k >= 0; k--) { const y = rim - 16 - k * 26, x = cx + Math.sin(k * 0.8) * k * 7, r = 46 + k * 15; glow(b, x, y, r, `rgba(${40 + k * 3},16,22,.9)`, 0.75); }
    glow(b, cx, rim - 10, 230, "rgba(255,110,40,.55)");
    // Bergketten: hinten dunstig rot, vorne dunkel, mit Glutkante
    ridge(b, R, FT - 40, x => 120 + Math.abs(Math.sin(x * 0.0031 + 0.6)) * 70 + Math.abs(Math.sin(x * 0.013)) * 22, "#4a1218", "rgba(255,120,60,.35)");
    // Vulkan: steile Spitze, breiter Fuß
    b.beginPath(); b.moveTo(cx - 760, FT); b.bezierCurveTo(cx - 420, FT - 30, cx - 210, rim + 60, cx - 118, rim);
    b.lineTo(cx + 118, rim); b.bezierCurveTo(cx + 210, rim + 60, cx + 420, FT - 30, cx + 760, FT); b.closePath();
    const vg = b.createLinearGradient(cx - 500, 0, cx + 500, 0); vg.addColorStop(0, "#1a080a"); vg.addColorStop(0.5, "#33100f"); vg.addColorStop(1, "#1a080a");
    b.fillStyle = vg; b.fill();
    // Glanz vom Krater auf den Flanken
    b.save(); b.clip(); glow(b, cx, rim + 40, 300, "rgba(255,90,30,.35)"); b.restore();
    // Krater
    b.fillStyle = "#ff8a2a"; b.beginPath(); b.ellipse(cx, rim + 1, 120, 13, 0, 0, TAU); b.fill();
    b.fillStyle = "#ffe07a"; b.beginPath(); b.ellipse(cx, rim + 2, 80, 7, 0, 0, TAU); b.fill();
    // Lavaströme: glatte, leuchtende Bänder, zur Mitte gespiegelt
    b.lineCap = "round"; b.lineJoin = "round";
    for (const [s, x0, x1, y1, w] of [[-1, 70, 330, FT - 6, 11], [-1, 20, 120, FT - 22, 7], [1, 60, 300, FT - 8, 10], [1, 100, 470, FT - 4, 8]]) {
      const path = () => { b.beginPath(); b.moveTo(cx + s * x0, rim + 4); b.bezierCurveTo(cx + s * (x0 + 30), rim + 70, cx + s * (x1 - 60), y1 - 70, cx + s * x1, y1); };
      b.shadowColor = "#ff5a14"; b.shadowBlur = 20; path(); b.strokeStyle = "#d8380e"; b.lineWidth = w + 4; b.stroke();
      b.shadowBlur = 0; path(); b.strokeStyle = "#ff7a1e"; b.lineWidth = w; b.stroke();
      path(); b.strokeStyle = "#ffd65a"; b.lineWidth = w * 0.3; b.stroke();
    }
    // Feuerschalen auf Steinsäulen links und rechts (symmetrisch)
    for (const x of [W * 0.18, W * 0.82]) {
      b.fillStyle = lin(b, FT - 150, FT, [[0, "#3a1a16"], [1, "#1c0b0a"]]); rr(b, x - 18, FT - 150, 36, 150, 4); b.fill();
      b.fillStyle = "#4a2420"; b.fillRect(x - 26, FT - 156, 52, 10); b.fillRect(x - 24, FT - 14, 48, 14);
      glow(b, x, FT - 175, 90, "rgba(255,140,50,.6)");
      b.fillStyle = "#ff7a1e"; b.beginPath(); b.moveTo(x - 20, FT - 158); b.quadraticCurveTo(x - 16, FT - 190, x - 4, FT - 200); b.quadraticCurveTo(x - 2, FT - 182, x + 6, FT - 206); b.quadraticCurveTo(x + 18, FT - 186, x + 20, FT - 158); b.closePath(); b.fill();
      b.fillStyle = "#ffe07a"; b.beginPath(); b.moveTo(x - 9, FT - 158); b.quadraticCurveTo(x - 6, FT - 180, x + 2, FT - 186); b.quadraticCurveTo(x + 10, FT - 172, x + 9, FT - 158); b.closePath(); b.fill();
    }
    // Boden: Obsidian-Platten in Perspektive, Fugen glühen schwach
    pitch(b, R, "#2c1813", "#25130f", "rgba(255,160,80,.55)");
    b.strokeStyle = "rgba(255,110,40,.22)"; b.lineWidth = 2;
    for (let i = -6; i <= 22; i += 2) { const xa = i * W / 16; b.beginPath(); b.moveTo(persp(xa), FT); b.lineTo(xa, G); b.stroke(); }
    b.save(); b.globalCompositeOperation = "lighter"; glow(b, W / 2, G + 10, 700, "rgba(255,80,20,.12)"); b.restore();
    front(b, R, "#2b1410", "#160709", "rgba(255,106,26,.6)");
  }

  // ---------- Skatepark ----------
  function cloud(b, x, y, s) {
    const puffs = [[-50, 6, 26], [-22, -10, 34], [14, -16, 40], [48, -2, 30], [72, 8, 20]];
    b.fillStyle = "#ffffff"; puffs.forEach(([dx, dy, r]) => { b.beginPath(); b.arc(x + dx * s, y + dy * s, r * s, 0, TAU); b.fill(); });
    b.fillRect(x - 60 * s, y + 4 * s, 140 * s, 24 * s);
    b.fillStyle = "rgba(160,200,235,.45)"; b.fillRect(x - 60 * s, y + 20 * s, 140 * s, 8 * s);
  }
  function skate(b, R) {
    b.fillStyle = lin(b, R.y0, FT, [[0, "#3d9ff0"], [0.55, "#86ccff"], [1, "#dff3ff"]]); b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
    glow(b, W * 0.14, 20, 160, "rgba(255,250,215,.8)"); b.fillStyle = "#fffbe6"; b.beginPath(); b.arc(W * 0.14, 20, 40, 0, TAU); b.fill();
    [[W * 0.36, 30, 0.9], [W * 0.7, 6, 1.1], [W * 0.93, 70, 0.7], [W * 0.02, 92, 0.75]].forEach(([x, y, s]) => cloud(b, x, y, s));
    // Stadt: zwei Ebenen, hinten blasser
    const city = (base, col, win, seed) => {
      let x = R.x0 - 20, k = seed;
      while (x < R.x1 + 20) { k = (k * 16807) % 2147483647; const w = 70 + (k % 60), h = 80 + ((k >> 3) % 120);
        b.fillStyle = col; b.fillRect(x, base - h, w, h + 2);
        if (win) { b.fillStyle = win; for (let yy = base - h + 12; yy < base - 14; yy += 18) for (let xx = x + 10; xx < x + w - 12; xx += 16) b.fillRect(xx, yy, 7, 9); }
        x += w + 6; }
    };
    city(FT - 170, "#b4cde2", "rgba(255,255,255,.35)", 11);
    city(FT - 130, "#90b1cd", "rgba(255,255,255,.3)", 29);
    // Maschendrahtzaun über der Mauer
    const fy = FT - 190;
    b.strokeStyle = "rgba(90,100,115,.35)"; b.lineWidth = 1.5;
    for (let x = Math.floor(R.x0 / 18) * 18; x < R.x1 + 80; x += 18) { b.beginPath(); b.moveTo(x, fy); b.lineTo(x - 70, fy + 70); b.moveTo(x - 70, fy); b.lineTo(x, fy + 70); b.stroke(); }
    b.fillStyle = "#6c7684"; b.fillRect(R.x0, fy - 4, R.x1 - R.x0, 5);
    for (let x = Math.floor(R.x0 / 190) * 190; x < R.x1; x += 190) b.fillRect(x - 3, fy - 6, 6, 80);
    // Mauer mit Feldern, jedes zweite mit einem Graffiti-Stück
    const wy = FT - 120;
    b.fillStyle = lin(b, wy, FT, [[0, "#a9afb8"], [1, "#868c96"]]); b.fillRect(R.x0, wy, R.x1 - R.x0, 120);
    b.fillStyle = "#737a85"; b.fillRect(R.x0, wy - 8, R.x1 - R.x0, 10);
    const cols = [["#ff4fd8", "#ffd02b"], ["#22d3ee", "#ff6a3d"], ["#3ddc84", "#8b5cf6"], ["#ffd02b", "#22d3ee"], ["#ff6a3d", "#3ddc84"]];
    let n = 0;
    for (let px = Math.floor(R.x0 / 190) * 190; px < R.x1; px += 190, n++) {
      b.fillStyle = "rgba(0,0,0,.16)"; b.fillRect(px - 1, wy, 3, 120);
      if (n % 2) continue;
      const [c1, c2] = cols[(n / 2) % cols.length], mx = px + 95, my = wy + 60;
      // Bubble-Schriftzug ohne Buchstaben: vier runde Blöcke mit Schatten, Kontur, Glanz, Farbverlauf und Nasen
      const blobs = [[[-54, 4, 24], [-20, -4, 28], [16, 2, 26], [50, -2, 24]], [[-46, -6, 30], [-6, 6, 22], [30, -4, 30], [60, 8, 16]], [[-58, 8, 18], [-30, -2, 26], [4, -8, 30], [42, 4, 26]]][(n / 2) % 3];
      b.fillStyle = "rgba(0,0,0,.25)"; blobs.forEach(([dx, dy, r]) => { b.beginPath(); b.arc(mx + dx + 5, my + dy + 6, r + 5, 0, TAU); b.fill(); });
      b.fillStyle = INK; blobs.forEach(([dx, dy, r]) => { b.beginPath(); b.arc(mx + dx, my + dy, r + 5, 0, TAU); b.fill(); });
      const g = b.createLinearGradient(0, my - 30, 0, my + 30); g.addColorStop(0, c1); g.addColorStop(1, c2);
      b.fillStyle = g; blobs.forEach(([dx, dy, r]) => { b.beginPath(); b.arc(mx + dx, my + dy, r, 0, TAU); b.fill(); });
      b.fillStyle = "rgba(255,255,255,.6)"; blobs.forEach(([dx, dy, r]) => { b.beginPath(); b.ellipse(mx + dx - r * 0.3, my + dy - r * 0.45, r * 0.38, r * 0.15, -0.35, 0, TAU); b.fill(); });
      b.strokeStyle = c2; b.lineWidth = 4; b.lineCap = "round"; [[-20, 14], [16, 22], [50, 10]].forEach(([dx, l]) => { b.beginPath(); b.moveTo(mx + dx, my + 26); b.lineTo(mx + dx, my + 26 + l); b.stroke(); });
      b.fillStyle = "#fff"; b.beginPath(); const sx = mx + 72, sy = my - 26; b.moveTo(sx, sy - 9); b.lineTo(sx + 3, sy - 3); b.lineTo(sx + 9, sy); b.lineTo(sx + 3, sy + 3); b.lineTo(sx, sy + 9); b.lineTo(sx - 3, sy + 3); b.lineTo(sx - 9, sy); b.lineTo(sx - 3, sy - 3); b.closePath(); b.fill();
    }
    b.fillStyle = "#5f6670"; b.fillRect(R.x0, FT - 12, R.x1 - R.x0, 12);
    // Beton in Perspektive, gelbe Feldlinien
    pitch(b, R, "#bcc1c9", "#b4b9c2", "rgba(255,200,40,.9)");
    for (let i = 0; i < 260; i++) { b.fillStyle = srand() > 0.5 ? "rgba(60,64,72,.08)" : "rgba(255,255,255,.12)"; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), FT + srand() * (G - FT), 2, 2); }
    front(b, R, "#a4aab3", "#2b2f36", "rgba(255,199,43,.55)");
  }

  // ---------- Tiefsee ----------
  function coral(b, x, y, kind, col, s) {
    b.lineJoin = "round"; b.lineCap = "round";
    if (kind === 0) { // Röhrenkoralle
      [[-14, 40], [0, 58], [14, 46], [-26, 26], [26, 30]].forEach(([dx, h]) => {
        b.fillStyle = col; rr(b, x + dx * s - 6 * s, y - h * s, 12 * s, h * s, 6 * s); b.fill(); b.strokeStyle = INK; b.lineWidth = 2.5; b.stroke();
        b.fillStyle = "rgba(0,0,0,.35)"; b.beginPath(); b.ellipse(x + dx * s, y - h * s + 3 * s, 4 * s, 2 * s, 0, 0, TAU); b.fill();
      });
    } else if (kind === 1) { // Fächerkoralle
      b.fillStyle = col; b.beginPath(); b.moveTo(x, y); b.arc(x, y - 6 * s, 52 * s, Math.PI * 1.08, Math.PI * 1.92); b.closePath(); b.fill(); b.strokeStyle = INK; b.lineWidth = 2.5; b.stroke();
      b.strokeStyle = "rgba(0,0,0,.25)"; b.lineWidth = 2; for (let k = -3; k <= 3; k++) { const a = -Math.PI / 2 + k * 0.17; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * 50 * s, y - 6 * s + Math.sin(a) * 50 * s); b.stroke(); }
    } else { // Hirnkoralle
      b.fillStyle = col; b.beginPath(); b.ellipse(x, y, 34 * s, 24 * s, 0, Math.PI, TAU); b.closePath(); b.fill(); b.strokeStyle = INK; b.lineWidth = 2.5; b.stroke();
      b.strokeStyle = "rgba(0,0,0,.22)"; b.lineWidth = 2; for (let k = 0; k < 3; k++) { b.beginPath(); b.ellipse(x, y, (26 - k * 8) * s, (17 - k * 5) * s, 0, Math.PI, TAU); b.stroke(); }
    }
  }
  function tiefsee(b, R) {
    b.fillStyle = lin(b, R.y0, FT, [[0, "#2ab0de"], [0.3, "#0f78b4"], [0.7, "#08508a"], [1, "#063d6e"]]); b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0 + 10);
    // Lichtstrahlen: weich, fächerförmig von oben
    for (let i = 0; i < 8; i++) {
      const x = W * (0.05 + i * 0.13), g = b.createLinearGradient(0, R.y0, 0, FT);
      g.addColorStop(0, "rgba(220,250,255,.16)"); g.addColorStop(1, "rgba(220,250,255,0)");
      b.fillStyle = g; b.beginPath(); b.moveTo(x - 24, R.y0); b.lineTo(x + 24, R.y0); b.lineTo(x + 150, FT); b.lineTo(x + 40, FT); b.closePath(); b.fill();
    }
    // Fischschwarm
    for (let i = 0; i < 26; i++) { const a = i * 2.4, x = W * 0.62 + Math.cos(a) * (40 + i * 4), y = 120 + Math.sin(a * 1.3) * 26 + i * 1.5; b.fillStyle = "rgba(170,225,255,.55)"; b.beginPath(); b.ellipse(x, y, 8, 3.5, 0, 0, TAU); b.fill(); b.beginPath(); b.moveTo(x - 7, y); b.lineTo(x - 13, y - 4); b.lineTo(x - 13, y + 4); b.fill(); }
    // Riff: zwei Ebenen, hinten im Dunst
    ridge(b, R, FT - 30, x => 70 + Math.abs(Math.sin(x * 0.006 + 1)) * 50 + Math.abs(Math.sin(x * 0.021)) * 14, "#0b5590");
    // Wrack in der Ferne
    b.fillStyle = "#0a4b80"; b.beginPath(); b.moveTo(W * 0.24, FT - 92); b.lineTo(W * 0.38, FT - 104); b.lineTo(W * 0.4, FT - 70); b.lineTo(W * 0.26, FT - 62); b.closePath(); b.fill();
    b.fillRect(W * 0.3, FT - 160, 6, 70); b.fillRect(W * 0.34, FT - 140, 5, 44);
    ridge(b, R, FT - 6, x => 30 + Math.abs(Math.sin(x * 0.009 + 2)) * 34, "#07406f");
    // Korallen links und rechts (gespiegelt), Seetang am Rand
    for (const [dx, kind, col, s] of [[640, 0, "#ff7a9c", 1], [520, 1, "#c77dff", 0.9], [400, 2, "#ffa94d", 0.9], [690, 2, "#ff6f91", 0.7], [330, 0, "#ffd166", 0.75]]) {
      coral(b, W / 2 - dx, FT - 4, kind, col, s); coral(b, W / 2 + dx, FT - 4, kind, col, s);
    }
    b.lineCap = "round";
    for (const x of [W / 2 - 760, W / 2 - 720, W / 2 + 720, W / 2 + 760]) { b.strokeStyle = "#1f9e6a"; b.lineWidth = 9; b.beginPath(); b.moveTo(x, FT); b.bezierCurveTo(x + 30, FT - 120, x - 30, FT - 220, x + 10, FT - 330); b.stroke(); b.strokeStyle = "#2ec27e"; b.lineWidth = 3; b.stroke(); }
    // Sand in Perspektive mit Rippeln und Lichtnetz
    b.fillStyle = lin(b, FT, G, [[0, "#b99f66"], [1, "#e9d6a0"]]); b.fillRect(R.x0, FT - 4, R.x1 - R.x0, G - FT + 4);
    b.strokeStyle = "rgba(130,100,50,.22)"; b.lineWidth = 3;
    for (let i = 1; i < 10; i++) { const tt = i / 10, y = FT + (G - FT) * tt * tt; b.beginPath(); for (let x = R.x0; x <= R.x1; x += 20) b.lineTo(x, y + Math.sin(x * 0.018 + i * 1.7) * (2 + tt * 4)); b.stroke(); }
    b.strokeStyle = "rgba(255,255,240,.18)"; b.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = R.x0 + ((i * 97) % 1) * 0 + (i / 40) * (R.x1 - R.x0), y = FT + 30 + ((i * 53) % 260); b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + 20, y - 10, x + 44, y + 2); b.quadraticCurveTo(x + 60, y + 12, x + 80, y - 4); b.stroke(); }
    b.strokeStyle = "rgba(255,255,255,.55)"; b.lineWidth = 3.5;
    b.beginPath(); b.moveTo(W / 2, FT + 10); b.lineTo(W / 2, G); b.stroke();
    b.beginPath(); b.ellipse(W / 2, (FT + 14 + G) / 2 + 6, 170, 58, 0, 0, TAU); b.stroke();
    b.beginPath(); b.moveTo(persp(-20), FT + 14); b.lineTo(persp(W + 20), FT + 14); b.stroke();
    front(b, R, "#bea468", "#062a4f", "rgba(120,220,255,.5)");
  }

  // ---------- Backrooms ----------
  // Ein Fluchtpunkt für alles: derselbe wie Boden und Tore (weit über dem Bild, man schaut leicht von oben in den Raum).
  // Deshalb keine Decke von unten, sondern eine hohe Wand mit Leuchtstoffröhren an Drähten; Durchgänge zeigen den Flur
  // dahinter in derselben Perspektive. Feldlinien als abgewetztes Klebeband auf dem Teppich.
  function backrooms(b, R) {
    const VY = G - (G - FT) / 0.18, vx = W / 2, base = FT - 20;
    const toV = (x, y, q) => [vx + (x - vx) * q, VY + (y - VY) * q];   // Punkt um q weiter nach hinten
    // Wand: warmes Gelb, oben dunkler (das Licht hängt tiefer), feine Tapetenstreifen
    b.fillStyle = lin(b, R.y0, base, [[0, "#6f6223"], [0.35, "#b9a44c"], [0.7, "#d6c46c"], [1, "#cdb960"]]); b.fillRect(R.x0, R.y0, R.x1 - R.x0, base - R.y0);
    for (let x = Math.floor(R.x0 / 24) * 24; x < R.x1; x += 24) { b.fillStyle = "rgba(120,100,30,.10)"; b.fillRect(x, R.y0, 2, base - R.y0); b.fillStyle = "rgba(255,248,200,.06)"; b.fillRect(x + 12, R.y0, 1, base - R.y0); }
    // Leuchtstoffröhren: eine Reihe in gleichem Abstand, Licht fällt als Kegel auf die Wand
    const lampY = 26, gap = 300, lamps = [];
    for (let x = vx - gap * 6; x <= vx + gap * 6; x += gap) if (x > R.x0 - 200 && x < R.x1 + 200) lamps.push(x);
    b.save(); b.globalCompositeOperation = "lighter";
    for (const x of lamps) {
      // Licht nach unten auf die Wand (Kegel), nach oben nur ein schwacher Schein
      const g = b.createRadialGradient(x, lampY + 10, 10, x, lampY + 150, 260); g.addColorStop(0, "rgba(255,248,205,.30)"); g.addColorStop(1, "rgba(255,248,205,0)");
      b.fillStyle = g; b.fillRect(x - 280, R.y0, 560, base - R.y0);
    }
    b.restore();
    // Durchgänge: Zarge, Flurboden, Seitenwand des Flurs (auf der vom Fluchtpunkt abgewandten Seite), hinten Licht
    const dw = 116, dh = 176, dy = base - dh;
    for (const dx of [-555, -185, 185, 555]) {
      const x0 = vx + dx - dw / 2, x1 = x0 + dw;
      b.save(); b.beginPath(); b.rect(x0, dy, dw, dh); b.clip();
      b.fillStyle = lin(b, dy, base, [[0, "#3f3714"], [1, "#6b5d27"]]); b.fillRect(x0, dy, dw, dh);   // Flurwand hinten (im Schatten)
      const q = 0.955, [ix0, iy] = toV(x0, base, q), [ix1] = toV(x1, base, q);
      // Flurboden
      b.fillStyle = lin(b, iy, base, [[0, "#7c6c2e"], [1, "#a8954a"]]);
      b.beginPath(); b.moveTo(x0, base); b.lineTo(x1, base); b.lineTo(ix1, iy); b.lineTo(ix0, iy); b.closePath(); b.fill();
      // seitliche Flurwand
      const side = dx < 0 ? [x0, ix0] : [x1, ix1];
      b.fillStyle = "rgba(40,34,10,.45)"; b.beginPath(); b.moveTo(side[0], dy - 40); b.lineTo(side[0], base); b.lineTo(side[1], iy); b.lineTo(side[1], dy - 40); b.closePath(); b.fill();
      // Licht am Ende des Flurs
      const g = b.createRadialGradient((ix0 + ix1) / 2, iy - 50, 4, (ix0 + ix1) / 2, iy - 50, 70); g.addColorStop(0, "rgba(255,245,190,.45)"); g.addColorStop(1, "rgba(255,245,190,0)");
      b.fillStyle = g; b.fillRect(x0, dy, dw, dh);
      // Schatten unter dem Sturz
      b.fillStyle = lin(b, dy, dy + 34, [[0, "rgba(20,16,4,.55)"], [1, "rgba(20,16,4,0)"]]); b.fillRect(x0, dy, dw, 34);
      b.restore();
      // Zarge
      b.strokeStyle = "#e4d488"; b.lineWidth = 7; b.beginPath(); b.moveTo(x0 - 3.5, base); b.lineTo(x0 - 3.5, dy - 3.5); b.lineTo(x1 + 3.5, dy - 3.5); b.lineTo(x1 + 3.5, base); b.stroke();
      b.strokeStyle = "rgba(90,76,25,.6)"; b.lineWidth = 2; b.beginPath(); b.moveTo(x0 - 7, base); b.lineTo(x0 - 7, dy - 7); b.lineTo(x1 + 7, dy - 7); b.lineTo(x1 + 7, base); b.stroke();
    }
    // Röhren selbst (vor der Wand, an zwei Drähten nach oben aus dem Bild)
    for (const x of lamps) {
      b.strokeStyle = "rgba(60,50,15,.55)"; b.lineWidth = 2; b.beginPath(); b.moveTo(x - 60, lampY); b.lineTo(x - 60, R.y0); b.moveTo(x + 60, lampY); b.lineTo(x + 60, R.y0); b.stroke();
      b.fillStyle = "#9c8e55"; rr(b, x - 82, lampY - 4, 164, 14, 4); b.fill();
      b.fillStyle = "#fffdf0"; rr(b, x - 76, lampY + 6, 152, 7, 3.5); b.fill();
      b.save(); b.globalCompositeOperation = "lighter"; glow(b, x, lampY + 10, 90, "rgba(255,250,215,.35)"); b.restore();
    }
    // Fußleiste
    b.fillStyle = "#8a7a34"; b.fillRect(R.x0, base, R.x1 - R.x0, FT - base); b.fillStyle = "rgba(255,250,200,.35)"; b.fillRect(R.x0, base, R.x1 - R.x0, 3);
    b.fillStyle = "rgba(30,24,6,.35)"; b.fillRect(R.x0, FT - 3, R.x1 - R.x0, 3);
    // Teppich: Bahnen in Perspektive, Linien als abgewetztes Klebeband
    pitch(b, R, "#b5a24c", "#ae9b48", "rgba(255,248,210,.38)");
    for (let i = 0; i < 900; i++) { b.fillStyle = srand() > 0.5 ? "rgba(90,75,20,.10)" : "rgba(255,245,190,.06)"; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), FT + srand() * (G - FT), 2, 2); }
    // feuchte Stellen, weich auslaufend, flach in der Bodenebene
    for (const [dx, y, w] of [[-470, 455, 90], [400, 560, 120], [690, 410, 70]]) {
      b.save(); b.translate(vx + dx, y); b.scale(1, 0.22);
      const g = b.createRadialGradient(0, 0, 0, 0, 0, w); g.addColorStop(0, "rgba(80,66,18,.22)"); g.addColorStop(0.7, "rgba(80,66,18,.12)"); g.addColorStop(1, "rgba(80,66,18,0)");
      b.fillStyle = g; b.beginPath(); b.arc(0, 0, w, 0, TAU); b.fill(); b.restore();
    }
    // Vignette
    const vg = b.createRadialGradient(vx, 360, 320, vx, 360, 1150); vg.addColorStop(0, "rgba(40,32,5,0)"); vg.addColorStop(1, "rgba(40,32,5,.32)");
    b.fillStyle = vg; b.fillRect(R.x0, R.y0, R.x1 - R.x0, G - R.y0);
    front(b, R, "#a8964a", "#2f2a12", "rgba(255,250,200,.45)");
  }

  // ---------- Hindernisse ----------
  const STYLE = {
    vulkan: { plat: "#3a2420", edge: "#ff8a3d", block: "#3b2420", bump: "#ff6a1a" },
    skate: { plat: "#5b6370", edge: "#e8ecf2", block: "#8d939d", bump: "#ffc72b" },
    tiefsee: { plat: "#ff8fab", edge: "#ffd6e0", block: "#3f5b74", bump: "#ff7ad9" },
    backrooms: { plat: "#fffbe8", edge: "#fffbe8", block: "#cdb85c", bump: "#e8d982" },
  };

  /** Zeichnet ein Hindernis der neuen Arten oder im Stil einer neuen Arena; false = render.js macht es */
  function draw(c, o, q, t, el, ar, hi) {
    const x = q.x, y = q.y;
    if (o.t === "ramp") {
      const a = x - o.top / 2, b2 = x + o.top / 2, x0 = a - o.L, x1 = b2 + o.R, yt = G - o.h;
      const outline = () => { c.beginPath(); c.moveTo(x0 - 3, G + 2); c.lineTo(a, yt); c.lineTo(b2, yt); c.lineTo(x1 + 3, G + 2); c.closePath(); };
      // Seitenwand aus Holz mit Maserung
      outline(); c.fillStyle = lin(c, yt, G, [[0, "#e2bd84"], [1, "#b98a52"]]); c.fill();
      c.save(); outline(); c.clip(); c.strokeStyle = "rgba(120,80,30,.28)"; c.lineWidth = 2;
      for (let k = 1; k < 5; k++) { const yy = yt + (G - yt) * k / 5; c.beginPath(); c.moveTo(x0 - 4, yy); c.quadraticCurveTo(x, yy + 3, x1 + 4, yy - 2); c.stroke(); }
      c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(x0 - 4, G - 8, x1 - x0 + 8, 10);
      c.restore();
      outline(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
      // Fahrbelag: dunkles Band auf Schrägen und Oberseite
      c.lineJoin = "round"; c.lineCap = "round";
      c.beginPath(); c.moveTo(x0, G - 1); c.lineTo(a, yt + 4); c.lineTo(b2, yt + 4); c.lineTo(x1, G - 1);
      c.strokeStyle = "#4b525c"; c.lineWidth = 8; c.stroke();
      c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 2; c.stroke();
      // Stahlkante (Coping) an den oberen Ecken
      c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.moveTo(a - 1, yt + 1); c.lineTo(b2 + 1, yt + 1); c.stroke();
      c.strokeStyle = "#e9edf3"; c.lineWidth = 5; c.stroke();
      c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(a, yt - 0.5); c.lineTo(b2, yt - 0.5); c.stroke();
      return true;
    }
    if (o.t === "geyser") {
      const s = geyserState(o, el), w = o.w;
      // Krater: Steinring im Boden, innen glühend
      c.fillStyle = lin(c, G - 18, G + 4, [[0, "#5a3426"], [1, "#2a1410"]]);
      c.beginPath(); c.moveTo(x - w * 0.75, G + 2); c.quadraticCurveTo(x - w * 0.62, G - 18, x - w * 0.3, G - 14); c.lineTo(x + w * 0.3, G - 14); c.quadraticCurveTo(x + w * 0.62, G - 18, x + w * 0.75, G + 2); c.closePath(); c.fill();
      c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#1a0b08"; c.beginPath(); c.ellipse(x, G - 13, w * 0.36, 5, 0, 0, TAU); c.fill();
      const pulse = s.warn ? 0.5 + 0.5 * Math.sin(t * 22) : 0;
      c.fillStyle = `rgba(255,${120 + pulse * 80},40,${0.5 + pulse * 0.5})`; c.beginPath(); c.ellipse(x, G - 13, w * 0.28, 3.5, 0, 0, TAU); c.fill();
      if (s.warn) { // Ankündigung: Dampf und Steinchen
        for (let k = 0; k < 6; k++) { const ph = (t * 1.6 + k / 6) % 1; c.fillStyle = `rgba(255,220,200,${0.35 * (1 - ph)})`; c.beginPath(); c.arc(x + Math.sin(k * 2.3 + t * 3) * w * 0.3, G - 8 - ph * 70, 8 + ph * 14, 0, TAU); c.fill(); }
        const k2 = Math.min(1, (s.ph - (o.per - 1.2)) / 1.2);
        c.strokeStyle = `rgba(255,170,60,${0.35 + 0.4 * k2})`; c.lineWidth = 3; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(x - w / 2, o.top); c.lineTo(x - w / 2, G - 10); c.moveTo(x + w / 2, o.top); c.lineTo(x + w / 2, G - 10); c.stroke(); c.setLineDash([]);
      }
      if (s.active) { // Fontäne
        const up = Math.min(1, s.k * 6), fade = s.k > 0.75 ? 1 - (s.k - 0.75) / 0.25 : 1, yt = G - (G - o.top) * up;
        c.globalAlpha = fade;
        const g = c.createLinearGradient(0, yt, 0, G); g.addColorStop(0, "rgba(255,255,255,.85)"); g.addColorStop(0.35, "rgba(255,200,120,.85)"); g.addColorStop(1, "rgba(255,90,20,.95)");
        c.fillStyle = g; c.beginPath(); c.moveTo(x - w * 0.42, G); c.quadraticCurveTo(x - w * 0.6, (yt + G) / 2, x - w * 0.35, yt + 20); c.quadraticCurveTo(x, yt - 26, x + w * 0.35, yt + 20); c.quadraticCurveTo(x + w * 0.6, (yt + G) / 2, x + w * 0.42, G); c.closePath(); c.fill();
        c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = "rgba(255,255,255,.7)"; for (let k = 0; k < 7; k++) { const yy = yt + 10 + ((t * 700 + k * 53) % (G - yt)); c.beginPath(); c.arc(x + Math.sin(k * 1.7 + t * 9) * w * 0.25, yy, 5 + (k % 3) * 2, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
      return true;
    }
    if (o.t === "bubbles") {
      const w = o.w, hgt = G - o.top;
      const on = geyserState(o, el).active;
      c.fillStyle = lin(c, o.top, G, [[0, "rgba(160,230,255,0)"], [1, `rgba(160,230,255,${on ? 0.35 : 0.12})`]]); c.fillRect(x - w / 2, o.top, w, hgt);
      c.strokeStyle = "rgba(235,252,255,.95)"; c.lineWidth = 2.5;
      const n = (hi ? 18 : 9) * (on ? 1 : 0.35);
      for (let k = 0; k < n; k++) {
        const ph = ((t * (on ? 0.5 + (k % 4) * 0.1 : 0.2) + k / n) % 1), yy = G - 10 - ph * hgt, xx = x + Math.sin(k * 2.1 + t * 2.4) * w * 0.32, r = 4 + (k % 4) * 2.5 + ph * 4;
        c.globalAlpha = Math.min(1, (1 - ph) * 2); c.fillStyle = "rgba(200,245,255,.25)"; c.beginPath(); c.arc(xx, yy, r, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = "rgba(255,255,255,.7)"; c.beginPath(); c.arc(xx - r * 0.35, yy - r * 0.35, r * 0.25, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
      // Quelle: Muschel
      c.fillStyle = "#f1b9c8"; c.beginPath(); c.ellipse(x, G - 4, w * 0.45, 12, 0, Math.PI, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
      c.strokeStyle = "rgba(160,80,100,.5)"; c.lineWidth = 2; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x, G - 4); c.lineTo(x + k * w * 0.15, G - 14); c.stroke(); }
      return true;
    }
    if (o.t === "portal") {
      const x0 = x - o.w / 2, glitch = Math.max(0, 1 - (t - (o.hitT ?? -9)) / 0.5);
      c.fillStyle = lin(c, y, y + o.h, [[0, "#14110a"], [1, "#3a3216"]]); c.fillRect(x0, y, o.w, o.h);
      // Rauschen im Durchgang
      c.fillStyle = `rgba(255,250,210,${0.08 + glitch * 0.4})`;
      for (let k = 0; k < 10; k++) { const yy = y + ((k * 37 + Math.floor(t * 14) * 11) % o.h); c.fillRect(x0 + 4, yy, o.w - 8, 2); }
      c.strokeStyle = "#a8964a"; c.lineWidth = 7; c.strokeRect(x0, y, o.w, o.h);
      c.strokeStyle = INK; c.lineWidth = 2.5; c.strokeRect(x0 - 3.5, y - 3.5, o.w + 7, o.h + 7);
      if (glitch > 0) { c.fillStyle = `rgba(80,255,240,${glitch * 0.6})`; for (let k = 0; k < 6; k++) c.fillRect(x0 + ((k * 13) % o.w) - 6, y + ((k * 29) % o.h), 10 + (k % 3) * 6, 4); }
      return true;
    }
    if (!STYLE[ar]) return false;
    const S = STYLE[ar];
    if (o.t === "plat" && !o.block) {
      const x0 = x - o.w / 2, w = o.w, h = o.h;
      if (ar === "backrooms") { // Leuchtstoffröhre an Drähten
        c.strokeStyle = "rgba(90,80,40,.6)"; c.lineWidth = 2; c.beginPath(); c.moveTo(x0 + 16, y); c.lineTo(x0 + 16, -300); c.moveTo(x0 + w - 16, y); c.lineTo(x0 + w - 16, -300); c.stroke();
        if (hi) { c.save(); c.globalCompositeOperation = "lighter"; const g = c.createRadialGradient(x, y + h, 4, x, y + h, w * 0.7); g.addColorStop(0, "rgba(255,250,210,.35)"); g.addColorStop(1, "rgba(255,250,210,0)"); c.fillStyle = g; c.fillRect(x - w, y - 20, w * 2, w); c.restore(); }
        c.fillStyle = "#e9e2bf"; rr(c, x0, y, w, h, 4); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = "#fffef2"; rr(c, x0 + 6, y + 5, w - 12, h - 10, 3); c.fill();
      } else if (ar === "tiefsee") { // Korallen-Sims
        c.fillStyle = S.plat; rr(c, x0, y, w, h + 2, 9); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = "#ffd6e0"; for (let k = 0; k < Math.floor(w / 18); k++) { c.beginPath(); c.arc(x0 + 10 + k * 18, y + 6 + (k % 2) * 4, 3, 0, TAU); c.fill(); }
        c.strokeStyle = "#ff6f91"; c.lineWidth = 5; c.lineCap = "round"; for (let k = 0; k < 3; k++) { const bx = x0 + w * (0.25 + k * 0.25); c.beginPath(); c.moveTo(bx, y); c.lineTo(bx + (k - 1) * 6, y - 12 - k * 3); c.stroke(); }
      } else { // Basaltplatte / Betonkante
        c.fillStyle = S.plat; rr(c, x0, y, w, h, 5); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = S.edge; c.globalAlpha = 0.85; rr(c, x0 + 4, y + h - 5, w - 8, 3, 2); c.fill(); c.globalAlpha = 1;
      }
      return true;
    }
    if (o.t === "plat" && o.block) {
      const x0 = x - o.w / 2, w = o.w, h = G - y;
      if (ar === "backrooms") { // Stück Wand mit Fußleiste
        c.fillStyle = lin(c, y, G, [[0, "#dcc96f"], [1, "#bfa94f"]]); c.fillRect(x0, y, w, h + 4); c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(x0, y, w, h + 4);
        for (let k = 1; k < w / 14; k++) { c.fillStyle = k % 2 ? "rgba(150,130,50,.14)" : "rgba(255,245,190,.08)"; c.fillRect(x0 + k * 14, y + 2, 7, h - 12); }
        c.fillStyle = "#8f7f38"; c.fillRect(x0, G - 12, w, 12);
      } else if (ar === "tiefsee") { // Fels mit Seetang
        c.fillStyle = lin(c, y, G, [[0, "#7d8b8f"], [1, "#4b5a62"]]);
        c.beginPath(); c.moveTo(x0 - 6, G + 2); c.quadraticCurveTo(x0 - 4, y + 6, x0 + w * 0.3, y); c.quadraticCurveTo(x0 + w * 0.6, y - 6, x0 + w * 0.85, y + 4); c.quadraticCurveTo(x0 + w + 6, y + 14, x0 + w + 6, G + 2); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = "rgba(255,255,255,.14)"; c.beginPath(); c.ellipse(x0 + w * 0.35, y + 14, w * 0.18, 5, -0.2, 0, TAU); c.fill();
        c.strokeStyle = "#3ddc84"; c.lineWidth = 4; c.lineCap = "round"; for (let k = 0; k < 3; k++) { const bx = x0 + w * (0.2 + k * 0.3); c.beginPath(); c.moveTo(bx, y + 4); c.quadraticCurveTo(bx + Math.sin(t * 1.5 + k) * 10, y - 14, bx + Math.sin(t * 1.5 + k + 1) * 6, y - 30); c.stroke(); }
      } else if (ar === "vulkan") { // Lavafels: kantig, mit glühenden Adern
        const rock = () => { c.beginPath(); c.moveTo(x0 - 6, G + 2); c.lineTo(x0 + 2, y + 10); c.lineTo(x0 + w * 0.28, y - 2); c.lineTo(x0 + w * 0.62, y + 3); c.lineTo(x0 + w - 2, y + 8); c.lineTo(x0 + w + 6, G + 2); c.closePath(); };
        rock(); c.fillStyle = lin(c, y, G, [[0, "#5a3a32"], [1, "#2a1612"]]); c.fill();
        c.save(); rock(); c.clip();
        c.fillStyle = "rgba(255,255,255,.08)"; c.beginPath(); c.moveTo(x0 + 2, y + 10); c.lineTo(x0 + w * 0.28, y - 2); c.lineTo(x0 + w * 0.36, y + h * 0.5); c.lineTo(x0 + 4, y + h * 0.6); c.fill();
        c.shadowColor = "#ff5a14"; c.shadowBlur = 8; c.strokeStyle = "#ff8a2a"; c.lineWidth = 3; c.lineJoin = "round";
        c.beginPath(); c.moveTo(x0 + w * 0.3, y + 2); c.lineTo(x0 + w * 0.42, y + h * 0.35); c.lineTo(x0 + w * 0.34, y + h * 0.7); c.lineTo(x0 + w * 0.46, G + 2); c.moveTo(x0 + w * 0.42, y + h * 0.35); c.lineTo(x0 + w * 0.7, y + h * 0.5); c.stroke();
        c.shadowBlur = 0; c.restore();
        rock(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
      } else {
        c.fillStyle = lin(c, y, G, [[0, "#b3b9c2"], [1, S.block]]); rr(c, x0, y, w, h + 6, 10); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        if (ar === "skate") { c.strokeStyle = "#f2f5fa"; c.lineWidth = 5; c.beginPath(); c.moveTo(x0 + 4, y + 2); c.lineTo(x0 + w - 4, y + 2); c.stroke(); }
      }
      return true;
    }
    if (o.t === "bump") {
      const r = o.r, flash = Math.max(0, Math.min(1, 1 - (t - (o.hitT || -9)) / 0.25)), R2 = r * (1 + 0.12 * flash);
      if (ar === "tiefsee") { // Qualle
        c.strokeStyle = "rgba(255,170,230,.8)"; c.lineWidth = 3; c.lineCap = "round";
        for (let k = 0; k < 5; k++) { const bx = x - R2 * 0.6 + k * R2 * 0.3; c.beginPath(); c.moveTo(bx, y + R2 * 0.3); c.quadraticCurveTo(bx + Math.sin(t * 3 + k) * 8, y + R2 * 0.9, bx + Math.sin(t * 3 + k + 1) * 5, y + R2 * 1.5); c.stroke(); }
        c.fillStyle = flash > 0 ? "#ffe3f6" : "rgba(255,122,217,.85)"; c.beginPath(); c.arc(x, y + R2 * 0.3, R2, Math.PI, TAU); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.ellipse(x - R2 * 0.3, y - R2 * 0.25, R2 * 0.25, R2 * 0.14, -0.4, 0, TAU); c.fill();
      } else if (ar === "vulkan") { // Magmakugel
        const g = c.createRadialGradient(x - R2 * 0.3, y - R2 * 0.3, 2, x, y, R2); g.addColorStop(0, "#fff0a0"); g.addColorStop(0.45, "#ff9a2a"); g.addColorStop(1, "#c2340f");
        c.fillStyle = g; c.beginPath(); c.arc(x, y, R2, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = "rgba(40,10,5,.55)"; [[-0.3, 0.3, 0.22], [0.35, -0.1, 0.18], [0.1, 0.45, 0.14]].forEach(([dx, dy, s]) => { c.beginPath(); c.arc(x + dx * R2, y + dy * R2, s * R2, 0, TAU); c.fill(); });
      } else return false;
      if (flash > 0) { c.globalAlpha = flash * 0.6; c.strokeStyle = "#fff"; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r + 10 + 14 * (1 - flash), 0, TAU); c.stroke(); c.globalAlpha = 1; }
      return true;
    }
    return false;
  }

  /** Bewegte Umgebung (nur bei hoher Qualität): Glut, Blasen, flackerndes Licht */
  function weather(c, ar, t) {
    if (ar === "vulkan") {
      for (let i = 0; i < 46; i++) {
        const sx = (i * 137.5) % 1, sp = 40 + (i % 7) * 14, ph = ((i * 71.3) % 1);
        const x = -200 + sx * (W + 400) + Math.sin(t * 1.3 + i) * 20, y = 700 - ((ph * 760 + t * sp) % 760);
        c.fillStyle = `rgba(255,${140 + (i % 5) * 20},60,${0.35 + 0.4 * Math.abs(Math.sin(t * 3 + i))})`; c.fillRect(x, y, 3, 3);
      }
      return true;
    }
    if (ar === "tiefsee") {
      c.strokeStyle = "rgba(220,250,255,.45)"; c.lineWidth = 1.5;
      for (let i = 0; i < 34; i++) {
        const sx = (i * 137.5) % 1, sp = 30 + (i % 6) * 12, ph = (i * 71.3) % 1;
        const x = -200 + sx * (W + 400) + Math.sin(t * 1.1 + i) * 14, y = 680 - ((ph * 740 + t * sp) % 740), r = 2 + (i % 4);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
      }
      return true;
    }
    if (ar === "backrooms") {
      // Brummendes Licht: selten ein kurzes Flackern, nie richtig dunkel
      const f = Math.sin(t * 1.7) * Math.sin(t * 5.3 + 1) * Math.sin(t * 0.37);
      if (f > 0.55) { c.fillStyle = `rgba(30,25,5,${Math.min(0.08, (f - 0.55) * 0.3)})`; c.fillRect(-900, -200, W + 1800, 1100); }
      return true;
    }
    return false;
  }

  return { bg: { vulkan, skate, tiefsee, backrooms }, style: STYLE, draw, weather };
}
