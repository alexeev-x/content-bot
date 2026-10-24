-- Changes in the game's files (owner, 24.10.2026: required before the release): every build of the SteamTracking
-- GameTracking-Dota2 repository is seen once. A build whose changed files touch heroes, abilities, items or the
-- English strings is condensed and offered to the AI; the rest, and every build found before the source started (the
-- baseline), are kept as skipped so they are never read again. `queued` is the one claim of a build's post job.
-- Expand-only: one new table.
CREATE TABLE game_file_builds (
  sha TEXT PRIMARY KEY CHECK (length(sha) = 40),
  build TEXT NOT NULL CHECK (length(build) BETWEEN 1 AND 40),
  committed_at INTEGER NOT NULL CHECK (committed_at >= 0),
  detected_at INTEGER NOT NULL CHECK (detected_at >= 0),
  status TEXT NOT NULL CHECK (status IN ('skipped', 'queued', 'failed')),
  reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 40)
);
