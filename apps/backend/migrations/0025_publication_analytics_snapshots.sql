-- Append-only publication observations are independent of mutable/deletable publication rows.
CREATE TABLE analytics_snapshots (
  snapshot_id TEXT PRIMARY KEY CHECK (length(snapshot_id) BETWEEN 1 AND 192),
  snapshot_key TEXT NOT NULL UNIQUE CHECK (length(snapshot_key) BETWEEN 1 AND 192),
  observation_kind TEXT NOT NULL CHECK (observation_kind IN ('attempt', 'resolution', 'backfill')),
  publication_id TEXT NOT NULL CHECK (length(publication_id) = 36),
  job_id TEXT NOT NULL CHECK (length(job_id) = 36),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('sent', 'failed', 'unknown')),
  post_id TEXT NOT NULL CHECK (length(post_id) = 36),
  post_revision INTEGER NOT NULL CHECK (post_revision >= 0),
  title TEXT NOT NULL CHECK (length(title) <= 200),
  destination_id TEXT NOT NULL CHECK (length(destination_id) = 36),
  destination_title TEXT CHECK (destination_title IS NULL OR length(destination_title) <= 200),
  media_kinds TEXT CHECK (
    media_kinds IS NULL OR (json_valid(media_kinds) AND json_type(media_kinds) = 'array'
      AND json_array_length(media_kinds) <= 10)
  ),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1),
  retry_count INTEGER NOT NULL CHECK (retry_count >= 0 AND retry_count = attempt_count - 1)
);

CREATE INDEX analytics_snapshots_observed_idx
  ON analytics_snapshots (observed_at DESC, snapshot_id DESC);
CREATE INDEX analytics_snapshots_publication_idx
  ON analytics_snapshots (publication_id, observed_at DESC, snapshot_id DESC);
CREATE INDEX analytics_snapshots_destination_idx
  ON analytics_snapshots (destination_id, observed_at DESC, snapshot_id DESC);

-- Backfill the data that still has a publication row. Snapshot fields are copied now so later
-- publication/post/destination deletion cannot erase the analytics history. Retryable outcomes
-- are retained as attempts but do not become a publication outcome. `unknown` is current only if
-- this is still the job's latest attempt and the state remains unknown.
INSERT OR IGNORE INTO analytics_snapshots (
  snapshot_id, snapshot_key, observation_kind, publication_id, job_id, attempt, observed_at, outcome,
  post_id, post_revision, title, destination_id, destination_title, media_kinds, attempt_count, retry_count
)
SELECT 'backfill:' || a.job_id || ':' || a.attempt,
       'attempt:' || a.job_id || ':' || a.attempt,
       'backfill',
       COALESCE(p.id, substr(j.dedupe_key, 9)), a.job_id, a.attempt, a.finished_at,
       CASE a.outcome
         WHEN 'sent' THEN 'sent'
         WHEN 'rejected' THEN 'failed'
         WHEN 'skipped' THEN 'failed'
         WHEN 'unknown' THEN 'unknown'
         WHEN 'lease_expired' THEN CASE WHEN j.status = 'unknown' AND j.attempts = a.attempt THEN 'unknown' ELSE NULL END
         ELSE NULL
       END,
       COALESCE(p.post_id, json_extract(created.details, '$.postId')),
       COALESCE(p.post_revision, json_extract(created.details, '$.postRevision')),
       substr(COALESCE(r.title, ''), 1, 200),
       COALESCE(p.destination_id, json_extract(created.details, '$.destinationId')),
       substr(d.title, 1, 200),
       CASE WHEN r.post_id IS NULL THEN NULL ELSE
         COALESCE((SELECT json_group_array(m.kind) FROM json_each(r.media_json) media
                   JOIN media_assets m ON m.id = media.value), '[]') END,
       a.attempt, a.attempt - 1
FROM job_attempts a
JOIN jobs j ON j.id = a.job_id
LEFT JOIN publications p ON p.id = COALESCE(j.publication_id, substr(j.dedupe_key, 9))
LEFT JOIN audit_log created ON created.entity_id = COALESCE(p.id, substr(j.dedupe_key, 9))
  AND created.action = 'publication.create'
LEFT JOIN post_revisions r ON r.post_id = COALESCE(p.post_id, json_extract(created.details, '$.postId'))
  AND r.revision = COALESCE(p.post_revision, json_extract(created.details, '$.postRevision'))
LEFT JOIN destinations d ON d.id = COALESCE(p.destination_id, json_extract(created.details, '$.destinationId'))
WHERE j.kind = 'publish'
  AND length(COALESCE(p.id, substr(j.dedupe_key, 9))) = 36
  AND length(COALESCE(p.post_id, json_extract(created.details, '$.postId'))) = 36
  AND length(COALESCE(p.destination_id, json_extract(created.details, '$.destinationId'))) = 36;

