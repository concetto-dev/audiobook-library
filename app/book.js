import { Player } from "./player.js";
import { fmtDuration, clock, esc } from "./util.js";
import { savePosition, loadPosition, clearPosition, setLastBook } from "./storage.js";

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
        <button class="linkbtn" id="restart">Start over</button>
      </div>

      ${book.sourceUrl ? `<footer>Source text at <a href="${esc(book.sourceUrl)}">the original publisher</a>.</footer>` : ""}
    </div>

    <div class="playerbar" id="bar">
      <div class="inner"><audio id="audio" controls preload="metadata"></audio></div>
    </div>`;

  const audio = app.querySelector("#audio");
  const now = app.querySelector("#now");
  const tracksEl = app.querySelector("#tracks");

  const setActive = (i, ch) => {
    now.textContent = ch.label;
    tracksEl.querySelectorAll(".track").forEach((el) =>
      el.classList.toggle("active", Number(el.dataset.i) === i));
  };

  const player = new Player(book, slug, audio, {
    onPosition: (p) => savePosition(book.id, p),
    onChapterChange: setActive,
  });

  // Restore last position (no autoplay — browsers require a gesture).
  if (hasResume) player.load(saved.chapterIndex, saved.positionSec, false);
  else player.load(0, 0, false);

  app.querySelector("#cont").addEventListener("change", (e) => {
    player.autoAdvance = e.target.checked;
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
}
