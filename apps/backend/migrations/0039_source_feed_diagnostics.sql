-- Expand-only: the last failed check of each feed, so the UI can say what failed instead of "error".
ALTER TABLE dota_source_state ADD COLUMN last_error_code TEXT;
ALTER TABLE dota_source_state ADD COLUMN last_error_http_status INTEGER;
ALTER TABLE dota_source_state ADD COLUMN last_error_detail TEXT;
ALTER TABLE dota_source_state ADD COLUMN last_error_at INTEGER;
ALTER TABLE dota_source_state ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;

ALTER TABLE dota_hero_stats_state ADD COLUMN last_error_kind TEXT;
ALTER TABLE dota_hero_stats_state ADD COLUMN last_error_http_status INTEGER;
ALTER TABLE dota_hero_stats_state ADD COLUMN last_error_detail TEXT;
ALTER TABLE dota_hero_stats_state ADD COLUMN last_error_at INTEGER;
ALTER TABLE dota_hero_stats_state ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
