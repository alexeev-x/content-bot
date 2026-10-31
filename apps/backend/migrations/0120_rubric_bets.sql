-- «Кого понерфят?» bets (rubric scheduler stage 5, docs/scheduler/area-backend-core.md §6.2): the poll that bets on
-- the next patch, and its result once that patch is out. One open bet at a time: an overlapping tick cannot open a
-- second. Expand-only; times UTC ms.
CREATE TABLE rubric_bets (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  post_slot_id TEXT NOT NULL,
  -- The patch chain (base version) the bet was made on: the result waits for the next one.
  chain TEXT NOT NULL CHECK (length(chain) BETWEEN 1 AND 20),
  hero_ids_json TEXT NOT NULL CHECK (json_valid(hero_ids_json) AND json_type(hero_ids_json) = 'array'),
  poll_id TEXT CHECK (poll_id IS NULL OR length(poll_id) BETWEEN 1 AND 64),
  form TEXT NOT NULL CHECK (form IN ('picture', 'text')),
  opened_at INTEGER NOT NULL,
  resolved_at INTEGER,
  result_slot_id TEXT,
  -- The poll's final shares (stopPoll), quoted in the result.
  votes_json TEXT CHECK (votes_json IS NULL OR (json_valid(votes_json) AND length(votes_json) <= 2048))
);
CREATE UNIQUE INDEX rubric_bets_open_uq ON rubric_bets ((1)) WHERE resolved_at IS NULL;
CREATE INDEX rubric_bets_slot_idx ON rubric_bets (post_slot_id);
