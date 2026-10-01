const CACHE_NAME = "branchline-pwa-v493";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=493",
  "./phase1-editors.js?v=493",
  "./phase2-layout.js?v=493",
  "./app.js?v=493",
  "./sidebar-hotfix-v490.js",
  "./favicon.svg",
  "./manifest.webmanifest?v=314",
  "./pwa-icon-192.png",
  "./pwa-icon-512.png"
];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isYahooEmoji =
    url.hostname === "raw.githubusercontent.com" &&
    url.pathname.startsWith("/quangbahoa/yahoo-emoji/");
  if (isYahooEmoji) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request, { cache: "force-cache" });
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        } catch (_) {
          return cached || Response.error();
        }
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  const isDocument =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/sw.js");

  if (isDocument) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok && !url.pathname.endsWith("/sw.js")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match("./index.html")) ||
          (await caches.match("./"))
        )
    );
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});