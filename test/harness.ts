import { createBot } from "../src/bot.js";
import { Store } from "../src/store.js";

export const GROUP = -1001;
export const ADMIN = 1;
export const STRANGER = 9;

const BOT_INFO = {
  id: 999, is_bot: true, first_name: "Bot", username: "notes_bot", can_join_groups: true,
  can_read_all_group_messages: true, supports_inline_queries: false, can_connect_to_business: false,
  has_main_web_app: false,
} as any;

/** A bot wired to an in-memory store and a fake Telegram API that records every call. */
export async function makeHarness(titles: Record<string, string> = {}) {
  const calls: { method: string; payload: any }[] = [];
  let update = 0;
  let msgId = 0;
  const store = new Store(":memory:");
  const bot = createBot(
    "123:fake",
    {
      store,
      adminId: ADMIN,
      fetchTitle: async (u) => Object.entries(titles).find(([k]) => u.includes(k))?.[1],
    },
    BOT_INFO,
  );
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const result = ["sendMessage", "editMessageText"].includes(method)
      ? { message_id: ++msgId + 1000, date: 0, chat: { id: (payload as any).chat_id, type: "supergroup" }, text: "" }
      : true;
    return { ok: true, result } as any;
  });
  await bot.init();

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

  async function press(data: string, userId = ADMIN, chatId = GROUP) {
    await bot.handleUpdate({
      update_id: ++update,
      callback_query: {
        id: String(update),
        chat_instance: "x",
        from: { id: userId, is_bot: false, first_name: "A" },
        data,
        message: { message_id: 50, date: 0, chat: { id: chatId, type: "supergroup" } },
      },
    } as any);
  }

  async function edit(userId: number, messageId: number, text: string) {
    await bot.handleUpdate({
      update_id: ++update,
      edited_message: {
        message_id: messageId,
        date: 0,
        edit_date: 1,
        chat: { id: GROUP, type: "supergroup" },
        from: { id: userId, is_bot: false, first_name: `U${userId}` },
        text,
      },
    } as any);
  }

  /** Texts of the messages the bot sent, in order. */
  const sent = () => calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text as string);
  const last = () => sent().at(-1)!;

  /** Adds a second member through the real /invite + /join flow. */
  async function addMember(userId: number) {
    await say(ADMIN, "/invite");
    const code = /<code>(\w+)<\/code>/.exec(last())![1]!;
    await say(userId, `/join ${code}`, userId, "private");
  }

  return { bot, store, calls, say, press, edit, sent, last, addMember };
}
