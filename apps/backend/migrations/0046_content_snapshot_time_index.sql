-- Daily view growth (docs/API_CONTRACTS.md § Content analytics) reads snapshots by time across items;
-- the primary key starts with item_id, so it needs its own index. Expand-only.
CREATE INDEX IF NOT EXISTS content_item_snapshots_observed_idx ON content_item_snapshots (observed_at);
PRAGMA optimize;
