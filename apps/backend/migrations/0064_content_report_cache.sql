-- The last built analytics report per period. The report reads every snapshot of the period (over a million
-- rows a day at a few dozen opens), while its data changes only when a source is collected. A row is reused
-- while `version` (the sources' last collection times) matches and it is younger than an hour.
CREATE TABLE IF NOT EXISTS content_report_cache (
  days INTEGER PRIMARY KEY CHECK (days IN (7, 30, 90)),
  version TEXT NOT NULL,
  built_at INTEGER NOT NULL,
  report TEXT NOT NULL CHECK (json_valid(report))
);
