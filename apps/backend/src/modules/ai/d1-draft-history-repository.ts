import type { WriterFormat } from './writer-types';

// The studio's history of AI drafts (AI plan P8; SYS-01): a first draft and every version that hangs off it
// (rewrites, fixes, the draft after a facts answer) with their texts and how the owner treated them. Read-only.

/** Versions of one draft read at most; a chat that rewrote more stops here. */
export const CHAIN_MAX = 30;
/** Texts of one chain at most (each up to 8000 characters): the newest ones. */
export const CHAIN_REVISIONS_MAX = 60;
/** Versions counted at most: a parent link is a tree, so this only bounds a runaway chat. */
const COUNT_DEPTH_MAX = 500;
/** The task as the list shows it, in UTF-16 units (the contract's count; SQLite counts code points). */
const TASK_MAX = 300;

export interface DraftRootRow {
  id: string;
  format: WriterFormat;
  source: 'bot' | 'studio';
  task: string;
  createdAt: number;
  versions: number;
  approved: number;
  edited: number;
  costMicroUsd: number | null;
  feedback: number;
}

export interface ChainGenerationRow {
  id: string;
  parentId: string | null;
  kind: 'draft' | 'rewrite';
  status: 'pending' | 'ready' | 'failed';
  result: 'draft' | 'needs_facts' | null;
  question: string | null;
  errorCode: string | null;
  model: string | null;
  costMicroUsd: number | null;
  createdAt: number;
}

export interface ChainRevisionRow {
  id: string;
  generationId: string;
  provenance: 'AI_DRAFT' | 'OWNER_EDITED' | 'OWNER_APPROVED' | 'OWNER_PREAPPROVED';
  text: string;
  editRatio: number | null;
  postId: string | null;
  createdAt: number;
}

export interface ChainFeedbackRow {
  generationId: string;
  kind: string;
  note: string | null;
  createdAt: number;
}

export interface DraftHistoryRepository {
  /** First drafts newest first, after the keyset `after` (created_at, id), at most `limit` (≤ 50), with totals. */
  roots(input: { after: { createdAt: number; id: string } | null; limit: number }): Promise<DraftRootRow[]>;
  /** One first draft's whole chain; null when `id` is not a first draft. */
  chain(id: string): Promise<{
    root: DraftRootRow;
    generations: ChainGenerationRow[];
    revisions: ChainRevisionRow[];
    feedback: ChainFeedbackRow[];
    /** More texts than CHAIN_REVISIONS_MAX: the oldest are left out. */
    revisionsCut: boolean;
  } | null>;
}

/** The chain of each root in `?1`: the root and its descendants down to `depth`. */
const tree = (depth: number) => `WITH RECURSIVE tree(root, id, depth) AS (
    SELECT id, id, 0 FROM ai_generations WHERE parent_generation_id IS NULL AND id IN (SELECT value FROM json_each(?1))
    UNION ALL
    SELECT tree.root, g.id, tree.depth + 1 FROM ai_generations g JOIN tree ON g.parent_generation_id = tree.id
    WHERE tree.depth < ${depth}
  )`;
/** Totals count the whole chain; what is shown stops at CHAIN_MAX, so a longer one says it was cut. */
const COUNTED = tree(COUNT_DEPTH_MAX);
const SHOWN = tree(CHAIN_MAX);

const TOTALS = `SELECT tree.root AS id, count(DISTINCT tree.id) AS versions,
    (SELECT count(*) FROM ai_text_revisions r WHERE r.generation_id IN (SELECT t.id FROM tree t WHERE t.root = tree.root)
       AND r.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED')) AS approved,
    (SELECT count(*) FROM ai_text_revisions r WHERE r.generation_id IN (SELECT t.id FROM tree t WHERE t.root = tree.root)
       AND r.provenance = 'OWNER_EDITED') AS edited,
    (SELECT count(*) FROM ai_feedback f WHERE f.generation_id IN (SELECT t.id FROM tree t WHERE t.root = tree.root))
      AS feedback,
    (SELECT sum(u.cost_micro_usd) FROM ai_generations g JOIN ai_usage u ON u.id = g.usage_id
       WHERE g.id IN (SELECT t.id FROM tree t WHERE t.root = tree.root)) AS costMicroUsd
  FROM tree GROUP BY tree.root`;

type Totals = Pick<DraftRootRow, 'id' | 'versions' | 'approved' | 'edited' | 'feedback' | 'costMicroUsd'>;
type RootBase = Pick<DraftRootRow, 'id' | 'format' | 'source' | 'task' | 'createdAt'>;

const ROOT_COLUMNS = `id, format, source, substr(task, 1, ${TASK_MAX}) AS task, created_at AS createdAt`;

