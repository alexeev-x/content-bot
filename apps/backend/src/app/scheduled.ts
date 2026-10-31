import { schedulerMode } from './rubric-scheduler/runtime';
import { runRubricSchedulerTick } from './rubric-scheduler/tick';
import { AppError } from '../shared/app-error';
import type { BackgroundJob } from '@alexeev/contracts';
import {
  ARCHIVE_LOOKBACK_SWEEP_MS,
  ARCHIVE_LOOKBACK_TICK_MS,
  archiveSentPosts,
  purgeExpiredArchive
} from '../modules/lifecycle';
import {
  type DeliveredPublication,
  dispatchDueJobs,
  type RaisedIncident,
  reconcileExpiredJobs
} from '../modules/publishing';
import type { Container } from './container';
import { ALBUM_SETTLE_MS, CRON_IMPORT_BUDGET_MS, CRON_IMPORT_POSTS } from './bot/media-import-worker';
import { createMediaImportRunner } from './bot/media-import-runner';
import { ACTION_TTL_MS, createPublishActions } from './bot/publish-actions';
import { alertOwnerOfIncidents } from './notifications/alert-owner-of-incidents';
import { getOwnerOperationsSettings } from '../modules/settings';
import { processDotaUpdates } from './workflows/process-dota-updates';
import { DotaWatchError } from '../modules/dota';
import { processPostMediaCleanup } from '../modules/content';
import { sendDotaWatchlistAlerts } from './workflows/process-dota-watchlist-alerts';
import { notifyOwnerOfDeliveries } from './notifications/sent-notice';
import {
  collectContentAnalytics,
  raiseContentAlerts,
  raiseDailyReport,
  raiseWeeklyReport,
  releaseOverdueReports,
  SOURCE_D1_STATEMENTS
} from '../modules/content-analytics';
import { sendContentAlerts } from './workflows/send-content-alerts';
import { LESSON_LOOKBACK_MS } from '../modules/ai';
import { LOST_JOB_STATEMENTS, reportLostAiJobs } from './workflows/lost-ai-jobs';
import { raiseScriptPrompts } from './workflows/script-prompts';
import { runAiReviews } from './workflows/run-ai-reviews';
import { DOTA_APP_ID } from './workflows/steam-watch';
import type { LabCron } from './lab';
import { notifyOwnerOfFailure } from './notifications/failure-notice';
import { describeError, errorLogFields } from '../platform/error-detail';
import { heroStatsAlerts } from './workflows/hero-stats';
import { snapshotInstanceId } from './workflows/hero-stats-snapshot';

// Per table and per hourly tick; leftovers wait for the next hour.
export const CLEANUP_LIMIT = 100;
// The heartbeat upsert plus slack for the final log line's bookkeeping.
const HEARTBEAT_RESERVE = 3;
/** The audience upkeep (docs/scheduler/area-backend-analytics.md §13): purge hourly at :37, health at 12:12 MSK. */
const AUDIENCE_PURGE_MINUTE = 37;
const AUDIENCE_HEALTH_MINUTE = 12;
const AUDIENCE_HEALTH_HOUR_UTC = 9;
const AUDIENCE_WINDOW_MS = 50 * 60_000;
/** The heartbeat's minutes: those ending in 2 or 7. */
const HEARTBEAT_EVERY_MINUTES = 5;
const HEARTBEAT_MINUTE = 2;
/** The hero statistics collector: two runs every five minutes, on minutes ending in 1 or 6. */
const HERO_MATCHES_MINUTE = 1;
const HERO_MATCHES_RUNS = 2;
/** The nightly statistics start from this UTC hour (after the night's matches, before the owner's morning). */
const SNAPSHOT_HOUR_UTC = 3;
// The cheapest single source (Telegram: 5 preview pages + its D1 statements). All three sources need about
// 45 of the 50 subrequests, more than an idle tick has left, so the step collects what fits and defers the
// rest to the next minute-3 tick ten minutes later (each source keeps its own hourly schedule).
const CONTENT_SOURCE_MIN = 5 + SOURCE_D1_STATEMENTS;
// Raising (settings, at most eight reads, NEW_ALERTS_PER_TICK inserts) and sending two
// alerts (stuck sweep, pending read, app origin, then claim, Telegram call and finish each).
const CONTENT_ALERTS_RESERVE = 24;
// The daily report, every statement counted (a batch counts each): settings, the overdue release (its list and,
// rarely, a read, an alert and an update), the dedup read, scoring (due list, readings, one update), the accuracy
// read, the table (two item lists, a two-statement batch, checkpoints, six format lists), the forecasts insert
// and the report row; the week's report instead takes its own reads (items, checkpoints, followers, goals, the
// format lists, the row), plus its dedup read on Monday; both read the channel's top videos (two statements, the
// references of the review, owner 20.10.2026). Its own minute-2 slot, so the content alerts of minute
// 8 keep their budget and send it six minutes later.
const DAILY_REPORT_STATEMENTS = 36;
// New videos' scripts, every statement counted: settings, two item lists, the prompts and links reads, at most two
// videos handled (scripts read, the prompt with up to two links, the close: five each), the open prompts and
// their messages read, up to two scripts and one alert batch of up to two — 22 at most.
const SCRIPT_PROMPT_STATEMENTS = 24;
/** R2 deletes up to 1000 keys in one call. */
const HERO_FILES_PER_TICK = 1000;
// The tick of this UTC minute purges expired archived posts (cleanup runs at minute 0).
const PURGE_MINUTE = 30;
// AI reviews of 72 h old videos: D1 statements of one review (claim, reading the video and its curve, the budget
// gate with its spend reads, the usage row, a possible alert claim, the result) and of the step's own scan.
const AI_REVIEW_STATEMENTS = 30;
const AI_REVIEW_SCAN_STATEMENTS = 6;
// Ticks of these UTC minutes (14, 34, 54): their own slots, so no other step moves.
const AI_REVIEW_MINUTE_MOD = 20;
const AI_REVIEW_MINUTE = 14;
// Ended sessions stay this long for diagnosis before they are deleted.
const SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

