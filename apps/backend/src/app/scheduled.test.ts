import { describe, expect, it } from 'vitest';
import { createLogger } from '../platform/logging/logger';
import type { LifecycleRepository } from '../modules/lifecycle';
import { ARCHIVE_LOOKBACK_SWEEP_MS, ARCHIVE_LOOKBACK_TICK_MS } from '../modules/lifecycle';
import type { DispatchRepository } from '../modules/publishing';
import type { Container } from './container';
import { handleScheduled } from './scheduled';

const HOUR = 1_800_000_000_000; // minute 0 of an hour, UTC
const NOT_HOUR = HOUR + 7 * 60_000;
const HALF_PAST = HOUR + 30 * 60_000;

interface Probe {
  container: Container;
  lines: Record<string, unknown>[];
  calls: string[];
  /** The `since` of every archive scan, to see which lookback the tick chose. */
  archiveSince: number[];
  /** Every run the tick recorded for the owner's /status. */
  heartbeats: { status: string }[];
}

// The tick's orchestration without D1: which steps run, in which order, and how failures surface.
function probe(
  options: {
    enabled?: boolean;
    failReconcile?: boolean;
    failArchive?: boolean;
    failHeartbeat?: boolean;
    due?: string[];
  } = {}
): Probe {
  const lines: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const archiveSince: number[] = [];
  const heartbeats: { status: string }[] = [];
  const repo: DispatchRepository = {
    findExpiredClaims: () => {
      calls.push('reconcile');
      return options.failReconcile === true ? Promise.reject(new Error('D1 down')) : Promise.resolve([]);
    },
    findDueJobIds: () => {
      calls.push('due');
      return Promise.resolve(options.due ?? []);
    },
    // Another tick always wins the claim here, so a due job costs the tick nothing else.
    claim: () => Promise.resolve(null),
    loadTarget: () => Promise.reject(new Error('unexpected')),
    markSendStarted: () => Promise.reject(new Error('unexpected')),
    resolve: () => Promise.reject(new Error('unexpected')),
    outcomeInPlace: () => Promise.reject(new Error('unexpected')),
    resolveExpired: () => Promise.reject(new Error('unexpected')),
    claimOwnerNotices: () => Promise.reject(new Error('unexpected')),
    countOpenIncidents: () => Promise.reject(new Error('unexpected'))
  };
  const lifecycle = {
    findArchivable: ({ since }: { since: number }) => {
      calls.push('archive');
      archiveSince.push(since);
      return options.failArchive === true ? Promise.reject(new Error('D1 down')) : Promise.resolve([]);
    },
    findExpired: () => {
      calls.push('purge');
      return Promise.resolve([]);
    }
  } as unknown as LifecycleRepository;
  const container = {
    clock: { now: () => HOUR },
    logger: createLogger((line) => lines.push(JSON.parse(line) as Record<string, unknown>)),
    publishing: { enabled: options.enabled ?? true },
    dispatchJobs: repo,
    lifecycle,
    postRevisions: { findRevision: () => Promise.reject(new Error('unexpected')) },
    transport: { send: () => Promise.reject(new Error('unexpected')) },
    sessions: {
      purgeEnded: () => {
        calls.push('purge sessions');
        return Promise.resolve({ signIns: 0, sessions: 0 });
      }
    },
    housekeeping: {
      purgeExpired: () => {
        calls.push('purge platform');
        return Promise.resolve({ idempotencyKeys: 0, rateLimits: 0 });
      }
    },
    ownerMessenger: null,
    ownerChatId: null,
    systemState: {
      recordCronRun: (run: { status: string }) => {
        calls.push('heartbeat');
        heartbeats.push(run);
        return options.failHeartbeat === true ? Promise.reject(new Error('D1 down')) : Promise.resolve();
      }
    },
    random: () => 0,
    newId: () => crypto.randomUUID()
  } as unknown as Container;
  return { container, lines, calls, archiveSince, heartbeats };
}

const controller = (scheduledTime: number) => ({ cron: '* * * * *', scheduledTime }) as ScheduledController;

