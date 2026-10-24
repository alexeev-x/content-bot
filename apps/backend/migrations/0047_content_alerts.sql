-- Bot alerts about content analytics (docs/API_CONTRACTS.md § Content analytics): a publication running
-- above or below its usual curve, a source that stopped collecting, the Monday digest. Expand-only: one new
-- table, no change to existing data.

-- `id` is the dedup key, so overlapping Cron ticks insert an alert once:
--   item:<item id>:rising | item:<item id>:below   (one per direction per publication)
--   source:<platform>:<last success ms>            (one per outage)
--   digest:<owner-zone Monday, YYYY-MM-DD>          (one per week)
-- The text is rendered when the alert is raised; a send that may have happened but is unconfirmed becomes
-- `unknown` and is never retried.
CREATE TABLE IF NOT EXISTS content_alerts (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('item', 'source', 'digest')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
  link_path TEXT NOT NULL CHECK (length(link_path) BETWEEN 1 AND 300),
  created_at INTEGER NOT NULL,
  send_started_at INTEGER,
  updated_at INTEGER NOT NULL,
  error_code TEXT
) WITHOUT ROWID;

-- The sender reads the oldest pending alerts and the stuck `sending` ones.
CREATE INDEX IF NOT EXISTS content_alerts_status_idx ON content_alerts (status, created_at);
