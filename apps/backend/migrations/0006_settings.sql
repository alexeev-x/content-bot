-- Owner settings (docs/BACKEND_ARCHITECTURE.md §6): one JSON document per key, shared by the
-- browser and the Mini App. Today only 'appearance'; a new key needs a migration that widens the CHECK.
-- No row means "never saved": the API answers defaults with revision 0, so stored revisions start at 1.

CREATE TABLE settings (
  key TEXT PRIMARY KEY CHECK (key IN ('appearance')),
  -- Validated by the application with the contract schema on every read; the database only
  -- guarantees it is JSON and bounded (10 custom presets fit in about 3 KB).
  value TEXT NOT NULL CHECK (json_valid(value) AND length(value) <= 8192),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 20)
);