describe('handleScheduled', () => {
  it('an idle tick reconciles, scans for due jobs and for posts to archive, logs once, and does nothing else', async () => {
    const { container, lines, calls } = probe();

    await handleScheduled(controller(NOT_HOUR), container);

    expect(calls).toEqual(['reconcile', 'due', 'archive', 'heartbeat']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      component: 'scheduled',
      operation: 'tick',
      status: 'ok',
      cron: '* * * * *',
      at: NOT_HOUR
    });
  });

  it('cleans up only on the tick of minute 0 of the hour', async () => {
    const minuteTick = probe();
    const hourTick = probe();

    await handleScheduled(controller(NOT_HOUR), minuteTick.container);
    await handleScheduled(controller(HOUR), hourTick.container);

    expect(minuteTick.calls).not.toContain('purge platform');
    expect(minuteTick.calls).not.toContain('purge sessions');
    expect(hourTick.calls).toEqual(['reconcile', 'due', 'archive', 'purge platform', 'purge sessions', 'heartbeat']);
  });

  it('with publishing off it never looks for due jobs', async () => {
    const { container, calls } = probe({ enabled: false });

    await handleScheduled(controller(NOT_HOUR), container);

    expect(calls).toEqual(['reconcile', 'archive', 'heartbeat']);
  });

  it('a failing step is logged without its message, later steps still run, and the tick fails', async () => {
    const { container, lines, calls } = probe({ failReconcile: true });

    await expect(handleScheduled(controller(HOUR), container)).rejects.toThrow('SCHEDULED_TICK_FAILED');

    expect(calls).toEqual(['reconcile', 'due', 'archive', 'purge platform', 'purge sessions', 'heartbeat']);
    expect(lines.find((line) => line.level === 'error')).toMatchObject({
      component: 'scheduled',
      operation: 'reconcile',
      errorCode: 'Error'
    });
    expect(JSON.stringify(lines)).not.toContain('D1 down');
    expect(lines.at(-1)).toMatchObject({ operation: 'tick', status: 'error' });
  });

  it('purges expired archived posts only on the tick of minute 30, and only when nothing was due', async () => {
    const idle = probe();
    const busy = probe({ due: ['job-1'] });
    const other = probe();

    await handleScheduled(controller(HALF_PAST), idle.container);
    await handleScheduled(controller(HALF_PAST), busy.container);
    await handleScheduled(controller(NOT_HOUR), other.container);

    expect(idle.calls).toEqual(['reconcile', 'due', 'archive', 'purge', 'heartbeat']);
    expect(busy.calls).toEqual(['reconcile', 'due', 'archive', 'heartbeat']);
    expect(other.calls).not.toContain('purge');
  });

  it('looks back a short while on a regular tick and two days on the hourly one', async () => {
    const minute = probe();
    const hour = probe();

    await handleScheduled(controller(NOT_HOUR), minute.container);
    await handleScheduled(controller(HOUR), hour.container);

    expect(minute.archiveSince).toEqual([HOUR - ARCHIVE_LOOKBACK_TICK_MS]);
    expect(hour.archiveSince).toEqual([HOUR - ARCHIVE_LOOKBACK_SWEEP_MS]);
  });

  it('a failing archive step is logged, the purge still runs and the tick fails', async () => {
    const { container, lines, calls } = probe({ failArchive: true });

    await expect(handleScheduled(controller(HALF_PAST), container)).rejects.toThrow('SCHEDULED_TICK_FAILED');

    expect(calls).toEqual(['reconcile', 'due', 'archive', 'purge', 'heartbeat']);
    expect(lines.find((line) => line.level === 'error')).toMatchObject({ operation: 'archive', errorCode: 'Error' });
    expect(JSON.stringify(lines)).not.toContain('D1 down');
  });

  it('records the run for /status, as failed when a step failed', async () => {
    const good = probe();
    const bad = probe({ failReconcile: true });

    await handleScheduled(controller(NOT_HOUR), good.container);
    await expect(handleScheduled(controller(NOT_HOUR), bad.container)).rejects.toThrow('SCHEDULED_TICK_FAILED');

    expect(good.heartbeats).toEqual([expect.objectContaining({ status: 'ok' })]);
    expect(bad.heartbeats).toEqual([expect.objectContaining({ status: 'error' })]);
  });

  it('a heartbeat that cannot be written is logged and does not fail the tick', async () => {
    const { container, lines } = probe({ failHeartbeat: true });

    await expect(handleScheduled(controller(NOT_HOUR), container)).resolves.toBeUndefined();

    expect(lines.find((line) => line.operation === 'heartbeat')).toMatchObject({
      level: 'warn',
      errorCode: 'Error'
    });
    expect(JSON.stringify(lines)).not.toContain('D1 down');
  });
});
