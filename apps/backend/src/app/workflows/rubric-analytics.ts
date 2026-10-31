import { classifyComments } from '../../modules/ai';
import { checkAudienceSetup, purgeAudience, readAudienceStatus } from '../../modules/audience';
import {
  buildRubricWeekBlock,
  learnRubrics,
  scoreRubricPosts,
  summarizeCommentThemes
} from '../../modules/rubric-analytics';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { POOL_RUBRICS } from '../rubric-analytics/pool';
import { schedulerMode } from '../rubric-scheduler/runtime';
import { AppError } from '../../shared/app-error';
import { mskParts } from '../../shared/msk-time';
import type { Container } from '../container';
import { notifyOwnerOfFailure } from '../notifications/failure-notice';

// The channel's audience upkeep, one queue message per step (rubric scheduler stage 2):
// - purge: freezes each post's comment counts at 73 h, then deletes comments older than 10 days and threads older
//   than 14 (owner, 31.10.2026);
// - health: re-checks which channels and groups the bot can hear, and tells the owner once a Moscow day when the
//   channel posted but nothing came back.
// - score (hourly): every rubric post 25.5 h old scored against the channel's usual post, the 72 h numbers later;
// - summary (daily, production only): the comment themes of the scored posts, one AI call at most;
// - week (Monday): the report's «Рубрики» block from the rows scored since the last one;
// - learn (Monday, after the block): rest and hour advice, applied after four weeks unless switched off.
// Before migrations 0118/0121 a step meets «no such table» and stops quietly with one warning.

const DAY_MS = 86_400_000;
/** Comment themes look at posts of the last 10 days (their text is kept that long) and at most this many. */
const THEMES_LOOKBACK_MS = 10 * DAY_MS;
const THEMES_POSTS = 12;
const THEMES_TIMEOUT_MS = 90_000;

export async function runRubricAnalytics(
  container: Container,
  step: 'purge' | 'health' | 'score' | 'summary' | 'week' | 'learn',
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
    if (step === 'score') {
      const result = await scoreRubricPosts({
        sources: container.rubricAnalyticsSources,
        scores: container.rubricScores,
        now: container.clock.now()
      });
      log('done', { scored: result.scored, lateFilled: result.lateFilled, ...result.skipped });
      return;
    }
    if (step === 'week') {
      const sources = container.rubricAnalyticsSources;
      const outcome = await buildRubricWeekBlock({
        scores: container.rubricScores,
        blocks: container.rubricWeekBlocks,
        slots: container.rubricWeekSlots,
        // Last Monday's learning changes (the learn step runs after the block); none before migration 0122.
        rest: async () =>
          (await container.rubricLearning.history('rest', 20).catch(() => []))
            .filter((row) => row.createdAt >= container.clock.now() - 7 * DAY_MS)
            .map((row) => ({ rubric: row.subject, from: row.from, to: row.to, outcome: row.outcome })),
        url: (row) => (sources.channel === null ? null : `https://t.me/${sources.channel}/${row.messageId}`),
        now: container.clock.now()
      });
      log(outcome);
      return;
    }
    if (step === 'learn') {
      const now = container.clock.now();
      // After this Monday's block: the report tells the week's changes from the same scores.
      if ((await container.rubricWeekBlocks.get(mskParts(now).day)) === null) {
        log('waiting');
        return;
      }
      const result = await learnRubrics({
        scores: container.rubricScores,
        learning: container.rubricLearning,
        rests: container.rubricLearnedSettings.rests,
        hours: container.rubricLearnedSettings.hours,
        pool: POOL_RUBRICS,
        newId: container.newId,
        now
      });
      if (typeof result === 'string') log(result);
      else log(result.mode, { rest: result.rest, hour: result.hour, applied: result.applied });
      return;
    }
    if (step === 'summary') {
      await summary(container, requestId, log);
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

async function summary(
  container: Container,
  requestId: string,
  log: (status: string, counts?: Record<string, number>, errorCode?: string) => void
): Promise<void> {
  const now = container.clock.now();
  const sources = container.rubricAnalyticsSources;
  const { timezone } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId
  });
  const result = await summarizeCommentThemes({
    themes: container.rubricThemes,
    candidates: () => sources.themeCandidates(now - THEMES_LOOKBACK_MS, THEMES_POSTS),
    // DEV has no AI (DECISIONS 30.10.2026): only production's live scheduler reads the comments with it.
    aiAllowed: schedulerMode(container.schedulerEnv ?? {}) === 'live',
    classify: (comments) =>
      classifyComments(
        {
          repo: container.aiRepository,
          clock: container.clock,
          timezone,
          newId: container.newId,
          provider: container.aiProvider
        },
        comments,
        AbortSignal.timeout(THEMES_TIMEOUT_MS)
      ).catch((error: unknown) => {
        if (error instanceof AppError && error.code === 'UNAVAILABLE')
          return { answer: null, model: null, errorCode: 'AI_UNAVAILABLE' };
        throw error;
      }),
    now
  });
  log(result.outcome, { posts: result.posts ?? 0 }, result.errorCode);
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
