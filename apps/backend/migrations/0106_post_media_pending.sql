-- posts.media_pending_until: while the bot attaches a source post's pictures (the patch cover is drawn after approval,
-- up to a few minutes), the studio shows it and nothing can be published (owner, 23.10.2026). Set when the picture
-- job is queued, cleared when it ends; the time bound frees a post whose job died. Expand-only: null on every row.
ALTER TABLE posts ADD COLUMN media_pending_until INTEGER CHECK (media_pending_until IS NULL OR media_pending_until >= 0);
