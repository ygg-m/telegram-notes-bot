# One pool per group, access via admin-issued invites

Entries are scoped to the Telegram group they were sent in, and only members who joined with an admin-issued invite may write to an enabled group. A single global pool with a hardcoded user list would have been simpler for two people, but retrofitting group scoping into existing data (and replacing a config-file allowlist) is painful once entries exist. Everything else in an unregistered chat is ignored silently so strangers adding the bot get no response.
