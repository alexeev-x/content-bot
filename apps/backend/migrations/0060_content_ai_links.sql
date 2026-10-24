-- A published YouTube/TikTok video linked to the approved AI script it was filmed from (docs/ai/architecture.md,
-- item 3). Reels are published outside the studio, so the owner confirms each link. Expand-only: one table and
-- two indexes.

-- One script per video; one script may serve several videos (the same Reels on YouTube and TikTok).
CREATE TABLE IF NOT EXISTS content_ai_links (
  -- `<platform>:<external id>` of content_items (not a foreign key: items are re-collected by their own module).
  content_item_id TEXT PRIMARY KEY CHECK (length(content_item_id) BETWEEN 3 AND 160),
  revision_id TEXT NOT NULL REFERENCES ai_text_revisions (id),
  linked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_ai_links_revision_idx ON content_ai_links (revision_id);

-- Candidates for a video: the approvals of a time window, newest first.
CREATE INDEX IF NOT EXISTS ai_text_revisions_approved_at_idx
  ON ai_text_revisions (created_at) WHERE provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED');
