-- Archive list/count and the retention purge scan only archived, not-deleted posts (docs/DECISIONS.md,
-- 14.10.2026); the partial predicate matches their WHERE so SQLite can use it. Tombstone sweep: posts that
-- were soft-deleted. Expand-only: two indexes, no data change.
CREATE INDEX IF NOT EXISTS posts_archived_idx ON posts (archived_at, id)
  WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS posts_deleted_idx ON posts (deleted_at) WHERE deleted_at IS NOT NULL;
