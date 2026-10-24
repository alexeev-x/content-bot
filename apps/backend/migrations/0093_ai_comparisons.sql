-- A blind comparison of two AI providers on the same writer task (owner, 21.10.2026; docs/ai/claude-provider.md §3).
-- Expand-only: one new table. Each row is one task written by both models; which model is A is drawn at random and
-- shown only after the owner's choice.
CREATE TABLE ai_comparisons (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  task TEXT NOT NULL CHECK (length(task) BETWEEN 1 AND 4000),
  a_model TEXT NOT NULL CHECK (length(a_model) BETWEEN 1 AND 100),
  b_model TEXT NOT NULL CHECK (length(b_model) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'writing' CHECK (status IN ('writing', 'ready', 'failed')),
  a_generation_id TEXT CHECK (a_generation_id IS NULL OR length(a_generation_id) = 36),
  b_generation_id TEXT CHECK (b_generation_id IS NULL OR length(b_generation_id) = 36),
  choice TEXT CHECK (choice IS NULL OR choice IN ('a', 'b', 'same')),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  chosen_at INTEGER CHECK (chosen_at IS NULL OR chosen_at >= created_at)
);
CREATE INDEX ai_comparisons_created_idx ON ai_comparisons (created_at DESC, id);
