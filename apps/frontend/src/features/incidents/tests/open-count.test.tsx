import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { createWrapper } from '../../../test/query-wrapper';
import { useOpenIncidentCount } from '../model/use-open-incident-count';
import { incidentPage, failedIncident } from '../../../test/incident-fixtures';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

describe('open incident count (sidebar badge)', () => {
  it('reads openCount from a one-row page', async () => {
    const urls: URL[] = [];
    server.use(
      http.get('*/api/v1/incidents', ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(incidentPage([failedIncident()], { openCount: 99 }));
      })
    );
    const { result } = renderHook(() => useOpenIncidentCount(), { wrapper: createWrapper() });
    expect(result.current).toBe(0);
    await waitFor(() => expect(result.current).toBe(99));
    expect(urls[0]?.searchParams.get('limit')).toBe('1');
    expect(urls[0]?.searchParams.get('state')).toBe('open');
  });

  it('stays at 0 when the request fails: a badge never guesses', async () => {
    server.use(failWith('get', '/api/v1/incidents', { status: 503, code: 'UNAVAILABLE' }));
    const { result } = renderHook(() => useOpenIncidentCount(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(result.current).toBe(0);
  });
});
