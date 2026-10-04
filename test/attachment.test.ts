import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractAttachment } from "../src/attachment.js";
import { entryLine, toCsv } from "../src/format.js";
import { Store, type Entry } from "../src/store.js";
import { ADMIN, GROUP, STRANGER, makeHarness } from "./harness.js";

describe("extractAttachment", () => {
  it("picks the largest photo size", () => {
    const msg = { photo: [{ file_id: "small" }, { file_id: "big" }] } as any;
    expect(extractAttachment(msg)).toEqual({ kind: "photo", fileId: "big" });
  });

  it("reads documents, videos, audio, voice and locations", () => {
    expect(extractAttachment({ document: { file_id: "d", file_name: "a.pdf" } } as any)).toEqual({
      kind: "document", fileId: "d", name: "a.pdf",
    });
    expect(extractAttachment({ video: { file_id: "v" } } as any)).toMatchObject({ kind: "video", fileId: "v" });
    expect(extractAttachment({ audio: { file_id: "a", title: "Song" } } as any)).toMatchObject({ kind: "audio", name: "Song" });
    expect(extractAttachment({ voice: { file_id: "vo" } } as any)).toMatchObject({ kind: "voice", fileId: "vo" });
    expect(extractAttachment({ location: { latitude: 1.5, longitude: -2.5 } } as any)).toEqual({
      kind: "location", latitude: 1.5, longitude: -2.5,
    });
  });

  it("returns undefined for plain text", () => {
    expect(extractAttachment({ text: "hi" } as any)).toBeUndefined();
  });
});

describe("formatting", () => {
  const e = (over: Partial<Entry>): Entry => ({
    chatId: 1, id: 3, authorId: 1, authorName: "Ana", text: "", tags: ["buy"], priority: null, links: [],
    titles: {}, attachment: null, status: "open", deleted: false, messageId: 1, createdAt: 0, ...over,
  });

  it("shows an icon and file name", () => {
    expect(entryLine(e({ attachment: { kind: "document", fileId: "f", name: "manual.pdf" }, text: "#buy manual" }))).toBe(
      "<b>#3</b> #buy · 📎 manual.pdf manual · Ana",
    );
    expect(entryLine(e({ attachment: { kind: "photo", fileId: "f" } }))).toBe("<b>#3</b> #buy · 📷 · Ana");
  });

  it("links locations to a map", () => {
    const line = entryLine(e({ attachment: { kind: "location", latitude: 10, longitude: 20 } }));
    expect(line).toContain('href="https://www.google.com/maps?q=10,20"');
    expect(line).toContain("📍");
  });

  it("includes the attachment kind in the CSV export", () => {
    const csv = toCsv([e({ attachment: { kind: "document", fileId: "f", name: "a.pdf" } })]);
    expect(csv).toContain("document:a.pdf");
  });
});

describe("store", () => {
  it("round-trips an attachment and keeps it when the caption is edited", () => {
    const s = new Store(":memory:");
    const added = s.addEntry({
      chatId: 1, authorId: 1, authorName: "A", text: "#a", tags: ["a"], priority: null, messageId: 5,
      attachment: { kind: "photo", fileId: "abc" },
    });
    expect(added.attachment).toEqual({ kind: "photo", fileId: "abc" });
    const updated = s.updateByMessage({
      chatId: 1, authorId: 1, authorName: "A", text: "#b", tags: ["b"], priority: null, messageId: 5,
    });
    expect(updated).toMatchObject({ tags: ["b"], attachment: { kind: "photo", fileId: "abc" } });
  });

  describe("migration", () => {
    let dir: string;
    beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "notes-"))));
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("adds the attachment column to a database created before attachments existed", () => {
      const path = join(dir, "old.db");
      const old = new Database(path);
      old.exec(`CREATE TABLE entries (
        chat_id INTEGER NOT NULL, id INTEGER NOT NULL, author_id INTEGER NOT NULL, author_name TEXT NOT NULL,
        text TEXT NOT NULL, priority INTEGER, links TEXT NOT NULL DEFAULT '[]', titles TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'open', deleted INTEGER NOT NULL DEFAULT 0, message_id INTEGER,
        created_at INTEGER NOT NULL, PRIMARY KEY (chat_id, id));
        INSERT INTO entries (chat_id, id, author_id, author_name, text, created_at) VALUES (1, 1, 1, 'A', 'old', 0);`);
      old.close();

      const s = new Store(path);
      expect(s.get(1, 1)).toMatchObject({ text: "old", attachment: null });
      expect(s.addEntry({ chatId: 1, authorId: 1, authorName: "A", text: "n", tags: [], priority: null,
        attachment: { kind: "voice", fileId: "x" } }).attachment).toEqual({ kind: "voice", fileId: "x" });
      s.close();
      new Store(path).close(); // reopening an already-migrated database must not fail
    });
  });
});

