-- Invite links into the analytics Telegram channel and the joins through them (plan B1, owner 20.10.2026; docs/API_CONTRACTS.md
-- § Content analytics). Expand-only: two new tables, no change to existing data.
--
-- A link row is reserved before Telegram is asked (url NULL), so two presses with one name cannot create two
-- Telegram links: the partial unique index lets only one active row per name exist. A failed Telegram call deletes
-- the reservation.
CREATE TABLE IF NOT EXISTS invite_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 32),
  url TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS invite_links_active_name ON invite_links (name) WHERE revoked_at IS NULL;

-- One row per join of the channel. user_id is the subscriber's Telegram id: a leave closes that person's open row,
-- which is how «who of those left» is counted. invite_link_id NULL: joined by the public @username or a link the
-- studio did not create. A rejoin is a new row.
CREATE TABLE IF NOT EXISTS channel_joins (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  invite_link_id TEXT REFERENCES invite_links (id),
  joined_at INTEGER NOT NULL,
  left_at INTEGER
);
CREATE INDEX IF NOT EXISTS channel_joins_open ON channel_joins (user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS channel_joins_period ON channel_joins (joined_at, invite_link_id);
