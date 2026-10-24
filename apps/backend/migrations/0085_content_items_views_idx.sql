-- Daily report v2 (owner, 20.10.2026): the channel's strongest videos per platform are the reports' references.
-- Expand-only: one index, so the top-by-views read is a search, not a scan of every collected item.
CREATE INDEX IF NOT EXISTS content_items_platform_views_idx ON content_items (platform, views DESC);
