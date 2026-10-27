-- The joke bank of quiet builds (owner, 27.10.2026: «основной редактор… учился шуткам»): every joke the critic let
-- through is kept, and the writer reads a few of the newest as examples. Expand-only: a new table.
CREATE TABLE quiet_build_jokes (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  build TEXT NOT NULL UNIQUE CHECK (length(build) BETWEEN 1 AND 9),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
  created_at INTEGER NOT NULL
);
CREATE INDEX quiet_build_jokes_created ON quiet_build_jokes (created_at DESC);
