import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/store.js";

const CHAT = -100;
let s: Store;
const base = { chatId: CHAT, authorId: 1, authorName: "Ana", links: [], titles: {}, messageId: 1 };

function add(text: string, tags: string[], priority: number | null = null, messageId = Math.random()) {
  return s.addEntry({ ...base, text, tags, priority, messageId });
}

beforeEach(() => {
  s = new Store(":memory:");
});

describe("members and invites", () => {
  it("bootstraps admin and recognises members", () => {
    s.ensureAdmin(1, "Ana");
    expect(s.isAdmin(1)).toBe(true);
    expect(s.isMember(1)).toBe(true);
    expect(s.isMember(2)).toBe(false);
  });

  it("redeems an invite once", () => {
    s.ensureAdmin(1, "Ana");
    const code = s.createInvite(1, 1000, 500);
    expect(s.redeemInvite(code, 2, "Bo", 1200)).toBe(true);
    expect(s.isMember(2)).toBe(true);
    expect(s.redeemInvite(code, 3, "Cy", 1300)).toBe(false);
  });

  it("rejects expired and unknown invites", () => {
    s.ensureAdmin(1, "Ana");
    const code = s.createInvite(1, 1000, 500);
    expect(s.redeemInvite(code, 2, "Bo", 1600)).toBe(false);
    expect(s.redeemInvite("nope", 2, "Bo", 1100)).toBe(false);
  });

  it("revokes and promotes members", () => {
    s.ensureAdmin(1, "Ana");
    s.redeemInvite(s.createInvite(1, 0, 100), 2, "Bo", 1);
    s.promote(2);
    expect(s.isAdmin(2)).toBe(true);
    s.revoke(2);
    expect(s.isMember(2)).toBe(false);
    expect(s.isAdmin(2)).toBe(false);
  });

  it("enables and disables groups", () => {
    expect(s.isGroupEnabled(CHAT)).toBe(false);
    s.enableGroup(CHAT);
    expect(s.isGroupEnabled(CHAT)).toBe(true);
    s.disableGroup(CHAT);
    expect(s.isGroupEnabled(CHAT)).toBe(false);
  });
});

describe("entries", () => {
  it("numbers entries per pool", () => {
    expect(add("a", ["x"]).id).toBe(1);
    expect(add("b", ["x"]).id).toBe(2);
    expect(s.addEntry({ ...base, chatId: -200, text: "c", tags: [], priority: null }).id).toBe(1);
  });

  it("filters by all given tags and sorts by priority then age", () => {
    add("old none", ["buy", "home"]);
    add("p2", ["buy", "home"], 2);
    add("p1", ["buy", "home"], 1);
    add("other", ["buy"]);
    const got = s.list(CHAT, { tags: ["buy", "home"] }).map((e) => e.text);
    expect(got).toEqual(["p1", "p2", "old none"]);
  });

  it("supports priority filter via tag-like argument and untagged", () => {
    add("p1", ["buy"], 1);
    add("loose", []);
    expect(s.list(CHAT, { priority: 1 }).map((e) => e.text)).toEqual(["p1"]);
    expect(s.list(CHAT, { untagged: true }).map((e) => e.text)).toEqual(["loose"]);
  });

  it("hides done and deleted entries by default", () => {
    const a = add("a", ["x"]);
    const b = add("b", ["x"]);
    add("c", ["x"]);
    s.setStatus(CHAT, a.id, "done");
    s.softDelete(CHAT, b.id);
    expect(s.list(CHAT, {}).map((e) => e.text)).toEqual(["c"]);
    expect(s.list(CHAT, { includeDone: true }).map((e) => e.text)).toEqual(["a", "c"]);
  });

  it("restores a soft-deleted entry", () => {
    const a = add("a", ["x"]);
    s.softDelete(CHAT, a.id);
    s.restore(CHAT, a.id);
    expect(s.list(CHAT, {})).toHaveLength(1);
  });

  it("searches text", () => {
    add("blue lamp", ["buy"]);
    add("red chair", ["buy"]);
    expect(s.list(CHAT, { search: "lamp" }).map((e) => e.text)).toEqual(["blue lamp"]);
  });

  it("counts open tags", () => {
    add("a", ["buy", "home"]);
    add("b", ["buy"]);
    expect(s.tagCounts(CHAT)).toEqual([
      { tag: "buy", count: 2 },
      { tag: "home", count: 1 },
    ]);
  });

  it("updates an entry when its source message is edited", () => {
    s.addEntry({ ...base, text: "old #a", tags: ["a"], priority: null, messageId: 42 });
    const updated = s.updateByMessage({ ...base, text: "new #b", tags: ["b"], priority: 2, messageId: 42 });
    expect(updated).toMatchObject({ text: "new #b", tags: ["b"], priority: 2 });
    expect(s.list(CHAT, { tags: ["a"] })).toHaveLength(0);
  });

  it("adds tags to an existing entry", () => {
    const a = add("a", ["x"]);
    expect(s.addTags(CHAT, a.id, ["y"], 3)).toMatchObject({ tags: ["x", "y"], priority: 3 });
  });
});
