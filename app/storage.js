// Persistence layer. Phase 1 uses localStorage for playback position.
// Annotations (Phase 3) will live in IndexedDB behind this same module so
// callers don't change when the backing store grows.

const POS_KEY = (bookId) => `ab:pos:${bookId}`;
const LAST_BOOK = "ab:lastBook";

export function savePosition(bookId, { chapterId, chapterIndex, positionSec }) {
  try {
    localStorage.setItem(POS_KEY(bookId), JSON.stringify({
      chapterId, chapterIndex, positionSec, updatedAt: Date.now(),
    }));
  } catch (_) { /* storage full / blocked — non-fatal */ }
}

export function loadPosition(bookId) {
  try {
    const raw = localStorage.getItem(POS_KEY(bookId));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function clearPosition(bookId) {
  try { localStorage.removeItem(POS_KEY(bookId)); } catch (_) {}
}

export function setLastBook(slug) {
  try { localStorage.setItem(LAST_BOOK, slug); } catch (_) {}
}

export function getLastBook() {
  try { return localStorage.getItem(LAST_BOOK); } catch (_) { return null; }
}
