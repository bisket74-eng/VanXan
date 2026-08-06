const CACHE = "webbing-party-v5-0";
const CORE = ["./", "./join.html", "./host.html", "./styles.css?v=5.0.0", "./shared.js?v=5.0.0", "./join.js?v=5.0.0", "./host.js?v=5.0.0", "./supabase-config.js?v=5.0.0", "./manifest.json", "./favicon.svg"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
    return response;
  }).catch(() => caches.match(event.request)));
});
