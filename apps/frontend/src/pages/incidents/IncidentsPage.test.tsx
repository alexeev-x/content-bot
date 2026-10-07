import type { IncidentDto, IncidentPageDto } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { failedIncident, incidentPage, JOB, PUBLICATION, unknownIncident, uuid } from '../../test/incident-fixtures';
import { clearSession, setSession } from '../../shared/api/session';
import { accessToken, errorBody } from '../../test/fixtures';
import { failWith, server, setupMswServer } from '../../test/msw';
import { renderPage } from '../../test/render-app';
import { IncidentsPage } from './IncidentsPage';
import { incidentsSearchSchema, type IncidentsSearch } from './search';

// The owner's zone is the browser's: pin it so «14:30» below means 11:30 UTC.
process.env['TZ'] = 'Europe/Chisinau';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'visibilityState');
  document.dispatchEvent(new Event('visibilitychange'));
});

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Mirrors the route: filters live in "the URL" (a state here), the rest is the page. */
function Harness({ initial, pollMs }: { initial: IncidentsSearch; pollMs?: number }) {
  const [search, setSearch] = useState(initial);
  return (
    <IncidentsPage
      search={search}
      onSearchChange={(patch) => setSearch((previous) => incidentsSearchSchema.parse({ ...previous, ...patch }))}
      onOpenPublication={() => undefined}
      onOpenPublications={() => undefined}
      {...(pollMs ? { pollMs } : {})}
    />
  );
}

async function renderIncidents(options: { initial?: Partial<IncidentsSearch>; pollMs?: number } = {}) {
  const view = await renderPage(
    <Harness
      initial={incidentsSearchSchema.parse(options.initial ?? {})}
      {...(options.pollMs ? { pollMs: options.pollMs } : {})}
    />
  );
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

/** Serves pages by `state`/`kind`/`cursor`; records every request URL. */
function serveIncidents(handler: (url: URL, call: number) => IncidentPageDto) {
  const urls: URL[] = [];
  server.use(
    http.get('*/api/v1/incidents', ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      return HttpResponse.json(handler(url, urls.length));
    })
  );
  return urls;
}

const closed = (incident: IncidentDto, resolvedAt = '2026-10-07T11:40:00.000Z'): IncidentDto => ({
  ...incident,
  resolvedAt
});

describe('incident rows', () => {
  it('shows 5 busy skeleton rows first', async () => {
    serveIncidents(() => incidentPage([failedIncident()]));
    await renderPage(<Harness initial={incidentsSearchSchema.parse({})} />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelectorAll('[aria-busy="true"] > div')).toHaveLength(5);
    await screen.findByText('Герой дня');
  });

  it('gives an open unknown incident «Проверить» and a warning, never «Закрыть»', async () => {
    serveIncidents(() => incidentPage([unknownIncident()]));
    const user = userEvent.setup();
    const { router } = await renderPage(
      <IncidentsPage
        search={incidentsSearchSchema.parse({})}
        onSearchChange={() => undefined}
        onOpenPublication={(id) => void router.navigate({ to: '/publications', search: { id } })}
        onOpenPublications={() => undefined}
      />
    );
    const list = await screen.findByRole('list', { name: 'Инциденты' });
    const row = within(list).getByRole('listitem');
    expect(within(row).getByText('Требует проверки')).toBeTruthy();
    expect(within(row).getByText('Не повторяйте отправку, пока не проверили канал')).toBeTruthy();
    expect(within(row).getByText(/Ответ Telegram не получен, сообщение могло уйти/)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /Закрыть/ })).toBeNull();
    await user.click(within(row).getByRole('button', { name: /^Проверить/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/publications'));
    expect(router.state.location.search).toMatchObject({ id: '33333333-3333-4333-8333-000000000008' });
  });

  it('maps codes to reasons, shows attempts, and names an unmapped code', async () => {
    serveIncidents(() =>
      incidentPage([failedIncident(), failedIncident({ id: uuid(3), code: 'NEW_CODE', attemptCount: 0 })])
    );
    await renderIncidents();
    expect(screen.getByText(/Бот потерял доступ к каналу · попыток: 3/)).toBeTruthy();
    expect(screen.getByText(/Ошибка NEW_CODE · попыток: 0/)).toBeTruthy();
  });

  it('shows closed rows with the closing time and only «Открыть»', async () => {
    serveIncidents(() => incidentPage([closed(failedIncident())], { openCount: 0 }));
    await renderIncidents({ initial: { state: 'resolved' } });
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(/Закрыт 7 окт\., 14:40/)).toBeTruthy();
    expect(within(row).getByRole('button', { name: /^Открыть/ })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /Закрыть/ })).toBeNull();
  });

  it('keeps the job id behind «Детали», copyable, and never shows raw details', async () => {
    serveIncidents(() => incidentPage([failedIncident()]));
    const user = userEvent.setup();
    await renderIncidents();
    expect(screen.getByText(JOB).closest('details')?.open).toBe(false);
    await user.click(screen.getByText('Детали'));
    expect(screen.getByText(JOB).closest('details')?.open).toBe(true);
    expect(screen.getByRole('button', { name: /Копировать: ID задачи/ })).toBeTruthy();
  });
});

