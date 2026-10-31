import { prepareAnswer } from '../workflows/rubric-first-guess';
import { listRecentPublications } from '../../modules/publishing';
import { deletePost } from '../../modules/lifecycle';
import {
  BUILD_LEASE_MS,
  type ChannelPost,
  exitOf,
  type LiveStatus,
  planSlots,
  scheduleOf,
  type SlotRow
} from '../../modules/rubric-scheduler';
import { INNER_RULES_READY, RUBRIC_META, type RubricKey, type RubricMeta } from '../../modules/rubrics';
import { browserCapMs, browserUsedToday } from './browser-budget';
import { addMskDays, fromMsk, mskParts, mskWeekday } from '../../shared/msk-time';
import type { Container } from '../container';
import { rubricDescriptors } from '../rubric-catalog';
import { RUBRIC_ACTOR } from '../workflows/rubric-actor';
import { projectSlot } from '../workflows/rubric-project';
import { releaseSlot } from '../workflows/rubric-release';
import { failCandidate } from '../workflows/rubric-build';
import { type LabSwitches, schedulerState } from './locks';
import { planCapabilities, rehearsalPace } from './runtime';
import { notifySchedulerFailure } from '../workflows/rubric-notices';
import { readEvents } from './event-sources';
import { closePoll } from '../workflows/rubric-poll-close';

// One scheduler tick (every Cron minute, after the publication work; area-backend-core §8): the locks first, then the
// plan when it is due, then the due slots — at most two builds, two releases and four read-backs a tick, every move a
// conditional transition, so overlapping ticks never build or release a slot twice.

const PLAN_EVERY_MS = 30 * 60_000;
const DUE_PER_TICK = 8;
const BUILDS_PER_TICK = 2;
const RELEASES_PER_TICK = 2;
const PROJECTIONS_PER_TICK = 4;
const DAY_MS = 86_400_000;
const LOOKBACK_MS = 7 * DAY_MS;
const PURGE_BATCH = 200;
const PURGE_ROUNDS = 5;

/** Up to five batches of one purge, stopping at the first empty one (as audience/application/retention.ts). */
async function purgeInRounds(purge: (limit: number) => Promise<number>): Promise<number> {
  let total = 0;
  for (let round = 0; round < PURGE_ROUNDS; round += 1) {
    const removed = await purge(PURGE_BATCH);
    total += removed;
    if (removed === 0) break;
  }
  return total;
}

/** The first Monday after `day` (MSK): the horoscope's rhythm starts there when the switch goes on (§13). */
function nextMonday(day: string): string {
  const weekday = mskWeekday(fromMsk(day, 12 * 60));
  return addMskDays(day, ((8 - weekday) % 7) + (weekday === 1 ? 7 : 0));
}

/** The week-long test's first day: its first check, or now before there is one. */
async function rehearsalStart(container: Pick<Container, 'rubricRehearsal'>, now: number): Promise<number> {
  return (await container.rubricRehearsal.startedAt().catch(() => null)) ?? now;
}

/** Deletes the studio posts of a slot that will never go out (an off switch, a missed release). */
async function dropPosts(container: Pick<Container, 'posts' | 'lifecycle' | 'clock'>, slot: SlotRow): Promise<void> {
  for (const post of slot.build?.posts ?? []) {
    const current = await container.posts.findById(post.postId);
    if (current === null) continue;
    await deletePost(
      { repo: container.lifecycle, now: container.clock.now() },
      { actor: RUBRIC_ACTOR, id: post.postId, revision: current.revision }
    ).catch(() => undefined);
  }
}

async function channelPosts(
  container: Pick<Container, 'publicationOutcomes'>,
  ours: Set<string>,
  now: number
): Promise<ChannelPost[]> {
  const live = ['scheduled', 'queued', 'preparing', 'sending', 'retry_wait', 'sent', 'unknown'];
  return (await listRecentPublications({ repo: container.publicationOutcomes, now }, now - LOOKBACK_MS))
    .filter((row) => live.includes(row.status) && !ours.has(row.postId))
    .map((row) => ({
      at: row.at,
      weight: row.hasMedia ? 'V' : 'L',
      rubric: null,
      interactive: row.postKind === 'poll',
      family: null
    }));
}