type TickContainer = Pick<
  Container,
  | 'clock'
  | 'logger'
  | 'publishing'
  | 'settings'
  | 'dispatchJobs'
  | 'lifecycle'
  | 'postRevisions'
  | 'postMedia'
  | 'mediaStorage'
  | 'transport'
  | 'sessions'
  | 'housekeeping'
  | 'ownerMessenger'
  | 'ownerChatId'
  | 'systemState'
  | 'random'
  | 'newId'
  | 'dotaWatcher'
  | 'dotaRepository'
  | 'sourceEvents'
  | 'heroStats'
  | 'statsMatches'
  | 'statsSnapshot'
  | 'automations'
  | 'dotaWatchlists'
  | 'posts'
  | 'idempotency'
  | 'postSummaries'
  | 'mediaImports'
  | 'queryBudget'
  | 'botToken'
  | 'publications'
  | 'destinations'
  | 'postSource'
  | 'publishActions'
  | 'contentAnalytics'
  | 'contentAlerts'
  | 'contentGoals'
  | 'aiWriter'
  | 'aiStyleLessons'
  | 'contentForecasts'
  | 'contentDailyReports'
  | 'contentVideoNames'
  | 'aiScriptLinks'
  | 'newId'
  | 'aiJobs'
  | 'contentSources'
  | 'contentFetch'
  | 'purgeHeroFiles'
  | 'aiReviews'
  | 'aiReviewVideos'
  | 'aiScriptLinks'
  | 'aiRepository'
  | 'aiProvider'
  | 'rubricSlots'
  | 'rubricSchedulerSettings'
  | 'schedulerEnv'
  | 'latestPatchAt'
  | 'publicationOutcomes'
  | 'lifecycle'
> &
  // The game-files watch is off without its token, so a tick may run without it.
  Partial<Pick<Container, 'gameFilesRepo' | 'steamApps'>>;

