# Telegram Notes Bot

Shared note-saving bot for a small Telegram group. Send `#buy #home #prio1 <link>`; the bot files it, and `/list #buy #home` brings it back. See [GLOSSARY.md](GLOSSARY.md) for terms and [docs/adr](docs/adr) for decisions.

## Using it

- Every plain message in an enabled group becomes an entry. `#tags` can be anywhere; `#prio1`–`#prio9` sets priority (1 = most urgent); no tags means "untagged".
- Photos, videos, files, audio, voice notes and locations are saved too; put the `#tags` in the caption. Only Telegram's reference to the file is stored (nothing is downloaded), and `/get <id>` sends it back.
- `/list [#tags]` (all tags must match, `#untagged` for tagless), `/all`, `/search`, `/tags`, `/done`, `/reopen`, `/del`, `/tag <id> #x`, `/help`.
- Admin: `/enable` / `/disable` (run in the group), `/invite`, `/users`, `/revoke <id>`, `/promote <id>`, `/export` (CSV).
- New person: the admin sends `/invite`; they send `/join <code>` to the bot (DM or group).

## Setup

1. In Telegram, talk to [@BotFather](https://t.me/BotFather): `/newbot`, copy the token, then `/setprivacy` → your bot → **Disable** (otherwise the bot cannot see normal group messages). Add the bot to your group *after* changing privacy (or remove and re-add it).
2. Send `/whoami` to the bot (once it is running) to learn your numeric id and set it as `ADMIN_TELEGRAM_ID`.
3. In the group, as admin, send `/enable`.

## Run locally

The bot runs on your own machine and only works while it is running; Telegram holds messages sent in the meantime and delivers them when it starts again.

```powershell
.\start-local.ps1     # Windows (or ./start-local.sh with bash)
```

The first run creates `.env` from `.env.example`; fill in `BOT_TOKEN` and `ADMIN_TELEGRAM_ID` and run it again. Data lives in `data/notes.db` (back it up by copying the file), and `/export` gives you a CSV at any time. Run `npm test` for the test suite.

Add a language by copying `src/i18n/en.ts` and registering it in `src/i18n/index.ts` (select it with the `lang` option in `createBot`).
