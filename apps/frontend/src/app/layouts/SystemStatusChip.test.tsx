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
import { SystemStatusChip } from './SystemStatusChip';

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
        <SystemStatusChip />
      </ToastProvider>
    </Wrapper>
  );
  return { user };
}

const chipName = (label: string) => new RegExp(`^Состояние системы: ${label}`);

describe('system status chip', () => {
  it('shows a busy skeleton, then one chip without a time when everything works', async () => {
    serveHealth();
    serveBot(status());
    renderStrip();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    const chip = await screen.findByRole('button', { name: chipName('Всё работает') });
    expect(chip.querySelector('time')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Всё работает');
  });

  it('opens three one-word rows with ONE check time and no per-row times or reconnect', async () => {
    serveHealth();
    serveBot(status());
    const { user } = renderStrip();
    await user.click(await screen.findByRole('button', { name: chipName('Всё работает') }));
    const dialog = await screen.findByRole('dialog', { name: 'Состояние системы' });
    const rows = within(dialog).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['СервисРаботает', 'ПубликацияОтключена', 'БотРаботает']);
    const times = dialog.querySelectorAll('time');
    expect(times).toHaveLength(1);
    expect(times[0]?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(dialog.textContent).toContain('обновляется каждую минуту');
    expect(within(dialog).queryByRole('button')).toBeNull();
  });

  it('names a single problem on the chip; the fix lives in the popover and the chip returns to healthy after it', async () => {
    serveHealth();
    serveBot(unconnected());
    server.use(http.post('*/api/v1/bot/connect', () => HttpResponse.json(status())));
    const { user } = renderStrip();
    const chip = await screen.findByRole('button', { name: chipName('Бот не подключён') });
    // Nothing but the chip is offered until the owner opens the details.
    expect(screen.queryByRole('button', { name: 'Подключить' })).toBeNull();
    await user.click(chip);
    const dialog = await screen.findByRole('dialog', { name: 'Состояние системы' });
    await user.click(within(dialog).getByRole('button', { name: 'Подключить бота' }));
    expect(await screen.findByText('Бот подключён. Отправьте ему /start')).toBeTruthy();
    // The popover stays open and is modal, so the chip behind it is hidden from the accessibility tree.
    expect(await screen.findByRole('button', { name: chipName('Всё работает'), hidden: true })).toBeTruthy();
  });

  it('collapses several problems into a count on the chip', async () => {
    failHealth();
    serveBot(unconnected());
    const { user } = renderStrip();
    await user.click(await screen.findByRole('button', { name: chipName('Требует внимания: 2') }));
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
    await user.click(await screen.findByRole('button', { name: chipName('Бот не настроен') }));
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
    await user.click(await screen.findByRole('button', { name: chipName('Нужно применить миграцию базы') }));
    const dialog = await screen.findByRole('dialog', { name: 'Состояние системы' });
    const retry = await within(dialog).findByRole('button', { name: 'Повторить' });
    serveBot(status());
    await user.click(retry);
    expect(await screen.findByRole('button', { name: chipName('Всё работает'), hidden: true })).toBeTruthy();
  });

  it('opening the details of a failed bot status does not start a refetch loop', async () => {
    serveHealth();
    let requests = 0;
    server.use(
      http.get('*/api/v1/bot/status', () => {
        requests += 1;
        return HttpResponse.json({ error: { code: 'UNAVAILABLE', message: 'x', requestId: 'req-1' } }, { status: 503 });
      })
    );
    const { user } = renderStrip();
    await user.click(await screen.findByRole('button', { name: chipName('Не удалось') }));
    await screen.findByRole('dialog', { name: 'Состояние системы' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(requests).toBeLessThanOrEqual(4);
    expect(screen.getByRole('dialog', { name: 'Состояние системы' })).toBeTruthy();
  });

  it('opens a popover on desktop with Enter and returns focus to the chip on Escape', async () => {
    serveHealth();
    serveBot(status());
    const { user } = renderStrip();
    const chip = await screen.findByRole('button', { name: chipName('Всё работает') });
    chip.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Состояние системы' });
    expect(within(dialog).getByText('Отключена')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('opens the details as a bottom sheet on a phone', async () => {
    setViewport(375);
    serveHealth();
    serveBot(status());
    const { user } = renderStrip();
    const chip = await screen.findByRole('button', { name: chipName('Всё работает') });
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    await user.click(chip);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Состояние системы' })).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
