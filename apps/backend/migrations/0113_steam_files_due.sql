-- A new public build of Dota no longer posts by itself (owner, 24.10.2026: «мне нет смысла от сборки»); it makes the
-- game-files watch run every minute for an hour. `files_due_until` is the end of that hour; null when none is due.
-- `posted_at` stays unused (expand-only: the column is not dropped).
ALTER TABLE steam_app_watch ADD COLUMN files_due_until INTEGER CHECK (files_due_until IS NULL OR files_due_until >= 0);
