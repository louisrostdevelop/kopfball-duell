// Fortschritt und Wirtschaft als reine Regeln (kein Speicher, kein Browser):
// Standard-Profil, Umzug alter Spielstände, Level-Kurve, Tagesaufgaben, Tages-Challenge, Angebot des Tages.
// Läuft genauso auf einem Server (z. B. in einer Supabase Edge Function), damit Belohnungen dort geprüft werden können.
import { CHARS, ARENAS, BALLS, CHALLENGE_SETS, RULE_KEYS } from "../content/config.js";
import { layoutsFor } from "../content/layouts.js";
import { t as tr } from "../content/i18n.js";

export const PROFILE_VERSION = 2;

export const defaultProfile = () => ({
  coins: 150, xp: 0, level: 1, earned: 0,
  chars: ["kalle", "yuki", "bolt"], arenas: ["stadion", "strand"], balls: ["klassik"],
  char: "kalle", ball: "klassik", arena: "stadion",
  name: "", diff: 1, dur: 90, pus: true, chaos: false,
  sfx: true, music: true, vib: true, quality: "high",
  stats: { games: 0, wins: 0, goals: 0, headGoals: 0, pus: 0, stomps: 0, supers: 0 },
  ach: {}, daily: { last: "", streak: 0 }, tutorial: false, cupBest: 0, seenNew: [], tasks: null, iosHint: false, mode: "quick", rules: {}, myPresets: [], chDone: "", endlessBest: 0, dealBought: "", career: {},
  // Kisten und Kosmetik (docs/PROGRESSION.md): Besitz als volle IDs ("hat:3"), ausgerüstet, ungeöffnete Kisten, Splitter, Garantie-Zähler
  cos: [], equip: { hat: null, shoes: null, goalfx: null, emotes: [null, null, null, null] }, chests: [], shards: 0, pity: {},
});

// Gespeicherte Daten (evtl. aus alter Version) auf das aktuelle Format bringen
export function migrateProfile(d) {
  const b = defaultProfile();
  if (!d) return b;
  const p = { ...b, ...d, stats: { ...b.stats, ...(d.stats || {}) }, daily: { ...b.daily, ...(d.daily || {}) }, equip: { ...b.equip, ...(d.equip || {}) } };
  p.rules = cleanRules(p.rules, p.dur);
  p.myPresets = (p.myPresets || []).map(x => ({ ...x, rules: cleanRules(x.rules) }));
  return p;
}
// alte Regeln (Ballgewicht, Kopfgröße, win, dur) in das neue Format bringen
export function cleanRules(r, dur) {
  const o = {};
  if (r) for (const k of [...RULE_KEYS, "obs"]) if (r[k] !== undefined) o[k] = r[k];
  if (o.len === undefined) { if (r && r.win >= 5) o.len = "w5"; else if (r && r.win) o.len = "w3"; else if (dur && dur !== 90) o.len = dur; }
  return o;
}

export { xpForLevel as xpFor } from "../content/cosmetics.js";   // wächst bis Level 50, dann gleich
export const today = () => new Date().toISOString().slice(0, 10);
export const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
export const dailyBonus = streak => 40 + streak * 30;

// Zufall aus einem Text: alle Spieler bekommen am selben Tag dieselben Aufgaben und dieselbe Challenge
export function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

// ---------- Tagesaufgaben ----------
export const TASKS = [
  { id: "wins", text: n => tr("task.wins", { n }), n: [2, 3], reward: 80 },
  { id: "goals", text: n => tr("task.goals", { n }), n: [5, 8], reward: 60 },
  { id: "headGoals", text: n => tr("task.headGoals", { n }), n: [2, 3], reward: 80 },
  { id: "supers", text: n => tr("task.supers", { n }), n: [3, 5], reward: 60 },
  { id: "pus", text: n => tr("task.pus", { n }), n: [3, 5], reward: 60 },
  { id: "stomps", text: n => tr("task.stomps", { n }), n: [2, 3], reward: 70 },
  { id: "online", text: n => tr("task.online", { n }), n: [1], reward: 90 },
  { id: "hard", text: n => tr("task.hard", { n }), n: [1], reward: 100 },
  { id: "cupRound", text: n => tr("task.cupRound", { n }), n: [2], reward: 80 },
];
export function dailyTaskList(date) {
  const r = seeded(date), pool = [...TASKS], list = [];
  while (list.length < 3) { const t = pool.splice(Math.floor(r() * pool.length), 1)[0]; const n = t.n[Math.floor(r() * t.n.length)]; list.push({ id: t.id, n, prog: 0, done: false, reward: t.reward }); }
  return list;
}
export const taskText = t => TASKS.find(x => x.id === t.id).text(t.n);

// ---------- Tages-Challenge ----------
export function challengeFor(d) {
  const r = seeded("ch" + d);
  const pick = a => a[Math.floor(r() * a.length)];
  const pre = pick(CHALLENGE_SETS);
  const opp = pick(CHARS).id, arena = pick(ARENAS).id;
  const diff = r() < 0.5 ? 2 : r() < 0.7 ? 1 : 3;
  const len = r() < 0.5 ? "w3" : 60, nl = layoutsFor(arena).length, obsI = r() < 0.45 && nl ? Math.floor(r() * nl) : null;
  return { date: d, opp, arena, diff, preset: pre.id, presetName: pre.name + (obsI !== null ? " + " + layoutsFor(arena)[obsI].name : ""), rules: { ...pre.rules, len, ...(obsI !== null ? { obs: obsI } : {}) }, dur: 60, reward: 150 + (diff === 3 ? 100 : 0) };
}

// ---------- Angebot des Tages: 30 % auf etwas, das man noch nicht hat ----------
export function dealFor(d, owned) {
  const r = seeded("deal" + d);
  const pool = [...CHARS.filter(c => c.price && !owned.chars.includes(c.id)).map(c => ({ kind: "chars", it: c })), ...BALLS.filter(b => b.price && !owned.balls.includes(b.id)).map(b => ({ kind: "balls", it: b }))];
  if (!pool.length) return null;
  const x = pool[Math.floor(r() * pool.length)];
  return { kind: x.kind, id: x.it.id, name: x.it.name, old: x.it.price, price: Math.round(x.it.price * 0.7 / 10) * 10 };
}

// ---------- Erfolge: welche sind nach diesem Spiel neu erreicht? ----------
// ctx: Fakten des Spiels, p: Profil (nach dem Spiel). Gibt die IDs zurück, Reihenfolge wie bisher.
export function earnedAchievements(ctx, p, achievements) {
  const ids = [];
  if (ctx.win) ids.push("firstwin");
  if (ctx.myGoals >= 3) ids.push("hattrick");
  if (ctx.win && ctx.conceded === 0) ids.push("cleansheet");
  if (ctx.superGoals > 0) ids.push("supergoal");
  if (ctx.lastSec > 0) ids.push("lastsec");
  if (ctx.longGoals > 0) ids.push("longshot");
  if (ctx.win && ctx.maxDeficit >= 2) ids.push("comeback");
  if (ctx.cupWon) ids.push("cup");
  if (ctx.win && ctx.diff === 3 && ctx.mode === "cpu") ids.push("legend");
  if (ctx.win && ctx.mode === "online") ids.push("online");
  if (p.chars.length >= 6) ids.push("collector");
  achievements.filter(a => a.stat).forEach(a => { if ((p.stats[a.stat] || 0) >= a.goal) ids.push(a.id); });
  return ids;
}
