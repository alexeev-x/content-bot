CREATE TABLE dota_source_state (
  source_key TEXT PRIMARY KEY CHECK (source_key IN ('steam_news', 'patch_notes')),
  baseline_seeded INTEGER NOT NULL DEFAULT 0 CHECK (baseline_seeded IN (0, 1))
);

CREATE TABLE dota_update_items (
  source_key TEXT NOT NULL CHECK (source_key IN ('steam_news', 'patch_notes')),
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 100),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2048),
  published_at INTEGER NOT NULL CHECK (published_at >= 0),
  detected_at INTEGER NOT NULL CHECK (detected_at >= 0),
  is_baseline INTEGER NOT NULL CHECK (is_baseline IN (0, 1)),
  PRIMARY KEY (source_key, external_id)
);
