import type { AiHypothesesDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { AiHypothesesList } from '../ui/AiHypothesesList';

// The analyst's hypotheses in «Настройки → ИИ» (owner, 20.10.2026): read-only, with the reason and the bot's question.

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const list: AiHypothesesDto = {
  items: [
    {
      code: 2,
      text: 'Если хук — спорный тезис, пересылок больше',
      scope: 'fidit',
      kind: 'writing',
      status: 'supported',
      confidence: 'medium',
      note: 'БКБ: пересылки 5.07% против 0.19% у героевых',
      asked: true,
      updatedAt: '2026-10-20T07:00:00.000Z'
    },
    {
      code: 1,
      text: 'Герои-керри набирают больше саппортов',
      scope: 'igrat',
      kind: 'topic',
      status: 'open',
      confidence: 'low',
      note: null,
      asked: false,
      updatedAt: '2026-10-19T07:00:00.000Z'
    }
  ]
};

function renderList() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AiHypothesesList />
    </QueryClientProvider>
  );
}

describe('AI hypotheses list', () => {
  it('shows each hypothesis with its number, rubric, kind, status, reason and the question', async () => {
    server.use(http.get('*/api/v1/ai/hypotheses', () => HttpResponse.json(list)));
    renderList();
    expect(await screen.findByText('H2. Если хук — спорный тезис, пересылок больше')).toBeTruthy();
    expect(screen.getByText(/«Учу фидить» · Как писать · Подтверждается, уверенность средняя/)).toBeTruthy();
    expect(screen.getByText('БКБ: пересылки 5.07% против 0.19% у героевых')).toBeTruthy();
    expect(screen.getByText('Спросил в боте «Учитывать?»')).toBeTruthy();
    expect(screen.getByText(/«Учусь играть» · О чём снимать · Проверяется, уверенность низкая/)).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('says there are none yet', async () => {
    server.use(http.get('*/api/v1/ai/hypotheses', () => HttpResponse.json({ items: [] })));
    renderList();
    expect(await screen.findByText('Гипотез пока нет: они появятся в утренних разборах.')).toBeTruthy();
  });

  it('shows a load error with a retry', async () => {
    server.use(
      http.get('*/api/v1/ai/hypotheses', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x', requestId: 'r' } }, { status: 500 })
      )
    );
    renderList();
    expect(await screen.findByText('Не удалось загрузить гипотезы.', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Повтор/ })).toBeTruthy();
  });
});
