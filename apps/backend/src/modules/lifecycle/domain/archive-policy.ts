// How far back the archive step looks for publications that just finished. A regular tick only has to
// see what the last few ticks produced; the hourly sweep is the safety net for ticks that failed.
// Posts whose last publication finished before the window are not archived automatically.
export const ARCHIVE_LOOKBACK_TICK_MS = 15 * 60 * 1000;
export const ARCHIVE_LOOKBACK_SWEEP_MS = 48 * 60 * 60 * 1000;

// Posts per tick. The write is two statements however many ids it carries.
export const ARCHIVE_BATCH = 25;
export const PURGE_BATCH = 50;

// The audit actor of changes made by Cron rather than by the owner.
export const SYSTEM_ACTOR = 'system';
