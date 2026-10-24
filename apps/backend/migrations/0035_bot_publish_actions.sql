-- «Publish now» buttons under the bot's draft replies. callback_data holds 64 bytes at most, so the
-- button carries only this short token; the post, revision and channel it stands for live here.
-- pending -> claimed (one tap won; used_at is the send-now instant, fixed so a repeat hashes equally)
-- -> done (publication created through the normal create-publication use case). stale = refused.
-- Expand-only: a new table, no existing table changes. Rows leave with their post (ON DELETE CASCADE).
CREATE TABLE bot_publish_actions (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 8 AND 32),
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE CHECK (length(post_id) = 36),
  destination_id TEXT NOT NULL REFERENCES destinations (id) CHECK (length(destination_id) = 36),
  -- The draft revision the owner saw; approving it makes the next one.
  post_revision INTEGER NOT NULL CHECK (post_revision >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'done', 'stale')),
  publication_id TEXT REFERENCES publications (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  CHECK ((status = 'pending') = (used_at IS NULL)),
  -- One token per post revision and channel: a re-sent report reuses it instead of minting a second one.
  UNIQUE (post_id, post_revision, destination_id)
);

-- The posts index is the UNIQUE one above. The others serve the ON DELETE SET NULL of publication_id and
-- the housekeeping purge by age.
CREATE INDEX bot_publish_actions_publication_idx ON bot_publish_actions (publication_id);
CREATE INDEX bot_publish_actions_created_idx ON bot_publish_actions (created_at);

PRAGMA optimize;
