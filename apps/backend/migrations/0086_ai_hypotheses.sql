-- Daily report v2, step 2 (owner, 20.10.2026: «как он считает, советует, запоминает — и от этого зависит написание
-- текстов»): the analyst's hypotheses H1, H2… with their status, reviewed every Monday. A supported hypothesis about how
-- to write becomes a style lesson put to the owner, and only «Учитывать» makes it a rule the writer gets.
-- Expand-only: one new table and one column with a default.
CREATE TABLE IF NOT EXISTS ai_hypotheses (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  -- H<code> in reports and the studio; one number per hypothesis, never reused.
  code INTEGER NOT NULL UNIQUE CHECK (code BETWEEN 1 AND 9999),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 3 AND 300),
  scope TEXT NOT NULL CHECK (scope IN ('telegram', 'fidit', 'igrat', 'standalone')),
  -- writing: how a text is written (hook, conflict, length) and can become a rule; topic: what to film or post.
  kind TEXT NOT NULL CHECK (kind IN ('writing', 'topic')),
  status TEXT NOT NULL CHECK (status IN ('open', 'supported', 'refuted')),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium')),
  -- The last review's reason, with the numbers it rests on.
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  -- The report that raised it or last changed it.
  source_ref TEXT NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 100),
  -- The lesson a supported writing hypothesis was put to the owner as.
  lesson_id TEXT REFERENCES ai_style_lessons (id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_hypotheses_status_idx ON ai_hypotheses (status, updated_at DESC);

-- Where a lesson came from: the owner's edits and remarks, or a supported hypothesis of the analytics.
ALTER TABLE ai_style_lessons ADD COLUMN origin TEXT NOT NULL DEFAULT 'edit' CHECK (origin IN ('edit', 'analytics'));
