-- The owner's confirmation that a factor outside the content distorted an item's numbers (docs/ai/architecture.md
-- item 12, docs/ai/IMPLEMENTATION_PLAN.md stage 3). Only confirmed factors count: a weak result is not one.
-- A marked item leaves every usual curve but keeps its own snapshots.
CREATE TABLE IF NOT EXISTS content_item_contamination (
  item_id TEXT PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('restricted', 'removed', 'platform_incident', 'collection_failure')),
  set_at INTEGER NOT NULL
) WITHOUT ROWID;
