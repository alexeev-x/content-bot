-- When the AI draft of a Steam announcement was last requested (owner, 21.10.2026: the button must stay locked while
-- the AI writes). Expand-only: one nullable column. A request is «writing» until its draft is recorded or 15 minutes
-- pass (a lost job must not lock the event for good).
ALTER TABLE dota_update_items ADD COLUMN ai_requested_at INTEGER CHECK (ai_requested_at IS NULL OR ai_requested_at >= 0);
