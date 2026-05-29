// Export layer. Reconstructs the author <-> listener dialogue from stored
// interjections in several shapes. Transcripts are plain prose with no
// time alignment, so we place each interjection at its proportional point in
// the chapter (positionSec / durationSec -> paragraph index). `textAnchor`
// (reserved in the annotation schema) will let this become word-exact later
// without changing the export forms below.

import { getAnnotations, exportAnnotations } from "./annotations.js";
import { clock } from "./util.js";

function download(name, text, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function chapterText(slug, ch) {
  if (!ch.transcript) return "";
  try {
    return await fetch(`books/${encodeURIComponent(slug)}/${ch.transcript}`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.text() : ""));
  } catch (_) {
    return "";
  }
}

// Split into paragraphs, then drop each chapter's interjections in at the
// paragraph boundary nearest their proportional time offset.
function weave(paragraphs, durationSec, notes) {
  const n = paragraphs.length || 1;
  const slot = (sec) => {
    const frac = durationSec > 0 ? Math.min(1, Math.max(0, sec / durationSec)) : 0;
    return Math.round(frac * n);
  };
  const bySlot = new Map();
  for (const a of notes) {
    const s = slot(a.positionSec);
    if (!bySlot.has(s)) bySlot.set(s, []);
    bySlot.get(s).push(a);
  }
  const out = [];
  const flush = (i) => {
    for (const a of bySlot.get(i) || []) {
      out.push(`> **[you · ${clock(a.positionSec)}]** ${a.text}`);
    }
  };
  flush(0);
  paragraphs.forEach((p, i) => {
    out.push(p);
    flush(i + 1);
  });
  return out;
}

export async function buildTranscript(book, slug) {
  const all = await getAnnotations(book.id);
  const lines = [`# ${book.title}`];
  if (book.author) lines.push(`*${book.author}*`);
  lines.push("", "_Interleaved with your interjections._", "");

  for (let i = 0; i < book.chapters.length; i++) {
    const ch = book.chapters[i];
    const notes = all.filter((a) => a.chapterIndex === i);
    lines.push(`\n## ${ch.label}\n`);
    const raw = (await chapterText(slug, ch)).trim();
    const paras = raw ? raw.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
    if (!paras.length && notes.length) {
      // No transcript available — still surface the interjections in order.
      for (const a of notes.sort((x, y) => x.positionSec - y.positionSec)) {
        lines.push(`> **[you · ${clock(a.positionSec)}]** ${a.text}`);
      }
      continue;
    }
    lines.push(...weave(paras, ch.durationSec, notes));
  }
  return lines.join("\n\n");
}

export async function downloadTranscript(book, slug) {
  const md = await buildTranscript(book, slug);
  download(`${slug}-interleaved.md`, md, "text/markdown");
}

export async function downloadJSON(book) {
  const payload = await exportAnnotations(book.id);
  download(`${slug(book)}-annotations.json`, JSON.stringify(payload, null, 2), "application/json");
}
function slug(book) { return (book.id || "book").replace(/[^a-z0-9_-]+/gi, "-"); }
