import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";

export type Status = "open" | "done";

export interface Entry {
  chatId: number;
  id: number;
  authorId: number;
  authorName: string;
  text: string;
  tags: string[];
  priority: number | null;
  links: string[];
  titles: Record<string, string>;
  status: Status;
  deleted: boolean;
  messageId: number | null;
  createdAt: number;
}

export interface NewEntry {
  chatId: number;
  authorId: number;
  authorName: string;
  text: string;
  tags: string[];
  priority: number | null;
  links?: string[];
  titles?: Record<string, string>;
  messageId?: number;
}

export interface ListFilter {
  tags?: string[];
  priority?: number;
  untagged?: boolean;
  search?: string;
  includeDone?: boolean;
}

export interface Member {
  userId: number;
  name: string;
  isAdmin: boolean;
}

interface EntryRow {
  chat_id: number;
  id: number;
  author_id: number;
  author_name: string;
  text: string;
  priority: number | null;
  links: string;
  titles: string;
  status: Status;
  deleted: number;
  message_id: number | null;
  created_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS groups (
  chat_id INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by INTEGER
);
CREATE TABLE IF NOT EXISTS entries (
  chat_id INTEGER NOT NULL,
  id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  priority INTEGER,
  links TEXT NOT NULL DEFAULT '[]',
  titles TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  deleted INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, id)
);
CREATE INDEX IF NOT EXISTS entries_message ON entries (chat_id, message_id);
CREATE TABLE IF NOT EXISTS entry_tags (
  chat_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (chat_id, entry_id, tag)
);
`;

const nowSeconds = () => Math.floor(Date.now() / 1000);

export class Store {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  // --- members -----------------------------------------------------------

  ensureAdmin(userId: number, name: string) {
    this.db
      .prepare(
        `INSERT INTO members (user_id, name, is_admin, active) VALUES (?, ?, 1, 1)
         ON CONFLICT(user_id) DO UPDATE SET is_admin = 1, active = 1`,
      )
      .run(userId, name);
  }

  isMember(userId: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM members WHERE user_id = ? AND active = 1").get(userId);
  }

  isAdmin(userId: number): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM members WHERE user_id = ? AND active = 1 AND is_admin = 1")
      .get(userId);
  }

  listMembers(): Member[] {
    return (
      this.db
        .prepare("SELECT user_id, name, is_admin FROM members WHERE active = 1 ORDER BY user_id")
        .all() as { user_id: number; name: string; is_admin: number }[]
    ).map((r) => ({ userId: r.user_id, name: r.name, isAdmin: !!r.is_admin }));
  }

  /** Returns false when no active member matched. */
  revoke(userId: number): boolean {
    return (
      this.db.prepare("UPDATE members SET active = 0, is_admin = 0 WHERE user_id = ? AND active = 1").run(userId)
        .changes > 0
    );
  }

  promote(userId: number): boolean {
    return this.db.prepare("UPDATE members SET is_admin = 1 WHERE user_id = ? AND active = 1").run(userId).changes > 0;
  }

  // --- invites -----------------------------------------------------------

  createInvite(adminId: number, now = nowSeconds(), ttlSeconds = 24 * 3600): string {
    const code = randomBytes(6).toString("hex");
    this.db
      .prepare("INSERT INTO invites (code, created_by, expires_at) VALUES (?, ?, ?)")
      .run(code, adminId, now + ttlSeconds);
    return code;
  }

  redeemInvite(code: string, userId: number, name: string, now = nowSeconds()): boolean {
    const redeem = this.db.transaction(() => {
      const used = this.db
        .prepare("UPDATE invites SET used_by = ? WHERE code = ? AND used_by IS NULL AND expires_at > ?")
        .run(userId, code, now);
      if (used.changes === 0) return false;
      this.db
        .prepare(
          `INSERT INTO members (user_id, name, is_admin, active) VALUES (?, ?, 0, 1)
           ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, active = 1`,
        )
        .run(userId, name);
      return true;
    });
    return redeem();
  }

  // --- groups ------------------------------------------------------------

  enableGroup(chatId: number) {
    this.db
      .prepare("INSERT INTO groups (chat_id, enabled) VALUES (?, 1) ON CONFLICT(chat_id) DO UPDATE SET enabled = 1")
      .run(chatId);
  }

  disableGroup(chatId: number) {
    this.db.prepare("UPDATE groups SET enabled = 0 WHERE chat_id = ?").run(chatId);
  }

  isGroupEnabled(chatId: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM groups WHERE chat_id = ? AND enabled = 1").get(chatId);
  }

  // --- entries -----------------------------------------------------------

  addEntry(e: NewEntry): Entry {
    const insert = this.db.transaction(() => {
      const next = (
        this.db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM entries WHERE chat_id = ?").get(e.chatId) as {
          n: number;
        }
      ).n;
      this.db
        .prepare(
          `INSERT INTO entries (chat_id, id, author_id, author_name, text, priority, links, titles, message_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          e.chatId,
          next,
          e.authorId,
          e.authorName,
          e.text,
          e.priority,
          JSON.stringify(e.links ?? []),
          JSON.stringify(e.titles ?? {}),
          e.messageId ?? null,
          nowSeconds(),
        );
      this.writeTags(e.chatId, next, e.tags);
      return next;
    });
    return this.get(e.chatId, insert())!;
  }

  /** Re-applies an edited Telegram message to its entry; undefined if none was saved for it. */
  updateByMessage(e: NewEntry & { messageId: number }): Entry | undefined {
    const row = this.db
      .prepare("SELECT id FROM entries WHERE chat_id = ? AND message_id = ? AND deleted = 0")
      .get(e.chatId, e.messageId) as { id: number } | undefined;
    if (!row) return undefined;
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE entries SET text = ?, priority = ?, links = ?, titles = ? WHERE chat_id = ? AND id = ?")
        .run(e.text, e.priority, JSON.stringify(e.links ?? []), JSON.stringify(e.titles ?? {}), e.chatId, row.id);
      this.db.prepare("DELETE FROM entry_tags WHERE chat_id = ? AND entry_id = ?").run(e.chatId, row.id);
      this.writeTags(e.chatId, row.id, e.tags);
    })();
    return this.get(e.chatId, row.id);
  }

  get(chatId: number, id: number): Entry | undefined {
    const row = this.db.prepare("SELECT * FROM entries WHERE chat_id = ? AND id = ?").get(chatId, id) as
      | EntryRow
      | undefined;
    return row ? this.hydrate([row])[0] : undefined;
  }

  setStatus(chatId: number, id: number, status: Status): boolean {
    return (
      this.db.prepare("UPDATE entries SET status = ? WHERE chat_id = ? AND id = ? AND deleted = 0").run(status, chatId, id)
        .changes > 0
    );
  }

  softDelete(chatId: number, id: number): boolean {
    return this.db.prepare("UPDATE entries SET deleted = 1 WHERE chat_id = ? AND id = ?").run(chatId, id).changes > 0;
  }

  restore(chatId: number, id: number): boolean {
    return this.db.prepare("UPDATE entries SET deleted = 0 WHERE chat_id = ? AND id = ?").run(chatId, id).changes > 0;
  }

  addTags(chatId: number, id: number, tags: string[], priority: number | null): Entry | undefined {
    if (!this.get(chatId, id)) return undefined;
    this.db.transaction(() => {
      this.writeTags(chatId, id, tags);
      if (priority !== null) {
        this.db.prepare("UPDATE entries SET priority = ? WHERE chat_id = ? AND id = ?").run(priority, chatId, id);
      }
    })();
    return this.get(chatId, id);
  }

  list(chatId: number, f: ListFilter): Entry[] {
    const where = ["e.chat_id = ?", "e.deleted = 0"];
    const params: (string | number)[] = [chatId];
    if (!f.includeDone) where.push("e.status = 'open'");
    if (f.priority !== undefined) {
      where.push("e.priority = ?");
      params.push(f.priority);
    }
    if (f.untagged) {
      where.push("NOT EXISTS (SELECT 1 FROM entry_tags t WHERE t.chat_id = e.chat_id AND t.entry_id = e.id)");
    }
    for (const tag of f.tags ?? []) {
      where.push("EXISTS (SELECT 1 FROM entry_tags t WHERE t.chat_id = e.chat_id AND t.entry_id = e.id AND t.tag = ?)");
      params.push(tag);
    }
    if (f.search) {
      where.push("e.text LIKE ? ESCAPE '\\'");
      params.push(`%${f.search.replace(/[\\%_]/g, "\\$&")}%`);
    }
    const rows = this.db
      .prepare(
        `SELECT e.* FROM entries e WHERE ${where.join(" AND ")}
         ORDER BY e.priority IS NULL, e.priority, e.id`,
      )
      .all(...params) as EntryRow[];
    return this.hydrate(rows);
  }

  tagCounts(chatId: number): { tag: string; count: number }[] {
    return this.db
      .prepare(
        `SELECT t.tag, COUNT(*) AS count FROM entry_tags t
         JOIN entries e ON e.chat_id = t.chat_id AND e.id = t.entry_id
         WHERE t.chat_id = ? AND e.deleted = 0 AND e.status = 'open'
         GROUP BY t.tag ORDER BY count DESC, t.tag`,
      )
      .all(chatId) as { tag: string; count: number }[];
  }

  all(chatId: number): Entry[] {
    const rows = this.db.prepare("SELECT * FROM entries WHERE chat_id = ? ORDER BY id").all(chatId) as EntryRow[];
    return this.hydrate(rows);
  }

  // --- internals ---------------------------------------------------------

  private writeTags(chatId: number, id: number, tags: string[]) {
    const stmt = this.db.prepare("INSERT OR IGNORE INTO entry_tags (chat_id, entry_id, tag) VALUES (?, ?, ?)");
    for (const tag of tags) stmt.run(chatId, id, tag);
  }

  private hydrate(rows: EntryRow[]): Entry[] {
    const tagStmt = this.db.prepare("SELECT tag FROM entry_tags WHERE chat_id = ? AND entry_id = ? ORDER BY rowid");
    return rows.map((r) => ({
      chatId: r.chat_id,
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      text: r.text,
      tags: (tagStmt.all(r.chat_id, r.id) as { tag: string }[]).map((t) => t.tag),
      priority: r.priority,
      links: JSON.parse(r.links) as string[],
      titles: JSON.parse(r.titles) as Record<string, string>,
      status: r.status,
      deleted: !!r.deleted,
      messageId: r.message_id,
      createdAt: r.created_at,
    }));
  }
}
