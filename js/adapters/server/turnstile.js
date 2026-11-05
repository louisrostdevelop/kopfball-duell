// Captcha (Cloudflare Turnstile) für die Gast-Anmeldung: unsichtbar, nur beim allerersten Start nötig.
// Ohne Site-Key in content/backend.js wird nichts geladen.
let loading = null;
function load() {
  loading = loading || new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => ok(window.turnstile); s.onerror = () => { loading = null; fail(new Error("captcha_load")); };
    document.head.appendChild(s);
  });
  return loading;
}
/** @returns {() => Promise<string>} liefert ein frisches Captcha-Token */
export function turnstileToken(siteKey) {
  return async () => {
    const ts = await load();
    const box = document.createElement("div"); box.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:99";
    document.body.appendChild(box);
    try {
      return await new Promise((ok, fail) => ts.render(box, { sitekey: siteKey, size: "flexible", appearance: "interaction-only", callback: ok, "error-callback": () => fail(new Error("captcha")), "timeout-callback": () => fail(new Error("captcha_timeout")) }));
    } finally { setTimeout(() => box.remove(), 500); }
  };
}
