-- The rubric scheduler (stage 4, docs/scheduler/area-backend-core.md §6.1): its switch, each rubric's rest, the slots
-- it plans, builds and releases, their attempts, its step markers, breakers and notices. Expand-only; times UTC ms.

-- The switch and the channel (singleton). Off until the owner turns it on in «Рубрики».
CREATE TABLE rubric_scheduler_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  destination_id TEXT REFERENCES destinations (id) ON DELETE SET NULL,
  -- The Monday (MSK) of the first horoscope: fixes the every-other-week parity.
  horoscope_anchor_week TEXT CHECK (horoscope_anchor_week IS NULL OR length(horoscope_anchor_week) = 10),
  -- Switching off cancels the live slots once; 0 while that cleanup has not run.
  off_cleanup_done INTEGER NOT NULL DEFAULT 1 CHECK (off_cleanup_done IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO rubric_scheduler_settings (id, updated_at) VALUES (1, 0);

-- Each rubric: on or off, its rest (the owner may change it), when it last went out (real or seeded) and why it waits.
CREATE TABLE rubric_settings (
  rubric_key TEXT PRIMARY KEY CHECK (length(rubric_key) BETWEEN 1 AND 40),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  base_rest_days INTEGER NOT NULL CHECK (base_rest_days BETWEEN 7 AND 60),
  rest_days INTEGER NOT NULL CHECK (rest_days BETWEEN 7 AND 60),
  rest_source TEXT NOT NULL DEFAULT 'default' CHECK (rest_source IN ('default', 'manual', 'learned')),
  last_sent_at INTEGER,
  last_sent_seeded INTEGER NOT NULL DEFAULT 0 CHECK (last_sent_seeded IN (0, 1)),
  last_failed_at INTEGER,
  last_fail_code TEXT CHECK (last_fail_code IS NULL OR length(last_fail_code) <= 60),
  -- A content skip («нечего сказать») holds a pool rubric back until then.
  skip_until INTEGER,
  paused_reason TEXT CHECK (paused_reason IS NULL OR paused_reason = 'BANK_EXHAUSTED'),
  paused_at INTEGER,
  bank_size_at_pause INTEGER,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- A slot: one rubric post at one time. Every live row has its next action and every row its deadline (its exit).
CREATE TABLE rubric_slots (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  msk_day TEXT NOT NULL CHECK (length(msk_day) = 10),
  slot_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pool', 'event', 'anchor', 'follow_up', 'poll_close')),
  rubric_key TEXT NOT NULL CHECK (length(rubric_key) BETWEEN 1 AND 40),
  -- The chosen rubric first, then up to two fallbacks.
  candidates_json TEXT NOT NULL CHECK (
    json_valid(candidates_json) AND json_type(candidates_json) = 'array'
    AND json_array_length(candidates_json) BETWEEN 1 AND 3
  ),
  cand_idx INTEGER NOT NULL DEFAULT 0 CHECK (cand_idx BETWEEN 0 AND 2),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  status TEXT NOT NULL CHECK (status IN (
    'planned', 'building', 'ready', 'released', 'waiting_parent', 'unknown',
    'sent', 'partial', 'unresolved', 'send_failed', 'missed', 'empty', 'skipped', 'yielded', 'cancelled', 'superseded'
  )),
  build_at INTEGER NOT NULL,
  next_action_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  lease_until INTEGER,
  build_started_at INTEGER,
  handler_errors INTEGER NOT NULL DEFAULT 0 CHECK (handler_errors >= 0),
  weight TEXT NOT NULL CHECK (weight IN ('V', 'L')),
  interactive INTEGER NOT NULL CHECK (interactive IN (0, 1)),
  family TEXT NOT NULL CHECK (length(family) BETWEEN 1 AND 40),
  explore INTEGER NOT NULL DEFAULT 0 CHECK (explore IN (0, 1)),
  -- The owner moved the publication by hand: the slot follows it and never moves it back.
  manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1)),
  dedupe_key TEXT NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 128),
  parent_slot_id TEXT,
  replaces_slot_id TEXT,
  reason_json TEXT NOT NULL CHECK (json_valid(reason_json) AND length(reason_json) <= 1024),
  -- What the build made: the posts (text, poll, pictures) as studio post ids, and what release needs.
  build_json TEXT CHECK (build_json IS NULL OR (json_valid(build_json) AND length(build_json) <= 65536)),
  facts_json TEXT CHECK (facts_json IS NULL OR (json_valid(facts_json) AND length(facts_json) <= 16384)),
  post_id TEXT,
  publication_id TEXT,
  message_ids_json TEXT CHECK (message_ids_json IS NULL OR json_valid(message_ids_json)),
  poll_id TEXT,
  sent_at INTEGER,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 80),
  error_step TEXT CHECK (error_step IS NULL OR length(error_step) <= 20),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Live and sent slots own their dedupe key; a content skip keeps it, so the same event is not planned again.
