-- «ИИ-редактор → Обо мне» (owner, 16.10.2026): the author's current state, edited in the studio and sent with
-- every AI request (docs/ai/architecture.md item 6: runtime memory lives in D1, docs/ai/pack/state.md is only
-- the seed). One row. Expand-only: one new table.
CREATE TABLE IF NOT EXISTS ai_author_profile (
  id TEXT PRIMARY KEY CHECK (id = 'owner'),
  -- The owner's fields (contracts aiAuthorFieldsSchema).
  document TEXT NOT NULL CHECK (json_valid(document)),
  -- The last OpenDota read (rank, wins, top heroes); NULL before the first.
  dota TEXT CHECK (dota IS NULL OR json_valid(dota)),
  dota_synced_at INTEGER,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL
);
