const CACHE_NAME = "branchline-pwa-v536";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=536",
  "./phase1-editors.js?v=536",
  "./phase2-layout.js?v=536",
  "./app.js?v=536",
  "./sidebar-hotfix-v490.js?v=536",
  "./assets/yahoo/smile-or-happy-face.gif",
  "./assets/yahoo/sad-or-frown-face.gif",
  "./assets/yahoo/winking.gif",
  "./assets/yahoo/big-grin.gif",
  "./assets/yahoo/batting-eyelashes.gif",
  "./assets/yahoo/big-hug.gif",
  "./assets/yahoo/confused.gif",
  "./assets/yahoo/love-struck.gif",
  "./assets/yahoo/blushing.gif",
  "./assets/yahoo/frustrated-or-sticking-tongue-out.gif",
  "./assets/yahoo/kiss.gif",
  "./assets/yahoo/broken-heart.gif",
  "./assets/yahoo/surprised.gif",
  "./assets/yahoo/angry-or-grumpy.gif",
  "./assets/yahoo/crying.gif",
  "./assets/yahoo/thinking.gif",
  "./assets/yahoo/do-not-tell-anyone.gif",
  "./assets/yahoo/nerd.gif",
  "./assets/yahoo/nail-biting.gif",
  "./assets/yahoo/rolling-on-the-floor-laughing.gif",
  "./assets/yahoo/sunglasses-or-cool.gif",
  "./assets/yahoo/angel.gif",
  "./assets/yahoo/devil.gif",
  "./assets/yahoo/sleepy.gif",
  "./assets/yahoo/cowboy.gif",
  "./assets/yahoo/applause.gif",
  "./assets/yahoo/thumbs-up.gif",
  "./assets/yahoo/thumbs-down.gif",
  "./assets/yahoo/wave.gif",
  "./assets/yahoo/dancing.gif",
  "./assets/yahoo/party.gif",
  "./assets/yahoo/rolling-eyes.gif",
  "./assets/yahoo/daydreaming.gif",
  "./assets/yahoo/whistling.gif",
  "./assets/yahoo/praying.gif",
  "./assets/yahoo/rocking.gif",
  "./assets/maneki-neko-wave.gif",
  "./favicon.svg",
  "./manifest.webmanifest?v=536",
  "./pwa-icon-192.png",
  "./pwa-icon-516.png"
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