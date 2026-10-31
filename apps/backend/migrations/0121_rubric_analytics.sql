-- Rubric analytics (rubric scheduler stage 7): each rubric post scored against the channel's usual post at 24 h, the
-- daily comment themes, the Monday report's «Рубрики» block. Expand-only: new tables, nothing shared is altered.

-- One row per scored rubric post (its first message), written once when it is 25.5 h old; the *72 columns fill later.
-- NaN is stored by SQLite as NULL, so every NOT NULL REAL column rejects a NaN that slipped past the code guards.
CREATE TABLE rubric_post_scores (
  chat_id TEXT NOT NULL CHECK (length(chat_id) BETWEEN 1 AND 64),
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  slot_id TEXT NOT NULL CHECK (length(slot_id) = 36),
  rubric_key TEXT NOT NULL CHECK (length(rubric_key) BETWEEN 1 AND 40),
  role TEXT NOT NULL CHECK (role IN ('main', 'followup')),
  sent_at INTEGER NOT NULL,
  scored_at INTEGER NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  views24 INTEGER NOT NULL CHECK (views24 > 0),
  likes24 INTEGER CHECK (likes24 IS NULL OR likes24 >= 0),
  comments24 INTEGER CHECK (comments24 IS NULL OR comments24 >= 0),
  voters24 INTEGER CHECK (voters24 IS NULL OR voters24 >= 0),
  views72 INTEGER CHECK (views72 IS NULL OR views72 >= 0),
  likes72 INTEGER CHECK (likes72 IS NULL OR likes72 >= 0),
  comments72 INTEGER CHECK (comments72 IS NULL OR comments72 >= 0),
  voters72 INTEGER CHECK (voters72 IS NULL OR voters72 >= 0),
  base_json TEXT NOT NULL CHECK (json_valid(base_json) AND length(base_json) <= 1024),
  x_views REAL NOT NULL CHECK (x_views >= 0.1 AND x_views <= 10),
  x_reactions REAL CHECK (x_reactions IS NULL OR (x_reactions >= 0.1 AND x_reactions <= 10)),
  x_comments REAL CHECK (x_comments IS NULL OR (x_comments >= 0.1 AND x_comments <= 10)),
  x_votes REAL CHECK (x_votes IS NULL OR (x_votes >= 0.1 AND x_votes <= 10)),
  composite REAL NOT NULL CHECK (composite >= 0.1 AND composite <= 10),
  -- hero, line, look, picture, hour and weekday (Moscow), exploration: what the comparisons slice by.
  slices_json TEXT NOT NULL CHECK (json_valid(slices_json) AND length(slices_json) <= 512),
  PRIMARY KEY (chat_id, message_id)
) WITHOUT ROWID;
CREATE INDEX rubric_scores_rubric_idx ON rubric_post_scores (rubric_key, role, sent_at DESC);
CREATE INDEX rubric_scores_sent_idx ON rubric_post_scores (sent_at DESC);
CREATE INDEX rubric_scores_scored_idx ON rubric_post_scores (scored_at);
-- The late fill looks for rows still missing their 72 h numbers.
CREATE INDEX rubric_scores_late_idx ON rubric_post_scores (sent_at) WHERE views72 IS NULL;

-- One comment-themes run per Moscow day: two queue deliveries or two Cron claims make one AI call.
CREATE TABLE rubric_summary_runs (
  day_msk TEXT PRIMARY KEY CHECK (length(day_msk) = 10),
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  lease_until INTEGER,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 40),
  model TEXT CHECK (model IS NULL OR length(model) <= 80),
  input_comments INTEGER CHECK (input_comments IS NULL OR input_comments >= 0),
  started_at INTEGER NOT NULL,
  finished_at INTEGER
) WITHOUT ROWID;

-- What a post's commenters said, by kind (counted by code from the model's ids) and up to three topics.
CREATE TABLE rubric_comment_themes (
  chat_id TEXT NOT NULL CHECK (length(chat_id) BETWEEN 1 AND 64),
  message_id INTEGER NOT NULL,
  rubric_key TEXT NOT NULL CHECK (length(rubric_key) BETWEEN 1 AND 40),
  run_day TEXT NOT NULL CHECK (length(run_day) = 10),
  comments INTEGER NOT NULL CHECK (comments >= 0),
  commenters INTEGER NOT NULL CHECK (commenters >= 0),
  limited INTEGER NOT NULL CHECK (limited IN (0, 1)),
  kinds_json TEXT NOT NULL CHECK (json_valid(kinds_json) AND length(kinds_json) <= 512),
  topics_json TEXT NOT NULL CHECK (json_valid(topics_json) AND length(topics_json) <= 1024),
  quote TEXT CHECK (quote IS NULL OR length(quote) <= 120),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id)
) WITHOUT ROWID;
CREATE INDEX rubric_themes_rubric_idx ON rubric_comment_themes (rubric_key, created_at DESC);
CREATE INDEX rubric_themes_created_idx ON rubric_comment_themes (created_at DESC);

-- The Monday report's «Рубрики» block, built once per Monday (Moscow date) from the rows scored since the last one.
CREATE TABLE rubric_week_blocks (
  week_key TEXT PRIMARY KEY CHECK (length(week_key) = 10),
  cut_from INTEGER NOT NULL,
  cut_to INTEGER NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json) AND length(data_json) <= 8192),
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- The analytics' reads of other modules' tables: sent rubric slots by send time, threads and polls of a period.
CREATE INDEX rubric_slots_sent_idx ON rubric_slots (sent_at) WHERE sent_at IS NOT NULL;
CREATE INDEX tg_threads_post_at_idx ON tg_comment_threads (channel_chat_id, post_at);
CREATE INDEX tg_polls_published_idx ON tg_polls (chat_id, published_at);
