// Annotation store (IndexedDB). Timestamped + positional so any export form
// (interleaved transcript / interleaved audio / podcast script) can be
// reconstructed later. `textAnchor` is reserved for precise word-level
// alignment without a future schema migration.
//
// This is the durable, offline-safe source of truth. A sync mechanism
// (account-backed cloud, deferred) would layer on top of this — it never
// replaces local persistence, so interjections captured offline are never lost.

import { currentUser } from "./auth.js";

const DB_NAME = "audiobook-library";
const DB_VERSION = 1;
const STORE = "annotations";

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("byBook", "bookId", { unique: false });
        os.createIndex("byBookChapter", ["bookId", "chapterId"], { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(mode) {
  return open().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

export async function addAnnotation({ bookId, chapterId, chapterIndex, positionSec, text }) {
  const now = Date.now();
  const rec = {
    id: crypto.randomUUID?.() || `a-${now}-${Math.random().toString(36).slice(2)}`,
    userId: currentUser().id,
    bookId, chapterId, chapterIndex,
    positionSec: Math.floor(positionSec),
    type: "text",
    text: String(text || "").trim(),
    textAnchor: null,
    createdAt: now,
    updatedAt: now,
  };
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const r = store.add(rec);
    r.onsuccess = () => resolve(rec);
    r.onerror = () => reject(r.error);
  });
}

export async function getAnnotations(bookId) {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const out = [];
    const idx = store.index("byBook");
    const cur = idx.openCursor(IDBKeyRange.only(bookId));
    cur.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { out.push(c.value); c.continue(); }
      else {
        out.sort((a, b) =>
          a.chapterIndex - b.chapterIndex || a.positionSec - b.positionSec);
        resolve(out);
      }
    };
    cur.onerror = () => reject(cur.error);
  });
}

export async function updateAnnotation(id, patch) {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const g = store.get(id);
    g.onsuccess = () => {
      const rec = g.result;
      if (!rec) return resolve(null);
      Object.assign(rec, patch, { updatedAt: Date.now() });
      const p = store.put(rec);
      p.onsuccess = () => resolve(rec);
      p.onerror = () => reject(p.error);
    };
    g.onerror = () => reject(g.error);
  });
}

export async function deleteAnnotation(id) {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function exportAnnotations(bookId) {
  const all = await getAnnotations(bookId);
  return { schema: "audiobook-annotations/v1", bookId, exportedAt: Date.now(), annotations: all };
}

export async function importAnnotations(payload) {
  const list = Array.isArray(payload) ? payload : payload?.annotations || [];
  const store = await tx("readwrite");
  let n = 0;
  await Promise.all(list.map((rec) => new Promise((resolve) => {
    if (!rec || !rec.id) return resolve();
    const r = store.put(rec);
    r.onsuccess = () => { n++; resolve(); };
    r.onerror = () => resolve();
  })));
  return n;
}