-- Retained owner resolution audit rows reconstruct the later point-in-time observation for
-- publications that were already manually reconciled before this read model existed.
INSERT OR IGNORE INTO analytics_snapshots (
  snapshot_id, snapshot_key, observation_kind, publication_id, job_id, attempt, observed_at, outcome,
  post_id, post_revision, title, destination_id, destination_title, media_kinds, attempt_count, retry_count
)
SELECT 'backfill:resolution:' || a.job_id || ':' || a.attempt || ':' || audit.created_at,
       'resolution:' || a.job_id || ':' || a.attempt || ':' || audit.created_at,
       'backfill', p.id, a.job_id, a.attempt, audit.created_at,
       CASE json_extract(audit.details, '$.outcome') WHEN 'sent' THEN 'sent' ELSE NULL END,
       COALESCE(p.post_id, json_extract(created.details, '$.postId')),
       COALESCE(p.post_revision, json_extract(created.details, '$.postRevision')),
       substr(COALESCE(r.title, ''), 1, 200),
       COALESCE(p.destination_id, json_extract(created.details, '$.destinationId')),
       substr(d.title, 1, 200),
       CASE WHEN r.post_id IS NULL THEN NULL ELSE
         COALESCE((SELECT json_group_array(m.kind) FROM json_each(r.media_json) media
                   JOIN media_assets m ON m.id = media.value), '[]') END,
       a.attempt, a.attempt - 1
FROM audit_log audit
JOIN jobs j ON j.kind = 'publish' AND
  (j.publication_id = audit.entity_id OR (j.publication_id IS NULL AND j.dedupe_key = 'publish:' || audit.entity_id))
JOIN job_attempts a ON a.job_id = j.id AND a.outcome = 'unknown'
LEFT JOIN publications p ON p.id = audit.entity_id
JOIN audit_log created ON created.entity_id = audit.entity_id AND created.action = 'publication.create'
LEFT JOIN post_revisions r ON r.post_id = COALESCE(p.post_id, json_extract(created.details, '$.postId'))
  AND r.revision = COALESCE(p.post_revision, json_extract(created.details, '$.postRevision'))
LEFT JOIN destinations d ON d.id = COALESCE(p.destination_id, json_extract(created.details, '$.destinationId'))
WHERE audit.action = 'publication.resolve_unknown'
  AND a.finished_at <= audit.created_at
  AND NOT EXISTS (SELECT 1 FROM job_attempts later
                  WHERE later.job_id = a.job_id AND later.attempt > a.attempt
                    AND later.finished_at <= audit.created_at);

-- Triggers keep the read model atomic without consuming another D1 statement from each send or
-- reconciliation batch. They run only for future writes; the retained history above is backfilled.
CREATE TRIGGER analytics_snapshot_after_job_attempt
AFTER INSERT ON job_attempts
BEGIN
  INSERT OR IGNORE INTO analytics_snapshots (
    snapshot_id, snapshot_key, observation_kind, publication_id, job_id, attempt, observed_at, outcome,
    post_id, post_revision, title, destination_id, destination_title, media_kinds, attempt_count, retry_count
  )
  SELECT 'attempt:' || j.id || ':' || NEW.attempt,
         'attempt:' || j.id || ':' || NEW.attempt,
         'attempt', p.id, j.id, NEW.attempt, NEW.finished_at,
         CASE NEW.outcome
           WHEN 'sent' THEN 'sent'
           WHEN 'rejected' THEN 'failed'
           WHEN 'skipped' THEN 'failed'
           WHEN 'unknown' THEN 'unknown'
           WHEN 'lease_expired' THEN CASE WHEN j.send_started_at IS NOT NULL THEN 'unknown' ELSE NULL END
           ELSE NULL
         END,
         p.post_id, p.post_revision, substr(r.title, 1, 200), p.destination_id, substr(d.title, 1, 200),
         COALESCE((SELECT json_group_array(m.kind) FROM json_each(r.media_json) media
                   JOIN media_assets m ON m.id = media.value), '[]'),
         NEW.attempt, NEW.attempt - 1
  FROM jobs j
  JOIN publications p ON p.id = j.publication_id
  JOIN post_revisions r ON r.post_id = p.post_id AND r.revision = p.post_revision
  LEFT JOIN destinations d ON d.id = p.destination_id
  WHERE j.id = NEW.job_id AND j.kind = 'publish';
END;

CREATE TRIGGER analytics_snapshot_after_unknown_resolution
AFTER INSERT ON audit_log
WHEN NEW.action = 'publication.resolve_unknown' AND NEW.entity_type = 'publication'
BEGIN
  INSERT OR IGNORE INTO analytics_snapshots (
    snapshot_id, snapshot_key, observation_kind, publication_id, job_id, attempt, observed_at, outcome,
    post_id, post_revision, title, destination_id, destination_title, media_kinds, attempt_count, retry_count
  )
  SELECT 'resolution:' || j.id || ':' || j.attempts || ':' || NEW.id,
         'resolution:' || j.id || ':' || j.attempts || ':' || NEW.id,
         'resolution', p.id, j.id, j.attempts, NEW.created_at,
         CASE json_extract(NEW.details, '$.outcome') WHEN 'sent' THEN 'sent' ELSE NULL END,
         p.post_id, p.post_revision, substr(r.title, 1, 200), p.destination_id, substr(d.title, 1, 200),
         COALESCE((SELECT json_group_array(m.kind) FROM json_each(r.media_json) media
                   JOIN media_assets m ON m.id = media.value), '[]'),
         j.attempts, j.attempts - 1
  FROM publications p
  JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish'
  JOIN post_revisions r ON r.post_id = p.post_id AND r.revision = p.post_revision
  LEFT JOIN destinations d ON d.id = p.destination_id
  WHERE p.id = NEW.entity_id;
END;
