import { test } from "node:test";
import assert from "node:assert/strict";
const { supabaseAuth } = await import("../../js/adapters/auth/supabase.js");

function fakeClient(stored = null) {
  let u = stored, done;
  const subs = [];
  const pending = new Promise(r => { done = r; });
  return {
    user: () => u,
    onAuthChange: f => subs.push(f),
    ensureSession: () => pending,
    reload: async () => u,
    finish(next) { u = next; subs.forEach(f => f(u)); done({ user: u }); },
  };
}

test("erster Start: init wartet nicht auf Captcha und Gast-Konto", async () => {
  const c = fakeClient(null);
  const auth = supabaseAuth(c);
  const t0 = Date.now();
  const u = await auth.init();
  assert.ok(Date.now() - t0 < 100, "kehrt sofort zurück");
  assert.equal(u, null, "noch kein Konto");
  const seen = [];
  auth.onChange(x => seen.push(x));
  c.finish({ id: "g1", is_anonymous: true });
  assert.deepEqual(auth.user(), { id: "g1", guest: true, email: undefined, pendingEmail: undefined }, "Gast kommt nach");
  assert.equal(seen.length, 1, "onChange meldet das Konto");
});

test("Wiederkehrer: gespeichertes Konto sofort da, Erneuern läuft im Hintergrund", async () => {
  const c = fakeClient({ id: "p1", email: "a@b.c", is_anonymous: false });
  const auth = supabaseAuth(c);
  const t0 = Date.now();
  const u = await auth.init();
  assert.ok(Date.now() - t0 < 100, "kein Warten auf das Erneuern");
  assert.equal(u.id, "p1"); assert.equal(u.guest, false);
});
