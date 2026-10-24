import type { AiDraftChainDto, AiDraftSummaryDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { AiDraftHistory } from '../ui/AiDraftHistory';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const draft: AiDraftSummaryDto = {
  id: '00000000-0000-4000-8000-000000000001',
  format: 'igrat',
  source: 'bot',
  task: 'Учусь играть на Пудже: промахнулся хуком',
  createdAt: '2026-10-19T10:00:00.000Z',
  versions: 2,
  approved: true,
  edited: true,
  feedbackCount: 1,
  costUsd: 0.025
};
const chain: AiDraftChainDto = {
  draft,
  truncated: false,
  versions: [
    {
      id: draft.id,
      parentId: null,
      kind: 'draft',
      status: 'ready',
      result: 'draft',
      question: null,
      errorCode: null,
      model: 'gpt-6.1-sol',
      costUsd: 0.02,
      createdAt: '2026-10-19T10:00:00.000Z',
      texts: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          provenance: 'AI_DRAFT',
          text: 'Первый вариант.',
          editRatio: null,
          postId: null,
          createdAt: '2026-10-19T10:00:00.000Z'
        }
      ],
      feedback: [{ kind: 'weak_hook', note: 'Начало вялое', createdAt: '2026-10-19T10:01:00.000Z' }]
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      parentId: draft.id,
      kind: 'rewrite',
      status: 'ready',
      result: 'draft',
      question: null,
      errorCode: null,
      model: 'gpt-6.1-sol',
      costUsd: 0.005,
      createdAt: '2026-10-19T10:02:00.000Z',
      texts: [
        {
          id: '00000000-0000-4000-8000-000000000013',
          provenance: 'OWNER_APPROVED',
          text: 'Моя версия.',
          editRatio: 0.4,
          postId: null,
          createdAt: '2026-10-19T10:03:00.000Z'
        }
      ],
      feedback: []
    }
  ]
};

const mount = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AiDraftHistory />
    </QueryClientProvider>
  );

describe('AI draft history', () => {
  it('lists drafts with their totals and opens one with every version, text and verdict', async () => {
    server.use(
      http.get('*/api/v1/ai/drafts', () =>
        HttpResponse.json({ items: [draft], page: 1, totalCount: 1, capped: false })
      ),
      http.get('*/api/v1/ai/drafts/:id', () => HttpResponse.json(chain))
    );
    mount();
    expect(await screen.findByText('Учусь играть на Пудже: промахнулся хуком')).toBeTruthy();
    const row = screen.getByRole('row', { name: /Учусь играть на Пудже/ });
    expect(row.textContent).toContain('Одобрен с правками · Отзывов: 1');
    expect(row.textContent).toContain('$0.0250');
    await userEvent.click(screen.getByText('Учусь играть на Пудже: промахнулся хуком'));
    expect(await screen.findByText('Первый вариант.')).toBeTruthy();
    expect(screen.getByText('Одобрено · изменено 40%')).toBeTruthy();
    expect(screen.getByText(/«Начало вялое»/)).toBeTruthy();
    expect(screen.getByText(/Переделка · .* · gpt-6\.1-sol · \$0\.0050/)).toBeTruthy();
  });

  it('asks the server for the bot by default and for the filters the owner picks', async () => {
    const asked: string[] = [];
    server.use(
      http.get('*/api/v1/ai/drafts', ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ items: [draft], page: 1, totalCount: 1, capped: false });
      })
    );
    mount();
    await screen.findByText('Учусь играть на Пудже: промахнулся хуком');
    expect(asked[0]).toBe('');
    await userEvent.click(screen.getByRole('button', { name: /Откуда/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Контрольные прогоны' }));
    await waitFor(() => expect(asked.at(-1)).toBe('?source=studio'));
  });

  it('says when there are no drafts yet', async () => {
    server.use(
      http.get('*/api/v1/ai/drafts', () => HttpResponse.json({ items: [], page: 1, totalCount: 0, capped: false }))
    );
    mount();
    expect(await screen.findByText(/Черновиков пока нет/)).toBeTruthy();
  });
});
