// Offline-Unterstützung: erst Netz, dann Cache (so kommen Updates sofort an)
const CACHE = "kopfball-v3";
const CORE = ["./", "index.html", "css/style.css", "js/main.js", "js/config.js", "js/physics.js", "js/render.js", "js/art.js", "js/audio.js", "js/input.js", "js/ai.js", "js/net.js", "js/store.js",
  "fonts/lilita.woff2", "fonts/nunito-700.woff2", "fonts/nunito-800.woff2", "fonts/nunito-900.woff2", "vendor/peerjs.min.js", "vendor/qrcode.js", "icons/icon-192.png", "manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
