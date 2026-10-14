CREATE TABLE automations (
  id TEXT PRIMARY KEY CHECK (id IN ('dota-intelligence', 'dota-hero-statistics')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
);

INSERT INTO automations (id, enabled, revision, created_at, updated_at)
VALUES
  ('dota-intelligence', 1, 0, 0, 0),
  ('dota-hero-statistics', 1, 0, 0, 0);

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  automation_id TEXT NOT NULL REFERENCES automations(id),
  origin TEXT NOT NULL CHECK (origin IN ('scheduled', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'unknown', 'skipped')),
  requested_at INTEGER NOT NULL CHECK (requested_at >= 0),
  scheduled_at INTEGER CHECK (scheduled_at IS NULL OR scheduled_at >= 0),
  started_at INTEGER CHECK (started_at IS NULL OR started_at >= requested_at),
  completed_at INTEGER CHECK (completed_at IS NULL OR completed_at >= requested_at),
  lease_until INTEGER CHECK (lease_until IS NULL OR lease_until >= 0),
  output_count INTEGER CHECK (output_count IS NULL OR output_count >= 0),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 80),
  CHECK ((origin = 'scheduled' AND scheduled_at IS NOT NULL) OR (origin = 'manual' AND scheduled_at IS NULL)),
  CHECK ((status = 'running') = (lease_until IS NOT NULL))
);

CREATE UNIQUE INDEX automation_runs_schedule_slot_idx
  ON automation_runs(automation_id, scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE UNIQUE INDEX automation_runs_one_active_idx
  ON automation_runs(automation_id) WHERE status IN ('queued', 'running');
CREATE INDEX automation_runs_history_idx
  ON automation_runs(automation_id, requested_at DESC, id DESC);
CREATE INDEX automation_runs_expired_lease_idx
  ON automation_runs(lease_until, id) WHERE status = 'running';

CREATE UNIQUE INDEX automation_audit_revision_idx
  ON audit_log(entity_id, json_extract(details, '$.revision'))
  WHERE entity_type = 'automation' AND action IN ('automation.pause', 'automation.resume');
