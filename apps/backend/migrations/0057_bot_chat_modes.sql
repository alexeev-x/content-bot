-- The owner's chat modes (owner, 16.10.2026): /redactor (editor) or /post (every message becomes a draft).
-- Outside a mode a plain message no longer becomes a post. One row per chat holds the current mode.
-- Expand-only: one new column.
ALTER TABLE ai_writer_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'editor' CHECK (kind IN ('editor', 'post'));
