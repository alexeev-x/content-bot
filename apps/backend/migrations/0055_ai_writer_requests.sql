-- The owner's open /redactor request: the next text in that chat goes to the AI, as a draft of the format a
-- button picked, or as a free request when none was picked. One row per chat, taken once, expires on its own.
-- Expand-only: one new table.
CREATE TABLE IF NOT EXISTS ai_writer_requests (
  chat_id INTEGER PRIMARY KEY,
  -- NULL: a free request (no format button pressed).
  format TEXT CHECK (format IS NULL OR format IN ('fidit', 'igrat', 'standalone', 'telegram')),
  -- The bot's «О чём написать?» message: its buttons change this row only.
  prompt_message_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
