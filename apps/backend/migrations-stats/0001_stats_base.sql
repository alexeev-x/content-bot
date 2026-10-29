-- Hero statistics base v2 (owner, 29.10.2026: «на уровне про трекера, как швейцарские часы»): its own database
-- (`STATS_DB`), so long scans never block publishing. Strong players are followed (regional leaderboards first),
-- their parsed ranked matches are read from STRATZ, one row per player is kept 8 weeks, and every night per-patch
-- snapshots are counted from those rows. Plan: `.logs/handoff/hero-matches-plan.md`.

-- Turns and watermarks: when the leaderboards were last read, when old rows were last purged, the last snapshot night.
CREATE TABLE stats_state (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- Spend counters ('stratz:h:<hour>', 'stratz:d:<day>', 'read:d:<day>'): a request is made only after its counter grows
-- under the cap in one conditional statement, so overlapping runs never pass a budget together.
CREATE TABLE stats_budget (
  key TEXT PRIMARY KEY,
  used INTEGER NOT NULL CHECK (used >= 0)
) WITHOUT ROWID;

-- Accounts followed: the regional season leaderboards (≈ 7000+ MMR, the audience Dota2ProTracker counts).
-- `leaderboard_rank`: the place on its region's leaderboard; `listed_at`: when a leaderboard read last showed it
-- (an account off the boards for a week is no longer followed).
CREATE TABLE stats_accounts (
  account_id INTEGER PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('leaderboard', 'guide', 'snowball')),
  leaderboard_rank INTEGER,
  added_at INTEGER NOT NULL,
  listed_at INTEGER NOT NULL,
  next_scan_at INTEGER NOT NULL,
  scanned_at INTEGER,
  last_match_at INTEGER,
  found INTEGER NOT NULL DEFAULT 0 CHECK (found >= 0),
  errors INTEGER NOT NULL DEFAULT 0 CHECK (errors >= 0)
);
CREATE INDEX stats_accounts_due ON stats_accounts (next_scan_at);

-- Parsed matches found and not yet read. `top`: followed leaderboard players seen in it (read those first).
-- `dropped`: a match that failed the checks or ran out of tries stays as a marker until its 72-hour listing window has
-- passed (`next_at` = start + 4 days), so a relisting does not queue it again.
CREATE TABLE stats_queue (
  match_id INTEGER PRIMARY KEY,
  started_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  top INTEGER NOT NULL DEFAULT 0 CHECK (top >= 0),
  dropped INTEGER NOT NULL DEFAULT 0 CHECK (dropped IN (0, 1))
);
CREATE INDEX stats_queue_due ON stats_queue (next_at);

-- One kept match. `bracket`: STRATZ's rank bracket (7 Divine, 8 Immortal); `top_players`: players on a regional
-- leaderboard; `lanes`: STRATZ's lane outcomes; `draft`: picks and bans in order, compact JSON.
CREATE TABLE stats_matches (
  match_id INTEGER PRIMARY KEY,
  started_at INTEGER NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  patch INTEGER NOT NULL,
  radiant_won INTEGER NOT NULL CHECK (radiant_won IN (0, 1)),
  bracket INTEGER NOT NULL,
  rank INTEGER,
  region INTEGER,
  top_players INTEGER NOT NULL DEFAULT 0 CHECK (top_players BETWEEN 0 AND 10),
  lanes TEXT,
  draft TEXT,
  stored_at INTEGER NOT NULL
);
CREATE INDEX stats_matches_started ON stats_matches (started_at);

-- One player of a kept match, keyed for «this hero at this position since then». `tracked`: a followed account, whose
-- own rows the win rates skip (followed players win more than their lobby: +2.4 pp in the 29.10 probe).
-- `lane`: the player's lane outcome (1 won, 0 even, -1 lost). `detail`: items, purchases with minutes, skill order,
-- talents and the neutral as compact JSON.
CREATE TABLE stats_players (
  hero_id INTEGER NOT NULL CHECK (hero_id BETWEEN 1 AND 999),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  started_at INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  patch INTEGER NOT NULL,
  account_id INTEGER,
  tracked INTEGER NOT NULL CHECK (tracked IN (0, 1)),
  won INTEGER NOT NULL CHECK (won IN (0, 1)),
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  bracket INTEGER NOT NULL,
  top_players INTEGER NOT NULL DEFAULT 0,
  lane INTEGER CHECK (lane IN (-1, 0, 1)),
  kills INTEGER,
  deaths INTEGER,
  assists INTEGER,
  gpm INTEGER,
  xpm INTEGER,
  damage INTEGER,
  nw10 INTEGER,
  nw20 INTEGER,
  allies TEXT NOT NULL,
  enemies TEXT NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY (hero_id, position, started_at, match_id)
) WITHOUT ROWID;

-- Every hero ever kept: the nightly snapshot and the purge list heroes from here, never by scanning player rows.
CREATE TABLE stats_heroes (
  hero_id INTEGER PRIMARY KEY
);

-- Matches and wins per day for trends, counted every night (`day`: UTC days since the epoch).
CREATE TABLE stats_days (
  day INTEGER NOT NULL,
  hero_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('all', 'immortal', 'top')),
  matches INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  PRIMARY KEY (day, hero_id, position, band)
) WITHOUT ROWID;

-- The nightly snapshot of a hero at a position: win rate, builds, timings, skills and matchups as JSON, replaced in
-- place. `span`: the last 8 days, 14 days or the whole patch within the kept rows.
CREATE TABLE stats_snapshots (
  patch INTEGER NOT NULL,
  hero_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('all', 'immortal', 'top')),
  span TEXT NOT NULL CHECK (span IN ('d8', 'd14', 'patch')),
  computed_at INTEGER NOT NULL,
  matches INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (patch, hero_id, position, band, span)
) WITHOUT ROWID;

-- The collector's own day: what was listed, read, kept and dropped, STRATZ calls and the last error, for the owner's
-- daily report and the alerts.
CREATE TABLE stats_health (
  day INTEGER PRIMARY KEY,
  listed INTEGER NOT NULL DEFAULT 0,
  read INTEGER NOT NULL DEFAULT 0,
  kept INTEGER NOT NULL DEFAULT 0,
  dropped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  last_kept_at INTEGER,
  last_error TEXT
);
