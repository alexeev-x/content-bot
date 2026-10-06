-- Stage 2: destinations, publication intents and their jobs (docs/BACKEND_ARCHITECTURE.md §5, §6).
-- Times are UTC epoch milliseconds; ids are UUID text. job_attempts and incidents arrive with sending.

CREATE TABLE destinations (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  -- NOCASE (ASCII) so the list sorts "alpha" next to "Beta" and keyset comparisons agree with it.
  title TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(title)) >= 1 AND length(title) <= 100),
  -- Numeric chat id or @username. Usernames are case-insensitive in Telegram, so the unique
  -- constraint is too; the stored value keeps the case the owner typed.
  chat_id TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(chat_id) BETWEEN 1 AND 33),
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'group')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Keyset list ordered by title; the filtered shape needs its own index so SQLite never sorts.
CREATE INDEX destinations_title_idx ON destinations (title, id);
CREATE INDEX destinations_enabled_title_idx ON destinations (enabled, title, id);

CREATE TABLE publications (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  post_id TEXT NOT NULL REFERENCES posts (id),
  -- The approved revision that will be sent; approved posts are immutable, so it never drifts.
  post_revision INTEGER NOT NULL CHECK (post_revision >= 0),
  destination_id TEXT NOT NULL REFERENCES destinations (id),
  scheduled_at INTEGER NOT NULL,
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 64),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  -- Written together with the job outcome; delivery state itself lives only in jobs.
  external_message_id TEXT CHECK (external_message_id IS NULL OR length(external_message_id) BETWEEN 1 AND 64),
  last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 64),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (post_id, post_revision) REFERENCES post_revisions (post_id, revision)
);

-- Keyset list, latest scheduledAt first: one index per filter shape (none, post, destination).
CREATE INDEX publications_scheduled_idx ON publications (scheduled_at DESC, id DESC);
CREATE INDEX publications_post_idx ON publications (post_id, scheduled_at DESC, id DESC);
CREATE INDEX publications_destination_idx ON publications (destination_id, scheduled_at DESC, id DESC);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 32),
  publication_id TEXT REFERENCES publications (id),
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'claimed', 'retry_wait', 'succeeded', 'failed', 'unknown', 'cancelled'
  )),
  run_at INTEGER NOT NULL,
  lease_until INTEGER,
  send_started_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- One publish job per publication: 'publish:' + publication id.
  dedupe_key TEXT NOT NULL UNIQUE CHECK (length(dedupe_key) BETWEEN 1 AND 128),
  -- Sort key of the publication list copied from publications.scheduled_at, so a status filter can
  -- be driven by jobs_status_scheduled_idx and stay bounded. Create inserts it with the job and the
  -- trigger below follows every later change of publications.scheduled_at; it is not delivery state.
  publication_scheduled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((publication_id IS NULL) = (publication_scheduled_at IS NULL))
);

-- The dispatcher's due scan (BACKEND §5): small pages in (status, run_at, id) order.
CREATE INDEX jobs_due ON jobs (status, run_at, id) WHERE status IN ('pending', 'retry_wait');
-- Publication reads join their job by this column.
CREATE INDEX jobs_publication_idx ON jobs (publication_id);
-- Reconcile (BACKEND §5): claimed jobs whose lease expired, with or without send_started_at.
-- Partial, so it only ever holds the few in-flight jobs; status stays in the key because without
-- it SQLite prefers the plain status equality of jobs_status_scheduled_idx over this range.
CREATE INDEX jobs_claimed_lease ON jobs (status, lease_until) WHERE status = 'claimed';
-- Publication list filtered by status alone: reads only rows of that status, latest scheduledAt first.
CREATE INDEX jobs_status_scheduled_idx ON jobs (status, publication_scheduled_at DESC, publication_id DESC);

-- The copy cannot drift: whatever statement moves a publication keeps its job's sort key in step.
CREATE TRIGGER publications_scheduled_at_sync AFTER UPDATE OF scheduled_at ON publications
BEGIN
  UPDATE jobs SET publication_scheduled_at = NEW.scheduled_at WHERE publication_id = NEW.id;
END;
