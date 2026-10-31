import type { RubricForecastDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { RubricsForecast } from '../ui/RubricsForecast';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const days = Array.from({ length: 35 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 10, 2 + index)).toISOString().slice(0, 10),
  slots: [] as RubricForecastDto['days'][number]['slots']
}));
days[0]?.slots.push({
  rubricKey: 'confess',
  at: '2026-11-02T16:00:00.000Z',
  hasPicture: false,
  hasPoll: false,
  reason: { kind: 'rest', text: 'Отдых 14 дн. прошёл' }
});
days[7]?.slots.push({
  rubricKey: 'horoscope',
  at: '2026-11-09T05:00:00.000Z',
  hasPicture: true,
  hasPoll: false,
  reason: { kind: 'anchor', text: 'Понедельник через неделю, 08:00' }
});

const forecast = (extra: Partial<RubricForecastDto> = {}): RubricForecastDto => ({
  from: '2026-11-02',
  until: '2026-12-06',
  computedAt: '2026-11-02T09:00:00.000Z',
  days,
  unavailable: [{ rubricKey: 'hero_guide', missing: ['stratz', 'stats_db'] }],
  ...extra
});

function renderForecast(body: RubricForecastDto | null) {
  server.use(http.get('*/api/v1/rubrics/calendar', () => HttpResponse.json({ slots: [] })));
  server.use(
    http.get('*/api/v1/rubrics/forecast', () =>
      body === null
        ? HttpResponse.json({ error: { code: 'UNAVAILABLE', message: 'x', requestId: 'req-1' } }, { status: 503 })
        : HttpResponse.json(body)
    )
  );
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RubricsForecast today="2026-11-02" onOpenRubric={() => undefined} />
    </QueryClientProvider>
  );
}

describe('RubricsForecast', () => {
  it('says it is a forecast and shows the month in Moscow time', async () => {
    renderForecast(forecast());
    expect(await screen.findByText('Это прогноз')).toBeTruthy();
    const chip = screen.getByRole('button', { name: 'Признавайтесь, 19:00: Прогноз' });
    expect(within(chip).getByText('19:00')).toBeTruthy();
    await userEvent.click(chip);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/слот ещё не создан/)).toBeTruthy();
    // A forecast line has no slot to skip.
    expect(within(dialog).queryByRole('button', { name: /Пропустить/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Открыть рубрику' })).toBeTruthy();
  });

  it('lists the filled days with why each rubric goes then', async () => {
    renderForecast(forecast());
    await userEvent.click(await screen.findByRole('radio', { name: 'Список' }));
    expect(screen.getByText('Понедельник через неделю, 08:00')).toBeTruthy();
    expect(screen.getByText('Гороскоп')).toBeTruthy();
  });

  it('names the rubrics this server cannot run and what they lack', async () => {
    renderForecast(forecast());
    await userEvent.click(await screen.findByRole('button', { name: /не могут выходить на этом сервере: 1/i }));
    expect(screen.getByText(/нужно: STRATZ, база матчей/)).toBeTruthy();
  });

  it('shows an empty forecast plainly', async () => {
    renderForecast(forecast({ days: days.map((day) => ({ ...day, slots: [] })), unavailable: [] }));
    expect(await screen.findByText('Слотов нет')).toBeTruthy();
  });

  it('offers a retry with the request id when the forecast fails', async () => {
    renderForecast(null);
    expect(await screen.findByRole('button', { name: /повтор/i })).toBeTruthy();
  });
});
