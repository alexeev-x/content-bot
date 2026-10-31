-- The calendar and the day reads take slots by time range (`slot_at >= ? AND slot_at < ?`); the only index on slot_at is
-- partial (live and sent rows), which such a query cannot use. Expand-only: a new index.
CREATE INDEX rubric_slots_at_idx ON rubric_slots (slot_at);
