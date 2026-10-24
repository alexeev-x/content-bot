-- The bot's own identity (the Bot API `getMe` result), stored by Settings -> Bot -> Connect so the
-- owner does not have to paste it as the BOT_INFO secret. A separate single-row table, not a
-- `settings` key: `settings` is owner-edited JSON with revisions behind a CHECK on its key list
-- (widening it means rebuilding the table), while this row is machine-written system state.
-- The webhook reads it on every update (one primary-key lookup) instead of calling getMe.

CREATE TABLE bot_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bot_id INTEGER NOT NULL CHECK (bot_id > 0),
  -- Validated by the application on every read; the database only guarantees it is JSON and bounded
  -- (a getMe answer is about 500 bytes).
  info TEXT NOT NULL CHECK (json_valid(info) AND length(info) <= 8192),
  updated_at INTEGER NOT NULL
);
