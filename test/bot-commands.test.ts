import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN, GROUP, STRANGER, makeHarness } from "./harness.js";

let h: Awaited<ReturnType<typeof makeHarness>>;

beforeEach(async () => {
  h = await makeHarness({ "x.example": "Nice Lamp" });
  await h.say(ADMIN, "/enable");
  h.calls.length = 0;
});

describe("entry commands", () => {
  it("/done, /reopen and /del change status and answer with the entry", async () => {
    await h.say(ADMIN, "#buy lamp");
    await h.say(ADMIN, "/done 1");
    expect(h.store.get(GROUP, 1)!.status).toBe("done");
    expect(h.last()).toContain("✅");
    await h.say(ADMIN, "/reopen #1");
    expect(h.store.get(GROUP, 1)!.status).toBe("open");
    await h.say(ADMIN, "/del 1");
    expect(h.store.get(GROUP, 1)!.deleted).toBe(true);
    expect(h.last()).toContain("Deleted #1");
  });

  it("reports unknown ids and non-numeric ids", async () => {
    await h.say(ADMIN, "/done 42");
    expect(h.last()).toContain("No entry #42");
    await h.say(ADMIN, "/del abc");
    expect(h.last()).toContain("numeric id");
    await h.say(ADMIN, "/done");
    expect(h.last()).toContain("numeric id");
  });

  it("/tag adds tags and a priority", async () => {
    await h.say(ADMIN, "lamp #buy");
    await h.say(ADMIN, "/tag 1 #home #prio2");
    expect(h.store.get(GROUP, 1)).toMatchObject({ tags: ["buy", "home"], priority: 2 });
    await h.say(ADMIN, "/tag 99 #x");
    expect(h.last()).toContain("No entry #99");
    await h.say(ADMIN, "/tag 1");
    expect(h.last()).toContain("Usage: /tag");
    await h.say(ADMIN, "/tag 1 #prio1 #prio2");
    expect(h.last()).toContain("Only one #prio");
  });

  it("/list sorts by priority and filters by priority tag", async () => {
    await h.say(ADMIN, "#buy later");
    await h.say(ADMIN, "#buy #prio2 soon");
    await h.say(ADMIN, "#buy #prio1 now");
    h.calls.length = 0;
    await h.say(ADMIN, "/list #buy");
    const text = h.last();
    expect(text.indexOf("now")).toBeLessThan(text.indexOf("soon"));
    expect(text.indexOf("soon")).toBeLessThan(text.indexOf("later"));
    h.calls.length = 0;
    await h.say(ADMIN, "/list #prio2");
    expect(h.last()).toContain("soon");
    expect(h.last()).not.toContain("now");
  });

  it("/list hides done entries and /all shows them", async () => {
    await h.say(ADMIN, "#buy kept");
    await h.say(ADMIN, "#buy finished");
    await h.say(ADMIN, "/done 2");
    h.calls.length = 0;
    await h.say(ADMIN, "/list #buy");
    expect(h.last()).toContain("kept");
    expect(h.last()).not.toContain("finished");
    await h.say(ADMIN, "/all #buy");
    expect(h.last()).toContain("finished");
  });

  it("/list says when nothing matches and rejects conflicting priorities", async () => {
    await h.say(ADMIN, "/list #nothing");
    expect(h.last()).toBe("Nothing here.");
    await h.say(ADMIN, "/list #prio1 #prio2");
    expect(h.last()).toContain("Only one #prio");
  });

  it("/search finds done entries too, and needs a query", async () => {
    await h.say(ADMIN, "#buy blue guitar cords");
    await h.say(ADMIN, "/done 1");
    await h.say(ADMIN, "/search guitar");
    expect(h.last()).toContain("guitar");
    await h.say(ADMIN, "/search");
    expect(h.last()).toContain("Usage: /search");
  });

  it("/tags lists open tag counts", async () => {
    await h.say(ADMIN, "/tags");
    expect(h.last()).toBe("No tags yet.");
    await h.say(ADMIN, "#buy #home a");
    await h.say(ADMIN, "#buy b");
    await h.say(ADMIN, "/tags");
    expect(h.last()).toBe("#buy (2)\n#home (1)");
  });

  it("does not save commands, even unknown ones", async () => {
    await h.say(ADMIN, "/whatever #buy");
    expect(h.store.list(GROUP, {})).toHaveLength(0);
  });

  it("escapes HTML in saved text", async () => {
    await h.say(ADMIN, "#buy <b>bold</b> & more");
    expect(h.sent()[0]).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; more");
  });

  it("splits very long lists across several messages", async () => {
    for (let i = 0; i < 60; i++) await h.say(ADMIN, `#bulk ${"word ".repeat(15)}${i}`);
    h.calls.length = 0;
    await h.say(ADMIN, "/list #bulk");
    expect(h.sent().length).toBeGreaterThan(1);
    expect(h.sent().every((m) => m.length <= 4096)).toBe(true);
  });
});

