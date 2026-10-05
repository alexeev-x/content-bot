import type { PublicationStatus } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { type JobSnapshot, projectPublicationStatus } from './status-projection';

const NOW = 1_000_000;

// One case per row of the table in docs/BACKEND_ARCHITECTURE.md §5.
const rows: [string, JobSnapshot, PublicationStatus][] = [
  ['pending, run_at in the future', { status: 'pending', runAt: NOW + 1, sendStartedAt: null }, 'scheduled'],
  ['pending, run_at == now', { status: 'pending', runAt: NOW, sendStartedAt: null }, 'queued'],
  ['pending, run_at in the past', { status: 'pending', runAt: NOW - 1, sendStartedAt: null }, 'queued'],
  ['claimed, send not started', { status: 'claimed', runAt: NOW - 5, sendStartedAt: null }, 'preparing'],
  ['claimed, send started', { status: 'claimed', runAt: NOW - 5, sendStartedAt: NOW - 1 }, 'sending'],
  ['succeeded', { status: 'succeeded', runAt: NOW - 5, sendStartedAt: NOW - 4 }, 'sent'],
  ['retry_wait', { status: 'retry_wait', runAt: NOW + 30_000, sendStartedAt: NOW - 4 }, 'retry_wait'],
  ['failed', { status: 'failed', runAt: NOW - 5, sendStartedAt: NOW - 4 }, 'failed'],
  ['unknown', { status: 'unknown', runAt: NOW - 5, sendStartedAt: NOW - 4 }, 'unknown'],
  ['cancelled', { status: 'cancelled', runAt: NOW + 10, sendStartedAt: null }, 'cancelled']
];

describe('projectPublicationStatus', () => {
  it.each(rows)('%s', (_name, job, expected) => {
    expect(projectPublicationStatus(job, NOW)).toBe(expected);
  });

  it('throws on a state the projection does not know', () => {
    const broken = { status: 'bogus', runAt: NOW, sendStartedAt: null } as unknown as JobSnapshot;
    expect(() => projectPublicationStatus(broken, NOW)).toThrow('Unhandled job state');
  });
});
