-- AI writer: drafts, their text revisions with provenance, and the owner's feedback (docs/ai/architecture.md,
-- items 2–4 and 20). Expand-only: three new tables.

-- One model call that produced (or failed to produce) a text: a first draft or a rewrite of an earlier one.
CREATE TABLE IF NOT EXISTS ai_generations (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'rewrite')),
  format TEXT NOT NULL CHECK (format IN ('fidit', 'igrat', 'standalone', 'telegram')),
  -- direct: the owner's own thoughts or topic; automatic: a news item or patch (facts only, no owner experience).
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'automatic')),
  source TEXT NOT NULL CHECK (source IN ('bot', 'studio')),
  -- The owner's words (topic, raw thoughts) or the source facts; for a rewrite, the instruction.
  task TEXT NOT NULL CHECK (length(task) BETWEEN 1 AND 4000),
  parent_generation_id TEXT REFERENCES ai_generations (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  error_code TEXT,
  model TEXT,
  -- Hash of the bundled pack (docs/ai) the prompt was built from.
  pack_revision TEXT NOT NULL,
  usage_id TEXT,
  -- JSON array of up to 3 hook variants (direct Reels drafts).
  hooks TEXT CHECK (hooks IS NULL OR json_valid(hooks)),
  -- Code-check findings, JSON array of stable codes.
  warnings TEXT CHECK (warnings IS NULL OR json_valid(warnings)),
  -- The owner pre-approved in the request («сам утверди и опубликуй в …»): when to publish, UTC ms.
  pre_approved_publish_at INTEGER,
  -- The bot message showing this draft, so a reply to it is the owner's edit.
  chat_message_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_generations_created_idx ON ai_generations (created_at);
CREATE INDEX IF NOT EXISTS ai_generations_message_idx ON ai_generations (chat_message_id) WHERE chat_message_id IS NOT NULL;

-- Every text version of a draft with who wrote it. An AI_DRAFT is never style evidence and never publishable.
CREATE TABLE IF NOT EXISTS ai_text_revisions (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  generation_id TEXT NOT NULL REFERENCES ai_generations (id),
  parent_id TEXT REFERENCES ai_text_revisions (id),
  provenance TEXT NOT NULL CHECK (
    provenance IN ('AI_DRAFT', 'OWNER_EDITED', 'OWNER_APPROVED', 'OWNER_PREAPPROVED')
  ),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 8000),
  -- Share of the AI draft's words the owner changed (0–1), set on approval.
  edit_ratio REAL CHECK (edit_ratio IS NULL OR edit_ratio BETWEEN 0 AND 1),
  -- The studio post an approved Telegram text became.
  post_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_text_revisions_generation_idx ON ai_text_revisions (generation_id, created_at);
-- One approval per draft: a repeated tap or a race never approves twice.
CREATE UNIQUE INDEX IF NOT EXISTS ai_text_revisions_approved_idx
  ON ai_text_revisions (generation_id) WHERE provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED');

-- The owner's quick verdicts on a draft.
CREATE TABLE IF NOT EXISTS ai_feedback (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  generation_id TEXT NOT NULL REFERENCES ai_generations (id),
  kind TEXT NOT NULL CHECK (kind IN ('joke_missed', 'not_my_style', 'fact_wrong')),
  created_at INTEGER NOT NULL,
  UNIQUE (generation_id, kind)
);
