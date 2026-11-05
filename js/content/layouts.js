// Hindernis-Layouts je Arena. Alles ist spiegelbildlich: Ein Teil mit dx > 0 bekommt automatisch sein Gegenstück bei -dx.
// dx = Abstand zur Feldmitte (bei Normalgröße), y = Höhe in Weltkoordinaten (Boden = 640, Latte ≈ 435).
// Bauteile:
//   plat:  Plattform. Hoch (Unterkante < ~340) = nur für den Ball. Tief (Oberkante ≥ 480) = fester Block bis zum Boden, auf den man springt
//          (schwebende niedrige Stufen gehen nicht: der Ball rollt drunter und keiner kommt ran).
//   bump:  runder Bumper, schleudert den Ball zurück (k = Verstärkung).
//   mv:    Bewegung. { ax, ay, per, ph } = hin und her / auf und ab, { orbit: R, per, ph } = Kreisbahn um (dx, y).
// Regeln fürs Design: Torraum frei (|dx| ≤ 520), über dem Anstoßpunkt (Mitte, y 200-300) nichts, Startpositionen (dx ±330) frei,
// über Blöcken und ihrem Anlauf keine Plattform (sonst stößt man beim Hochspringen an und kommt nie drauf).
import { W, W0, G, GOAL_W } from "./config.js";

export const LAYOUTS = {
  stadion: [
    { name: "Banden", desc: "Zwei Werbebanden in der Luft lenken hohe Bälle ab.",
      items: [{ t: "plat", dx: 300, y: 318, w: 210 }] },
    { name: "Brücke", desc: "Eine hohe Brücke in der Mitte, Stufen vor den Toren.",
      items: [{ t: "plat", dx: 0, y: 196, w: 340 }, { t: "plat", dx: 470, y: 508, w: 110 }] },
    { name: "Treppe", desc: "Zwei Stufen nach oben: wer oben steht, köpft besser.",
      items: [{ t: "plat", dx: 150, y: 560, w: 100 }, { t: "plat", dx: 430, y: 420, w: 120 }] },
  ],
  strand: [
    { name: "Surfbretter", desc: "Zwei Bretter schaukeln langsam auf und ab.",
      items: [{ t: "plat", dx: 300, y: 350, w: 190, mv: { ay: 42, per: 4, ph: 0 } }] },
    { name: "Welle", desc: "Zwei Bretter gleiten hoch oben auseinander und wieder zusammen.",
      items: [{ t: "plat", dx: 250, y: 182, w: 170, mv: { ax: 110, per: 6, ph: 0 } }] },
    { name: "Wasserbälle", desc: "Drei Wasserbälle als weiche Bumper.",
      items: [{ t: "bump", dx: 280, y: 332, r: 34, k: 1 }, { t: "bump", dx: 0, y: 168, r: 30, k: 1 }] },
  ],
  neon: [
    { name: "Flipper", desc: "Neon-Bumper schießen den Ball extra hart zurück.",
      items: [{ t: "bump", dx: 230, y: 330, r: 30, k: 1.18 }, { t: "bump", dx: 0, y: 176, r: 28, k: 1.18 }] },
    { name: "Laser", desc: "Zwei Laserbalken und ein Bumper ganz oben.",
      items: [{ t: "plat", dx: 360, y: 298, w: 150 }, { t: "bump", dx: 0, y: 180, r: 30, k: 1.18 }] },
    { name: "Aufzug", desc: "Zwei Plattformen fahren rauf und runter. Draufspringen geht.",
      items: [{ t: "plat", dx: 290, y: 400, w: 150, mv: { ay: 52, per: 3.6, ph: 0 } }] },
  ],
  eis: [
    { name: "Schollen", desc: "Zwei Eisschollen als Stufen. Achtung, rutschig.",
      items: [{ t: "plat", dx: 205, y: 512, w: 150, slick: true }] },
    { name: "Eiszapfen", desc: "Eiszapfen hängen von oben und fangen Lupfer ab.",
      items: [{ t: "plat", dx: 250, y: 290, w: 120, icicle: true }, { t: "plat", dx: 0, y: 190, w: 200, icicle: true }] },
    { name: "Gletscher", desc: "Ein Eisberg mitten im Feld. Drüber oder drumherum.",
      items: [{ t: "plat", dx: 0, y: 506, w: 250, slick: true }] },
  ],
  mond: [
    { name: "Asteroiden", desc: "Felsbrocken schweben über dem Feld.",
      items: [{ t: "bump", dx: 300, y: 340, r: 40, k: 0.92 }, { t: "bump", dx: 0, y: 172, r: 30, k: 0.92 }] },
    { name: "Krater", desc: "Kraterränder vor den Toren, ein Fels in der Mitte oben.",
      items: [{ t: "plat", dx: 460, y: 512, w: 140 }, { t: "bump", dx: 0, y: 190, r: 36, k: 0.92 }] },
    { name: "Umlaufbahn", desc: "Zwei Monde ziehen ihre Kreise über dem Feld.",
      items: [{ t: "bump", dx: 280, y: 300, r: 30, k: 1, mv: { orbit: 95, per: 7, ph: 0 } }] },
  ],
};
export const layoutsFor = arena => LAYOUTS[arena] || [];

// Baut die Hindernisse für ein Spiel (Weltkoordinaten), passend zur aktuellen Feldbreite.
export function buildObstacles(arena, idx) {
  const list = layoutsFor(arena)[idx];
  if (!list) return [];
  const sx = (W - 2 * GOAL_W - 240) / (W0 - 2 * GOAL_W - 240); // Abstände mit der Feldbreite skalieren
  const out = [];
  const add = (it, sign) => {
    const o = { t: it.t, cx: W / 2 + sign * it.dx * sx, cy: it.y, w: it.w || 0, h: it.h || (it.y >= 480 ? G - it.y : 18), block: it.y >= 480, r: it.r || 0, k: it.k || 1, slick: !!it.slick, icicle: !!it.icicle, mv: null, sign };
    if (it.mv) o.mv = { ...it.mv, ax: (it.mv.ax || 0) * sign * sx, orbit: (it.mv.orbit || 0) * sx };
    o.x = o.cx; o.y = o.cy; o.vx = 0; o.vy = 0;
    out.push(o);
  };
  for (const it of list.items) {
    if (it.twin) { add(it, 1); add(it, -1); }       // Kreisbahn: zwei gespiegelte Monde
    else if (it.dx === 0) add(it, 1);
    else { add(it, 1); add(it, -1); }
  }
  return out;
}

// Position zur Spielzeit t (deterministisch, damit online beide Seiten dasselbe sehen)
export function moveObstacles(obs, t, _dt) {
  for (const o of obs) {
    if (!o.mv) continue;
    const m = o.mv, w = 2 * Math.PI / m.per, a = w * t + (m.ph || 0);
    if (m.orbit) {
      o.x = o.cx + o.sign * m.orbit * Math.cos(a); o.y = o.cy + m.orbit * 0.45 * Math.sin(a);
      o.vx = -o.sign * m.orbit * w * Math.sin(a); o.vy = m.orbit * 0.45 * w * Math.cos(a);
    } else {
      o.x = o.cx + (m.ax || 0) * Math.sin(a); o.y = o.cy + (m.ay || 0) * Math.sin(a);
      o.vx = (m.ax || 0) * w * Math.cos(a); o.vy = (m.ay || 0) * w * Math.cos(a);
    }
  }
}
