import type { AiUnlinkedScriptsDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { AiUnlinkedScripts } from '../ui/AiUnlinkedScripts';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const mount = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AiUnlinkedScripts />
    </QueryClientProvider>
  );
const reply = (body: AiUnlinkedScriptsDto) =>
  server.use(http.get('*/api/v1/ai/scripts/unlinked', () => HttpResponse.json(body)));

describe('scripts without a video', () => {
  it('lists format, approval date and the excerpt, and says where to link', async () => {
    reply({
      items: [
        {
          revisionId: '00000000-0000-4000-8000-0000000000c1',
          format: 'fidit',
          excerpt: 'Фидил на мидере и понял одну вещь',
          approvedAt: '2026-10-12T10:00:00.000Z'
        }
      ]
    });
    mount();
    expect(await screen.findByText('Фидил на мидере и понял одну вещь')).toBeTruthy();
    expect(screen.getByText('Учу фидить')).toBeTruthy();
    expect(screen.getByText(/одобрен 12 окт/)).toBeTruthy();
    expect(screen.getByText(/привязывается из панели видео в «Аналитике»/)).toBeTruthy();
  });

  it('shows the empty state', async () => {
    reply({ items: [] });
    mount();
    expect(await screen.findByText('Все одобренные сценарии за 60 дней привязаны к видео')).toBeTruthy();
  });

  it('shows a retryable error', async () => {
    server.use(
      http.get('*/api/v1/ai/scripts/unlinked', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }))
    );
    mount();
    expect(await screen.findByText('Не удалось загрузить сценарии без видео.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Повторить/ })).toBeTruthy();
  });
});
