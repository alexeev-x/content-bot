CREATE TABLE dota_source_incidents_next (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  source_key TEXT NOT NULL CHECK (source_key IN ('steam_news', 'patch_notes')),
  external_id TEXT CHECK (external_id IS NULL OR length(external_id) BETWEEN 1 AND 40),
  code TEXT NOT NULL CHECK (code IN (
    'DOTA_SOURCE_FETCH', 'DOTA_SOURCE_HTTP', 'DOTA_SOURCE_BODY_LIMIT', 'DOTA_SOURCE_JSON', 'DOTA_SOURCE_SHAPE',
    'DOTA_PATCH_DETAIL_FETCH', 'DOTA_PATCH_DETAIL_HTTP', 'DOTA_PATCH_DETAIL_BODY_LIMIT', 'DOTA_PATCH_DETAIL_JSON', 'DOTA_PATCH_DETAIL_SHAPE'
  )),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  resolved_at INTEGER CHECK (resolved_at IS NULL OR resolved_at >= created_at),
  owner_alert_claimed_at INTEGER CHECK (owner_alert_claimed_at IS NULL OR owner_alert_claimed_at >= 0)
);

INSERT INTO dota_source_incidents_next (id, source_key, external_id, code, created_at, resolved_at, owner_alert_claimed_at)
SELECT id, source_key, NULL, code, created_at, resolved_at, owner_alert_claimed_at FROM dota_source_incidents;

DROP TABLE dota_source_incidents;
ALTER TABLE dota_source_incidents_next RENAME TO dota_source_incidents;

CREATE UNIQUE INDEX dota_source_incidents_one_open_idx
  ON dota_source_incidents (source_key) WHERE external_id IS NULL AND resolved_at IS NULL;
CREATE UNIQUE INDEX dota_patch_incidents_one_open_idx
  ON dota_source_incidents (source_key, external_id) WHERE external_id IS NOT NULL AND resolved_at IS NULL;
CREATE INDEX dota_source_incidents_alert_idx
  ON dota_source_incidents (created_at, id) WHERE owner_alert_claimed_at IS NULL;
