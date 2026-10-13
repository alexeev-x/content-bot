CREATE TABLE dota_watches (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('hero', 'item')),
  entity_name TEXT NOT NULL CHECK (length(entity_name) BETWEEN 1 AND 200),
  entity_key TEXT NOT NULL CHECK (length(entity_key) BETWEEN 1 AND 200),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  removed_at INTEGER CHECK (removed_at IS NULL OR removed_at >= created_at)
);

CREATE UNIQUE INDEX dota_watches_active_entity_idx
  ON dota_watches(entity_type, entity_key) WHERE removed_at IS NULL;
CREATE INDEX dota_watches_active_created_idx
  ON dota_watches(created_at, id) WHERE removed_at IS NULL;

CREATE INDEX dota_update_items_patch_detected_idx
  ON dota_update_items(detected_at, external_id) WHERE source_key = 'patch_notes' AND is_baseline = 0;

CREATE TABLE dota_watch_matches (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  watch_id TEXT NOT NULL REFERENCES dota_watches(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL CHECK (source_key = 'patch_notes'),
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 100),
  fact_id TEXT NOT NULL CHECK (length(fact_id) BETWEEN 1 AND 160),
  fact_json TEXT NOT NULL CHECK (json_valid(fact_json) AND length(fact_json) <= 5000),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE(watch_id, source_key, external_id),
  FOREIGN KEY(source_key, external_id) REFERENCES dota_update_items(source_key, external_id) ON DELETE CASCADE
);
CREATE INDEX dota_watch_matches_newest_idx ON dota_watch_matches(created_at DESC, id DESC);

CREATE TABLE dota_watch_alerts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  match_id TEXT NOT NULL UNIQUE REFERENCES dota_watch_matches(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown', 'disabled')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 80),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  send_started_at INTEGER CHECK (send_started_at IS NULL OR send_started_at >= created_at)
);
CREATE INDEX dota_watch_alerts_pending_idx ON dota_watch_alerts(created_at, id) WHERE status = 'pending';
