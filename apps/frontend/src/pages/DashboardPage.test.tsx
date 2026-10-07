import type { BotStatusDto, DashboardDto } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dash, dashboard, sentRow, todayRow, unknownAttention } from '../test/dashboard-fixtures';
import { clearSession, setSession } from '../shared/api/session';
import { accessToken } from '../test/fixtures';
import { failWith, server, setupMswServer } from '../test/msw';
import { renderPage } from '../test/render-app';
import { clearViewport, setViewport } from '../test/viewport';
import { DashboardPage } from './DashboardPage';

// The owner's zone is the browser's: pin it so «09:00» below means 06:00 UTC.
process.env['TZ'] = 'Europe/Chisinau';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  setViewport(1280);
  serveHealth();
  serveBot(botStatus());
});
afterEach(() => {
  cleanup();
  clearViewport();
  Reflect.deleteProperty(document, 'visibilityState');
  document.dispatchEvent(new Event('visibilitychange'));
});

const HOOK = 'https://app.example.test/webhooks/telegram';
const botStatus = (connected = true): BotStatusDto => ({
  missing: [],
  botUsername: 'alexeev_bot',
  expectedUrl: HOOK,
  webhook: {
    url: connected ? HOOK : null,
    pointsHere: connected,
    pendingUpdateCount: 0,
    lastErrorAt: null,
    lastErrorMessage: null
  }
});
const serveBot = (dto: BotStatusDto) => server.use(http.get('*/api/v1/bot/status', () => HttpResponse.json(dto)));
const serveHealth = () =>
  server.use(
    http.get('*/api/v1/health', () =>
      HttpResponse.json({
        status: 'ok',
        service: 'content-bot',
        publishingEnabled: false,
        time: '2026-10-07T10:05:00.000Z'
      })
    )
  );
