-- TikTok connection for content analytics (docs/API_CONTRACTS.md § Content analytics). Expand-only:
-- two new tables, no change to existing data.

-- Single-use OAuth `state` values (stored as SHA-256 hashes) that tie TikTok's redirect back to a
-- connect the owner started; they expire after 10 minutes.
CREATE TABLE IF NOT EXISTS content_oauth_states (
  state_hash TEXT PRIMARY KEY CHECK (length(state_hash) = 64),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
) WITHOUT ROWID;

-- The connected account per platform. Tokens are AES-GCM encrypted with a key derived from a Worker
-- secret (platform/security/token-cipher.ts); the plain values never reach D1.
CREATE TABLE IF NOT EXISTS content_connections (
  platform TEXT PRIMARY KEY CHECK (platform IN ('tiktok')),
  account_id TEXT NOT NULL,
  account_name TEXT,
  scope TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  connected_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
