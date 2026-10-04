import { describe, expect, it } from "vitest";
import { entryLine, chunkLines, toCsv } from "../src/format.js";
import type { Entry } from "../src/store.js";

const e = (over: Partial<Entry> = {}): Entry => ({
  chatId: 1,
  id: 7,
  authorId: 1,
  authorName: "Ana",
  text: "#buy #home #prio1 https://shop.example/p/1 nice lamp",
  tags: ["buy", "home"],
  priority: 1,
  links: ["https://shop.example/p/1"],
  titles: { "https://shop.example/p/1": "Lamp <3" },
  status: "open",
  deleted: false,
  messageId: 1,
  createdAt: 0,
  ...over,
});

describe("entryLine", () => {
  it("renders id, priority, tags, linked title, leftover text and author with escaping", () => {
    expect(entryLine(e())).toBe(
      '<b>#7</b> P1 #buy #home · <a href="https://shop.example/p/1">Lamp &lt;3</a> nice lamp · Ana',
    );
  });

  it("falls back to the hostname when no title is known", () => {
    expect(entryLine(e({ titles: {} }))).toContain(">shop.example</a>");
  });

  it("marks done entries and shows plain text entries", () => {
    const line = entryLine(e({ status: "done", links: [], text: "get milk #buy", tags: ["buy"], priority: null }));
    expect(line).toBe("✅ <b>#7</b> #buy · get milk · Ana");
  });

  it("shows untagged label", () => {
    expect(entryLine(e({ links: [], text: "idea", tags: [], priority: null }))).toBe("<b>#7</b> · idea · Ana");
  });
});

describe("chunkLines", () => {
  it("splits on line boundaries under the limit", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`.padEnd(100, "x"));
    const chunks = chunkLines(lines, 350);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 350)).toBe(true);
    expect(chunks.join("\n").split("\n")).toEqual(lines);
  });
});

describe("toCsv", () => {
  it("quotes fields containing commas, quotes and newlines", () => {
    const csv = toCsv([e({ text: 'say "hi", ok\nnow' })]);
    const [header, row] = csv.split("\n", 2) as [string, string];
    expect(header).toBe("id,status,deleted,priority,tags,author,created_at,links,text");
    expect(row.startsWith("7,open,0,1,buy home,Ana,")).toBe(true);
    expect(csv).toContain('"say ""hi"", ok\nnow"');
  });
});