/** What a tick reads and writes: the scheduler's own stores and the publishing and content it hands posts to. */
export type SchedulerContainer = Pick<
  Container,
  | 'clock'
  | 'logger'
  | 'newId'
  | 'aiJobs'
  | 'rubricSlots'
  | 'rubricSchedulerSettings'
  | 'schedulerEnv'
  | 'latestPatchAt'
  | 'destinations'
  | 'publishing'
  | 'publicationOutcomes'
  | 'posts'
  | 'lifecycle'
  | 'publications'
  | 'postSource'
  | 'idempotency'
  | 'rubricBreakers'
  | 'rubricNotices'
  | 'rubricBets'
  | 'audience'
  | 'pollStopper'
  | 'dotaItems'
  | 'gameFileBuilds'
  | 'ownerMessenger'
  | 'ownerChatId'
  | 'systemState'
  | 'rubricAnalyticsSources'
  | 'rubricHourSlots'
  | 'rubricRehearsal'
>;

export async function runRubricSchedulerTick(
  container: SchedulerContainer,
  lab: LabSwitches
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const state = await schedulerState(container, container.schedulerEnv, lab);
  const now = container.clock.now();
  const slots = container.rubricSlots;

  // Switched off: the slots not yet released are cancelled once (their posts deleted); released ones finish.
  if (state.settings !== null && !state.settings.offCleanupDone && !state.settings.enabled) {
    for (const slot of await slots.live()) {
      // Open polls still close on time.
      if (slot.kind === 'poll_close') continue;
      if (slot.status !== 'planned' && slot.status !== 'building' && slot.status !== 'ready') continue;
      if (
        await slots.transition({
          id: slot.id,
          from: slot.status,
          to: 'cancelled',
          now,
          set: { errorCode: 'SWITCHED_OFF' }
        })
      ) {
        counts.cancelled = (counts.cancelled ?? 0) + 1;
        await dropPosts(container, slot);
      }
    }
    await container.rubricSchedulerSettings.markCleanupDone(now);
  }
  if (state.locks.length > 0 || state.destination === null) {
    // Locked: nothing new is planned, built or released, but posts already handed to publishing are still followed
    // (sent / unknown, polls closed), so a sent post is never written off as missed and keeps counting.
    if (state.settings !== null) await followReleased(container, now, state.destination?.chatId ?? null, counts);
    return { ...counts, locked: 1 };
  }

  const settings = container.rubricSchedulerSettings;
  // Over the day's Browser Rendering cap no picture rubric is planned or built until the Moscow day turns (stage P).
  const browserSpent = (await browserUsedToday(slots, now)) >= browserCapMs(container.schedulerEnv, state.mode);
  const capabilities = planCapabilities(container.schedulerEnv, state.mode);
  const pace = rehearsalPace(container.schedulerEnv, state.mode);
  if (browserSpent) capabilities.delete('browser');
  if (await settings.claimStep('plan', now, now + PLAN_EVERY_MS)) {
    try {
      const recent = await slots.between(now - LOOKBACK_MS, now + 3 * 86_400_000);
      const ours = new Set(recent.flatMap((slot) => (slot.build?.posts ?? []).map((post) => post.postId)));
      const anchorWeek = state.settings?.horoscopeAnchorWeek ?? nextMonday(mskParts(now).day);
      const planned = await planSlots(
        { slots, settings, newId: container.newId, now },
        {
          rubrics: rubricDescriptors(),
          ready: INNER_RULES_READY,
          blocked: new Set((await container.rubricBreakers.open('rubric', now)).map((breaker) => breaker.key)),
          capabilities,
          channel: await channelPosts(container, ours, now),
          latestPatchAt: await container.latestPatchAt(),
          horoscopeAnchorWeek: anchorWeek,
          events: await readEvents(container, now, pace === null ? null : await rehearsalStart(container, now)),
          // The learned hours (stage 8; none before migration 0122) and one trial hour in five pool slots.
          hourSlots: await container.rubricHourSlots().catch(() => ({})),
          explore: true,
          ...(pace === null ? {} : { pace })
        }
      );
      counts.planned = planned.inserted;
      counts.superseded = planned.superseded;
      // The week-long DEV test: every new slot gets its check (and maybe a staged failure), ended ones a verdict.
      if (pace !== null) {
        counts.rehearsalEnlisted = await container.rubricRehearsal.enlist(now);
        counts.rehearsalJudged = await container.rubricRehearsal.judgeOpen(now);
      }
      await settings.stepDone('plan', now, null);
    } catch (error) {
      await settings.stepDone('plan', now, error instanceof Error ? error.name.slice(0, 80) : 'PLAN_FAILED');
      throw error;
    }
  }

  // Housekeeping: attempts kept 90 days and notices 14, once a day; the plan's health once an hour.
  if (await settings.claimStep('purge', now, now + DAY_MS)) {
    counts.purgedAttempts = await purgeInRounds((limit) => slots.purgeAttempts(now - 90 * DAY_MS, limit));
    counts.purgedBuilds = await purgeInRounds((limit) => slots.purgeBuilds(now - 90 * DAY_MS, limit));
    await container.rubricNotices.purge(mskParts(now - 14 * DAY_MS).day);
    await settings.stepDone('purge', now, null);
  }
  if (await settings.claimStep('health', now, now + 60 * 60_000)) {
    const plan = await settings.stepHealth('plan');
    // The plan failing three times in a row, or not done for two hours, means no new slots: the owner hears of it.
    const stale = plan.lastSuccessAt !== null && now - plan.lastSuccessAt > 2 * 60 * 60_000;
    if (plan.failCount >= 3 || stale)
      await notifySchedulerFailure(container, {
        key: `health:plan:${plan.lastErrorCode ?? 'STALE'}`,
        kind: 'health',
        text: `План рубрик не обновляется${plan.lastErrorCode === null ? '' : ` (${plan.lastErrorCode})`}: новые слоты не появляются. Проверьте раздел «Рубрики».`
      });
    await settings.stepDone('health', now, null);
  }

  let builds = 0;
  let releases = 0;
  let projections = 0;
  for (const slot of await slots.due(now, DUE_PER_TICK)) {
    const status = slot.status as LiveStatus;
    // Past its deadline with nothing done: the slot ends where its state says (§7). A post handed to publishing is
    // looked up once more first: it may have gone out after the last look.
    if (now > slot.deadlineAt) {
      if (FOLLOWED.has(status)) {
        const moved = await projectSlot(container, slot, state.destination.chatId);
        if (moved !== null) {
          counts[moved] = (counts[moved] ?? 0) + 1;
          continue;
        }
      }
      const to = exitOf(status);
      if (
        await slots.transition({
          id: slot.id,
          from: slot.status,
          to,
          now,
          set: { errorCode: 'DEADLINE', leaseUntil: null }
        })
      ) {
        counts[to] = (counts[to] ?? 0) + 1;
        if (status === 'ready') await dropPosts(container, slot);
      }
      continue;
    }
    // A poll's close (§11.2): stopPoll, the final counts kept; safe to repeat.
    if (slot.kind === 'poll_close') {
      if (projections >= PROJECTIONS_PER_TICK) continue;
      projections += 1;
      await closePoll(container, slot, now);
      continue;
    }
    switch (status) {
      case 'planned': {
        if (builds >= BUILDS_PER_TICK) break;
        const candidate = RUBRIC_META[slot.candidates[slot.candIdx] as RubricKey] as RubricMeta | undefined;
        if (browserSpent && candidate?.needs.includes('browser') === true) {
          await slots.transition({
            id: slot.id,
            from: 'planned',
            to: 'empty',
            now,
            set: { errorCode: 'BROWSER_BUDGET', errorStep: 'capability' }
          });
          break;
        }
        const attempt = slot.attempt + 1;
        const moved = await slots.transition({
          id: slot.id,
          from: 'planned',
          attempt: slot.attempt,
          to: 'building',
          now,
          set: { attempt, leaseUntil: now + BUILD_LEASE_MS, nextActionAt: now + BUILD_LEASE_MS }
        });
        if (!moved) break;
        builds += 1;
        try {
          await container.aiJobs.send({ id: container.newId(), kind: 'rubric_build', slotId: slot.id, attempt });
        } catch (error) {
          // Nothing was queued, so no build ever started: the slot goes back to planned (the next tick sends again) and
          // the rubric is not blamed. The attempt is given back too.
          container.logger.warn({
            component: 'rubric-scheduler',
            operation: 'build_enqueue',
            errorCode: 'BUILD_ENQUEUE_FAILED',
            detail: error instanceof Error ? error.name : 'unknown'
          });
          await slots.transition({
            id: slot.id,
            from: 'building',
            attempt,
            to: 'planned',
            now,
            set: { attempt: slot.attempt, leaseUntil: null, nextActionAt: now }
          });
          builds -= 1;
        }
        break;
      }
      case 'building': {
        // The lease ran out: the build died (CPU, memory). Rebuilding the same rubric would pay AI and Browser again
        // for the same death, so it counts as the candidate's failure (breaker included) and the next one goes.
        await failCandidate(container, slot, 'BUILD_LOST', 'data');
        counts.buildLost = (counts.buildLost ?? 0) + 1;
        break;
      }
      case 'ready': {
        if (releases >= RELEASES_PER_TICK) break;
        releases += 1;
        // A patch landed after the build began: its numbers may be the old patch's, so the post yields (H2).
        const patchAt = await container.latestPatchAt();
        if (patchAt !== null && patchAt > slot.buildAt) {
          if (
            await slots.transition({
              id: slot.id,
              from: 'ready',
              to: 'superseded',
              now,
              set: { errorCode: 'PATCH_CHANGED', errorStep: 'release', leaseUntil: null }
            })
          ) {
            counts.patchChanged = (counts.patchChanged ?? 0) + 1;
            await dropPosts(container, slot);
          }
          break;
        }
        const ready = await prepareAnswer(container, slot, state.destination.chatId);
        const outcome = await releaseSlot(container, ready, state.destination.id);
        counts[`release_${outcome}`] = (counts[`release_${outcome}`] ?? 0) + 1;
        break;
      }
      case 'released':
      case 'waiting_parent':
      case 'unknown': {
        if (projections >= PROJECTIONS_PER_TICK) break;
        projections += 1;
        await followSlot(container, slot, now, state.destination.chatId, counts);
        break;
      }
    }
  }
  return { ...counts, builds, releases, projections };
}

