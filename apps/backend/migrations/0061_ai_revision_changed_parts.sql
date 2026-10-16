-- Which parts of the AI draft the owner changed before approval (docs/ai/architecture.md, item 4): hook, ending,
-- length, structure, swearing, ai_wording, tagged by code on approval. Evidence for «Качество», never a rule.
-- Expand-only: one nullable column (older approvals stay untagged).
ALTER TABLE ai_text_revisions ADD COLUMN changed_parts TEXT CHECK (changed_parts IS NULL OR json_valid(changed_parts));
