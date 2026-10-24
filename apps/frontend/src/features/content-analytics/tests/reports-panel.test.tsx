import type { ContentReportDetailDto, ContentReportSummaryDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  server.use(http.get('*/api/v1/content-analytics/forecasts/accuracy', () => HttpResponse.json(accuracy)));
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
  costUsd: 0.0125,
  headline: 'В TikTok старые ролики набирают'
};
const weekly: ContentReportSummaryDto = {
  ...daily,
  id: 'weekly:2026-10-19:v1',
  kind: 'week',
  asOf: '2026-10-19T07:00:00.000Z',
  status: 'unreviewed',
  reviewError: 'AI_BUDGET',
  model: null,
  costUsd: null,
  headline: null
};
const detail: ContentReportDetailDto = {
  report: daily,
  text: '📈 Аналитика · 19 октября, 09:00\nYouTube\n# Всего  +сут  Ролик\n1  2.7к  +173↑ Как я на оракле…',
  blocks: [
    { kind: 'text', text: '📈 Аналитика · 19 октября, 09:00\nYouTube' },
    { kind: 'table', text: '# Всего  +сут  Ролик\n1  2.7к  +173↑ Как я на оракле…' }
  ],
  forecasts: [
    {
      itemId: 'youtube:abc',
      title: 'Как я на оракле играл #dota #dota2',
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
    },
    {
      itemId: 'youtube:abc',
      title: 'Как я на оракле играл #dota #dota2',
      platform: 'youtube',
      method: 'decay-v1',
      origin: '2026-10-19T06:00:00.000Z',
      horizonHours: 72,
      // Past its horizon but not scored: the next daily report scores it, so it is not «срок не наступил».
      targetAt: '2026-10-20T07:00:00.000Z',
      expected: 3500,
      low: 3200,
      high: 4000,
      fact: null,
      outcome: null
    }
  ]
};

const accuracy = {
  horizons: [
    { horizonHours: 24, inBand: 2, below: 1, above: 0, noFact: 0 },
    { horizonHours: 72, inBand: 0, below: 0, above: 0, noFact: 0 },
    { horizonHours: 168, inBand: 0, below: 0, above: 0, noFact: 0 }
  ],
  waiting: 1,
  nextTargetAt: null
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
    // A row shows the review's main fact; a report without one says how the review went.
    expect(await screen.findByText('В TikTok старые ролики набирают')).toBeTruthy();
    expect(screen.getByText('Без разбора ИИ: бюджет ИИ исчерпан')).toBeTruthy();
    expect(await screen.findByText('2 из 3')).toBeTruthy();
    expect(screen.getByText('Ждут проверки: 1 — их проверит следующий ежедневный отчёт.')).toBeTruthy();
    // Nothing is loaded until a report is opened.
    expect(detailCalls).toBe(0);
    await userEvent.click(screen.getByText(/Ежедневный · 19 октября/));
    const panel = await screen.findByRole('dialog');
    // Only the table keeps monospace spacing.
    await waitFor(() => expect(panel.querySelector('pre')?.textContent).toContain('1  2.7к  +173↑ Как я на оракле…'));
    // One card per video, its title without hashtags, each horizon on its own line.
    expect(panel.textContent).toContain('Как я на оракле играл · YouTube');
    expect(panel.textContent).not.toContain('#dota');
    expect(panel.textContent).toMatch(/2\s800–3\s400 → 3\s100 · попал/u);
    expect(panel.textContent).toContain('проверит следующий отчёт');
    expect(panel.textContent).not.toContain('decay-v1');
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
