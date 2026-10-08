ALTER TABLE dota_update_items ADD COLUMN draft_post_id TEXT CHECK (draft_post_id IS NULL OR length(draft_post_id) = 36);
ALTER TABLE dota_update_items ADD COLUMN owner_alert_claimed_at INTEGER CHECK (owner_alert_claimed_at IS NULL OR owner_alert_claimed_at >= 0);

-- Bounded scan for new records and separately recoverable owner alerts.
CREATE INDEX dota_draft_candidates_idx
  ON dota_update_items (published_at, source_key, external_id)
  WHERE is_baseline = 0 AND draft_post_id IS NULL;
CREATE INDEX dota_draft_recovery_idx
  ON dota_update_items (published_at, source_key, external_id)
  WHERE is_baseline = 0 AND draft_post_id IS NOT NULL AND owner_alert_claimed_at IS NULL;
CREATE TABLE dota_source_incidents (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  source_key TEXT NOT NULL CHECK (source_key IN ('steam_news', 'patch_notes')),
  code TEXT NOT NULL CHECK (code IN ('DOTA_SOURCE_FETCH', 'DOTA_SOURCE_HTTP', 'DOTA_SOURCE_BODY_LIMIT', 'DOTA_SOURCE_JSON', 'DOTA_SOURCE_SHAPE')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= created_at),
  owner_alert_claimed_at INTEGER CHECK (owner_alert_claimed_at IS NULL OR owner_alert_claimed_at >= 0)
);
CREATE UNIQUE INDEX dota_source_incidents_one_open_idx
  ON dota_source_incidents (source_key) WHERE resolved_at IS NULL;
CREATE INDEX dota_source_incidents_alert_idx
  ON dota_source_incidents (created_at, id) WHERE owner_alert_claimed_at IS NULL;
