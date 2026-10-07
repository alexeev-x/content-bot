import type { BotStatusDto } from '@alexeev/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { accessToken } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient, createWrapper } from '../../../test/query-wrapper';
import { routeTree } from '../../../routeTree.gen';
import { BotWidget } from '../ui/BotWidget';

setupMswServer();
afterEach(cleanup);
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

const URL_HERE = 'https://app.example.test/webhooks/telegram';
const webhook = (over: Partial<NonNullable<BotStatusDto['webhook']>> = {}) => ({
  url: URL_HERE,
  pointsHere: true,
  pendingUpdateCount: 0,
  lastErrorAt: null,
  lastErrorMessage: null,
  ...over
});
const status = (over: Partial<BotStatusDto> = {}): BotStatusDto => ({
  missing: [],
  botUsername: 'alexeev_bot',
  expectedUrl: URL_HERE,
  webhook: webhook(),
  ...over
});
const unconnected = () => status({ webhook: webhook({ url: null, pointsHere: false }) });

function serve(dto: BotStatusDto) {
  server.use(http.get('*/api/v1/bot/status', () => HttpResponse.json(dto)));
}

function renderWidget() {
  const user = userEvent.setup();
  const Wrapper = createWrapper(createTestQueryClient());
  render(
    <Wrapper>
      <ToastProvider>
        <BotWidget />
      </ToastProvider>
    </Wrapper>
  );
  return { user };
}

describe('bot widget', () => {
  it('shows one calm line when healthy', async () => {
    serve(status());
    renderWidget();
    expect(await screen.findByText('Бот @alexeev_bot')).toBeTruthy();
    expect(screen.getByText('Работает')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Подключить заново' })).toBeNull();
  });

  it('shows a loading line, then a one-line error with retry', async () => {
    server.use(failWith('get', '/api/v1/bot/status', { status: 503, code: 'UNAVAILABLE' }));
    const { user } = renderWidget();
    expect(screen.getByLabelText('Загружаем состояние бота…')).toBeTruthy();
    expect(await screen.findByText('Не удалось получить статус бота')).toBeTruthy();
    serve(status());
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Бот @alexeev_bot')).toBeTruthy();
  });

  it('names the missing settings and offers details only', async () => {
    serve(status({ missing: ['TELEGRAM_BOT_TOKEN', 'BOT_INFO'], botUsername: null, webhook: null }));
    renderWidget();
    expect(await screen.findByText('Бот не настроен')).toBeTruthy();
    expect(screen.getByText('Не заданы: TELEGRAM_BOT_TOKEN, BOT_INFO')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подробнее' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
  });

  it('shows a foreign address with a connect action', async () => {
    serve(status({ webhook: webhook({ url: 'https://other.example.test/hook', pointsHere: false }) }));
    renderWidget();
    expect(await screen.findByText('Подключён к другому адресу')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подключить' })).toBeTruthy();
  });

  it('shows the delivery error with reconnect and the pending count', async () => {
    serve(
      status({
        webhook: webhook({
          lastErrorMessage: 'Wrong response from the webhook: 401 Unauthorized',
          pendingUpdateCount: 3
        })
      })
    );
    renderWidget();
    expect(await screen.findByText('Ошибка доставки')).toBeTruthy();
    expect(screen.getByText('Wrong response from the webhook: 401 Unauthorized')).toBeTruthy();
    expect(screen.getByText('Ждут доставки: 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подключить заново' })).toBeTruthy();
  });

  it('connects from the widget once and shows the returned status', async () => {
    serve(unconnected());
    let calls = 0;
    server.use(
      http.post('*/api/v1/bot/connect', async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(status());
      })
    );
    const { user } = renderWidget();
    expect(await screen.findByText('Бот не подключён')).toBeTruthy();
    await user.dblClick(screen.getByRole('button', { name: 'Подключить' }));
    expect(await screen.findByText('Бот @alexeev_bot')).toBeTruthy();
    expect(await screen.findByText('Бот подключён. Отправьте ему /start')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
    expect(calls).toBe(1);
  });

  it('explains a pending migration returned by connect', async () => {
    serve(unconnected());
    server.use(
      failWith('post', '/api/v1/bot/connect', { status: 503, code: 'UNAVAILABLE', reason: 'MIGRATION_PENDING' })
    );
    const { user } = renderWidget();
    await user.click(await screen.findByRole('button', { name: 'Подключить' }));
    expect(await screen.findByText('Нужно применить миграцию базы')).toBeTruthy();
    expect(screen.getByText('GitHub → Actions → D1 migrations → Run workflow (dev)')).toBeTruthy();
  });

  it('explains a pending migration returned by status', async () => {
    server.use(
      failWith('get', '/api/v1/bot/status', { status: 503, code: 'UNAVAILABLE', reason: 'MIGRATION_PENDING' })
    );
    renderWidget();
    expect(await screen.findByText('Нужно применить миграцию базы')).toBeTruthy();
    expect(screen.getByText(/D1 migrations/)).toBeTruthy();
  });

  it('opens the details drawer with the full connection content', async () => {
    serve(
      status({
        webhook: webhook({
          url: 'https://other.example.test/hook',
          pointsHere: false,
          lastErrorAt: '2026-10-06T09:00:00.000Z',
          lastErrorMessage: 'Wrong response from the webhook: 401 Unauthorized'
        })
      })
    );
    const { user } = renderWidget();
    await user.click(await screen.findByRole('button', { name: 'Подробнее' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('https://other.example.test/hook')).toBeTruthy();
    expect(within(dialog).getByText('Последняя ошибка доставки')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Обновить' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Подключить бота' })).toBeTruthy();
  });
});

describe('route tree', () => {
  it('has no /settings/bot route', () => {
    const settings = routeTree.children?.['SettingsRoute' as never] as unknown;
    expect(JSON.stringify(Object.keys((settings as { children?: object })?.children ?? {}))).not.toContain('Bot');
    expect(Object.keys(routeTree.children ?? {})).not.toContain('SettingsBotRoute');
  });
});
