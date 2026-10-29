// Speicherstand: Münzen, Level, Freischaltungen, Statistik, Erfolge
import { CHARS, ARENAS, BALLS, ACHIEVEMENTS, RULE_PRESETS, DIFFS } from "./config.js";

const KEY = "kopfball-duell-save-v2";
const def = () => ({
  coins: 150, xp: 0, level: 1, earned: 0,
  chars: ["kalle", "yuki", "bolt"], arenas: ["stadion", "strand"], balls: ["klassik"],
  char: "kalle", ball: "klassik", arena: "stadion",
  name: "", diff: 1, dur: 90, pus: true, chaos: false,
  sfx: true, music: true, vib: true, quality: "high",
  stats: { games: 0, wins: 0, goals: 0, headGoals: 0, pus: 0, stomps: 0, supers: 0 },
  ach: {}, daily: { last: "", streak: 0 }, tutorial: false, cupBest: 0, seenNew: [], tasks: null, iosHint: false, mode: "quick", rules: {}, chDone: "", endlessBest: 0, dealBought: "",
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

// ---------- Tagesaufgaben ----------
const TASKS = [
  { id: "wins", text: n => `Gewinne ${n} Spiele`, n: [2, 3], reward: 80 },
  { id: "goals", text: n => `Schieß ${n} Tore`, n: [5, 8], reward: 60 },
  { id: "headGoals", text: n => `Erziele ${n} Kopfballtore`, n: [2, 3], reward: 80 },
  { id: "supers", text: n => `Setz ${n}-mal deinen Super ein`, n: [3, 5], reward: 60 },
  { id: "pus", text: n => `Sammle ${n} Power-ups`, n: [3, 5], reward: 60 },
  { id: "stomps", text: n => `Spring ${n}-mal auf einen Gegnerkopf`, n: [2, 3], reward: 70 },
  { id: "online", text: () => "Spiel ein Online-Spiel", n: [1], reward: 90 },
  { id: "hard", text: () => "Gewinn gegen Schwer oder Legende", n: [1], reward: 100 },
  { id: "cupRound", text: n => `Gewinn ${n} Cup-Spiele`, n: [2], reward: 80 },
];
function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
export function tasks() {
  const today = new Date().toISOString().slice(0, 10);
  if (!S.tasks || S.tasks.date !== today) {
    const r = seeded(today), pool = [...TASKS], list = [];
    while (list.length < 3) { const t = pool.splice(Math.floor(r() * pool.length), 1)[0]; const n = t.n[Math.floor(r() * t.n.length)]; list.push({ id: t.id, n, prog: 0, done: false, reward: t.reward }); }
    S.tasks = { date: today, list }; save();
  }
  return S.tasks.list.map(t => ({ ...t, text: TASKS.find(x => x.id === t.id).text(t.n) }));
}
// inc: { wins, goals, ... } -> gibt neu erledigte Aufgaben zurück
export function taskProgress(inc) {
  tasks();
  const done = [];
  S.tasks.list.forEach(t => {
    if (t.done || !inc[t.id]) return;
    t.prog = Math.min(t.n, t.prog + inc[t.id]);
    if (t.prog >= t.n) { t.done = true; addCoins(t.reward); done.push({ ...t, text: TASKS.find(x => x.id === t.id).text(t.n) }); }
  });
  save();
  return done;
}

// ---------- Tages-Challenge ----------
const today = () => new Date().toISOString().slice(0, 10);
export function challenge() {
  const d = today(), r = seeded("ch" + d);
  const pick = a => a[Math.floor(r() * a.length)];
  const presets = RULE_PRESETS.filter(p => p.id !== "std");
  const pre = pick(presets);
  const opp = pick(CHARS).id, arena = pick(ARENAS).id;
  const diff = r() < 0.5 ? 2 : r() < 0.7 ? 1 : 3;
  return { date: d, opp, arena, diff, preset: pre.id, presetName: pre.name, rules: { ...pre.rules, win: r() < 0.5 ? 3 : 0 }, dur: 60, reward: 150 + (diff === 3 ? 100 : 0), done: S.chDone === d };
}
export function challengeDone() { S.chDone = today(); save(); }

// ---------- Angebot des Tages ----------
export function deal() {
  const d = today(), r = seeded("deal" + d);
  const pool = [...CHARS.filter(c => c.price && !S.chars.includes(c.id)).map(c => ({ kind: "chars", it: c })), ...BALLS.filter(b => b.price && !S.balls.includes(b.id)).map(b => ({ kind: "balls", it: b }))];
  if (!pool.length || S.dealBought === d) return null;
  const x = pool[Math.floor(r() * pool.length)];
  return { kind: x.kind, id: x.it.id, name: x.it.name, old: x.it.price, price: Math.round(x.it.price * 0.7 / 10) * 10 };
}
export function buyDeal(dl) {
  if (!dl || S.coins < dl.price || owns(dl.kind, dl.id)) return false;
  S.coins -= dl.price; S[dl.kind].push(dl.id); S.dealBought = today(); save(); return true;
}
