-- Stage 3b: browser sign-in with the Telegram Login Widget.
-- Expand only: one new table. A widget payload is signed once by Telegram and stays valid for the
-- whole freshness window, so each accepted signature is remembered until it can no longer pass.

-- One row per accepted widget signature; the primary key is the replay guard. Only the SHA-256 of
-- the Telegram hash is stored. `session_id` names the session created by the same request: it is
-- how a batch tells "my claim" from "somebody else's claim" (no foreign key: the row is claimed
-- before the session row exists inside the batch, and it is purged long before sessions are).
CREATE TABLE widget_sign_ins (
  hash_sha256 TEXT PRIMARY KEY CHECK (length(hash_sha256) = 64),
  session_id TEXT NOT NULL CHECK (length(session_id) BETWEEN 1 AND 64),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (expires_at > created_at)
);

-- Bounded purge of expired rows (`WHERE expires_at <= ? LIMIT n`).
CREATE INDEX widget_sign_ins_expiry_idx ON widget_sign_ins (expires_at);
