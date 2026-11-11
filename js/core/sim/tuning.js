// Feintuning an einer Stelle: Bewegung (MOVE), Schuss (KICK), Luftzeit (AIR)
import { clamp } from "../../content/config.js";

// Bewegungs-Feintuning an einer Stelle
export const MOVE = {
  run: 505,          // Lauftempo (mal Kopf, Arena, Regel „Tempo“)
  coyote: 0.08,      // so lange nach dem Verlassen des Bodens darf man noch springen
  cutMin: 0.06,      // frühestens hier wird ein kurzer Sprung abgebremst
  cut: 0.45,         // Restgeschwindigkeit beim Abbremsen (kurz tippen = halber Sprung)
  apexG: 0.62,       // weniger Schwerkraft am Scheitelpunkt, solange gehalten wird
  apexV: 220,        // ab diesem Steigtempo zählt der Sprung als "am Scheitel"
  fallG: 1.15,       // etwas schneller fallen als steigen
  turn: 1.8,         // Richtungswechsel greift schneller
  stopG: 1.2,        // ohne Eingabe schneller zum Stehen
  bombV: 1750,       // Fallgeschwindigkeit der Arschbombe
  bombMinH: 40,      // Mindesthöhe über dem Boden
  bombFull: 230,     // ab dieser Fallstrecke volle Wucht
  bombRec: 0.1,      // kurzes Abfedern nach der Landung
  slideT: 0.3,       // Dauer der Grätsche
  slideV: 1.6,       // Starttempo relativ zum Laufen
  slideCD: 0.55,     // Pause bis zur nächsten Grätsche
  tripStun: 0.35,    // Gegner stolpert kurz
  tripCD: 1.2,       // so lange kann derselbe Gegner nicht wieder umgegrätscht werden
};

// Balltempo (im Schuss-Spielplatz abgestimmt): Schüsse mal PACE, Schwerkraft des Balls mal PACE² (AIR.tb / PACE).
// Der Ball fliegt dieselben Bahnen mit derselben Reichweite, nur gemächlicher; Laufen, Springen und Supers bleiben gleich.
export const PACE = 0.93;

// Ball: Tempo-Gedächtnis, Schussart, Obergrenze, Rollreibung (der Schuss selbst: SHOE)
export const KICK = {
  memDecay: 8,        // wie schnell das Tempo-Gedächtnis (Tempo vor dem Abprall) verblasst
  lobSpeed: 300,      // darunter gilt ein Ball am Boden als ruhig (Lupfer)
  lobAng: 18,         // ruhiger Ball steiler als das (Grad) = Lupfer; liegt unter dem Abflugwinkel des ruhigen Balls am
                      // Boden (angLow), damit rollende und ruhende Bälle gleich zuverlässig als Lupfer gelten
  cap: 2700 * PACE,   // Obergrenze fürs Balltempo
  power: 1750 * PACE, // ab diesem Tempo gilt ein Schuss als Hammer (Effekte)
  rollFric: 14,       // Rollreibung am Boden (x (1 - Arena-Roll) pro Sekunde)
};

// Schuh (im Spielplatz abgestimmt): Kopf steht auf dem Boden, der Schuh läuft auf einem Kreis um die
// Kopfmitte von unten nach vorne oben. Maße relativ zum Kopf (r) bzw. zum alten Schuh (46 x 22).
export const SHOE = {
  size: 1.25,         // Größe gegenüber dem alten Schuh
  ring: 1.25,         // Abstand der Schuhmitte zur Kopfmitte (r)
  turn: 0.55,         // so stark dreht sich der Schuh mit der Rundung mit (1 = tangential, oben senkrecht)
  rest: 0,            // Ruhestellung (Grad, 0 = genau unter der Kopfmitte)
  top: -0.15,         // höchste Stellung der Schuhmitte gegenüber der Kopfmitte (r, negativ = höher; Augenhöhe)
  tUp: 0.17,          // Zeit nach oben (s); gemächlich genug für ein großes Zeitfenster und mehr Kontrolle
  tDown: 0.12,        // Zeit zurück (s)
  power: 0.75 * PACE, // wie stark der Fuß den Ball mitnimmt (mal Kopf-Wert „Schuss“ und Regel „Schusskraft“)
  grip: 0.35,         // quer zur Berührung nimmt der Ball diesen Anteil der Fußbewegung mit
  minShot: 1000 * PACE, // Leitplanke: Schuss im Schwung nie langsamer (nach vorne); auch schwach getroffen fliegt er noch weit genug
  maxShot: 2300 * PACE, // Leitplanke: nie schneller (zusätzlich zur Ball-Obergrenze)
  eSwing: 0.55,       // Abprall im Schwung
  ePass: 0.45,        // Abprall am gehaltenen bzw. ruhenden Bein (weich)
  buffer: 0.15,       // Druck in den letzten 0,15 s einer Grätsche wird beim Aufstehen ausgeführt
  // Schussrichtung: Abflugwinkel nach Trefferhöhe (Grad nach vorne-oben), der Schuss wird zu diesem Winkel gezogen
  aim: 0.7,           // so stark (0 = rein physikalisch, 1 = immer genau der Winkel). Zusammen mit dem flachen angLow
                      // gehen Schüsse aus mittlerer Distanz nicht zu oft übers Tor; Timing und Treffpunkt bestimmen den
                      // Winkel weiter spürbar mit
  angLow: 22,         // Ball am Boden: flacher Bogen (Grad)
  angMid: 8,          // Ball in Kopfmitte: gerade nach vorne
  angHigh: -10,       // Ball an der Kopfoberkante: leicht nach unten
  angMin: -30,        // Grenzen: nie steiler nach unten ...
  angMax: 60,         // ... oder oben, nie nach hinten
};

