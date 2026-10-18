import { aiOverviewSchema } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { AiSettingsPage } from '../ui/AiSettingsPage';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const overview = aiOverviewSchema.parse({
  settings: {
    provider: 'openai',
    enabled: true,
    draftModel: 'gpt-6.1-sol',
    cheapModel: 'gpt-6-luna',
    prices: [],
    monthlyBudgetUsd: 5,
    dailyCapUsd: 1,
    warnAtPercent: 70,
    revision: 3,
    updatedAt: '2026-10-16T06:30:00.000Z'
  },
  connection: { provider: 'openai', keyConfigured: true, keyName: 'OPENAI_API_KEY', lastCheck: null },
  spend: {
    month: '2026-10',
    spentUsd: 0,
    todayUsd: 0,
    leftUsd: 5,
    requests: 0,
    averageUsd: null,
    unpricedRequests: 0,
    byKind: [],
    blockedBy: null
  },
  quality: {
    days: 30,
    drafts: 0,
    rewrites: 0,
    failed: 0,
    withWarnings: 0,
    approved: 0,
    approvedUnchanged: 0,
    averageEditRatio: null,
    jokeMissed: 0,
    feedback: [],
    averageDraftUsd: null,
    questions: 0,
    studioDrafts: 0,
    changedParts: [],
    byFormat: [],
    previous: { approved: 0, averageEditRatio: null, comparable: false }
  },
  catalog: {
    provider: 'openai',
    providerLabel: 'OpenAI',
    pricesCheckedOn: '2026-10-15',
    models: [
      {
        id: 'gpt-6.1-sol',
        label: 'GPT-6.1 Sol',
        note: 'Для черновиков',
        roles: ['draft'],
        recommendedFor: 'draft',
        inputPerMillion: 2,
        cachedInputPerMillion: 0.2,
        outputPerMillion: 12
      },
      {
        id: 'gpt-6-luna',
        label: 'GPT-6 Luna',
        note: 'Дешёвая',
        roles: ['draft', 'cheap'],
        recommendedFor: 'cheap',
        inputPerMillion: 0.1,
        cachedInputPerMillion: 0.01,
        outputPerMillion: 0.5
      }
    ]
  }
});

describe('video reviews switch', () => {
  it('is off by default and saves videoReviews: true on the stored revision', async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.get('*/api/v1/ai', () => HttpResponse.json(overview)),
      http.put('*/api/v1/ai/settings', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...overview, settings: { ...overview.settings, videoReviews: true, revision: 4 } });
      })
    );
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <AiSettingsPage />
        </ToastProvider>
      </QueryClientProvider>
    );
    const toggle = await screen.findByRole('switch', { name: /Разборы видео через 72 часа/ });
    expect(screen.getByText(/Один запрос к дешёвой модели на видео/)).toBeTruthy();
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({ videoReviews: true, revision: 3, enabled: true });
    await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(true));
  });
});