describe("saving and editing", () => {
  it("replies to the original message and shows the fetched title", async () => {
    await h.say(ADMIN, "#buy https://x.example/a");
    const reply = h.calls.find((c) => c.method === "sendMessage")!;
    expect(reply.payload.reply_parameters.message_id).toBeDefined();
    const edited = h.calls.find((c) => c.method === "editMessageText")!;
    expect(edited.payload.text).toContain("Nice Lamp");
    expect(h.store.get(GROUP, 1)!.titles).toEqual({ "https://x.example/a": "Nice Lamp" });
  });

  it("saves fine when the title lookup fails", async () => {
    await h.say(ADMIN, "#buy https://unknown.example/a");
    expect(h.store.get(GROUP, 1)!.links).toEqual(["https://unknown.example/a"]);
    expect(h.calls.some((c) => c.method === "editMessageText")).toBe(false);
  });

  it("an edit that adds a conflicting priority is rejected and keeps the entry", async () => {
    await h.say(ADMIN, "#buy #prio1 lamp");
    const id = h.store.get(GROUP, 1)!.messageId!;
    await h.edit(ADMIN, id, "#prio1 #prio2 lamp");
    expect(h.last()).toContain("Only one #prio");
    expect(h.store.get(GROUP, 1)).toMatchObject({ priority: 1, tags: ["buy"] });
  });

  it("an edit of an unsaved message does nothing", async () => {
    await h.edit(ADMIN, 777, "#buy hello");
    expect(h.calls).toHaveLength(0);
  });

  it("stores the author of each entry", async () => {
    await h.addMember(5);
    await h.say(5, "#buy shoes");
    expect(h.store.get(GROUP, 1)!.authorName).toBe("U5");
  });
});

describe("buttons", () => {
  it("ignore non-members, disabled groups and malformed data", async () => {
    await h.say(ADMIN, "#buy lamp");
    await h.press("done:1", STRANGER);
    await h.press("done:1", ADMIN, -555);
    await h.press("done:abc");
    await h.press("bogus:1");
    expect(h.store.get(GROUP, 1)!.status).toBe("open");
  });

  it("reopen flips a done entry back", async () => {
    await h.say(ADMIN, "#buy lamp");
    await h.press("done:1");
    await h.press("open:1");
    expect(h.store.get(GROUP, 1)!.status).toBe("open");
  });

  it("edit the message in place with the matching button", async () => {
    await h.say(ADMIN, "#buy lamp");
    h.calls.length = 0;
    await h.press("del:1");
    const edit = h.calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("Deleted #1");
    expect(JSON.stringify(edit.payload.reply_markup)).toContain("undo:1");
  });
});

describe("pools are isolated per group", () => {
  it("never shows entries from another enabled group", async () => {
    await h.say(ADMIN, "#buy here");
    await h.say(ADMIN, "/enable", -2002);
    await h.say(ADMIN, "#buy there", -2002);
    h.calls.length = 0;
    await h.say(ADMIN, "/list #buy");
    expect(h.last()).toContain("here");
    expect(h.last()).not.toContain("there");
    expect(h.store.get(-2002, 1)!.text).toBe("#buy there");
  });
});

describe("admin management", () => {
  it("/users lists members with admin marker", async () => {
    await h.addMember(5);
    await h.say(ADMIN, "/users");
    expect(h.last()).toContain("<code>1</code>");
    expect(h.last()).toContain("(admin)");
    expect(h.last()).toContain("<code>5</code>");
  });

  it("/revoke removes access but keeps entries", async () => {
    await h.addMember(5);
    await h.say(5, "#buy shoes");
    await h.say(ADMIN, "/revoke 5");
    expect(h.last()).toContain("Revoked 5");
    h.calls.length = 0;
    await h.say(5, "#buy more");
    expect(h.calls).toHaveLength(0);
    expect(h.store.list(GROUP, {})).toHaveLength(1);
  });

  it("/revoke validates its argument and refuses self-revocation", async () => {
    await h.say(ADMIN, "/revoke");
    expect(h.last()).toContain("numeric id");
    await h.say(ADMIN, `/revoke ${ADMIN}`);
    expect(h.last()).toContain("can't revoke yourself");
    await h.say(ADMIN, "/revoke 12345");
    expect(h.last()).toContain("No such member");
    expect(h.store.isAdmin(ADMIN)).toBe(true);
  });

  it("/promote lets a member use admin commands", async () => {
    await h.addMember(5);
    await h.say(ADMIN, "/promote 5");
    expect(h.last()).toContain("Promoted 5");
    await h.say(5, "/invite");
    expect(h.last()).toContain("Invite code");
  });

  it("/disable stops saving but keeps existing entries", async () => {
    await h.say(ADMIN, "#buy kept");
    await h.say(ADMIN, "/disable");
    await h.say(ADMIN, "#buy ignored");
    expect(h.store.list(GROUP, {})).toHaveLength(1);
    expect(h.last()).toContain("isn't enabled");
    await h.say(ADMIN, "/enable");
    await h.say(ADMIN, "/list");
    expect(h.last()).toContain("kept");
  });

  it("/enable only works in groups", async () => {
    await h.say(ADMIN, "/enable", ADMIN, "private");
    expect(h.last()).toContain("Use this command in a group");
    expect(h.store.isGroupEnabled(ADMIN)).toBe(false);
  });

  it("/join needs a code, and a code cannot be reused", async () => {
    await h.say(STRANGER, "/join", STRANGER, "private");
    expect(h.last()).toContain("Usage: /join");
    await h.say(ADMIN, "/invite");
    const code = /<code>(\w+)<\/code>/.exec(h.last())![1]!;
    await h.say(5, `/join ${code}`, 5, "private");
    await h.say(6, `/join ${code}`, 6, "private");
    expect(h.last()).toContain("invalid");
    expect(h.store.isMember(6)).toBe(false);
  });

  it("/export sends a CSV document", async () => {
    await h.say(ADMIN, "#buy lamp");
    await h.say(ADMIN, "/del 1");
    await h.say(ADMIN, "/export");
    expect(h.calls.find((c) => c.method === "sendDocument")).toBeDefined();
  });

  it("/help is available to members and shows the commands", async () => {
    await h.say(ADMIN, "/help");
    expect(h.last()).toContain("/list");
    await h.say(STRANGER, "/help");
    expect(h.sent()).toHaveLength(1);
  });
});
