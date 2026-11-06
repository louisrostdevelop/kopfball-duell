// Fortschritt simulieren, nach den Server-Regeln (docs/BALANCE.md):
//   node tools/balance/progression.mjs [Tage=540] [Läufe=60]
// Nimmt die echten Inhalte (js/content), das echte Kisten-Würfeln (js/core/chests.js), die Server-Einstellungen aus
// supabase/migrations/20261105120000_foundation.sql und die Pass-Vorlage aus supabase/ops/new-season.sql.
// Spielertypen siehe TYPES. Ausgabe: Meilensteine (Median über alle Läufe), Verlauf je Monat, Freischaltungen pro Woche.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const C = await import("../../js/content/config.js");
const K = await import("../../js/content/cosmetics.js");
const E = await import("../../js/core/economy.js");
const { CAREER } = await import("../../js/content/career.js");
const { rollChest } = await import("../../js/core/chests.js");

// ---------- Server-Einstellungen und Pass aus den SQL-Dateien ----------
const CFG = Object.fromEntries([...readFileSync(ROOT + "supabase/migrations/20261105120000_foundation.sql", "utf8").matchAll(/\('([a-z_]+)', '([^']*)'\)/g)].map(([, k, v]) => [k, JSON.parse(v)]));
const PASS = JSON.parse(readFileSync(ROOT + "supabase/ops/new-season.sql", "utf8").match(/'(\[\{"points"[\s\S]*?\])'/)[1]);
const SEASON_DAYS = 28;

// ---------- Spielertypen ----------
// days: aktive Tage pro Woche, m: Spiele pro aktivem Tag, online: Anteil Online-Spiele (ab Level 2 Casual, ab 5 Ranked),
// diff: Schwierigkeit gegen den Computer (vor/nach Tag 21), win: Siegquote gegen den Computer, tasks/weekly: Chance, alle
// Tages-/Wochenaufgaben zu schaffen, skill: echte Ranked-Stärke (MMR), pay: Juwelen pro Monat gekauft, bot: meldet Spiele ohne zu spielen
export const TYPES = {
  gelegentlich: { days: 3, m: 4, online: 0, diff: [1, 1], win: 0.55, tasks: 0.2, weekly: 0.05, challenge: 0.4, skill: 1050, pay: 0 },
  stamm: { days: 5, m: 8, online: 0.25, diff: [1, 2], win: 0.55, tasks: 0.6, weekly: 0.45, challenge: 0.7, skill: 1250, pay: 0 },
  viel: { days: 7, m: 20, online: 0.5, diff: [2, 3], win: 0.55, tasks: 0.95, weekly: 0.9, challenge: 0.9, skill: 1550, pay: 0 },
  zahler: { days: 5, m: 8, online: 0.25, diff: [1, 2], win: 0.55, tasks: 0.6, weekly: 0.45, challenge: 0.7, skill: 1250, pay: 1200 },
  bot: { days: 7, m: 80, online: 0, diff: [3, 3], win: 1, tasks: 1, weekly: 1, challenge: 1, skill: 1000, pay: 0, bot: true },
};

// Stellschrauben zum Ausprobieren (1 = wie im Spiel). Vorlagen in PRESETS, Aufruf: node … [Tage] [Läufe] [Vorlage]
// Der Vorschlag aus docs/BALANCE.md steckt seit 06.11.2026 in Inhalten und Server; "aktuell" rechnet damit.
export const PRESETS = {
  aktuell: {},
  // Vergleich: Splitter nicht in Kopf-XP tauschen
  ohneSplitterXp: { shardXp: false },
};
const BASE = { shardXp: true, headPrice: 1, gemPrice: 1, chestCoins: 1, levelCoins: 1, daily: 1, challengeGems: 5, cosP: 1, headLevelCoins: null, passGems: 500, matchCoins: 1, headXp: 1 };
export let TUNE = { ...BASE };
const COS_P0 = Object.fromEntries(Object.entries(K.CHESTS).map(([k, c]) => [k, c.cos.p]));
export function useTune(t) {
  TUNE = { ...BASE, ...(typeof t === "string" ? PRESETS[t] : t) };
  for (const [k, c] of Object.entries(K.CHESTS)) c.cos.p = Math.min(1, COS_P0[k] * TUNE.cosP);   // rollChest liest CHESTS direkt
}
const headPrice = c => Math.round(c.price * TUNE.headPrice / 25) * 25;
const gemPrice = c => Math.round(C.GEM_PRICE[C.rarityOf(c)] * TUNE.gemPrice / 10) * 10;
const headLevelCoins = () => TUNE.headLevelCoins ?? CFG.head_coins_per_level;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const RANK = { basis: 0, selten: 1, episch: 2, legend: 3 };
const HEADS = C.CHARS.map(c => c.id), HEAD_N = HEADS.length;
const COS_IDS = K.COSMETICS.map(c => c.id), MASTERY_N = K.MASTERY_ITEMS.length / HEAD_N;
const BUYABLE = [...C.BALLS, ...C.ARENAS].filter(x => x.price > 0);

export function simulate(type, days, seed) {
  const T = TYPES[type], r = rng(seed), P = {
    lvl: 1, xp: 0, coins: CFG.start_coins, gems: 0, shards: 0, pity: {}, owned: new Set(CFG.start_items), heads: {},
    stats: { games: 0, wins: 0, goals: 0, headGoals: 0, pus: 0, stomps: 0, supers: 0 }, ach: new Set(), career: {}, careerPaid: new Set(),
    streak: 0, lastActive: -9, pass: { points: 0, free: 0, prem: 0, premium: false }, mmr: CFG.elo_start, rankedGames: 0,
  };
  for (const id of CFG.start_items) if (id.startsWith("head:")) P.heads[id.slice(5)] = { level: 1, xp: 0, games: 0, wins: 0, goals: 0, supers: 0, mastery: 0 };
  const log = [];   // { d, kind } für jede Freischaltung
  const src = {}, spent = {}, headSrc = {};   // Münzen nach Quelle und nach Ausgabe (ganze Laufzeit)
  const inc = (k, n) => { P.coins += n; src[k] = (src[k] || 0) + n; };
  const pay = (k, n) => { P.coins -= n; spent[k] = (spent[k] || 0) + n; };
  const ev = (d, kind) => log.push({ d, kind });
  const ownHead = (d, id, how = "Kiste") => { if (P.heads[id]) return false; P.heads[id] = { level: 1, xp: 0, games: 0, wins: 0, goals: 0, supers: 0, mastery: 0 }; P.owned.add("head:" + id); ev(d, "head"); headSrc[how] = (headSrc[how] || 0) + 1; return true; };
  const give = (d, id) => {
    if (id.startsWith("head:")) return ownHead(d, id.slice(5));
    if (P.owned.has(id)) return false;
    P.owned.add(id); ev(d, id.split(":")[0] === "frame" ? "frame" : id.startsWith("title:") ? "title" : "cos"); return true;
  };
  const openChest = (d, tier, sure = null) => {
    const res = rollChest(tier, { owned: P.owned, heads: Object.fromEntries(Object.entries(P.heads).map(([k, h]) => [k, h.level])), pity: P.pity }, r, sure);
    P.pity = res.pity; inc("Kisten", Math.round(res.coins * TUNE.chestCoins)); P.gems += res.gems; P.shards += res.shards; ev(d, "chest");
    for (const it of res.items) {
      if (!it.dup) give(d, it.id);
      else if (it.headXp) P.heads[it.id.slice(5)].xp += it.headXp;
    }
  };
  const addXp = (d, n) => {
    P.xp += n;
    while (P.xp >= K.xpForLevel(P.lvl)) {
      P.xp -= K.xpForLevel(P.lvl); P.lvl++; ev(d, "level");
      inc("Level-Up", Math.round(K.levelCoins(P.lvl) * TUNE.levelCoins)); if (P.lvl % 5 === 0) P.gems += K.LEVEL_GEMS;
      openChest(d, K.levelChest(P.lvl), K.LEVEL_SURE_HEAD[P.lvl] || null);
    }
  };
  const achieve = (d, ids) => {
    for (const a of C.ACHIEVEMENTS) {
      const hit = ids.includes(a.id) || (a.stat && P.stats[a.stat] >= a.goal);
      if (!hit || P.ach.has(a.id)) continue;
      P.ach.add(a.id); inc("Erfolge", a.reward); ev(d, "ach");
      if (a.chest) openChest(d, a.chest);
      if (a.item) give(d, a.item);
    }
  };
  const mastery = (d, head, won, goals, sup) => {
    const h = P.heads[head]; h.games++; h.wins += won ? 1 : 0; h.goals += goals; h.supers += sup;
    while (h.mastery < K.MASTERY.length) {
      const m = K.MASTERY[h.mastery]; if (h[m.stat] < m.n) break;
      h.mastery++; ev(d, "mastery");
      give(d, K.masteryReward(head, h.mastery));
      if (m.chest) openChest(d, m.chest);
    }
  };
  const passPts = (d, n) => {
    P.pass.points += n;
    while (P.pass.free < PASS.length && P.pass.points >= PASS[P.pass.free].points) { reward(d, PASS[P.pass.free].free); P.pass.free++; ev(d, "pass"); }
    while (P.pass.premium && P.pass.prem < P.pass.free) { reward(d, PASS[P.pass.prem].premium); P.pass.prem++; }
  };
  function reward(d, rw) {
    if (rw.coins) inc("Pass", rw.coins);
    if (rw.gems) P.gems += rw.gems;
    if (rw.chest) openChest(d, rw.chest);
    if (rw.item && !give(d, rw.item)) inc("Pass", 200);
  }
  // Ein Tag Computer-Münzen mit Deckel (wie api.report_cpu_match)
  let capUsed = 0, capMatches = 0, onlineToday = 0;
  const cpuMatch = (d, won, goals, conceded, mode, diff) => {
    const base = mode === "endless" ? (won ? 21 : 6) : (won ? 24 : 7);
    const coins = Math.round((Math.round(base * CFG.diff_mult[diff]) + goals * 5 + (won && conceded === 0 ? 12 : 0)) * TUNE.matchCoins);
    const farmed = capUsed >= CFG.cpu_hard_cap * TUNE.matchCoins || capMatches >= CFG.cpu_daily_matches;
    let got = Math.min(coins, Math.max(0, CFG.cpu_daily_cap * TUNE.matchCoins - capUsed)); got += Math.round((coins - got) * CFG.cpu_after_cap);
    if (farmed) got = 0;
    capUsed += got; capMatches++;
    return { coins: got, farmed };
  };

  const weekTasks = { done: 0 };
  for (let d = 0; d < days; d++) {
    // Saison: alle 28 Tage neu (Pass, Ranked)
    if (d % SEASON_DAYS === 0) {
      if (d > 0 && P.rankedGames >= 5) {
        const m = P.mmr; openChest(d, m >= 1700 ? "legend" : m >= 1250 ? "gold" : m >= 1100 ? "silver" : "bronze");
        give(d, "frame:league-" + (m >= 2000 ? "legend" : m >= 1700 ? "diamond" : m >= 1450 ? "platinum" : m >= 1250 ? "gold" : m >= 1100 ? "silver" : "bronze"));
      }
      P.mmr = CFG.elo_start; P.rankedGames = 0; P.pass = { points: 0, free: 0, prem: 0, premium: false };
      if (T.pay && P.gems >= TUNE.passGems) { P.gems -= TUNE.passGems; P.pass.premium = true; }
      else if (!T.pay && P.gems >= TUNE.passGems && type === "viel") { P.gems -= TUNE.passGems; P.pass.premium = true; }   // Vielspieler kauft den Pass mit Spiel-Juwelen
    }
    if (T.pay && d % 30 === 0) P.gems += T.pay;
    if (d % 7 === 0) weekTasks.done = 0;
    // aktiv heute?
    const active = T.days >= 7 || r() < T.days / 7;
    if (!active) continue;
    capUsed = 0; capMatches = 0; onlineToday = 0;
    P.streak = P.lastActive === d - 1 ? Math.min(7, P.streak + 1) : 1; P.lastActive = d;
    inc("Tagesbonus", Math.round(E.dailyBonus(P.streak) * TUNE.daily));
    const diff = d < 21 ? T.diff[0] : T.diff[1];
    const owned = Object.keys(P.heads);
    const main = owned.reduce((a, b) => (RANK[C.rarityOf(C.charById(b))] >= RANK[C.rarityOf(C.charById(a))] ? b : a));
    for (let k = 0; k < T.m; k++) {
      const head = r() < 0.5 ? main : owned[Math.floor(r() * owned.length)];
      const online = !T.bot && P.lvl >= 2 && r() < T.online;
      // Karriere: nächstes offenes Spiel, wenn es eins gibt (jedes 4. Spiel)
      let stage = null;
      if (!online && !T.bot && k % 4 === 1) { for (const [li, l] of CAREER.entries()) for (const [gi, g] of l.games.entries()) if (!stage && !P.career[l.id + "." + gi] && (gi > 0 ? P.career[l.id + "." + (gi - 1)] : li === 0 || CAREER[li - 1].games.every((_, x) => P.career[CAREER[li - 1].id + "." + x]))) stage = { l, li, gi, g }; }
      const dd = stage ? stage.g.diff : diff;
      const winP = T.bot ? 1 : online ? 1 / (1 + 10 ** ((P.mmr - T.skill) / 400)) : Math.max(0.15, T.win - (dd - diff) * 0.15);
      const won = r() < winP, goals = T.bot ? 6 : won ? 3 + Math.floor(r() * 3) : Math.floor(r() * 3), conceded = T.bot ? 0 : won ? Math.floor(r() * 3) : 3 + Math.floor(r() * 2);
      const sup = T.bot ? 4 : 1 + (r() < 0.5 ? 1 : 0), hg = Math.round(goals * 0.3), pus = T.bot ? 7 : 1, stomps = T.bot ? 9 : 1;
      let farmed = false, coins = 0, xp = 0, hx = 0;
      if (online) {
        onlineToday++;
        if (onlineToday <= CFG.online_daily_rewarded) { coins = Math.round((won ? CFG.online_coins.win : CFG.online_coins.loss) * TUNE.matchCoins); xp = 40; hx = Math.round((won ? 80 : 40) * TUNE.headXp); passPts(d, won ? 15 : 8); }
        // Ranked: Gegner hat etwa die eigene Wertung (Erwartung 50 %), gewinnen hängt an der echten Stärke
        if (P.lvl >= CFG.ranked_min_level) { P.mmr += Math.round(CFG.elo_k * ((won ? 1 : 0) - 0.5)); P.rankedGames++; }
      } else {
        const res = cpuMatch(d, won, goals, conceded, "cpu", dd); coins = res.coins; farmed = res.farmed;
        xp = farmed ? 0 : Math.round(coins * 2) + 15; hx = farmed ? 0 : Math.round((won ? 60 : 30) * TUNE.headXp);
        if (!farmed) passPts(d, won ? 10 : 5);
      }
      inc(online ? "Online-Spiele" : "CPU-Spiele", coins); addXp(d, xp);
      if (!farmed) {
        P.stats.games++; P.stats.wins += won ? 1 : 0; P.stats.goals += goals; P.stats.headGoals += hg; P.stats.pus += pus; P.stats.stomps += stomps; P.stats.supers += sup;
        P.heads[head].xp += hx;
        mastery(d, head, won, goals, online ? 0 : sup);
        const facts = []; if (won) facts.push("firstwin"); if (won && conceded === 0) facts.push("cleansheet"); if (goals >= 3) facts.push("hattrick");
        if (r() < 0.3) facts.push("supergoal"); if (r() < 0.1) facts.push("longshot"); if (r() < 0.03) facts.push("lastsec"); if (won && r() < 0.05) facts.push("comeback");
        if (won && dd === 3 && !stage) facts.push("legend"); if (won && online) facts.push("online"); if (owned.length >= 6) facts.push("collector");
        achieve(d, facts);
      }
      // Karriere-Stern und Liga-Bonus
      if (stage && won) {
        P.career[stage.l.id + "." + stage.gi] = 1;
        if (!P.careerPaid.has(stage.l.id) && stage.l.games.every((_, x) => P.career[stage.l.id + "." + x])) {
          P.careerPaid.add(stage.l.id); inc("Karriere", stage.l.bonus.coins); P.gems += stage.l.bonus.gems; openChest(d, stage.l.chest); ev(d, "career");
        }
      }
    }
    // Tagesaufgaben (alle 3 = Bronze), Tages-Challenge (150 Münzen, 5 Juwelen, Bronze), Wochenaufgaben (alle 5 = Silber)
    if (r() < T.tasks) { inc("Tagesaufgaben", 165); openChest(d, "bronze"); } else inc("Tagesaufgaben", 60);
    if (r() < T.challenge) { inc("Challenge", 150); P.gems += TUNE.challengeGems; openChest(d, "bronze"); addXp(d, Math.round(150 * 1.2)); }
    if (weekTasks.done === 0 && d % 7 >= 4 && r() < T.weekly) { weekTasks.done = 1; inc("Wochenaufgaben", 480); openChest(d, "silver"); }
    // Ausgeben: neue Köpfe (billigste zuerst, Level-Sperre), Kopf-Level, Splitter, Bälle/Arenen, Kosmetik-Angebot
    for (;;) {
      const buy = C.CHARS.filter(c => !P.heads[c.id] && c.price && (C.SHOP_LEVEL[C.rarityOf(c)] || 1) <= P.lvl).sort((a, b) => a.price - b.price)[0];
      if (buy && P.coins >= headPrice(buy)) { pay("Köpfe", headPrice(buy)); ownHead(d, buy.id, "Shop"); continue; }
      const gemBuy = C.CHARS.filter(c => !P.heads[c.id] && C.GEM_PRICE[C.rarityOf(c)] && (C.SHOP_LEVEL[C.rarityOf(c)] || 1) <= P.lvl).sort((a, b) => b.price - a.price)[0];
      if (gemBuy && P.gems >= gemPrice(gemBuy) + (T.pay ? 0 : TUNE.passGems)) { P.gems -= gemPrice(gemBuy); ownHead(d, gemBuy.id, "Juwelen"); continue; }
      const up = Object.entries(P.heads).filter(([, h]) => h.level < CFG.head_max_level && h.xp >= CFG.head_xp_per_level * h.level && P.coins >= headLevelCoins() * h.level).sort((x, y) => y[1].xp - x[1].xp)[0];   // meistgespielter zuerst
      if (up && !buy) { const h = up[1]; pay("Kopf-Level", headLevelCoins() * h.level); h.xp -= CFG.head_xp_per_level * h.level; h.level++; ev(d, "headLevel"); continue; }
      const craft = K.COSMETICS.filter(c => !P.owned.has(c.id)).sort((a, b) => RANK[a.rarity] - RANK[b.rarity])[0];
      if (craft && P.shards >= K.SHARDS.craft[craft.rarity]) { P.shards -= K.SHARDS.craft[craft.rarity]; give(d, craft.id); continue; }
      // Splitter in Kopf-XP (wie api.shards_to_head_xp), erst wenn nichts mehr herzustellen ist; höchster Kopf zuerst
      if (TUNE.shardXp && !craft && P.shards > 0) {
        const per = CFG.head_xp_per_level, rate = CFG.shard_head_xp;
        const h = Object.values(P.heads).filter(x => x.level < CFG.head_max_level && x.xp < per * x.level).sort((a, b) => b.level - a.level || b.xp - a.xp)[0];
        if (h) { const use = Math.min(P.shards, Math.ceil((per * h.level - h.xp) / rate)); P.shards -= use; h.xp = Math.min(per * h.level, h.xp + use * rate); continue; }
      }
      const extra = BUYABLE.find(x => !P.owned.has(x.id) && P.coins >= x.price + 1500);
      if (extra) { pay("Bälle, Arenen", extra.price); P.owned.add(extra.id); continue; }
      const offer = E.cosOffer(E.weekOf(new Date(Date.UTC(2027, 0, 4) + d * 864e5))).map(K.cosById).find(c => c && !P.owned.has(c.id) && P.coins >= K.COS_PRICE[c.rarity].coins + 2500);
      if (offer) { pay("Kosmetik", K.COS_PRICE[offer.rarity].coins); give(d, offer.id); continue; }
      break;
    }
    // Stand des Tages
    if (d % 7 === 6 || d === days - 1) log.push({ d, snap: snapshot(P) });
  }
  return { P, log, src, spent, headSrc };
}
function snapshot(P) {
  const hs = Object.values(P.heads);
  return {
    lvl: P.lvl, coins: P.coins, gems: P.gems, shards: P.shards, heads: hs.length, legend: Object.keys(P.heads).filter(k => C.rarityOf(C.charById(k)) === "legend").length, maxHeads: hs.filter(h => h.level >= CFG.head_max_level).length,
    cos: COS_IDS.filter(id => P.owned.has(id)).length, mastery: hs.reduce((a, h) => a + h.mastery, 0), frames: [...P.owned].filter(x => x.startsWith("frame:")).length,
    ach: P.ach.size, career: Object.keys(P.career).length, balls: C.BALLS.filter(b => P.owned.has(b.id)).length, arenas: C.ARENAS.filter(a => a.price && P.owned.has(a.id)).length,
  };
}

// ---------- Auswertung ----------
const med = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length < a.length / 2 ? null : v[Math.floor(v.length / 2)]; };
const firstDay = (log, pred) => { const e = log.find(x => x.snap && pred(x.snap)); return e ? e.d + 1 : null; };
export function report(days = 540, runs = 60) {
  const out = {};
  for (const type of Object.keys(TYPES)) {
    const res = Array.from({ length: runs }, (_, i) => simulate(type, days, 1000 + i));
    const at = d => res.map(x => x.log.filter(e => e.snap && e.d <= d).pop()?.snap);
    const months = [...new Set([30, 90, 180, 365, days])].filter(d => d <= days).map(d => ({ d, ...Object.fromEntries(Object.keys(at(d)[0] || {}).map(k => [k, med(at(d).map(s => s?.[k]))])) }));
    const ms = {
      "erster legendärer Kopf": med(res.map(x => firstDay(x.log, s => s.legend >= 1))),
      "alle Köpfe": med(res.map(x => firstDay(x.log, s => s.heads >= HEAD_N))),
      "alle Kisten-Kosmetik": med(res.map(x => firstDay(x.log, s => s.cos >= COS_IDS.length))),
      "alle Bälle": med(res.map(x => firstDay(x.log, s => s.balls >= C.BALLS.length - 1))),
      "alle Shop-Arenen": med(res.map(x => firstDay(x.log, s => s.arenas >= C.ARENAS.filter(a => a.price).length))),
      "Karriere komplett": med(res.map(x => firstDay(x.log, s => s.career >= 20))),
      "Level 25": med(res.map(x => firstDay(x.log, s => s.lvl >= 25))),
      "Level 50": med(res.map(x => firstDay(x.log, s => s.lvl >= 50))),
      "erster Kopf auf Level 10": med(res.map(x => firstDay(x.log, s => s.maxHeads >= 1))),
      "Hälfte der Meisterschaft": med(res.map(x => firstDay(x.log, s => s.mastery >= HEAD_N * MASTERY_N / 2))),
      "ganze Meisterschaft": med(res.map(x => firstDay(x.log, s => s.mastery >= HEAD_N * MASTERY_N))),
      "alle Köpfe auf Level 10": med(res.map(x => firstDay(x.log, s => s.maxHeads >= HEAD_N))),
    };
    // Freischaltungen pro Woche (ohne Level-Ups und Kisten): neue Köpfe, Kosmetik, Rahmen, Titel, Meisterschaft, Kopf-Level, Pass, Karriere
    const weeks = Math.floor(days / 7), perWeek = Array.from({ length: weeks }, (_, w) => med(res.map(x => x.log.filter(e => e.kind && !["level", "chest", "ach"].includes(e.kind) && Math.floor(e.d / 7) === w).length)));
    out[type] = { months, ms, perWeek };
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const days = +(process.argv[2] || 540), runs = +(process.argv[3] || 60), preset = process.argv[4] || "aktuell";
  useTune(preset); console.log("Vorlage:", preset, JSON.stringify(TUNE));
  const R = report(days, runs);
  for (const [type, x] of Object.entries(R)) {
    console.log(`\n=== ${type} (${JSON.stringify(TYPES[type])})`);
    console.log("Meilensteine (Tag, Median):", Object.entries(x.ms).map(([k, v]) => `${k}: ${v ?? "–"}`).join(" | "));
    console.table(x.months);
    const pw = x.perWeek; console.log("Freischaltungen/Woche:", [0, 1, 2, 3, 4, 8, 12, 16, 26, 39, 52, 65, 77].filter(w => w < pw.length).map(w => `W${w + 1}:${pw[w]}`).join(" "));
  }
}
