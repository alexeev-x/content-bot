-- A writer job whose Worker died after the claim (review 19.10.2026): its «Пишу…» message would wait forever.
-- Expand-only: the job keeps its chat message and when it finished; Cron tells the owner about a job claimed long
-- ago that never finished. The model is still called at most once per job.
ALTER TABLE ai_queue_jobs ADD COLUMN chat_id INTEGER;
ALTER TABLE ai_queue_jobs ADD COLUMN message_id INTEGER CHECK (message_id IS NULL OR message_id > 0);
-- Set when the job's run ended (its message shows the result or the failure), or when Cron reported it lost.
ALTER TABLE ai_queue_jobs ADD COLUMN finished_at INTEGER;
CREATE INDEX IF NOT EXISTS ai_queue_jobs_open_idx ON ai_queue_jobs (claimed_at)
  WHERE finished_at IS NULL AND chat_id IS NOT NULL;
