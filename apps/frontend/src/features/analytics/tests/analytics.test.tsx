import type { PublicationAnalyticsReportDto, PublicationAnalyticsRowDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ownerDaysRange } from '../../../shared/lib/owner-timezone';
import { ToastProvider } from '../../../shared/ui';
import { accessToken, ids } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { analyticsKeys, AnalyticsReport, type AnalyticsSearch } from '../index';

setupMswServer();
afterEach(cleanup);
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

const range = ownerDaysRange(new Date(), 'Europe/Chisinau', 30);
const row: PublicationAnalyticsRowDto = {
  publicationId: ids.publication,
  postId: ids.post,
  postRevision: 1,
  title: 'Патч: изменения баланса',
  outcome: 'unknown' as const,
  observedAt: '2026-10-12T10:30:00.000Z',
  destinationId: ids.destination,
  destinationTitle: 'Канал Dota',
  mediaKinds: ['photo'],
  attemptCount: 2,
  retryCount: 1
};
const report = (items = [row]): PublicationAnalyticsReportDto => ({
  from: range.from,
  to: range.to,
  observedAt: '2026-10-13T09:00:00.000Z',
  comparison: 'destination',
  summary: { publications: items.length, sent: 0, failed: 0, unknown: items.length, attempts: 2, retries: 1 },
  groups: [
    {
      key: ids.destination,
      label: 'Канал Dota',
      counts: { publications: 1, sent: 0, failed: 0, unknown: 1, attempts: 2, retries: 1 },
      coveredPublications: 1,
      unrecordedPublications: 0
    }
  ],
  publications: { items, nextCursor: null },
  mediaCoverage: { recorded: 1, unrecorded: 0 }
});
const initialSearch: AnalyticsSearch = { ...range, comparison: 'destination' };

function mount(search = initialSearch, changeSpy: (patch: Partial<AnalyticsSearch>) => void = () => undefined) {
  const client = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AnalyticsReport
          search={search}
          timezone="Europe/Chisinau"
          onSearchChange={(patch) => changeSpy(patch)}
          onOpenPublication={() => undefined}
          onLogin={() => undefined}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { ...view, client };
}

