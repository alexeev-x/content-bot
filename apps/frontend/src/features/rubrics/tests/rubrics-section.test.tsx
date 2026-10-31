import type { RubricItemDto, RubricSchedulerStatusDto, RubricSlotDetailDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { RubricList } from '../ui/RubricList';
import { SchedulerPanel } from '../ui/SchedulerPanel';
import { UpcomingSlots } from '../ui/UpcomingSlots';

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
  locks: [{ code: 'SWITCHED_OFF' }],
  destination: null,
  liveSlots: 0,
  next: null,
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
  it('says what stops the scheduler and keeps the switch off until a channel is chosen', async () => {
    server.use(
      http.get('*/api/v1/rubrics/status', () => HttpResponse.json(status())),
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [], nextCursor: null }))
    );
    show(<SchedulerPanel />);
    expect(await screen.findByText('Выключено: рубрики не выходят.')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Рубрики выходят сами' }).hasAttribute('disabled')).toBe(true);
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
    show(<UpcomingSlots today="2026-11-02" />);
    await userEvent.click(await screen.findByRole('button', { name: /Открыть слот «Признавайтесь»/ }));
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
