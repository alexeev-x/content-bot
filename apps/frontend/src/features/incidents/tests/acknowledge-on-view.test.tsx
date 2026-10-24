import type { IncidentDto } from '@alexeev/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createWrapper } from '../../../test/query-wrapper';
import { useAcknowledgeFailedOnView } from '../model/use-acknowledge-on-view';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

const incident = (id: string, kind: IncidentDto['kind'], publicationId: string): IncidentDto => ({
  id,
  kind,
  code: kind === 'publish_failed' ? 'TELEGRAM_MEDIA_TOO_LARGE' : 'SEND_UNCONFIRMED',
  occurredAt: '2026-10-22T06:02:36.698Z',
  jobId: 'aaaaaaaa-0000-4000-8000-000000000001',
  attemptCount: 1,
  publication: {
    id: publicationId,
    status: kind === 'publish_failed' ? 'failed' : 'unknown',
    postTitle: 'Post',
    destinationName: 'Channel',
    scheduledAt: '2026-10-22T06:02:26.425Z'
  }
});

const FAILED = '11111111-1111-4111-8111-111111111111';
const UNKNOWN = '22222222-2222-4222-8222-222222222222';

describe('opening a publication', () => {
  // The badge must drop what the owner has seen, but an unknown send closes only through reconciliation.
  it('acknowledges its failed incident once and never an unknown one', async () => {
    const resolved: string[] = [];
    server.use(
      http.get('*/api/v1/incidents', () =>
        HttpResponse.json({
          items: [
            incident('33333333-3333-4333-8333-333333333333', 'publish_failed', FAILED),
            incident('44444444-4444-4444-8444-444444444444', 'publish_unknown', UNKNOWN)
          ],
          nextCursor: null,
          openCount: 2
        })
      ),
      http.post('*/api/v1/incidents/:id/resolve', ({ params }) => {
        resolved.push(String(params['id']));
        return HttpResponse.json({
          ...incident('33333333-3333-4333-8333-333333333333', 'publish_failed', FAILED),
          resolvedAt: '2026-10-22T07:00:00.000Z'
        });
      })
    );
    const wrapper = createWrapper();

    const unknown = renderHook(() => useAcknowledgeFailedOnView(UNKNOWN), { wrapper });
    const failed = renderHook(() => useAcknowledgeFailedOnView(FAILED), { wrapper });
    await waitFor(() => expect(resolved).toEqual(['33333333-3333-4333-8333-333333333333']));
    failed.rerender();
    unknown.rerender();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(resolved).toEqual(['33333333-3333-4333-8333-333333333333']);
  });
});
