// Playback controller: wraps one <audio> element, drives a book's chapters,
// and emits throttled position updates. Knows nothing about storage or UI —
// callers pass handlers.

export class Player {
  constructor(book, slug, audioEl, handlers = {}) {
    this.book = book;
    this.slug = slug;
    this.audio = audioEl;
    this.handlers = handlers;          // { onPosition, onChapterChange }
    this.index = 0;
    this.autoAdvance = true;
    this._lastSave = 0;

    this.audio.addEventListener("timeupdate", () => this._onTime());
    this.audio.addEventListener("ended", () => this._onEnded());
    this.audio.addEventListener("pause", () => this._save(true));

    // Disconnect/close safety: persist immediately when the page is hidden or
    // unloaded — this is the fix for "progress lost on close/reload".
    const flush = () => this._save(true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  get chapter() { return this.book.chapters[this.index]; }

  load(index, startAt = 0, autoplay = false) {
    this.index = Math.max(0, Math.min(index, this.book.chapters.length - 1));
    const ch = this.chapter;
    this.audio.src = `books/${this.slug}/${ch.file}`;
    const seek = () => {
      if (startAt > 0 && startAt < (ch.durationSec - 2)) {
        try { this.audio.currentTime = startAt; } catch (_) {}
      }
      this.audio.removeEventListener("loadedmetadata", seek);
      if (autoplay) this.audio.play().catch(() => {});
    };
    this.audio.addEventListener("loadedmetadata", seek);
    this.handlers.onChapterChange?.(this.index, ch);
  }

  play(index) {
    if (index != null && index !== this.index) this.load(index, 0, true);
    else this.audio.play().catch(() => {});
  }

  _onTime() {
    if (this.audio.seeking) return;
    const now = Date.now();
    if (now - this._lastSave > 4000) this._save();
  }

  _save(force = false) {
    if (!this.audio || isNaN(this.audio.currentTime)) return;
    this._lastSave = Date.now();
    this.handlers.onPosition?.({
      bookId: this.book.id,
      chapterId: this.chapter.id,
      chapterIndex: this.index,
      positionSec: Math.floor(this.audio.currentTime),
    });
  }

  _onEnded() {
    this._save(true);
    if (this.autoAdvance && this.index < this.book.chapters.length - 1) {
      this.load(this.index + 1, 0, true);
    }
  }
}
