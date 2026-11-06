// Karriere: vier Ligen mit je fünf festen Gegnern. Jeder Sieg schaltet den nächsten frei, die Liga danach
// erst, wenn alle fünf geschlagen sind. Sterne: Sieg, Sieg mit 2 Toren Abstand, Sieg zu null.
// bonus und chest = einmal für die komplette Liga (bucht der Server). set = Regelsatz aus CHALLENGE_SETS, len = Spiellänge (Sekunden oder "w3"/"w5"), obs = Hindernisse ("rnd" = Zufall)
import { localize } from "./i18n.js";

export const CAREER = [
  { id: "district", bonus: { coins: 200, gems: 0 }, chest: "silver", c1: "#7fd17f", c2: "#2f8f3a", games: [
    { ch: "yuki",   diff: 0, arena: "stadion", len: "w3" },
    { ch: "bolt",   diff: 0, arena: "strand",  len: 60 },
    { ch: "rocco",  diff: 1, arena: "stadion", len: "w3", set: "mini" },
    { ch: "nala",   diff: 1, arena: "strand",  len: 60, set: "giants" },
    { ch: "kalle",  diff: 1, arena: "stadion", len: "w5" },
  ] },
  { id: "regional", bonus: { coins: 350, gems: 0 }, chest: "gold", c1: "#6b9bff", c2: "#2348d6", games: [
    { ch: "flummi", diff: 1, arena: "neon",    len: "w3", obs: "rnd" },
    { ch: "tank",   diff: 1, arena: "strand",  len: 90, set: "heavy" },
    { ch: "phantom",diff: 2, arena: "neon",    len: "w3", set: "pure" },
    { ch: "tina",   diff: 2, arena: "eis",     len: 60, set: "ice" },
    { ch: "magnus", diff: 2, arena: "stadion", len: "w5", obs: "rnd" },
  ] },
  { id: "national", bonus: { coins: 500, gems: 10 }, chest: "gold", c1: "#ffd84a", c2: "#e88a00", games: [
    { ch: "max",    diff: 2, arena: "mond",    len: "w3", set: "moon" },
    { ch: "bolt",   diff: 2, arena: "neon",    len: 60, set: "chaos" },
    { ch: "tank",   diff: 2, arena: "eis",     len: "w3", obs: "rnd" },
    { ch: "nala",   diff: 3, arena: "strand",  len: 90, set: "brutal" },
    { ch: "kaiser", diff: 2, arena: "stadion", len: "w5" },
  ] },
  { id: "world", bonus: { coins: 800, gems: 30 }, chest: "legend", c1: "#c8a2ff", c2: "#6a2fd6", games: [
    { ch: "phantom",diff: 3, arena: "mond",    len: "w3", obs: "rnd" },
    { ch: "flummi", diff: 3, arena: "neon",    len: 60, set: "giants" },
    { ch: "magnus", diff: 3, arena: "eis",     len: "w3", set: "heavy" },
    { ch: "max",    diff: 3, arena: "strand",  len: 90, obs: "rnd" },
    { ch: "kaiser", diff: 3, arena: "stadion", len: "w5", set: "pure" },
  ] },
];

localize(CAREER, "career", ["name"]);

/** Sterne für ein Ergebnis aus eigener Sicht: 0 = verloren, 3 = zu null gewonnen */
export const careerStars = (mine, theirs) => mine <= theirs ? 0 : theirs === 0 ? 3 : mine - theirs >= 2 ? 2 : 1;
