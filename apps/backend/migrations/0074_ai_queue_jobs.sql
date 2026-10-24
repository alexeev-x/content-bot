-- The bot's AI model calls go through Queue AI_JOBS (owner, 19.10.2026). A queue delivers at least once and a
-- model call is paid, so the consumer claims each job id here once; a redelivered message finds the row and
-- does nothing. Rows older than a week are deleted with each claim (a queue keeps a message 24 h at most).
CREATE TABLE IF NOT EXISTS ai_queue_jobs (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  claimed_at INTEGER NOT NULL CHECK (claimed_at >= 0)
);
CREATE INDEX IF NOT EXISTS ai_queue_jobs_claimed_idx ON ai_queue_jobs (claimed_at);
