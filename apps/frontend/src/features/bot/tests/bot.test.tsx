import type { BotStatusDto } from '@alexeev/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { BotConnection } from '../ui/BotConnection';
import { BotStatusSummary } from '../ui/BotStatusSummary';
import { botCopy } from '../ui/copy';
import { accessToken } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient, createWrapper } from '../../../test/query-wrapper';

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

function renderBot() {
  const user = userEvent.setup();
  const Wrapper = createWrapper(createTestQueryClient());
  render(
    <Wrapper>
      <ToastProvider>
        <BotConnection />
      </ToastProvider>
    </Wrapper>
  );
  return { user };
}

async function renderBotSummary() {
  const Wrapper = createWrapper(createTestQueryClient());
  render(
    <Wrapper>
      <BotStatusSummary />
    </Wrapper>
  );
}

describe('notification bot status summary', () => {
  it('shows read-only status without exposing connection controls', async () => {
    serve(status());
    await renderBotSummary();
    expect(await screen.findByText(botCopy.state.connected)).toBeTruthy();
    expect(screen.getByText('@alexeev_bot')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not show bot details when status is forbidden', async () => {
    server.use(failWith('get', '/api/v1/bot/status', { status: 403, code: 'FORBIDDEN' }));
    await renderBotSummary();
    expect(await screen.findByText(botCopy.forbidden)).toBeTruthy();
    expect(screen.queryByText('@alexeev_bot')).toBeNull();
  });
});

describe('bot connection', () => {
  it('shows a connected bot with a secondary reconnect', async () => {
    serve(status());
    renderBot();
    expect(await screen.findByText('Подключён')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Переподключить' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('explains a missing webhook', async () => {
    serve(unconnected());
    renderBot();
    expect(await screen.findByText(/Не подключён: Telegram не знает/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Подключить бота' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a foreign address and that connecting redirects the bot', async () => {
    serve(status({ webhook: webhook({ url: 'https://other.example.test/hook', pointsHere: false }) }));
    renderBot();
    expect(await screen.findByText('Подключён к другому адресу')).toBeTruthy();
    expect(screen.getByText('https://other.example.test/hook')).toBeTruthy();
    expect(screen.getByText('Подключение перенаправит бота сюда')).toBeTruthy();
  });

  it('lists missing settings and disables connect with the reason', async () => {
    serve(status({ missing: ['TELEGRAM_BOT_TOKEN', 'BOT_INFO'], botUsername: null, webhook: null }));
    renderBot();
    expect(await screen.findByText('Бот не настроен')).toBeTruthy();
    expect(screen.getByText('Не заданы или заданы неверно: TELEGRAM_BOT_TOKEN, BOT_INFO')).toBeTruthy();
    expect(screen.getByText(/Variables and Secrets/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Подключить бота' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Сначала задайте настройки на сервере')).toBeTruthy();
  });

  it('shows the last delivery error and the pending count', async () => {
    serve(
      status({
        webhook: webhook({
          lastErrorAt: '2026-10-06T09:00:00.000Z',
          lastErrorMessage: 'Wrong response from the webhook: 401 Unauthorized',
          pendingUpdateCount: 3
        })
      })
    );
    renderBot();
    expect(await screen.findByText('Последняя ошибка доставки')).toBeTruthy();
    expect(screen.getByText('Wrong response from the webhook: 401 Unauthorized')).toBeTruthy();
    expect(screen.getByText('Ждут доставки: 3')).toBeTruthy();
  });

  it('offers a retry when the status cannot be loaded', async () => {
    server.use(failWith('get', '/api/v1/bot/status', { status: 503, code: 'UNAVAILABLE' }));
    const { user } = renderBot();
    expect(await screen.findByText('Не удалось получить состояние бота. Повторите запрос.')).toBeTruthy();
    serve(status());
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Подключён')).toBeTruthy();
  });

  it('connects once, shows the toast and the returned status', async () => {
    serve(unconnected());
    let calls = 0;
    server.use(
      http.post('*/api/v1/bot/connect', async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(status());
      })
    );
    const { user } = renderBot();
    await user.dblClick(await screen.findByRole('button', { name: 'Подключить бота' }));
    expect(await screen.findByText('Бот подключён. Отправьте ему /start')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Переподключить' })).toBeTruthy();
    expect(calls).toBe(1);
  });

  it('shows a banner on 503 and retries from it', async () => {
    serve(unconnected());
    server.use(failWith('post', '/api/v1/bot/connect', { status: 503, code: 'UNAVAILABLE' }));
    const { user } = renderBot();
    await user.click(await screen.findByRole('button', { name: 'Подключить бота' }));
    expect(await screen.findByText('Telegram не ответил')).toBeTruthy();
    server.use(http.post('*/api/v1/bot/connect', () => HttpResponse.json(status())));
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.queryByText('Telegram не ответил')).toBeNull());
    expect(await screen.findByText('Подключён')).toBeTruthy();
  });

  it('shows the wait on 429', async () => {
    serve(unconnected());
    server.use(
      failWith('post', '/api/v1/bot/connect', { status: 429, code: 'RATE_LIMIT', headers: { 'Retry-After': '12' } })
    );
    const { user } = renderBot();
    await user.click(await screen.findByRole('button', { name: 'Подключить бота' }));
    expect(await screen.findByText('Подождите примерно 12 с и повторите.')).toBeTruthy();
  });

  it('explains BOT_NOT_CONFIGURED returned by connect', async () => {
    serve(unconnected());
    server.use(
      failWith('post', '/api/v1/bot/connect', { status: 503, code: 'UNAVAILABLE', reason: 'BOT_NOT_CONFIGURED' })
    );
    const { user } = renderBot();
    await user.click(await screen.findByRole('button', { name: 'Подключить бота' }));
    expect(await screen.findByText(/не хватает настроек/)).toBeTruthy();
  });

  it('renders a webhook url with a redacted token', async () => {
    serve(status({ webhook: webhook({ url: 'https://api.example.test/bot***/hook', pointsHere: false }) }));
    renderBot();
    expect(await screen.findByText('https://api.example.test/bot***/hook')).toBeTruthy();
  });

  it('refetches the status after a failed connect and shows the new state', async () => {
    let statusCalls = 0;
    server.use(
      http.get('*/api/v1/bot/status', () => {
        statusCalls += 1;
        return HttpResponse.json(
          statusCalls === 1 ? status() : status({ missing: ['BOT_INFO'], botUsername: null, webhook: null })
        );
      }),
      failWith('post', '/api/v1/bot/connect', { status: 503, code: 'UNAVAILABLE', reason: 'BOT_NOT_CONFIGURED' })
    );
    const { user } = renderBot();
    await user.click(await screen.findByRole('button', { name: 'Переподключить' }));
    expect(await screen.findByText('Не заданы или заданы неверно: BOT_INFO')).toBeTruthy();
    expect(statusCalls).toBe(2);
  });

  it('does not refetch the status after a 429', async () => {
    let statusCalls = 0;
    server.use(
      http.get('*/api/v1/bot/status', () => {
        statusCalls += 1;
        return HttpResponse.json(unconnected());
      }),
      failWith('post', '/api/v1/bot/connect', { status: 429, code: 'RATE_LIMIT', headers: { 'Retry-After': '12' } })
    );
    const { user } = renderBot();
    await user.click(await screen.findByRole('button', { name: 'Подключить бота' }));
    expect(await screen.findByText('Подождите примерно 12 с и повторите.')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(statusCalls).toBe(1);
  });
});

describe('bot connection details', () => {
  it('explains a pending migration on the status request', async () => {
    server.use(
      failWith('get', '/api/v1/bot/status', { status: 503, code: 'UNAVAILABLE', reason: 'MIGRATION_PENDING' })
    );
    renderBot();
    expect(await screen.findByText(/Нужно применить миграцию базы/)).toBeTruthy();
    expect(screen.getByText(/D1 migrations/)).toBeTruthy();
  });
});
