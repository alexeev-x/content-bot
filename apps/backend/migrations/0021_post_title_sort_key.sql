-- The old posts UI used Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' }).
-- The Worker stores a deterministic key so D1 can preserve that order before keyset pagination.
ALTER TABLE posts ADD COLUMN title_sort_key TEXT NOT NULL DEFAULT '';

CREATE INDEX posts_live_title_sort_idx ON posts (title_sort_key, id DESC) WHERE archived_at IS NULL;
CREATE INDEX posts_archive_title_sort_idx ON posts (title_sort_key, id DESC) WHERE archived_at IS NOT NULL;

-- An older Worker may still edit a title between the expand migration and its code deployment.
-- Clearing only an unchanged key lets the next bounded backfill repair it; the new Worker writes
-- the title and its key together and therefore does not trip this trigger.
CREATE TRIGGER posts_title_sort_key_invalidate AFTER UPDATE OF title ON posts
WHEN new.title != old.title AND new.title_sort_key = old.title_sort_key
BEGIN
  UPDATE posts SET title_sort_key = '' WHERE id = new.id;
END;
