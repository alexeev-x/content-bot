-- A file the bot attached itself (a source event's picture, owner 22.10.2026) is kept out of the library and goes
-- with its post: neither a revision nor a publication snapshot holds it, only the post's attachment row.
-- Expand-only: one defaulted column (every existing file stays as it was) and the 0040 cleanup trigger recreated with
-- that one exception.
ALTER TABLE media_assets ADD COLUMN attached_by_bot INTEGER NOT NULL DEFAULT 0 CHECK (attached_by_bot IN (0, 1));

DROP TRIGGER post_media_cleanup_after_detach;
CREATE TRIGGER post_media_cleanup_after_detach
AFTER DELETE ON post_media
BEGIN
  INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
  SELECT m.id, m.object_key, 0, m.created_at FROM media_assets m
   WHERE m.id = OLD.media_id
     AND m.in_library = 0
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
     AND (m.library_state = 2 OR m.attached_by_bot = 1
          OR NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id))
     AND (m.attached_by_bot = 1 OR NOT EXISTS (SELECT 1 FROM publications pu
           JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
           WHERE j.value = m.id))
     AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = m.id);
  DELETE FROM post_media_uploads
   WHERE media_id = OLD.media_id
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = OLD.media_id)
     AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = OLD.media_id);
END;
