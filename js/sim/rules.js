// Spielregeln: Standardwerte, Spiellänge und abgeleitete Faktoren (Gewicht, Schusskraft, Schwerkraft, Tempo-Limit)
import { BR, arenaById } from "../config.js";
import { BG, KICK } from "./tuning.js";

// Eigene Regeln (für Spiele gegen Freunde). Alle Werte optional.
export const DEFAULT_RULES = { kick: 1, bounce: 1, ball: 1, goal: 1, speed: 1, len: 90, field: 1, obs: "off", grav: 1, floor: "normal", pu: "normal", supers: true, weight: "normal", head: 1, win: 0 };

// "len": Zahl = Spielzeit in Sekunden, "w3"/"w5" = Erster bis N Tore
export function matchLen(r) { const l = (r && r.len) ?? 90; if (typeof l === "string" && l[0] === "w") return { dur: 120, win: +l.slice(1) }; return { dur: +l || 90, win: (r && r.win) || 0 }; }

export const WEIGHT = { light: { bounce: 0.18, grav: 0.78, kick: 1.12, drag: 0.7 }, normal: { bounce: 0, grav: 1, kick: 1, drag: 1 }, heavy: { bounce: -0.22, grav: 1.25, kick: 0.86, drag: 1.4 } };

export const wgt = st => WEIGHT[st.rules.weight] || WEIGHT.normal;

export const kickMul = st => wgt(st).kick * (st.rules.kick || 1);

export const ballG = st => BG() * gMul(st);

export const baseBR = st => BR * st.rules.ball * (st.mod === "bigball" ? 1.55 : 1);

export const gMul = st => arenaById(st.arena).g * (st.mod === "lowgrav" ? 0.55 : 1) * st.rules.grav;

// Ball
export function maxBall(st) { return KICK.cap * arenaById(st.arena).maxB * (st.mod === "turbo" ? 1.15 : 1) * Math.max(1, st.rules.speed) * Math.max(1, st.rules.kick || 1); }
