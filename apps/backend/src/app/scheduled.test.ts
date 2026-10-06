import { describe, expect, it } from 'vitest';
import { createLogger } from '../platform/logging/logger';
import type { DispatchRepository } from '../modules/publishing';
import type { Container } from './container';
import { handleScheduled } from './scheduled';

const HOUR = 1_800_000_000_000; // minute 0 of an hour, UTC
const NOT_HOUR = HOUR + 7 * 60_000;

interface Probe {
  container: Container;
  lines: Record<string, unknown>[];
  calls: string[];
}

// The tick's orchestration without D1: which steps run, in which order, and how failures surface.
function probe(options: { enabled?: boolean; failReconcile?: boolean } = {}): Probe {
  const lines: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const repo: DispatchRepository = {
    findExpiredClaims: () => {
      calls.push('reconcile');
      return options.failReconcile === true ? Promise.reject(new Error('D1 down')) : Promise.resolve([]);
    },
    findDueJobIds: () => {
      calls.push('due');
      return Promise.resolve([]);
    },
    claim: () => Promise.reject(new Error('unexpected')),
    loadTarget: () => Promise.reject(new Error('unexpected')),
    markSendStarted: () => Promise.reject(new Error('unexpected')),
    resolve: () => Promise.reject(new Error('unexpected')),
    outcomeInPlace: () => Promise.reject(new Error('unexpected')),
    resolveExpired: () => Promise.reject(new Error('unexpected'))
  };
  const container = {
    clock: { now: () => HOUR },
    logger: createLogger((line) => lines.push(JSON.parse(line) as Record<string, unknown>)),
    publishing: { enabled: options.enabled ?? true },
    dispatchJobs: repo,
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
    random: () => 0,
    newId: () => crypto.randomUUID()
  } as unknown as Container;
  return { container, lines, calls };
}

const controller = (scheduledTime: number) => ({ cron: '* * * * *', scheduledTime }) as ScheduledController;

describe('handleScheduled', () => {
  it('an idle tick reconciles and scans for due jobs, logs once, and does nothing else', async () => {
    const { container, lines, calls } = probe();

    await handleScheduled(controller(NOT_HOUR), container);

    expect(calls).toEqual(['reconcile', 'due']);
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
    expect(hourTick.calls).toEqual(['reconcile', 'due', 'purge platform', 'purge sessions']);
  });

  it('with publishing off it never looks for due jobs', async () => {
    const { container, calls } = probe({ enabled: false });

    await handleScheduled(controller(NOT_HOUR), container);

    expect(calls).toEqual(['reconcile']);
  });

  it('a failing step is logged without its message, later steps still run, and the tick fails', async () => {
    const { container, lines, calls } = probe({ failReconcile: true });

    await expect(handleScheduled(controller(HOUR), container)).rejects.toThrow('SCHEDULED_TICK_FAILED');

    expect(calls).toEqual(['reconcile', 'due', 'purge platform', 'purge sessions']);
    expect(lines.find((line) => line.level === 'error')).toMatchObject({
      component: 'scheduled',
      operation: 'reconcile',
      errorCode: 'Error'
    });
    expect(JSON.stringify(lines)).not.toContain('D1 down');
    expect(lines.at(-1)).toMatchObject({ operation: 'tick', status: 'error' });
  });
});
