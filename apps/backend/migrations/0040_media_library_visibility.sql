-- Library visibility, independent of retention (in_library only decides what cleanup may delete):
-- 0 = listed, 1 = hidden by the owner (reversible, still readable and attachable by id),
-- 2 = replaced by a crop (POST /media/{id}/derived?mode=replace): never listed again, kept only while
-- an approved post, a snapshot or a crop still needs the file.
-- Expand-only: one defaulted column (existing rows stay listed) and the two cleanup triggers recreated below.
ALTER TABLE media_assets ADD COLUMN library_state INTEGER NOT NULL DEFAULT 0 CHECK (library_state IN (0, 1, 2));

-- A replaced original (library_state = 2) is kept only by a post attachment, a publication snapshot or a
-- crop. Plain draft revision rows (written by every attach) do not hold it, otherwise it leaks forever.
-- The two cleanup triggers apply that rule; they are otherwise the 0036 versions.
DROP TRIGGER post_media_cleanup_after_detach;
CREATE TRIGGER post_media_cleanup_after_detach
AFTER DELETE ON post_media
BEGIN
  INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
  SELECT m.id, m.object_key, 0, m.created_at FROM media_assets m
   WHERE m.id = OLD.media_id
     AND m.in_library = 0
     AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
     AND (m.library_state = 2 OR NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id))
     AND NOT EXISTS (SELECT 1 FROM publications pu
           JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
           WHERE j.value = m.id)
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
     AND (source.library_state = 2 OR NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = source.id))
     AND NOT EXISTS (SELECT 1 FROM publications pu
           JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
           WHERE j.value = source.id);
END;
