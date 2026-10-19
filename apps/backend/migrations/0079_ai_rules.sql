-- The AI writer's managed memory (AI plan P7, §6): the owner's explicit rules and the rules the analysis proposes,
-- each with its scope and status, and the independent evidence behind an analysis rule. Expand only: two tables.
--   owner rules:    pending_scope (asked for its scope) → active → disabled
--   analysis rules: candidate → supported → strong (used only once the owner approved it) → deprecated / disabled
CREATE TABLE IF NOT EXISTS ai_rules (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 3 AND 300),
  scope TEXT NOT NULL CHECK (scope IN ('all', 'telegram', 'fidit', 'igrat', 'standalone')),
  source TEXT NOT NULL CHECK (source IN ('owner', 'analysis')),
  status TEXT NOT NULL CHECK (
    status IN ('pending_scope', 'active', 'candidate', 'supported', 'strong', 'disabled', 'deprecated')
  ),
  -- An analysis rule reaches a prompt only after the owner said yes to it.
  approved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER
) WITHOUT ROWID;

-- The prompt reads the active rules of a scope.
CREATE INDEX IF NOT EXISTS ai_rules_status_idx ON ai_rules (status, scope);

-- One independent source per rule and key: a video counts once however many reports name it (plan MEM-03, 15).
CREATE TABLE IF NOT EXISTS ai_rule_evidence (
  rule_id TEXT NOT NULL REFERENCES ai_rules (id),
  evidence_key TEXT NOT NULL CHECK (length(evidence_key) BETWEEN 1 AND 300),
  polarity TEXT NOT NULL CHECK (polarity IN ('support', 'contradict')),
  -- The report or verdict it came from, for the audit.
  source_ref TEXT CHECK (source_ref IS NULL OR length(source_ref) <= 100),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (rule_id, evidence_key)
) WITHOUT ROWID;
