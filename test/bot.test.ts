import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN, GROUP, STRANGER, makeHarness } from "./harness.js";

let h: Awaited<ReturnType<typeof makeHarness>>;

beforeEach(async () => {
  h = await makeHarness({ "x.example": "Nice Lamp" });
});

describe("bot access", () => {
  it("ignores everything from non-members", async () => {
    await h.say(STRANGER, "#buy hello");
    await h.say(STRANGER, "/list");
    expect(h.calls).toHaveLength(0);
  });

  it("whoami and join work for strangers", async () => {
    await h.say(STRANGER, "/whoami", STRANGER, "private");
    expect(h.sent()[0]).toContain("9");
    await h.say(STRANGER, "/join bad", STRANGER, "private");
    expect(h.sent()[1]).toContain("invalid");
  });

  it("explains where entries are saved instead of staying silent", async () => {
    await h.say(ADMIN, "#buy lamp", ADMIN, "private");
    expect(h.last()).toContain("Add me to a group");
    await h.say(ADMIN, "/list");
    expect(h.last()).toContain("isn't enabled");
    expect(h.store.list(GROUP, {})).toHaveLength(0);
  });

  it("carries the pool over when the group becomes a supergroup", async () => {
    await h.say(ADMIN, "/enable");
    await h.say(ADMIN, "#buy lamp");
    await h.bot.handleUpdate({
      update_id: 9999,
      message: { message_id: 9999, date: 0, chat: { id: GROUP, type: "group" }, migrate_to_chat_id: -2002 },
    } as any);
    expect(h.store.isGroupEnabled(-2002)).toBe(true);
    expect(h.store.list(-2002, {})).toHaveLength(1);
  });

  it("requires the group to be enabled", async () => {
    await h.say(STRANGER, "#buy lamp");
    expect(h.calls).toHaveLength(0);
    await h.say(ADMIN, "/enable");
    expect(h.sent()[0]).toContain("enabled");
  });

  it("invites a second member who can then save entries", async () => {
    await h.say(ADMIN, "/enable");
    await h.addMember(5);
    expect(h.last()).toContain("Welcome");
    await h.say(5, "#buy shoes");
    expect(h.store.list(GROUP, {})[0]).toMatchObject({ authorId: 5, tags: ["buy"] });
  });

  it("only admins can use admin commands", async () => {
    await h.say(ADMIN, "/enable");
    await h.addMember(5);
    h.calls.length = 0;
    await h.say(5, "/invite");
    await h.say(5, "/users");
    expect(h.calls).toHaveLength(0);
  });
});

describe("bot basics", () => {
  beforeEach(async () => {
    await h.say(ADMIN, "/enable");
  });

  it("saves tagged and untagged messages, then lists with filters", async () => {
    await h.say(ADMIN, "#buy #home #prio1 https://x.example/a lamp");
    await h.say(ADMIN, "remember to call mom");
    await h.say(ADMIN, "#buy #garden hose");

    expect(h.calls.some((c) => c.method === "editMessageText" && c.payload.text.includes("Nice Lamp"))).toBe(true);

    h.calls.length = 0;
    await h.say(ADMIN, "/list #buy #home");
    expect(h.sent()).toHaveLength(1);
    expect(h.sent()[0]).toContain("Nice Lamp");
    expect(h.sent()[0]).not.toContain("hose");

    h.calls.length = 0;
    await h.say(ADMIN, "/list #untagged");
    expect(h.sent()[0]).toContain("remember to call mom");
  });

  it("rejects conflicting priorities without saving", async () => {
    await h.say(ADMIN, "#prio1 #prio2 x");
    expect(h.last()).toContain("Only one #prio");
    expect(h.store.list(GROUP, {})).toHaveLength(0);
  });

  it("marks done, deletes and restores via buttons", async () => {
    await h.say(ADMIN, "#buy lamp");
    await h.press("done:1");
    expect(h.store.get(GROUP, 1)!.status).toBe("done");
    await h.press("del:1");
    expect(h.store.get(GROUP, 1)!.deleted).toBe(true);
    await h.press("undo:1");
    expect(h.store.get(GROUP, 1)!.deleted).toBe(false);
  });

  it("re-parses an edited message", async () => {
    await h.say(ADMIN, "#buy lamp");
    await h.edit(ADMIN, h.store.get(GROUP, 1)!.messageId!, "#home #prio2 lamp");
    expect(h.store.get(GROUP, 1)).toMatchObject({ tags: ["home"], priority: 2 });
  });

  it("exports a CSV document for admins", async () => {
    await h.say(ADMIN, "#buy lamp");
    await h.say(ADMIN, "/export");
    expect(h.calls.some((c) => c.method === "sendDocument")).toBe(true);
  });
});
