-- /redactor is a chat (owner, 16.10.2026): the open request keeps the last few turns, so the next message is
-- answered in context. JSON array of {role, text}, bounded in code. Expand-only: one new column.
ALTER TABLE ai_writer_requests ADD COLUMN history TEXT NOT NULL DEFAULT '[]';