describe('analytics report', () => {
  it('shows a structural busy region while the read is loading', async () => {
    server.use(
      http.get('*/api/v1/analytics/publications', async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        return HttpResponse.json(report());
      })
    );
    mount();
    expect(screen.getByRole('region', { name: 'Загружаем аналитику' }).getAttribute('aria-busy')).toBe('true');
    expect((await screen.findAllByText('Канал Dota')).length).toBeGreaterThan(0);
  });

  it('renders absolute counts, observations, attempts and retry counts from the API', async () => {
    server.use(http.get('*/api/v1/analytics/publications', () => HttpResponse.json(report())));
    mount();
    expect((await screen.findAllByText('Требуют проверки')).length).toBeGreaterThan(0);
    expect(screen.getByText('Патч: изменения баланса')).toBeTruthy();
    expect(screen.getByText(/Снимок отчёта: 13 окт\. 2026 г\., 12:00 Europe\/Chisinau/)).toBeTruthy();
    expect(screen.getByText(/снимок наблюдения/i)).toBeTruthy();
    expect(screen.queryByText(/%|процент|рейтинг/i)).toBeNull();
  });

  it('explains an empty result and offers no inferred data', async () => {
    server.use(http.get('*/api/v1/analytics/publications', () => HttpResponse.json(report([]))));
    mount();
    expect(await screen.findByText('Нет публикаций по выбранным фильтрам')).toBeTruthy();
  });

  it('keeps the report state and safely retries a failed GET', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/v1/analytics/publications', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { error: { code: 'UNAVAILABLE', message: 'Unavailable', requestId: 'req-analytics-1' } },
              { status: 503 }
            )
          : HttpResponse.json(report());
      })
    );
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('req-analytics-1')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Патч: изменения баланса')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('shows no report data for 401 and 403 responses', async () => {
    for (const [status, code] of [
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN']
    ] as const) {
      server.use(failWith('get', '/api/v1/analytics/publications', { status, code }));
      const view = mount();
      expect(
        await screen.findByText(status === 401 ? 'Войдите снова, чтобы открыть аналитику' : 'Нет доступа к аналитике')
      ).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
      view.unmount();
    }
  });

  it('removes previously cached private analytics after access is revoked', async () => {
    server.use(http.get('*/api/v1/analytics/publications', () => HttpResponse.json(report())));
    const view = mount();
    expect(await screen.findByRole('table', { name: 'Публикации и их результаты в выбранном периоде' })).toBeTruthy();
    server.use(failWith('get', '/api/v1/analytics/publications', { status: 403, code: 'FORBIDDEN' }));
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: analyticsKeys.all });
    });
    expect(await screen.findByText('Нет доступа к аналитике')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    view.unmount();
  });

  it('lets the operator navigate from unknown to publication reconciliation without report mutations', async () => {
    server.use(http.get('*/api/v1/analytics/publications', () => HttpResponse.json(report())));
    const user = userEvent.setup();
    const navigate = vi.fn();
    mount(initialSearch, navigate);
    await user.click(await screen.findByRole('button', { name: /Патч: изменения баланса/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Результат не подтверждён/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /повторить|отправить|сверить/i })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Открыть публикацию и проверку' }));
    expect(navigate).toHaveBeenCalledWith({ publicationId: ids.publication });
  });

  it('closes the row drawer when navigation removes publicationId and restores trigger focus', async () => {
    server.use(http.get('*/api/v1/analytics/publications', () => HttpResponse.json(report())));
    const user = userEvent.setup();
    const navigation = vi.fn();
    const client = createTestQueryClient();
    function RouteHarness() {
      const [search, setSearch] = useState(initialSearch);
      return (
        <AnalyticsReport
          search={search}
          timezone="Europe/Chisinau"
          onSearchChange={(patch) => {
            navigation(patch);
            setSearch((current) => ({ ...current, ...patch }));
          }}
          onOpenPublication={() => undefined}
          onLogin={() => undefined}
        />
      );
    }
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouteHarness />
        </ToastProvider>
      </QueryClientProvider>
    );

    const trigger = await screen.findByRole('button', { name: /Патч: изменения баланса/ });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(navigation).toHaveBeenCalledWith({ publicationId: ids.publication });
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(navigation).toHaveBeenLastCalledWith({ publicationId: undefined });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('writes comparison changes into navigation and supports the APG keyboard tab model', async () => {
    server.use(http.get('*/api/v1/analytics/publications', () => HttpResponse.json(report())));
    const user = userEvent.setup();
    const change = vi.fn();
    mount(initialSearch, change);
    const channelTab = await screen.findByRole('tab', { name: 'Каналы' });
    channelTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Типы медиа' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith({ comparison: 'media' }));
  });

  it('preserves filter drafts until Apply and encodes the applied range/filters as one patch', async () => {
    server.use(http.get('*/api/v1/analytics/publications', () => HttpResponse.json(report())));
    const user = userEvent.setup();
    const change = vi.fn();
    const view = mount(initialSearch, change);
    await screen.findByRole('tab', { name: 'Каналы' });
    await user.click(screen.getByRole('button', { name: /Период/ }));
    await user.click(await screen.findByRole('option', { name: 'Последние 7 дней' }));
    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String), cursor: undefined })
    );
    const restoredSearch = { ...initialSearch, outcome: 'sent' as const };
    view.rerender(
      <QueryClientProvider client={view.client}>
        <ToastProvider>
          <AnalyticsReport
            search={restoredSearch}
            timezone="Europe/Chisinau"
            onSearchChange={(patch) => change(patch)}
            onOpenPublication={() => undefined}
            onLogin={() => undefined}
          />
        </ToastProvider>
      </QueryClientProvider>
    );
    expect(screen.getByRole('button', { name: /Отправлено Результат/ })).toBeTruthy();
  });
});
