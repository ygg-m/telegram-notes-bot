#!/usr/bin/env bash
# Starts the bot locally with auto-restart on file changes.
# Reads BOT_TOKEN and ADMIN_TELEGRAM_ID from .env (git-ignored; created from .env.example on first run).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env - fill in BOT_TOKEN and ADMIN_TELEGRAM_ID, then run this script again."
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "${BOT_TOKEN:-}" ] || [[ "$BOT_TOKEN" == *token-from-botfather* ]] || [ -z "${ADMIN_TELEGRAM_ID:-}" ] || [ "$ADMIN_TELEGRAM_ID" = "0" ]; then
  echo "Set BOT_TOKEN and ADMIN_TELEGRAM_ID in .env first."
  exit 1
fi

[ -d node_modules ] || npm install
npm run dev
