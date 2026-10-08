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

/** Rows each panel reserves: the `--rows` of its body (skeleton and loaded share it). */
const reserved = () =>
  Object.fromEntries(
    [...document.querySelectorAll<HTMLElement>('[data-area]')].map((cell) => [
      cell.dataset['area'],
      (cell.querySelector('[style*="--rows"]') as HTMLElement | null)?.style.getPropertyValue('--rows')
    ])
  );

describe('dashboard blocks', () => {
  it('shows a busy skeleton per block first, then today as a timeline with times, status labels and the zone in the date chip', async () => {
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
    // The scheduled row never claims «Опубликовано»: only the server's `sent` does.
    expect(rows[1]?.textContent).not.toContain('Опубликовано');
    expect(document.querySelector('[title="Europe/Chisinau, UTC+3"]')).not.toBeNull();
  });

  it('skeleton panels reserve the same rows as the loaded panels, so nothing jumps when the data arrives', async () => {
    const gate = { resolve: () => {}, promise: Promise.resolve() };
    gate.promise = new Promise<void>((resolve) => {
      gate.resolve = resolve;
    });
    server.use(
      http.get('*/api/v1/dashboard', async () => {
        await gate.promise;
        return HttpResponse.json(dashboard({ today: [todayRow()], todayTotal: 1 }));
      })
    );
    await renderPage(<DashboardPage />);
    // The default layout has eight panels with a data-area: the five former ones plus drafts, week and quick actions.
    await waitFor(() => expect(document.querySelectorAll('[data-area]').length).toBe(8));
    const loading = reserved();
    expect(Object.values(loading).every((rows) => Number(rows) > 0)).toBe(true);
    // Every panel draws its skeleton rows while loading.
    expect(document.querySelectorAll('[data-area="today"] [aria-hidden="true"] li').length).toBe(
      Number(loading['today'])
    );
    gate.resolve();
    await screen.findByText('Вечерний разбор');
    expect(reserved()).toEqual(loading);
  });

  it('on a phone every list reserves and shows at most two rows, with phone cards instead of a table', async () => {
    setViewport(375);
    serveDashboard(
      dashboard({
        today: [
          todayRow(),
          todayRow({ publicationId: dash.pubSent, postTitle: 'Второй' }),
          todayRow({ publicationId: dash.pubFailed, postTitle: 'Третий' })
        ],
        todayTotal: 3,
        recentSent: [sentRow(), sentRow({ publicationId: dash.pubLater }), sentRow({ publicationId: dash.pubFailed })]
      })
    );
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    const today = await screen.findByRole('region', { name: 'Сегодня' });
    expect(within(today).getAllByRole('listitem')).toHaveLength(2);
    const recent = screen.getByRole('region', { name: 'Последние публикации' });
    expect(within(recent).queryByRole('table')).toBeNull();
    expect(within(recent).getAllByRole('listitem')).toHaveLength(2);
    await user.click(within(today).getByRole('button', { name: /Вечерний разбор/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/publications'));
  });

  it('shows four KPI values: day total, sent, attention and the next pending publication with its own link', async () => {
    const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
    serveDashboard(
      dashboard({
        today: [sentRow(), todayRow({ scheduledAt: soon })],
        todayTotal: 2,
        attention: [unknownAttention()],
        attentionTotal: 1
      })
    );
    await renderDashboard();
    const kpis = within(await screen.findByRole('region', { name: 'Сводка' }));
    expect(kpis.getByRole('link', { name: /Публикации сегодня.*2/ })).toBeTruthy();
    expect(kpis.getByRole('link', { name: /Отправлено в каналы.*1/ })).toBeTruthy();
    expect(kpis.getByRole('link', { name: /Требует внимания.*1/ })).toBeTruthy();
    const next = kpis.getByRole('link', { name: /Ближайшая публикация/ });
    expect(next.textContent).toMatch(/\d{2}:\d{2}/);
    expect(next.textContent).toContain('Через');
    expect(next.getAttribute('href')).toContain(`id=${dash.pubLater}`);
  });

  it('a KPI without data shows a dash and is not a link', async () => {
    serveDashboard(dashboard());
    await renderDashboard();
    const kpis = within(await screen.findByRole('region', { name: 'Сводка' }));
    expect(kpis.queryByRole('link', { name: /Ближайшая публикация/ })).toBeNull();
    expect(kpis.getByText('Нет запланированных')).toBeTruthy();
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

  it('the attention count carries the server total, so rows hidden beyond the listed ones are visible as a number', async () => {
    serveDashboard(dashboard({ attention: [unknownAttention()], attentionTotal: 99 }));
    await renderDashboard();
    const block = await screen.findByRole('region', { name: 'Требует внимания' });
    expect(within(block).getByText('99+')).toBeTruthy();
    expect(within(block).getByRole('link', { name: /^Все инциденты/ })).toBeTruthy();
  });

  it('lists an unknown publication under «Требует внимания» with only «Проверить», which opens the drawer link', async () => {
    serveDashboard(dashboard({ attention: [unknownAttention()], attentionTotal: 1 }));
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    const block = await screen.findByRole('region', { name: 'Требует внимания' });
    expect(within(block).getByText('Требует проверки')).toBeTruthy();
    expect(within(block).getByText(/Telegram не ответил\. Сообщение могло уйти\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Повторить|Отменить|Отправить снова|Перенести/ })).toBeNull();
    expect(within(block).getAllByRole('button')).toHaveLength(1);
    expect(within(block).getByRole('link', { name: /^Все инциденты/ })).toBeTruthy();
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
    // The row reads the check's headline, not «Бот: Бот …».
    expect(await within(block).findByText(/^Бот /)).toBeTruthy();
    expect(within(block).getByRole('button', { name: 'Подключить' })).toBeTruthy();
    // The strip keeps its chip but not a second «Подключить».
    expect(screen.getAllByRole('button', { name: 'Подключить' })).toHaveLength(1);
  });

  it('says «Проверяем систему…» until the bot check answers, never a premature «Всё под контролем»', async () => {
    serveDashboard(dashboard({ today: [todayRow()], todayTotal: 1 }));
    // The bot status never answers in this test.
    server.use(http.get('*/api/v1/bot/status', () => new Promise<Response>(() => {})));
    // Not renderDashboard: the status strip stays busy while the check is pending.
    await renderPage(<DashboardPage />);
    expect(await screen.findByText('Проверяем систему…')).toBeTruthy();
    const block = screen.getByRole('region', { name: 'Требует внимания' });
    expect(within(block).queryByText('Всё под контролем')).toBeNull();
  });

  it('keeps the block with one muted line, no list, when nothing needs attention', async () => {
    serveDashboard(dashboard({ today: [todayRow()], todayTotal: 1 }));
    await renderDashboard();
    const block = await screen.findByRole('region', { name: 'Требует внимания' });
    expect(await within(block).findByText('Всё под контролем')).toBeTruthy();
    expect(within(block).queryByRole('list')).toBeNull();
  });

  it('offers «Новый пост» when nothing is planned today; an empty side block says so and points to the posts', async () => {
    serveDashboard(dashboard({ recentSent: [sentRow()] }));
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    const today = await screen.findByRole('region', { name: 'Сегодня' });
    expect(within(today).getByText('На сегодня публикаций нет')).toBeTruthy();
    const upcoming = screen.getByRole('region', { name: 'Ближайшие' });
    expect(within(upcoming).getByText('Ничего не запланировано')).toBeTruthy();
    expect(within(upcoming).queryByRole('list')).toBeNull();
    await user.click(within(upcoming).getByRole('button', { name: 'Опубликовать пост' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
  });

  it('opens the publication from a row link; the count chip shows 100+ for a capped day', async () => {
    serveDashboard(dashboard({ today: [todayRow()], todayTotal: 100 }));
    await renderDashboard();
    const today = await screen.findByRole('region', { name: 'Сегодня' });
    expect(within(today).getByText('100+')).toBeTruthy();
    const row = within(today).getByRole('link', { name: /Вечерний разбор/ });
    expect(row.getAttribute('href')).toContain(`id=${dash.pubLater}`);
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
    const recent = await screen.findByRole('region', { name: 'Последние публикации' });
    const telegramLink = within(recent).getByRole('link', { name: /Открыть в Telegram/ });
    expect(telegramLink.getAttribute('href')).toBe('https://t.me/dota_studio/4821');
    expect(telegramLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(recent).getByRole('link', { name: /^Все публикации/ })).toBeTruthy();
    expect(within(recent).getAllByRole('row')).toHaveLength(3);
  });

  it('a new install keeps every panel with its own empty line, so the page never changes shape', async () => {
    serveDashboard(dashboard());
    const user = userEvent.setup();
    const { router } = await renderDashboard();
    const upcoming = await screen.findByRole('region', { name: 'Ближайшие' });
    expect(within(upcoming).getByText('Ничего не запланировано')).toBeTruthy();
    const recent = screen.getByRole('region', { name: 'Последние публикации' });
    expect(within(recent).getByText('Пока ничего не отправлено')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Система' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Требует внимания' })).toBeTruthy();
    const today = screen.getByRole('region', { name: 'Сегодня' });
    await user.click(within(today).getByRole('button', { name: 'Новый пост' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts/new'));
  });

  it('«Система» lists one line per real check with one word and no invented latency', async () => {
    serveDashboard(dashboard());
    await renderDashboard();
    const system = await screen.findByRole('region', { name: 'Система' });
    await waitFor(() => expect(within(system).getAllByRole('listitem')).toHaveLength(3));
    const rows = within(system).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['СервисРаботает', 'ПубликацияОтключена', 'БотРаботает']);
    expect(system.textContent).not.toMatch(/мс|ms/);
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
