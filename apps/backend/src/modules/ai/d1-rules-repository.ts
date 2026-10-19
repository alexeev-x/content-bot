import type { WriterFormat } from './writer-types';

// The AI writer's managed memory (AI plan P7, migration 0079): the owner's explicit rules, and later the analysis
// rules the owner approved. Every state change is conditional, so a repeated or stale tap changes nothing.

export type RuleScope = 'all' | WriterFormat;
export type RuleStatus = 'pending_scope' | 'active' | 'candidate' | 'supported' | 'strong' | 'disabled' | 'deprecated';

/** One video's measured result for one analysis rule (AI plan §6.1 В): one script is one observation. */
export interface RuleEvidence {
  ruleId: string;
  /** `script:<approved revision id>`: the same script on YouTube and TikTok is one video. */
  key: string;
  polarity: 'support' | 'contradict';
  /** `origin` for the videos a rule was found on; the weekly report otherwise. */
  sourceRef: string;
}

export interface RuleRow {
  id: string;
  text: string;
  scope: RuleScope;
  source: 'owner' | 'analysis';
  status: RuleStatus;
  approvedAt: number | null;
  createdAt: number;
  /** Distinct videos for and against it (analysis rules). */
  supports: number;
  contradicts: number;
}

/** At most this many analysis rules are open (candidate, supported or strong) at once. */
export const ANALYSIS_RULES_MAX = 25;

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
  /** Open analysis rules (candidate, supported, strong), oldest first. */
  openAnalysisRules(): Promise<RuleRow[]>;
  /** Analysis rules the owner turned down or the evidence retired, newest first: never proposed again. */
  closedAnalysisRules(limit: number): Promise<RuleRow[]>;
  /** The texts of every turned-down or retired analysis rule (at most 1000): none is ever created again (MEM-07). */
  closedRuleTexts(): Promise<string[]>;
  /** A new candidate, unless ANALYSIS_RULES_MAX are open; false then. */
  createAnalysisRule(input: { id: string; text: string; scope: RuleScope; now: number }): Promise<boolean>;
  /**
   * Stores the evidence (a video already counted for a rule is not counted again), then sets every open analysis
   * rule's status from its distinct videos and takes the approval off a rule that fell out of supported, in one
   * batch. Returns how many evidence rows were new and the approved rules that left use.
   */
  addEvidence(
    evidence: readonly RuleEvidence[],
    now: number
  ): Promise<{ added: number; retired: Pick<RuleRow, 'id' | 'text' | 'scope' | 'status'>[] }>;
  /** The owner said «Да» to a supported analysis rule: in use, while fewer than RULES_IN_USE_MAX are. */
  approve(input: { id: string; now: number }): Promise<boolean>;
}

const COLUMNS = `id, text, scope, source, status, approved_at AS approvedAt, created_at AS createdAt,
  (SELECT count(*) FROM ai_rule_evidence e WHERE e.rule_id = ai_rules.id AND e.polarity = 'support') AS supports,
  (SELECT count(*) FROM ai_rule_evidence e WHERE e.rule_id = ai_rules.id AND e.polarity = 'contradict') AS contradicts`;
const OPEN_ANALYSIS = `source = 'analysis' AND status IN ('candidate', 'supported', 'strong')`;
/**
 * The status from distinct videos (AI plan §6.2): supported after 2 for and more for than against, strong after 3
 * with none against, deprecated once 2 or more are against and they are not fewer. At least one supporting video
 * must be new since the rule was found (`origin` is the set it was fitted to), so a rule never confirms itself.
 * A candidate with nothing new for DECAY_MS retires, so stale guesses free their place.
 */
