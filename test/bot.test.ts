import { beforeEach, describe, expect, it } from "vitest";
import { createBot } from "../src/bot.js";
import { Store } from "../src/store.js";

const GROUP = -1001;
const ADMIN = 1;
const STRANGER = 9;

let calls: { method: string; payload: any }[];
let update = 0;
let msgId = 0;
let store: Store;
let bot: ReturnType<typeof createBot>;

beforeEach(async () => {
  calls = [];
  store = new Store(":memory:");
  bot = createBot(
    "123:fake",
    { store, adminId: ADMIN, fetchTitle: async (u) => (u.includes("x.example") ? "Nice Lamp" : undefined) },
    {
      id: 999, is_bot: true, first_name: "Bot", username: "notes_bot", can_join_groups: true,
      can_read_all_group_messages: true, supports_inline_queries: false, can_connect_to_business: false,
      has_main_web_app: false,
    } as any,
  );
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const result = ["sendMessage", "editMessageText"].includes(method)
      ? { message_id: ++msgId + 1000, date: 0, chat: { id: (payload as any).chat_id, type: "supergroup" }, text: "" }
      : true;
    return { ok: true, result } as any;
  });
  await bot.init();
});

async function say(userId: number, text: string, chatId = GROUP, chatType = "supergroup") {
  const cmd = /^\/\w+/.exec(text);
  await bot.handleUpdate({
    update_id: ++update,
    message: {
      message_id: ++msgId,
      date: 0,
      chat: { id: chatId, type: chatType },
      from: { id: userId, is_bot: false, first_name: `U${userId}` },
      text,
      ...(cmd ? { entities: [{ type: "bot_command", offset: 0, length: cmd[0].length }] } : {}),
    },
  } as any);
}

const sent = () => calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text as string);

describe("bot", () => {
  it("ignores everything from non-members", async () => {
    await say(STRANGER, "#buy hello");
    await say(STRANGER, "/list");
    expect(calls).toHaveLength(0);
  });

  it("whoami and join work for strangers", async () => {
    await say(STRANGER, "/whoami", STRANGER, "private");
    expect(sent()[0]).toContain("9");
    await say(STRANGER, "/join bad", STRANGER, "private");
    expect(sent()[1]).toContain("invalid");
  });

  it("requires the group to be enabled", async () => {
    await say(ADMIN, "#buy lamp");
    expect(calls).toHaveLength(0);
    await say(ADMIN, "/enable");
    expect(sent()[0]).toContain("enabled");
  });

  it("saves tagged and untagged messages, then lists with filters", async () => {
    await say(ADMIN, "/enable");
    await say(ADMIN, "#buy #home #prio1 https://x.example/a lamp");
    await say(ADMIN, "remember to call mom");
    await say(ADMIN, "#buy #garden hose");

    // title was fetched and the confirmation edited
    expect(calls.some((c) => c.method === "editMessageText" && c.payload.text.includes("Nice Lamp"))).toBe(true);

    calls.length = 0;
    await say(ADMIN, "/list #buy #home");
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toContain("Nice Lamp");
    expect(sent()[0]).not.toContain("hose");

    calls.length = 0;
    await say(ADMIN, "/list #untagged");
    expect(sent()[0]).toContain("remember to call mom");
  });

  it("rejects conflicting priorities without saving", async () => {
    await say(ADMIN, "/enable");
    await say(ADMIN, "#prio1 #prio2 x");
    expect(sent().at(-1)).toContain("Only one #prio");
    expect(store.list(GROUP, {})).toHaveLength(0);
  });

  it("invites a second member who can then save entries", async () => {
    await say(ADMIN, "/enable");
    await say(ADMIN, "/invite");
    const code = /<code>(\w+)<\/code>/.exec(sent().at(-1)!)![1]!;
    await say(5, `/join ${code}`, 5, "private");
    expect(sent().at(-1)).toContain("Welcome");
    await say(5, "#buy shoes");
    expect(store.list(GROUP, {})[0]).toMatchObject({ authorId: 5, tags: ["buy"] });
  });

  it("only admins can use admin commands", async () => {
    await say(ADMIN, "/enable");
    await say(ADMIN, "/invite");
    const code = /<code>(\w+)<\/code>/.exec(sent().at(-1)!)![1]!;
    await say(5, `/join ${code}`, 5, "private");
    calls.length = 0;
    await say(5, "/invite");
    await say(5, "/users");
    expect(calls).toHaveLength(0);
  });

  it("marks done, deletes and restores via buttons", async () => {
    await say(ADMIN, "/enable");
    await say(ADMIN, "#buy lamp");
    const press = (data: string) =>
      bot.handleUpdate({
        update_id: ++update,
        callback_query: {
          id: String(update),
          chat_instance: "x",
          from: { id: ADMIN, is_bot: false, first_name: "A" },
          data,
          message: { message_id: 50, date: 0, chat: { id: GROUP, type: "supergroup" } },
        },
      } as any);
    await press("done:1");
    expect(store.get(GROUP, 1)!.status).toBe("done");
    await press("del:1");
    expect(store.get(GROUP, 1)!.deleted).toBe(true);
    await press("undo:1");
    expect(store.get(GROUP, 1)!.deleted).toBe(false);
  });

  it("re-parses an edited message", async () => {
    await say(ADMIN, "/enable");
    await say(ADMIN, "#buy lamp");
    const original = store.get(GROUP, 1)!;
    await bot.handleUpdate({
      update_id: ++update,
      edited_message: {
        message_id: original.messageId,
        date: 0,
        edit_date: 1,
        chat: { id: GROUP, type: "supergroup" },
        from: { id: ADMIN, is_bot: false, first_name: "A" },
        text: "#home #prio2 lamp",
      },
    } as any);
    expect(store.get(GROUP, 1)).toMatchObject({ tags: ["home"], priority: 2 });
  });

  it("exports a CSV document for admins", async () => {
    await say(ADMIN, "/enable");
    await say(ADMIN, "#buy lamp");
    await say(ADMIN, "/export");
    expect(calls.some((c) => c.method === "sendDocument")).toBe(true);
  });
});
