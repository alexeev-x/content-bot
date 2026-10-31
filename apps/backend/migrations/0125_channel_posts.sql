-- Posts the owner sends straight to the channel, outside the studio (owner, 31.10.2026): the bot, an admin there,
-- receives them as `channel_post` updates. The rubric scheduler reads only their time, to keep its two-hour gap after
-- them; they never count against the day's limits. Expand-only: a new table. Kept 14 days (the scheduler purge step).
CREATE TABLE channel_posts (
  chat_id TEXT NOT NULL CHECK (length(chat_id) BETWEEN 1 AND 32),
  message_id INTEGER NOT NULL,
  posted_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX channel_posts_at_idx ON channel_posts (chat_id, posted_at);
