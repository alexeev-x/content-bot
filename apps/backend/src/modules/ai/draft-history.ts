import { AI_DRAFTS_PAGE, type AiDraftChainDto, type AiDraftsPageDto, type AiDraftSummaryDto } from '@alexeev/contracts';
import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../platform/pagination/keyset-cursor';
import { AppError } from '../../shared/app-error';
import { CHAIN_MAX, type DraftHistoryRepository, type DraftRootRow } from './d1-draft-history-repository';

// The studio's history of AI drafts (AI plan P8; SYS-01): the same generations and revisions the bot wrote, so a
// text fixed in the bot shows here with every version and the owner's verdicts.

const iso = (ms: number) => new Date(ms).toISOString();
const usd = (micro: number | null) => (micro === null ? null : micro / 1_000_000);
const cursorSchema = z.tuple([z.number().int().nonnegative(), z.uuid()]);

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

export async function readDrafts(
  history: DraftHistoryRepository,
  cursor: string | undefined
): Promise<AiDraftsPageDto> {
  const after = cursor === undefined ? undefined : decodeKeysetCursor(cursor, cursorSchema);
  if (after === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  const rows = await history.roots({
    after: after === undefined ? null : { createdAt: after[0], id: after[1] },
    limit: AI_DRAFTS_PAGE + 1
  });
  const page = rows.slice(0, AI_DRAFTS_PAGE);
  const last = page.at(-1);
  return {
    items: page.map(summary),
    nextCursor:
      rows.length > AI_DRAFTS_PAGE && last !== undefined ? encodeKeysetCursor([last.createdAt, last.id]) : null
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
