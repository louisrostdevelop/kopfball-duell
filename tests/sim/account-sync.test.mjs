// Abgleich mit dem Server (js/app/account.js): alter lokaler Spielstand wird übernommen statt überschrieben,
// verspätete Antworten überschreiben keinen neueren Stand, abgelehnte Käufe werden nur zurückgedreht, solange kein
// neuerer Server-Stand angekommen ist.
import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const svc = await import("../../js/app/services.js");
const prof = await import("../../js/app/profile.js");
const acc = await import("../../js/app/account.js");

const defer = () => { let r, j; const p = new Promise((a, b) => { r = a; j = b; }); return { p, r, j }; };
const tick = () => new Promise(r => { setTimeout(r, 5); });
const calls = { buy: [], state: [], importLocal: [] };
const server = {
  buy: () => { const d = defer(); calls.buy.push(d); return d.p; },
  state: () => { const d = defer(); calls.state.push(d); return d.p; },
  importLocal: () => { const d = defer(); calls.importLocal.push(d); return d.p; },
  pending: () => 0,
};
svc.provide({ server, auth: { user: () => ({ guest: true }), onChange() {}, init: async () => {} } });
acc.initAccount();
const S = prof.S;
const err = (code, status) => Object.assign(new Error(code), { code, status });
// Anfrage-Nummer wie vom Server-Adapter vergeben
const REQ = Symbol.for("headstars.request");
let n = 1000;
const st = (o, read = false) => Object.defineProperty(o, REQ, { value: { n: ++n, read } });
const reset = () => { for (const k in calls) calls[k].length = 0; };

test("frisches Profil: gilt sofort als abgeglichen, ein vor der Anmeldung gespieltes Spiel wird nicht übernommen", async () => {
  reset();
  assert.equal(S.serverSynced, true, "beim Einstecken markiert");
  assert.equal(acc.syncStatus(), "syncing", "noch kein Server-Stand");
  S.coins = 190;
  acc.applyState(st({ coins: 150, imported: false }));
  assert.equal(calls.importLocal.length, 0, "keine Übernahme: sonst zählte das Spiel doppelt");
  assert.equal(S.coins, 150, "Server-Stand gilt, die Spielmeldung bringt die 40 Münzen nach");
  assert.equal(acc.syncStatus(), "ok");
});

test("Sync-Status: Abruf scheitert -> offline, nächster Stand -> ok; jeder Wechsel wird einmal gemeldet", async () => {
  reset();
  const seen = [];
  acc.onSyncStatus(s => seen.push(s));
  const p = acc.syncOnStart().catch(() => null);
  calls.state[0].j(err("offline", 0)); await p;
  assert.equal(acc.syncStatus(), "offline");
  acc.applyState(st({ coins: 150 }, true));
  assert.equal(acc.syncStatus(), "ok");
  assert.deepEqual(seen, ["offline", "ok"]);
});

test("alter lokaler Spielstand: Server-Stand überschreibt ihn nicht, Übernahme einmal (mit Sperre), danach nachholen", async () => {
  reset(); S.serverSynced = false; S.coins = 2000;
  acc.applyState(st({ coins: 150, imported: false }));
  acc.applyState(st({ coins: 160 }));   // kurzer Stand (z. B. Tagesbonus) während der Übernahme
  assert.equal(S.coins, 2000, "nicht überschrieben");
  assert.equal(calls.importLocal.length, 1, "nur eine Übernahme");
  calls.importLocal[0].r(st({ coins: 1650, imported: true }));
  await tick();
  assert.equal(S.coins, 1650); assert.equal(S.serverSynced, true);
  assert.equal(calls.state.length, 1, "während der Übernahme verworfener Stand: nachgeholt");
  calls.state[0].r(st({ coins: 1660, imported: true }, true)); await tick();
  assert.equal(S.coins, 1660);
});

test("Übernahme scheitert am Server (503, 429) oder offline: lokaler Stand bleibt, beim nächsten Stand nochmal", async () => {
  for (const e of [err("http_503", 503), err("over_request_rate_limit", 429), err("offline", 0)]) {
    reset(); S.serverSynced = false; S.coins = 3000;
    acc.applyState(st({ coins: 150, imported: false, items: ["head:kalle"] }));
    calls.importLocal[0].j(e); await tick();
    assert.equal(S.coins, 3000, e.code); assert.equal(S.serverSynced, false, e.code);
    acc.applyState(st({ coins: 150, imported: false }));
    assert.equal(calls.importLocal.length, 2, e.code + ": wieder versucht");
    calls.importLocal[1].r(st({ coins: 1500, imported: true })); await tick();
    assert.equal(S.serverSynced, true);
  }
});

test("schon übernommen, mit kurzem Stand (ohne Besitz): Server-Stand gilt, voller Stand wird geholt", async () => {
  reset(); S.serverSynced = false; S.coins = 3000; S.chars = ["kalle", "rocco", "flummi", "nala"];
  acc.applyState(st({ coins: 200, level: 2 }));
  calls.importLocal[0].j(err("already_imported", 400)); await tick();
  assert.equal(S.coins, 200); assert.equal(S.serverSynced, true);
  assert.equal(calls.state.length, 1, "voller Stand angefordert");
  calls.state[0].r(st({ coins: 200, items: ["head:kalle"], imported: true }, true)); await tick();
  assert.deepEqual(S.chars, ["kalle"], "Besitz vom Server");
});

test("verspätete Antwort (ältere Anfrage) überschreibt keinen neueren Stand; hat sie etwas geändert, wird nachgeholt", async () => {
  reset(); S.serverSynced = true;
  const alt = st({ coins: 100, gems: 0 }), neu = st({ coins: 3100, gems: 600 }, true);
  acc.applyState(neu);
  acc.applyState(alt);   // z. B. claim_daily, früher abgeschickt, später angekommen
  assert.deepEqual([S.coins, S.gems], [3100, 600], "nicht überschrieben");
  await tick();
  assert.equal(calls.state.length, 1, "änderte etwas: frischer Stand angefordert");
  acc.applyState(st({ coins: 50 }, true)); acc.applyState(neu); await tick();
  assert.equal(calls.state.length, 1, "verspätete reine Abfrage: nichts nachzuholen");
});

test("zwei abgelehnte Käufe: Server-Stand dazwischen -> der zweite wird nicht nochmal zurückgedreht", async () => {
  reset(); S.serverSynced = true; S.coins = 99999; S.level = 99;
  assert.ok(prof.buy("chars", "flummi", 2000)); assert.ok(prof.buy("chars", "nala", 1800));
  calls.buy[0].j(err("not_enough_coins", 400)); await tick();
  assert.equal(S.coins, 98199, "erster zurückgedreht (noch kein Server-Stand)");
  calls.state[0].r(st({ coins: 85, items: ["head:kalle"] }, true)); await tick();
  assert.equal(S.coins, 85);
  calls.buy[1].j(err("not_enough_coins", 400)); await tick();
  assert.equal(S.coins, 85, "zweiter nicht mehr auf den Server-Stand addiert");
  calls.state[1].j(err("offline", 0)); await tick();
  assert.equal(S.coins, 85, "auch wenn der nächste Abruf scheitert");
  assert.ok(!S.chars.includes("nala") && !S.chars.includes("flummi"));
});
