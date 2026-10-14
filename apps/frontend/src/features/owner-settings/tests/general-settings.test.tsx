import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
