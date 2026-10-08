import type { BotStatusDto, DashboardLayoutDto, DashboardWidget } from '@alexeev/contracts';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboard, todayRow } from '../test/dashboard-fixtures';
import { DEFAULT_WIDGETS, readCachedLayout, sequence } from '../features/dashboard';
import { clearSession, setSession } from '../shared/api/session';
import { accessToken } from '../test/fixtures';
import { server, setupMswServer } from '../test/msw';
import { renderPage } from '../test/render-app';
import { clearViewport, setViewport } from '../test/viewport';
import { DashboardPage } from './DashboardPage';

// Counts how often the grid library is imported: the view mode must never do it.
const gridLibrary = vi.hoisted(() => ({ imports: 0 }));
vi.mock('react-grid-layout', async (importOriginal) => {
  gridLibrary.imports += 1;
  return importOriginal();
});

process.env['TZ'] = 'Europe/Chisinau';

setupMswServer();

const HOOK = 'https://app.example.test/webhooks/telegram';
const botStatus: BotStatusDto = {
  missing: [],
  botUsername: 'alexeev_bot',
  expectedUrl: HOOK,
  webhook: { url: HOOK, pointsHere: true, pendingUpdateCount: 0, lastErrorAt: null, lastErrorMessage: null }
};

const w = (type: DashboardWidget['type'], x: number, y: number, ww: number, h: number): DashboardWidget => ({
  id: type,
  type,
  x,
  y,
  w: ww,
  h
});

type Calls = { layoutPuts: unknown[]; requests: string[] };

/** Serves the page's endpoints; `layout` is what GET returns (a function so a test can change it between calls). */
function serve(layout: DashboardLayoutDto | (() => DashboardLayoutDto)): Calls {
  const calls: Calls = { layoutPuts: [], requests: [] };
  const note = (request: Request) => calls.requests.push(new URL(request.url).pathname);
  server.use(
    http.get('*/api/v1/health', () =>
      HttpResponse.json({
        status: 'ok',
        service: 'content-bot',
        publishingEnabled: false,
        time: '2026-10-07T10:05:00.000Z'
      })
    ),
    http.get('*/api/v1/bot/status', () => HttpResponse.json(botStatus)),
    http.get('*/api/v1/settings/dashboard-layout', ({ request }) => {
      note(request);
      return HttpResponse.json(typeof layout === 'function' ? layout() : layout);
    }),
    http.get('*/api/v1/dashboard', ({ request }) => {
      note(request);
      return HttpResponse.json(dashboard({ today: [todayRow()], todayTotal: 1 }));
    }),
    http.get('*/api/v1/posts', ({ request }) => {
      note(request);
      return HttpResponse.json({ items: [], nextCursor: null, archivedCount: 0 });
    }),
    http.get('*/api/v1/publications', ({ request }) => {
      note(request);
      return HttpResponse.json({ items: [], nextCursor: null });
    }),
    http.get('*/api/v1/destinations', ({ request }) => {
      note(request);
      return HttpResponse.json({ items: [], nextCursor: null });
    }),
    http.get('*/api/v1/incidents', ({ request }) => {
      note(request);
      return HttpResponse.json({ items: [], nextCursor: null, openCount: 0 });
    })
  );
  return calls;
}

/** PUT handler that echoes the saved layout with the next revision. */
function servePut(calls: Calls) {
  server.use(
    http.put('*/api/v1/settings/dashboard-layout', async ({ request }) => {
      const body = (await request.json()) as { revision: number; widgets: DashboardWidget[] };
      calls.layoutPuts.push(body);
      return HttpResponse.json({ revision: body.revision + 1, widgets: body.widgets });
    })
  );
}

const cell = (type: string) => document.querySelector<HTMLElement>(`[data-widget="${type}"]`);
const place = (type: string) => {
  const style = cell(type)?.style;
  return style ? [style.gridColumn, style.gridRow] : undefined;
};

async function renderDashboard() {
  const view = await renderPage(<DashboardPage />);
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

// jsdom has no layout: every element measures 1000 px wide, and the observer is a stub the tests can fire.
const observers: Array<{ callback: ResizeObserverCallback; target?: Element }> = [];
class FakeResizeObserver {
  private readonly entry: { callback: ResizeObserverCallback; target?: Element };
  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.target = target;
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 100));
  clearSession();
  setSession(accessToken());
  setViewport(1280);
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
  clearViewport();
  window.localStorage.clear();
});

