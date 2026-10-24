-- Persist alert aggregation separately from the incident API history. A group is one
-- incident class + affected publication (or job when no publication exists).
ALTER TABLE incidents ADD COLUMN alert_group_key TEXT CHECK (
  alert_group_key IS NULL OR length(alert_group_key) BETWEEN 1 AND 100
);

CREATE TABLE incident_alert_groups (
  group_key TEXT PRIMARY KEY CHECK (length(group_key) BETWEEN 1 AND 100),
  kind TEXT NOT NULL CHECK (kind IN ('publish_failed', 'publish_unknown')),
  affected_id TEXT NOT NULL CHECK (length(affected_id) = 36),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= first_seen_at),
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count >= 1),
  last_alert_claimed_at INTEGER,
  alert_succeeded_at INTEGER,
  recovery_claimed_at INTEGER,
  CHECK (last_alert_claimed_at IS NULL OR last_alert_claimed_at >= first_seen_at),
  CHECK (alert_succeeded_at IS NULL OR last_alert_claimed_at IS NOT NULL),
  CHECK (recovery_claimed_at IS NULL OR recovery_claimed_at >= first_seen_at)
);

CREATE INDEX incident_alert_groups_due_idx
  ON incident_alert_groups (last_alert_claimed_at, last_seen_at, group_key);
CREATE INDEX incident_alert_groups_recovery_idx
  ON incident_alert_groups (recovery_claimed_at)
  WHERE recovery_claimed_at IS NOT NULL;

CREATE INDEX incidents_alert_group_open_idx
  ON incidents (alert_group_key, resolved_at)
  WHERE alert_group_key IS NOT NULL;

-- Keep the aggregate in the same D1 statement as the guarded incident insert; Cron's
-- dispatcher budget is pinned at 50 statements, so this must not be a second app query.
CREATE TRIGGER incidents_alert_group_after_insert
AFTER INSERT ON incidents
WHEN NEW.alert_group_key IS NOT NULL
BEGIN
  INSERT INTO incident_alert_groups
    (group_key, kind, affected_id, first_seen_at, last_seen_at, occurrence_count)
  VALUES (NEW.alert_group_key, NEW.kind, COALESCE(NEW.publication_id, NEW.job_id, NEW.id),
          NEW.created_at, NEW.created_at, 1)
  ON CONFLICT (group_key) DO UPDATE SET
    first_seen_at = CASE WHEN incident_alert_groups.recovery_claimed_at IS NULL
                         THEN incident_alert_groups.first_seen_at ELSE excluded.first_seen_at END,
    last_seen_at = CASE WHEN incident_alert_groups.recovery_claimed_at IS NULL
                        THEN max(incident_alert_groups.last_seen_at, excluded.last_seen_at)
                        ELSE excluded.last_seen_at END,
    occurrence_count = CASE WHEN incident_alert_groups.recovery_claimed_at IS NULL
                            THEN incident_alert_groups.occurrence_count + 1 ELSE 1 END,
    last_alert_claimed_at = CASE WHEN incident_alert_groups.recovery_claimed_at IS NULL
                                 THEN incident_alert_groups.last_alert_claimed_at ELSE NULL END,
    alert_succeeded_at = CASE WHEN incident_alert_groups.recovery_claimed_at IS NULL
                              THEN incident_alert_groups.alert_succeeded_at ELSE NULL END,
    recovery_claimed_at = NULL;
END;

-- Existing incidents are already owner-notified by migration 0009. Seed their aggregate
-- history without reopening any notification, and preserve the API's one-row-per-incident view.
UPDATE incidents
SET alert_group_key = kind || ':' || COALESCE(publication_id, job_id, id)
WHERE alert_group_key IS NULL;

INSERT INTO incident_alert_groups (
  group_key, kind, affected_id, first_seen_at, last_seen_at, occurrence_count,
  last_alert_claimed_at, alert_succeeded_at, recovery_claimed_at
)
SELECT alert_group_key, kind, COALESCE(publication_id, job_id, id), min(created_at), max(created_at), count(*),
       max(owner_notified_at), max(owner_notified_at),
       CASE WHEN count(*) = sum(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END)
            THEN max(resolved_at) ELSE NULL END
FROM incidents
WHERE alert_group_key IS NOT NULL
GROUP BY alert_group_key, kind, COALESCE(publication_id, job_id, id);

PRAGMA optimize;
