import type { AppearanceDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import { errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import type { AppearanceValue } from '../model/appearance-value';
import { ThemeToggle } from '../ui/ThemeToggle';
import { appearance, getAppearance, putAppearance } from './fixtures';

setupMswServer();
afterEach(cleanup);
beforeEach(() => {
  document.documentElement.dataset['theme'] = 'dark';
});

/** Like the real preview: the document follows the value (system resolves to dark in these tests). */
const preview = vi.fn((value: AppearanceValue) => {
  document.documentElement.dataset['theme'] = value.themeMode === 'light' ? 'light' : 'dark';
});

function renderToggle() {
  preview.mockClear();
  const client = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ThemeToggle preview={preview} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { ...view, client, user: userEvent.setup() };
}

/** The enabled button: it is a different element while disabled (no tooltip wrapper), so it is looked up again. */
async function button(name: string) {
  await waitFor(() => expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(false));
  return screen.getByRole('button', { name });
}
const stale = () =>
  http.put('*/api/v1/settings/appearance', () =>
    HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
  );

describe('theme toggle', () => {
  it('names the button after what a press does and stays disabled until the appearance is loaded', async () => {
    server.use(getAppearance(appearance({ themeMode: 'dark' })));
    renderToggle();
    expect(screen.getByRole('button', { name: 'Включить светлую тему' }).hasAttribute('disabled')).toBe(true);
    expect(await button('Включить светлую тему')).toBeTruthy();
  });

  it('flips the theme at once, saves only themeMode on the cached revision and announces it', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      getAppearance(appearance({ themeMode: 'dark', revision: 4, lightAccent: { kind: 'preset', id: 'indigo' } })),
      putAppearance((b) => (body = b as Record<string, unknown>))
    );
    const { user, client } = renderToggle();
    await user.click(await button('Включить светлую тему'));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(screen.getByRole('status').textContent).toBe('Светлая тема');
    expect(await button('Включить тёмную тему')).toBeTruthy();
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({ revision: 4, themeMode: 'light', lightAccent: { kind: 'preset', id: 'indigo' } });
    // The cache takes the server's answer.
    await waitFor(() =>
      expect(client.getQueryData<AppearanceDto>(['appearance', 'detail'])).toMatchObject({
        revision: 5,
        themeMode: 'light'
      })
    );
  });

  it('turns «Системная» into the opposite of the theme on screen', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      getAppearance(appearance({ themeMode: 'system' })),
      putAppearance((b) => (body = b as never))
    );
    const { user } = renderToggle();
    await user.click(await button('Включить светлую тему'));
    await waitFor(() => expect(body).toMatchObject({ themeMode: 'light' }));
    document.documentElement.dataset['theme'] = 'light';
    await user.click(await button('Включить тёмную тему'));
    await waitFor(() => expect(body).toMatchObject({ themeMode: 'dark' }));
  });

  it('retries once on 409 with the newest revision, silently', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let first = true;
    // The other device saved in the meantime: after the first PUT the server is at revision 7.
    let serverRevision = 1;
    server.use(
      http.get('*/api/v1/settings/appearance', () =>
        HttpResponse.json(appearance({ themeMode: 'dark', revision: serverRevision }))
      ),
      http.put('*/api/v1/settings/appearance', async ({ request }) => {
        const sent = (await request.json()) as Record<string, unknown> & { revision: number };
        bodies.push(sent);
        if (first) {
          first = false;
          serverRevision = 7;
          return HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 });
        }
        return HttpResponse.json({ ...sent, revision: sent.revision + 1, updatedAt: '2026-10-07T09:00:00.000Z' });
      })
    );
    const { user } = renderToggle();
    await user.click(await button('Включить светлую тему'));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toMatchObject({ revision: 1, themeMode: 'light' });
    expect(bodies[1]).toMatchObject({ revision: 7, themeMode: 'light' });
    expect(screen.queryByText('Не удалось сохранить тему. Вернули прежнюю.')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('reverts and shows a toast when the save fails', async () => {
    server.use(
      getAppearance(appearance({ themeMode: 'dark' })),
      http.put('*/api/v1/settings/appearance', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }))
    );
    const { user } = renderToggle();
    await user.click(await button('Включить светлую тему'));
    expect(await screen.findByText('Не удалось сохранить тему. Вернули прежнюю.')).toBeTruthy();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(await button('Включить светлую тему')).toBeTruthy();
  });

  it('offers «Повторить» on the failure toast and the press saves the toggle again', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let fail = true;
    server.use(
      getAppearance(appearance({ themeMode: 'dark', revision: 3 })),
      http.put('*/api/v1/settings/appearance', async ({ request }) => {
        const sent = (await request.json()) as Record<string, unknown> & { revision: number };
        bodies.push(sent);
        if (fail) return HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 });
        return HttpResponse.json({ ...sent, revision: sent.revision + 1, updatedAt: '2026-10-07T09:00:00.000Z' });
      })
    );
    const { user } = renderToggle();
    await user.click(await button('Включить светлую тему'));
    const retry = await screen.findByRole('button', { name: 'Повторить' });
    expect(document.documentElement.dataset['theme']).toBe('dark');
    fail = false;
    await user.click(retry);
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ themeMode: 'light' });
    expect(document.documentElement.dataset['theme']).toBe('light');
    await waitFor(() => expect(screen.queryByText('Не удалось сохранить тему. Вернули прежнюю.')).toBeNull());
  });

  it('reverts when the 409 retry fails too', async () => {
    server.use(getAppearance(appearance({ themeMode: 'dark' })), stale());
    const { user } = renderToggle();
    await user.click(await button('Включить светлую тему'));
    expect(await screen.findByText('Не удалось сохранить тему. Вернули прежнюю.')).toBeTruthy();
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('serializes presses: the second save starts after the first and the last press wins', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      getAppearance(appearance({ themeMode: 'dark', revision: 2 })),
      http.put('*/api/v1/settings/appearance', async ({ request }) => {
        const sent = (await request.json()) as Record<string, unknown> & { revision: number };
        bodies.push(sent);
        if (bodies.length === 1) await gate;
        return HttpResponse.json({ ...sent, revision: sent.revision + 1, updatedAt: '2026-10-07T09:00:00.000Z' });
      })
    );
    const { user } = renderToggle();
    await user.click(await button('Включить светлую тему'));
    await user.click(await button('Включить тёмную тему'));
    expect(bodies).toHaveLength(1);
    release?.();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toMatchObject({ revision: 2, themeMode: 'light' });
    expect(bodies[1]).toMatchObject({ revision: 3, themeMode: 'dark' });
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('works from the keyboard and keeps focus on the button', async () => {
    server.use(getAppearance(appearance({ themeMode: 'dark' })), putAppearance());
    const { user } = renderToggle();
    const toggle = await button('Включить светлую тему');
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    await user.keyboard('{Enter}');
    expect(document.documentElement.dataset['theme']).toBe('light');
    await user.keyboard(' ');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Включить/ }));
  });

  it('stays disabled with a clear name when the appearance cannot be loaded', async () => {
    server.use(
      http.get('*/api/v1/settings/appearance', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }))
    );
    renderToggle();
    const toggle = await screen.findByRole('button', { name: 'Не удалось загрузить оформление' });
    expect(toggle.hasAttribute('disabled')).toBe(true);
  });
});
