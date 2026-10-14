-- Owner-entered performance observations remain append-only and survive publication cleanup.
CREATE TABLE manual_analytics_observations (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  publication_id TEXT NOT NULL CHECK (length(publication_id) = 36),
  post_title TEXT NOT NULL CHECK (length(post_title) <= 200),
  destination_title TEXT NOT NULL CHECK (length(destination_title) <= 200),
  metric TEXT NOT NULL CHECK (metric IN ('views', 'forwards', 'reactions')),
  value INTEGER NOT NULL CHECK (value >= 0 AND value <= 9007199254740991),
  content_age_minutes INTEGER NOT NULL CHECK (content_age_minutes IN (60, 180, 360, 720, 1440, 2880, 4320, 10080)),
  source_label TEXT NOT NULL CHECK (length(trim(source_label)) BETWEEN 1 AND 120),
  coverage TEXT NOT NULL CHECK (coverage IN ('complete', 'partial')),
  coverage_note TEXT CHECK (coverage_note IS NULL OR length(trim(coverage_note)) BETWEEN 1 AND 500),
  actor_telegram_id TEXT NOT NULL CHECK (length(actor_telegram_id) BETWEEN 1 AND 20),
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  CHECK (coverage != 'partial' OR coverage_note IS NOT NULL)
);

CREATE INDEX manual_analytics_observations_history_idx
  ON manual_analytics_observations (observed_at DESC, id DESC);
CREATE INDEX manual_analytics_observations_metric_age_idx
  ON manual_analytics_observations (metric, content_age_minutes, observed_at DESC, id DESC);
CREATE INDEX manual_analytics_observations_age_idx
  ON manual_analytics_observations (content_age_minutes, observed_at DESC, id DESC);
CREATE INDEX manual_analytics_observations_publication_idx
  ON manual_analytics_observations (publication_id, observed_at DESC, id DESC);

PRAGMA optimize;
