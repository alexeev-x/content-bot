-- Widen the settings document key set without dropping existing owner appearance data.
CREATE TABLE settings_new (
  key TEXT PRIMARY KEY CHECK (key IN ('appearance', 'operations')),
  value TEXT NOT NULL CHECK (json_valid(value) AND length(value) <= 8192),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 20)
);

INSERT INTO settings_new (key, value, revision, updated_at, updated_by)
SELECT key, value, revision, updated_at, updated_by FROM settings;

DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
