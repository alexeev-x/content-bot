-- The mirrored Dota hero files were removed 24.10.2026 (owner: «давай пока уберем … с бд удали тоже чтобы место не
-- трогалось»; docs/DECISIONS.md). Contract step: the code that read this table was deployed away by the commit before
-- (7b7b27d2), whose Cron step also deletes the files from R2. The table and its index go.
DROP INDEX IF EXISTS dota_hero_assets_due_idx;
DROP TABLE IF EXISTS dota_hero_assets;
