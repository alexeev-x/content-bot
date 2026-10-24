-- What a claimed queue job was (review 24.10.2026: a publishing job whose Worker died was never reported, since only
-- writer jobs with a chat were). `kind` is the AiJob kind, `post_id` the post a publishing job carries, so the lost-job
-- report can say «Пост не ушёл в канал» and link the post instead of «Черновик не дописался».
-- Expand-only: two nullable columns; old rows stay as they are.
ALTER TABLE ai_queue_jobs ADD COLUMN kind TEXT CHECK (kind IS NULL OR length(kind) BETWEEN 1 AND 40);
ALTER TABLE ai_queue_jobs ADD COLUMN post_id TEXT CHECK (post_id IS NULL OR length(post_id) = 36);
