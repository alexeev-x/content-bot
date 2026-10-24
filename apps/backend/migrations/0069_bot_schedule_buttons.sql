-- «🕒 Запланировать» under the bot's draft replies (owner, 17.10.2026): the same token as «Опубликовать сейчас»,
-- with the instant the owner chose. Expand-only: two nullable columns and a partial index.
-- scheduled_at: NULL — send now (used_at is the instant); else the chosen instant, fixed by the claiming tap.
ALTER TABLE bot_publish_actions ADD COLUMN scheduled_at INTEGER;
-- «Своё время»: the chat waits for the owner's next message as the time, until this instant.
ALTER TABLE bot_publish_actions ADD COLUMN awaiting_time_until INTEGER;

CREATE INDEX IF NOT EXISTS bot_publish_actions_awaiting_idx
  ON bot_publish_actions (awaiting_time_until) WHERE awaiting_time_until IS NOT NULL;
