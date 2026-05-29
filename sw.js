// Service worker for the audiobook library (GitHub Pages project subpath).
// Strategy split:
//   * App shell (HTML/CSS/JS/JSON/TXT): network-first. Online listeners always
//     get the freshly deployed code; the cache is only a fallback when offline.
//     (A cache-first shell silently pinned stale builds — hence this split.)
//   * Audio (.mp3): cache-first. Files are large and immutable per book, so we
//     never re-fetch what the "Download for offline" flow already stored, and
//     we synthesize 206 responses so seeking works from cache.
// Bump VERSION on any shell-strategy change so old caches are evicted.

const VERSION = "v2";
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

async function cacheFirstAudio(req) {
  const cached = await caches.match(req, { ignoreVary: true, ignoreSearch: true });
  if (cached) {
    try { return await rangeResponse(req, cached.clone()); }
    catch (_) { return cached; }
  }
  return fetch(req);
}

async function networkFirstShell(req) {
  try {
    const fresh = await fetch(req);
    // Keep the offline copy current for genuine shell assets.
    if (fresh && fresh.ok && fresh.type === "basic") {
      const copy = fresh.clone();
      caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    if (req.mode === "navigate") {
      const shell = await caches.match("./index.html");
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith(".mp3")) {
    e.respondWith(cacheFirstAudio(req));
  } else {
    e.respondWith(networkFirstShell(req));
  }
});
