export type ParseResult =
  | { ok: true; tags: string[]; priority: number | null; links: string[]; text: string }
  | { ok: false; error: "conflicting-priority" };

const URL_RE = /https?:\/\/[^\s<>]+/giu;
const TAG_RE = /(?<![\p{L}\p{N}_&])#([\p{L}\p{N}_-]+)/gu;
const PRIO_RE = /^prio([1-9])$/;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/u;

export function parseMessage(text: string): ParseResult {
  const links = (text.match(URL_RE) ?? []).map((l) => l.replace(TRAILING_PUNCT, ""));
  const withoutLinks = text.replace(URL_RE, " ");

  const tags: string[] = [];
  let priority: number | null = null;

  for (const m of withoutLinks.matchAll(TAG_RE)) {
    const tag = m[1]!.toLowerCase();
    if (!/\p{L}/u.test(tag)) continue;
    const prio = PRIO_RE.exec(tag);
    if (prio) {
      const n = Number(prio[1]);
      if (priority !== null && priority !== n) return { ok: false, error: "conflicting-priority" };
      priority = n;
    } else if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return { ok: true, tags, priority, links, text };
}
