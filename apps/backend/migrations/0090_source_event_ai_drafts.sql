-- A Steam announcement becomes an AI draft in the owner's bot chat (plan item 1, owner 21.10.2026) instead of a
-- template post. Expand-only: two nullable columns and one partial index.
-- ai_job_id: the AI_JOBS job requested for the event; a conditional UPDATE claims it once per detection, and the
--   owner's replay of a past announcement claims it again.
-- ai_generation_id: the draft the model wrote for it; the owner's approval links its post through it.
ALTER TABLE dota_update_items ADD COLUMN ai_job_id TEXT CHECK (ai_job_id IS NULL OR length(ai_job_id) = 36);
ALTER TABLE dota_update_items ADD COLUMN ai_generation_id TEXT
  CHECK (ai_generation_id IS NULL OR length(ai_generation_id) = 36);

-- Approval finds the event by the generation (or one of its ancestors).
CREATE INDEX dota_update_items_ai_generation_idx
  ON dota_update_items (ai_generation_id) WHERE ai_generation_id IS NOT NULL;
