-- An event's series published without the owner (owner, 22.10.2026), as a single news post already is. Expand-only:
-- source_series.automatic: planned from Cron's first draft of a new event (never the owner's replay), so it may go
--   out by itself;
-- source_series_posts.fact_check: what the fact check found in the post's draft; only a series whose every post is
--   'clean' is published without the owner.
ALTER TABLE source_series ADD COLUMN automatic INTEGER NOT NULL DEFAULT 0 CHECK (automatic IN (0, 1));
ALTER TABLE source_series_posts ADD COLUMN fact_check TEXT
  CHECK (fact_check IS NULL OR fact_check IN ('clean', 'fixed', 'unchecked'));
