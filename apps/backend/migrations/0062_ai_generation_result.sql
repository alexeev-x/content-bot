-- The writer's answer is typed by the model (structured output), not guessed from its text: a full draft, or a
-- request for the owner's facts (a question, optionally with 2–3 topic ideas). A needs_facts answer has no
-- AI_DRAFT revision and can never be approved. `facets` keeps the topic, comic device and ending type of a draft
-- so the next one avoids repeating them. Expand-only: nullable columns; older rows (result NULL) keep their
-- NEEDS_FACTS warning as before.
ALTER TABLE ai_generations ADD COLUMN result TEXT CHECK (result IS NULL OR result IN ('draft', 'needs_facts'));
ALTER TABLE ai_generations ADD COLUMN question TEXT CHECK (question IS NULL OR length(question) BETWEEN 1 AND 1000);
ALTER TABLE ai_generations ADD COLUMN ideas TEXT CHECK (ideas IS NULL OR json_valid(ideas));
ALTER TABLE ai_generations ADD COLUMN facets TEXT CHECK (facets IS NULL OR json_valid(facets));
-- Recent drafts of a format, for the variety list of the next prompt.
CREATE INDEX IF NOT EXISTS ai_generations_format_created_idx ON ai_generations (format, created_at) WHERE result = 'draft';
