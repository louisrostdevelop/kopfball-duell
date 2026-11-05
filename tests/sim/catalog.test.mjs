// Der Server-Katalog (supabase/catalog.sql) muss zu den Spielinhalten passen
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogSql } from "../../tools/gen-catalog.mjs";

test("supabase/catalog.sql ist aktuell (sonst: node tools/gen-catalog.mjs)", () => {
  assert.equal(readFileSync(new URL("../../supabase/catalog.sql", import.meta.url), "utf8"), catalogSql());
});