describe('layout in the view mode', () => {
  it('applies the default layout while the owner never saved (revision 0)', async () => {
    serve({ revision: 0, widgets: [] });
    await renderDashboard();
    for (const widget of DEFAULT_WIDGETS) {
      expect(place(widget.type)).toEqual([`${widget.x + 1} / span ${widget.w}`, `${widget.y + 1} / span ${widget.h}`]);
    }
    expect(screen.getByRole('region', { name: 'Черновики' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Неделя' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Быстрые действия' })).toBeTruthy();
  });

  it('draws the saved widgets at their saved cells and nothing else', async () => {
    serve({ revision: 4, widgets: [w('today', 4, 2, 8, 3), w('kpi-sent', 0, 0, 3, 2)] });
    await renderDashboard();
    expect(document.querySelectorAll('[data-widget]')).toHaveLength(2);
    expect(place('today')).toEqual(['5 / span 8', '3 / span 3']);
    expect(place('kpi-sent')).toEqual(['1 / span 3', '1 / span 2']);
    expect(screen.queryByRole('region', { name: 'Система' })).toBeNull();
  });

  it('an empty saved layout is shown as is, not replaced by the default', async () => {
    serve({ revision: 2, widgets: [] });
    await renderDashboard();
    expect(document.querySelectorAll('[data-widget]')).toHaveLength(0);
    expect(screen.getByText('Обзор пуст')).toBeTruthy();
  });

  it('asks only for the data of the widgets on the page', async () => {
    const onlyDrafts = serve({ revision: 1, widgets: [w('drafts', 0, 0, 4, 4)] });
    await renderDashboard();
    await screen.findByText('Черновиков нет');
    expect(onlyDrafts.requests).toContain('/api/v1/posts');
    for (const path of ['/api/v1/dashboard', '/api/v1/publications', '/api/v1/destinations', '/api/v1/incidents']) {
      expect(onlyDrafts.requests).not.toContain(path);
    }
    cleanup();
    window.localStorage.clear();

    const onlyKpi = serve({ revision: 1, widgets: [w('kpi-today', 0, 0, 3, 2)] });
    await renderDashboard();
    expect(onlyKpi.requests).toContain('/api/v1/dashboard');
    for (const path of ['/api/v1/posts', '/api/v1/publications', '/api/v1/destinations', '/api/v1/incidents']) {
      expect(onlyKpi.requests).not.toContain(path);
    }
  });

  it('paints the cached layout before the server answers, so nothing jumps', async () => {
    const saved = { revision: 5, widgets: [w('upcoming', 6, 0, 6, 4)] };
    window.localStorage.setItem('ui-dashboard-layout', JSON.stringify(saved));
    const gate: { open: () => void } = { open: () => {} };
    const held = new Promise<void>((resolve) => {
      gate.open = resolve;
    });
    serve(saved);
    server.use(
      http.get('*/api/v1/settings/dashboard-layout', async () => {
        await held;
        return HttpResponse.json(saved);
      })
    );
    await renderPage(<DashboardPage />);
    expect(place('upcoming')).toEqual(['7 / span 6', '1 / span 4']);
    expect(cell('attention')).toBeNull();
    gate.open();
    await waitFor(() => expect(place('upcoming')).toEqual(['7 / span 6', '1 / span 4']));
  });

  it('keeps the cache in step with the server and ignores a damaged one', async () => {
    window.localStorage.setItem('ui-dashboard-layout', '{not json');
    expect(readCachedLayout()).toBeNull();
    serve({ revision: 3, widgets: [w('week', 0, 0, 8, 3)] });
    await renderDashboard();
    await waitFor(() => expect(readCachedLayout()?.revision).toBe(3));
  });

  it('never loads the grid library in the view mode', async () => {
    serve({ revision: 0, widgets: [] });
    await renderDashboard();
    expect(gridLibrary.imports).toBe(0);
  });
});

