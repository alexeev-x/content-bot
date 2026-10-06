import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, destination, errorBody, ids } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient, createWrapper } from '../../../test/query-wrapper';
import { destinationKeys, useCreateDestination, useUpdateDestination } from '../index';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

describe('destinations', () => {
  it('reuses the Idempotency-Key when the same create is retried', async () => {
    const keys: Array<string | null> = [];
    server.use(
      http.post('*/api/v1/destinations', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return keys.length === 1
          ? HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })
          : HttpResponse.json(destination(), { status: 201 });
      })
    );
    const { result } = renderHook(() => useCreateDestination(), { wrapper: createWrapper() });
    const input = { title: 'Канал', chatId: '@channel_x', kind: 'channel' } as const;
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(keys[1]).toBe(keys[0]);
  });

  it('serialises the enabled filter and keeps 409 CHAT_ID_TAKEN from touching the cache', async () => {
    const client = createTestQueryClient();
    client.setQueryData(destinationKeys.detail(ids.destination), destination({ title: 'Cached' }));
    server.use(
      http.patch('*/api/v1/destinations/:id', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'CHAT_ID_TAKEN' }), { status: 409 })
      )
    );
    const { result } = renderHook(() => useUpdateDestination(), { wrapper: createWrapper(client) });
    await act(async () => {
      await result.current
        .mutateAsync({ id: ids.destination, input: { revision: 0, chatId: '@taken_chat' } })
        .catch(() => undefined);
    });
    expect(client.getQueryData(destinationKeys.detail(ids.destination))).toMatchObject({ title: 'Cached' });
  });
});
