import type { ContentReportDetailDto, ContentReportSummaryDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { ReportsPanel } from '../ui/ReportsPanel';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const daily: ContentReportSummaryDto = {
  id: 'daily:2026-10-19:v1',
  kind: 'day',
  asOf: '2026-10-19T06:00:00.000Z',
  timezone: 'Europe/Moscow',
  status: 'reviewed',
  reviewError: null,
  model: 'gpt-6.1-sol',
  costUsd: 0.0125
};
const weekly: ContentReportSummaryDto = {
  ...daily,
  id: 'weekly:2026-10-19:v1',
  kind: 'week',
  asOf: '2026-10-19T07:00:00.000Z',
  status: 'unreviewed',
  reviewError: 'AI_BUDGET',
  model: null,
  costUsd: null
};
const detail: ContentReportDetailDto = {
  report: daily,
  text: '📈 Аналитика · 19 октября, 09:00\nYouTube\n# Всего  +сут  Ролик\n1  2.7к  +173↑ Как я на оракле…',
  forecasts: [
    {
      itemId: 'youtube:abc',
      title: 'Как я на оракле играл',
      platform: 'youtube',
      method: 'decay-v1',
      origin: '2026-10-19T06:00:00.000Z',
      horizonHours: 24,
      targetAt: '2026-10-20T06:00:00.000Z',
      expected: 3000,
      low: 2800,
      high: 3400,
      fact: 3100,
      outcome: 'in_band'
    }
  ]
};

const mount = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ReportsPanel />
    </QueryClientProvider>
  );

describe('reports panel', () => {
  it('lists reports with how the review went and opens one with its text and forecasts', async () => {
    let detailCalls = 0;
    server.use(
      http.get('*/api/v1/content-analytics/reports', () =>
        HttpResponse.json({ items: [weekly, daily], nextCursor: null })
      ),
      http.get('*/api/v1/content-analytics/reports/:id', () => {
        detailCalls += 1;
        return HttpResponse.json(detail);
      })
    );
    mount();
    expect(await screen.findByText('Разбор ИИ: gpt-6.1-sol · $0.0125')).toBeTruthy();
    expect(screen.getByText('Без разбора ИИ: бюджет ИИ исчерпан')).toBeTruthy();
    // Nothing is loaded until a report is opened.
    expect(detailCalls).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: /Ежедневный · 19 октября/ }));
    // The text keeps its spacing: the tables line up as in Telegram.
    expect((await screen.findByText(/Аналитика · 19 октября/)).textContent).toContain(
      '1  2.7к  +173↑ Как я на оракле…'
    );
    expect(screen.getAllByText('Попал в диапазон').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2\s800–3\s400/u).length).toBeGreaterThan(0);
    expect(detailCalls).toBe(1);
  });

  it('says when there are no reports and when the list failed', async () => {
    server.use(
      http.get('*/api/v1/content-analytics/reports', () => HttpResponse.json({ items: [], nextCursor: null }))
    );
    mount();
    expect(await screen.findByText(/Отчётов пока нет/)).toBeTruthy();
    cleanup();
    server.use(
      http.get('*/api/v1/content-analytics/reports', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }))
    );
    mount();
    expect(await screen.findByText('Не удалось загрузить отчёты.')).toBeTruthy();
  });
});
