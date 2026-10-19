-- Linking a published video to the approved AI script it was filmed from (owner, 19.10.2026: the analytics must
-- see each video's hook, and a link set by hand in the studio is rarely set). A confident match is linked by
-- the Worker and reported with an undo button; any other match is asked in the bot once. One row per video,
-- the same title on YouTube and TikTok being one video. Expand only: one new table.
CREATE TABLE IF NOT EXISTS ai_script_prompts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  -- The normalized title: one prompt per video whatever the platforms and the Cron overlap.
  group_key TEXT NOT NULL UNIQUE CHECK (length(group_key) BETWEEN 1 AND 300),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  item_ids TEXT NOT NULL CHECK (json_valid(item_ids) AND length(item_ids) <= 2000),
  -- Approved script revision ids, best first; `shown` is the one on screen.
  candidates TEXT NOT NULL CHECK (json_valid(candidates) AND length(candidates) <= 2000),
  shown INTEGER NOT NULL DEFAULT 0 CHECK (shown >= 0),
  -- auto: linked by the Worker; asked: waiting for the owner; linked / none: answered; undone: an auto link removed.
  status TEXT NOT NULL CHECK (status IN ('auto', 'asked', 'linked', 'none', 'undone')),
  revision_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
