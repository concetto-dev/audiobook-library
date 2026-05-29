import { Player } from "./player.js";
import { fmtDuration, clock, esc } from "./util.js";
import { savePosition, loadPosition, clearPosition, setLastBook } from "./storage.js";
import { canAnnotate } from "./auth.js";
import { addAnnotation, getAnnotations, deleteAnnotation } from "./annotations.js";
import { downloadTranscript, downloadJSON } from "./export.js";
import { isBookCached, downloadBook, removeBook } from "./offline.js";

export async function renderBook(app, slug) {
  let book;
  try {
    book = await fetch(`books/${encodeURIComponent(slug)}/book.json`, { cache: "no-cache" })
      .then((r) => r.json());
  } catch (e) {
    app.innerHTML = `<div class="wrap"><a class="back" href="#/">← Library</a><p class="loading">Couldn't load this book.</p></div>`;
    return;
  }
  setLastBook(slug);

  const saved = loadPosition(book.id);
  const last = book.chapters.length - 1;
  const hasResume = saved && !(saved.chapterIndex === last
    && saved.positionSec >= book.chapters[last].durationSec - 5)
    && saved.positionSec > 5;

  const trackRows = book.chapters.map((ch, i) => `
    <li>
      <button class="track" data-i="${i}">
        <span class="num">${String(i + 1).padStart(2, "0")}</span>
        <span class="label">${esc(ch.label)}</span>
        <span class="dur">${fmtDuration(ch.durationSec)}</span>
      </button>
    </li>`).join("");

  const resumeBanner = hasResume ? `
    <div class="resume" id="resume">
      <span>Resume — ${esc(book.chapters[saved.chapterIndex].label)} at ${clock(saved.positionSec)}</span>
      <button class="go" id="resumeGo">Resume</button>
    </div>` : "";

  app.innerHTML = `
    <div class="wrap">
      <a class="back" href="#/">← Library</a>
      <header>
        ${book.kind ? `<p class="kicker">${esc(book.kind)}</p>` : ""}
        <h1>${esc(book.title)}</h1>
        ${book.subtitle ? `<p class="sub">${esc(book.subtitle)}</p>` : ""}
        <p class="byline">${esc(book.author || "")}${book.date ? " &middot; " + esc(book.date) : ""}</p>
      </header>

      ${resumeBanner}
      <div class="now" id="now">${hasResume ? "Ready to resume" : "Ready"}</div>

      <ol class="tracks" id="tracks">${trackRows}</ol>

      <div class="opts">
        <label><input type="checkbox" id="cont" checked> Play chapters continuously</label>
        <label><input type="checkbox" id="commentary"> Play with my commentary</label>
        <button class="linkbtn" id="offline">Download for offline</button>
        <button class="linkbtn" id="restart">Start over</button>
      </div>

      <section class="notes" id="notesPanel">
        <div class="notes-head">
          <h2>Your interjections <span class="count" id="noteCount"></span></h2>
          <div class="notes-actions">
            <button class="linkbtn" id="expMd">Export transcript</button>
            <button class="linkbtn" id="expJson">Export JSON</button>
          </div>
        </div>
        <ol class="notelist" id="notelist"></ol>
        <p class="notes-empty" id="notesEmpty">Hit <strong>Comment</strong> while listening to capture a thought at the exact moment. It pauses, you type, playback picks back up.</p>
      </section>

      ${book.sourceUrl ? `<footer>Source text at <a href="${esc(book.sourceUrl)}">the original publisher</a>.</footer>` : ""}
    </div>

    <div class="playerbar" id="bar">
      <div class="inner">
        <audio id="audio" controls preload="metadata"></audio>
        <div class="controls-row">
          <button class="skipbtn" id="back10" title="Back 10 seconds">↺ 10s</button>
          <button class="skipbtn" id="fwd10" title="Forward 10 seconds">10s ↻</button>
          <button class="commentbtn" id="commentBtn" title="Capture an interjection (pauses playback)">＋ Comment</button>
        </div>
      </div>
    </div>

    <div class="modal-back" id="modalBack" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <p class="modal-where" id="modalWhere"></p>
        <h3 id="modalTitle">Your interjection</h3>
        <textarea id="modalText" rows="4" placeholder="What do you want to say back to the author here?"></textarea>
        <div class="modal-actions">
          <button class="linkbtn" id="modalCancel">Cancel</button>
          <button class="go" id="modalSave">Save &amp; resume</button>
        </div>
        <p class="modal-hint">⌘/Ctrl + Enter to save · Esc to cancel</p>
      </div>
    </div>

    <div class="commentary-overlay" id="cOverlay" hidden>
      <div class="commentary-card">
        <p class="commentary-where" id="cWhere"></p>
        <p class="commentary-text" id="cText"></p>
        <button class="go" id="cResume">Resume ▸</button>
      </div>
    </div>`;

  const audio = app.querySelector("#audio");
  const now = app.querySelector("#now");
  const tracksEl = app.querySelector("#tracks");

  const setActive = (i, ch) => {
    now.textContent = ch.label;
    tracksEl.querySelectorAll(".track").forEach((el) =>
      el.classList.toggle("active", Number(el.dataset.i) === i));
  };

  // --- commentary playback state ---
  let allNotes = [];            // every interjection for this book
  let commentaryOn = false;
  let chapterNotes = [];        // sorted annotations for the active chapter
  let fired = new Set();        // annotation ids already surfaced this pass
  let prevSec = 0;

  const player = new Player(book, slug, audio, {
    onPosition: (p) => savePosition(book.id, p),
    onChapterChange: (i, ch) => {
      setActive(i, ch);
      fired = new Set();
      prevSec = 0;
      refreshChapterNotes(i);
    },
    onTimeUpdate: (i, t) => {
      if (!commentaryOn || audio.paused) return;
      // Surface any interjection we just crossed (prevSec, t].
      for (const a of chapterNotes) {
        if (a.positionSec > prevSec && a.positionSec <= t && !fired.has(a.id)) {
          fired.add(a.id);
          showCommentary(a);
          break;
        }
      }
      prevSec = t;
    },
  });

  function refreshChapterNotes(i) {
    chapterNotes = allNotes
      .filter((a) => a.chapterIndex === i)
      .sort((a, b) => a.positionSec - b.positionSec);
  }

  // Restore last position (no autoplay — browsers require a gesture).
  if (hasResume) player.load(saved.chapterIndex, saved.positionSec, false);
  else player.load(0, 0, false);

  app.querySelector("#cont").addEventListener("change", (e) => {
    player.autoAdvance = e.target.checked;
  });
  app.querySelector("#commentary").addEventListener("change", (e) => {
    commentaryOn = e.target.checked;
    fired = new Set();
    prevSec = Math.floor(audio.currentTime || 0);
  });
  tracksEl.querySelectorAll(".track").forEach((btn) => {
    btn.addEventListener("click", () => {
      now.textContent = "Now playing — " + book.chapters[Number(btn.dataset.i)].label;
      player.play(Number(btn.dataset.i));
    });
  });
  app.querySelector("#resumeGo")?.addEventListener("click", () => {
    app.querySelector("#resume")?.remove();
    now.textContent = "Now playing — " + player.chapter.label;
    player.play();
  });
  app.querySelector("#restart").addEventListener("click", () => {
    clearPosition(book.id);
    app.querySelector("#resume")?.remove();
    player.load(0, 0, false);
    now.textContent = "Ready";
  });

  // ---------- interjection capture ----------
  const modalBack = app.querySelector("#modalBack");
  const modalText = app.querySelector("#modalText");
  const modalWhere = app.querySelector("#modalWhere");
  let resumeAfterSave = false;

  function openCapture() {
    if (!canAnnotate()) return;
    resumeAfterSave = !audio.paused;
    player.pause();
    const pos = player.position();
    modalWhere.textContent = `${pos.chapter.label} · ${clock(pos.positionSec)}`;
    modalText.value = "";
    modalBack.hidden = false;
    setTimeout(() => modalText.focus(), 0);
  }
  function closeCapture() {
    modalBack.hidden = true;
    if (resumeAfterSave) { audio.play().catch(() => {}); resumeAfterSave = false; }
  }
  async function saveCapture() {
    const text = modalText.value.trim();
    if (!text) { closeCapture(); return; }
    const pos = player.position();
    await addAnnotation({
      bookId: book.id, chapterId: pos.chapterId, chapterIndex: pos.chapterIndex,
      positionSec: pos.positionSec, text,
    });
    await reloadNotes();
    closeCapture();
  }

  app.querySelector("#back10").addEventListener("click", () => {
    audio.currentTime = Math.max(0, (audio.currentTime || 0) - 10);
  });
  app.querySelector("#fwd10").addEventListener("click", () => {
    const max = isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(max, (audio.currentTime || 0) + 10);
  });

  app.querySelector("#commentBtn").addEventListener("click", openCapture);
  app.querySelector("#modalCancel").addEventListener("click", closeCapture);
  app.querySelector("#modalSave").addEventListener("click", saveCapture);
  modalBack.addEventListener("click", (e) => { if (e.target === modalBack) closeCapture(); });
  modalText.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeCapture(); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveCapture(); }
  });

  // ---------- commentary overlay ----------
  const cOverlay = app.querySelector("#cOverlay");
  function showCommentary(a) {
    player.pause();
    app.querySelector("#cWhere").textContent = clock(a.positionSec);
    app.querySelector("#cText").textContent = a.text;
    cOverlay.hidden = false;
  }
  app.querySelector("#cResume").addEventListener("click", () => {
    cOverlay.hidden = true;
    audio.play().catch(() => {});
  });

  // ---------- notes list ----------
  const notelist = app.querySelector("#notelist");
  const notesEmpty = app.querySelector("#notesEmpty");
  const noteCount = app.querySelector("#noteCount");

  async function reloadNotes() {
    allNotes = await getAnnotations(book.id);
    refreshChapterNotes(player.index);
    renderNotes();
  }
  function renderNotes() {
    noteCount.textContent = allNotes.length ? `(${allNotes.length})` : "";
    notesEmpty.hidden = allNotes.length > 0;
    notelist.innerHTML = allNotes.map((a) => `
      <li data-id="${esc(a.id)}">
        <button class="note-jump" data-i="${a.chapterIndex}" data-sec="${a.positionSec}">
          <span class="note-where">${esc(book.chapters[a.chapterIndex]?.label || "")} · ${clock(a.positionSec)}</span>
          <span class="note-text">${esc(a.text)}</span>
        </button>
        <button class="note-del" data-id="${esc(a.id)}" title="Delete">✕</button>
      </li>`).join("");
    notelist.querySelectorAll(".note-jump").forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i), sec = Number(b.dataset.sec);
        player.load(i, Math.max(0, sec - 1), true);
        now.textContent = "Now playing — " + book.chapters[i].label;
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    notelist.querySelectorAll(".note-del").forEach((b) => {
      b.addEventListener("click", async () => {
        await deleteAnnotation(b.dataset.id);
        await reloadNotes();
      });
    });
  }

  app.querySelector("#expMd").addEventListener("click", () => downloadTranscript(book, slug));
  app.querySelector("#expJson").addEventListener("click", () => downloadJSON(book));

  // ---------- offline download ----------
  const offlineBtn = app.querySelector("#offline");
  let busy = false;
  async function refreshOfflineBtn() {
    const cached = await isBookCached(book, slug).catch(() => false);
    offlineBtn.textContent = cached ? "✓ Available offline — remove" : "Download for offline";
    offlineBtn.dataset.cached = cached ? "1" : "";
  }
  offlineBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      if (offlineBtn.dataset.cached) {
        await removeBook(book);
      } else {
        await downloadBook(book, slug, (f) => {
          offlineBtn.textContent = `Downloading… ${Math.round(f * 100)}%`;
        });
      }
    } catch (e) {
      offlineBtn.textContent = "Download failed — retry";
      busy = false;
      return;
    }
    busy = false;
    await refreshOfflineBtn();
  });
  refreshOfflineBtn();

  await reloadNotes();
}
