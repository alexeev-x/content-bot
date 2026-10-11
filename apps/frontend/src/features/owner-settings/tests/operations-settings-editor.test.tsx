import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accessToken, errorBody, ownerOperationsSettings } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { OperationsSettingsEditor } from '../ui/OperationsSettingsEditor';

setupMswServer();

beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

afterEach(() => {
  cleanup();
});

function renderEditor() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <OperationsSettingsEditor />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('OperationsSettingsEditor', () => {
  it('saves the owner timezone and notification preferences in one revisioned request', async () => {
    const requests: unknown[] = [];
    server.use(
      http.put('*/api/v1/settings/operations', async ({ request }) => {
        const body: unknown = await request.json();
        requests.push(body);
        return HttpResponse.json(ownerOperationsSettings({ timezone: 'Europe/Chisinau', revision: 1 }));
      })
    );
    const user = userEvent.setup();
    renderEditor();

    const zone = await screen.findByRole('textbox', { name: 'Зона IANA' });
    await user.clear(zone);
    await user.type(zone, 'Europe/Chisinau');
    await user.click(screen.getByRole('switch', { name: /Предупреждения/ }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      revision: 0,
      timezone: 'Europe/Chisinau',
      notifications: { warningsEnabled: false }
    });
    expect((zone as HTMLInputElement).value).toBe('Europe/Chisinau');
  });

  it('keeps local edits visible after a stale revision and makes the reload explicit', async () => {
    server.use(
      http.put('*/api/v1/settings/operations', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
      )
    );
    const user = userEvent.setup();
    renderEditor();

    const zone = await screen.findByRole('textbox', { name: 'Зона IANA' });
    await user.clear(zone);
    await user.type(zone, 'Europe/Chisinau');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText(/изменились в другой вкладке/)).toBeTruthy();
    expect((zone as HTMLInputElement).value).toBe('Europe/Chisinau');

    await user.click(screen.getByRole('button', { name: 'Загрузить актуальные настройки' }));
    await waitFor(() => expect((zone as HTMLInputElement).value).toBe('Europe/Moscow'));
  });
});
