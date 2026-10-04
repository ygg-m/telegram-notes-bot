import { Bot, Context, InlineKeyboard, InputFile } from "grammy";
import type { Message, UserFromGetMe } from "grammy/types";
import { MEDIA_FILTERS, extractAttachment } from "./attachment.js";
import { chunkLines, entryLine, toCsv } from "./format.js";
import { strings } from "./i18n/index.js";
import { parseMessage } from "./parse.js";
import type { Entry, Store } from "./store.js";

export interface BotDeps {
  store: Store;
  adminId: number;
  fetchTitle: (url: string) => Promise<string | undefined>;
  lang?: string;
}

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

/** "12" or "#12" -> 12; anything else (including empty) -> undefined. */
function parseId(s: string): number | undefined {
  const m = /^#?(\d+)$/.exec(s.trim());
  return m ? Number(m[1]) : undefined;
}

export function createBot(token: string, deps: BotDeps, botInfo?: UserFromGetMe) {
  const { store } = deps;
  const t = strings(deps.lang);
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);

  store.ensureAdmin(deps.adminId, "Admin");

  const displayName = (ctx: Context) =>
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || ctx.from?.username || String(ctx.from?.id);
  const isGroup = (ctx: Context) => ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
  /** Entries are only handled for members acting inside an enabled group. */
  const inPool = (ctx: Context) => isGroup(ctx) && store.isGroupEnabled(ctx.chat!.id);
  const arg = (ctx: Context) => (typeof ctx.match === "string" ? ctx.match.trim() : "");

  function render(e: Entry): { text: string; markup: InlineKeyboard } {
    if (e.deleted) {
      return { text: t.deleted(e.id), markup: new InlineKeyboard().text(t.btnUndo, `undo:${e.id}`) };
    }
    const markup = new InlineKeyboard();
    if (e.status === "done") markup.text(t.btnReopen, `open:${e.id}`);
    else markup.text(t.btnDone, `done:${e.id}`);
    markup.text(t.btnDelete, `del:${e.id}`);
    return { text: entryLine(e), markup };
  }

  async function replyEntry(ctx: Context, e: Entry, prefix = "") {
    const { text, markup } = render(e);
    return ctx.reply(prefix + text, { ...HTML, reply_markup: markup });
  }

  async function replyList(ctx: Context, entries: Entry[]) {
    if (!entries.length) return ctx.reply(t.empty);
    for (const chunk of chunkLines(entries.map(entryLine))) await ctx.reply(chunk, HTML);
  }

  /** Looks up titles for links not already known; failures are simply skipped. */
  async function resolveTitles(links: string[], known: Record<string, string> = {}) {
    const titles: Record<string, string> = { ...known };
    await Promise.all(
      links
        .filter((l) => !(l in titles))
        .map(async (l) => {
          const title = await deps.fetchTitle(l);
          if (title) titles[l] = title;
        }),
    );
    return Object.fromEntries(links.filter((l) => l in titles).map((l) => [l, titles[l]!]));
  }

  // --- open to everyone ----------------------------------------------------

  bot.command("whoami", (ctx) => ctx.reply(t.whoami(ctx.from!.id), HTML));

  bot.command("join", async (ctx) => {
    const code = arg(ctx);
    if (!code) return ctx.reply(t.joinUsage, HTML);
    if (store.redeemInvite(code, ctx.from!.id, displayName(ctx))) {
      return ctx.reply(t.joined(displayName(ctx)));
    }
    return ctx.reply(t.joinFailed);
  });

  bot.on("message:migrate_to_chat_id", (ctx) => {
    store.migrateChat(ctx.chat.id, ctx.message.migrate_to_chat_id);
  });

  // --- everything below requires membership --------------------------------

  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot || !store.isMember(ctx.from.id)) return;
    await next();
  });

  bot.command(["start", "help"], (ctx) => ctx.reply(t.help, HTML));

  // admin commands
  const admin = bot.filter((ctx) => !!ctx.from && store.isAdmin(ctx.from.id));

  admin.command("enable", (ctx) => {
    if (!isGroup(ctx)) return ctx.reply(t.groupOnly);
    store.enableGroup(ctx.chat.id);
    return ctx.reply(t.groupEnabled);
  });
  admin.command("disable", (ctx) => {
    if (!isGroup(ctx)) return ctx.reply(t.groupOnly);
    store.disableGroup(ctx.chat.id);
    return ctx.reply(t.groupDisabled);
  });
  admin.command("invite", (ctx) => ctx.reply(t.invite(store.createInvite(ctx.from!.id)), HTML));
  admin.command("users", (ctx) =>
    ctx.reply(
      t.users(store.listMembers().map((m) => ({ id: m.userId, name: m.name, admin: m.isAdmin }))),
      HTML,
    ),
  );
  admin.command("revoke", (ctx) => {
    const id = parseId(arg(ctx));
    if (id === undefined) return ctx.reply(t.needId);
    if (id === ctx.from!.id) return ctx.reply(t.cannotRevokeSelf);
    return ctx.reply(store.revoke(id) ? t.revoked(id) : t.notFound);
  });
  admin.command("promote", (ctx) => {
    const id = parseId(arg(ctx));
    if (id === undefined) return ctx.reply(t.needId);
    return ctx.reply(store.promote(id) ? t.promoted(id) : t.notFound);
  });
  admin.command("export", (ctx) => {
    if (!inPool(ctx)) return ctx.reply(t.groupOnly);
    const csv = toCsv(store.all(ctx.chat.id));
    return ctx.replyWithDocument(new InputFile(Buffer.from("﻿" + csv, "utf8"), "entries.csv"));
  });

  // pool commands
  const pool = bot.filter(inPool);

  function filterFrom(text: string) {
    const parsed = parseMessage(text);
    if (!parsed.ok) return undefined;
    const untagged = parsed.tags.includes("untagged");
    return {
      tags: parsed.tags.filter((x) => x !== "untagged"),
      priority: parsed.priority ?? undefined,
      untagged,
    };
  }

  for (const [name, includeDone] of [["list", false], ["all", true]] as const) {
    pool.command(name, async (ctx) => {
      const f = filterFrom(arg(ctx));
      if (!f) return ctx.reply(t.conflictingPriority);
      return replyList(ctx, store.list(ctx.chat.id, { ...f, includeDone }));
    });
  }

  pool.command("search", (ctx) => {
    const q = arg(ctx);
    if (!q) return ctx.reply(t.searchUsage, HTML);
    return replyList(ctx, store.list(ctx.chat.id, { search: q, includeDone: true }));
  });

  pool.command("tags", (ctx) => {
    const rows = store.tagCounts(ctx.chat.id);
    return ctx.reply(rows.length ? rows.map((r) => `#${r.tag} (${r.count})`).join("\n") : t.noTags);
  });

  const idCommands: [string, (chatId: number, id: number) => boolean][] = [
    ["done", (c, id) => store.setStatus(c, id, "done")],
    ["reopen", (c, id) => store.setStatus(c, id, "open")],
    ["del", (c, id) => store.softDelete(c, id)],
  ];
  for (const [name, apply] of idCommands) {
    pool.command(name, async (ctx) => {
      const id = parseId(arg(ctx));
      if (id === undefined) return ctx.reply(t.needId);
      const e = apply(ctx.chat.id, id) ? store.get(ctx.chat.id, id) : undefined;
      return e ? replyEntry(ctx, e) : ctx.reply(t.noEntry(id));
    });
  }

  pool.command("tag", async (ctx) => {
    const [first = "", ...rest] = arg(ctx).split(/\s+/);
    const id = parseId(first);
    const parsed = parseMessage(rest.join(" "));
    if (id === undefined || !parsed.ok || (!parsed.tags.length && parsed.priority === null)) {
      return ctx.reply(parsed.ok ? t.tagUsage : t.conflictingPriority, HTML);
    }
    const e = store.addTags(ctx.chat.id, id, parsed.tags, parsed.priority);
    return e ? replyEntry(ctx, e) : ctx.reply(t.noEntry(id));
  });

  // buttons
  bot.on("callback_query:data", async (ctx) => {
    const chatId = ctx.callbackQuery.message?.chat.id;
    const [action, rawId] = ctx.callbackQuery.data.split(":");
    const id = Number(rawId);
    if (chatId === undefined || !store.isGroupEnabled(chatId) || !Number.isInteger(id)) {
      return ctx.answerCallbackQuery();
    }
    if (action === "done") store.setStatus(chatId, id, "done");
    else if (action === "open") store.setStatus(chatId, id, "open");
    else if (action === "del") store.softDelete(chatId, id);
    else if (action === "undo") store.restore(chatId, id);
    else return ctx.answerCallbackQuery();

    const e = store.get(chatId, id);
    await ctx.answerCallbackQuery();
    if (e) {
      const { text, markup } = render(e);
      await ctx.editMessageText(text, { ...HTML, reply_markup: markup }).catch(() => {});
    }
  });

  // sending an attachment back
  pool.command("get", async (ctx) => {
    const id = parseId(arg(ctx));
    if (id === undefined) return ctx.reply(t.needId);
    const e = store.get(ctx.chat.id, id);
    if (!e || e.deleted) return ctx.reply(t.noEntry(id));
    const a = e.attachment;
    if (!a) return ctx.reply(t.noAttachment(id));
    const opts = { caption: entryLine(e), parse_mode: "HTML" as const };
    if (a.kind === "location") {
      await ctx.replyWithLocation(a.latitude!, a.longitude!);
      return ctx.reply(entryLine(e), HTML);
    }
    const file = a.fileId!;
    if (a.kind === "photo") return ctx.replyWithPhoto(file, opts);
    if (a.kind === "video") return ctx.replyWithVideo(file, opts);
    if (a.kind === "audio") return ctx.replyWithAudio(file, opts);
    if (a.kind === "voice") return ctx.replyWithVoice(file, opts);
    return ctx.replyWithDocument(file, opts);
  });

  // saving entries
  const isCommand = (ctx: Context) =>
    !!ctx.message?.entities?.some((en) => en.type === "bot_command" && en.offset === 0);

  async function saveEntry(ctx: Context, message: Message, text: string) {
    const replyTo = { reply_parameters: { message_id: message.message_id } };
    const parsed = parseMessage(text);
    if (!parsed.ok) return ctx.reply(t.conflictingPriority, replyTo);

    const entry = store.addEntry({
      chatId: ctx.chat!.id,
      authorId: ctx.from!.id,
      authorName: displayName(ctx),
      text,
      tags: parsed.tags,
      priority: parsed.priority,
      links: parsed.links,
      attachment: extractAttachment(message),
      messageId: message.message_id,
    });
    const { text: line, markup } = render(entry);
    const sent = await ctx.reply(`${t.saved} ${line}`, { ...HTML, reply_markup: markup, ...replyTo });

    if (parsed.links.length) {
      const titles = await resolveTitles(parsed.links);
      if (Object.keys(titles).length) {
        store.updateByMessage({ ...entry, attachment: undefined, titles, messageId: message.message_id });
        const r = render(store.get(entry.chatId, entry.id)!);
        await ctx.api
          .editMessageText(ctx.chat!.id, sent.message_id, `${t.saved} ${r.text}`, { ...HTML, reply_markup: r.markup })
          .catch(() => {});
      }
    }
  }

  pool.on("message:text", async (ctx) => {
    if (isCommand(ctx)) return;
    await saveEntry(ctx, ctx.message, ctx.message.text);
  });

  // the caption of a photo/video/file carries the tags
  pool.on(MEDIA_FILTERS, async (ctx) => {
    await saveEntry(ctx, ctx.message!, ctx.message!.caption ?? "");
  });

  pool.on(["edited_message:text", "edited_message:caption"], async (ctx) => {
    const message = ctx.editedMessage;
    const text = message.text ?? message.caption ?? "";
    const parsed = parseMessage(text);
    if (!parsed.ok) return ctx.reply(t.conflictingPriority, { reply_parameters: { message_id: message.message_id } });
    const existing = store.list(ctx.chat.id, { includeDone: true }).find((e) => e.messageId === message.message_id);
    const titles = await resolveTitles(parsed.links, existing?.titles);
    const updated = store.updateByMessage({
      chatId: ctx.chat.id,
      authorId: ctx.from.id,
      authorName: displayName(ctx),
      text,
      tags: parsed.tags,
      priority: parsed.priority,
      links: parsed.links,
      titles,
      messageId: message.message_id,
    });
    if (updated) await replyEntry(ctx, updated, `${t.updated} `);
  });

  // members talking to the bot where nothing is saved: say why instead of staying silent
  bot.on(["message:text", ...MEDIA_FILTERS], (ctx) => {
    if (inPool(ctx)) return;
    return ctx.reply(isGroup(ctx) ? t.groupNotEnabled : t.useInGroup);
  });

  bot.catch((err) => console.error("bot error:", err.error));
  return bot;
}
