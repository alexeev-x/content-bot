-- Precise reasons for the owner's verdict on a draft (docs/ai/IMPLEMENTATION_PLAN.md stage 2) and the revision it
-- was given on. SQLite cannot widen a CHECK in place, so the table is rebuilt: the new set of kinds contains the
-- old one and every row is copied as is, so code deployed before this migration keeps working.
-- A verdict is only recorded: a single dislike never becomes a rule of the author's style.
PRAGMA defer_foreign_keys = true;

CREATE TABLE ai_feedback_new (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  generation_id TEXT NOT NULL REFERENCES ai_generations (id),
  kind TEXT NOT NULL CHECK (
    kind IN ('joke_missed', 'not_my_style', 'fact_wrong', 'topic_repeated', 'weak_hook', 'too_long', 'missed_task')
  ),
  -- The text the owner judged; null for verdicts recorded before this migration.
  revision_id TEXT REFERENCES ai_text_revisions (id),
  created_at INTEGER NOT NULL,
  UNIQUE (generation_id, kind)
);

INSERT INTO ai_feedback_new (id, generation_id, kind, revision_id, created_at)
  SELECT id, generation_id, kind, NULL, created_at FROM ai_feedback;

DROP TABLE ai_feedback;
ALTER TABLE ai_feedback_new RENAME TO ai_feedback;

CREATE INDEX IF NOT EXISTS ai_feedback_created_idx ON ai_feedback (created_at);
