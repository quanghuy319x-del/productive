const CACHE_NAME = "branchline-pwa-v489";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=489",
  "./phase1-editors.js?v=489",
  "./phase2-layout.js?v=489",
  "./app.js?v=489",
  "./sidebar-hotfix-v489.js",
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
  if (url.origin !== self.location.origin) return;

  const isDocument =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/sw.js");

  if (isDocument) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async (response) => {
          if (response && response.ok && !url.pathname.endsWith("/sw.js")) {
            const type = response.headers.get("content-type") || "";
            if (type.includes("text/html")) {
              let html = await response.text();
              if (!html.includes("sidebar-hotfix-v489.js")) {
                html = html.replace("</body>", '<script src="./sidebar-hotfix-v489.js?v=489"></script></body>');
              }
              const headers = new Headers(response.headers);
              headers.delete("content-length");
              const patched = new Response(html, {status: response.status, statusText: response.statusText, headers});
              caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", patched.clone()));
              return patched;
            }
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", response.clone()));
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