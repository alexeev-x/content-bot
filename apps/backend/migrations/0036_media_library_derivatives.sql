-- A derived library item (a crop saved in Медиа) belongs to no post, so it needs its own retention flag:
-- in_library = 1 keeps the asset listed, readable and attachable until the owner deletes it.
-- Expand-only: a defaulted column and a new table; the cleanup triggers are recreated with the flag.
ALTER TABLE media_assets ADD COLUMN in_library INTEGER NOT NULL DEFAULT 0 CHECK (in_library IN (0, 1));

-- Idempotency of POST /api/v1/media/{sourceId}/derived. media_id has no foreign key on purpose: the
-- row is removed together with the asset by the delete statement, never by a cascade.
CREATE TABLE media_derivations (
  idempotency_key TEXT PRIMARY KEY CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  source_media_id TEXT NOT NULL CHECK (length(source_media_id) = 36),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  media_id TEXT NOT NULL CHECK (length(media_id) = 36),
  response_body TEXT NOT NULL CHECK (length(response_body) <= 4096 AND json_valid(response_body)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
);
CREATE INDEX media_derivations_media_idx ON media_derivations (media_id);

DROP TRIGGER post_media_cleanup_after_detach;
CREATE TRIGGER post_media_cleanup_after_detach
AFTER DELETE ON post_media
BEGIN
  INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
  SELECT m.id, m.object_key, 0, m.created_at FROM media_assets m
   WHERE m.id = OLD.media_id
     AND m.in_library = 0
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id)
     AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = m.id);
  DELETE FROM post_media_uploads
   WHERE media_id = OLD.media_id
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = OLD.media_id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = OLD.media_id);
END;

DROP TRIGGER media_asset_cleanup_source_after_delete;
CREATE TRIGGER media_asset_cleanup_source_after_delete
AFTER DELETE ON media_assets
WHEN OLD.source_media_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
  SELECT source.id, source.object_key, 0, source.created_at FROM media_assets source
   WHERE source.id = OLD.source_media_id
     AND source.in_library = 0
     AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = source.id)
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = source.id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = source.id);
END;