describe("bot", () => {
  let h: Awaited<ReturnType<typeof makeHarness>>;

  async function media(userId: number, fields: Record<string, unknown>, chatId = GROUP) {
    await h.bot.handleUpdate({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: Math.floor(Math.random() * 1e9),
        date: 0,
        chat: { id: chatId, type: "supergroup" },
        from: { id: userId, is_bot: false, first_name: `U${userId}` },
        ...fields,
      },
    } as any);
  }

  beforeEach(async () => {
    h = await makeHarness();
    await h.say(ADMIN, "/enable");
    h.calls.length = 0;
  });

  it("saves a photo with tags from its caption", async () => {
    await media(ADMIN, { photo: [{ file_id: "p1" }, { file_id: "p2" }], caption: "#buy #prio1 nice lamp" });
    expect(h.store.get(GROUP, 1)).toMatchObject({
      tags: ["buy"], priority: 1, text: "#buy #prio1 nice lamp", attachment: { kind: "photo", fileId: "p2" },
    });
    expect(h.last()).toContain("📷");
  });

  it("saves a file without a caption as untagged", async () => {
    await media(ADMIN, { document: { file_id: "d1", file_name: "manual.pdf" } });
    expect(h.store.get(GROUP, 1)).toMatchObject({ tags: [], attachment: { kind: "document", name: "manual.pdf" } });
    await h.say(ADMIN, "/list #untagged");
    expect(h.last()).toContain("manual.pdf");
  });

  it("saves video, audio, voice and location messages", async () => {
    await media(ADMIN, { video: { file_id: "v" }, caption: "#watch" });
    await media(ADMIN, { audio: { file_id: "a" } });
    await media(ADMIN, { voice: { file_id: "vo" } });
    await media(ADMIN, { location: { latitude: 1, longitude: 2 }, caption: undefined });
    expect(h.store.list(GROUP, {}).map((e) => e.attachment?.kind)).toEqual(["video", "audio", "voice", "location"]);
  });

  it("ignores media from non-members and in disabled groups", async () => {
    await media(STRANGER, { photo: [{ file_id: "p" }] });
    expect(h.calls).toHaveLength(0);
    await media(ADMIN, { photo: [{ file_id: "p" }] }, -777);
    expect(h.last()).toContain("isn't enabled");
    expect(h.store.list(GROUP, {})).toHaveLength(0);
  });

  it("updates tags when a caption is edited, keeping the file", async () => {
    await media(ADMIN, { photo: [{ file_id: "p" }], caption: "#buy lamp" });
    const messageId = h.store.get(GROUP, 1)!.messageId!;
    await h.bot.handleUpdate({
      update_id: 1,
      edited_message: {
        message_id: messageId, date: 0, edit_date: 1, chat: { id: GROUP, type: "supergroup" },
        from: { id: ADMIN, is_bot: false, first_name: "A" }, photo: [{ file_id: "p" }], caption: "#home lamp",
      },
    } as any);
    expect(h.store.get(GROUP, 1)).toMatchObject({ tags: ["home"], attachment: { kind: "photo", fileId: "p" } });
  });

  it("/get re-sends each kind of attachment by file id", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ photo: [{ file_id: "f1" }] }, "sendPhoto"],
      [{ video: { file_id: "f2" } }, "sendVideo"],
      [{ audio: { file_id: "f3" } }, "sendAudio"],
      [{ voice: { file_id: "f4" } }, "sendVoice"],
      [{ document: { file_id: "f5", file_name: "x.txt" } }, "sendDocument"],
    ];
    for (const [fields] of cases) await media(ADMIN, fields);
    for (const [i, [, method]] of cases.entries()) {
      h.calls.length = 0;
      await h.say(ADMIN, `/get ${i + 1}`);
      const call = h.calls.find((c) => c.method === method);
      expect(call, method).toBeDefined();
      expect(call!.payload).toMatchObject({ [method.slice(4).toLowerCase()]: `f${i + 1}` });
    }
  });

  it("/get re-sends a location and explains when there is nothing to send", async () => {
    await media(ADMIN, { location: { latitude: 1, longitude: 2 } });
    await h.say(ADMIN, "/get 1");
    expect(h.calls.find((c) => c.method === "sendLocation")!.payload).toMatchObject({ latitude: 1, longitude: 2 });
    await h.say(ADMIN, "plain note");
    await h.say(ADMIN, "/get 2");
    expect(h.last()).toContain("has no attachment");
    await h.say(ADMIN, "/get 99");
    expect(h.last()).toContain("No entry #99");
    await h.say(ADMIN, "/get");
    expect(h.last()).toContain("numeric id");
  });

  it("/get does not resend deleted entries", async () => {
    await media(ADMIN, { photo: [{ file_id: "f" }] });
    await h.say(ADMIN, "/del 1");
    h.calls.length = 0;
    await h.say(ADMIN, "/get 1");
    expect(h.calls.some((c) => c.method === "sendPhoto")).toBe(false);
    expect(h.last()).toContain("No entry #1");
  });
});
