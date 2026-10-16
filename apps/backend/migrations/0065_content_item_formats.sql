-- The owner's format mark for a video filmed without an AI script (docs/ai/IMPLEMENTATION_PLAN.md, stage 3): a
-- format is never guessed. A linked script's format wins over this mark.
CREATE TABLE IF NOT EXISTS content_item_formats (
  item_id TEXT PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('fidit', 'igrat', 'standalone')),
  set_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS content_item_formats_format_idx ON content_item_formats (format);
