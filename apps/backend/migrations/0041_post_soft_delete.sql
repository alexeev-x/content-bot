-- Owner-deleted posts that already sent a publication stay as tombstones so «Публикации» keeps the history
-- (docs/DECISIONS.md, 14.10.2026). NULL = a normal post; a value = deleted at that UTC epoch ms, hidden from
-- every list and editor, never purged again. Expand-only: one nullable column, no backfill.
ALTER TABLE posts ADD COLUMN deleted_at INTEGER;
