// Profil, Wirtschaftsregeln und Speicher-Adapter (ohne Browser, mit Speicher im Arbeitsspeicher)
import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateProfile, cleanRules, dailyTaskList, challengeFor, dealFor, xpFor, defaultProfile } from "../../js/core/economy.js";
import { syncedProfileStore } from "../../js/adapters/storage/synced.js";
import { localProfileStore } from "../../js/adapters/storage/local.js";
import { guestAuth } from "../../js/adapters/auth/guest.js";

const memStorage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), map: m }; };
const memStore = (data = null) => ({ data, saves: 0, load() { return this.data; }, save(p) { this.saves++; this.data = JSON.parse(JSON.stringify(p)); } });

test("alter Spielstand wird umgezogen", () => {
  const p = migrateProfile({ coins: 999, rules: { win: 5, weight: "x" }, stats: { games: 3 } });
  assert.equal(p.coins, 999); assert.equal(p.stats.games, 3); assert.equal(p.stats.wins, 0);
  assert.equal(p.rules.len, "w5"); assert.equal(p.rules.weight, undefined, "alte Regel fällt weg");
  assert.deepEqual(cleanRules({ win: 3 }), { len: "w3" });
  assert.deepEqual(migrateProfile(null), defaultProfile());
});
test("Tagesaufgaben und Challenge sind für alle gleich (fester Zufall pro Tag)", () => {
  assert.deepEqual(dailyTaskList("2026-11-05"), dailyTaskList("2026-11-05"));
  assert.equal(dailyTaskList("2026-11-05").length, 3);
  assert.deepEqual(challengeFor("2026-11-05"), challengeFor("2026-11-05"));
  assert.notDeepEqual(challengeFor("2026-11-05"), challengeFor("2026-11-06"));
});
test("Angebot nur für Dinge, die man noch nicht hat, mit 30 % Rabatt", () => {
  const p = defaultProfile(), d = dealFor("2026-11-05", p);
  assert.ok(d && !p[d.kind].includes(d.id)); assert.ok(d.price < d.old);
});
test("Level-Kurve", () => { assert.equal(xpFor(1), 120); assert.equal(xpFor(3), 240); });

test("Profil-Dienst: laden, kaufen, speichern, Tagesbonus", async () => {
  const P = await import("../../js/app/profile.js");
  const store = memStore({ coins: 500, chars: ["kalle"] });
  await P.initProfile(store);
  assert.equal(P.S.coins, 500);
  assert.equal(P.buy("chars", "rocco", 200), true); assert.equal(P.S.coins, 300); assert.ok(store.data.chars.includes("rocco"));
  assert.equal(P.buy("chars", "rocco", 200), false, "nicht doppelt kaufen");
  const d = P.dailyCheck(); assert.equal(d.streak, 1); assert.equal(P.dailyCheck(), null, "nur einmal am Tag");
  assert.ok(store.data.updatedAt > 0);
  const t = P.tasks(); assert.equal(t.length, 3);
  const done = P.taskProgress({ [t[0].id]: 99 }); assert.equal(done.length, 1); assert.equal(P.tasks()[0].done, true);
});

test("Browser-Speicher: speichern und laden", () => {
  const s = memStorage(), a = localProfileStore("k", s);
  assert.equal(a.load(), null); a.save({ coins: 7 }); assert.deepEqual(a.load(), { coins: 7 });
});
test("Gast-Konto: ID bleibt gleich", async () => {
  const s = memStorage();
  const u1 = await guestAuth(s).init(), u2 = await guestAuth(s).init();
  assert.equal(u1.id, u2.id); assert.equal(u1.guest, true);
});
test("Sync: neueres Profil vom Server gewinnt", async () => {
  const local = memStore({ coins: 1, updatedAt: 1 }), remote = memStore({ coins: 2, updatedAt: 5 });
  const s = syncedProfileStore(local, remote, { delay: 10 });
  let got = null; s.onRemoteChange(p => { got = p; });
  assert.equal((await s.load()).coins, 1, "erst sofort lokal");
  await new Promise(r => { setTimeout(r, 20); });
  assert.equal(got.coins, 2); assert.equal(local.data.coins, 2);
});
test("Sync: lokal neuer wird hochgeladen, Speichern gebündelt", async () => {
  const local = memStore({ coins: 9, updatedAt: 9 }), remote = memStore({ coins: 2, updatedAt: 5 });
  const s = syncedProfileStore(local, remote, { delay: 20 });
  await s.load(); await new Promise(r => { setTimeout(r, 5); });
  assert.equal(remote.data.coins, 9);
  const before = remote.saves;
  for (let i = 0; i < 10; i++) s.save({ coins: 10 + i, updatedAt: 10 + i });
  assert.equal(local.data.coins, 19, "lokal sofort");
  await new Promise(r => { setTimeout(r, 40); });
  assert.equal(remote.saves - before, 1, "zum Server nur einmal"); assert.equal(remote.data.coins, 19);
});