const FOLLOWED = new Set<LiveStatus>(['released', 'waiting_parent', 'unknown']);

// Reads the publication of a slot handed to publishing; with nothing new, looks again on the state's own rhythm.
async function followSlot(
  container: SchedulerContainer,
  slot: SlotRow,
  now: number,
  chatId: string | null,
  counts: Record<string, number>
): Promise<void> {
  const moved = await projectSlot(container, slot, chatId);
  if (moved !== null) {
    counts[moved] = (counts[moved] ?? 0) + 1;
    return;
  }
  const status = slot.status as LiveStatus;
  if (now > slot.deadlineAt) {
    const to = exitOf(status);
    if (
      await container.rubricSlots.transition({
        id: slot.id,
        from: slot.status,
        to,
        now,
        set: { errorCode: 'DEADLINE', leaseUntil: null }
      })
    )
      counts[to] = (counts[to] ?? 0) + 1;
    return;
  }
  const times = scheduleOf(status, { slotAt: slot.slotAt, buildAt: slot.buildAt }, now);
  await container.rubricSlots.transition({
    id: slot.id,
    from: slot.status,
    to: slot.status,
    now,
    set: { nextActionAt: times.nextActionAt }
  });
}

// While locked: only slots already handed to publishing move (and open polls close on time).
async function followReleased(
  container: SchedulerContainer,
  now: number,
  chatId: string | null,
  counts: Record<string, number>
): Promise<void> {
  let projections = 0;
  for (const slot of await container.rubricSlots.due(now, DUE_PER_TICK)) {
    if (projections >= PROJECTIONS_PER_TICK) break;
    if (slot.kind === 'poll_close') {
      projections += 1;
      await closePoll(container, slot, now);
    } else if (FOLLOWED.has(slot.status as LiveStatus)) {
      projections += 1;
      await followSlot(container, slot, now, chatId, counts);
    }
  }
}
