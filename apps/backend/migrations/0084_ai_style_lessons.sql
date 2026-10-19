-- AI plan P7c (owner, 19.10.2026: «чтобы он все время учился»): what the owner's edits and remarks teach the
-- writer. Expand-only: two new tables. A lesson is a one-line writing preference the model reads off one edit;
-- the same lesson from two drafts (or one remark) is put to the owner, and only «Учитывать» makes it an owner rule
-- (ai_rules, migration 0079) that prompts get.
CREATE TABLE IF NOT EXISTS ai_style_lessons (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 3 AND 400),
  scope TEXT NOT NULL CHECK (scope IN ('telegram', 'fidit', 'igrat', 'standalone')),
  -- seen: noted, waiting for a second draft; asked: the owner's question is out; accepted / rejected: answered;
  -- expired: asked and left unanswered for 30 days (not asked again, and no longer holds a place).
  status TEXT NOT NULL CHECK (status IN ('seen', 'asked', 'accepted', 'rejected', 'expired')),
  -- The owner said it in words («Что не так?»): asked at once, no second draft needed.
  from_remark INTEGER NOT NULL DEFAULT 0 CHECK (from_remark IN (0, 1)),
  -- The owner rule an accepted lesson became.
  rule_id TEXT REFERENCES ai_rules (id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_style_lessons_status_idx ON ai_style_lessons (status, scope);

-- Every edit or remark read once: the row is the claim (a repeated or overlapping run skips it) and, with its
-- lesson, the evidence; a lesson counts distinct drafts.
CREATE TABLE IF NOT EXISTS ai_style_sources (
  -- `revision:<id>` (an approval the owner changed) or `feedback:<id>` (a remark).
  source_key TEXT PRIMARY KEY CHECK (length(source_key) BETWEEN 1 AND 100),
  generation_id TEXT NOT NULL,
  lesson_id TEXT REFERENCES ai_style_lessons (id),
  outcome TEXT NOT NULL CHECK (outcome IN ('claimed', 'lesson', 'none')),
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ai_style_sources_lesson_idx ON ai_style_sources (lesson_id) WHERE lesson_id IS NOT NULL;
