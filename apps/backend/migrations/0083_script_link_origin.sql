-- Who linked a video to its script (review 19.10.2026): the owner (the studio, «Да» or «✅ Верно» in the bot) or the
-- automatic match by title. The analytics review says which, and only the owner's links teach analysis rules.
-- Expand-only: one column with a default; links made by the automatic match so far are marked from their prompts.
ALTER TABLE content_ai_links ADD COLUMN origin TEXT NOT NULL DEFAULT 'owner' CHECK (origin IN ('owner', 'auto'));
UPDATE content_ai_links SET origin = 'auto'
WHERE EXISTS (
  SELECT 1 FROM ai_script_prompts p, json_each(p.item_ids) j
  WHERE p.status = 'auto' AND p.revision_id = content_ai_links.revision_id AND j.value = content_ai_links.content_item_id
);
