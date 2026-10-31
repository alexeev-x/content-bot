import { judge, type Scenario, scenarioFor } from './rehearsal';

// The rehearsal journal's D1 (migration 0123): it reads the scheduler's own slots next to its checks, so it lives in
// app/ like the analytics sources. Written only by the DEV week-long rehearsal.

const DAY_MS = 86_400_000;
const ENLIST_MAX = 40;
const JUDGE_MAX = 60;

export interface RehearsalCheckRow {
  slotId: string;
  rubricKey: string;
  kind: string;
  slotAt: number;
  scenario: Scenario;
  fired: boolean;
  verdict: 'pending' | 'ok' | 'bad' | 'void';
  status: string | null;
  errorCode: string | null;
  note: string | null;
  checkedAt: number | null;
}

export type RehearsalJournal = ReturnType<typeof createRehearsalJournal>;

export function createRehearsalJournal(db: D1Database) {
  return {
    /** Every slot of the last two days without a check gets one, with its staged failure. */
    async enlist(now: number): Promise<number> {
      const [fresh, staged] = await db.batch([
        db
          .prepare(
            `SELECT s.id, s.kind, s.rubric_key, s.slot_at FROM rubric_slots s
              LEFT JOIN rubric_rehearsal_checks c ON c.slot_id = s.id
              WHERE s.slot_at >= ? AND c.slot_id IS NULL AND s.status <> 'superseded'
              ORDER BY s.slot_at LIMIT ?`
          )
          .bind(now - 2 * DAY_MS, ENLIST_MAX),
        db.prepare(`SELECT COUNT(*) AS n FROM rubric_rehearsal_checks WHERE scenario <> 'none'`)
      ]);
      const slots = (fresh?.results ?? []) as { id: string; kind: string; rubric_key: string; slot_at: number }[];
      if (slots.length === 0) return 0;
      let count = ((staged?.results ?? [])[0] as { n: number } | undefined)?.n ?? 0;
      const insert = db.prepare(
        `INSERT OR IGNORE INTO rubric_rehearsal_checks (slot_id, rubric_key, kind, slot_at, scenario, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const statements = slots.map((slot) => {
        const scenario = scenarioFor(slot, count);
        if (scenario !== 'none') count += 1;
        return insert.bind(slot.id, slot.rubric_key, slot.kind, slot.slot_at, scenario, now);
      });
      const results = await db.batch(statements);
      return results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
    },

    async scenarioOf(slotId: string): Promise<{ scenario: Scenario; fired: boolean } | null> {
      const row = await db
        .prepare('SELECT scenario, fired FROM rubric_rehearsal_checks WHERE slot_id = ?')
        .bind(slotId)
        .first<{ scenario: Scenario; fired: number }>();
      return row === null ? null : { scenario: row.scenario, fired: row.fired === 1 };
    },

    /** Marks the staged failure as happened; true for the one caller that got there first. */
    async fire(slotId: string): Promise<boolean> {
      const result = await db
        .prepare('UPDATE rubric_rehearsal_checks SET fired = 1 WHERE slot_id = ? AND fired = 0')
        .bind(slotId)
        .run();
      return (result.meta.changes ?? 0) === 1;
    },

    /** The unfired Telegram failure staged for the slot whose post this is, if any. */
    async telegramFault(postId: string): Promise<{ slotId: string; scenario: Scenario } | null> {
      const row = await db
        .prepare(
          `SELECT c.slot_id, c.scenario FROM rubric_rehearsal_checks c JOIN rubric_slots s ON s.id = c.slot_id
            WHERE c.fired = 0 AND c.scenario IN ('tg_429', 'tg_timeout', 'tg_forbidden') AND s.post_id = ? LIMIT 1`
        )
        .bind(postId)
        .first<{ slot_id: string; scenario: Scenario }>();
      return row === null ? null : { slotId: row.slot_id, scenario: row.scenario };
    },

    /** The open checks whose slot has come to its end (or is stuck) get their verdict. */
    async judgeOpen(now: number): Promise<number> {
      const { results } = await db
        .prepare(
          `SELECT c.slot_id, c.scenario, c.fired, c.kind, c.slot_at, s.status, s.error_code, s.attempt, s.cand_idx,
             json_array_length(s.candidates_json) AS candidates,
             (SELECT count(*) FROM job_attempts ja JOIN jobs j ON j.id = ja.job_id
               WHERE ja.outcome IN ('sent', 'unknown')
                 AND (j.publication_id = s.publication_id
                   OR j.publication_id IN (SELECT value FROM json_each(s.build_json, '$.publications')))) AS sends
            FROM rubric_rehearsal_checks c JOIN rubric_slots s ON s.id = c.slot_id
            WHERE c.verdict = 'pending' ORDER BY c.slot_at LIMIT ?`
        )
        .bind(JUDGE_MAX)
        .all<{
          slot_id: string;
          scenario: Scenario;
          fired: number;
          kind: string;
          slot_at: number;
          status: string;
          error_code: string | null;
          attempt: number;
          cand_idx: number;
          candidates: number;
          sends: number;
        }>();
      const update = db.prepare(
        `UPDATE rubric_rehearsal_checks SET verdict = ?, status = ?, error_code = ?, note = ?, checked_at = ?
          WHERE slot_id = ? AND verdict = 'pending'`
      );
      const statements = results.flatMap((row) => {
        const verdict = judge(
          {
            scenario: row.scenario,
            fired: row.fired === 1,
            kind: row.kind,
            status: row.status,
            errorCode: row.error_code,
            attempt: row.attempt,
            candIdx: row.cand_idx,
            candidates: row.candidates,
            sends: row.sends,
            slotAt: row.slot_at
          },
          now
        );
        return verdict === null
          ? []
          : [update.bind(verdict.verdict, row.status, row.error_code, verdict.note.slice(0, 300), now, row.slot_id)];
      });
      if (statements.length > 0) await db.batch(statements);
      return statements.length;
    },

    async list(from: number, to: number): Promise<RehearsalCheckRow[]> {
      const { results } = await db
        .prepare(
          `SELECT slot_id, rubric_key, kind, slot_at, scenario, fired, verdict, status, error_code, note, checked_at
            FROM rubric_rehearsal_checks WHERE slot_at >= ? AND slot_at < ? ORDER BY slot_at DESC LIMIT 400`
        )
        .bind(from, to)
        .all<{
          slot_id: string;
          rubric_key: string;
          kind: string;
          slot_at: number;
          scenario: Scenario;
          fired: number;
          verdict: RehearsalCheckRow['verdict'];
          status: string | null;
          error_code: string | null;
          note: string | null;
          checked_at: number | null;
        }>();
      return results.map((row) => ({
        slotId: row.slot_id,
        rubricKey: row.rubric_key,
        kind: row.kind,
        slotAt: row.slot_at,
        scenario: row.scenario,
        fired: row.fired === 1,
        verdict: row.verdict,
        status: row.status,
        errorCode: row.error_code,
        note: row.note,
        checkedAt: row.checked_at
      }));
    },

    /** When the test began: its first check (the synthetic events count their days from it). */
    async startedAt(): Promise<number | null> {
      const row = await db
        .prepare('SELECT MIN(created_at) AS at FROM rubric_rehearsal_checks')
        .first<{ at: number | null }>();
      return row?.at ?? null;
    }
  };
}
