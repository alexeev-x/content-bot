-- Rubric learning (rubric scheduler stage 8): the scores teach each rubric's rest and the slot hours. Four weeks of
-- advice from the first scored post, then the changes apply themselves unless the owner switches that off (owner,
-- 31.10.2026: answer 10). Expand-only: new tables; rest values stay in rubric_settings (rest_source 'learned').

CREATE TABLE rubric_learning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  -- The first scored post: advice runs 28 days from it.
  started_at INTEGER,
  apply_enabled INTEGER NOT NULL DEFAULT 1 CHECK (apply_enabled IN (0, 1)),
  updated_at INTEGER NOT NULL
);
INSERT INTO rubric_learning_state (id, started_at, apply_enabled, updated_at) VALUES (1, NULL, 1, 0);

-- One row per Monday, kind and subject: a replayed step writes nothing new and applies nothing twice.
CREATE TABLE rubric_learning_log (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  week_key TEXT NOT NULL CHECK (length(week_key) = 10),
  kind TEXT NOT NULL CHECK (kind IN ('rest', 'hour')),
  -- A rubric key, or `<group>:<part>` for an hour slot.
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 40),
  from_value INTEGER NOT NULL,
  to_value INTEGER NOT NULL,
  applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
  outcome TEXT NOT NULL CHECK (outcome IN ('advised', 'applied', 'conflict', 'manual', 'out_of_range')),
  reason TEXT NOT NULL CHECK (length(reason) <= 40),
  numbers_json TEXT NOT NULL CHECK (json_valid(numbers_json) AND length(numbers_json) <= 512),
  created_at INTEGER NOT NULL,
  UNIQUE (week_key, kind, subject)
);
CREATE INDEX rubric_learning_subject_idx ON rubric_learning_log (kind, subject, created_at DESC);

-- The slot starts by day group (`wd`, `we`, or one weekday `mon`…`sun`) and part of the day; absent: 12:30 / 19:00.
CREATE TABLE rubric_hour_slots (
  grp TEXT NOT NULL CHECK (grp IN ('wd', 'we', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  part TEXT NOT NULL CHECK (part IN ('day', 'evening')),
  minute INTEGER NOT NULL CHECK (minute BETWEEN 480 AND 1350),
  default_minute INTEGER NOT NULL CHECK (default_minute BETWEEN 480 AND 1350),
  source TEXT NOT NULL CHECK (source IN ('learned', 'manual')),
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (grp, part)
) WITHOUT ROWID;
