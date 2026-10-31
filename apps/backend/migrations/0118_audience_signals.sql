-- The channel's audience signals (rubric scheduler stage 2, docs/scheduler/area-backend-analytics.md §5.1): reaction
-- counts, poll votes and comments of the discussion group, as the bot receives them. Counts only, except comment text
-- kept 10 days (owner, 31.10.2026: «на всякий случай»): no raw user id, no full name, no raw update is ever stored.

-- The channels and their discussion groups the bot listens to, from the setup check.
CREATE TABLE tg_chats (
  chat_id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('channel', 'group')),
  -- For a group: the channel it discusses.
  channel_chat_id INTEGER,
  username TEXT CHECK (username IS NULL OR length(username) <= 64),
  title TEXT NOT NULL CHECK (length(title) <= 128),
  bot_admin INTEGER NOT NULL CHECK (bot_admin IN (0, 1)),
  sees_all INTEGER NOT NULL CHECK (sees_all IN (0, 1)),
  checked_at INTEGER NOT NULL,
  CHECK ((role = 'group') = (channel_chat_id IS NOT NULL))
) WITHOUT ROWID;
CREATE INDEX tg_chats_channel_idx ON tg_chats (channel_chat_id) WHERE channel_chat_id IS NOT NULL;

-- The latest reaction count of a channel post (`message_reaction_count`); the newer report wins.
CREATE TABLE tg_message_reactions (
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 0),
  kinds_json TEXT NOT NULL CHECK (json_valid(kinds_json) AND length(kinds_json) <= 2048),
  reported_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id)
) WITHOUT ROWID;
CREATE INDEX tg_reactions_reported_idx ON tg_message_reactions (reported_at);

-- A poll the scheduler registered; the bot only updates it. NULL voters: no update seen yet (not 0).
CREATE TABLE tg_polls (
  poll_id TEXT PRIMARY KEY CHECK (length(poll_id) BETWEEN 1 AND 64),
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  closes_at INTEGER,
  voters INTEGER CHECK (voters IS NULL OR voters >= 0),
  voters_24h INTEGER CHECK (voters_24h IS NULL OR voters_24h >= 0),
  voters_72h INTEGER CHECK (voters_72h IS NULL OR voters_72h >= 0),
  options_json TEXT CHECK (options_json IS NULL OR (json_valid(options_json) AND length(options_json) <= 2048)),
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
  final_at INTEGER,
  updated_at INTEGER
) WITHOUT ROWID;
CREATE UNIQUE INDEX tg_polls_message_idx ON tg_polls (chat_id, message_id);
CREATE INDEX tg_polls_updated_idx ON tg_polls (updated_at) WHERE updated_at IS NOT NULL;

-- A channel post's thread in the discussion group (Telegram's automatic forward).
CREATE TABLE tg_comment_threads (
  group_chat_id INTEGER NOT NULL,
  root_message_id INTEGER NOT NULL,
  channel_chat_id INTEGER NOT NULL,
  channel_message_id INTEGER NOT NULL,
  post_at INTEGER NOT NULL,
  capped INTEGER NOT NULL DEFAULT 0 CHECK (capped IN (0, 1)),
  PRIMARY KEY (group_chat_id, root_message_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX tg_threads_post_idx ON tg_comment_threads (channel_chat_id, channel_message_id);
CREATE INDEX tg_threads_age_idx ON tg_comment_threads (post_at);

-- A comment: the author as a keyed hash (AUDIENCE_HASH_KEY), the @username if public, sanitised text ≤ 500.
CREATE TABLE tg_comments (
  group_chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  channel_chat_id INTEGER NOT NULL,
  channel_message_id INTEGER NOT NULL,
  -- Telegram's message date.
  created_at INTEGER NOT NULL,
  author_key TEXT NOT NULL CHECK (length(author_key) = 16),
  username TEXT CHECK (username IS NULL OR length(username) <= 64),
  kind TEXT NOT NULL CHECK (kind IN ('text', 'media')),
  text TEXT CHECK (text IS NULL OR length(text) <= 500),
  PRIMARY KEY (group_chat_id, message_id)
) WITHOUT ROWID;
CREATE INDEX tg_comments_post_idx ON tg_comments (channel_chat_id, channel_message_id, created_at);
CREATE INDEX tg_comments_age_idx ON tg_comments (created_at);

-- A post's comment counts frozen once it is 73 h old, before its comments are purged (counts only, kept).
CREATE TABLE tg_post_audience (
  channel_chat_id INTEGER NOT NULL,
  channel_message_id INTEGER NOT NULL,
  comments24 INTEGER NOT NULL CHECK (comments24 >= 0),
  comments72 INTEGER NOT NULL CHECK (comments72 >= 0),
  commenters72 INTEGER NOT NULL CHECK (commenters72 >= 0),
  capped INTEGER NOT NULL DEFAULT 0 CHECK (capped IN (0, 1)),
  frozen_at INTEGER NOT NULL,
  PRIMARY KEY (channel_chat_id, channel_message_id)
) WITHOUT ROWID;