const DECAY_MS = 56 * 24 * 60 * 60 * 1000;
const RECOUNT = `UPDATE ai_rules SET updated_at = ?1, status = (
    SELECT CASE
      WHEN s >= 3 AND c = 0 AND fresh >= 1 THEN 'strong'
      WHEN s >= 2 AND s > c AND fresh >= 1 THEN 'supported'
      WHEN c >= 2 AND c >= s THEN 'deprecated'
      WHEN max(ai_rules.created_at, last) < ?2 THEN 'deprecated'
      ELSE 'candidate' END
    FROM (SELECT
      count(*) FILTER (WHERE polarity = 'support') AS s,
      count(*) FILTER (WHERE polarity = 'contradict') AS c,
      count(*) FILTER (WHERE polarity = 'support' AND source_ref <> 'origin') AS fresh,
      coalesce(max(created_at), 0) AS last
      FROM ai_rule_evidence WHERE rule_id = ai_rules.id))
  WHERE ${OPEN_ANALYSIS}`;
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

    async openAnalysisRules() {
      const rows = await db
        .prepare(`SELECT ${COLUMNS} FROM ai_rules WHERE ${OPEN_ANALYSIS} ORDER BY created_at LIMIT ?`)
        .bind(ANALYSIS_RULES_MAX)
        .all<RuleRow>();
      return rows.results;
    },

    async closedAnalysisRules(limit) {
      const rows = await db
        .prepare(
          `SELECT ${COLUMNS} FROM ai_rules WHERE source = 'analysis' AND status IN ('disabled', 'deprecated')
           ORDER BY updated_at DESC LIMIT ?`
        )
        .bind(Math.min(limit, ANALYSIS_RULES_MAX))
        .all<RuleRow>();
      return rows.results;
    },

    async closedRuleTexts() {
      const rows = await db
        .prepare(
          `SELECT text FROM ai_rules WHERE source = 'analysis' AND status IN ('disabled', 'deprecated')
           ORDER BY updated_at DESC LIMIT 1000`
        )
        .all<{ text: string }>();
      return rows.results.map((row) => row.text);
    },

    async createAnalysisRule({ id, text, scope, now }) {
      const result = await db
        .prepare(
          `INSERT INTO ai_rules (id, text, scope, source, status, created_at, updated_at)
           SELECT ?1, ?2, ?3, 'analysis', 'candidate', ?4, ?4
           WHERE (SELECT count(*) FROM ai_rules WHERE ${OPEN_ANALYSIS}) < ?5`
        )
        .bind(id, text, scope, now, ANALYSIS_RULES_MAX)
        .run();
      return result.meta.changes === 1;
    },

    async addEvidence(evidence, now) {
      const [inserted, , cleared] = await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO ai_rule_evidence (rule_id, evidence_key, polarity, source_ref, created_at)
             SELECT json_extract(value, '$.ruleId'), json_extract(value, '$.key'), json_extract(value, '$.polarity'),
                    json_extract(value, '$.sourceRef'), ?2
             FROM json_each(?1)
             WHERE json_extract(value, '$.ruleId') IN (SELECT id FROM ai_rules WHERE ${OPEN_ANALYSIS})`
          )
          .bind(JSON.stringify(evidence), now),
        db.prepare(RECOUNT).bind(now, now - DECAY_MS),
        // A new «Учитывать» is asked if it climbs back (review 19.10.2026: an approval is for what the owner saw).
        db
          .prepare(
            `UPDATE ai_rules SET approved_at = NULL, updated_at = ?1
             WHERE source = 'analysis' AND approved_at IS NOT NULL AND status IN ('candidate', 'deprecated')
             RETURNING id, text, scope, status`
          )
          .bind(now)
      ]);
      return {
        added: inserted?.meta.changes ?? 0,
        retired: (cleared?.results ?? []) as Pick<RuleRow, 'id' | 'text' | 'scope' | 'status'>[]
      };
    },

    async approve({ id, now }) {
      const result = await db
        .prepare(
          `UPDATE ai_rules SET approved_at = ?2, updated_at = ?2
           WHERE id = ?1 AND source = 'analysis' AND status IN ('supported', 'strong') AND approved_at IS NULL
             AND (SELECT count(*) FROM ai_rules WHERE ${IN_USE}) < ?3`
        )
        .bind(id, now, RULES_IN_USE_MAX)
        .run();
      return result.meta.changes === 1;
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
