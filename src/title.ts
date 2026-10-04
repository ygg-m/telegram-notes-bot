const PRIVATE_HOST =
  /^(localhost|.*\.(local|internal|localhost)|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1?\]?$|\[?f[cd][0-9a-f]{2}:)/i;

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

/** Best-effort page title lookup. Never throws; returns undefined on any problem. */
export async function fetchTitle(url: string, timeoutMs = 4000): Promise<string | undefined> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return undefined;
    const res = await fetch(u, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (compatible; notes-bot)", accept: "text/html" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) return undefined;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/title>/i.test(html)) break;
    }
    await reader.cancel().catch(() => {});
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = m?.[1] ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
    return title ? title.slice(0, 120) : undefined;
  } catch {
    return undefined;
  }
}
