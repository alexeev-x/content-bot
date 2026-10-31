import type { PublicationStatus } from '@alexeev/contracts';
import { projectPublicationStatus } from '../domain/status-projection';
import type { PublicationOutcomeRow, PublicationOutcomesRepository } from './ports';

// The rubric scheduler's view of what publishing did with its posts. The status is the same projection the owner sees
// in «Публикации» (docs/backend/publishing.md §5), so the two never disagree.

export interface PublicationOutcome {
  publicationId: string;
  postId: string;
  status: PublicationStatus;
  externalMessageIds: string[];
  externalPollId: string | null;
  scheduledAt: number;
  lastErrorCode: string | null;
  /** When a sent, failed or cancelled publication finished; null while it is live. */
  finishedAt: number | null;
}

const FINAL: readonly PublicationStatus[] = ['sent', 'failed', 'cancelled'];

function toOutcome(row: PublicationOutcomeRow, now: number): PublicationOutcome {
  const status = projectPublicationStatus(row.job, now);
  return {
    publicationId: row.publicationId,
    postId: row.postId,
    status,
    externalMessageIds: row.externalMessageIds,
    externalPollId: row.externalPollId,
    scheduledAt: row.scheduledAt,
    lastErrorCode: row.lastErrorCode,
    finishedAt: FINAL.includes(status) ? row.jobUpdatedAt : null
  };
}

/** Up to 20 publications by id; ids that do not exist are left out. */
export async function readPublicationOutcomes(
  deps: { repo: PublicationOutcomesRepository; now: number },
  ids: readonly string[]
): Promise<PublicationOutcome[]> {
  return (await deps.repo.outcomes(ids)).map((row) => toOutcome(row, deps.now));
}

/** The newest publication of a post to a channel (the scheduler never creates a second one for it). */
export async function findPublicationByPost(
  deps: { repo: PublicationOutcomesRepository; now: number },
  postId: string,
  destinationId: string
): Promise<PublicationOutcome | null> {
  const row = await deps.repo.latestForPost(postId, destinationId);
  return row === null ? null : toOutcome(row, deps.now);
}

/** Publications scheduled since a time, newest first, at most 200: the daily caps count them. */
export async function listRecentPublications(
  deps: { repo: PublicationOutcomesRepository; now: number },
  since: number
): Promise<
  {
    at: number;
    status: PublicationStatus;
    postKind: 'text' | 'poll';
    hasMedia: boolean;
    postId: string;
    destinationId: string;
    actor: string | null;
    seriesPosition: number | null;
  }[]
> {
  return (await deps.repo.recent(since)).map((row) => ({
    at: row.scheduledAt,
    status: projectPublicationStatus(row.job, deps.now),
    postKind: row.postKind,
    hasMedia: row.hasMedia,
    postId: row.postId,
    destinationId: row.destinationId,
    actor: row.actor,
    seriesPosition: row.seriesPosition
  }));
}
