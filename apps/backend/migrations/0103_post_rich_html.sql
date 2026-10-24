-- Owner, 23.10.2026: every post goes out in the approved rich format (Telegram rich messages, Bot API 10.1). Expand-only:
-- a post without rich_html is sent as before. With it, rich_html is what Telegram receives (sendRichMessage, HTML up to
-- 32768 characters, its media named tg://photo?id=pN by the post's media position) and body keeps the post's plain
-- text for the studio's lists, search and name (body stays capped at 4096, so the rich text needs its own column).
--
-- Like the poll columns (migration 0070), the value is snapshotted into every revision, so a publication sends exactly
-- what was approved, and every statement that inserts a revision lists the column itself (no trigger: D1 counts
-- trigger writes in meta.changes).
ALTER TABLE posts ADD COLUMN rich_html TEXT CHECK (rich_html IS NULL OR length(rich_html) BETWEEN 1 AND 32768);
ALTER TABLE post_revisions ADD COLUMN rich_html TEXT CHECK (rich_html IS NULL OR length(rich_html) BETWEEN 1 AND 32768);
