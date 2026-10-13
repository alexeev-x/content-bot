CREATE TABLE dota_patch_analyses (
  source_key TEXT NOT NULL DEFAULT 'patch_notes' CHECK (source_key = 'patch_notes'),
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 100),
  parse_status TEXT NOT NULL CHECK (parse_status IN (
    'pending', 'complete', 'incomplete', 'no_recognized_facts', 'unavailable'
  )),
  facts_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(facts_json) AND json_type(facts_json) = 'array')
    CHECK (json_array_length(facts_json) <= 500 AND length(facts_json) <= 1000000),
  parsed_at INTEGER NOT NULL CHECK (parsed_at >= 0),
  PRIMARY KEY (source_key, external_id),
  FOREIGN KEY (source_key, external_id)
    REFERENCES dota_update_items (source_key, external_id) ON DELETE CASCADE
);
