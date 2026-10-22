import { hotfixWorthPost } from '../../modules/ai';
import { type DotaDraftSource, fetchSteamAnnouncement, isHotfixTitle } from '../../modules/dota';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { Container } from '../container';

// A Steam «Dota 2 Update - <date>» gets a post only when the AI finds something a player cares about (owner,
// 22.10.2026); otherwise it stays a mark in the studio, and the owner's chat hears nothing about it.

const CHECK_TIMEOUT_MS = 60_000;

/**
 * True when Cron's hotfix is not worth a post: the event's job is finished without a draft. The owner's own request
 * is always written; a check that cannot answer (AI off, a failure) lets the writer go on as for any news.
 */
export async function skipDullHotfix(
  container: Container,
  job: { id: string; externalId: string; automatic?: boolean },
  source: DotaDraftSource,
  requestId: string,
  onError: (error: unknown) => void,
  fetchAnnouncement: typeof fetchSteamAnnouncement = fetchSteamAnnouncement
): Promise<boolean> {
  if (job.automatic !== true || !isHotfixTitle(source.title)) return false;
  try {
    const text = (await fetchAnnouncement({ externalId: source.externalId, publishedAt: source.publishedAt }))?.text;
    if (text === undefined || text === null) return false;
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const verdict = await hotfixWorthPost(
      {
        repo: container.aiRepository,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider
      },
      { text, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }
    );
    if (verdict === null || verdict.worth) return false;
    container.logger.info({ component: 'sources', operation: 'hotfix_check', requestId, status: 'skipped' });
    await container.dotaRepository.finishAiDraft({ externalId: source.externalId, jobId: job.id });
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
