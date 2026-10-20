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
import { mirrorHeroAssets } from '../modules/hero-assets';
import { sendContentAlerts } from './workflows/send-content-alerts';
import { LESSON_LOOKBACK_MS } from '../modules/ai';
import { LOST_JOB_STATEMENTS, reportLostAiJobs } from './workflows/lost-ai-jobs';
import { raiseScriptPrompts } from './workflows/script-prompts';
import { runAiReviews } from './workflows/run-ai-reviews';

// Per table and per hourly tick; leftovers wait for the next hour.
export const CLEANUP_LIMIT = 100;
// The heartbeat upsert plus slack for the final log line's bookkeeping.
const HEARTBEAT_RESERVE = 3;
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
const DAILY_REPORT_STATEMENTS = 28;
// New videos' scripts, every statement counted: settings, two item lists, the prompts and links reads, at most two
// videos handled (scripts read, the prompt with up to two links, the close: five each), the open prompts and
// their messages read, up to two scripts and one alert batch of up to two — 22 at most.
const SCRIPT_PROMPT_STATEMENTS = 24;
/** A claim and one file (fetch, R2 write, update); more files when more is left. */
const HERO_ASSETS_MIN = 6;
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
  | 'aiScriptLinks'
  | 'newId'
  | 'aiJobs'
  | 'contentSources'
  | 'contentFetch'
  | 'heroAssets'
  | 'heroAssetStorage'
  | 'aiReviews'
  | 'aiReviewVideos'
  | 'aiScriptLinks'
  | 'aiRepository'
  | 'aiProvider'
>;

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
export async function handleScheduled(controller: ScheduledController, container: TickContainer): Promise<void> {
  const { clock, logger } = container;
  const startedAt = clock.now();
  const counts: Record<string, number> = {};
  let failures = 0;
  const raised: RaisedIncident[] = [];
  const delivered: DeliveredPublication[] = [];

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
        errorCode:
          error instanceof DotaWatchError
            ? `${error.code}_${error.sourceKey}`
            : error instanceof Error
              ? error.name
              : 'unknown',
        durationMs: clock.now() - stepStartedAt
      });
    }
  };

  await step('reconcile', async () => {
    const summary = await reconcileExpiredJobs({
      repo: container.dispatchJobs,
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
      reconciledFailed: summary.failed
    };
  });

  if (container.publishing.enabled) {
    await step('dispatch', async () => {
      const summary = await dispatchDueJobs({
        repo: container.dispatchJobs,
        posts: container.postRevisions,
        transport: container.transport,
        clock,
        logger,
        newId: container.newId,
        random: container.random
      });
      if (summary.errors > 0) failures += 1;
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
  if (publicationIdle) {
    await step('dota-watch', async (): Promise<Record<string, number>> => {
      // By the minute: an exact-millisecond check on scheduledTime never matched on DEV
      // (the feeds only ran when the owner pressed «Проверить сейчас»).
      if (minute % 5 === 0 && minute !== 0 && minute !== PURGE_MINUTE) {
        await container.automations.enqueueScheduled({
          id: 'dota-intelligence',
          slot: controller.scheduledTime,
          requestedAt: clock.now(),
          newId: container.newId
        });
      }
      const run = await container.automations.claimNext({ id: 'dota-intelligence', now: clock.now() });
      if (run === null) return {};
      try {
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

  // 7b. content analytics: the owner's Telegram/YouTube/TikTok counters, on idle ticks of minutes ending in 3.
  // The per-source claim keeps it to about once an hour (sooner after a failure); sources that do not fit
  // the tick's remaining subrequests wait for the next such tick.
  if (
    minute % 10 === 3 &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    container.contentSources.collectors.length > 0 &&
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
    container.queryBudget.remaining() >= DAILY_REPORT_STATEMENTS + HEARTBEAT_RESERVE
  ) {
    const { timezone, notifications } = await readPreferences();
    await step('reports', async () => {
      const released = await releaseOverdueReports({
        reports: container.contentDailyReports,
        alerts: container.contentAlerts,
        now: clock.now()
      });
      const weekly = await raiseWeeklyReport({
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
            errorCode: error instanceof Error ? error.name : 'unknown'
          });
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
    container.queryBudget.remaining() >= SCRIPT_PROMPT_STATEMENTS + HEARTBEAT_RESERVE
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
    container.queryBudget.remaining() >= 3 + HEARTBEAT_RESERVE
  ) {
    await step('style-lessons', async () => {
      const waiting = await container.aiStyleLessons.unread(clock.now() - LESSON_LOOKBACK_MS, 1, clock.now());
      if (waiting.length === 0) return { styleLessonsQueued: 0 };
      await container.aiJobs.send({ id: crypto.randomUUID(), kind: 'style_lessons' });
      return { styleLessonsQueued: 1 };
    });
  }

  // 7c'''. AI writer jobs whose Worker died after the claim (review 19.10.2026): the owner is told once, so the
  // task can be sent again. Idle ticks of minutes 4 and 24 (14, 34 and 54 are the video reviews', 44 the style
  // lessons'); the message goes out with the content alerts at minute 8.
  if (
    (minute === 4 || minute === 24) &&
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
    container.contentSources.collectors.length > 0 &&
    container.queryBudget.remaining() >= CONTENT_ALERTS_RESERVE + HEARTBEAT_RESERVE
  ) {
    await step('content-alerts', async () => {
      const { timezone } = await readPreferences();
      const raisedAlerts = await raiseContentAlerts({
        repo: container.contentAlerts,
        clock,
        timezone
      });
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
    container.queryBudget.remaining() >= AI_REVIEW_SCAN_STATEMENTS + HEARTBEAT_RESERVE
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

  // 9. hero media for AI posts: queued files from Valve's CDN into R2 on idle ticks of minutes ending in 1 and 6
  // (their own slots, so other ticks keep their cost). Nothing queued: one indexed read, Valve is not asked.
  const heroStorage = container.heroAssetStorage;
  if (
    heroStorage !== undefined &&
    (counts.due ?? 0) === 0 &&
    raised.length === 0 &&
    (minute % 10 === 1 || minute % 10 === 6) &&
    container.queryBudget.remaining() >= HERO_ASSETS_MIN + HEARTBEAT_RESERVE
  ) {
    await step('hero-assets', async () => {
      const result = await mirrorHeroAssets({
        repo: container.heroAssets,
        storage: heroStorage,
        fetchImpl: container.contentFetch,
        clock,
        budget: container.queryBudget,
        reserve: HEARTBEAT_RESERVE,
        logger
      });
      return {
        heroAssetsStored: result.stored,
        heroAssetsMissing: result.missing,
        heroAssetsFailed: result.failed
      };
    });
  }

  const durationMs = clock.now() - startedAt;
  const status = failures === 0 ? 'ok' : 'error';
  // Not a tick failure when it cannot be written (a deployment before migration 0009): the work above is done.
  try {
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
