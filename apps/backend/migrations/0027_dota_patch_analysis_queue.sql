ALTER TABLE dota_patch_analyses ADD COLUMN claim_token TEXT;
ALTER TABLE dota_patch_analyses ADD COLUMN claim_until INTEGER CHECK (claim_until IS NULL OR claim_until >= 0);

CREATE INDEX dota_patch_analyses_pending_idx
  ON dota_patch_analyses (parsed_at, external_id, parse_status, claim_until)
  WHERE parse_status IN ('pending', 'unavailable');

INSERT OR IGNORE INTO dota_patch_analyses (source_key, external_id, parse_status, facts_json, parsed_at)
SELECT source_key, external_id, 'pending', '[]', detected_at
FROM dota_update_items
WHERE source_key = 'patch_notes';
