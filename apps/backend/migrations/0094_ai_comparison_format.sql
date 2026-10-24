-- The provider comparison also covers the rubrics (owner, 21.10.2026): each pair keeps the writer format and mode of its
-- task. Expand-only: two columns with defaults, so the rows of migration 0093 stay automatic Telegram posts.
ALTER TABLE ai_comparisons ADD COLUMN format TEXT NOT NULL DEFAULT 'telegram'
  CHECK (format IN ('fidit', 'igrat', 'standalone', 'telegram'));
ALTER TABLE ai_comparisons ADD COLUMN mode TEXT NOT NULL DEFAULT 'automatic' CHECK (mode IN ('direct', 'automatic'));
