import type { WriterFormat } from './writer-types';

// The AI writer's managed memory (AI plan P7, migration 0079): the owner's explicit rules, and later the analysis
// rules the owner approved. Every state change is conditional, so a repeated or stale tap changes nothing.

export type RuleScope = 'all' | WriterFormat;
export type RuleStatus = 'pending_scope' | 'active' | 'candidate' | 'supported' | 'strong' | 'disabled' | 'deprecated';

export interface RuleRow {
  id: string;
  text: string;
  scope: RuleScope;
  source: 'owner' | 'analysis';
  status: RuleStatus;
  approvedAt: number | null;
  createdAt: number;
}

/**
 * At most this many rules are in use at once: every one fits the prompt and the «/rules» list (review 19.10.2026:
 * a rule beyond a hidden cut would be in use without being followed or listed).
 */
export const RULES_IN_USE_MAX = 15;
/** A rule whose scope was never picked is dropped after a day. */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export interface RulesRepository {
  /** An owner rule waiting for the owner to pick its scope. */
  createOwnerRule(input: { id: string; text: string; now: number }): Promise<void>;
  find(id: string): Promise<RuleRow | null>;
  /** The owner picked the scope: the rule becomes active, once, while fewer than RULES_IN_USE_MAX are in use. */
  activate(input: { id: string; scope: RuleScope; now: number }): Promise<boolean>;
  /** «Отмена» before a scope was picked; false once the rule is active (review 19.10.2026). */
  cancel(input: { id: string; now: number }): Promise<boolean>;
  /** Off for good (owner rule or analysis rule); false when it was not on. */
  disable(input: { id: string; now: number }): Promise<boolean>;
  /** The rules a prompt of `format` gets: active owner rules and approved analysis rules, newest first. */
  forPrompt(format: WriterFormat, limit: number): Promise<RuleRow[]>;
  /** Every rule in use, for «/rules». */
  inUse(limit: number): Promise<RuleRow[]>;
}

const COLUMNS = 'id, text, scope, source, status, approved_at AS approvedAt, created_at AS createdAt';
/** In use: an active owner rule, or an analysis rule the owner approved that the evidence still supports. */
const IN_USE = `(status = 'active' OR (source = 'analysis' AND status IN ('supported', 'strong') AND approved_at IS NOT NULL))`;

export function createD1RulesRepository(db: D1Database): RulesRepository {
  return {
    async createOwnerRule({ id, text, now }) {
      await db.batch([
        db.prepare(`DELETE FROM ai_rules WHERE status = 'pending_scope' AND created_at < ?`).bind(now - PENDING_TTL_MS),
        db
          .prepare(
            `INSERT INTO ai_rules (id, text, scope, source, status, created_at, updated_at)
             VALUES (?1, ?2, 'all', 'owner', 'pending_scope', ?3, ?3)`
          )
          .bind(id, text, now)
      ]);
    },

    async find(id) {
      return db.prepare(`SELECT ${COLUMNS} FROM ai_rules WHERE id = ?`).bind(id).first<RuleRow>();
    },

    async activate({ id, scope, now }) {
      const result = await db
        .prepare(
          `UPDATE ai_rules SET status = 'active', scope = ?2, updated_at = ?3
           WHERE id = ?1 AND source = 'owner' AND status = 'pending_scope'
             AND (SELECT count(*) FROM ai_rules WHERE ${IN_USE}) < ?4`
        )
        .bind(id, scope, now, RULES_IN_USE_MAX)
        .run();
      return result.meta.changes === 1;
    },

    async cancel({ id, now }) {
      const result = await db
        .prepare(
          `UPDATE ai_rules SET status = 'disabled', disabled_at = ?2, updated_at = ?2
           WHERE id = ?1 AND status = 'pending_scope'`
        )
        .bind(id, now)
        .run();
      return result.meta.changes === 1;
    },

    async disable({ id, now }) {
      const result = await db
        .prepare(
          `UPDATE ai_rules SET status = 'disabled', disabled_at = ?2, updated_at = ?2
           WHERE id = ?1 AND status NOT IN ('disabled', 'deprecated')`
        )
        .bind(id, now)
        .run();
      return result.meta.changes === 1;
    },

    async forPrompt(format, limit) {
      const rows = await db
        .prepare(
          `SELECT ${COLUMNS} FROM ai_rules WHERE ${IN_USE} AND scope IN ('all', ?1)
           ORDER BY source = 'owner' DESC, created_at DESC LIMIT ?2`
        )
        .bind(format, Math.min(limit, RULES_IN_USE_MAX))
        .all<RuleRow>();
      return rows.results;
    },

    async inUse(limit) {
      const rows = await db
        .prepare(`SELECT ${COLUMNS} FROM ai_rules WHERE ${IN_USE} ORDER BY created_at DESC LIMIT ?`)
        .bind(Math.min(limit, RULES_IN_USE_MAX))
        .all<RuleRow>();
      return rows.results;
    }
  };
}
