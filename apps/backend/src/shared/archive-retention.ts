// How long an archived post is kept before the Cron purge deletes it (owner decision 06.10.2026:
// about 30 days). Server-side only; the client receives the resulting `autoDeleteAt`.
export const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
