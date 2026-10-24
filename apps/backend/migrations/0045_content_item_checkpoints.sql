-- Views of an item at fixed ages after publishing (1, 3, 6, 12, 24, 48, 72 hours), recorded by the first
-- collection inside each checkpoint's window. Only items tracked from their first hours get them, so the
-- «на том же возрасте» comparison never mixes in history read later. Expand-only: nullable columns.
ALTER TABLE content_items ADD COLUMN v1h INTEGER;
ALTER TABLE content_items ADD COLUMN v3h INTEGER;
ALTER TABLE content_items ADD COLUMN v6h INTEGER;
ALTER TABLE content_items ADD COLUMN v12h INTEGER;
ALTER TABLE content_items ADD COLUMN v24h INTEGER;
ALTER TABLE content_items ADD COLUMN v48h INTEGER;
ALTER TABLE content_items ADD COLUMN v72h INTEGER;
