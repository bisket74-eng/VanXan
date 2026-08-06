const CACHE = "webbing-party-v1";
const APP_SHELL = [
  "./",
  "./join.html",
  "./styles.css",
  "./shared.js",
  "./join.js",
  "./supabase-config.js",
  "./manifest.json",
  "./assets/favicon.svg",
  "./assets/spider-female.svg",
  "./assets/spider-male.svg"
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
