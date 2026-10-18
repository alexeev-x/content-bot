-- Owner, 18.10.2026: a post is either text (with optional media) or a native Telegram poll, and carries its own send
-- options (silent, protected, link preview). Expand-only: every existing post stays a text post with Telegram's
-- defaults.
--
-- The kind is fixed at creation. Poll and options are edited only in a draft, like the text, and are snapshotted into
-- every revision, so a publication sends exactly what was approved. poll_json is checked by the contract schema on
-- every write; here only its shape and size are bounded (12 options x 100 chars + 300 + 200, escaped, fits 8192).
ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'poll'));
ALTER TABLE posts ADD COLUMN poll_json TEXT
  CHECK (poll_json IS NULL OR (json_valid(poll_json) AND json_type(poll_json) = 'object' AND length(poll_json) <= 8192));
ALTER TABLE posts ADD COLUMN send_silent INTEGER NOT NULL DEFAULT 0 CHECK (send_silent IN (0, 1));
ALTER TABLE posts ADD COLUMN send_protected INTEGER NOT NULL DEFAULT 0 CHECK (send_protected IN (0, 1));
ALTER TABLE posts ADD COLUMN link_preview_disabled INTEGER NOT NULL DEFAULT 1 CHECK (link_preview_disabled IN (0, 1));

ALTER TABLE post_revisions ADD COLUMN kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'poll'));
ALTER TABLE post_revisions ADD COLUMN poll_json TEXT
  CHECK (poll_json IS NULL OR (json_valid(poll_json) AND json_type(poll_json) = 'object' AND length(poll_json) <= 8192));
ALTER TABLE post_revisions ADD COLUMN send_silent INTEGER NOT NULL DEFAULT 0 CHECK (send_silent IN (0, 1));
ALTER TABLE post_revisions ADD COLUMN send_protected INTEGER NOT NULL DEFAULT 0 CHECK (send_protected IN (0, 1));
ALTER TABLE post_revisions
  ADD COLUMN link_preview_disabled INTEGER NOT NULL DEFAULT 1 CHECK (link_preview_disabled IN (0, 1));

-- No trigger copies the post's values into a new revision row: D1 counts trigger writes in meta.changes, which would
-- break the "exactly one row changed" checks of the guarded post writes. Every statement that inserts a revision lists
-- the five columns itself (the repositories in modules/content and modules/lifecycle).
