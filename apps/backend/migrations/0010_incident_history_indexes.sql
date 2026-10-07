-- The incidents page (docs/BACKEND_ARCHITECTURE.md §5, "Dashboard and incidents as built").
-- Expand only: two partial indexes, no data change. Times are UTC epoch milliseconds.

-- The resolved history, most recently closed first. Partial: open incidents never enter it, so it
-- stays out of the way of incidents_open_idx (which serves the open list).
CREATE INDEX incidents_resolved_idx ON incidents (resolved_at DESC, id DESC) WHERE resolved_at IS NOT NULL;

-- The same history filtered by kind, so a rare kind never walks the other kind's rows to fill a page.
CREATE INDEX incidents_resolved_kind_idx ON incidents (kind, resolved_at DESC, id DESC) WHERE resolved_at IS NOT NULL;
