import type { AiRuleDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { accessToken, errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { AiRulesList } from '../ui/AiRulesList';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const owner: AiRuleDto = {
  id: '00000000-0000-4000-8000-0000000000b1',
  text: 'Не начинай с описания героя',
  scope: 'igrat',
  source: 'owner',
  status: 'active',
  inUse: true,
  approvedAt: null,
  createdAt: '2026-10-17T10:00:00.000Z',
  supports: 0,
  contradicts: 0,
  evidence: []
};
const supported: AiRuleDto = {
  id: '00000000-0000-4000-8000-0000000000b2',
  text: 'Начинай с промаха и его цены',
  scope: 'igrat',
  source: 'analysis',
  status: 'supported',
  inUse: false,
  approvedAt: null,
  createdAt: '2026-10-10T10:00:00.000Z',
  supports: 2,
  contradicts: 0,
  evidence: [
    {
      key: 'script:00000000-0000-4000-8000-0000000000c1',
      polarity: 'support',
      origin: true,
      scriptExcerpt: 'Промахнулся хуком и проиграл линию',
      createdAt: '2026-10-10T10:00:00.000Z'
    }
  ]
};

const mount = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <AiRulesList />
      </ToastProvider>
    </QueryClientProvider>
  );

describe('AI rules list', () => {
  it('shows each rule with its state and puts an approved rule in use from the server answer', async () => {
    const actions: unknown[] = [];
    server.use(
      http.get('*/api/v1/ai/rules', () => HttpResponse.json({ items: [owner, supported], inUseMax: 15 })),
      http.put('*/api/v1/ai/rules/:id', async ({ request }) => {
        actions.push(await request.json());
        return HttpResponse.json({ ...supported, inUse: true, approvedAt: '2026-10-19T10:00:00.000Z' });
      })
    );
    mount();
    expect(await screen.findByText('Не начинай с описания героя')).toBeTruthy();
    expect(screen.getByText(/Ваше правило · Работает/)).toBeTruthy();
    expect(screen.getByText(/Из аналитики · Подтверждено: ждёт вашего решения/)).toBeTruthy();
    expect(screen.getByText('Роликов выше обычного: 2 · ниже: 0')).toBeTruthy();
    expect((screen.getByRole('switch', { name: 'Учитывать' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Учитывать' }));
    await waitFor(() => expect(screen.getByText(/Из аналитики · Учитывается/)).toBeTruthy());
    expect(actions).toEqual([{ action: 'approve' }]);
    expect(screen.getByRole('button', { name: 'Отключить' })).toBeTruthy();
  });

  it('says why a rule could not be switched on', async () => {
    server.use(
      http.get('*/api/v1/ai/rules', () =>
        HttpResponse.json({ items: [{ ...owner, status: 'disabled', inUse: false }], inUseMax: 15 })
      ),
      http.put('*/api/v1/ai/rules/:id', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'LIMIT' }), { status: 409 })
      )
    );
    mount();
    await userEvent.click(await screen.findByRole('switch', { name: 'Учитывать' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Уже 15 правил в работе. Отключите лишнее и попробуйте снова.'
    );
    expect((screen.getByRole('switch', { name: 'Учитывать' }) as HTMLInputElement).checked).toBe(false);
  });

  it('takes a wrong observation out and shows the rule as the server counted it', async () => {
    let removed = '';
    server.use(
      http.get('*/api/v1/ai/rules', () => HttpResponse.json({ items: [supported], inUseMax: 15 })),
      http.delete('*/api/v1/ai/rules/:id/evidence/:key', ({ params }) => {
        removed = String(params['key']);
        return HttpResponse.json({ ...supported, status: 'candidate', supports: 1, evidence: [] });
      })
    );
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Ролики (1)' }));
    expect(screen.getByText('Промахнулся хуком и проиграл линию')).toBeTruthy();
    expect(screen.getByText(/до правила/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Убрать это наблюдение' }));
    await waitFor(() => expect(screen.getByText(/Кандидат: ждёт подтверждений/)).toBeTruthy());
    expect(removed).toBe('script:00000000-0000-4000-8000-0000000000c1');
  });
});
