import { renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, post } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createWrapper } from '../../../test/query-wrapper';
import { useDuplicatePost } from '../api/posts-queries';

setupMswServer();
beforeEach(() => setSession(accessToken('t')));
afterEach(() => clearSession());

describe('duplicating a post (owner, 16.10.2026: no title)', () => {
  it('copies an untitled post without a title, so the copy does not send its name as a bold first line', async () => {
    const bodies: unknown[] = [];
    const source = post({
      title: 'Если бы тиммейтов можно было денаить',
      body: 'Если бы тиммейтов можно было денаить))'
    });
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(post({ ...source, id: '00000000-0000-4000-8000-0000000000f1' }), { status: 201 });
      })
    );
    const { result } = renderHook(() => useDuplicatePost(), { wrapper: createWrapper() });
    await result.current.mutateAsync(source);
    expect(bodies).toEqual([{ body: source.body, entities: [] }]);
  });
});
