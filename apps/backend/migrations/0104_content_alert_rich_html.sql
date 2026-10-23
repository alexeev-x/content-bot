-- Owner, 23.10.2026: the daily and weekly analytics reports go out as Telegram rich messages (real tables, the AI review
-- folded). Expand-only: an alert keeps its classic `html` (capped at what one message holds), and a report alert also
-- gets `rich_html`, sent first; a rich message Telegram refuses (a definite 400, nothing sent) falls back to `html`.
ALTER TABLE content_alerts ADD COLUMN rich_html TEXT
  CHECK (rich_html IS NULL OR length(rich_html) BETWEEN 1 AND 32768);
