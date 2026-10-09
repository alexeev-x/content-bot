ALTER TABLE media_assets ADD COLUMN source_media_id TEXT REFERENCES media_assets (id);
CREATE INDEX media_assets_source_idx ON media_assets (source_media_id) WHERE source_media_id IS NOT NULL;

CREATE TABLE post_media_crops (
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  state TEXT NOT NULL CHECK (state IN ('in_flight', 'completed')),
  request_id TEXT,
  lease_until INTEGER CHECK (lease_until IS NULL OR lease_until >= 0),
  payload_hash TEXT CHECK (payload_hash IS NULL OR length(payload_hash) = 64),
  media_id TEXT REFERENCES media_assets (id),
  response_body TEXT CHECK (response_body IS NULL OR (length(response_body) <= 4096 AND json_valid(response_body))),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (post_id, idempotency_key),
  CHECK (
    (state = 'in_flight' AND request_id IS NOT NULL AND lease_until IS NOT NULL
      AND payload_hash IS NULL AND media_id IS NULL AND response_body IS NULL)
    OR
    (state = 'completed' AND request_id IS NULL AND lease_until IS NULL
      AND payload_hash IS NOT NULL AND media_id IS NOT NULL AND response_body IS NOT NULL)
  )
);
CREATE INDEX post_media_crops_media_idx ON post_media_crops (media_id) WHERE media_id IS NOT NULL;

DROP TRIGGER post_media_cleanup_after_detach;
CREATE TRIGGER post_media_cleanup_after_detach
AFTER DELETE ON post_media
BEGIN
  INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
  SELECT m.id, m.object_key, 0, m.created_at FROM media_assets m
   WHERE m.id = OLD.media_id
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id)
     AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = m.id);
  DELETE FROM post_media_uploads
   WHERE media_id = OLD.media_id
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = OLD.media_id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = OLD.media_id);
END;

CREATE TRIGGER media_asset_cleanup_source_after_delete
AFTER DELETE ON media_assets
WHEN OLD.source_media_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
  SELECT source.id, source.object_key, 0, source.created_at FROM media_assets source
   WHERE source.id = OLD.source_media_id
     AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = source.id)
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = source.id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = source.id);
END;
