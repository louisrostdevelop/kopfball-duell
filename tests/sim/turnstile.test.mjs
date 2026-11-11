// Captcha-Adapter (js/adapters/server/turnstile.js) mit nachgebautem Turnstile: Skript nur einmal, Kästchen wird wieder
// entfernt, im Hintergrund kein Klick-Kästchen (dann Pause statt alle 30 s), nur ein echter Ladefehler gilt als Werbeblocker.
import { test } from "node:test";
import assert from "node:assert/strict";

const T = "../../js/adapters/server/turnstile.js";
let script = "ok", mode = "ok", renders = 0, removed = 0, boxes = 0;
const scripts = [];
const fakeTs = {
  render(box, o) {
    renders++;
    setTimeout(() => {
      if (mode === "ok") o.callback("tok");
      else { o["before-interactive-callback"](); setTimeout(() => o.callback("tok-klick"), 0); }   // Klick nötig, dann gelöst
    }, 0);
    return "w" + renders;
  },
  remove() { removed++; },
};
globalThis.window = {};
globalThis.document = {
  createElement: () => ({ style: {}, remove() { if (this.inBody) boxes--; } }),
  head: {
    appendChild: s => {
      scripts.push(s);
      if (script === "ok") setTimeout(() => { window.turnstile = fakeTs; s.onload(); }, 0);
      else if (script === "fail") setTimeout(() => s.onerror(), 0);   // "hang": lädt nie
    },
  },
  body: { appendChild: b => { b.inBody = true; boxes++; } },
};

test("Skript lädt nicht (Werbeblocker): Fehler und Hinweis; nächster Versuch hängt ein neues Skript an", async () => {
  script = "fail"; let blocked = 0;
  const { turnstileToken } = await import(T + "?laden");
  const get = turnstileToken("key", { onBlocked: () => { blocked++; } });
  await assert.rejects(get({ user: true }), /captcha_blocked/);
  assert.equal(blocked, 1);
  script = "ok";
  assert.equal(await get({ user: true }), "tok");
  assert.equal(scripts.length, 2);
});

test("Token holen, Kästchen danach entfernt; Skript schon da: nicht nochmal laden", async () => {
  const { turnstileToken } = await import(T);
  mode = "ok"; renders = 0; removed = 0; scripts.length = 0;
  assert.equal(await turnstileToken("key")(), "tok");
  assert.deepEqual([renders, removed, boxes, scripts.length], [1, 1, 0, 0]);
});

test("Klick nötig im Spiel (Hintergrund): abbrechen, dann Pause; auf Knopfdruck trotzdem", async () => {
  const { turnstileToken } = await import(T);
  mode = "click"; renders = 0; removed = 0;
  const get = turnstileToken("key", { allowInteraction: () => false });
  await assert.rejects(get(), /captcha_needs_click/);
  await assert.rejects(get(), /captcha_backoff/);
  assert.equal(renders, 1, "in der Pause kein neues Kästchen");
  assert.equal(await get({ user: true }), "tok-klick", "Knopfdruck zeigt das Kästchen");
  assert.deepEqual([removed, boxes], [2, 0]);
});

test("Klick nötig im Menü: Kästchen bleibt, bis gelöst", async () => {
  const { turnstileToken } = await import(T + "?menue");
  mode = "click";
  assert.equal(await turnstileToken("key", { allowInteraction: () => true })(), "tok-klick");
});
