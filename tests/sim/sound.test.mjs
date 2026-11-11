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
