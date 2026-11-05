// Feintuning an einer Stelle: Bewegung (MOVE), Schuss (KICK), Luftzeit (AIR)
import { clamp } from "../config.js";

// Bewegungs-Feintuning an einer Stelle
export const MOVE = {
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

// Ball-Tempo beim Schuss: Feintuning an einer Stelle (Varianten werden per Simulation verglichen)
export const KICK = {
  carry: 0.4,         // Anteil des Ankunftstempos, den ein Schuss mitnimmt (Tempo stapelt sich)
  carryMode: "add",   // "add" = oben drauf, "max" = mindestens so schnell wie angekommen, "none" = altes Verhalten
  memDecay: 8,        // wie schnell das Tempo-Gedächtnis (Tempo vor dem Abprall) verblasst
  memClassify: true,  // Lupfer/Strahl nach Tempo vor dem Abprall statt nach dem gebremsten Tempo
  lobSpeed: 300,      // darunter gilt ein Ball am Boden als ruhig
  hsMode: "none",     // Standbild: "all" = jeder saubere Treffer, "hard" = nur sehr harte, "none"
  softCap: true,      // Tempo weich an die Obergrenze heranführen statt hart abschneiden
  driveVy: 430, driveCharge: 320,
  tap: 1350,          // Grundtempo eines sauberen Tipp-Schusses
  chargeAdd: 1100,    // so viel bringt volles Aufladen zusätzlich
  cap: 2700,          // Obergrenze fürs Balltempo (vorher 1900)
  swing: 0.18,        // Dauer der Schussbewegung (vorher 0.24)
  hitFrom: 0,         // Treffer zählt ab dem Moment des Loslassens (vorher erst nach 0.06 s)
  power: 1750,        // ab diesem Tempo gilt ein Schuss als Hammer (Effekte, kurzes Standbild)
  rollFric: 14,       // Rollreibung am Boden (x (1 - Arena-Roll) pro Sekunde)
};

// Luftzeit: tp (Spieler) und tb (Ball) strecken alles Vertikale zeitlich. Gleiche Höhen, nur langsamer in der Luft.
// Schwerkraft / tau², Absprung- und Abprall-Tempo / tau. Waagrechtes Tempo (Laufen, Schusskraft) bleibt unberührt.
// Per Simulation gewählt: Ball 1.25 bringt am meisten Reaktionszeit, Spieler 1.15 ein größeres Timing-Fenster beim Kopfball,
// ohne dass man spürbar früher abspringen muss (ab 1.2 steigt man so langsam, dass man zu spät oben ist).
export const AIR = { tp: 1.15, tb: 1.25 };

export const PG = () => 3000 / (AIR.tp * AIR.tp), BG = () => 1750 / (AIR.tb * AIR.tb);

export const pv = v => v / AIR.tp, bv = v => v / AIR.tb;

export const bombPow = p => clamp((p.y - p.bombY) / MOVE.bombFull, 0.25, 1);
