// Speicherstand: Münzen, Level, Freischaltungen, Statistik, Erfolge
import { CHARS, ARENAS, BALLS, ACHIEVEMENTS } from "./config.js";

const KEY = "kopfball-duell-save-v2";
const def = () => ({
  coins: 150, xp: 0, level: 1, earned: 0,
  chars: ["kalle", "yuki", "bolt"], arenas: ["stadion", "strand"], balls: ["klassik"],
  char: "kalle", ball: "klassik", arena: "stadion",
  name: "", diff: 1, dur: 90, pus: true, chaos: false,
  sfx: true, music: true, vib: true, quality: "high",
  stats: { games: 0, wins: 0, goals: 0, headGoals: 0, pus: 0, stomps: 0, supers: 0 },
  ach: {}, daily: { last: "", streak: 0 }, tutorial: false, cupBest: 0, seenNew: [],
});
export let S = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); const b = def(); return { ...b, ...d, stats: { ...b.stats, ...(d.stats || {}) }, daily: { ...b.daily, ...(d.daily || {}) } }; } } catch (_) {}
  return def();
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }
export function reset() { S = def(); save(); }

export const xpFor = lvl => 120 + (lvl - 1) * 60;
export function addXP(n) {
  S.xp += n; const ups = [];
  while (S.xp >= xpFor(S.level)) { S.xp -= xpFor(S.level); S.level++; ups.push(S.level); }
  return ups;
}
export function addCoins(n) { S.coins += n; if (n > 0) S.earned += n; }
export function owns(kind, id) { return S[kind].includes(id); }
export function buy(kind, id, price) {
  if (owns(kind, id) || S.coins < price) return false;
  S.coins -= price; S[kind].push(id); save(); return true;
}

// Tagesbelohnung
export function dailyCheck() {
  const today = new Date().toISOString().slice(0, 10);
  if (S.daily.last === today) return null;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  S.daily.streak = S.daily.last === y ? Math.min(7, S.daily.streak + 1) : 1;
  S.daily.last = today;
  const amount = 40 + S.daily.streak * 30;
  addCoins(amount); save();
  return { amount, streak: S.daily.streak };
}

// Erfolge prüfen; ctx enthält die Fakten des Spiels
export function checkAch(ctx) {
  const got = [];
  const give = id => { if (!S.ach[id]) { S.ach[id] = Date.now(); const a = ACHIEVEMENTS.find(x => x.id === id); addCoins(a.reward); got.push(a); } };
  if (ctx.win) give("firstwin");
  if (ctx.myGoals >= 3) give("hattrick");
  if (ctx.win && ctx.conceded === 0) give("cleansheet");
  if (ctx.superGoals > 0) give("supergoal");
  if (ctx.lastSec > 0) give("lastsec");
  if (ctx.longGoals > 0) give("longshot");
  if (ctx.win && ctx.maxDeficit >= 2) give("comeback");
  if (ctx.cupWon) give("cup");
  if (ctx.win && ctx.diff === 3 && ctx.mode === "cpu") give("legend");
  if (ctx.win && ctx.mode === "online") give("online");
  if (S.chars.length >= 6) give("collector");
  ACHIEVEMENTS.filter(a => a.stat).forEach(a => { if ((S.stats[a.stat] || 0) >= a.goal) give(a.id); });
  save();
  return got;
}
export function achProgress(a) { if (S.ach[a.id]) return 1; if (a.stat) return Math.min(1, (S.stats[a.stat] || 0) / a.goal); return 0; }
export { CHARS, ARENAS, BALLS };
