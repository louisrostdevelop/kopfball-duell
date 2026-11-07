// Hindernis-Layouts je Arena. Alles ist spiegelbildlich: Ein Teil mit dx > 0 bekommt automatisch sein Gegenstück bei -dx.
// dx = Abstand zur Feldmitte (bei Normalgröße), y = Höhe in Weltkoordinaten (Boden = 640, Latte ≈ 435).
// Bauteile:
//   plat:  Plattform. Hoch (Unterkante < ~340) = nur für den Ball. Tief (Oberkante ≥ 480) = fester Block bis zum Boden, auf den man springt
//          (schwebende niedrige Stufen gehen nicht: der Ball rollt drunter und keiner kommt ran).
//   bump:  runder Bumper, schleudert den Ball zurück (k = Verstärkung).
//   mv:    Bewegung. { ax, ay, per, ph } = hin und her / auf und ab, { orbit: R, per, ph } = Kreisbahn um (dx, y).
//   ramp:  Rampe auf dem Boden (Skatepark): h = Höhe, top = flache Oberseite, inR / outR = Anlauf zur Mitte / zum Tor hin
//          (nie steiler als 45°: Anlauf ≥ Höhe). Ball rollt hoch und hebt ab, Spieler laufen drüber.
//   geyser: Geysir im Boden (Vulkan): w = Breite, top = Höhe der Fontäne, per = Takt, on = Dauer des Ausbruchs, ph = Versatz.
//          Kündigt sich 1,2 s vorher an. Schießt Ball und Spieler nach oben.
//   bubbles: Blasensäule (Unterwasser): w = Breite, top = Höhe, sprudelt im Takt (per, on, ph); hebt den Ball langsam an,
//          Spieler springen darin höher.
//   portal: Noclip-Tür (Backrooms): y = Oberkante, h = Höhe, w = Breite. Fliegt der Ball Richtung Tor durch die Tür, kommt
//          er aus der gespiegelten Tür auf der anderen Seite mit gleichem Tempo wieder raus (Richtung Mitte und Spieler: durch).
// Regeln fürs Design (geprüft in tests/sim/layouts.test.mjs, gemessen mit tools/balance/arenas.mjs):
//   - nichts höher als y 230, auch nicht in der Bewegung: auf dem Handy liegt darüber die Anzeige oder der Bildrand
//   - Torraum frei (|dx| ≤ 520), über dem Anstoßpunkt (Mitte, y 200-360) nichts, Startplätze (dx ±330) ohne Block
//   - über Blöcken und ihrem Anlauf keine Plattform (sonst stößt man beim Hochspringen an und kommt nie drauf)
//   - Spielspaß (Computer gegen Computer, Vergleich mit freiem Feld): Zufallstore möglichst unter 25 %, Ballkontakte
//     nicht unter 85 %
import { W, W0, G, GOAL_W } from "./config.js";
import { t as tr } from "./i18n.js";
import { dcos, dsin } from "./dmath.js";

export const LAYOUTS = {
  stadion: [
    { items: [{ t: "plat", dx: 300, y: 340, w: 170 }] },
    { items: [{ t: "plat", dx: 440, y: 300, w: 120 }] },
    { items: [{ t: "plat", dx: 0, y: 575, w: 170 }] },
  ],
  strand: [
    { items: [{ t: "plat", dx: 300, y: 340, w: 200, mv: { ay: 30, per: 6, ph: 0 } }] },
    { items: [{ t: "plat", dx: 260, y: 310, w: 160, mv: { ax: 90, per: 6, ph: 0 } }] },
    { items: [{ t: "bump", dx: 280, y: 340, r: 34, k: 1 }, { t: "bump", dx: 120, y: 290, r: 26, k: 0.9 }] },
  ],
  neon: [
    { items: [{ t: "bump", dx: 230, y: 330, r: 30, k: 1.18 }, { t: "bump", dx: 430, y: 290, r: 26, k: 1.1 }] },
    { items: [{ t: "plat", dx: 360, y: 298, w: 150 }] },
    { items: [{ t: "plat", dx: 320, y: 330, w: 140, mv: { ay: 40, per: 5, ph: 0 } }] },
  ],
  eis: [
    { items: [{ t: "plat", dx: 300, y: 300, w: 160, slick: true }] },
    { items: [{ t: "plat", dx: 250, y: 290, w: 120, icicle: true }] },
    { items: [{ t: "plat", dx: 0, y: 570, w: 220, slick: true }] },
  ],
  mond: [
    { items: [{ t: "bump", dx: 300, y: 380, r: 32, k: 0.8 }] },
    { items: [{ t: "plat", dx: 170, y: 560, w: 120 }] },
    { items: [{ t: "bump", dx: 300, y: 340, r: 26, k: 0.9, mv: { orbit: 80, per: 8, ph: 0 } }] },
  ],
  vulkan: [
    { items: [{ t: "geyser", dx: 200, w: 70, top: 260, per: 6, on: 0.8, ph: 3 }] },
    { items: [{ t: "plat", dx: 180, y: 575, w: 100 }, { t: "geyser", dx: 430, w: 60, top: 280, per: 7, on: 0.8, ph: 1.5 }] },
    { items: [{ t: "bump", dx: 320, y: 360, r: 28, k: 0.95 }, { t: "geyser", dx: 0, w: 80, top: 240, per: 8, on: 0.9, ph: 4 }] },
  ],
  skate: [
    { items: [{ t: "ramp", dx: 0, h: 60, top: 140, inR: 80, outR: 80 }] },
    { items: [{ t: "ramp", dx: 200, h: 60, top: 0, inR: 120, outR: 60 }] },
    { items: [{ t: "ramp", dx: 150, h: 40, top: 40, inR: 50, outR: 50 }, { t: "ramp", dx: 450, h: 50, top: 0, inR: 60, outR: 60 }] },
  ],
  tiefsee: [
    { items: [{ t: "bubbles", dx: 250, w: 90, top: 250, per: 4.5, on: 2.6, ph: 0 }] },
    { items: [{ t: "bump", dx: 280, y: 360, r: 28, k: 0.7, mv: { ay: 35, per: 6, ph: 0 } }] },
    { items: [{ t: "plat", dx: 160, y: 560, w: 110 }, { t: "bubbles", dx: 420, w: 80, top: 280, per: 5, on: 2.8, ph: 2 }] },
  ],
  backrooms: [
    { items: [{ t: "portal", dx: 240, y: 520, h: 120, w: 46 }] },
    { items: [{ t: "plat", dx: 300, y: 300, w: 170 }] },
    { items: [{ t: "portal", dx: 420, y: 300, h: 110, w: 46 }, { t: "plat", dx: 220, y: 330, w: 130 }] },
  ],
};
// Namen und Beschreibungen aus den Sprachdateien (layout.<arena>.<nr>.name/desc)
for (const [ar, list] of Object.entries(LAYOUTS)) list.forEach((l, i) => {
  for (const f of ["name", "desc"]) Object.defineProperty(l, f, { enumerable: true, get: () => tr(`layout.${ar}.${i}.${f}`) });
});
export const layoutsFor = arena => LAYOUTS[arena] || [];

