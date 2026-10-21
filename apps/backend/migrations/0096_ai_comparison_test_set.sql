-- The comparison as a fixed test set (owner, 21.10.2026, «тест № 2»): each pair is one task of the set with its code
-- (R01…, TG01…, IDEA-01…) and place; a follow-up post waits for its first post (`after_id`, the same model's text goes
-- into its task); each side keeps its error, its cost and its time, shown only after every pair is picked.
-- Expand-only: new nullable columns and one with a default.
ALTER TABLE ai_comparisons ADD COLUMN code TEXT CHECK (code IS NULL OR length(code) BETWEEN 1 AND 20);
ALTER TABLE ai_comparisons ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0);
ALTER TABLE ai_comparisons ADD COLUMN after_id TEXT CHECK (after_id IS NULL OR length(after_id) = 36);
ALTER TABLE ai_comparisons ADD COLUMN a_error TEXT CHECK (a_error IS NULL OR length(a_error) <= 200);
ALTER TABLE ai_comparisons ADD COLUMN b_error TEXT CHECK (b_error IS NULL OR length(b_error) <= 200);
ALTER TABLE ai_comparisons ADD COLUMN a_cost_micro INTEGER CHECK (a_cost_micro IS NULL OR a_cost_micro >= 0);
ALTER TABLE ai_comparisons ADD COLUMN b_cost_micro INTEGER CHECK (b_cost_micro IS NULL OR b_cost_micro >= 0);
ALTER TABLE ai_comparisons ADD COLUMN a_ms INTEGER CHECK (a_ms IS NULL OR a_ms >= 0);
ALTER TABLE ai_comparisons ADD COLUMN b_ms INTEGER CHECK (b_ms IS NULL OR b_ms >= 0);
CREATE INDEX ai_comparisons_after_idx ON ai_comparisons (after_id) WHERE after_id IS NOT NULL;
