import { z } from 'zod';

// Small machine-written facts (migration 0009, table system_state): not owner settings, so no
// revisions or API. Every value is validated on read: a row this code cannot read counts as absent.
export interface CronRun {
  /** UTC epoch milliseconds when the tick ended. */
  at: number;
  status: 'ok' | 'error';
  durationMs: number;
}

export interface SystemStateStore {
  /** One upsert: the last Cron tick. Written by every tick, so the owner can see that Cron is alive. */
  recordCronRun(run: CronRun): Promise<void>;
  readCronRun(): Promise<CronRun | null>;
  /** Writes only when the origin differs from the stored one, so a repeated /start changes nothing. */
  rememberAppOrigin(origin: string, now: number): Promise<void>;
  readAppOrigin(): Promise<string | null>;
  /** The colour of the last patch cover (owner, 23.10.2026: never the same colour twice in a row). */
  rememberCoverTheme(theme: string, now: number): Promise<void>;
  readCoverTheme(): Promise<string | null>;
  /**
   * One conditional upsert: true only when no notice with this key went out within `windowMs` (a repeat of the same
   * failure stays quiet), so a failure that repeats every minute is one message, not sixty.
   */
  claimFailureNotice(key: string, now: number, windowMs: number): Promise<boolean>;
  /** The horoscope's fortune-tellers since the round began (owner, 28.10.2026: nobody twice before everyone). */
  readHoroscopeTellers(): Promise<number[]>;
  rememberHoroscopeTellers(heroIds: number[], now: number): Promise<void>;
  /** One atomic step of a named counter (a rubric's turn of looks); the first call gives 0. */
  nextTurn(name: string, now: number): Promise<number>;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CRON_KEY = 'cron_last_run';
const ORIGIN_KEY = 'app_origin';
const COVER_THEME_KEY = 'patch_cover_theme';
const TELLERS_KEY = 'horoscope_tellers';
// Hero ids are three digits at most; 200 of them stay well inside the column's 1024 characters.
const tellersSchema = z.object({ ids: z.array(z.number().int().min(1).max(999)).max(200) });
const coverThemeSchema = z.object({ theme: z.string().min(1).max(40) });

const cronValueSchema = z.object({
  status: z.enum(['ok', 'error']),
  durationMs: z.number().int().nonnegative()
});
// The webhook only ever hands over `new URL(...).origin`, but a stored value reaches a button, so it is
// checked again: https, or plain http for a local run.
const originSchema = z.object({
  origin: z
    .string()
    .max(256)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.origin === value && (url.protocol === 'https:' || LOOPBACK_HOSTS.has(url.hostname));
      } catch {
        return false;
      }
    })
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createD1SystemState(db: D1Database): SystemStateStore {
  const read = (key: string) =>
    db.prepare('SELECT value, updated_at FROM system_state WHERE key = ?1').bind(key).first<{
      value: string;
      updated_at: number;
    }>();

  return {
    async recordCronRun(run) {
      await db
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(CRON_KEY, JSON.stringify({ status: run.status, durationMs: run.durationMs }), run.at)
        .run();
    },

    async readCronRun() {
      const row = await read(CRON_KEY);
      if (row === null) return null;
      const value = cronValueSchema.safeParse(parseJson(row.value));
      return value.success ? { at: row.updated_at, ...value.data } : null;
    },

    async rememberAppOrigin(origin, now) {
      await db
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
           WHERE system_state.value IS NOT excluded.value`
        )
        .bind(ORIGIN_KEY, JSON.stringify({ origin }), now)
        .run();
    },

    async readAppOrigin() {
      const row = await read(ORIGIN_KEY);
      if (row === null) return null;
      const value = originSchema.safeParse(parseJson(row.value));
      return value.success ? value.data.origin : null;
    },

    async rememberCoverTheme(theme, now) {
      await db
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(COVER_THEME_KEY, JSON.stringify({ theme }), now)
        .run();
    },

    async claimFailureNotice(key, now, windowMs) {
      const claim = await db
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES (?1, '{}', ?2)
           ON CONFLICT (key) DO UPDATE SET updated_at = excluded.updated_at
           WHERE system_state.updated_at <= ?2 - ?3`
        )
        .bind(key, now, windowMs)
        .run();
      if (claim.meta.changes !== 1) return false;
      // Old keys go with the next claim, so the table never grows past one day of distinct failures.
      await db
        .prepare(`DELETE FROM system_state WHERE key LIKE 'failure_notice:%' AND updated_at < ?1`)
        .bind(now - 24 * 60 * 60 * 1000)
        .run();
      return true;
    },

    async readHoroscopeTellers() {
      const row = await read(TELLERS_KEY);
      if (row === null) return [];
      const value = tellersSchema.safeParse(parseJson(row.value));
      return value.success ? value.data.ids : [];
    },

    async rememberHoroscopeTellers(heroIds, now) {
      const ids = tellersSchema.shape.ids.parse(heroIds.slice(-200));
      await db
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(TELLERS_KEY, JSON.stringify({ ids }), now)
        .run();
    },

    async nextTurn(name, now) {
      // One statement: the row is created at 0 or moved on by one, and the new value comes back.
      const row = await db
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES (?1, '{"n":0}', ?2)
           ON CONFLICT (key) DO UPDATE SET value = json_set(system_state.value, '$.n', coalesce(json_extract(system_state.value, '$.n'), -1) + 1), updated_at = excluded.updated_at
           RETURNING json_extract(value, '$.n') AS n`
        )
        .bind(`turn:${name}`.slice(0, 32), now)
        .first<{ n: number }>();
      return Math.max(0, Math.trunc(row?.n ?? 0));
    },

    async readCoverTheme() {
      const row = await read(COVER_THEME_KEY);
      if (row === null) return null;
      const value = coverThemeSchema.safeParse(parseJson(row.value));
      return value.success ? value.data.theme : null;
    }
  };
}
