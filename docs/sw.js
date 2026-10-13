const CACHE = "trail-runner-v6";
const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=run-follow-6",
  "./app.js?v=run-follow-6",
  "./core.js?v=run-follow-6",
  "./location.js?v=run-follow-6",
  "./navigation.js?v=run-follow-6",
  "./vendor/leaflet-rotate.js",
  "./icon.svg",
  "./manifest.webmanifest",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).then(() => self.skipWaiting())),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("trail-runner-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (
          response.ok &&
          SHELL.some(
            (path) => new URL(path, self.location).pathname === url.pathname,
          )
        ) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (response) =>
              response ||
              (event.request.mode === "navigate"
                ? caches.match("./index.html")
                : Response.error()),
          ),
      ),
  );
});
