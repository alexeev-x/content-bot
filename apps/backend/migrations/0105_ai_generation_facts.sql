-- ai_generations.facts: a source's whole facts (a patch's full notes, an announcement's whole text) beside the task's
-- 4 000 characters of instructions (owner, 23.10.2026: the writer gets the maximum data to build the post from). A
-- rewrite or a fix copies its parent's facts, so «Переписать» sees them too. Expand-only: null on every older row.
ALTER TABLE ai_generations ADD COLUMN facts TEXT CHECK (facts IS NULL OR length(facts) BETWEEN 1 AND 60000);
