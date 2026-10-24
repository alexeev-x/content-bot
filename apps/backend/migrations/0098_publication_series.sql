-- A series of publications (owner, 22.10.2026: «публикация одна, но содержит 3 поста», a clear order): posts of one
-- event go out one after another with a gap. Expand-only: nullable columns and partial indexes.

-- The series a publication belongs to and its place in it (1 = first).
ALTER TABLE publications ADD COLUMN series_id TEXT CHECK (series_id IS NULL OR length(series_id) = 36);
ALTER TABLE publications ADD COLUMN series_position INTEGER
  CHECK (series_position IS NULL OR series_position BETWEEN 1 AND 10);

-- A series job is due only once the job of the previous post is `succeeded` and `chain_gap_ms` has passed since
-- (its `updated_at`): the due scan and the claim check it. Nothing is written when the previous post goes out, so
-- the Cron tick's statements and their change counts stay as they are (D1 counts trigger changes too).
-- Not a foreign key: deleting a post deletes its jobs, and the later posts of its series are cancelled in the same
-- batch rather than blocking that delete.
ALTER TABLE jobs ADD COLUMN blocked_by_job_id TEXT CHECK (blocked_by_job_id IS NULL OR length(blocked_by_job_id) = 36);
ALTER TABLE jobs ADD COLUMN chain_gap_ms INTEGER CHECK (chain_gap_ms IS NULL OR chain_gap_ms >= 0);

CREATE INDEX publications_series_idx ON publications (series_id, series_position) WHERE series_id IS NOT NULL;
