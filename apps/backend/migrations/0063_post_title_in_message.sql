-- Owner, 16.10.2026: the studio has no title field. A post created without a title sends only its body; its
-- `title` is just the studio name, taken from the start of the body. The flag is per post and fixed at creation,
-- so a publication of an older revision reads it from `posts` (revisions need no copy). Expand-only: every
-- existing post keeps its title in the message (DEFAULT 1).
ALTER TABLE posts ADD COLUMN title_in_message INTEGER NOT NULL DEFAULT 1 CHECK (title_in_message IN (0, 1));
