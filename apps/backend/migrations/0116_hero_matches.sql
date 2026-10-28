-- Hero matches (owner, 28.10.2026: «по любому герою мог», «нестандартные сборки»): high-rank public matches OpenDota
-- lists, read again from STRATZ once it knows their positions, one row per player, kept 14 days. «Гайд на героя» counts
-- its win rate, builds and position matchups from them, the way Dota2ProTracker does from STRATZ's matches.

-- Where the listing stands: the newest match id taken, when OpenDota was last read and when old rows were last purged.
CREATE TABLE hero_match_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_match_id INTEGER NOT NULL DEFAULT 0,
  listed_at INTEGER NOT NULL DEFAULT 0,
  purged_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO hero_match_state (id) VALUES (1);

-- Matches waiting for STRATZ: read from `next_at` (STRATZ fills positions hours after a match), three tries at most.
CREATE TABLE hero_match_queue (
  match_id INTEGER PRIMARY KEY,
  started_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3)
);
CREATE INDEX hero_match_queue_next ON hero_match_queue (next_at);

-- One player of a read match. `allies`/`enemies`: «heroId:position» of the four teammates and five opponents; `detail`:
-- the player's items, purchases with minutes and skill order as compact JSON. Keyed for «this hero at this position
-- since then», so a guide reads only its own rows.
CREATE TABLE hero_match_players (
  hero_id INTEGER NOT NULL CHECK (hero_id BETWEEN 1 AND 999),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  started_at INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  won INTEGER NOT NULL CHECK (won IN (0, 1)),
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  allies TEXT NOT NULL,
  enemies TEXT NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY (hero_id, position, started_at, match_id)
) WITHOUT ROWID;
