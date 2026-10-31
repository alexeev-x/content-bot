-- The DEV week-long rehearsal's journal (owner, 31.10.2026): every rubric slot of the test, the failure the rehearsal
-- staged for it (if any), what should have happened, what did, and the verdict. Written only in the rehearsal at the
-- week's pace; production never writes it. Dropped once the test is over (a later migration). Expand-only.
CREATE TABLE rubric_rehearsal_checks (
  slot_id TEXT PRIMARY KEY CHECK (length(slot_id) = 36),
  rubric_key TEXT NOT NULL CHECK (length(rubric_key) BETWEEN 1 AND 40),
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 20),
  slot_at INTEGER NOT NULL,
  scenario TEXT NOT NULL CHECK (scenario IN (
    'none', 'build_crash', 'build_fail', 'build_late', 'tg_429', 'tg_timeout', 'tg_forbidden'
  )),
  -- 1 once the staged failure has happened (a Telegram failure only fires once).
  fired INTEGER NOT NULL DEFAULT 0 CHECK (fired IN (0, 1)),
  verdict TEXT NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending', 'ok', 'bad', 'void')),
  -- The slot's end as the verdict saw it, and why the verdict is what it is (Russian, for the owner).
  status TEXT CHECK (status IS NULL OR length(status) <= 20),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 80),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_at INTEGER NOT NULL,
  checked_at INTEGER
) WITHOUT ROWID;

-- The verdict pass reads the open checks; the journal page reads by slot time; the send hook the unfired Telegram ones.
CREATE INDEX rubric_rehearsal_checks_open_idx ON rubric_rehearsal_checks (verdict, slot_at);
CREATE INDEX rubric_rehearsal_checks_at_idx ON rubric_rehearsal_checks (slot_at);
CREATE INDEX rubric_rehearsal_checks_tg_idx ON rubric_rehearsal_checks (scenario) WHERE fired = 0;
