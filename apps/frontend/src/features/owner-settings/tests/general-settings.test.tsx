import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { errorBody, ownerOperationsSettings } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { GeneralSettingsEditor, NotificationsSettingsEditor } from '../index';

setupMswServer();

type Body = { revision: number; notifications: { publicationAlerts: boolean; warningsEnabled: boolean } };

describe('notification settings: 409 STALE_REVISION', () => {
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
        <NotificationsSettingsEditor />
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
