-- The writer learns only from texts the owner switched on (owner, 20.10.2026: examples «по умолчанию выключены»; on DEV
-- the examples were test posts like «asdasd»). Expand-only: one new table, no change to existing data.
--
-- A text written before LEARNING_OPT_IN_SINCE (modules/ai, 20.10.2026 00:00 UTC) keeps the old rule: it counts unless
-- it is in ai_learning_exclusions. A newer one counts only once it is in ai_learning_inclusions. A switch writes both
-- tables (one row in, the other out), so the state of any text is one lookup either way.
CREATE TABLE IF NOT EXISTS ai_learning_inclusions (
  source TEXT NOT NULL CHECK (source IN ('revision', 'post')),
  source_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source, source_id)
) WITHOUT ROWID;
