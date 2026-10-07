import type { BotStatusDto } from '@alexeev/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../shared/api/session';
import { ToastProvider } from '../../shared/ui';
import { accessToken } from '../../test/fixtures';
import { failWith, server, setupMswServer } from '../../test/msw';
import { createTestQueryClient, createWrapper } from '../../test/query-wrapper';
import { clearViewport, setViewport } from '../../test/viewport';
import { SystemStatus } from './SystemStatus';

setupMswServer();
afterEach(() => {
  cleanup();
  clearViewport();
});
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  setViewport(1280);
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
const failHealth = () => server.use(failWith('get', '/api/v1/health', { status: 503, code: 'UNAVAILABLE' }));

function renderStrip() {
  const user = userEvent.setup();
  const Wrapper = createWrapper(createTestQueryClient());
  render(
    <Wrapper>
      <ToastProvider>
        <SystemStatus />
      </ToastProvider>
    </Wrapper>
  );
  return { user };
}

describe('system status strip', () => {
  it('shows a busy skeleton, then one quiet line when everything works', async () => {
    serveHealth();
    serveBot(status());
    renderStrip();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Всё работает' })).toBeTruthy();
    expect(screen.getByText(/Проверено/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Всё работает');
  });

  it('shows one row with its action for a single problem and returns to the healthy line after connecting', async () => {
    serveHealth();
    serveBot(unconnected());
    server.use(http.post('*/api/v1/bot/connect', () => HttpResponse.json(status())));
    const { user } = renderStrip();
    expect(await screen.findByRole('button', { name: 'Бот не подключён' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Подключить' }));
    expect(await screen.findByRole('button', { name: 'Всё работает' })).toBeTruthy();
    expect(await screen.findByText('Бот подключён. Отправьте ему /start')).toBeTruthy();
  });

  it('collapses several problems into a count with one entry point', async () => {
    failHealth();
    serveBot(unconnected());
    const { user } = renderStrip();
    expect((await screen.findAllByText('Требует внимания: 2')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Разобраться' }));
    const dialog = await screen.findByRole('dialog', { name: 'Состояние системы' });
    expect(within(dialog).getByText('Сервис')).toBeTruthy();
    expect(within(dialog).getByText('Не удалось проверить')).toBeTruthy();
    expect(within(dialog).getByText('Бот')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Повторить' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Подключить бота' })).toBeTruthy();
  });

  it('offers no connect action when the server settings are missing, and lists the missing names', async () => {
    serveHealth();
    serveBot(status({ missing: ['TELEGRAM_BOT_TOKEN'], botUsername: null, webhook: null }));
    const { user } = renderStrip();
    await user.click(await screen.findByRole('button', { name: 'Бот не настроен' }));
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: 'Состояние системы' });
    expect(within(dialog).getByText(/TELEGRAM_BOT_TOKEN/)).toBeTruthy();
  });

  it('names a pending migration and retries the check', async () => {
    serveHealth();
    server.use(
      failWith('get', '/api/v1/bot/status', { status: 503, code: 'UNAVAILABLE', reason: 'MIGRATION_PENDING' })
    );
    const { user } = renderStrip();
    expect(await screen.findByRole('button', { name: 'Нужно применить миграцию базы' })).toBeTruthy();
    serveBot(status());
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('button', { name: 'Всё работает' })).toBeTruthy();
  });

  it('opens a popover on desktop with Enter and returns focus to the strip on Escape', async () => {
    serveHealth();
    serveBot(status());
    const { user } = renderStrip();
    const strip = await screen.findByRole('button', { name: 'Всё работает' });
    strip.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Состояние системы' });
    expect(within(dialog).getByText('Публикация отключена')).toBeTruthy();
    expect(within(dialog).getByText('@alexeev_bot: Работает')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(strip));
  });

  it('opens the details as a bottom sheet on a phone, without the checked-at time', async () => {
    setViewport(375);
    serveHealth();
    serveBot(status());
    const { user } = renderStrip();
    const strip = await screen.findByRole('button', { name: 'Всё работает' });
    expect(screen.queryByText(/Проверено/)).toBeNull();
    await user.click(strip);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Состояние системы' })).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
