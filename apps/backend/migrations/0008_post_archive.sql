-- Stage 5: the post archive (docs/BACKEND_ARCHITECTURE.md §5, "Post lifecycle as built").
-- Expand only: two nullable columns, a one-time backfill and four indexes. Times are UTC epoch milliseconds.

-- Set by the Cron archive step once a post has a sent publication and nothing left to send. A live
-- post has none. The 30-day retention clock runs from this value.
ALTER TABLE posts ADD COLUMN archived_at INTEGER CHECK (archived_at IS NULL OR archived_at >= 0);
-- Set when the owner takes a post out of the archive. Only publications that finished after it can
-- archive the post again, so a restored post is not put straight back.
ALTER TABLE posts ADD COLUMN restored_at INTEGER CHECK (restored_at IS NULL OR restored_at >= 0);

-- One-time backfill: posts that were already published before this release belong in the archive too,
-- and the Cron archive step only looks at recently finished jobs. A post qualifies by the same rule as
-- that step (approved, a sent publication, nothing scheduled, queued, preparing, sending, retry_wait
-- or unknown). The 30-day clock starts now, at the time the migration is applied, so nothing is
-- purged early. restored_at is still NULL for every row. The audit row comes first because the
-- update changes the condition; the tests run both statements against seeded data.
INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
SELECT 'system', 'post.archive', 'post', po.id, CAST(strftime('%s', 'now') AS INTEGER) * 1000, '{"reason":"backfill"}'
FROM posts po
WHERE po.archived_at IS NULL AND po.status = 'approved'
  AND EXISTS (SELECT 1 FROM publications p2 JOIN jobs j2 ON j2.publication_id = p2.id
              WHERE p2.post_id = po.id AND j2.status = 'succeeded')
  AND NOT EXISTS (SELECT 1 FROM publications p3 JOIN jobs j3 ON j3.publication_id = p3.id
                  WHERE p3.post_id = po.id AND j3.status IN ('pending', 'claimed', 'retry_wait', 'unknown'));

UPDATE posts SET archived_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE archived_at IS NULL AND status = 'approved'
  AND EXISTS (SELECT 1 FROM publications p2 JOIN jobs j2 ON j2.publication_id = p2.id
              WHERE p2.post_id = posts.id AND j2.status = 'succeeded')
  AND NOT EXISTS (SELECT 1 FROM publications p3 JOIN jobs j3 ON j3.publication_id = p3.id
                  WHERE p3.post_id = posts.id AND j3.status IN ('pending', 'claimed', 'retry_wait', 'unknown'));

-- Deleting a post removes the incidents of its publications and jobs; without these two the delete
-- would scan the whole table.
CREATE INDEX incidents_publication_idx ON incidents (publication_id);
CREATE INDEX incidents_job_idx ON incidents (job_id);

-- The archive list (most recently archived first), its count and the purge of expired posts
-- (oldest first, read from the same index backwards). Partial: live posts never enter it.
CREATE INDEX posts_archive_idx ON posts (archived_at DESC, id DESC) WHERE archived_at IS NOT NULL;

-- The archive step's scan: jobs that reached a final state recently, in time order. Partial, so
-- pending and in-flight jobs never enter it and the range read is bounded by the lookback window.
CREATE INDEX jobs_final_updated_idx ON jobs (updated_at) WHERE status IN ('succeeded', 'failed', 'cancelled');
