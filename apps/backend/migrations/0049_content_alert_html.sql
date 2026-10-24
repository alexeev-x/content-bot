-- Content alerts keep the Telegram HTML they are sent with and the per-publication buttons of the weekly
-- digest (owner's chosen styles, 15.10.2026). Expand-only: alerts raised before this migration have NULLs
-- and are still sent as escaped title + body with one button.
ALTER TABLE content_alerts ADD COLUMN html TEXT;
-- JSON array of { text, linkPath } (at most six); NULL means no extra buttons.
ALTER TABLE content_alerts ADD COLUMN buttons TEXT;
