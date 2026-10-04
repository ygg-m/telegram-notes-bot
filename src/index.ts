import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createBot } from "./bot.js";
import { Store } from "./store.js";
import { fetchTitle } from "./title.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(1);
  }
  return v;
}

const token = required("BOT_TOKEN");
const adminId = Number(required("ADMIN_TELEGRAM_ID"));
if (!Number.isInteger(adminId)) {
  console.error("ADMIN_TELEGRAM_ID must be a numeric Telegram user id (send /whoami to the bot to find yours)");
  process.exit(1);
}
const dbPath = process.env.DB_PATH ?? "data/notes.db";
mkdirSync(dirname(dbPath), { recursive: true });

const store = new Store(dbPath);
const bot = createBot(token, { store, adminId, fetchTitle });

const stop = () => {
  bot.stop();
  store.close();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await bot.start({
  onStart: (me) => console.log(`Bot @${me.username} running (admin ${adminId}, db ${dbPath})`),
});
