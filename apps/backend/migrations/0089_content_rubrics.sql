-- Telegram rubrics against results (plan B3; owner, 20.10.2026: «Оба способа»). A post's rubric is the owner's
-- pick in the studio editor, else a marker in the post: the rubric's hashtag, or its name opening the first line.
-- Expand only: new tables and a nullable column.

-- The owner's rubrics. The tag is stored without «#», in lower case, «ё» as «е»; null means «by name only». NOCASE
-- folds only ASCII, so a Cyrillic name is unique by name_key (lower case, «ё» as «е»), written by the app.
CREATE TABLE IF NOT EXISTS content_rubrics (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  -- Lower case may lengthen a letter («İ» → «i̇»), so the key gets room past the 40 typed.
  name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) BETWEEN 1 AND 160),
  tag TEXT UNIQUE CHECK (tag IS NULL OR length(tag) BETWEEN 2 AND 64),
  created_at INTEGER NOT NULL
);

-- The owner's pick for a studio post; it wins over any marker. Removing the rubric or the post removes the pick.
CREATE TABLE IF NOT EXISTS content_post_rubrics (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  rubric_id TEXT NOT NULL REFERENCES content_rubrics(id) ON DELETE CASCADE,
  set_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS content_post_rubrics_rubric_idx ON content_post_rubrics (rubric_id);

-- The hashtags of a Telegram post as collected (a JSON array of lower-case tags without «#», at most 10); the
-- stored title is only the first line. Null for other platforms and for posts collected before this migration.
ALTER TABLE content_items ADD COLUMN tags TEXT
  CHECK (tags IS NULL OR (json_valid(tags) AND json_type(tags) = 'array' AND json_array_length(tags) <= 10));
