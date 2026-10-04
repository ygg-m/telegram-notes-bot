# Telegram Notes Bot

Shared note-saving bot for a small Telegram group. Send `#buy #home #prio1 <link>`; the bot files it, and `/list #buy #home` brings it back. See [GLOSSARY.md](GLOSSARY.md) for terms and [docs/adr](docs/adr) for decisions.

## Using it

- Every plain message in an enabled group becomes an entry. `#tags` can be anywhere; `#prio1`–`#prio9` sets priority (1 = most urgent); no tags means "untagged".
- `/list [#tags]` (all tags must match, `#untagged` for tagless), `/all`, `/search`, `/tags`, `/done`, `/reopen`, `/del`, `/tag <id> #x`, `/help`.
- Admin: `/enable` / `/disable` (run in the group), `/invite`, `/users`, `/revoke <id>`, `/promote <id>`, `/export` (CSV).
- New person: the admin sends `/invite`; they send `/join <code>` to the bot (DM or group).

## Setup

1. In Telegram, talk to [@BotFather](https://t.me/BotFather): `/newbot`, copy the token, then `/setprivacy` → your bot → **Disable** (otherwise the bot cannot see normal group messages). Add the bot to your group *after* changing privacy (or remove and re-add it).
2. Send `/whoami` to the running bot to learn your numeric id and set it as `ADMIN_TELEGRAM_ID`.
3. In the group, as admin, send `/enable`.

## Run locally

```bash
cp .env.example .env   # fill in, then export the variables
npm install
npm run dev
npm test
```

## Deploy (Fly.io)

```bash
fly launch --no-deploy --copy-config      # pick an app name when asked; decline Postgres/Redis
fly volumes create data --size 1 --region gru
fly secrets set BOT_TOKEN=... ADMIN_TELEGRAM_ID=...
fly deploy
fly scale count 1
```

Volume snapshots are taken daily by Fly. `/export` gives you a CSV at any time. Add a language by copying `src/i18n/en.ts` and registering it in `src/i18n/index.ts` (select it with the `lang` option in `createBot`).
