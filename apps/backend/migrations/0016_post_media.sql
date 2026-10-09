ALTER TABLE post_revisions
  ADD COLUMN media_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(media_json) AND json_type(media_json) = 'array' AND json_array_length(media_json) <= 10);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  object_key TEXT NOT NULL UNIQUE CHECK (length(object_key) <= 128),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'animation', 'video')),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 50000000),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
);

CREATE TABLE post_media (
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_assets (id),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 9),
  PRIMARY KEY (post_id, media_id)
);
CREATE INDEX post_media_order_idx ON post_media (post_id, position, media_id);

CREATE TABLE post_media_uploads (
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  media_id TEXT NOT NULL CHECK (length(media_id) = 36),
  response_body TEXT NOT NULL CHECK (length(response_body) <= 4096 AND json_valid(response_body)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (post_id, idempotency_key)
);
CREATE INDEX post_media_uploads_created_idx ON post_media_uploads (created_at, post_id);

-- staging: 0 means ready to delete, 1 is an active upload, 2 is a leased cleanup claim.
CREATE TABLE post_media_cleanup (
  media_id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL CHECK (length(object_key) <= 128),
  staging INTEGER NOT NULL DEFAULT 0 CHECK (staging IN (0, 1, 2)),
  claim_until INTEGER CHECK (claim_until IS NULL OR claim_until >= 0),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
);
CREATE INDEX post_media_cleanup_order_idx ON post_media_cleanup (staging, created_at, media_id);

-- Every detach and post cascade enters a durable private-object cleanup queue. A reattach/order change
-- is reconciled against live references before deletion, so this trigger never decides from cache state.
CREATE TRIGGER post_media_cleanup_after_detach
AFTER DELETE ON post_media
BEGIN
  INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
  SELECT m.id, m.object_key, 0, m.created_at FROM media_assets m
   WHERE m.id = OLD.media_id
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id);
  DELETE FROM post_media_uploads
   WHERE media_id = OLD.media_id
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = OLD.media_id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = OLD.media_id);
END;
