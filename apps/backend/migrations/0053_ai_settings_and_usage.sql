-- AI writer foundation (docs/PLAN.md stage A, docs/API_CONTRACTS.md § AI). Expand-only: three new tables.
-- The provider key is a Worker secret (OPENAI_API_KEY) and is never stored here.

-- One row: the owner's AI settings, edited with a revision guard.
CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  document TEXT NOT NULL CHECK (json_valid(document) AND length(document) <= 8192),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL
);

-- Every AI request with its tokens and cost (micro-USD; NULL when the model has no price set).
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('check', 'draft', 'rewrite', 'review', 'profile', 'other')),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 40),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 80),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL CHECK (cached_input_tokens >= 0),
  -- Input written to the provider's prompt cache (OpenAI bills it at 1.25x input).
  cache_write_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
);
CREATE INDEX IF NOT EXISTS ai_usage_at_idx ON ai_usage (at);

-- Budget warnings already sent, one per period: 'warn:2026-10', 'stop:2026-10', 'day:2026-10-15'.
CREATE TABLE IF NOT EXISTS ai_budget_alerts (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 40),
  sent_at INTEGER NOT NULL
) WITHOUT ROWID;

-- The last connection check, for the settings page.
CREATE TABLE IF NOT EXISTS ai_connection_checks (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  checked_at INTEGER NOT NULL,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  model TEXT,
  error_code TEXT
);