describe('week and incidents widgets', () => {
  it('shows seven days with zeros for empty ones, each opening the scheduled list', async () => {
    const calls = serve({ revision: 1, widgets: [w('week', 0, 0, 8, 3)] });
    const soon = new Date();
    soon.setHours(soon.getHours() + 1);
    server.use(
      http.get('*/api/v1/publications', ({ request }) => {
        calls.requests.push('publications');
        const url = new URL(request.url);
        expect(url.searchParams.get('status')).toBe('scheduled');
        expect(url.searchParams.get('order')).toBe('asc');
        return HttpResponse.json({
          items: [
            {
              id: '33333333-3333-4333-8333-000000000001',
              postId: '22222222-2222-4222-8222-000000000001',
              postRevision: 1,
              destinationId: '11111111-1111-4111-8111-000000000001',
              status: 'scheduled',
              scheduledAt: new Date(Date.now() + 60_000).toISOString(),
              timezone: 'Europe/Chisinau',
              revision: 0,
              createdAt: '2026-10-07T07:00:00.000Z',
              updatedAt: '2026-10-07T07:00:00.000Z'
            }
          ],
          nextCursor: null
        });
      })
    );
    await renderDashboard();
    const week = await screen.findByRole('region', { name: 'Неделя' });
    const days = await within(week).findAllByRole('link', { name: /публикаций|нет публикаций/ });
    expect(days).toHaveLength(7);
    expect(days.filter((day) => day.getAttribute('aria-label')?.includes('нет публикаций'))).toHaveLength(6);
    expect(days[0]?.getAttribute('href')).toContain('view=upcoming');
    expect(within(week).getByText(/без фильтра по дате/)).toBeTruthy();
  });

  it('counts open incidents and the ones closed in the last 7 days', async () => {
    serve({ revision: 1, widgets: [w('incidents', 0, 0, 4, 3)] });
    const recent = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString();
    const old = new Date(Date.now() - 20 * 24 * 3_600_000).toISOString();
    const incident = (n: number, resolvedAt: string) => ({
      id: `44444444-4444-4444-8444-00000000000${n}`,
      kind: 'publish_failed',
      code: 'DESTINATION_UNAVAILABLE',
      occurredAt: '2026-10-01T10:00:00.000Z',
      resolvedAt,
      attemptCount: 1
    });
    server.use(
      http.get('*/api/v1/incidents', ({ request }) => {
        const state = new URL(request.url).searchParams.get('state');
        return HttpResponse.json({
          items: state === 'resolved' ? [incident(1, recent), incident(2, recent), incident(3, old)] : [],
          nextCursor: null,
          openCount: 2
        });
      })
    );
    await renderDashboard();
    const panel = await screen.findByRole('region', { name: 'Инциденты' });
    await waitFor(() => expect(within(panel).getByText('Закрыто за 7 дней').nextElementSibling?.textContent).toBe('2'));
    expect(within(panel).getByText('Открытые').nextElementSibling?.textContent).toBe('2');
  });
});

