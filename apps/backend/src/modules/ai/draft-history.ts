import {
  AI_DRAFTS_PAGE,
  AI_DRAFTS_SCAN,
  type AiDraftChainDto,
  type AiDraftsPageDto,
  type AiDraftsQuery,
  type AiDraftSummaryDto
} from '@alexeev/contracts';
import { AppError } from '../../shared/app-error';
import { CHAIN_MAX, type DraftHistoryRepository, type DraftRootRow } from './d1-draft-history-repository';

// The studio's history of AI drafts (AI plan P8; SYS-01): the same generations and revisions the bot wrote, so a
// text fixed in the bot shows here with every version and the owner's verdicts.

const iso = (ms: number) => new Date(ms).toISOString();
const usd = (micro: number | null) => (micro === null ? null : micro / 1_000_000);

function summary(row: DraftRootRow): AiDraftSummaryDto {
  return {
    id: row.id,
    format: row.format,
    source: row.source,
    task: row.task,
    createdAt: iso(row.createdAt),
    versions: Math.max(1, row.versions),
    approved: row.approved > 0,
    edited: row.edited > 0,
    feedbackCount: row.feedback,
    costUsd: usd(row.costMicroUsd)
  };
}

const OUTCOMES: Record<NonNullable<AiDraftsQuery['outcome']>, (row: DraftRootRow) => boolean> = {
  approved: (row) => row.approved > 0,
  edited: (row) => row.approved > 0 && row.edited > 0,
  open: (row) => row.approved === 0,
  feedback: (row) => row.feedback > 0
};
const SORTS: Record<AiDraftsQuery['sort'], (row: DraftRootRow) => number> = {
  date: (row) => row.createdAt,
  cost: (row) => row.costMicroUsd ?? -1,
  versions: (row) => row.versions
};

/** The drafts table (owner, 20.10.2026): a page of the bot's drafts by default, searched, filtered and sorted. */
export async function readDrafts(history: DraftHistoryRepository, query: AiDraftsQuery): Promise<AiDraftsPageDto> {
  const rows = await history.roots({
    source: query.source === 'all' ? null : query.source,
    format: query.format ?? null,
    limit: AI_DRAFTS_SCAN
  });
  const needle = query.q?.toLocaleLowerCase('ru-RU') ?? '';
  const outcome = query.outcome === undefined ? null : OUTCOMES[query.outcome];
  const key = SORTS[query.sort];
  const direction = query.dir === 'asc' ? 1 : -1;
  const matched = rows
    .filter(
      (row) => (needle === '' || row.task.toLocaleLowerCase('ru-RU').includes(needle)) && (outcome?.(row) ?? true)
    )
    // Ties keep the newest first, so a page never reshuffles between requests.
    .sort((a, b) => (key(a) - key(b)) * direction || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const start = (query.page - 1) * AI_DRAFTS_PAGE;
  return {
    items: matched.slice(start, start + AI_DRAFTS_PAGE).map(summary),
    page: query.page,
    totalCount: matched.length,
    capped: rows.length >= AI_DRAFTS_SCAN
  };
}

export async function readDraftChain(history: DraftHistoryRepository, id: string): Promise<AiDraftChainDto> {
  const chain = await history.chain(id);
  if (chain === null) throw new AppError('NOT_FOUND', 'Draft not found');
  const shown = chain.generations.slice(0, CHAIN_MAX + 1);
  return {
    draft: summary(chain.root),
    versions: shown.map((generation) => ({
      id: generation.id,
      parentId: generation.parentId,
      kind: generation.kind,
      status: generation.status,
      result: generation.result,
      question: generation.question,
      errorCode: generation.errorCode,
      model: generation.model,
      costUsd: usd(generation.costMicroUsd),
      createdAt: iso(generation.createdAt),
      texts: chain.revisions
        .filter((revision) => revision.generationId === generation.id)
        .map((revision) => ({
          id: revision.id,
          provenance: revision.provenance,
          text: revision.text,
          editRatio: revision.editRatio,
          postId: revision.postId,
          createdAt: iso(revision.createdAt)
        })),
      feedback: chain.feedback
        .filter((row) => row.generationId === generation.id)
        .map((row) => ({ kind: row.kind, note: row.note, createdAt: iso(row.createdAt) }))
    })),
    truncated: chain.root.versions > shown.length || chain.revisionsCut
  };
}
