// Service Worker: speichert alle Spieldateien vorab (sonst fehlt offline ein Modul)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coreFiles, renderList } from "../../tools/sw-files.mjs";

test("Dateiliste in sw.js ist aktuell (sonst: node tools/sw-files.mjs)", () => {
  const sw = readFileSync(new URL("../../sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes(renderList(coreFiles())));
});
