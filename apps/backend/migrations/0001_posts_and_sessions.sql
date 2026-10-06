-- Stage 1: owner sessions, posts with revision history, idempotency keys and an audit trail.
-- Times are UTC epoch milliseconds; ids are UUID text (the audit log keeps an ordered integer id).

CREATE TABLE sessions (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  -- SHA-256 hex of the bearer token; the token itself is never stored.
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  telegram_id TEXT NOT NULL CHECK (length(telegram_id) BETWEEN 1 AND 20),
  kind TEXT NOT NULL CHECK (kind IN ('browser', 'miniapp')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at)
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  title TEXT NOT NULL CHECK (length(trim(title)) >= 1 AND length(title) <= 200),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 4096),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Keyset list: newest update first, optionally filtered by status. Both shapes need their own
-- index so SQLite never sorts (checked with EXPLAIN QUERY PLAN in the repository test).
CREATE INDEX posts_status_updated_idx ON posts (status, updated_at DESC, id DESC);
CREATE INDEX posts_updated_idx ON posts (updated_at DESC, id DESC);

CREATE TABLE post_revisions (
  post_id TEXT NOT NULL REFERENCES posts (id),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, revision)
);

CREATE TABLE idempotency_keys (
  -- The owner's Telegram ID: keys of different users never collide.
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 20),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 255),
  -- SHA-256 hex of the canonical request payload.
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('in_flight', 'completed')),
  response_status INTEGER,
  -- Worst case is a max-size post (200-char title, 4096-char body) with every character escaped
  -- by JSON.stringify: about 2 x 4300 + 200 characters, so 16384 always fits a valid post.
  response_body TEXT CHECK (response_body IS NULL OR length(response_body) <= 16384),
  created_at INTEGER NOT NULL,
  -- In flight: a short lease so a crashed request cannot lock the key for a day.
  -- Completed: the replay window.
  expires_at INTEGER NOT NULL,
  UNIQUE (scope, key),
  CHECK (status = 'in_flight' OR (response_status IS NOT NULL AND response_body IS NOT NULL))
);

-- For the future cleanup of expired keys.
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_telegram_id TEXT NOT NULL CHECK (length(actor_telegram_id) BETWEEN 1 AND 20),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 64),
  entity_type TEXT NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 64),
  entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 64),
  created_at INTEGER NOT NULL,
  -- Metadata only (revision numbers, changed field names); never post text or secrets.
  details TEXT CHECK (details IS NULL OR (json_valid(details) AND length(details) <= 1024))
);
