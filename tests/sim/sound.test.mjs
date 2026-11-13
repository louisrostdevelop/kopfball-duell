// Sound-Dateien: Liste aus Dateinamen (Varianten, beide Formate) und audio/sfx/manifest.json passt zu den Dateien
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
const { buildManifest } = await import("../../tools/sound-manifest.mjs");

test("Varianten werden zu einem Namen, fehlendes Format wird gemeldet", () => {
  const { manifest, warn } = buildManifest(["kick_1.ogg", "kick_1.m4a", "kick_2.ogg", "kick_2.m4a", "goal.ogg", "gfx-67.ogg", "gfx-67.m4a", "liesmich.txt"]);
  assert.deepEqual(manifest, { "gfx-67": ["gfx-67"], goal: ["goal"], kick: ["kick_1", "kick_2"] });
  assert.equal(warn.length, 1); assert.match(warn[0], /goal/);
});

test("audio/sfx/manifest.json ist aktuell (sonst: node tools/sound-manifest.mjs)", () => {
  const dir = new URL("../../audio/sfx/", import.meta.url);
  assert.deepEqual(JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")), buildManifest(readdirSync(dir)).manifest);
});

test("Varianten: nie zweimal hintereinander dieselbe, alle anderen kommen vor", async () => {
  const { pickVariant } = await import("../../js/adapters/audio/webaudio.js");
  assert.equal(pickVariant(1, 0), 0);
  for (let last = -1; last < 5; last++) {
    const seen = new Set();
    for (let r = 0; r < 1; r += 0.01) { const i = pickVariant(5, last, () => r); assert.ok(i >= 0 && i < 5); assert.notEqual(i, last); seen.add(i); }
    assert.equal(seen.size, last < 0 ? 5 : 4, "alle (übrigen) Varianten erreichbar");
  }
});

test("Musik zur Wiederholung: Start, Ende, kein Neustart nach Pause, neue Wiederholung startet neu", async () => {
  const { replayCue } = await import("../../js/adapters/audio/webaudio.js");
  const c = { cur: null, used: new WeakSet() }, a = {}, b = {};
  assert.equal(replayCue(c, null), null, "keine Wiederholung: nichts");
  assert.equal(replayCue(c, a), "start");
  assert.equal(replayCue(c, a), null, "läuft weiter");
  assert.equal(replayCue(c, null), "stop", "Ende, Überspringen oder Pause");
  assert.equal(replayCue(c, a), null, "dieselbe Wiederholung nach der Pause: nicht neu starten");
  assert.equal(replayCue(c, b), "restart", "nächste Wiederholung ohne Lücke");
  assert.equal(replayCue(c, null), "stop");
});

test("Lattenschuss klingt gedämpft, andere Aufnahmen unverändert", async () => {
  const { fileLevel } = await import("../../js/adapters/audio/webaudio.js");
  assert.ok(Math.abs(fileLevel("post") - 0.5) < 0.01, "Latte -6 dB");
  assert.equal(fileLevel("kick"), 1);
});
