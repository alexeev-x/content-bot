-- Stage 3a: sign-in, refresh and rate limiting.
-- Expand only: two nullable-by-default columns on sessions and two new tables.

-- Display name copied from the Telegram user at sign-in (cleaned and bounded by the application).
ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 64);

-- Absolute end of the whole session. `expires_at` stays the end of the current access token,
-- and a refresh never moves it past this value. 0 (rows created before this migration, or
-- seeded directly) means the session cannot be refreshed.
ALTER TABLE sessions ADD COLUMN hard_expires_at INTEGER NOT NULL DEFAULT 0;

-- Browser refresh tokens: one row per issued token, only the SHA-256 hash is stored. A token is
-- used at most once; presenting a used one is theft evidence and revokes the whole session.
CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  session_id TEXT NOT NULL REFERENCES sessions (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  -- Hash of the token that replaced this one; it also marks which request won a rotation race.
  replaced_by TEXT CHECK (replaced_by IS NULL OR length(replaced_by) = 64),
  CHECK (expires_at > created_at)
);

-- Cleanup of a session's expired tokens during rotation.
CREATE INDEX refresh_tokens_session_idx ON refresh_tokens (session_id, expires_at);

-- Fixed-window counters for the sign-in and refresh endpoints. The bucket is a hash of the
-- endpoint and the client, never an address in clear text.
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY CHECK (length(bucket) BETWEEN 1 AND 100),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 1)
);

-- Cleanup of expired windows.
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);