CREATE UNIQUE INDEX rubric_slots_dedupe_uq ON rubric_slots (dedupe_key)
  WHERE status IN ('planned', 'building', 'ready', 'released', 'waiting_parent', 'unknown', 'sent', 'partial', 'unresolved', 'skipped');
-- Never two posts at one time.
CREATE UNIQUE INDEX rubric_slots_at_uq ON rubric_slots (slot_at)
  WHERE kind <> 'poll_close' AND status IN ('planned', 'building', 'ready', 'released', 'waiting_parent', 'unknown', 'sent', 'partial', 'unresolved');
CREATE INDEX rubric_slots_due_idx ON rubric_slots (next_action_at, id)
  WHERE status IN ('planned', 'building', 'ready', 'released', 'waiting_parent', 'unknown');
CREATE INDEX rubric_slots_rubric_idx ON rubric_slots (rubric_key, slot_at DESC);
CREATE INDEX rubric_slots_day_idx ON rubric_slots (msk_day, slot_at);
CREATE INDEX rubric_slots_pub_idx ON rubric_slots (publication_id) WHERE publication_id IS NOT NULL;
CREATE INDEX rubric_slots_parent_idx ON rubric_slots (parent_slot_id) WHERE parent_slot_id IS NOT NULL;

-- What happened at each step of a slot: failures, skips, degradations and the final ok; kept 90 days.
CREATE TABLE rubric_slot_attempts (
  slot_id TEXT NOT NULL REFERENCES rubric_slots (id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  step TEXT NOT NULL CHECK (step IN (
    'capability', 'data', 'writer', 'similarity', 'scene', 'render', 'photo', 'store', 'release', 'dispatch', 'project'
  )),
  rubric_key TEXT NOT NULL CHECK (length(rubric_key) BETWEEN 1 AND 40),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'failed', 'skipped', 'degraded')),
  provider TEXT CHECK (provider IS NULL OR length(provider) <= 40),
  http_status INTEGER,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 80),
  message TEXT CHECK (message IS NULL OR length(message) <= 300),
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (slot_id, attempt, step)
) WITHOUT ROWID;
CREATE INDEX rubric_slot_attempts_age_idx ON rubric_slot_attempts (started_at);

-- When each periodic step is next due (persisted, so a busy tick never loses one).
CREATE TABLE rubric_step_marks (
  step TEXT PRIMARY KEY CHECK (step IN ('plan', 'health', 'purge', 'learn')),
  next_due_at INTEGER NOT NULL,
  last_run_at INTEGER,
  last_success_at INTEGER,
  last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 80),
  fail_count INTEGER NOT NULL DEFAULT 0 CHECK (fail_count >= 0)
) WITHOUT ROWID;
INSERT OR IGNORE INTO rubric_step_marks (step, next_due_at) VALUES ('plan', 0), ('health', 0), ('purge', 0);

-- A provider or a rubric that keeps failing rests for a while instead of failing every slot.
CREATE TABLE rubric_breakers (
  scope TEXT NOT NULL CHECK (scope IN ('provider', 'rubric')),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 40),
  failures_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(failures_json) AND json_array_length(failures_json) <= 6),
  opened_until INTEGER,
  last_code TEXT CHECK (last_code IS NULL OR length(last_code) <= 80),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key)
) WITHOUT ROWID;

-- The owner's notices, one per key and Moscow day; at most six failures a day, then one summary.
CREATE TABLE rubric_notices (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 160),
  msk_day TEXT NOT NULL CHECK (length(msk_day) = 10),
  kind TEXT NOT NULL CHECK (kind IN ('failure', 'health', 'bank', 'summary')),
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX rubric_notices_day_idx ON rubric_notices (msk_day, kind);
