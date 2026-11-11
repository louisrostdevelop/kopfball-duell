// Rahmen: jeder Rahmen hat eine Zeichnung, einen Namen in beiden Sprachen und eine Quelle, die ihn vergibt
import { test } from "node:test";
import assert from "node:assert/strict";
const K = await import("../../js/content/cosmetics.js");
const C = await import("../../js/content/config.js");
const F = await import("../../js/ui/render/frames.js");
const I = await import("../../js/content/i18n.js");
const de = (await import("../../js/content/i18n/de.js")).default;
const en = (await import("../../js/content/i18n/en.js")).default;

const all = [...K.FRAMES, ...K.MASTERY_ITEMS.filter(c => c.kind === "frame")];

test("jeder Rahmen hat einen bekannten Zeichenstil", () => {
  for (const f of all) assert.ok(F.FRAME_STYLES.includes(f.style), `${f.id}: ${f.style}`);
  assert.equal(K.MASTERY_ITEMS.filter(c => c.kind === "frame").length, C.CHARS.length, "ein Meister-Rahmen pro Kopf");
});

test("Rahmen: IDs eindeutig, nicht aus Kisten, Namen in beiden Sprachen", () => {
  assert.equal(new Set(all.map(f => f.id)).size, all.length);
  for (const f of K.FRAMES) {
    assert.ok(!K.COSMETICS.some(c => c.id === f.id), `${f.id} nicht in Kisten`);
    const key = "frame." + f.id.slice(6);
    assert.ok(de[key] && en[key], key);
    assert.equal(K.cosById(f.id), f);
  }
  assert.ok(I.t("frame.medal-gold").length > 0);
});

test("Quellen: Siege-Erfolge geben die drei Medaillen, jede Liga hat ihren Rahmen", () => {
  const items = C.ACHIEVEMENTS.filter(a => a.item).map(a => a.item).sort();
  assert.deepEqual(items, ["frame:medal-bronze", "frame:medal-gold", "frame:medal-silver"]);
  for (const a of C.ACHIEVEMENTS.filter(x => x.item)) assert.ok(K.cosById(a.item), a.item);
  assert.deepEqual(K.FRAMES.filter(f => f.src === "league").map(f => f.league), K.LEAGUE_IDS);
});
