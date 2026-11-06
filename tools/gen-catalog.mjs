// Erzeugt supabase/catalog.sql aus den Spielinhalten (js/content, js/core/economy.js).
// Gegenstände heißen auf dem Server "art:id" (head:kalle, ball:neon, arena:neon), damit gleiche Namen nicht kollidieren.
// So gibt es nur EINE Quelle für Köpfe, Bälle, Arenen, Preise, Aufgaben, Erfolge und die Karriere.
//   node tools/gen-catalog.mjs          schreibt die Datei
// tests/sim/catalog.test.mjs prüft, dass sie aktuell ist. Auf dem Server einspielen: siehe docs/BACKEND.md.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHARS, BALLS, ARENAS, ACHIEVEMENTS, rarityOf, GEM_PRICE } from "../js/content/config.js";
import { TASKS } from "../js/core/economy.js";
import { CAREER } from "../js/content/career.js";

// Echtgeld-Produkte (Startwerte aus dem Spielkonzept)
export const PRODUCTS = [
  { id: "gems_100", gems: 100, price: 99 },
  { id: "gems_550", gems: 550, price: 499 },
  { id: "gems_1200", gems: 1200, price: 999 },
  { id: "gems_2600", gems: 2600, price: 1999 },
  { id: "premium_pass", gems: 0, items: ["premium_pass"], price: 499 },
  { id: "starter", gems: 300, price: 299, once: true },
];

const q = v => v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const arr = a => "array[" + a.map(q).join(", ") + "]::text[]";

export function catalogSql() {
  const items = [
    ...CHARS.map(c => ({ id: "head:" + c.id, kind: "head", rarity: rarityOf(c), coins: c.price, gems: GEM_PRICE[rarityOf(c)], meta: { name: c.name, super: c.super } })),
    ...BALLS.map(b => ({ id: "ball:" + b.id, kind: "ball", rarity: rarityOf(b), coins: b.price, gems: null, meta: { name: b.name } })),
    ...ARENAS.map(a => ({ id: "arena:" + a.id, kind: "arena", rarity: rarityOf(a), coins: a.price, gems: null, meta: { name: a.name } })),
  ];
  const ids = new Set();
  for (const it of items) { if (ids.has(it.id)) throw new Error("doppelte ID im Katalog: " + it.id); ids.add(it.id); }
  const L = ["-- ERZEUGT von tools/gen-catalog.mjs aus js/content und js/core/economy.js. Nicht von Hand ändern.",
    "-- Idempotent: kann beliebig oft eingespielt werden (fügt hinzu und aktualisiert, löscht nichts).", "begin;"];
  L.push("insert into game.items (id, kind, rarity, price_coins, price_gems, meta) values");
  L.push(items.map(i => `  (${q(i.id)}, ${q(i.kind)}, ${q(i.rarity)}, ${q(i.coins)}, ${q(i.gems)}, ${q(JSON.stringify(i.meta))}::jsonb)`).join(",\n"));
  L.push("on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, price_coins = excluded.price_coins, price_gems = excluded.price_gems, meta = excluded.meta, active = true;");
  L.push("insert into game.products (id, gems, items, price_cents, once_per_player) values");
  L.push(PRODUCTS.map(p => `  (${q(p.id)}, ${p.gems}, ${arr(p.items || [])}, ${p.price}, ${p.once ? "true" : "false"})`).join(",\n"));
  L.push("on conflict (id) do update set gems = excluded.gems, items = excluded.items, price_cents = excluded.price_cents, once_per_player = excluded.once_per_player, active = true;");
  L.push("insert into game.task_defs (id, goals, reward) values");
  L.push(TASKS.map(t => `  (${q(t.id)}, array[${t.n.join(", ")}], ${t.reward})`).join(",\n"));
  L.push("on conflict (id) do update set goals = excluded.goals, reward = excluded.reward, active = true;");
  L.push("insert into game.achievement_defs (id, reward, stat, goal) values");
  L.push(ACHIEVEMENTS.map(a => `  (${q(a.id)}, ${a.reward}, ${q(a.stat || null)}, ${q(a.goal || null)})`).join(",\n"));
  L.push("on conflict (id) do update set reward = excluded.reward, stat = excluded.stat, goal = excluded.goal;");
  L.push("insert into game.career_leagues (id, ord, coins, gems) values");
  L.push(CAREER.map((l, i) => `  (${q(l.id)}, ${i}, ${l.bonus.coins}, ${l.bonus.gems})`).join(",\n"));
  L.push("on conflict (id) do update set ord = excluded.ord, coins = excluded.coins, gems = excluded.gems;");
  L.push("insert into game.career_stages (id, league, idx, diff) values");
  L.push(CAREER.flatMap(l => l.games.map((g, i) => `  (${q(l.id + "." + i)}, ${q(l.id)}, ${i}, ${g.diff})`)).join(",\n"));
  L.push("on conflict (id) do update set league = excluded.league, idx = excluded.idx, diff = excluded.diff;");
  L.push("commit;", "");
  return L.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL("../supabase/catalog.sql", import.meta.url), catalogSql());
  console.log("supabase/catalog.sql geschrieben");
}
