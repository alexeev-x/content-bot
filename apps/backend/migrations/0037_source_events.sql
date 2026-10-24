-- «Источники»: the night-watchman read model over dota_update_items. Expand-only: three nullable or
-- defaulted columns, no existing column changes.
-- excerpt: the cleaned start of a Steam announcement (Steam returns at most 500 characters), the only
--   text a news/treasure draft summary is built from. NULL for patch notes and for rows seen before this.
-- event_type: patch | treasure | news, fixed at detection (see source-events.ts for the heuristic).
-- hidden_at: the owner dismissed the event; hidden events get no auto-draft and no notice.
ALTER TABLE dota_update_items ADD COLUMN excerpt TEXT CHECK (excerpt IS NULL OR length(excerpt) <= 600);
ALTER TABLE dota_update_items ADD COLUMN event_type TEXT NOT NULL DEFAULT 'news'
  CHECK (event_type IN ('patch', 'treasure', 'news'));
ALTER TABLE dota_update_items ADD COLUMN hidden_at INTEGER CHECK (hidden_at IS NULL OR hidden_at >= 0);

-- Backfill from what the old rows have (title only): patch notes are patches; a Steam title that
-- names treasure is a treasure. Later detections are classified in code with the body as well.
UPDATE dota_update_items SET event_type = 'patch' WHERE source_key = 'patch_notes';
UPDATE dota_update_items SET event_type = 'treasure'
  WHERE source_key = 'steam_news'
    AND (lower(title) LIKE '%treasure%' OR lower(title) LIKE '%collector%cache%' OR title LIKE '%окровищ%');

-- The screen lists real events (is_baseline = 0) newest first, optionally by type.
CREATE INDEX dota_update_events_idx
  ON dota_update_items (published_at DESC, source_key ASC, external_id ASC) WHERE is_baseline = 0;
