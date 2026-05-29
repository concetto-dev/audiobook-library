import { fmtDuration, esc } from "./util.js";
import { loadPosition } from "./storage.js";

export async function renderLibrary(app) {
  let lib;
  try {
    lib = await fetch("books.json", { cache: "no-cache" }).then((r) => r.json());
  } catch (e) {
    app.innerHTML = `<div class="wrap"><p class="loading">Couldn't load the library.</p></div>`;
    return;
  }

  const cards = lib.books.map((b) => {
    const pos = loadPosition(b.id);
    const resume = pos ? `<span class="resume-tag">▸ In progress</span>` : "";
    return `
      <li>
        <a class="card" href="#/book/${encodeURIComponent(b.slug)}">
          ${b.kind ? `<div class="ckicker">${esc(b.kind)}</div>` : ""}
          <h2>${esc(b.title)}</h2>
          ${b.subtitle ? `<p class="csub">${esc(b.subtitle)}</p>` : ""}
          <div class="meta">${esc(b.author || "")} &middot; ${b.chapterCount} chapters &middot; ${fmtDuration(b.totalDurationSec)}</div>
          ${resume}
        </a>
      </li>`;
  }).join("");

  app.innerHTML = `
    <div class="wrap">
      <h1 class="lib-title">${esc(lib.title || "Audiobook Library")}</h1>
      <ul class="shelf">${cards}</ul>
      <footer>Narrated readings (text-to-speech). Static library hosted on GitHub Pages.</footer>
    </div>`;
}
