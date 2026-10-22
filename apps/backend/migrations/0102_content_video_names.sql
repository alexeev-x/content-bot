-- Short names of the owner's videos for the daily report (owner, 22.10.2026: «Оракл», «БКБ» instead of a cut title
-- «Как я на…»). One name per video, shared by its YouTube and TikTok copies: the key is the title normalized the way
-- the weekly report pairs them (lower case, «ё» as «е», hashtags and punctuation dropped). The AI review names a video
-- once; a name the owner gives replaces it and is never overwritten by the AI.
-- Expand-only: one new table.
CREATE TABLE content_video_names (
  title_key TEXT PRIMARY KEY CHECK (length(title_key) BETWEEN 1 AND 500),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 20),
  source TEXT NOT NULL CHECK (source IN ('ai', 'owner')),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);
