-- Step 1a: the bot as the entry point (docs/BACKEND_ARCHITECTURE.md §5, "Bot as the entry point").
-- Expand only: one nullable column, a one-time backfill and two new tables. Times are UTC epoch milliseconds.

-- Set by a conditional UPDATE (WHERE owner_notified_at IS NULL) right before the owner is told about
-- the incident, so the alert goes out at most once however many ticks overlap. A failed alert is not
-- retried: the incident itself stays in D1 and in the UI.
ALTER TABLE incidents ADD COLUMN owner_notified_at INTEGER CHECK (owner_notified_at IS NULL OR owner_notified_at >= 0);

-- Incidents that exist before this release count as already told: the owner sees them in the UI, and
-- the first deploy must not send one alert per old row.
UPDATE incidents SET owner_notified_at = created_at WHERE owner_notified_at IS NULL;

-- Webhook dedup: Telegram may redeliver an update (a slow answer, a retry), and a replay must not
-- create a second draft. The primary key is the guard: the first insert wins. Only the owner's
-- updates are recorded; the webhook deletes a few rows older than three days on every insert.
CREATE TABLE webhook_updates (
  update_id INTEGER PRIMARY KEY CHECK (update_id >= 0),
  received_at INTEGER NOT NULL
);
CREATE INDEX webhook_updates_received_idx ON webhook_updates (received_at);

-- Small machine-written facts that are not owner settings: the last Cron run and this Worker's public
-- origin (which Cron cannot learn from a request, so the first /start or connect stores it). One JSON
-- value per key, validated by the application on every read.
CREATE TABLE system_state (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 32),
  value TEXT NOT NULL CHECK (json_valid(value) AND length(value) <= 1024),
  updated_at INTEGER NOT NULL
);
