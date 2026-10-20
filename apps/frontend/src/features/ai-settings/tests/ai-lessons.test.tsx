import type { AiLessonDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { AiLessonsList } from '../ui/AiLessonsList';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const asked: AiLessonDto = {
  id: '00000000-0000-4000-8000-0000000000b1',
  text: 'Хук — первым предложением',
  scope: 'telegram',
  status: 'asked',
  origin: 'edit',
  fromRemark: false,
  drafts: 2,
  createdAt: '2026-10-19T10:00:00.000Z'
};
const seen: AiLessonDto = {
  ...asked,
  id: '00000000-0000-4000-8000-0000000000b2',
  text: 'Без смайлов',
  status: 'seen',
  drafts: 1
};

const mount = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AiLessonsList />
    </QueryClientProvider>
  );

describe('AI lessons', () => {
  it('answers an asked lesson here and drops it from the list', async () => {
    const sent: unknown[] = [];
    server.use(
      http.get('*/api/v1/ai/lessons', () => HttpResponse.json({ items: [asked, seen] })),
      http.put('*/api/v1/ai/lessons/:id', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ id: asked.id, status: 'accepted' });
      })
    );
    mount();
    expect(await screen.findByText('Хук — первым предложением')).toBeTruthy();
    expect(screen.getByText('Пост в ТГ · из ваших правок · 2 черновика')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Замечено один раз/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Учитывать' }));
    await waitFor(() => expect(screen.queryByText('Хук — первым предложением')).toBeNull());
    expect(sent).toEqual([{ answer: 'accept' }]);
  });

  it('says why «Учитывать» was refused when the rules are full', async () => {
    server.use(
      http.get('*/api/v1/ai/lessons', () => HttpResponse.json({ items: [asked] })),
      http.put('*/api/v1/ai/lessons/:id', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'LIMIT' }), { status: 409 })
      )
    );
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Учитывать' }));
    expect((await screen.findByRole('alert')).textContent).toContain('максимум правил');
  });

  it('draws nothing while there are no lessons', async () => {
    let asked = false;
    server.use(
      http.get('*/api/v1/ai/lessons', () => {
        asked = true;
        return HttpResponse.json({ items: [] });
      })
    );
    const { container } = mount();
    await waitFor(() => expect(asked).toBe(true));
    expect(container.textContent).toBe('');
  });
});
