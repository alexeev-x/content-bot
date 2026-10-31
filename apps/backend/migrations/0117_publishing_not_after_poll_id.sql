-- Publishing for the rubric scheduler (docs/scheduler/area-backend-core.md §4.1), expand-only.
-- `jobs.not_after`: a post that has not gone out by this time (UTC ms) must not go out at all: the due scan and the
-- claim skip it and reconcile cancels it. NULL for every existing job and every manual publication.
ALTER TABLE jobs ADD COLUMN not_after INTEGER CHECK (not_after IS NULL OR not_after > 0);
-- Reconcile's expiry walk: only waiting jobs that carry a deadline.
CREATE INDEX jobs_not_after_idx ON jobs (not_after, id)
  WHERE not_after IS NOT NULL AND status IN ('pending', 'retry_wait');

-- The sent poll's id (Telegram's `poll.id`): the channel's votes and the poll's close are matched by it.
ALTER TABLE publications ADD COLUMN external_poll_id TEXT
  CHECK (external_poll_id IS NULL OR length(external_poll_id) BETWEEN 1 AND 64);
CREATE INDEX publications_poll_idx ON publications (external_poll_id) WHERE external_poll_id IS NOT NULL;
