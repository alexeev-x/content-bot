// The rests and slot hours the learning may change (migration 0122): conditional writes, so the owner's own value
// or a change made meanwhile always wins, and the hard bounds hold even if the advice were wrong.

const REST_MIN = 7;
const REST_MAX = 60;
const EARLIEST = 8 * 60;
const LATEST = 22 * 60 + 30;
const DEFAULT_MINUTES = { day: 12 * 60 + 30, evening: 19 * 60 } as const;

type Outcome = 'applied' | 'conflict' | 'manual' | 'out_of_range';

export function createD1LearnedSettings(db: D1Database) {
  return {
    rests: {
      async read() {
        const { results } = await db
          .prepare('SELECT rubric_key, rest_days, rest_source FROM rubric_settings')
          .all<{ rubric_key: string; rest_days: number; rest_source: 'default' | 'manual' | 'learned' }>();
        return results.map((row) => ({ rubric: row.rubric_key, restDays: row.rest_days, source: row.rest_source }));
      },
      async apply(rubric: string, from: number, to: number, now: number): Promise<Outcome> {
        if (!Number.isInteger(to) || to < REST_MIN || to > REST_MAX) return 'out_of_range';
        const result = await db
          .prepare(
            `UPDATE rubric_settings SET rest_days = ?, rest_source = 'learned', revision = revision + 1, updated_at = ?
              WHERE rubric_key = ? AND rest_days = ? AND rest_source <> 'manual'`
          )
          .bind(to, now, rubric, from)
          .run();
        if ((result.meta.changes ?? 0) === 1) return 'applied';
        const row = await db
          .prepare('SELECT rest_source FROM rubric_settings WHERE rubric_key = ?')
          .bind(rubric)
          .first<{ rest_source: string }>();
        return row?.rest_source === 'manual' ? 'manual' : 'conflict';
      }
    },
    hours: {
      async readSlots() {
        const { results } = await db
          .prepare('SELECT grp, part, minute, source, changed_at FROM rubric_hour_slots')
          .all<{
            grp: string;
            part: 'day' | 'evening';
            minute: number;
            source: 'learned' | 'manual';
            changed_at: number;
          }>();
        return results.map((row) => ({
          group: row.grp,
          part: row.part,
          minute: row.minute,
          source: row.source,
          changedAt: row.changed_at
        }));
      },
      async apply(group: string, part: 'day' | 'evening', from: number, to: number, now: number): Promise<Outcome> {
        if (!Number.isInteger(to) || to < EARLIEST || to > LATEST) return 'out_of_range';
        const result = await db
          .prepare(
            `INSERT INTO rubric_hour_slots (grp, part, minute, default_minute, source, changed_at)
             SELECT ?1, ?2, ?4, ?5, 'learned', ?6 WHERE ?3 = ?5 OR ?1 NOT IN ('wd', 'we')
             ON CONFLICT (grp, part) DO UPDATE SET minute = excluded.minute, changed_at = excluded.changed_at
               WHERE rubric_hour_slots.minute = ?3 AND rubric_hour_slots.source = 'learned'`
          )
          .bind(group, part, from, to, DEFAULT_MINUTES[part], now)
          .run();
        if ((result.meta.changes ?? 0) === 1) return 'applied';
        const row = await db
          .prepare('SELECT source FROM rubric_hour_slots WHERE grp = ? AND part = ?')
          .bind(group, part)
          .first<{ source: string }>();
        return row?.source === 'manual' ? 'manual' : 'conflict';
      }
    }
  };
}

/** The learned slot starts for the plan: `{ wd: { day: 780 } }`. */
export async function readHourSlots(
  db: D1Database
): Promise<Record<string, Partial<Record<'day' | 'evening', number>>>> {
  const { results } = await db
    .prepare('SELECT grp, part, minute FROM rubric_hour_slots')
    .all<{ grp: string; part: 'day' | 'evening'; minute: number }>();
  const out: Record<string, Partial<Record<'day' | 'evening', number>>> = {};
  for (const row of results) out[row.grp] = { ...out[row.grp], [row.part]: row.minute };
  return out;
}
