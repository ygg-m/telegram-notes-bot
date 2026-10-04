# Telegram Notes Bot

A shared note-saving bot for a small Telegram group. Members drop messages with hashtags; the bot files them so they can be listed and filtered later.

## Language

**Pool**:
The set of entries belonging to one enabled group chat. Pools never mix.
_Avoid_: Workspace, board, list

**Entry**:
One saved message in a pool: its text, links, tags, status and author.
_Avoid_: Note, item, post

**Attachment**:
A photo, video, file, audio, voice note or location sent as an entry. Its tags come from the caption.
_Avoid_: Media, upload

**Tag**:
A flat, case-insensitive label written as `#word` in a message. An entry has any number of them.
_Avoid_: Category, sub-category, label

**Priority**:
The special tag `#prio1`–`#prio9`; a lower number is more urgent. An entry has at most one, and entries without one rank last.
_Avoid_: Urgency, rank

**Untagged**:
The state of an entry whose message contained no tags.
_Avoid_: Inbox, uncategorized

**Open / Done**:
The two statuses of an entry; done entries are hidden from the default list.
_Avoid_: Completed, bought, closed

**Member**:
A registered Telegram user who may add and manage entries in enabled groups.
_Avoid_: User, participant

**Admin**:
A member who can manage members and groups. The first admin is fixed in configuration.
_Avoid_: Owner, moderator

**Invite**:
A one-time, expiring code issued by an admin that lets one new person become a member.
_Avoid_: Token, key, link

**Enabled group**:
A Telegram group the admin has activated; the bot ignores all others.
_Avoid_: Registered chat, whitelisted group
