import type { RubricItemDto, RubricSchedulerStatusDto, RubricSlotDetailDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { RubricList } from '../ui/RubricList';
import { RubricsAutopublishSettings } from '../ui/RubricsAutopublishSettings';
import { StartChecklistDialog } from '../ui/StartChecklistDialog';
import { RubricsForecast } from '../ui/RubricsForecast';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const status = (extra: Partial<RubricSchedulerStatusDto> = {}): RubricSchedulerStatusDto => ({
  mode: 'live',
  enabled: false,
  effective: 'switched_off',
  locks: [{ code: 'SWITCHED_OFF', fix: 'ENABLE_RUBRICS' }],
  destination: null,
  liveSlots: 0,
  next: null,
  firstSlot: null,
  lastPlanAt: null,
  capabilities: { browser: true, openai: true, stratz: true, statsDb: true },
  revision: 3,
  updatedAt: '2026-11-02T09:00:00.000Z',
  ...extra
});

const item = (extra: Partial<RubricItemDto> = {}): RubricItemDto => ({
  key: 'quote_of_day',
  state: 'active',
  missing: [],
  enabled: true,
  hasPicture: false,
  hasPoll: false,
  rest: { baseDays: 7, days: 7, source: 'default' },
  lastPostAt: '2026-10-30T09:00:00.000Z',
  lastPostSeeded: true,
  next: null,
  revision: 2,
  ...extra
});

const slot: RubricSlotDetailDto = {
  id: '00000000-0000-4000-8000-000000000011',
  rubricKey: 'confess',
  at: '2026-11-02T16:00:00.000Z',
  state: 'planned',
  hasPicture: false,
  hasPoll: false,
  reason: { kind: 'rest', text: 'Отдых 14 дн. прошёл' },
  detail: null,
  publicationId: null,
  candidates: ['confess', 'quote_of_day'],
  attempts: []
};

function show(ui: React.ReactNode) {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe('«Рубрики»', () => {
  it('keeps the switch off until a channel is chosen', async () => {
    server.use(
      http.get('*/api/v1/rubrics/status', () => HttpResponse.json(status())),
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [], nextCursor: null }))
    );
    show(<RubricsAutopublishSettings />);
    expect((await screen.findByRole('switch', { name: 'Рубрики выходят сами' })).hasAttribute('disabled')).toBe(true);
  });

  describe('«Что мешает запуску»', () => {
    const channel = {
      id: '00000000-0000-4000-8000-0000000000c1',
      title: 'Тестовый канал',
      chatId: '@t',
      kind: 'channel',
      enabled: true,
      revision: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z'
    };
    const blocked = status({
      mode: 'rehearsal',
      locks: [
        { code: 'SWITCHED_OFF', fix: 'ENABLE_RUBRICS' },
        { code: 'NO_DESTINATION', fix: 'PICK_CHANNEL' },
        { code: 'LAB_OFF', fix: 'ENABLE_LAB_JOB' },
        { code: 'PUBLISHING_OFF', fix: null }
      ]
    });
    const open = () => {
      server.use(
        http.get('*/api/v1/rubrics/status', () => HttpResponse.json(blocked)),
        http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [channel], nextCursor: null }))
      );
      show(<StartChecklistDialog status={blocked} isOpen onOpenChange={() => undefined} />);
    };

    it('lists every blocker, with a fix only where one exists, and never lists the switch itself', async () => {
      open();
      const dialog = await screen.findByRole('dialog', { name: 'Что мешает запуску' });
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
      expect(within(dialog).queryByText('Выключено: рубрики не выходят.')).toBeNull();
      expect(within(dialog).getByText('Выберите канал.')).toBeTruthy();
      expect(within(dialog).getByText('На DEV выключена фоновая задача «Рубрики».')).toBeTruthy();
      expect(within(dialog).getByText('Публикация выключена на сервере (PUBLISHING_ENABLED).')).toBeTruthy();
      // The channel picker and the one DEV button; the server setting has none.
      expect(within(dialog).getAllByRole('button', { name: /Сохранить|Включить всё нужное на DEV/ })).toHaveLength(2);
    });

    it('saves the picked channel on the shown revision, and only after a choice', async () => {
      let sent: unknown = null;
      server.use(
        http.put('*/api/v1/rubrics/scheduler', async ({ request }) => {
          sent = await request.json();
          return HttpResponse.json(blocked);
        })
      );
      open();
      const dialog = await screen.findByRole('dialog');
      const save = within(dialog).getByRole('button', { name: 'Сохранить' });
      expect(save.getAttribute('aria-disabled') ?? String(save.hasAttribute('disabled'))).toBe('true');
      await userEvent.click(within(dialog).getByRole('button', { name: /Канал/ }));
      await userEvent.click(await screen.findByRole('option', { name: 'Тестовый канал' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
      await vi.waitFor(() => expect(sent).toEqual({ enabled: false, destinationId: channel.id, revision: 3 }));
    });

    it('turns on everything DEV needs with one request', async () => {
      let called = 0;
      server.use(
        http.post('*/api/v1/rubrics/dev-enable', () => {
          called += 1;
          return HttpResponse.json(blocked);
        })
      );
      open();
      await userEvent.click(await screen.findByRole('button', { name: 'Включить всё нужное на DEV' }));
      await vi.waitFor(() => expect(called).toBe(1));
    });
  });

  it("saves a rubric's rest with the revision it showed", async () => {
    let sent: unknown = null;
    server.use(
      http.get('*/api/v1/rubrics', () => HttpResponse.json({ items: [item()] })),
      http.get('*/api/v1/rubrics/quote_of_day/slots', () => HttpResponse.json({ slots: [] })),
      http.patch('*/api/v1/rubrics/quote_of_day', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(item({ rest: { baseDays: 7, days: 12, source: 'manual' }, revision: 3 }));
      })
    );
    show(<RubricList />);
    await userEvent.click(await screen.findByRole('button', { name: /Цитата дня/ }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Сохранить' });
    expect(save.hasAttribute('disabled')).toBe(true);
    const more = within(dialog).getByRole('button', { name: 'Больше на день' });
    for (let step = 0; step < 5; step += 1) await userEvent.click(more);
    await userEvent.click(save);
    expect(await screen.findByText('Сохранено')).toBeTruthy();
    expect(sent).toEqual({ restDays: 12, revision: 2 });
  });

  it('opens a slot and skips it after a confirmation', async () => {
    let skipped = false;
    server.use(
      http.get('*/api/v1/rubrics/calendar', () => HttpResponse.json({ slots: [slot] })),
      http.get('*/api/v1/rubrics/slots/:id', () => HttpResponse.json(skipped ? { ...slot, state: 'cancelled' } : slot)),
      http.post('*/api/v1/rubrics/slots/:id/skip', () => {
        skipped = true;
        return HttpResponse.json({ ...slot, state: 'cancelled', detail: { code: 'OWNER_SKIPPED', step: null } });
      })
    );
    server.use(
      http.get('*/api/v1/rubrics/forecast', () =>
        HttpResponse.json({
          from: '2026-11-02',
          until: '2026-12-06',
          computedAt: '2026-11-02T09:00:00.000Z',
          days: [],
          unavailable: []
        })
      )
    );
    show(<RubricsForecast today="2026-11-02" onOpenRubric={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: /Признавайтесь, 19:00: Запланирован/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Отдых 14 дн\. прошёл/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Пропустить слот' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Пропустить слот' })
    );
    expect(await screen.findByText('Слот пропущен')).toBeTruthy();
    expect(skipped).toBe(true);
  });
});
