-- Bounded hourly retention scans, ordered by their age cutoff.
CREATE INDEX job_attempts_finished_idx ON job_attempts (finished_at, job_id, attempt);
CREATE INDEX audit_log_created_idx ON audit_log (created_at, id);
