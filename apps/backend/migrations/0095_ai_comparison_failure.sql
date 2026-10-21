-- Why a comparison pair was not written (owner, 21.10.2026: a failed pair must say why): the AI budget or another error.
-- Expand-only: one nullable column; older failed rows stay without a reason.
ALTER TABLE ai_comparisons ADD COLUMN failure TEXT CHECK (failure IS NULL OR failure IN ('budget', 'error'));
