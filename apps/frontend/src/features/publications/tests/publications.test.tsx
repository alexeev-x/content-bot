import { publicationStatusSchema, type PublicationStatus } from '@alexeev/contracts';
import { QueryClient, MutationCache } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, ids, publication } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient, createWrapper } from '../../../test/query-wrapper';
import {
  isConfirmedSent,
  publicationActions,
  publicationKeys,
  useCancelPublication,
  useCreatePublication
} from '../index';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

const input = {
  postId: ids.post,
  revision: 1,
  destinationId: ids.destination,
  scheduledAt: '2026-10-07T09:00:00.000Z',
  timezone: 'Europe/Moscow'
};

describe('publicationActions', () => {
  it('allows cancel and reschedule only before sending starts', () => {
    const allowed: PublicationStatus[] = ['scheduled', 'queued', 'retry_wait'];
    for (const status of publicationStatusSchema.options) {
      const actions = publicationActions(status);
      expect(actions.canCancel, status).toBe(allowed.includes(status));
      expect(actions.canReschedule, status).toBe(allowed.includes(status));
    }
  });

  it('exposes no cancel, reschedule or retry capability for unknown, only reconciliation', () => {
    expect(publicationActions('unknown')).toEqual({
      canCancel: false,
      canReschedule: false,
      needsReconciliation: true
    });
    expect(publicationActions('unknown')).not.toHaveProperty('canRetry');
  });

  it('reports needsReconciliation for unknown only', () => {
    for (const status of publicationStatusSchema.options) {
      expect(publicationActions(status).needsReconciliation).toBe(status === 'unknown');
    }
  });

  it('confirms a send only with status sent and an external message id', () => {
    expect(isConfirmedSent({ status: 'sent', externalMessageId: '42' })).toBe(true);
    expect(isConfirmedSent({ status: 'sent' })).toBe(false);
    expect(isConfirmedSent({ status: 'scheduled' })).toBe(false);
    expect(isConfirmedSent({ status: 'queued', externalMessageId: '42' })).toBe(false);
    expect(isConfirmedSent({ status: 'unknown' })).toBe(false);
  });
});

describe('publication mutations', () => {
  it('treats 202 as accepted, not sent: the cache holds the returned status', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCreatePublication(), { wrapper: createWrapper(client) });
    let created = publication({ status: 'sent' });
    await act(async () => {
      created = await result.current.mutateAsync(input);
    });
    expect(created.status).toBe('scheduled');
    expect(isConfirmedSent(created)).toBe(false);
    expect(client.getQueryData(publicationKeys.detail(created.id))).toMatchObject({ status: 'scheduled' });
  });

  it('reuses the Idempotency-Key on retry of the same create and renews it after success', async () => {
    const keys: Array<string | null> = [];
    server.use(
      http.post('*/api/v1/publications', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return keys.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(publication({ status: 'queued' }), { status: 202 });
      })
    );
    const { result } = renderHook(() => useCreatePublication(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('makes no optimistic cache write while the request is pending, and none on failure', async () => {
    const client = createTestQueryClient();
    const before = publication({ status: 'scheduled' });
    client.setQueryData(publicationKeys.detail(before.id), before);
    server.use(
      failWith('post', `/api/v1/publications/${before.id}/cancel`, {
        status: 409,
        code: 'CONFLICT',
        reason: 'NOT_CANCELLABLE'
      })
    );
    const { result } = renderHook(() => useCancelPublication(), { wrapper: createWrapper(client) });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.mutateAsync({ id: before.id, input: { revision: 0 } }).catch(() => undefined);
    });
    expect(client.getQueryData(publicationKeys.detail(before.id))).toEqual(before);
    await act(async () => {
      await pending;
    });
    expect(client.getQueryData(publicationKeys.detail(before.id))).toEqual(before);
  });

  it('shows the server-returned status after a successful cancel', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCancelPublication(), { wrapper: createWrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ id: ids.publication, input: { revision: 0 } });
    });
    expect(client.getQueryData(publicationKeys.detail(ids.publication))).toMatchObject({ status: 'cancelled' });
  });
});

describe('overlapping create intents', () => {
  it('keeps the key of intent B when intent A succeeds meanwhile', async () => {
    const other = { ...input, scheduledAt: '2026-10-08T09:00:00.000Z' };
    const keys: Array<{ at: string; key: string | null }> = [];
    let bCalls = 0;
    server.use(
      http.post('*/api/v1/publications', async ({ request }) => {
        const body = (await request.json()) as { scheduledAt: string };
        keys.push({ at: body.scheduledAt, key: request.headers.get('Idempotency-Key') });
        if (body.scheduledAt === input.scheduledAt) {
          await delay(40);
          return HttpResponse.json(publication(), { status: 202 });
        }
        bCalls += 1;
        return bCalls === 1 ? HttpResponse.error() : HttpResponse.json(publication(), { status: 202 });
      })
    );
    const { result } = renderHook(() => useCreatePublication(), { wrapper: createWrapper() });
    await act(async () => {
      const a = result.current.mutateAsync(input);
      await delay(5);
      await result.current.mutateAsync(other).catch(() => undefined); // B fails first
      await a; // A succeeds and releases its own key only
      await result.current.mutateAsync(other); // B retried
    });
    const b = keys.filter((k) => k.at === other.scheduledAt);
    expect(b).toHaveLength(2);
    expect(b[1]?.key).toBe(b[0]?.key);
  });

  it('sends one key per request and never reuses a released key for a later identical intent', async () => {
    const keys: Array<string | null> = [];
    server.use(
      http.post('*/api/v1/publications', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(publication(), { status: 202 });
      })
    );
    let calls = 0;
    // Widens the gap between submit and request for the second call only.
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
      mutationCache: new MutationCache({
        onMutate: async () => {
          calls += 1;
          if (calls === 2) await delay(60);
        }
      })
    });
    const { result } = renderHook(() => useCreatePublication(), { wrapper: createWrapper(client) });
    await act(async () => {
      const a = result.current.mutateAsync(input);
      const b = result.current.mutateAsync(input);
      await Promise.all([a, b]);
      await result.current.mutateAsync(input); // a new intent after both were confirmed
    });
    expect(keys).toHaveLength(3);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
