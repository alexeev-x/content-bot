-- Data fix (DEV data so far): files that failed against Valve's Cloudflare CDN (403, «Illegal invocation») are
-- retried at once from the Akamai mirror instead of waiting out their back-off of up to a day.
UPDATE dota_hero_assets SET next_attempt_at = 0, attempts = 0 WHERE status = 'failed';
