-- The daily analytics report (AI plan P6, owner 19.10.2026: a presentation with the AI's review): the numbers
-- computed at `as_of` are stored before any model call, so the review explains stored numbers, the report can
-- be sent without it, and Studio can show the history (plan §4.3). Expand only: one new table.
--   id = daily:<owner-zone date>:v1, the same id as the content alert that finally carries it.
CREATE TABLE IF NOT EXISTS content_daily_reports (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),
  as_of INTEGER NOT NULL CHECK (as_of >= 0),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 100),
  -- The computed table and forecasts, and the forecast accuracy shown, as JSON written by the Worker.
  data TEXT NOT NULL CHECK (json_valid(data) AND length(data) <= 200000),
  -- waiting: the review job is queued; reviewed / unreviewed: the alert is raised with or without the review.
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'reviewed', 'unreviewed')),
  review TEXT CHECK (review IS NULL OR (json_valid(review) AND length(review) <= 20000)),
  review_error TEXT CHECK (review_error IS NULL OR length(review_error) <= 100),
  model TEXT CHECK (model IS NULL OR length(model) <= 100),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- The fallback finds the reports still waiting for a review after the deadline.
CREATE INDEX IF NOT EXISTS content_daily_reports_waiting_idx ON content_daily_reports (status, created_at);
