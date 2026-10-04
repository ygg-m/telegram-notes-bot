import { describe, expect, it } from "vitest";
import { parseMessage } from "../src/parse.js";

describe("parseMessage", () => {
  it("extracts tags, priority and links", () => {
    const r = parseMessage("#buy #Home #prio1 https://shop.example/p/1 nice lamp");
    expect(r).toEqual({
      ok: true,
      tags: ["buy", "home"],
      priority: 1,
      links: ["https://shop.example/p/1"],
      text: "#buy #Home #prio1 https://shop.example/p/1 nice lamp",
    });
  });

  it("allows tags anywhere and dedupes them", () => {
    const r = parseMessage("get milk #buy then #BUY again");
    expect(r).toMatchObject({ ok: true, tags: ["buy"] });
  });

  it("supports accents, dashes and underscores", () => {
    const r = parseMessage("#compras #casa-nova #to_do #ação");
    expect(r).toMatchObject({ ok: true, tags: ["compras", "casa-nova", "to_do", "ação"] });
  });

  it("returns no tags and null priority for plain text", () => {
    expect(parseMessage("just a thought")).toMatchObject({ ok: true, tags: [], priority: null });
  });

  it("rejects conflicting priorities", () => {
    expect(parseMessage("#prio1 #prio3 x")).toEqual({ ok: false, error: "conflicting-priority" });
  });

  it("accepts a repeated identical priority", () => {
    expect(parseMessage("#prio2 #PRIO2")).toMatchObject({ ok: true, priority: 2, tags: [] });
  });

  it("treats prio0 and prio10 as plain tags", () => {
    expect(parseMessage("#prio0 #prio10")).toMatchObject({
      ok: true,
      priority: null,
      tags: ["prio0", "prio10"],
    });
  });

  it("does not treat hashes inside urls as tags", () => {
    const r = parseMessage("https://example.com/page#section #buy");
    expect(r).toMatchObject({
      ok: true,
      tags: ["buy"],
      links: ["https://example.com/page#section"],
    });
  });

  it("trims trailing punctuation from links", () => {
    const r = parseMessage("see (https://a.example/x). ok");
    expect(r).toMatchObject({ ok: true, links: ["https://a.example/x"] });
  });

  it("ignores a lone hash and numeric-only hash", () => {
    expect(parseMessage("# and #123")).toMatchObject({ ok: true, tags: [] });
  });
});
