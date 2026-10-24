-- Stage 2 of docs/ai/IMPLEMENTATION_PLAN.md: learning from the owner's edits under the owner's control.
-- Expand-only: two nullable columns and one new table; code deployed before this migration ignores them.

-- The owner's own words on a «Что не так?» verdict. Recorded only: a note never becomes a rule by itself.
ALTER TABLE ai_feedback ADD COLUMN note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500);

-- After a reason is tapped, the chat waits for the owner's note on that verdict, and the next plain message is
-- stored as it (like editing_generation_id, migration 0068). NULL: no note is awaited.
ALTER TABLE ai_writer_requests ADD COLUMN noting_feedback_id TEXT;

-- Texts the owner took out of the writer's examples («Не учиться на этом»). A row is an exclusion; deleting it brings
-- the text back. `source`: an approved AI revision the owner changed, or a post the owner wrote himself.
CREATE TABLE IF NOT EXISTS ai_learning_exclusions (
  source TEXT NOT NULL CHECK (source IN ('revision', 'post')),
  source_id TEXT NOT NULL CHECK (length(source_id) = 36),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (source, source_id)
);
