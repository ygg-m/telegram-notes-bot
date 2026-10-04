import { esc } from "./i18n/index.js";
import type { Entry } from "./store.js";

const URL_RE = /https?:\/\/[^\s<>]+/giu;
const TAG_RE = /(?<![\p{L}\p{N}_&])#[\p{L}\p{N}_-]+/gu;
const MAX_TEXT = 80;

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function leftoverText(text: string): string {
  const stripped = text.replace(URL_RE, " ").replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
  return stripped.length > MAX_TEXT ? stripped.slice(0, MAX_TEXT - 1) + "…" : stripped;
}

export function entryLine(e: Entry): string {
  const parts: string[] = [];
  const labels = [e.priority !== null ? `P${e.priority}` : "", ...e.tags.map((t) => `#${t}`)].filter(Boolean);
  parts.push(`${e.status === "done" ? "✅ " : ""}<b>#${e.id}</b>${labels.length ? " " + esc(labels.join(" ")) : ""}`);

  const body: string[] = [];
  for (const link of e.links) {
    body.push(`<a href="${esc(link).replace(/"/g, "&quot;")}">${esc(e.titles[link] || host(link))}</a>`);
  }
  const rest = leftoverText(e.text);
  if (rest) body.push(esc(rest));
  if (body.length) parts.push(body.join(" "));

  parts.push(esc(e.authorName));
  return parts.join(" · ");
}

/** Groups lines into messages no longer than `limit` characters (Telegram caps at 4096). */
export function chunkLines(lines: string[], limit = 3800): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur && cur.length + 1 + line.length > limit) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(entries: Entry[]): string {
  const rows = [["id", "status", "deleted", "priority", "tags", "author", "created_at", "links", "text"]];
  for (const e of entries) {
    rows.push([
      String(e.id),
      e.status,
      e.deleted ? "1" : "0",
      e.priority === null ? "" : String(e.priority),
      e.tags.join(" "),
      e.authorName,
      new Date(e.createdAt * 1000).toISOString(),
      e.links.join(" "),
      e.text,
    ]);
  }
  return rows.map((r) => r.map(csvField).join(",")).join("\n");
}
