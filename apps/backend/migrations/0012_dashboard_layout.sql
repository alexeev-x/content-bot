-- The owner's Обзор widget layout (docs/BACKEND_ARCHITECTURE.md §6). Expand only: one new table.
-- A table of its own, not a new `settings` key: that table's CHECK lists the known keys and SQLite
-- cannot widen a CHECK without rebuilding the table and copying the data.
-- One owner, so one row (`id` is CHECKed to 1). No row means "never saved": the API answers an empty
-- layout at revision 0, so stored revisions start at 1.
CREATE TABLE dashboard_layout (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  -- JSON array of widgets, validated with the contract schema on every read; the database only
  -- guarantees it is JSON and bounded (40 widgets fit in about 4 KB).
  value TEXT NOT NULL CHECK (json_valid(value) AND length(value) <= 8192),
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision >= 1),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 20)
);
