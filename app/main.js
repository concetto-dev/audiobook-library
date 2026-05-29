import { renderLibrary } from "./library.js";
import { renderBook } from "./book.js";

const app = document.getElementById("app");

async function route() {
  const h = location.hash.replace(/^#\/?/, "");
  window.scrollTo(0, 0);
  if (h.startsWith("book/")) {
    await renderBook(app, decodeURIComponent(h.slice("book/".length)));
  } else {
    await renderLibrary(app);
  }
}

window.addEventListener("hashchange", route);
route();
