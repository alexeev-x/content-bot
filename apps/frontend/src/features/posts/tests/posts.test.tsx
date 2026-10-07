import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, ids, post, postPage } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient, createWrapper } from '../../../test/query-wrapper';
import { postKeys, postsInfiniteQueryOptions, useCreatePost, useUpdatePost } from '../index';
import { useInfiniteQuery } from '@tanstack/react-query';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

function recordKeys(failFirst: number) {
  const keys: Array<string | null> = [];
  server.use(
    http.post('*/api/v1/posts', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key'));
      if (keys.length <= failFirst) return HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 });
      return HttpResponse.json(post(), { status: 201 });
    })
  );
  return keys;
}

describe('create post idempotency', () => {
  it('reuses one key when the same intent is retried, and uses a new one for the next intent', async () => {
    const keys = recordKeys(1);
    const { result } = renderHook(() => useCreatePost(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ title: 'A', body: 'x' }).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync({ title: 'A', body: 'x' });
    });
    await act(async () => {
      await result.current.mutateAsync({ title: 'A', body: 'x' });
    });

    expect(keys).toHaveLength(3);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('uses a new key when the operator edited the payload between attempts', async () => {
    const keys = recordKeys(1);
    const { result } = renderHook(() => useCreatePost(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ title: 'A' }).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync({ title: 'A, edited' });
    });
    expect(keys[1]).not.toBe(keys[0]);
  });
});

describe('post mutations and cache', () => {
  it('keeps the cache untouched on 409 STALE_REVISION', async () => {
    const client = createTestQueryClient();
    client.setQueryData(postKeys.detail(ids.post), post({ title: 'Cached' }));
    server.use(
      failWith('patch', `/api/v1/posts/${ids.post}`, { status: 409, code: 'CONFLICT', reason: 'STALE_REVISION' })
    );
    const { result } = renderHook(() => useUpdatePost(), { wrapper: createWrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ id: ids.post, input: { revision: 0, title: 'Mine' } }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(postKeys.detail(ids.post))).toMatchObject({ title: 'Cached' });
    expect(client.getQueryState(postKeys.detail(ids.post))?.isInvalidated).toBe(false);
  });

  it('writes the server response and invalidates lists only after success', async () => {
    const client = createTestQueryClient();
    client.setQueryData(postKeys.list({}), { pages: [], pageParams: [] });
    const { result } = renderHook(() => useUpdatePost(), { wrapper: createWrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ id: ids.post, input: { revision: 0, title: 'Mine' } });
    });
    expect(client.getQueryData(postKeys.detail(ids.post))).toMatchObject({ revision: 1 });
    expect(client.getQueryState(postKeys.list({}))?.isInvalidated).toBe(true);
  });

  it('does not retry a failed mutation', async () => {
    let calls = 0;
    server.use(
      http.patch('*/api/v1/posts/:id', () => {
        calls += 1;
        return HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 });
      })
    );
    const { result } = renderHook(() => useUpdatePost(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: ids.post, input: { revision: 0, title: 'x' } }).catch(() => undefined);
    });
    expect(calls).toBe(1);
  });
});

describe('cursor pagination', () => {
  it('echoes the opaque cursor to fetch the next page and stops at null', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get('*/api/v1/posts', ({ request }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        cursors.push(cursor);
        expect(url.searchParams.get('status')).toBe('draft');
        return cursor === null
          ? HttpResponse.json(postPage([post()], { nextCursor: 'opaque-cursor' }))
          : HttpResponse.json(postPage([post({ id: ids.post2 })]));
      })
    );
    const { result } = renderHook(() => useInfiniteQuery(postsInfiniteQueryOptions({ status: 'draft' })), {
      wrapper: createWrapper()
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(cursors).toEqual([null, 'opaque-cursor']);
  });
});
