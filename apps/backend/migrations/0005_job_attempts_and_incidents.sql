-- Stage 4a: the Cron dispatcher (docs/BACKEND_ARCHITECTURE.md §5, §6, §10).
-- Expand only: two new tables and two indexes on sessions for the hourly cleanup.
-- Times are UTC epoch milliseconds; ids are UUID text.

-- One row per finished attempt of a job: the audit of what Telegram answered. It is written in the
-- same batch as the job's new state, so an attempt without a row (a Worker that died mid-send) is
-- turned into one by reconcile. The primary key makes a replayed write a visible error, not a copy.
CREATE TABLE job_attempts (
  job_id TEXT NOT NULL REFERENCES jobs (id),
  -- jobs.attempts at the time of the claim.
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  -- Claim time (reconciled attempts: the last write of the job, so only approximate).
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  -- sent / rate_limited / rejected / unknown are the transport's answers; skipped means nothing was
  -- sent (content or destination refused before the call); lease_expired means the Worker died
  -- before it marked the send.
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'rate_limited', 'rejected', 'unknown', 'skipped', 'lease_expired')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 64),
  -- Seconds, as Telegram reported it.
  retry_after INTEGER CHECK (retry_after IS NULL OR retry_after >= 0),
  external_message_id TEXT CHECK (external_message_id IS NULL OR length(external_message_id) BETWEEN 1 AND 64),
  PRIMARY KEY (job_id, attempt),
  CHECK (finished_at >= started_at)
);

-- Something a human has to look at: a failed job, or a send that may or may not have happened.
-- Written in the same batch as the job's state change, so nothing fails or turns unknown silently.
CREATE TABLE incidents (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 32),
  publication_id TEXT REFERENCES publications (id),
  job_id TEXT REFERENCES jobs (id),
  code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 64),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  -- Metadata only (attempt number, reason); never post text, chat text or secrets.
  details TEXT CHECK (details IS NULL OR (json_valid(details) AND length(details) <= 1024)),
  CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

-- The open incidents, newest first. Partial: resolved history never enters the index.
CREATE INDEX incidents_open_idx ON incidents (created_at DESC, id DESC) WHERE resolved_at IS NULL;

-- Hourly cleanup of dead sessions (bounded `ORDER BY ... LIMIT n` deletes): ended by expiry or by revocation.
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
CREATE INDEX sessions_revoked_idx ON sessions (revoked_at) WHERE revoked_at IS NOT NULL;