describe('editing on a desktop', () => {
  const saved: DashboardLayoutDto = { revision: 3, widgets: [w('today', 0, 0, 8, 4), w('upcoming', 8, 0, 4, 4)] };

  async function startEditing() {
    const calls = serve(saved);
    servePut(calls);
    const user = userEvent.setup();
    const view = await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await screen.findByRole('group', { name: 'Настройка обзора' });
    return { user, calls, ...view };
  }

  async function choose(user: ReturnType<typeof userEvent.setup>, widget: string, action: string) {
    await user.click(await screen.findByRole('button', { name: `Действия: ${widget}` }));
    await user.click(await screen.findByRole('menuitem', { name: action }));
  }

  it('moves a widget with the keyboard menu, announces it and saves with the loaded revision', async () => {
    const { user, calls } = await startEditing();
    const trigger = await screen.findByRole('button', { name: 'Действия: Сегодня' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'Переместить вправо' }));
    // The position is announced politely and focus is back on the trigger.
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('колонка 5, ширина 8'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Действия: Сегодня' })));

    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(calls.layoutPuts).toHaveLength(1));
    const body = calls.layoutPuts[0] as { revision: number; widgets: DashboardWidget[] };
    expect(body.revision).toBe(3);
    expect(body.widgets.find((item) => item.id === 'today')).toMatchObject({ x: 4, y: 0, w: 8, h: 4 });
    expect(body.widgets.find((item) => item.id === 'upcoming')).toMatchObject({ x: 0, y: 0, w: 4, h: 4 });
    // Saved: the edit mode is gone and the page shows the saved geometry.
    await screen.findByRole('button', { name: 'Настроить' });
    expect(place('today')).toEqual(['5 / span 8', '1 / span 4']);
    expect(readCachedLayout()?.revision).toBe(4);
  });

  it('resizes with «Шире» and respects the minimum with «Уже»', async () => {
    const { user, calls } = await startEditing();
    await choose(user, 'Ближайшие', 'Шире');
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(calls.layoutPuts).toHaveLength(1));
    const body = calls.layoutPuts[0] as { widgets: DashboardWidget[] };
    expect(body.widgets.find((item) => item.id === 'upcoming')?.w).toBe(5);
    expect(
      body.widgets.some((a, i) =>
        body.widgets.slice(i + 1).some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
      )
    ).toBe(false);
  });

  it("on 409 keeps the edits behind a banner, and «Загрузить заново» takes the other window's layout", async () => {
    let current = saved;
    serve(() => current);
    server.use(
      http.put('*/api/v1/settings/dashboard-layout', () =>
        HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'stale', requestId: 'req-1', details: { reason: 'STALE_REVISION' } } },
          { status: 409 }
        )
      )
    );
    const user = userEvent.setup();
    await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await choose(user, 'Сегодня', 'Переместить вправо');
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(await screen.findByText('Раскладку изменили в другом окне')).toBeTruthy();
    // The draft is still on screen, not discarded.
    expect(screen.getByRole('group', { name: 'Настройка обзора' })).toBeTruthy();

    current = { revision: 4, widgets: [w('system', 0, 0, 4, 4)] };
    await user.click(screen.getByRole('button', { name: 'Загрузить заново' }));
    await screen.findByRole('button', { name: 'Настроить' });
    expect(place('system')).toEqual(['1 / span 4', '1 / span 4']);
    expect(cell('today')).toBeNull();
  });

  it('on 409 «Сохранить мою» re-bases the draft on the newest revision and saves it', async () => {
    let revision = 3;
    const bodies: Array<{ revision: number }> = [];
    serve(() => ({ ...saved, revision }));
    server.use(
      http.put('*/api/v1/settings/dashboard-layout', async ({ request }) => {
        const body = (await request.json()) as { revision: number; widgets: DashboardWidget[] };
        bodies.push(body);
        if (body.revision !== 5) {
          revision = 5;
          return HttpResponse.json(
            {
              error: { code: 'CONFLICT', message: 'stale', requestId: 'req-1', details: { reason: 'STALE_REVISION' } }
            },
            { status: 409 }
          );
        }
        return HttpResponse.json({ revision: 6, widgets: body.widgets });
      })
    );
    const user = userEvent.setup();
    await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await choose(user, 'Сегодня', 'Переместить вправо');
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await screen.findByText('Раскладку изменили в другом окне');
    await user.click(screen.getByRole('button', { name: 'Сохранить мою' }));
    await waitFor(() => expect(screen.queryByText('Раскладку изменили в другом окне')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await screen.findByRole('button', { name: 'Настроить' });
    expect(bodies.map((body) => body.revision)).toEqual([3, 5]);
  });

  it('shows the server reason of a 400 and keeps the draft', async () => {
    serve(saved);
    server.use(
      http.put('*/api/v1/settings/dashboard-layout', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'bad',
              requestId: 'req-2',
              details: { reason: 'WIDGETS_OVERLAP' }
            }
          },
          { status: 400 }
        )
      )
    );
    const user = userEvent.setup();
    await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await choose(user, 'Сегодня', 'Переместить вправо');
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(await screen.findByText('Не удалось сохранить раскладку')).toBeTruthy();
    expect(screen.getByText('Виджеты пересекаются.')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Настройка обзора' })).toBeTruthy();
  });

  it('removes a widget and brings it back with the undo toast', async () => {
    const { user } = await startEditing();
    await choose(user, 'Сегодня', 'Удалить');
    expect(screen.queryByRole('group', { name: 'Сегодня' })).toBeNull();
    expect((await screen.findAllByText('Виджет «Сегодня» удалён')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(await screen.findByRole('group', { name: 'Сегодня' })).toBeTruthy();
  });

  it('asks before leaving with unsaved edits; staying keeps the draft, leaving goes on', async () => {
    const calls = serve(saved);
    servePut(calls);
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await choose(user, 'Сегодня', 'Удалить');
    void router.navigate({ to: '/posts' });
    const confirm = await screen.findByRole('alertdialog', { name: 'Уйти без сохранения?' });
    await user.click(within(confirm).getByRole('button', { name: 'Продолжить настройку' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Уйти без сохранения?' })).toBeNull());
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('group', { name: 'Сегодня' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Настройка обзора' })).toBeTruthy();
    void router.navigate({ to: '/posts' });
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Уйти без сохранения?' })).getByRole('button', {
        name: 'Уйти'
      })
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
  });

  it('an undo toast of a finished edit session restores nothing in the next one', async () => {
    const calls = serve(saved);
    servePut(calls);
    const user = userEvent.setup();
    await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await choose(user, 'Сегодня', 'Удалить');
    const undo = await screen.findByRole('button', { name: 'Вернуть' });
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await screen.findByRole('button', { name: 'Настроить' });
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await screen.findByRole('group', { name: 'Настройка обзора' });
    await user.click(undo);
    expect(screen.queryByRole('group', { name: 'Сегодня' })).toBeNull();
  });

  it('shows the real widget content while editing, inert, and a widget added in the editor fetches once', async () => {
    const { user, calls } = await startEditing();
    const title = await screen.findByText('Вечерний разбор');
    // The content is the real one and nothing in it can be pressed or focused.
    expect(title.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Действия: Сегодня' }).closest('[inert]')).toBeNull();
    expect(calls.requests.filter((path) => path === '/api/v1/posts')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Добавить виджет' }));
    await user.click(await screen.findByRole('button', { name: 'Добавить: Черновики' }));
    await screen.findByText('Черновиков нет');
    expect(calls.requests.filter((path) => path === '/api/v1/posts')).toHaveLength(1);
  });

  it('adds from the catalog: placed widgets are not offered, planned ones are «скоро» and cannot be added', async () => {
    const { user, calls } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Добавить виджет' }));
    const catalog = await screen.findByRole('dialog', { name: 'Добавить виджет' });
    const placed = within(catalog).getByText('Сегодня').closest('li');
    expect(placed && within(placed).queryByRole('button')).toBeNull();
    expect(placed && within(placed).getByText('Уже на странице')).toBeTruthy();
    for (const name of ['Аналитика канала', 'Топ постов', 'Dota Pulse', 'Источники', 'Автоматизации', 'Медиатека']) {
      const item = within(catalog).getByText(name).closest('li');
      expect(item && within(item).getByText('скоро')).toBeTruthy();
      expect(item && within(item).queryByRole('button')).toBeNull();
    }
    expect(within(catalog).getAllByRole('button', { name: /^Добавить: / })).toHaveLength(13);

    await user.click(within(catalog).getByRole('button', { name: 'Добавить: Черновики' }));
    expect(await screen.findByRole('group', { name: 'Черновики' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(calls.layoutPuts).toHaveLength(1));
    const body = calls.layoutPuts[0] as { widgets: DashboardWidget[] };
    expect(body.widgets.map((item) => item.type).sort()).toEqual(['drafts', 'today', 'upcoming']);
  });

  it('asks before throwing away edits, and leaves at once when nothing changed', async () => {
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await screen.findByRole('button', { name: 'Настроить' });

    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    await choose(user, 'Сегодня', 'Удалить');
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Отменить правки?' });
    await user.click(within(confirm).getByRole('button', { name: 'Продолжить настройку' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Отменить правки?' })).toBeNull());
    expect(screen.getByRole('group', { name: 'Настройка обзора' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Отменить правки?' })).getByRole('button', {
        name: 'Отменить правки'
      })
    );
    await screen.findByRole('button', { name: 'Настроить' });
    expect(place('today')).toEqual(['1 / span 8', '1 / span 4']);
  });

  it('«Сбросить к стандартному» puts the default layout in the draft; saving is still explicit', async () => {
    const { user, calls } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Сбросить к стандартному' }));
    expect(calls.layoutPuts).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(calls.layoutPuts).toHaveLength(1));
    const body = calls.layoutPuts[0] as { revision: number; widgets: DashboardWidget[] };
    expect(body.revision).toBe(3);
    expect(body.widgets).toHaveLength(DEFAULT_WIDGETS.length);
  });

  it('sizes the grid from its own container and follows it when the container changes', async () => {
    await startEditing();
    const item = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.react-grid-item');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    // 8 of 12 columns of a 1000 px container with 16 px gaps: (1000 - 11 * 16) / 12 * 8 + 7 * 16, rounded.
    expect(item.style.width).toBe('661px');
    const host = observers.find((entry) => entry.target?.classList.toString().includes('gridHost'));
    expect(host).toBeDefined();
    act(() => {
      host?.callback([{ contentRect: { width: 600 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    await waitFor(() => expect(item.style.width).toBe('395px'));
  });

  it('loads the grid library once editing started, and fetches no widget data while editing', async () => {
    const { calls } = await startEditing();
    await waitFor(() => expect(gridLibrary.imports).toBeGreaterThan(0));
    const before = calls.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls.requests.length).toBe(before);
  });
});

describe('an empty Обзор', () => {
  it('offers the default layout and the catalog, each starting the edit mode', async () => {
    serve({ revision: 2, widgets: [] });
    const user = userEvent.setup();
    await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Сбросить к стандартному' }));
    await screen.findByRole('group', { name: 'Настройка обзора' });
    expect(screen.getAllByRole('group', { name: /./ }).length).toBeGreaterThan(DEFAULT_WIDGETS.length);
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await user.click(
      await screen
        .findByRole('alertdialog', { name: 'Отменить правки?' })
        .then((d) => within(d).getByRole('button', { name: 'Отменить правки' }))
    );
    await user.click(await screen.findByRole('button', { name: 'Добавить виджет' }));
    expect(await screen.findByRole('dialog', { name: 'Добавить виджет' })).toBeTruthy();
  });
});

describe('editing on a phone', () => {
  const saved: DashboardLayoutDto = {
    revision: 7,
    widgets: [w('attention', 0, 0, 8, 4), w('system', 8, 0, 4, 4), w('today', 0, 4, 8, 4)]
  };

  it('shows one column in reading order and reorders it with the row menu; widths stay', async () => {
    setViewport(375);
    const calls = serve(saved);
    servePut(calls);
    const user = userEvent.setup();
    await renderDashboard();
    expect([...document.querySelectorAll('[data-widget]')].map((item) => item.getAttribute('data-widget'))).toEqual([
      'attention',
      'system',
      'today'
    ]);
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    const list = await screen.findByRole('grid', { name: 'Порядок виджетов' });
    expect(
      within(list)
        .getAllByRole('row')
        .map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining('Требует внимания'),
      expect.stringContaining('Система'),
      expect.stringContaining('Сегодня')
    ]);
    await user.click(within(list).getByRole('button', { name: 'Действия: Сегодня' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Переместить выше' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(calls.layoutPuts).toHaveLength(1));
    const body = calls.layoutPuts[0] as { revision: number; widgets: DashboardWidget[] };
    expect(body.revision).toBe(7);
    expect(sequence(body.widgets).map((item) => item.id)).toEqual(['attention', 'today', 'system']);
    // Phone reorder never touches the size of a widget.
    for (const original of saved.widgets) {
      expect(body.widgets.find((item) => item.id === original.id)).toMatchObject({ w: original.w, h: original.h });
    }
  });

  it('reorders by keyboard drag on the handle', async () => {
    setViewport(375);
    const calls = serve(saved);
    servePut(calls);
    const user = userEvent.setup();
    await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    const handle = await screen.findByRole('button', { name: 'Перетащить виджет: Сегодня' });
    handle.focus();
    await user.keyboard('{Enter}');
    // Each arrow moves the drop target to the previous insertion point; Enter drops there.
    for (let step = 0; step < 6; step += 1) {
      if (document.activeElement?.getAttribute('aria-label') === 'Insert before Требует внимания') break;
      await user.keyboard('{ArrowUp}');
    }
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Insert before Требует внимания');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(calls.layoutPuts).toHaveLength(1));
    const body = calls.layoutPuts[0] as { widgets: DashboardWidget[] };
    expect(sequence(body.widgets)[0]?.id).toBe('today');
  });
});
