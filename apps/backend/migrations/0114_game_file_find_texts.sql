-- «Утечка недели» (owner, 26.10.2026) reads the week's finds in the game's files: for each, the cheap check's reason and
-- the post the writer made of it. Both were never kept (the reason went only into the owner's message, the post
-- carried no link to its build). Expand-only: two nullable columns, no backfill (older finds simply have no text).
ALTER TABLE game_file_builds ADD COLUMN check_note TEXT CHECK (check_note IS NULL OR length(check_note) BETWEEN 1 AND 200);
ALTER TABLE game_file_builds ADD COLUMN post_id TEXT CHECK (post_id IS NULL OR length(post_id) = 36);
