// Offline-Unterstützung: erst Netz, dann Cache (so kommen Updates sofort an)
const CACHE = "kopfball-v18";
const CORE = [
  "./", "css/style.css", "fonts/lilita.woff2", "fonts/nunito-700.woff2", "fonts/nunito-800.woff2",
  "fonts/nunito-900.woff2", "icons/icon-192.png", "index.html", "js/adapters/audio/webaudio.js",
  "js/adapters/auth/guest.js", "js/adapters/auth/supabase.js", "js/adapters/input/dom-input.js",
  "js/adapters/net/peerjs.js", "js/adapters/server/supabase-rest.js", "js/adapters/server/supabase.js",
  "js/adapters/server/turnstile.js", "js/adapters/storage/local.js", "js/adapters/storage/synced.js",
  "js/app/account.js", "js/app/cosmetics.js", "js/app/effects.js", "js/app/game.js", "js/app/loop.js",
  "js/app/matchmaking.js", "js/app/modes.js", "js/app/netcode.js", "js/app/online.js", "js/app/profile.js",
  "js/app/results.js", "js/app/services.js", "js/app/state.js", "js/content/backend.js",
  "js/content/career.js", "js/content/config.js", "js/content/cosmetics.js", "js/content/i18n.js",
  "js/content/i18n/de.js", "js/content/i18n/en.js", "js/content/layouts.js", "js/core/ai.js",
  "js/core/career.js", "js/core/chests.js", "js/core/economy.js", "js/core/physics.js", "js/core/sim/ball.js",
  "js/core/sim/base.js", "js/core/sim/goal.js", "js/core/sim/kick.js", "js/core/sim/match.js",
  "js/core/sim/obstacles.js", "js/core/sim/player.js", "js/core/sim/powerups.js", "js/core/sim/rules.js",
  "js/core/sim/state.js", "js/core/sim/supers.js", "js/core/sim/tricks.js", "js/core/sim/tuning.js",
  "js/main.js", "js/ports/auth.js", "js/ports/devices.js", "js/ports/server.js", "js/ports/storage.js",
  "js/ports/transport.js", "js/ui/controls.js", "js/ui/dom.js", "js/ui/hud.js", "js/ui/modals.js",
  "js/ui/nav.js", "js/ui/render/art.js", "js/ui/render/render.js", "js/ui/screens/account.js",
  "js/ui/screens/achievements.js", "js/ui/screens/board.js", "js/ui/screens/career.js",
  "js/ui/screens/chests.js", "js/ui/screens/end.js", "js/ui/screens/friends.js", "js/ui/screens/home.js",
  "js/ui/screens/locker.js", "js/ui/screens/modes.js", "js/ui/screens/online.js", "js/ui/screens/pass.js",
  "js/ui/screens/rules.js", "js/ui/screens/run.js", "js/ui/screens/search.js", "js/ui/screens/select.js",
  "js/ui/screens/settings.js", "js/ui/screens/setup.js", "js/ui/screens/shop.js", "js/ui/screens/tasks.js",
  "manifest.webmanifest", "vendor/peerjs.min.js", "vendor/qrcode.js"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
