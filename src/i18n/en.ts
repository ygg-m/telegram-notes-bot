// All user-facing text lives here. To add a language, copy this file (e.g. pt.ts),
// translate the values, and select it in src/i18n/index.ts.
export const en = {
  help: [
    "<b>Notes bot</b>",
    "Send any message, optionally with #tags. <code>#prio1</code>–<code>#prio9</code> sets priority (1 = most urgent).",
    "",
    "/list [#tags] – open entries matching all tags (<code>#untagged</code> for tagless ones)",
    "/all [#tags] – include done entries",
    "/search &lt;text&gt;",
    "/tags – tags with counts",
    "/done &lt;id&gt; · /reopen &lt;id&gt; · /del &lt;id&gt;",
    "/tag &lt;id&gt; #tag [#prio2] – add tags to an entry",
    "/join &lt;code&gt; – join using an invite",
    "/whoami – show your Telegram id",
    "",
    "<b>Admin</b>: /enable /disable (this group) · /invite · /users · /revoke &lt;id&gt; · /promote &lt;id&gt; · /export",
  ].join("\n"),
  whoami: (id: number) => `Your Telegram id is <code>${id}</code>`,
  joined: (name: string) => `Welcome, ${name}! You can now use this bot.`,
  joinFailed: "That invite code is invalid, expired or already used.",
  joinUsage: "Usage: /join &lt;code&gt;",
  invite: (code: string) =>
    `Invite code (valid 24h, single use): <code>${code}</code>\nThe new person sends <code>/join ${code}</code> to me.`,
  groupEnabled: "This group is now enabled. Send me your notes!",
  groupDisabled: "This group is disabled. Existing entries are kept.",
  groupOnly: "Use this command in a group.",
  users: (rows: { id: number; name: string; admin: boolean }[]) =>
    rows.map((r) => `<code>${r.id}</code> ${esc(r.name)}${r.admin ? " (admin)" : ""}`).join("\n") || "No members.",
  revoked: (id: number) => `Revoked ${id}.`,
  promoted: (id: number) => `Promoted ${id} to admin.`,
  notFound: "No such member.",
  cannotRevokeSelf: "You can't revoke yourself.",
  needId: "Please give a numeric id.",
  noEntry: (id: number) => `No entry #${id}.`,
  conflictingPriority: "Only one #prio tag is allowed per entry – nothing saved.",
  empty: "Nothing here.",
  noTags: "No tags yet.",
  tagUsage: "Usage: /tag &lt;id&gt; #tag [#prio2]",
  searchUsage: "Usage: /search &lt;text&gt;",
  saved: "Saved",
  updated: "Updated",
  deleted: (id: number) => `🗑 Deleted #${id}`,
  btnDone: "✅ Done",
  btnReopen: "↩ Reopen",
  btnDelete: "🗑 Delete",
  btnUndo: "↩ Undo",
  untaggedLabel: "untagged",
};

export type Strings = typeof en;

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
