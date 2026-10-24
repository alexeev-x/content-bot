import { ARCHIVE_BATCH, PURGE_BATCH } from '../domain/archive-policy';
import { ARCHIVE_RETENTION_MS } from '../../../shared/archive-retention';
import type { LifecycleRepository } from './ports';

export interface ArchiveDeps {
  repo: LifecycleRepository;
  now: number;
}

// Cron step: the read finds posts whose publications finished inside the window; the write re-checks
// every condition per post, so a post that got a new publication, was already archived by an overlapping
// tick or was restored in between is left alone. Nothing changes on an idle tick.
export async function archiveSentPosts(
  deps: ArchiveDeps,
  input: { lookbackMs: number }
): Promise<{ archived: number }> {
  const ids = await deps.repo.findArchivable({ since: deps.now - input.lookbackMs, limit: ARCHIVE_BATCH });
  if (ids.length === 0) return { archived: 0 };
  return { archived: await deps.repo.archivePosts({ ids, now: deps.now }) };
}

// Cron step: deletes archived posts whose retention (counted from archivedAt) is over, in a bounded
// batch. A post that is blocked by a send in progress or an unknown result is never selected, and the
// write repeats the check, so the purge cannot delete what a manual delete would refuse.
export async function purgeExpiredArchive(deps: ArchiveDeps): Promise<{ purged: number }> {
  const before = deps.now - ARCHIVE_RETENTION_MS;
  const ids = await deps.repo.findExpired({ before, limit: PURGE_BATCH });
  if (ids.length === 0) return { purged: 0 };
  return { purged: await deps.repo.purgePosts({ ids, before, now: deps.now }) };
}
