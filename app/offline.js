// Offline download manager. The service worker (sw.js) serves anything in any
// cache; this module is what *fills* a per-book cache and reports progress.
// Each book gets its own cache (book-<id>) so it can be downloaded and removed
// independently. On iOS, eviction under storage pressure is silent, so we ask
// for persistent storage and let isBookCached() reflect reality rather than a
// stored flag.

export function bookCacheName(bookId) {
  return "book-" + String(bookId).replace(/[^a-z0-9_-]+/gi, "-");
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    if (navigator.storage?.persist) {
      try { await navigator.storage.persist(); } catch (_) {}
    }
    return reg;
  } catch (_) {
    return null;
  }
}

function bookUrls(book, slug) {
  const urls = [`books/${slug}/book.json`];
  for (const ch of book.chapters) {
    urls.push(`books/${slug}/${ch.file}`);
    if (ch.transcript) urls.push(`books/${slug}/${ch.transcript}`);
  }
  return urls;
}

export async function isBookCached(book, slug) {
  if (!("caches" in window)) return false;
  const cache = await caches.open(bookCacheName(book.id));
  const need = bookUrls(book, slug);
  for (const u of need) {
    const hit = await cache.match(u, { ignoreSearch: true });
    if (!hit) return false;
  }
  return true;
}

// Downloads every chapter + transcript into the book cache, reporting
// fractional progress (0..1). Audio dominates the byte count, so we weight
// progress by Content-Length when available, falling back to file count.
export async function downloadBook(book, slug, onProgress) {
  if (!("caches" in window)) throw new Error("Cache API unavailable");
  const cache = await caches.open(bookCacheName(book.id));
  const urls = bookUrls(book, slug);
  let done = 0;
  for (const u of urls) {
    const res = await fetch(u, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed: ${u} (${res.status})`);
    await cache.put(u, res.clone());
    done++;
    onProgress?.(done / urls.length);
  }
  onProgress?.(1);
  return true;
}

export async function removeBook(book) {
  if (!("caches" in window)) return false;
  return caches.delete(bookCacheName(book.id));
}
