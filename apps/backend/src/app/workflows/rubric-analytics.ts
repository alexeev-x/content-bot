import { checkAudienceSetup, purgeAudience, readAudienceStatus } from '../../modules/audience';
import { AppError } from '../../shared/app-error';
import { mskParts } from '../../shared/msk-time';
import type { Container } from '../container';
import { notifyOwnerOfFailure } from '../notifications/failure-notice';

// The channel's audience upkeep, one queue message per step (rubric scheduler stage 2):
// - purge: freezes each post's comment counts at 73 h, then deletes comments older than 10 days and threads older
//   than 14 (owner, 31.10.2026);
// - health: re-checks which channels and groups the bot can hear, and tells the owner once a Moscow day when the
//   channel posted but nothing came back.
// Before migration 0118 a step meets «no such table» and stops quietly with one warning.

const DAY_MS = 86_400_000;

export async function runRubricAnalytics(
  container: Container,
  step: 'purge' | 'health',
  requestId: string
): Promise<void> {
  const startedAt = container.clock.now();
  const log = (status: string, counts: Record<string, number> = {}, errorCode?: string) =>
    container.logger.info({
      component: 'rubric-analytics',
      operation: step,
      requestId,
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
      durationMs: container.clock.now() - startedAt,
      ...counts
    });
  try {
    if (step === 'purge') {
      log('done', await purgeAudience({ repo: container.audience, now: container.clock.now() }));
      return;
    }
    await health(container, requestId);
    log('done');
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) {
      log('skipped', {}, 'AUDIENCE_MIGRATION_PENDING');
      return;
    }
    throw error;
  }
}

async function health(container: Container, requestId: string): Promise<void> {
  const now = container.clock.now();
  const identity = await container.botIdentity.load();
  if (identity !== null) {
    await checkAudienceSetup({
      repo: container.audience,
      targets: container.audienceTargets,
      telegram: container.audienceTelegram,
      bot: { id: identity.id, readsAllGroupMessages: identity.can_read_all_group_messages },
      now
    });
  }
  const sent = (await container.publicationOutcomes.recent(now - DAY_MS)).some((row) => row.job.status === 'succeeded');
  const status = await readAudienceStatus(
    { repo: container.audience, now, hasKey: container.audienceHashKeySet },
    { postedRecently: sent }
  );
  if (status.state !== 'silent') return;
  if (!(await container.systemState.claimStepWindow(`ra:silent:${mskParts(now).day}`, now, DAY_MS))) return;
  await notifyOwnerOfFailure(
    {
      messenger: container.ownerMessenger,
      ownerChatId: container.ownerChatId,
      state: container.systemState,
      clock: container.clock,
      logger: container.logger
    },
    {
      where: 'Аудитория канала',
      requestId,
      error: new AppError(
        'UNAVAILABLE',
        'Бот не получает реакции и комментарии из канала: проверьте, что он админ канала и группы обсуждения, и нажмите «Подключить бота».',
        { reason: 'AUDIENCE_SILENT' }
      )
    }
  );
}