// Cron entry point, once a minute (docs/BACKEND_ARCHITECTURE.md §5). Ticks may overlap or repeat:
// every write below is a conditional claim or a guarded batch, so a second tick changes nothing
// the first one already decided.
//   1. reconcile: leases that ran out (always, even with the kill switch off)
//   2. dispatch: a small batch of due jobs (only when publishing is enabled)
//   3. archive: posts whose publications just finished (a short window; the hourly tick looks back further)
//   4. purge: archived posts past their retention, only on the tick of minute 30 and only when that tick
//      dispatched nothing, so a busy tick never spends its budget on housekeeping
//   5. cleanup: only on the tick of minute 0 of the hour, taken from the scheduled time, so no
//      state is kept between invocations
//   6. alert: the owner hears about the incidents steps 1 and 2 wrote, after their state is stored
//      (best effort, nothing is retried; a tick without incidents spends nothing here)
//   7. dota watch: on five-minute UTC boundaries after publication work, only when that tick was idle and
//      not on the hourly housekeeping ticks; bounded work leaves the publishing D1 budget untouched
//   7d. ai reviews: videos that turned 72 hours old, idle ticks of minutes 14, 34, 54 (one step, two videos at most)
//   8a. bot media import: leftovers of the files the owner sent to the bot (idle ticks only, last, on what the tick has left)
//   8. heartbeat: one upsert that records this run for the owner's /status
export async function handleScheduled(
  controller: ScheduledController,
  container: TickContainer,
  /** «Тестирование»'s switches for the background jobs; null outside a `__LAB__` build, where every job runs. */
  lab: LabCron | null = null
): Promise<void> {
  const { clock, logger } = container;
  // DEV (owner, 28.10.2026: «дев максимально отключить кроны… к базе»): with the master switch off a tick reads the
  // switch and stops — no publishing, reconcile, cleanup or heartbeat, so DEV writes nothing to D1 on its own.
  if (
    lab !== null &&
    !(await lab.cronOn(
      async () =>
        (await getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' })).background
    ))
  ) {
    logger.info({ component: 'scheduled', operation: 'tick', status: 'lab_off' });
    return;
  }
  const startedAt = clock.now();
  const counts: Record<string, number> = {};
  let failures = 0;
  const raised: RaisedIncident[] = [];
  const delivered: DeliveredPublication[] = [];

  // The owner hears of a failed step in his chat, once per window (owner, 28.10.2026).
  const tell = (where: string, error: unknown) =>
    notifyOwnerOfFailure(
      {
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        state: container.systemState,
        clock,
        logger
      },
      { where: `Cron: ${where}`, error }
    );

  const step = async (operation: string, run: () => Promise<Record<string, number>>): Promise<void> => {
    const stepStartedAt = clock.now();
    try {
      Object.assign(counts, await run());
    } catch (error) {
      failures += 1;
      logger.error({
        component: 'scheduled',
        operation,
        status: 'error',
        ...errorLogFields(error),
        ...(error instanceof DotaWatchError ? { errorCode: `${error.code}_${error.sourceKey}` } : {}),
        durationMs: clock.now() - stepStartedAt
      });
      await tell(operation, error);
    }
  };

  // One repository for the whole tick: it remembers a database that is behind migration 0117.
  const dispatchJobs = container.dispatchJobs;

  await step('reconcile', async () => {
    const summary = await reconcileExpiredJobs({
      repo: dispatchJobs,
      clock,
      logger,
      newId: container.newId,
      random: container.random
    });
    raised.push(...summary.raised);
    return {
      expired: summary.expired,
      reconciledRetry: summary.retryWait,
      reconciledUnknown: summary.unknown,
      reconciledFailed: summary.failed,
      reconciledLate: summary.late
    };
  });

  if (container.publishing.enabled) {
    await step('dispatch', async () => {
      const summary = await dispatchDueJobs({
        repo: dispatchJobs,
        posts: container.postRevisions,
        transport: container.transport,
        clock,
        logger,
        newId: container.newId,
        random: container.random
      });
      if (summary.errors > 0) {
        failures += 1;
        await tell('dispatch', summary.firstError);
      }
      raised.push(...summary.raised);
      delivered.push(...summary.delivered);
      return {
        due: summary.due,
        lost: summary.lost,
        sent: summary.sent,
        retryWait: summary.retryWait,
        failed: summary.failed,
        unknown: summary.unknown,
        notSent: summary.notSent
      };
    });
  } else if (container.publishing.blockedBy !== undefined) {
    // Switched on but unable to send: say so on every tick instead of idling silently.
    logger.warn({
      component: 'scheduled',
      operation: 'dispatch',
      status: 'blocked',
      errorCode: 'BOT_TOKEN_MISSING'
    });
  }

  const minute = new Date(controller.scheduledTime).getUTCMinutes();
  // Production behind migration 0117 (the owner applies it before the release): once a day, at 09:00 Moscow time.
  if (dispatchJobs.schemaBehind() && new Date(controller.scheduledTime).getUTCHours() === 6 && minute === 0) {
    await tell(
      'publishing',
      new AppError(
        'UNAVAILABLE',
        'Продакшн-база без миграции 0117: примените её (Actions → D1 migrations). Публикации идут без защиты от опоздания.',
        { reason: 'SCHEMA_BEHIND' }
      )
    );
  }
  const mediaStorage = container.mediaStorage;

  await step('archive', async () => {
    const { archived } = await archiveSentPosts(
      { repo: container.lifecycle, now: clock.now() },
      { lookbackMs: minute === 0 ? ARCHIVE_LOOKBACK_SWEEP_MS : ARCHIVE_LOOKBACK_TICK_MS }
    );
    return { archived };
  });

  if (minute === PURGE_MINUTE && (counts.due ?? 0) === 0) {
    await step('purge', async () => {
      const { purged } = await purgeExpiredArchive({ repo: container.lifecycle, now: clock.now() });
      return { purgedPosts: purged };
    });
  }

  // Deletion cascades leave only private object keys in a durable queue. R2 failures are retried
  // on hourly idle ticks; reads stop resolving detached media immediately.
  if (minute === 0 && (counts.due ?? 0) === 0 && mediaStorage !== undefined) {
    await step('media-cleanup', async () => {
      const result = await processPostMediaCleanup(
        { repo: container.postMedia, storage: mediaStorage },
        5,
        clock.now()
      );
      if (result.failed > 0) failures += 1;
      return { mediaObjectsCleaned: result.cleaned, mediaObjectCleanupFailed: result.failed };
    });
  }

  if (minute === 0) {
    await step('cleanup', async () => {
      const now = clock.now();
      const limit = CLEANUP_LIMIT;
      const platform = await container.housekeeping.purgeExpired({ now, limit });
      const identity = await container.sessions.purgeEnded({ now, limit, graceMs: SESSION_GRACE_MS });
      const idle = failures === 0 && (counts.expired ?? 0) === 0 && (counts.due ?? 0) === 0 && raised.length === 0;
      const operational = idle
        ? await container.housekeeping.purgeOperational({ now, limit })
        : { jobAttempts: 0, resolvedIncidents: 0, auditRows: 0 };
      const botPublishActions = idle ? await container.publishActions.purgeOlderThan(now - ACTION_TTL_MS, limit) : 0;
      const automationRuns = idle ? await container.automations.purgeHistory(now, limit) : 0;
      return {
        purgedIdempotencyKeys: platform.idempotencyKeys,
        purgedRateLimits: platform.rateLimits,
        purgedBotPublishActions: botPublishActions,
        purgedSignIns: identity.signIns,
        purgedSessions: identity.sessions,
        purgedJobAttempts: operational.jobAttempts,
        purgedResolvedIncidents: operational.resolvedIncidents,
        purgedAuditRows: operational.auditRows,
        purgedAutomationRuns: automationRuns
      };
    });
  }

  // Read at most once per tick and shared by the incident alerts and the «Опубликовано» notices.
  let appOrigin: Promise<string | null> | undefined;
  let preferences: ReturnType<typeof getOwnerOperationsSettings> | undefined;
  const readAppOrigin = () => (appOrigin ??= container.systemState.readAppOrigin());
  const readPreferences = () =>
    (preferences ??= getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' }));
  // Only «Тестирование» can switch a background job off (app/lab/lab-cron.ts).
  const backgroundOn = async (job: BackgroundJob) =>
    lab === null || lab.backgroundOn(job, async () => (await readPreferences()).background);

  const alerts = await alertOwnerOfIncidents({
    repo: container.dispatchJobs,
    messenger: container.ownerMessenger,
    ownerChatId: container.ownerChatId,
    readAppOrigin,
    readPreferences,
    clock,
    logger
  });
  Object.assign(counts, { alertsSent: alerts.sent, alertsFailed: alerts.failed });

  const notices = await notifyOwnerOfDeliveries(
    {
      messenger: container.ownerMessenger,
      ownerChatId: container.ownerChatId,
      readAppOrigin,
      readPreferences,
      logger
    },
    delivered
  );
  Object.assign(counts, { sentNotices: notices.sent, sentNoticesFailed: notices.failed });

  // Run after the publication pipeline and its alerts: automation work never delays dispatch or
  // changes publication state. Expired automation leases are visible as unknown and never retried.
  await step('automation-reconcile', async () => ({
    automationRunsUnknown: await container.automations.markExpiredUnknown(clock.now())
  }));
  const publicationIdle =
    failures === 0 && (counts.expired ?? 0) === 0 && (counts.due ?? 0) === 0 && raised.length === 0;
  // The five-minute slot is queued whatever the tick is doing (review 24.10.2026: a busy tick lost it, and the next
  // chance was five minutes later); the first idle tick runs it. By the minute: an exact-millisecond check on
  // scheduledTime never matched on DEV (the feeds only ran when the owner pressed «Проверить сейчас»).
  // Minutes 0 and 30 keep their whole budget for the housekeeping: their slot is queued and run a minute later.
  if (
    ((minute % 5 === 0 && minute !== 0 && minute !== PURGE_MINUTE) || minute === 1 || minute === PURGE_MINUTE + 1) &&
    (await backgroundOn('sources')) &&
    // Two statements (the insert and its guard); a tick that spent its budget leaves the slot to the next one.
    container.queryBudget.remaining() >= 2 + HEARTBEAT_RESERVE
  ) {
    await step('dota-enqueue', async () => {
      await container.automations.enqueueScheduled({
        id: 'dota-intelligence',
        slot: controller.scheduledTime,
        requestedAt: clock.now(),
        newId: container.newId
      });
      return {};
    });
  }
  if (publicationIdle && minute !== 0 && minute !== PURGE_MINUTE && (await backgroundOn('sources'))) {
    await step('dota-watch', async (): Promise<Record<string, number>> => {
      const run = await container.automations.claimNext({ id: 'dota-intelligence', now: clock.now() });
      if (run === null) return {};
      try {
        // The queue's watches first and together (review 24.10.2026): the early signals never wait for the feeds, and a
        // feed that throws no longer costs them their slot. A refused send is only logged: the next run sends again.
        const ownerChat = Number(container.ownerChatId);
        if (container.ownerChatId !== null && Number.isSafeInteger(ownerChat)) {
          const watches: { kind: 'treasure_watch' | 'steam_watch' | 'game_files_watch'; component: string }[] = [
            { kind: 'treasure_watch', component: 'treasure_watch' },
            // Steam's product info of Dota's apps, the early signal of an update (owner, 24.10.2026); needs no key.
            { kind: 'steam_watch', component: 'steam_watch' },
            // Without its token the game-files source is off and costs nothing.
            ...(container.gameFilesRepo != null ? [{ kind: 'game_files_watch' as const, component: 'game_files' }] : [])
          ];
          await Promise.all(
            watches.map(({ kind, component }) =>
              container.aiJobs.send({ id: container.newId(), kind, chatId: ownerChat }).catch((error: unknown) =>
                logger.warn({
                  component,
                  operation: 'enqueue',
                  errorCode: error instanceof Error ? error.name : 'unknown'
                })
              )
            )
          );
        }
        const dotaWatcher = container.dotaWatcher;
        const publishActions = createPublishActions(container, {
          actor: container.ownerChatId ?? 'system',
          requestId: 'scheduled',
          timezone: async () =>
            (await getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' })).timezone
        });
        const summary = await processDotaUpdates({
          sync: dotaWatcher.sync,
          ...(dotaWatcher.inspectPatch === undefined ? {} : { inspectPatch: dotaWatcher.inspectPatch }),
          repo: container.dotaRepository,
          posts: container.posts,
          idempotency: container.idempotency,
          actor: container.ownerChatId ?? 'system',
          now: () => clock.now(),
          newId: container.newId,
          messenger: container.ownerMessenger,
          ownerChatId: container.ownerChatId,
          readAppOrigin: () => container.systemState.readAppOrigin(),
          readNotificationPreferences: async () =>
            (await getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' }))
              .notifications,
          watchedKeys: () => container.sourceEvents.watchedKeys(),
          publishButtons: (post) => publishActions.buttons(post),
          enqueueAiJob: (job) => container.aiJobs.send(job),
          budget: container.queryBudget,
          logger
        });
        if (summary.sourceFailures > 0) failures += 1;
        const notifications = (
          await getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' })
        ).notifications;
        const watchMatches = await container.dotaWatchlists.processMatches({
          now: clock.now(),
          newId: container.newId,
          notificationsEnabled: notifications.dotaWatchlistAlerts
        });
        const watchAlerts = await sendDotaWatchlistAlerts({
          repo: container.dotaWatchlists,
          messenger: container.ownerMessenger,
          ownerChatId: container.ownerChatId,
          now: () => clock.now(),
          logger,
          appOrigin: await container.systemState.readAppOrigin()
        });
        const runStatus =
          summary.sourceFailures > 0 || watchAlerts.failed > 0
            ? 'failed'
            : watchAlerts.unknown > 0
              ? 'unknown'
              : 'succeeded';
        await container.automations.finish({
          runId: run.id,
          now: clock.now(),
          status: runStatus,
          outputCount: summary.itemsInserted + summary.draftsCreated + watchMatches.matched + watchAlerts.sent,
          ...(summary.sourceFailures > 0
            ? { errorCode: 'DOTA_SOURCE_FAILURE' }
            : watchAlerts.failed > 0
              ? { errorCode: 'DOTA_WATCH_ALERT_FAILED' }
              : watchAlerts.unknown > 0
                ? { errorCode: 'DOTA_WATCH_ALERT_UNKNOWN' }
                : {})
        });
        if (summary.sourceFailures > 0) failures += 1;
        return {
          dotaFeedsFetched: summary.feedsFetched,
          dotaItemsInserted: summary.itemsInserted,
          dotaDraftsCreated: summary.draftsCreated,
          dotaDraftAlertsSent: summary.draftAlertsSent,
          dotaSourceAlertsSent: summary.sourceAlertsSent,
          dotaSourceFailures: summary.sourceFailures,
          dotaWatchMatches: watchMatches.matched,
          dotaWatchAlertsSent: watchAlerts.sent,
          dotaWatchAlertsFailed: watchAlerts.failed,
          dotaWatchAlertsUnknown: watchAlerts.unknown,
          dotaWatchAlertsDisabled: watchMatches.disabled,
          dotaWatchAlertsRecoveredUnknown: watchMatches.unknown
        };
      } catch (error) {
        await container.automations.finish({
          runId: run.id,
          now: clock.now(),
          status: 'failed',
          outputCount: 0,
          errorCode: error instanceof DotaWatchError ? `${error.code}_${error.sourceKey}` : 'AUTOMATION_RUN_FAILED'
        });
        throw error;
      }
    });
  }

  // 7a'. For an hour after a new Dota build (steam-watch.ts), the game files are read every idle minute, not every five:
  // the find goes out as soon as the tracker has the build. One indexed read; minutes 0 and 30 keep their budget.
  const steamApps = container.steamApps;
  if (
    publicationIdle &&
    container.gameFilesRepo != null &&
    (await backgroundOn('gameFiles')) &&
    steamApps !== undefined &&
    container.ownerChatId !== null &&
    minute % 5 !== 0 &&
    container.queryBudget.remaining() >= 1 + HEARTBEAT_RESERVE
  ) {
    const ownerChat = Number(container.ownerChatId);
    await step('game-files-due', async (): Promise<Record<string, number>> => {
      if (!Number.isSafeInteger(ownerChat) || !(await steamApps.filesDue(DOTA_APP_ID, clock.now()))) return {};
      await container.aiJobs.send({ id: container.newId(), kind: 'game_files_watch', chatId: ownerChat });
      return { gameFilesQueued: 1 };
    });
  }

  // 7a. the hero statistics base (owner, 29.10.2026; `app/workflows/hero-stats.ts`): only where its database is bound
  // (local runs and production; DEV never runs it) and STRATZ is reachable; a local run also obeys «Фоновые задачи».
  // Every five minutes two collector runs, each in its own invocation; once a night (from 03:00 UTC) the snapshot
  // Workflow; once an hour the collector's alerts.
  const heroStats = container.heroStats;
  if (
    heroStats !== null &&
    container.statsMatches !== null &&
    container.ownerChatId !== null &&
    minute % 5 === HERO_MATCHES_MINUTE &&
    (await backgroundOn('heroMatches')) &&
    container.queryBudget.remaining() >= 1 + HEARTBEAT_RESERVE
  ) {
    const ownerChat = Number(container.ownerChatId);
    await step('hero-stats', async (): Promise<Record<string, number>> => {
      if (!Number.isSafeInteger(ownerChat)) return {};
      const now = clock.now();
      const counts: Record<string, number> = {};
      if (publicationIdle) {
        for (let run = 0; run < HERO_MATCHES_RUNS; run += 1)
          await container.aiJobs.send({ id: container.newId(), kind: 'hero_matches', chatId: ownerChat });
        counts.heroStatsQueued = HERO_MATCHES_RUNS;
      }
      const day = Math.floor(now / 86_400_000);
      const snapshot = container.statsSnapshot;
      if (
        snapshot !== null &&
        new Date(now).getUTCHours() >= SNAPSHOT_HOUR_UTC &&
        (await heroStats.stateValue('snapshot_day')) < day
      ) {
        // The date is the instance id: a second tick that gets here first is refused by it. The night counts as
        // started only once its instance exists, so a failed create is tried again on the next tick.
        const id = snapshotInstanceId(now);
        let started = false;
        try {
          await snapshot.create({ id, params: {} });
          started = true;
          counts.heroStatsSnapshot = 1;
        } catch (error) {
          started = await snapshot.get(id).then(
            () => true,
            () => false
          );
          logger.info({
            component: 'hero_stats',
            operation: 'snapshot',
            status: started ? 'exists' : 'failed',
            errorCode: describeError(error)
          });
        }
        if (started) await heroStats.setState('snapshot_day', day);
      }
      if (minute < 5)
        counts.heroStatsAlerts = await container.contentAlerts.insert(await heroStatsAlerts(heroStats, now), now);
      return counts;
    });
  }

  // 7b. content analytics: the owner's Telegram/YouTube/TikTok counters, on idle ticks of minutes ending in 3.
  // The per-source claim keeps it to about once an hour (sooner after a failure); sources that do not fit
  // the tick's remaining subrequests wait for the next such tick.
  if (
    minute % 10 === 3 &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    container.contentSources.collectors.length > 0 &&
    (await backgroundOn('contentAnalytics')) &&
    container.queryBudget.remaining() >= CONTENT_SOURCE_MIN + HEARTBEAT_RESERVE
  ) {
    await step('content-analytics', async () => {
      const result = await collectContentAnalytics({
        repo: container.contentAnalytics,
        sources: container.contentSources,
        clock,
        logger,
        requestId: 'scheduled',
        budget: container.queryBudget,
        reserve: HEARTBEAT_RESERVE
      });
      return { contentCollected: result.collected, contentFailed: result.failed, contentDeferred: result.deferred };
    });
  }

  // 7c'. the analytics reports (AI plan P6). On idle minute-2 ticks: reports still waiting for their AI review
  // after 30 minutes go out with the numbers alone; on Monday from 10:00 the week's report is stored once (always,
  // like the digest it replaced); otherwise, when the owner switched it on, the day's report from its hour. A
  // stored report's review is queued and the review job raises the content alert; step 7c sends it at minute 8.
  // One report per tick keeps the tick's statements bounded.
  if (
    minute % 10 === 2 &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    container.queryBudget.remaining() >= DAILY_REPORT_STATEMENTS + HEARTBEAT_RESERVE &&
    (await backgroundOn('reports'))
  ) {
    const { timezone, notifications } = await readPreferences();
    await step('reports', async () => {
      const released = await releaseOverdueReports({
        reports: container.contentDailyReports,
        alerts: container.contentAlerts,
        names: container.contentVideoNames,
        now: clock.now()
      });
      // The Monday report is the owner's switch too (25.10.2026).
      const weekly = !notifications.weeklyReport
        ? { attempted: false, reportId: null }
        : await raiseWeeklyReport({
            analytics: container.contentAnalytics,
            alerts: container.contentAlerts,
            goals: container.contentGoals,
            reports: container.contentDailyReports,
            clock,
            timezone
          });
      // A weekly attempt (even one that lost its claim to an overlapping run) takes this tick's statements.
      const daily =
        !weekly.attempted && notifications.dailyReport
          ? await raiseDailyReport({
              analytics: container.contentAnalytics,
              alerts: container.contentAlerts,
              forecasts: container.contentForecasts,
              reports: container.contentDailyReports,
              clock,
              timezone,
              hour: notifications.dailyReportHour
            })
          : { reportId: null };
      const reportId = weekly.reportId ?? daily.reportId;
      let queued = 0;
      if (reportId !== null) {
        try {
          await container.aiJobs.send({ id: crypto.randomUUID(), kind: 'daily_review', reportId });
          queued = 1;
        } catch (error) {
          // Not queued: the report waits and goes out with the numbers alone after the deadline.
          logger.error({
            component: 'scheduled',
            operation: 'report_review.enqueue',
            ...errorLogFields(error)
          });
          await tell('report_review.enqueue', error);
        }
      }
      return {
        weeklyReportRaised: weekly.reportId === null ? 0 : 1,
        dailyReportRaised: daily.reportId === null ? 0 : 1,
        dailyReviewQueued: queued,
        dailyReportReleased: released
      };
    });
  }

  // 7c''. each new video's approved script (owner, 19.10.2026): a confident match is linked and reported, any
  // other is asked once; the message goes out with the content alerts. Idle minute-9 ticks.
  if (
    minute % 10 === 9 &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    container.contentSources.collectors.length > 0 &&
    container.queryBudget.remaining() >= SCRIPT_PROMPT_STATEMENTS + HEARTBEAT_RESERVE &&
    (await backgroundOn('scriptPrompts')) &&
    (await readPreferences()).notifications.scriptPrompts
  ) {
    await step('script-prompts', async () => {
      const { timezone } = await readPreferences();
      const prompts = await raiseScriptPrompts({
        analytics: container.contentAnalytics,
        alerts: container.contentAlerts,
        links: container.aiScriptLinks,
        clock,
        newId: container.newId,
        timezone
      });
      return { scriptPromptsRaised: prompts };
    });
  }

  // 7c''''. the owner's new edits and remarks (AI plan P7c): when any wait, one job on AI_JOBS reads them into
  // style lessons. Idle minute-44 ticks, so the writer learns within the hour; three statements.
  if (
    minute === 44 &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    container.queryBudget.remaining() >= 3 + HEARTBEAT_RESERVE &&
    (await backgroundOn('aiLearning')) &&
    (await readPreferences()).notifications.aiLearning
  ) {
    await step('style-lessons', async () => {
      const waiting = await container.aiStyleLessons.unread(clock.now() - LESSON_LOOKBACK_MS, 1, clock.now());
      if (waiting.length === 0) return { styleLessonsQueued: 0 };
      await container.aiJobs.send({ id: crypto.randomUUID(), kind: 'style_lessons' });
      return { styleLessonsQueued: 1 };
    });
  }

  // 7c'''. Queue jobs whose Worker died after the claim (review 19.10.2026; publishing jobs too since 24.10.2026): the
  // owner is told once. Idle ticks of minutes ending in 8, just before the content alerts that send it.
  if (
    minute % 10 === 8 &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    container.queryBudget.remaining() >= LOST_JOB_STATEMENTS + HEARTBEAT_RESERVE
  ) {
    await step('lost-ai-jobs', async () => ({
      lostAiJobsReported: await reportLostAiJobs({
        writer: container.aiWriter,
        alerts: container.contentAlerts,
        now: clock.now()
      })
    }));
  }

  // 7c. content alerts: five minutes after collection, on idle ticks. Raising is idempotent (the alert id
  // is its dedup key); each alert is sent once and an unconfirmed send stays `unknown`.
  if (
    minute % 10 === 8 &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    container.queryBudget.remaining() >= CONTENT_ALERTS_RESERVE + HEARTBEAT_RESERVE &&
    (await backgroundOn('contentAlerts')) &&
    (await readPreferences()).notifications.contentAlerts
  ) {
    await step('content-alerts', async () => {
      const { timezone } = await readPreferences();
      // Raised from the counters only when some are collected; the alerts the rest of the app raised (a lost job, a
      // source that stopped) are sent either way (review 24.10.2026: they waited for an analytics source).
      const raisedAlerts =
        container.contentSources.collectors.length > 0
          ? await raiseContentAlerts({ repo: container.contentAlerts, clock, timezone })
          : { raised: 0 };
      const sent = await sendContentAlerts({
        repo: container.contentAlerts,
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        appOrigin: await readAppOrigin(),
        now: () => clock.now(),
        charge: (count) => container.queryBudget.charge(count),
        logger
      });
      return {
        contentAlertsRaised: raisedAlerts.raised,
        contentAlertsSent: sent.sent,
        contentAlertsFailed: sent.failed,
        contentAlertsUnknown: sent.unknown
      };
    });
  }

  // 10. AI reviews of videos that became 72 hours old, on idle ticks of minutes 14, 34 and 54: at most two videos
  // per tick, only on what the tick has left. Facts and the same-format observation need no model; the cheap
  // model is asked only for a review nothing limits (settings, budget), once per video.
  if (
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    minute % AI_REVIEW_MINUTE_MOD === AI_REVIEW_MINUTE &&
    container.queryBudget.remaining() >= AI_REVIEW_SCAN_STATEMENTS + HEARTBEAT_RESERVE &&
    (await backgroundOn('aiReviews')) &&
    (await readPreferences()).notifications.aiReviews
  ) {
    await step('ai-reviews', async () => {
      const result = await runAiReviews({
        review: {
          reviews: container.aiReviews,
          source: container.aiReviewVideos,
          links: container.aiScriptLinks,
          repo: container.aiRepository,
          provider: container.aiProvider,
          clock,
          timezone: async () => (await readPreferences()).timezone,
          newId: container.newId,
          afford: () => container.queryBudget.remaining() >= AI_REVIEW_STATEMENTS + HEARTBEAT_RESERVE
        },
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        readAppOrigin,
        charge: (count) => container.queryBudget.charge(count),
        logger
      });
      return {
        aiReviewsQueued: result.enqueued,
        aiReviewsReopened: result.reopened,
        aiReviewsReady: result.ready,
        aiReviewsLimited: result.limited,
        aiReviewsRetry: result.retry,
        aiReviewsLost: result.lost
      };
    });
  }

  // 7z. the channel's audience upkeep (rubric scheduler stage 2): at two fixed minutes one window claim and one queue
  // message; never part of the publication work and never feeding `failures` here (the queue step reports its own).
  const audienceStep: 'purge' | 'health' | null =
    minute === AUDIENCE_PURGE_MINUTE
      ? 'purge'
      : minute === AUDIENCE_HEALTH_MINUTE &&
          new Date(controller.scheduledTime).getUTCHours() === AUDIENCE_HEALTH_HOUR_UTC
        ? 'health'
        : null;
  if (audienceStep !== null && container.queryBudget.remaining() >= 2 + HEARTBEAT_RESERVE) {
    await step(`audience-${audienceStep}`, async (): Promise<Record<string, number>> => {
      if (!(await container.systemState.claimStepWindow(`ra:${audienceStep}`, clock.now(), AUDIENCE_WINDOW_MS)))
        return {};
      await container.aiJobs.send({ id: container.newId(), kind: 'rubric_analytics', step: audienceStep });
      return { audienceQueued: 1 };
    });
  }

  // 7y. the rubric scheduler (stage 4): its own locks, plan, builds, releases and read-backs; a failure is reported
  // like any step and never stops the publication work, which already ran.
  // Only where it runs at all: a forecast-only Worker spends nothing here.
  if (
    schedulerMode(container.schedulerEnv ?? {}) !== 'unavailable' &&
    container.queryBudget.remaining() >= 12 + HEARTBEAT_RESERVE
  ) {
    await step('rubric-scheduler', () => runRubricSchedulerTick(container, () => backgroundOn('rubricScheduler')));
  }

  // Last before the heartbeat: the import spends only what the tick has left (its budget counts every
  // earlier step) and keeps HEARTBEAT_RESERVE free, so dota-watch or the heartbeat is never cut off by the
  // Free plan's 50-subrequest limit. After the owner's alerts, so a slow download never delays them. Files the owner sent to the bot that the webhook's own run left behind (an expired lease, a paused retry).
  // Bounded by posts and time; only on ticks that dispatched nothing, and then one indexed read.
  if (container.botToken && (counts.due ?? 0) === 0 && raised.length === 0) {
    const token = container.botToken;
    await step('bot-media-import', async () => {
      const runner = createMediaImportRunner(container, {
        token,
        requestId: 'scheduled',
        readAppOrigin: () => container.systemState.readAppOrigin(),
        reserve: HEARTBEAT_RESERVE
      });
      return { botMediaImports: await runner.runDue(CRON_IMPORT_BUDGET_MS, CRON_IMPORT_POSTS, ALBUM_SETTLE_MS) };
    });
  }

  // 9. The removed hero files (owner, 24.10.2026: «с бд удали тоже чтобы место не трогалось»): idle ticks of minutes
  // ending in 1 and 6 delete up to a thousand of them from R2, two R2 calls and no D1; once none is left, one list.
  const purgeHeroFiles = container.purgeHeroFiles;
  if (
    purgeHeroFiles !== undefined &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    (minute % 10 === 1 || minute % 10 === 6)
  ) {
    await step('hero-files-purge', async () => ({ heroFilesDeleted: await purgeHeroFiles(HERO_FILES_PER_TICK) }));
  }

  const durationMs = clock.now() - startedAt;
  const status = failures === 0 ? 'ok' : 'error';
  // Not a tick failure when it cannot be written (a deployment before migration 0009): the work above is done.
  // Every fifth minute, or at once on a failure (28.10.2026: one upsert a minute was 1 440 D1 rows written a day);
  // the owner's /status calls a run older than seven minutes stale.
  try {
    if (status !== 'ok' || minute % HEARTBEAT_EVERY_MINUTES === HEARTBEAT_MINUTE)
      await container.systemState.recordCronRun({ at: clock.now(), status, durationMs });
  } catch (error) {
    logger.warn({
      component: 'scheduled',
      operation: 'heartbeat',
      status: 'error',
      errorCode: error instanceof Error ? error.name : 'unknown'
    });
  }

  logger.info({
    component: 'scheduled',
    operation: 'tick',
    status,
    cron: controller.cron,
    at: controller.scheduledTime,
    durationMs,
    counts: { publishingEnabled: container.publishing.enabled ? 1 : 0, ...counts }
  });

  // The failure is already logged; throwing marks the Cron invocation as failed in the dashboard.
  if (failures > 0) throw new Error('SCHEDULED_TICK_FAILED');
}
