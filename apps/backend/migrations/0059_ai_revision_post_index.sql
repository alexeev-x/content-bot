-- Studio-only origin of a post («ИИ» or «вручную», never shown to readers): the posts list looks up the approved
-- AI revisions of a page of posts by post id. Expand-only: one partial index.
CREATE INDEX IF NOT EXISTS ai_text_revisions_post_idx ON ai_text_revisions (post_id) WHERE post_id IS NOT NULL;
