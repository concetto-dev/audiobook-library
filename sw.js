// Service worker for the audiobook library (GitHub Pages project subpath).
// Two jobs:
//   1. Precache the app shell so the UI loads with no network.
//   2. Serve any asset already in a cache — including per-book audio that the
//      "Download for offline" flow stored in a book-<id> cache.
// Audio <audio> elements issue Range requests when seeking; a plain cached
// 200 breaks scrubbing in Safari/iOS, so we synthesize a 206 from the cached
// full body when a Range header is present.

const VERSION = "v1";
const SHELL = "shell-" + VERSION;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./books.json",
  "./app/main.js",
  "./app/library.js",
  "./app/book.js",
  "./app/player.js",
  "./app/storage.js",
  "./app/util.js",
  "./app/auth.js",
  "./app/annotations.js",
  "./app/export.js",
  "./app/offline.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function rangeResponse(request, cached) {
  const range = request.headers.get("range");
  if (!range) return cached;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return cached;
  const buf = await cached.arrayBuffer();
  const total = buf.byteLength;
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? parseInt(m[2], 10) : total - 1;
  const slice = buf.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(slice.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreVary: true, ignoreSearch: false });
    if (cached) {
      try { return await rangeResponse(req, cached.clone()); }
      catch (_) { return cached; }
    }
    try {
      return await fetch(req);
    } catch (err) {
      // Offline and uncached. For navigations, fall back to the app shell.
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
