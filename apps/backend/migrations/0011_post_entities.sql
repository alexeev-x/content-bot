-- Stage 6: rich post text. A body stays plain text; its formatting is a JSON list of Telegram message
-- entities (UTF-16 offsets into body), stored the same way on the post and on every revision snapshot.
-- Expand: two columns whose default '[]' leaves every existing row exactly as it published before.
-- The 16384 cap is POST_ENTITIES_JSON_MAX in apps/contracts/src/post-entities.ts; the stored text is
-- ASCII (link addresses and code languages are), so length() is bytes.

ALTER TABLE posts ADD COLUMN entities TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(entities) AND json_type(entities) = 'array' AND length(entities) <= 16384);
ALTER TABLE post_revisions ADD COLUMN entities TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(entities) AND json_type(entities) = 'array' AND length(entities) <= 16384);

-- A stored create response now carries the entity list: a maximum post (200-character title and 4096-character
-- body with every character escaped, about 8.6 KB, plus up to 16384 characters of entities and the summary)
-- no longer fits the 16384-character cap of migration 0001, and an oversized response would make the whole
-- create batch fail. SQLite cannot change a CHECK in place, so the table is rebuilt with 32768; no other
-- table references it, and every row is copied as it is.
CREATE TABLE idempotency_keys_rebuilt (
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 20),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 255),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('in_flight', 'completed')),
  response_status INTEGER,
  response_body TEXT CHECK (response_body IS NULL OR length(response_body) <= 32768),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (scope, key),
  CHECK (status = 'in_flight' OR (response_status IS NOT NULL AND response_body IS NOT NULL))
);

INSERT INTO idempotency_keys_rebuilt
  (scope, key, request_hash, status, response_status, response_body, created_at, expires_at)
SELECT scope, key, request_hash, status, response_status, response_body, created_at, expires_at
FROM idempotency_keys;

DROP TABLE idempotency_keys;
ALTER TABLE idempotency_keys_rebuilt RENAME TO idempotency_keys;

-- For the cleanup of expired keys, as in 0001.
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);
