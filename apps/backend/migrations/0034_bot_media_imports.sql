-- Files the owner sent to the bot, waiting to be fetched from Telegram and attached to their draft.
-- The webhook only writes these rows; a worker (waitUntil, then Cron) does the slow downloads.
-- One row per draft carries the lease that makes the import serial, the album caption and the report state.
CREATE TABLE bot_media_imports (
  post_id TEXT PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE CHECK (length(post_id) = 36),
  caption_json TEXT CHECK (caption_json IS NULL OR length(caption_json) <= 20000),
  caption_applied_at INTEGER,
  -- An item's caption over the post limit is never cut: the file is kept and the report says so.
  caption_too_long INTEGER NOT NULL DEFAULT 0 CHECK (caption_too_long IN (0, 1)),
  lease_token TEXT CHECK (lease_token IS NULL OR length(lease_token) = 36),
  lease_until INTEGER NOT NULL DEFAULT 0,
  reported_at INTEGER,
  report_attempts INTEGER NOT NULL DEFAULT 0 CHECK (report_attempts >= 0),
  last_file_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX bot_media_imports_open_idx ON bot_media_imports (lease_until) WHERE reported_at IS NULL;

CREATE TABLE bot_media_import_files (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  post_id TEXT NOT NULL REFERENCES bot_media_imports (post_id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL,
  telegram_file_id TEXT NOT NULL CHECK (length(telegram_file_id) BETWEEN 1 AND 512),
  file_unique_id TEXT NOT NULL CHECK (length(file_unique_id) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'animation')),
  file_name TEXT CHECK (file_name IS NULL OR length(file_name) <= 255),
  mime_type TEXT CHECK (mime_type IS NULL OR length(mime_type) <= 255),
  declared_size INTEGER CHECK (declared_size IS NULL OR declared_size >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
  failure TEXT CHECK (failure IS NULL OR failure IN ('too_large', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE (post_id, file_unique_id),
  CHECK ((status = 'failed') = (failure IS NOT NULL))
);

CREATE INDEX bot_media_import_files_pending_idx ON bot_media_import_files (post_id, message_id, id) WHERE status = 'pending';

-- One row: at most one file download is in flight across the whole Worker (isolates share memory limits).
CREATE TABLE bot_media_download_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lease_token TEXT NOT NULL CHECK (length(lease_token) = 36),
  lease_until INTEGER NOT NULL
);

PRAGMA optimize;
