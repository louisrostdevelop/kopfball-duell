// Captcha (Cloudflare Turnstile) für die Gast-Anmeldung (allererster Start) und für „Code schicken“ beim Anmelden.
// Meist unsichtbar; verlangt Turnstile doch einen Klick, liegt das Kästchen unten mittig über allem (auch über dem
// Ladebildschirm, z-index 100, und Dialogen). Ohne Site-Key in content/backend.js wird nichts geladen.
const LOAD_MS = 20000, TOTAL_MS = 120000;           // Skript laden, ganze Prüfung (mit Klick)
const BACKOFF_MS = 60000, BACKOFF_MAX = 15 * 60000;  // im Hintergrund gescheitert: erst nach einer Pause wieder
let loading = null, backoff = BACKOFF_MS, notBefore = 0;

const within = (p, ms, msg) => {
  let t;
  return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(msg)), ms); })]).finally(() => clearTimeout(t));
};
// Skript nur einmal anhängen. Zu langsam: nur dieser Aufruf gibt auf (Zeitlimit beim Aufrufer), das Laden läuft weiter
// und der nächste Aufruf nutzt es. Neu versucht wird nur nach einem echten Ladefehler (Werbeblocker, Netz).
function load() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading = loading || new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => ok(window.turnstile);
    s.onerror = () => { loading = null; s.remove(); fail(new Error("captcha_blocked")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * @param {string} siteKey
 * @param {{ allowInteraction?: () => boolean, onBlocked?: () => void }} [o]
 *   allowInteraction: darf jetzt ein Kästchen zum Anklicken erscheinen (nicht mitten im Spiel)?
 *   onBlocked: Skript ließ sich nicht laden (Werbeblocker, kein Netz)
 * @returns {(o?: { user?: boolean }) => Promise<string>} liefert ein frisches Captcha-Token; user = auf Knopfdruck
 *   (zeigt das Kästchen immer und wartet keine Pause ab)
 */
export function turnstileToken(siteKey, { allowInteraction = () => true, onBlocked = () => {} } = {}) {
  return async ({ user = false } = {}) => {
    if (!user && Date.now() < notBefore) throw new Error("captcha_backoff");
    const failed = e => {
      if (!user) { notBefore = Date.now() + backoff; backoff = Math.min(backoff * 2, BACKOFF_MAX); }
      throw e;
    };
    let ts;
    try { ts = await within(load(), LOAD_MS, "captcha_load_timeout"); }
    catch (e) { if (e.message === "captcha_blocked") onBlocked(); return failed(e); }
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);width:min(320px,calc(100vw - 32px));z-index:2000";
    document.body.appendChild(box);
    let id = null;
    try {
      const tok = await within(new Promise((ok, no) => {
        id = ts.render(box, {
          sitekey: siteKey, size: "flexible", appearance: "interaction-only", callback: ok,
          "error-callback": () => no(new Error("captcha")), "timeout-callback": () => no(new Error("captcha_timeout")),
          // Klick nötig, aber gerade unpassend (im Spiel, Hintergrund): abbrechen, später nochmal
          "before-interactive-callback": () => { if (!user && !allowInteraction()) no(new Error("captcha_needs_click")); },
        });
      }), TOTAL_MS, "captcha_timeout");
      backoff = BACKOFF_MS; notBefore = 0;
      return tok;
    } catch (e) { return failed(e); } finally {
      try { if (id != null) ts.remove(id); } catch (_) { /* schon weg */ }
      box.remove();
    }
  };
}
