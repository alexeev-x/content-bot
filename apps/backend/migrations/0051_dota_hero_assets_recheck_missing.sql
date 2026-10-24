-- Data fix (expand-only, DEV data so far): before 15.10.2026 a 403 from Valve's CDN was stored as `missing`
-- (checked again only weekly), and crops that do exist were marked so. Every missing file is queued again
-- now; a real 404 marks it missing again on the next try.
UPDATE dota_hero_assets SET status = 'pending', next_attempt_at = 0, error_code = NULL WHERE status = 'missing';