function serveDashboard(dto: DashboardDto | (() => DashboardDto)) {
  const urls: URL[] = [];
  server.use(
    http.get('*/api/v1/dashboard', ({ request }) => {
      urls.push(new URL(request.url));
      return HttpResponse.json(typeof dto === 'function' ? dto() : dto);
    })
  );
  return urls;
}
function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function renderDashboard(pollMs?: number) {
  const view = await renderPage(<DashboardPage {...(pollMs ? { pollMs } : {})} />);
  // The skeleton uses the same block headings: wait for the data before looking for a block.
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

describe('dashboard blocks', () => {
  it('shows a busy skeleton per block first, then today as a timeline with labels, zone and offset', async () => {
    serveDashboard(
      dashboard({
        today: [sentRow(), todayRow()],
        todayTotal: 2,
        recentSent: [sentRow({ messageUrl: 'https://t.me/dota_studio/4821' })]
      })
    );
    await renderPage(<DashboardPage />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const today = await screen.findByRole('region', { name: 'Сегодня' });
    const rows = within(today).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('09:00');
    expect(rows[0]?.textContent).toContain('Опубликовано');
    expect(rows[1]?.textContent).toContain('18:00');
    expect(rows[1]?.textContent).toContain('Запланировано');
    expect(within(today).getByText('Europe/Chisinau, UTC+3')).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('asks for the local day: from and to are local midnights', async () => {
    const urls = serveDashboard(dashboard({ todayTotal: 1, today: [todayRow()] }));
    await renderDashboard();
    await screen.findByRole('region', { name: 'Сегодня' });
    const from = new Date(urls[0]?.searchParams.get('from') ?? '');
    const to = new Date(urls[0]?.searchParams.get('to') ?? '');
    expect([from.getHours(), from.getMinutes(), to.getHours(), to.getMinutes()]).toEqual([0, 0, 0, 0]);
    expect(to.getTime() - from.getTime()).toBeGreaterThanOrEqual(23 * 3_600_000);
    expect(to.getTime() - from.getTime()).toBeLessThanOrEqual(25 * 3_600_000);
  });

  it('«Все инциденты» carries the server total, so rows hidden beyond the first five are visible as a number', async () => {
    serveDashboard(dashboard({ attention: [unknownAttention()], attentionTotal: 99 }));
    await renderDashboard();
    const block = await screen.findByRole('region', { name: 'Требует внимания' });
    expect(within(block).getByRole('link', { name: 'Все инциденты (99+)' })).toBeTruthy();
  });

  it('lists an unknown publication under «Требует внимания» with only «Проверить», which opens the drawer link', async () => {
    serveDashboard(dashboard({ attention: [unknownAttention()], attentionTotal: 1 }));
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    const block = await screen.findByRole('region', { name: 'Требует внимания' });
    expect(within(block).getByText('Требует проверки')).toBeTruthy();
    expect(within(block).getByText('Возможен дубль при повторной отправке')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Повторить|Отменить|Отправить снова/ })).toBeNull();
    expect(within(block).getByRole('link', { name: 'Все инциденты (1)' })).toBeTruthy();
    await user.click(within(block).getByRole('button', { name: /^Проверить/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/publications'));
    expect(router.state.location.search).toMatchObject({ id: dash.pubUnknown });
  });

  it('opens a failed publication with «Открыть» and omits the action when the row has no publication', async () => {
    serveDashboard(
      dashboard({
        attention: [
          unknownAttention({ kind: 'failed', publicationId: dash.pubFailed, code: 'DESTINATION_UNAVAILABLE' }),
          unknownAttention({ kind: 'failed', incidentId: dash.incFailed })
        ].map((item, index) => {
          if (index === 1) {
            const { publicationId: _omitted, ...rest } = item;
            return { ...rest, postTitle: 'Без публикации' };
          }
          return item;
        }),
        attentionTotal: 2
      })
    );
    await renderDashboard();
    const block = await screen.findByRole('region', { name: 'Требует внимания' });
    expect(within(block).getAllByRole('button', { name: /^Открыть/ })).toHaveLength(1);
    expect(within(block).getByText('Без публикации')).toBeTruthy();
  });

  it('puts a failing system check into the list with its own action and drops that action from the strip', async () => {
    serveBot(botStatus(false));
    serveDashboard(dashboard({ attention: [unknownAttention()], attentionTotal: 1 }));
    await renderDashboard();
    const block = await screen.findByRole('region', { name: 'Требует внимания' });
    expect(await within(block).findByText(/Бот: /)).toBeTruthy();
    expect(within(block).getByRole('button', { name: 'Подключить' })).toBeTruthy();
    // The strip keeps its chip but not a second «Подключить».
    expect(screen.getAllByRole('button', { name: 'Подключить' })).toHaveLength(1);
  });

  it('shows one muted line, no list, when nothing needs attention', async () => {
    serveDashboard(dashboard({ today: [todayRow()], todayTotal: 1 }));
    await renderDashboard();
    expect(await screen.findByText('Всё под контролем')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Требует внимания' })).toBeNull();
  });

  it('offers «Запланировать» when nothing is planned today and hides empty side blocks', async () => {
    serveDashboard(dashboard({ recentSent: [sentRow()] }));
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    const today = await screen.findByRole('region', { name: 'Сегодня' });
    expect(within(today).getByText('На сегодня ничего не запланировано')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Ближайшие' })).toBeNull();
    await user.click(within(today).getByRole('button', { name: 'Запланировать' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
  });

  it('shows «Показать все» only when today holds more than the listed rows', async () => {
    serveDashboard(dashboard({ today: [todayRow()], todayTotal: 12 }));
    await renderDashboard();
    expect(await screen.findByRole('link', { name: 'Показать все' })).toBeTruthy();
  });

  it('links to Telegram only for a sent publication that has a public message url', async () => {
    serveDashboard(
      dashboard({
        recentSent: [
          sentRow({ messageUrl: 'https://t.me/dota_studio/4821' }),
          sentRow({ publicationId: dash.pubLater, postTitle: 'Закрытый канал' })
        ]
      })
    );
    await renderDashboard();
    const recent = await screen.findByRole('region', { name: 'Недавно отправлено' });
    const links = within(recent).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://t.me/dota_studio/4821');
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows «Пока нет публикаций» with «Создать пост» on a new install', async () => {
    serveDashboard(dashboard());
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    expect(await screen.findByText('Пока нет публикаций')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Создать пост' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts/new'));
  });
});

describe('dashboard failures', () => {
  it('shows the error with the request id and retries; no block shows zeros', async () => {
    server.use(failWith('get', '/api/v1/dashboard', { status: 500, code: 'UNAVAILABLE' }));
    const user = userEvent.setup();
    await renderDashboard();
    expect(await screen.findByText('Не удалось загрузить обзор')).toBeTruthy();
    expect(screen.getByText('req-test-1')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Сегодня' })).toBeNull();
    expect(screen.queryByText('Пока нет публикаций')).toBeNull();
    serveDashboard(dashboard({ today: [todayRow()], todayTotal: 1 }));
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('region', { name: 'Сегодня' })).toBeTruthy();
  });

  it('keeps old data and says it is stale (role=status) when a refetch fails', async () => {
    let fail = false;
    server.use(
      http.get('*/api/v1/dashboard', () =>
        fail
          ? HttpResponse.json({ error: { code: 'UNAVAILABLE', message: 'x', requestId: 'req-1' } }, { status: 503 })
          : HttpResponse.json(dashboard({ today: [todayRow()], todayTotal: 1 }))
      )
    );
    await renderDashboard(40);
    await screen.findByText('Вечерний разбор');
    fail = true;
    const stale = await screen.findByText('Данные устарели', {}, { timeout: 2000 });
    expect(stale.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeTruthy();
    expect(screen.getByText('Вечерний разбор')).toBeTruthy();
    fail = false;
    await waitFor(() => expect(screen.queryByText('Данные устарели')).toBeNull(), { timeout: 2000 });
  });

  it('shows «Нет доступа» and no data on 403', async () => {
    server.use(failWith('get', '/api/v1/dashboard', { status: 403, code: 'FORBIDDEN' }));
    await renderDashboard();
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Сегодня' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });

  it('shows no data on 401 once the silent re-auth is refused too', async () => {
    server.use(
      failWith('get', '/api/v1/dashboard', { status: 401, code: 'UNAUTHORIZED' }),
      failWith('post', '/api/v1/auth/refresh', { status: 401, code: 'UNAUTHORIZED' })
    );
    await renderDashboard();
    expect(await screen.findByText('Не удалось загрузить обзор')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Сегодня' })).toBeNull();
  });
});

describe('dashboard polling', () => {
  it('polls while the tab is visible, stops while hidden and resumes when visible again', async () => {
    const urls = serveDashboard(dashboard({ today: [todayRow()], todayTotal: 1 }));
    await renderDashboard(40);
    await screen.findByText('Вечерний разбор');
    await waitFor(() => expect(urls.length).toBeGreaterThan(2), { timeout: 2000 });
    setVisibility('hidden');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const hiddenAt = urls.length;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(urls.length).toBe(hiddenAt);
    setVisibility('visible');
    await waitFor(() => expect(urls.length).toBeGreaterThan(hiddenAt), { timeout: 2000 });
  });

  it('stops polling when the page unmounts', async () => {
    const urls = serveDashboard(dashboard({ today: [todayRow()], todayTotal: 1 }));
    await renderDashboard(40);
    await screen.findByText('Вечерний разбор');
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stoppedAt = urls.length;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(urls.length).toBe(stoppedAt);
  });
});
