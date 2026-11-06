// Kisten (lokal, gleiche Regeln wie auf dem Server): Chancen, Garantien, doppelte, sichere Köpfe, Level-Kisten
import { test } from "node:test";
import assert from "node:assert/strict";
const { rollChest } = await import("../../js/core/chests.js");
const K = await import("../../js/content/cosmetics.js");
const C = await import("../../js/content/config.js");

const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const base = () => ({ owned: new Set(["head:kalle", "head:yuki", "head:bolt"]), heads: {}, pity: {} });

test("Inhalte: 48 Platzhalter, IDs eindeutig, Kisten-Chancen gültig", () => {
  assert.equal(K.COSMETICS.length, 48);
  assert.equal(new Set(K.COSMETICS.map(c => c.id)).size, 48);
  for (const k of K.CHEST_TIERS) {
    const c = K.CHESTS[k], s = Object.values(c.cos.rar).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-9, k + ": Seltenheiten der Kosmetik = 100 %");
    assert.ok(Object.values(c.head).reduce((a, b) => a + b, 0) <= 1 + 1e-9);
  }
  assert.deepEqual([1, 2, 5, 10, 25, 50].map(K.levelChest), ["bronze", "bronze", "silver", "gold", "legend", "legend"]);
  assert.equal(K.xpForLevel(50), K.xpForLevel(80), "ab Level 50 gleich");
});

test("Chancen stimmen über viele Kisten (Bronze)", () => {
  const r = rng(1); let cos = 0, heads = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const o = rollChest("bronze", { ...base(), owned: new Set() }, r); if (o.items.some(x => x.kind !== "head")) cos++; if (o.items.some(x => x.kind === "head")) heads++; }
  assert.ok(Math.abs(cos / n - 0.35) < 0.02, "Kosmetik ~35 %: " + cos / n);
  assert.ok(Math.abs(heads / n - 0.062) < 0.01, "Kopf ~6,2 %: " + heads / n);
});

test("Garantien: Episch, Legendär, neuer Kopf, legendärer Kopf", () => {
  const r = rng(2);
  let o = rollChest("bronze", { ...base(), pity: { epic: 9 } }, r);
  assert.ok(o.items.some(x => ["episch", "legend"].includes(x.rarity)) && o.pity.epic === 0);
  o = rollChest("bronze", { ...base(), pity: { legend: 39 } }, r);
  assert.ok(o.items.some(x => x.kind !== "head" && x.rarity === "legend") && o.pity.legend === 0);
  o = rollChest("bronze", { ...base(), pity: { head: 49 } }, r);
  assert.ok(o.items.some(x => x.kind === "head" && !x.dup) && o.pity.head === 0);
  o = rollChest("bronze", { ...base(), pity: { legendHead: 89 } }, r);
  assert.ok(o.items.some(x => x.kind === "head" && x.rarity === "legend" && !x.dup));
  // Zähler laufen hoch
  o = rollChest("bronze", { ...base(), pity: { epic: 3 } }, () => 0.99);
  assert.equal(o.pity.epic, 4); assert.equal(o.items.length, 0);
});

test("Sicher ein neuer Kopf (Level 2 / 5), Legendär-Kiste immer mit Kopf", () => {
  for (let s = 0; s < 50; s++) {
    const o = rollChest("bronze", base(), rng(s), "selten");
    const h = o.items.find(x => x.kind === "head");
    assert.ok(h && !h.dup && h.rarity === "selten");
    const l = rollChest("legend", base(), rng(s + 100));
    assert.ok(l.items.some(x => x.kind === "head") && l.gems === 30);
  }
});

test("Doppelt: Kosmetik -> Splitter, Kopf -> Kopf-XP, Kopf auf Level 10 -> Splitter", () => {
  const all = new Set([...K.COSMETICS.map(c => c.id), ...C.CHARS.map(c => "head:" + c.id)]);
  let shards = 0, xp = 0;
  for (let s = 0; s < 300; s++) { const o = rollChest("gold", { owned: all, heads: {}, pity: {} }, rng(s)); shards += o.shards; xp += o.items.reduce((a, x) => a + (x.headXp || 0), 0); assert.ok(o.items.every(x => x.dup)); }
  assert.ok(shards > 0 && xp > 0);
  const maxed = Object.fromEntries(C.CHARS.map(c => [c.id, 10]));
  for (let s = 0; s < 100; s++) { const o = rollChest("gold", { owned: all, heads: maxed, pity: {} }, rng(s)); assert.ok(o.items.every(x => !x.headXp)); }
});
