const CACHE = "blu3-mtgskq0y";

const PRECACHE_URLS = ["/", "/browse", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== "blu3-room-v1").map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(null, { status: 503 })),
    );
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response(null, { status: 503 }))),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => new Response(null, { status: 503 }))),
  );
});

self.addEventListener("message", (event) => {
  const { type, roomCode, data } = event.data ?? {};
  if (!type) return;

  if (type === "ROOM_CACHE_PUT") {
    if (!roomCode || !data) return;
    event.waitUntil(
      caches.open("blu3-room-v1").then((cache) => {
        return cache.put("/room-data/" + roomCode, new Response(JSON.stringify(data)));
      }),
    );
    return;
  }

  if (type === "ROOM_CACHE_GET") {
    if (!roomCode) return;
    event.waitUntil(
      caches.open("blu3-room-v1").then((cache) => {
        return cache.match("/room-data/" + roomCode);
      }).then((res) => {
        if (!res) {
          event.source?.postMessage({ type: "ROOM_CACHE_RESULT", roomCode, data: null });
          return;
        }
        return res.json().then((data) => {
          event.source?.postMessage({ type: "ROOM_CACHE_RESULT", roomCode, data });
        });
      }),
    );
    return;
  }

  if (type === "ROOM_CACHE_DELETE") {
    if (!roomCode) return;
    event.waitUntil(
      caches.open("blu3-room-v1").then((cache) => cache.delete("/room-data/" + roomCode)),
    );
    return;
  }
});