describe('closing a failed incident', () => {
  it('shows the button loading, keeps the row until the 200, then moves it and toasts', async () => {
    let released: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    let isClosed = false;
    serveIncidents((url) =>
      url.searchParams.get('state') === 'open'
        ? incidentPage(isClosed ? [] : [failedIncident()], { openCount: isClosed ? 0 : 1 })
        : incidentPage([closed(failedIncident())], { openCount: 0 })
    );
    server.use(
      http.post('*/api/v1/incidents/:id/resolve', async () => {
        await gate;
        isClosed = true;
        return HttpResponse.json(closed(failedIncident()));
      })
    );
    const user = userEvent.setup();
    await renderIncidents();
    const button = screen.getByRole('button', { name: /^Закрыть/ });
    await user.click(button);
    await waitFor(() => expect(button.hasAttribute('data-pending')).toBe(true));
    expect(screen.getByText('Герой дня')).toBeTruthy();
    expect(screen.queryByText('Инцидент закрыт')).toBeNull();
    released();
    expect(await screen.findByText('Открытых инцидентов нет')).toBeTruthy();
    expect(screen.getByText('Инцидент закрыт')).toBeTruthy();
  });

  it('keeps the row and offers a retry in a toast with the request id when the server fails', async () => {
    let attempts = 0;
    serveIncidents(() => incidentPage([failedIncident()]));
    server.use(
      http.post('*/api/v1/incidents/:id/resolve', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })
          : HttpResponse.json(closed(failedIncident()));
      })
    );
    const user = userEvent.setup();
    await renderIncidents();
    await user.click(screen.getByRole('button', { name: /^Закрыть/ }));
    expect(await screen.findByText('Не удалось закрыть инцидент')).toBeTruthy();
    expect(screen.getByText('Идентификатор запроса: req-test-1')).toBeTruthy();
    expect(screen.getByText('Герой дня')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Инцидент закрыт')).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it('explains 409 USE_RESOLVE_UNKNOWN in the row with a link to the publication', async () => {
    serveIncidents(() => incidentPage([failedIncident()]));
    server.use(
      failWith('post', `/api/v1/incidents/${uuid(1)}/resolve`, {
        status: 409,
        code: 'CONFLICT',
        reason: 'USE_RESOLVE_UNKNOWN'
      })
    );
    const user = userEvent.setup();
    await renderIncidents();
    await user.click(screen.getByRole('button', { name: /^Закрыть/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Сначала проверьте отправку');
    const link = within(alert).getByRole('link', { name: 'Открыть публикацию' });
    expect(link.getAttribute('href')).toContain(`/publications?id=${PUBLICATION}`);
    expect(screen.getByText('Герой дня')).toBeTruthy();
    expect(screen.queryByText('Инцидент закрыт')).toBeNull();
  });
});

describe('incident list states', () => {
  it('shows 25 of 30 open incidents, loads the rest by cursor without duplicates', async () => {
    const all = Array.from({ length: 30 }, (_, index) =>
      failedIncident({
        id: uuid(100 + index),
        jobId: undefined,
        publication: { ...failedIncident().publication!, postTitle: `Пост ${index + 1}` }
      })
    );
    const urls = serveIncidents((url) =>
      url.searchParams.get('cursor') === 'c1'
        ? incidentPage(all.slice(25), { openCount: 30 })
        : incidentPage(all.slice(0, 25), { nextCursor: 'c1', openCount: 30 })
    );
    const user = userEvent.setup();
    await renderIncidents();
    expect(screen.getAllByRole('listitem')).toHaveLength(25);
    expect(urls[0]?.searchParams.get('limit')).toBe('25');
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(30));
    expect(new Set(screen.getAllByRole('listitem').map((item) => item.textContent)).size).toBe(30);
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  it('does not duplicate a row that a refetch returns on two pages', async () => {
    const one = failedIncident({ id: uuid(1) });
    const two = failedIncident({ id: uuid(2), publication: { ...failedIncident().publication!, postTitle: 'Второй' } });
    serveIncidents((url) =>
      url.searchParams.get('cursor') === 'c1' ? incidentPage([two]) : incidentPage([one, two], { nextCursor: 'c1' })
    );
    const user = userEvent.setup();
    await renderIncidents();
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull());
    expect(screen.getAllByText('Второй')).toHaveLength(1);
  });

  it('sends the state and kind filters and shows the filter empty state with a reset', async () => {
    const urls = serveIncidents((url) =>
      url.searchParams.get('kind') ? incidentPage([], { openCount: 1 }) : incidentPage([failedIncident()])
    );
    const user = userEvent.setup();
    await renderIncidents();
    await user.click(screen.getByRole('radio', { name: 'Требуют проверки' }));
    expect(await screen.findByText('Ничего не найдено по фильтру')).toBeTruthy();
    expect(urls.at(-1)?.searchParams.get('kind')).toBe('publish_unknown');
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(await screen.findByText('Герой дня')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Закрытые' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('state')).toBe('resolved'));
  });

  it('shows the empty states of open and closed lists', async () => {
    serveIncidents(() => incidentPage([], { openCount: 0 }));
    const user = userEvent.setup();
    await renderIncidents();
    expect(screen.getByText('Открытых инцидентов нет')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'К публикациям' })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Закрытые' }));
    expect(await screen.findByText('История пуста')).toBeTruthy();
  });

  it('shows the error with the request id and retries', async () => {
    server.use(failWith('get', '/api/v1/incidents', { status: 500, code: 'UNAVAILABLE' }));
    const user = userEvent.setup();
    await renderIncidents();
    expect(await screen.findByText('Не удалось загрузить инциденты')).toBeTruthy();
    expect(screen.getByText('req-test-1')).toBeTruthy();
    serveIncidents(() => incidentPage([failedIncident()]));
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Герой дня')).toBeTruthy();
  });

  it('keeps the list and says the data is stale (role=status) when a refetch fails', async () => {
    let fail = false;
    server.use(
      http.get('*/api/v1/incidents', () =>
        fail
          ? HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })
          : HttpResponse.json(incidentPage([failedIncident()]))
      )
    );
    await renderIncidents({ pollMs: 40 });
    fail = true;
    const stale = await screen.findByText('Данные устарели', {}, { timeout: 2000 });
    expect(stale.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByText('Герой дня')).toBeTruthy();
  });

  it('shows «Нет доступа» on 403 and nothing on 401 once re-auth is refused', async () => {
    server.use(failWith('get', '/api/v1/incidents', { status: 403, code: 'FORBIDDEN' }));
    await renderIncidents();
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Открытые' })).toBeNull();
    cleanup();
    server.use(
      failWith('get', '/api/v1/incidents', { status: 401, code: 'UNAUTHORIZED' }),
      failWith('post', '/api/v1/auth/refresh', { status: 401, code: 'UNAUTHORIZED' })
    );
    await renderIncidents();
    expect(await screen.findByText('Не удалось загрузить инциденты')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Инциденты' })).toBeNull();
  });

  it('polls only while the tab is visible', async () => {
    const urls = serveIncidents(() => incidentPage([failedIncident()]));
    await renderIncidents({ pollMs: 40 });
    await waitFor(() => expect(urls.length).toBeGreaterThan(2), { timeout: 2000 });
    setVisibility('hidden');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const hiddenAt = urls.length;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(urls.length).toBe(hiddenAt);
    setVisibility('visible');
    await waitFor(() => expect(urls.length).toBeGreaterThan(hiddenAt), { timeout: 2000 });
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stoppedAt = urls.length;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(urls.length).toBe(stoppedAt);
  });
});