// Baut die Hindernisse für ein Spiel (Weltkoordinaten), passend zur aktuellen Feldbreite.
export function buildObstacles(arena, idx) {
  const list = layoutsFor(arena)[idx];
  if (!list) return [];
  const sx = (W - 2 * GOAL_W - 240) / (W0 - 2 * GOAL_W - 240); // Abstände mit der Feldbreite skalieren
  const out = [];
  const add = (it, sign) => {
    const o = { t: it.t, cx: W / 2 + sign * it.dx * sx, cy: it.y ?? G, w: it.w || 0, h: it.h || (it.y >= 480 ? G - it.y : 18), block: it.t === "plat" && it.y >= 480, r: it.r || 0, k: it.k || 1, slick: !!it.slick, icicle: !!it.icicle, mv: null, sign };
    if (it.t === "ramp") { o.h = it.h; o.top = it.top || 0; o.L = sign > 0 ? it.inR : it.outR; o.R = sign > 0 ? it.outR : it.inR; o.w = o.top + o.L + o.R; o.cy = G - it.h; }
    if (it.t === "geyser" || it.t === "bubbles") { o.top = it.top; o.cy = G; o.per = it.per || 6; o.on = it.on || 0.8; o.ph = it.ph || 0; }
    if (it.t === "portal") { o.h = it.h || 120; o.w = it.w || 46; }
    if (it.mv) o.mv = { ...it.mv, ax: (it.mv.ax || 0) * sign * sx, orbit: (it.mv.orbit || 0) * sx };
    o.x = o.cx; o.y = o.cy; o.vx = 0; o.vy = 0;
    out.push(o);
  };
  for (const it of list.items) {
    if (it.twin) { add(it, 1); add(it, -1); }       // Kreisbahn: zwei gespiegelte Monde
    else if (it.dx === 0) add(it, 1);
    else { add(it, 1); add(it, -1); }
  }
  // Noclip-Türen: jede führt zu ihrem Spiegelbild
  out.forEach((o, i) => { if (o.t === "portal") o.to = out.findIndex((q, j) => j !== i && q.t === "portal" && Math.abs(q.cx + o.cx - W) < 1 && q.cy === o.cy); });
  return out;
}

/** Rampe: Höhe der Oberfläche bei x (null = nicht über der Rampe) */
export function rampY(o, x) {
  const a = o.x - o.top / 2, b = o.x + o.top / 2, x0 = a - o.L, x1 = b + o.R;
  if (x <= x0 || x >= x1) return null;
  if (x < a) return G - o.h * (x - x0) / o.L;
  if (x > b) return G - o.h * (x1 - x) / o.R;
  return G - o.h;
}
/** Geysir zur Zeit t: Phase im Takt, Ausbruch läuft, kündigt sich an (letzte 1,2 s vor dem Ausbruch) */
export function geyserState(o, t) {
  const ph = (((t + o.ph) % o.per) + o.per) % o.per;
  return { ph, active: ph < o.on, warn: ph > o.per - 1.2, k: ph < o.on ? ph / o.on : 0 };
}

// Position zur Spielzeit t (deterministisch, damit online beide Seiten dasselbe sehen)
export function moveObstacles(obs, t, _dt) {
  for (const o of obs) {
    if (!o.mv) continue;
    const m = o.mv, w = 2 * Math.PI / m.per, a = w * t + (m.ph || 0);
    if (m.orbit) {
      o.x = o.cx + o.sign * m.orbit * dcos(a); o.y = o.cy + m.orbit * 0.45 * dsin(a);
      o.vx = -o.sign * m.orbit * w * dsin(a); o.vy = m.orbit * 0.45 * w * dcos(a);
    } else {
      o.x = o.cx + (m.ax || 0) * dsin(a); o.y = o.cy + (m.ay || 0) * dsin(a);
      o.vx = (m.ax || 0) * w * dcos(a); o.vy = (m.ay || 0) * w * dcos(a);
    }
  }
}
