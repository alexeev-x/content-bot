-- AI plan P8: the studio's report history. Expand-only: one nullable column and two indexes.
-- The ai_usage row of the report's AI review (its cost lives there); null without a model call and for the reports
-- stored before this migration.
ALTER TABLE content_daily_reports ADD COLUMN usage_id TEXT CHECK (usage_id IS NULL OR length(usage_id) <= 100);
-- The studio lists reports newest first, a page at a time.
CREATE INDEX IF NOT EXISTS content_daily_reports_as_of_idx ON content_daily_reports (as_of DESC, id DESC);
-- One report's forecasts for the studio, by video then horizon.
CREATE INDEX IF NOT EXISTS content_forecasts_report_idx ON content_forecasts (report_id, item_id, horizon_hours);
