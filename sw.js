// Offline-Unterstützung: erst Netz, dann Cache (so kommen Updates sofort an)
const CACHE = "kopfball-v32";
const CORE = [
  "./", "css/style.css", "fonts/lilita.woff2", "fonts/nunito-700.woff2", "fonts/nunito-800.woff2",
  "fonts/nunito-900.woff2", "icons/icon-192.png", "icons/wordmark.webp", "index.html",
  "js/adapters/audio/synth.js", "js/adapters/audio/webaudio.js", "js/adapters/auth/guest.js",
  "js/adapters/auth/supabase.js", "js/adapters/input/dom-input.js", "js/adapters/net/peerjs.js",
  "js/adapters/server/config.js", "js/adapters/server/supabase-rest.js", "js/adapters/server/supabase.js",
  "js/adapters/server/turnstile.js", "js/adapters/storage/local.js", "js/adapters/storage/safe.js",
  "js/adapters/storage/synced.js", "js/app/account.js", "js/app/activity.js", "js/app/cosmetics.js",
  "js/app/effects.js", "js/app/game.js", "js/app/loop.js", "js/app/matchmaking.js", "js/app/modes.js",
  "js/app/netcode.js", "js/app/online.js", "js/app/perfhud.js", "js/app/profile.js", "js/app/rbnet.js",
  "js/app/relay.js", "js/app/results.js", "js/app/services.js", "js/app/session.js", "js/app/state.js",
  "js/app/track.js", "js/content/backend.js", "js/content/career.js", "js/content/config.js",
  "js/content/cosmetics.js", "js/content/dmath.js", "js/content/i18n.js", "js/content/i18n/de.js",
  "js/content/i18n/en.js", "js/content/layouts.js", "js/core/bot/brain.js", "js/core/bot/levels.js",
  "js/core/bot/world.js", "js/core/career.js", "js/core/chests.js", "js/core/economy.js", "js/core/physics.js",
  "js/core/rbfix.js", "js/core/rbgame.js", "js/core/rbpeer.js", "js/core/rbstart.js", "js/core/rollback.js",
  "js/core/sim/ball.js", "js/core/sim/base.js", "js/core/sim/goal.js", "js/core/sim/match.js",
  "js/core/sim/obstacles.js", "js/core/sim/player.js", "js/core/sim/powerups.js", "js/core/sim/rules.js",
  "js/core/sim/shoe.js", "js/core/sim/state.js", "js/core/sim/supers.js", "js/core/sim/tricks.js",
  "js/core/sim/tuning.js", "js/main.js", "js/ports/auth.js", "js/ports/devices.js", "js/ports/server.js",
  "js/ports/storage.js", "js/ports/transport.js", "js/ui/brand.js", "js/ui/controls.js", "js/ui/dom.js",
  "js/ui/hud.js", "js/ui/install.js", "js/ui/juggle.js", "js/ui/modals.js", "js/ui/nav.js",
  "js/ui/render/arena-art.js", "js/ui/render/art.js", "js/ui/render/balls.js", "js/ui/render/chest-art.js",
  "js/ui/render/classic-heads.js", "js/ui/render/frames.js", "js/ui/render/goalfx.js",
  "js/ui/render/juggle-art.js", "js/ui/render/meme-heads.js", "js/ui/render/modeart.js",
  "js/ui/render/paint.js", "js/ui/render/powerup-art.js", "js/ui/render/powerup-fx.js",
  "js/ui/render/render.js", "js/ui/render/shoes.js", "js/ui/screens/account.js",
  "js/ui/screens/achievements.js", "js/ui/screens/board.js", "js/ui/screens/career.js",
  "js/ui/screens/chests.js", "js/ui/screens/end.js", "js/ui/screens/home.js", "js/ui/screens/locker.js",
  "js/ui/screens/modes.js", "js/ui/screens/online.js", "js/ui/screens/pass.js", "js/ui/screens/profile.js",
  "js/ui/screens/rules.js", "js/ui/screens/run.js", "js/ui/screens/search.js", "js/ui/screens/select.js",
  "js/ui/screens/settings.js", "js/ui/screens/setup.js", "js/ui/screens/shop.js", "js/ui/screens/tasks.js",
  "js/ui/sharecard.js", "js/ui/stage-juggle.js", "manifest.webmanifest", "vendor/peerjs.min.js",
  "vendor/qrcode.js"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // nur gute, eigene Antworten speichern; Seitenaufrufe mit Zusätzen (?join=, ?kauf=) nicht: sonst wächst der Speicher und offline kämen Fehlerseiten
  // Seitenaufrufe: Weiterleitungen dem Browser überlassen (redirect manual), sonst lehnt er die Antwort ab
  // am Server nachfragen statt den HTTP-Cache (GitHub Pages: 10 min) zu nehmen: sonst kommt eine neue Version erst spät an
  const req = e.request.mode === "navigate" ? new Request(e.request.url, { cache: "no-cache", credentials: "same-origin", redirect: "manual" }) : new Request(e.request, { cache: "no-cache" });
  e.respondWith(fetch(req).then(r => { if (r.ok && r.type === "basic" && !(e.request.mode === "navigate" && u.search)) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
// Push fürs Admin-Dashboard (Server: supabase/functions/admin-push). Gleiches tag ersetzt die vorige Nachricht,
// renotify meldet sich trotzdem neu.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(String(d.title || "Headstars"), {
    body: String(d.body || ""), tag: String(d.tag || "admin"), renotify: true,
    icon: "icons/icon-192.png", data: { url: typeof d.url === "string" ? d.url : "admin.html" },
  }));
});
// Antippen: offenes Dashboard nach vorne holen, sonst öffnen. Nur eigene Adressen (fremde Links aus der Nachricht nie)
self.addEventListener("notificationclick", e => {
  e.notification.close();
  let u;
  try { u = new URL((e.notification.data && e.notification.data.url) || "admin.html", self.registration.scope); } catch (_) { return; }
  if (u.origin !== location.origin) return;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).pathname === u.pathname);
    if (open) return open.focus();
    return self.clients.openWindow(u.href);
  }));
});
