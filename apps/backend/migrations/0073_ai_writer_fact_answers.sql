-- Keep the owner's answer to a needs_facts question before the model call begins. A failed call can be retried
-- explicitly without asking the owner to repeat the experience. One row per question prevents duplicate claims.
CREATE TABLE IF NOT EXISTS ai_writer_fact_answers (
  question_generation_id TEXT PRIMARY KEY REFERENCES ai_generations (id),
  chat_id INTEGER NOT NULL,
  answer TEXT NOT NULL CHECK (length(answer) BETWEEN 1 AND 4096),
  status TEXT NOT NULL CHECK (status IN ('processing', 'failed', 'ready')),
  draft_generation_id TEXT REFERENCES ai_generations (id),
  claimed_at INTEGER NOT NULL CHECK (claimed_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);
