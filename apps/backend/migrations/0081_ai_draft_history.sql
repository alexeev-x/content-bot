-- AI plan P8: the studio's history of AI drafts. Expand-only: two indexes.
-- A draft's versions (rewrites, fixes, the draft after a facts answer) hang off it by parent_generation_id.
CREATE INDEX IF NOT EXISTS ai_generations_parent_idx ON ai_generations (parent_generation_id)
  WHERE parent_generation_id IS NOT NULL;
-- The history lists first drafts newest first, a page at a time.
CREATE INDEX IF NOT EXISTS ai_generations_root_idx ON ai_generations (created_at DESC, id DESC)
  WHERE parent_generation_id IS NULL;
