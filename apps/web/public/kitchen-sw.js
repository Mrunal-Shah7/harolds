/* SPRINT-6: minimum service worker — installable shell; last known board is retained in the page. */
const CACHE = "harolds-kitchen-shell-v1";
const SHELL = ["/kitchen", "/kitchen/manifest.webmanifest", "/kitchen/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname === "/kitchen" || url.pathname.startsWith("/kitchen/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match("/kitchen");
          if (shell) return shell;
          return new Response("Kitchen display is offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }),
    );
  }
});
