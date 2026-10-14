CREATE TABLE dota_hero_stats_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at INTEGER CHECK (last_attempt_at IS NULL OR last_attempt_at >= 0),
  last_success_at INTEGER CHECK (last_success_at IS NULL OR last_success_at >= 0),
  last_error_code TEXT CHECK (last_error_code IS NULL OR last_error_code IN (
    'DOTA_HERO_STATS_FETCH', 'DOTA_HERO_STATS_HTTP', 'DOTA_HERO_STATS_BODY_LIMIT',
    'DOTA_HERO_STATS_JSON', 'DOTA_HERO_STATS_SHAPE'
  )),
  claim_token TEXT CHECK (claim_token IS NULL OR length(claim_token) = 36),
  claim_until INTEGER CHECK (claim_until IS NULL OR claim_until >= 0),
  CHECK ((claim_token IS NULL) = (claim_until IS NULL))
);

CREATE TABLE dota_hero_stats_snapshots (
  observed_at INTEGER PRIMARY KEY CHECK (observed_at >= 0),
  heroes_json TEXT NOT NULL
    CHECK (json_valid(heroes_json) AND json_type(heroes_json) = 'array')
    CHECK (json_array_length(heroes_json) BETWEEN 1 AND 200)
    CHECK (length(heroes_json) <= 500000)
);
