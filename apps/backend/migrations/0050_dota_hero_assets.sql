-- Official hero media mirrored from Valve's CDN into R2 for AI posts and auto content (docs/API_CONTRACTS.md
-- § Dota hero assets). Expand-only: one new table. One row per hero and file kind; a Cron step claims due rows
-- and copies the file to R2 under `dota/heroes/<slug>/<kind>.<ext>`.
CREATE TABLE IF NOT EXISTS dota_hero_assets (
  hero_slug TEXT NOT NULL CHECK (length(hero_slug) BETWEEN 1 AND 40),
  kind TEXT NOT NULL CHECK (kind IN ('render_webm', 'render_mov', 'render_png', 'portrait', 'icon', 'crop')),
  hero_id INTEGER NOT NULL,
  hero_name TEXT NOT NULL,
  -- pending: not copied yet; stored: in R2; missing: Valve has no such file (checked again weekly);
  -- failed: the last attempt failed, retried with a back-off.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'stored', 'missing', 'failed')),
  size INTEGER,
  content_type TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  -- The earliest time the row may be claimed; a claim moves it forward by the lease, so overlapping ticks
  -- never copy the same file at once.
  next_attempt_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (hero_slug, kind)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS dota_hero_assets_due_idx
  ON dota_hero_assets (next_attempt_at)
  WHERE status IN ('pending', 'failed', 'missing');
