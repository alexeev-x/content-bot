import type { RubricCompare, RubricLearning } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { RubricsAnalytics } from '../ui/RubricsAnalytics';

// «Рубрики» → «Аналитика»: the comparison says which rubric lands best, the learning switch saves.

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const parts = { views: 1.2, reactions: 1, comments: 2, votes: null };
const compare: RubricCompare = {
  days: 30,
  asOf: '2026-11-02T09:00:00.000Z',
  from: '2026-10-03T09:00:00.000Z',
  to: '2026-11-02T09:00:00.000Z',
  channel: { baselinePosts: 40, viewsMedian24: 1200 },
  rows: [
    {
      rubric: 'tier_list',
      posts: 4,
      scored: 4,
      enough: true,
      x: 1.6,
      xPrev: null,
      parts,
      rank: 1,
      mark: 'best',
      reason: 'comments'
    },
    {
      rubric: 'quote_of_day',
      posts: 3,
      scored: 3,
      enough: true,
      x: 0.7,
      xPrev: 0.9,
      parts,
      rank: 2,
      mark: 'worst',
      reason: 'views'
    }
  ],
  hours: { cells: [{ weekday: 0, hour: 19, n: 3, x: 1.4, trial: false }] },
  coverage: { sent: 8, scored: 7, pending: 1, missing: 0 }
};
const learning: RubricLearning = {
  mode: 'advise',
  startedAt: '2026-10-20T09:00:00.000Z',
  applyFrom: '2026-11-17T09:00:00.000Z',
  applyEnabled: true,
  rest: [
    {
      rubric: 'tier_list',
      restDays: 20,
      source: 'default',
      advice: { toDays: 18, reason: 'better' },
      few: false,
      history: []
    }
  ],
  hours: []
};

function renderPage() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <RubricsAnalytics />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('RubricsAnalytics', () => {
  it('ranks the rubrics against the usual post and advises the rest', async () => {
    let applyEnabled: boolean | null = null;
    server.use(
      http.get('*/api/v1/rubric-analytics/compare', () => HttpResponse.json(compare)),
      http.get('*/api/v1/rubric-analytics/posts', () => HttpResponse.json({}, { status: 500 })),
      http.get('*/api/v1/rubric-analytics/comments', () =>
        HttpResponse.json({ asOf: compare.asOf, state: 'not_connected', textKeptDays: 10, rubrics: [], weekTopics: [] })
      ),
      http.get('*/api/v1/rubric-analytics/learning', () => HttpResponse.json(learning)),
      http.put('*/api/v1/rubric-analytics/learning', async ({ request }) => {
        applyEnabled = ((await request.json()) as { applyEnabled: boolean }).applyEnabled;
        return HttpResponse.json({ ...learning, applyEnabled, mode: 'advise' });
      })
    );
    renderPage();
    expect((await screen.findAllByText('×1,6')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('лучшая').length).toBeGreaterThan(0);
    expect(await screen.findByText((text) => text.includes('отдых 20 → 18 дн.'))).toBeTruthy();
    await userEvent.click(screen.getByRole('switch', { name: 'Менять отдых и часы самому после 4 недель' }));
    await expect.poll(() => applyEnabled).toBe(false);
  });
});
