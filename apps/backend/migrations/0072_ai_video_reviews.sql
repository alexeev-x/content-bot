-- Stage 5 of docs/ai/IMPLEMENTATION_PLAN.md: one review per YouTube/TikTok video once it is 72 hours old.
-- Expand-only: one new table. Cron inserts a pending row per due video (INSERT OR IGNORE: overlapping ticks add it
-- once), claims a few with a conditional lease, and writes the result; a ready or limited row is final.
CREATE TABLE IF NOT EXISTS ai_video_reviews (
  -- `<platform>:<external id>` of content_items (not a foreign key: items are re-collected by their own module).
  item_id TEXT PRIMARY KEY CHECK (length(item_id) BETWEEN 3 AND 160),
  status TEXT NOT NULL CHECK (status IN ('pending', 'claimed', 'ready', 'limited')),
  claim_until INTEGER CHECK (claim_until IS NULL OR claim_until >= 0),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  limited_reason TEXT CHECK (
    limited_reason IS NULL OR limited_reason IN
      ('no_script', 'weak_baseline', 'no_snapshot', 'contaminated', 'reviews_off', 'budget', 'model_failed')
  ),
  facts_json TEXT CHECK (facts_json IS NULL OR (json_valid(facts_json) AND length(facts_json) <= 2000)),
  observation_json TEXT CHECK (observation_json IS NULL OR (json_valid(observation_json) AND length(observation_json) <= 2000)),
  hypotheses_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(hypotheses_json) AND length(hypotheses_json) <= 2000),
  next_test TEXT CHECK (next_test IS NULL OR length(next_test) <= 300),
  model TEXT CHECK (model IS NULL OR length(model) <= 80),
  -- The ai_usage row of the model call, when one was made (cost lives there).
  usage_id TEXT,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  CHECK ((status IN ('ready', 'limited')) = (facts_json IS NOT NULL))
);
-- The Cron claim: due rows in order, and expired leases.
CREATE INDEX IF NOT EXISTS ai_video_reviews_due_idx ON ai_video_reviews (status, claim_until, created_at);
