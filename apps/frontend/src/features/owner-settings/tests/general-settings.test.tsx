import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { errorBody, ownerOperationsSettings } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { GeneralSettingsEditor } from '../index';

setupMswServer();

type Body = { revision: number; notifications: { publicationAlerts: boolean; warningsEnabled: boolean } };

describe('general settings: 409 STALE_REVISION', () => {
  it('keeps the choice on screen and saves it on the newest revision only after «keep mine»', async () => {
    const puts: Body[] = [];
    let serverRevision = 1;
    server.use(
      http.get('*/api/v1/settings/operations', () =>
        HttpResponse.json(ownerOperationsSettings({ revision: serverRevision }))
      ),
      http.put('*/api/v1/settings/operations', async ({ request }) => {
        const body = (await request.json()) as Body;
        puts.push(body);
        if (body.revision !== serverRevision) {
          return HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 });
        }
        return HttpResponse.json(ownerOperationsSettings({ revision: body.revision + 1 }));
      })
    );
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <GeneralSettingsEditor />
      </QueryClientProvider>
    );
    const toggle = await screen.findByRole('switch', { name: /Ошибки публикаций/ });
    // Another tab saved meanwhile: the revision this page holds is stale.
    serverRevision = 2;
    await user.click(toggle);
    expect(await screen.findByText('Настройки изменились в другой вкладке', {}, { timeout: 3000 })).toBeTruthy();
    expect((screen.getByRole('switch', { name: /Ошибки публикаций/ }) as HTMLInputElement).checked).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Сохранить мой выбор' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({ revision: 2, notifications: { publicationAlerts: false, warningsEnabled: true } });
    await waitFor(() => expect(screen.queryByText('Настройки изменились в другой вкладке')).toBeNull());
  });
});

describe('general settings: the automatic publishing', () => {
  it('saves a typed daily limit only after «Сохранить» and «Вы уверены?» (owner, 23.10.2026)', async () => {
    const puts: { autopublish?: { dailyLimit: number } }[] = [];
    server.use(
      http.get('*/api/v1/settings/operations', () => HttpResponse.json(ownerOperationsSettings({ revision: 1 }))),
      http.put('*/api/v1/settings/operations', async ({ request }) => {
        const body = (await request.json()) as { revision: number; autopublish?: { dailyLimit: number } };
        puts.push(body);
        return HttpResponse.json(ownerOperationsSettings({ revision: body.revision + 1 }));
      })
    );
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <GeneralSettingsEditor />
      </QueryClientProvider>
    );
    const field = await screen.findByRole('textbox', { name: /Лимит в сутки/ });
    await user.clear(field);
    await user.type(field, '30');
    expect(puts).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('до 30 постов в сутки');
    expect(puts).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ autopublish: { dailyLimit: 30 } });
  });
});

describe('autopublish activity', () => {
  it('shows what went out against the limit and why a post was held', async () => {
    server.use(
      http.get('*/api/v1/settings/autopublish/activity', () =>
        HttpResponse.json({
          enabled: true,
          dailyLimit: 10,
          usedToday: 1,
          items: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              at: '2026-10-24T10:05:00.000Z',
              source: 'game_files',
              title: 'Находка в файлах игры',
              outcome: 'held',
              reason: 'limit',
              postId: null
            },
            {
              id: '00000000-0000-4000-8000-000000000001',
              at: '2026-10-24T10:00:00.000Z',
              source: 'steam',
              title: 'Steam уже раздаёт обновление Dota 2',
              outcome: 'published',
              reason: null,
              postId: null
            }
          ]
        })
      )
    );
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <GeneralSettingsEditor />
      </QueryClientProvider>
    );
    const list = await screen.findByRole('list', { name: 'Автопубликация за сутки' });
    expect(screen.getByText('Вышло без вас: 1 из 10.')).toBeTruthy();
    expect(within(list).getByText(/Файлы игры · дневной лимит исчерпан/)).toBeTruthy();
    expect(within(list).getByText('Вышел')).toBeTruthy();
    expect(within(list).getByText('Не вышел')).toBeTruthy();
  });
});