// Luftzeit: tp (Spieler) und tb (Ball) strecken alles Vertikale zeitlich. Gleiche Höhen, nur langsamer in der Luft.
// Schwerkraft / tau², Absprung- und Abprall-Tempo / tau. Waagrechtes Tempo (Laufen, Schusskraft) bleibt unberührt.
// Per Simulation gewählt: Ball 1.25 bringt am meisten Reaktionszeit, Spieler 1.15 ein größeres Timing-Fenster beim Kopfball,
// ohne dass man spürbar früher abspringen muss (ab 1.2 steigt man so langsam, dass man zu spät oben ist).
export const AIR = { tp: 1.15, tb: 1.25 / PACE };   // Ball: 1.25, dazu das Balltempo (PACE)

// Power-ups: Werte an einer Stelle, Wirkdauern in config.js (POWERUPS[k].dur)
// Effet: zusätzliche Abwärtsbeschleunigung SPIN_K * Balltempo (Topspin); so gewählt, dass ein 45°-Schuss mit 1600 am
// Boden spürbar kürzer fliegt (geprüft in tests/sim/powerups.test.mjs)
export const SPIN_K = 0.3;
export const PU = {
  spinK: SPIN_K,      // Effet: Stärke des Topspins (Spiel und Bot lesen hier)
  spinN: 3,           // Effet: so viele Schüsse
  miniPow: 0.65, miniRun: 0.9,                  // Mini-Gegner: Schusskraft, Laufen (Faktoren)
  warn: 0.8,          // Ankündigung: so lange vor dem Erscheinen schon sichtbar, nicht einsammelbar (t < 0)
  life: 10,           // Lebensdauer der Kugel (s)
  hs: 0.045,          // Hit-Stop beim Einsammeln
  gold: 10, goldFirst: 5,   // Gold: das 5. Erscheinen, danach jedes 10. (mitten im Spiel, nicht erst am Ende)
  koClear: 80,        // Anstoß: Kugeln in der Fall-Säule des Balls (Einsammel-Abstand plus so viel) verschwinden
  maxOwn: 3,          // höchstens so viele zeitlich begrenzte eigene Wirkungen je Spieler
  bootSize: 1.6, bootPow: 1.12, bootUp: 1.25,   // Riesenschuh: Kapsel, Schuss, Schwung nach oben langsamer
  headPow: 1.4, headSize: 1.5,   // Riesenkopf: Kopfball-Wucht, Größe (Faktoren)
  wingRun: 1.2, wingJump: 1.1,                  // Flügelschuhe
  wallHard: 1200, wallHp: 2,                    // Torwand: harter Treffer ab diesem Balltempo, so viele hält sie
  cloneHard: 600, cloneHp: 2,                   // Doppelgänger: Aufprall ab diesem Tempo zählt, so viele hält er
  hitGap: 0.06,       // Torwand/Doppelgänger: Treffer zählt nur, wenn kein Spieler den Ball so kurz davor berührt hat (s;
                      // Klemme: Kopf-Pingpong an der Wand, auch mit dem langsameren Mini, zählt nicht als Treffer)
  hitCD: 0.3,         // Torwand/Doppelgänger: Sperrzeit zwischen zwei Treffern
  timeK: 0.5,         // Zeitblase: Ball rechnet mit halber Zeit
  floatG: 0.4,        // Schwerelos: Schwerkraft des Balls
  magRel: 1700, magHold: 1, magShot: 2000 * PACE, magRun: 0.8,   // Magnetschuh: Fangen bis Relativtempo, Haltezeit (s), Schuss, Laufen
  magLock: 0.25,      // Magnetschuh: nach dem Lösen fängt so lange keiner den Ball
  iceTap: 0.15,       // Eisblock: jeder neue Tastendruck taut so viel ab
  quakeP: 750, quakeB: 900, quakeStun: 1,       // Erdbeben: Spieler hoch, Ball hoch (px/s), Taumeln (s)
  portalR: 40,        // Portal: so nah muss der Ballmittelpunkt an den Eingang
  portalInH: [110, 210], portalInF: [0.3, 0.24, 0.36, 0.18, 0.42],   // Portal-Eingang: Höhen über dem Boden, Anteile der Feldbreite (Reihenfolge = Vorrang, powerups.js portalSpots)
  wind: 800,          // Rückenwind: Beschleunigung des Balls (px/s²), Spiel (ball.js) und Bot (world.js) lesen beide hier
  goalUp: 120,        // Riesentor: so viel höher liegt die Latte (px; base.js barY, world.js)
};

export const PG = () => 3000 / (AIR.tp * AIR.tp), BG = () => 1750 / (AIR.tb * AIR.tb);

export const pv = v => v / AIR.tp, bv = v => v / AIR.tb;

export const bombPow = p => clamp((p.y - p.bombY) / MOVE.bombFull, 0.25, 1);
