import { fmtDuration, esc } from "./util.js";
import { loadPosition } from "./storage.js";

// Optional private overlay: deployments that should carry extra books (e.g. a
// login-gated Vercel copy) ship a books-private.json alongside books.json. It
// 404s on the public site and is simply ignored there, so the same code serves
// both the public and the private library from one manifest convention.
async function loadManifest() {
  const base = await fetch("books.json", { cache: "no-cache" }).then((r) => r.json());
  try {
    const priv = await fetch("books-private.json", { cache: "no-cache" });
    if (priv.ok) {
      const extra = await priv.json();
      const have = new Set(base.books.map((b) => b.id));
      for (const b of extra.books || []) if (!have.has(b.id)) base.books.push(b);
    }
  } catch (_) { /* no private overlay on this deployment */ }
  return base;
}

export async function renderLibrary(app) {
  let lib;
  try {
    lib = await loadManifest();
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
      <footer>Narrated readings (text-to-speech).</footer>
    </div>`;
}
