ALTER TABLE dota_source_state ADD COLUMN last_attempt_at INTEGER CHECK (last_attempt_at IS NULL OR last_attempt_at >= 0);
ALTER TABLE dota_source_state ADD COLUMN last_success_at INTEGER CHECK (last_success_at IS NULL OR last_success_at >= 0);

CREATE INDEX dota_update_items_newest_idx
  ON dota_update_items (published_at DESC, source_key ASC, external_id ASC);

CREATE INDEX dota_update_items_source_newest_idx
  ON dota_update_items (source_key ASC, published_at DESC, external_id ASC);

CREATE INDEX dota_source_incidents_open_newest_idx
  ON dota_source_incidents (source_key ASC, created_at DESC, id DESC)
  WHERE resolved_at IS NULL;