/** At most TASK_MAX UTF-16 units, never cutting a character in two (an emoji is two units). */
function clip(text: string): string {
  let out = '';
  for (const char of text) {
    if (out.length + char.length > TASK_MAX) break;
    out += char;
  }
  return out;
}

const clipped = (root: RootBase): RootBase => ({ ...root, task: clip(root.task) });

function withTotals(roots: readonly RootBase[], totals: readonly Totals[]): DraftRootRow[] {
  const byId = new Map(totals.map((row) => [row.id, row]));
  return roots.map((root) => {
    const total = byId.get(root.id);
    return {
      ...root,
      versions: total?.versions ?? 1,
      approved: total?.approved ?? 0,
      edited: total?.edited ?? 0,
      feedback: total?.feedback ?? 0,
      costMicroUsd: total?.costMicroUsd ?? null
    };
  });
}

export function createD1DraftHistoryRepository(db: D1Database): DraftHistoryRepository {
  const totalsOf = async (ids: readonly string[]) =>
    (await db.prepare(`${COUNTED} ${TOTALS}`).bind(JSON.stringify(ids)).all<Totals>()).results;

  return {
    async roots({ after, limit }) {
      const capped = Math.min(limit, 50);
      // Two statements: an `?1 IS NULL OR …` keyset turns the index search into a scan from the top.
      const statement =
        after === null
          ? db
              .prepare(
                `SELECT ${ROOT_COLUMNS} FROM ai_generations WHERE parent_generation_id IS NULL
                 ORDER BY created_at DESC, id DESC LIMIT ?1`
              )
              .bind(capped)
          : db
              .prepare(
                `SELECT ${ROOT_COLUMNS} FROM ai_generations
                 WHERE parent_generation_id IS NULL AND (created_at < ?1 OR (created_at = ?1 AND id < ?2))
                 ORDER BY created_at DESC, id DESC LIMIT ?3`
              )
              .bind(after.createdAt, after.id, capped);
      const roots = (await statement.all<RootBase>()).results.map(clipped);
      return roots.length === 0 ? [] : withTotals(roots, await totalsOf(roots.map((root) => root.id)));
    },

    async chain(id) {
      const root = await db
        .prepare(`SELECT ${ROOT_COLUMNS} FROM ai_generations WHERE id = ?1 AND parent_generation_id IS NULL`)
        .bind(id)
        .first<RootBase>();
      if (root === null) return null;
      const shown = clipped(root);
      const ids = JSON.stringify([id]);
      const [totals, generations, revisions, feedback] = await db.batch([
        db.prepare(`${COUNTED} ${TOTALS}`).bind(ids),
        db
          .prepare(
            `${SHOWN} SELECT g.id, g.parent_generation_id AS parentId, g.kind, g.status, g.result, g.question,
                    g.error_code AS errorCode, g.model, u.cost_micro_usd AS costMicroUsd, g.created_at AS createdAt
             FROM tree JOIN ai_generations g ON g.id = tree.id LEFT JOIN ai_usage u ON u.id = g.usage_id
             ORDER BY g.created_at, g.id LIMIT ${CHAIN_MAX + 1}`
          )
          .bind(ids),
        db
          .prepare(
            `${SHOWN} SELECT r.id, r.generation_id AS generationId, r.provenance, r.text, r.edit_ratio AS editRatio,
                    r.post_id AS postId, r.created_at AS createdAt
             FROM tree JOIN ai_text_revisions r ON r.generation_id = tree.id
             ORDER BY r.created_at DESC, r.id DESC LIMIT ${CHAIN_REVISIONS_MAX + 1}`
          )
          .bind(ids),
        db
          .prepare(
            `${SHOWN} SELECT f.generation_id AS generationId, f.kind, f.note, f.created_at AS createdAt
             FROM tree JOIN ai_feedback f ON f.generation_id = tree.id ORDER BY f.created_at, f.id LIMIT 50`
          )
          .bind(ids)
      ]);
      const texts = (revisions?.results ?? []) as ChainRevisionRow[];
      return {
        root: withTotals([shown], (totals?.results ?? []) as Totals[])[0] ?? {
          ...shown,
          versions: 1,
          approved: 0,
          edited: 0,
          feedback: 0,
          costMicroUsd: null
        },
        generations: (generations?.results ?? []) as ChainGenerationRow[],
        // The newest texts (the approvals) are kept, back in time order.
        revisions: texts.slice(0, CHAIN_REVISIONS_MAX).reverse(),
        revisionsCut: texts.length > CHAIN_REVISIONS_MAX,
        feedback: (feedback?.results ?? []) as ChainFeedbackRow[]
      };
    }
  };
}
