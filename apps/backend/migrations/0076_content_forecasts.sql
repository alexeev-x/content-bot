-- Forecasts of the daily analytics report (AI plan P5/P6, 19.10.2026): each one is stored with the report that
-- showed it and scored once its horizon has passed, so «Прогнозы: X из Y попали» rests on stored facts, not on
-- the report text. Expand only: one new table.
--   id = <report id>|<item id>|<horizon hours>  (a report stores its forecasts once, whatever the Cron overlap)
CREATE TABLE IF NOT EXISTS content_forecasts (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 300),
  report_id TEXT NOT NULL CHECK (length(report_id) BETWEEN 1 AND 100),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 200),
  method TEXT NOT NULL CHECK (length(method) BETWEEN 1 AND 40),
  origin INTEGER NOT NULL CHECK (origin >= 0),
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours IN (24, 72, 168)),
  target_at INTEGER NOT NULL CHECK (target_at > origin),
  expected INTEGER NOT NULL CHECK (expected >= 0),
  low INTEGER NOT NULL CHECK (low >= 0 AND low <= expected),
  high INTEGER NOT NULL CHECK (high >= expected),
  -- Filled when scored: the reading that stands for the fact, or none near the horizon (`no_fact`).
  fact INTEGER CHECK (fact IS NULL OR fact >= 0),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('in_band', 'below', 'above', 'no_fact')),
  scored_at INTEGER,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- The scorer reads the unscored forecasts whose horizon has passed, oldest first.
CREATE INDEX IF NOT EXISTS content_forecasts_due_idx ON content_forecasts (scored_at, target_at);
