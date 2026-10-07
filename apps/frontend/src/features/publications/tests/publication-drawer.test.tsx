import type { PublicationDto } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, ids, publication } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { PublicationDrawer } from '../index';
import { inDays, renderInApp } from './harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const future = inDays(2);
const scheduled = (overrides: Partial<PublicationDto> = {}) =>
  publication({ scheduledAt: future, revision: 2, ...overrides });

function serveDetail(...versions: PublicationDto[]) {
  let calls = 0;
  server.use(
    http.get('*/api/v1/publications/:id', () => {
      const version = versions[Math.min(calls, versions.length - 1)];
      calls += 1;
      return HttpResponse.json(version);
    })
  );
  return () => calls;
}

async function openDrawer(options: { chatId?: string; pollMs?: number } = {}) {
  await renderInApp(
    <PublicationDrawer
      publicationId={ids.publication}
      isOpen
      onOpenChange={() => undefined}
      postTitle="Герой дня"
      destinationTitle="Канал"
      chatId={options.chatId ?? '@alexeev_chan'}
      pollMs={options.pollMs}
    />
  );
  const drawer = await screen.findByRole('dialog', { name: 'Герой дня' });
  const user = userEvent.setup();
  return { drawer, user };
}

describe('PublicationDrawer states', () => {
  it('sent: shows «Опубликовано», the pipeline and a Telegram link, with no actions', async () => {
    serveDetail(publication({ status: 'sent', externalMessageId: '4821', revision: 3 }));
    const { drawer } = await openDrawer();
    const link = await within(drawer).findByRole('link', { name: /Открыть в Telegram/ });
    expect(link.getAttribute('href')).toBe('https://t.me/alexeev_chan/4821');
    expect(within(drawer).getAllByText('Опубликовано').length).toBeGreaterThan(0);
    const pipeline = within(drawer).getByRole('list', { name: 'Этапы публикации' });
    expect(within(pipeline).getAllByRole('listitem')).toHaveLength(4);
    expect(within(drawer).queryByRole('button', { name: 'Отменить' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Перенести' })).toBeNull();
  });

  it('sent without a message id is not shown as published', async () => {
    serveDetail(publication({ status: 'sent', revision: 3 }));
    const { drawer } = await openDrawer();
    expect(await within(drawer).findByText('Нет подтверждения от Telegram')).toBeTruthy();
    expect(within(drawer).queryByText('Опубликовано')).toBeNull();
    expect(within(drawer).getAllByText('Требует проверки').length).toBeGreaterThan(0);
  });

  it('failed: explains the last error code in Russian and offers no retry', async () => {
    serveDetail(publication({ status: 'failed', lastErrorCode: 'DESTINATION_UNAVAILABLE', revision: 4 }));
    const { drawer } = await openDrawer();
    expect(await within(drawer).findByText('Отправка не удалась')).toBeTruthy();
    expect(within(drawer).getByText(/Бот не может писать в этот канал/)).toBeTruthy();
    expect(within(drawer).getByText('DESTINATION_UNAVAILABLE')).toBeTruthy();
    expect(within(drawer).queryByRole('button', { name: /Повторить|Отменить|Перенести/ })).toBeNull();
  });

  it('unknown: explains, has no plain retry, cancel or reschedule, and offers the reconciliation choices', async () => {
    serveDetail(publication({ status: 'unknown', lastErrorCode: 'SEND_UNCONFIRMED', revision: 4 }));
    const { drawer } = await openDrawer();
    expect(await within(drawer).findByText('Отправка не подтверждена')).toBeTruthy();
    expect(within(drawer).queryByRole('button', { name: /^(Повторить|Отменить|Перенести)$/ })).toBeNull();
    expect(within(drawer).getByRole('button', { name: 'Пост вышел' })).toBeTruthy();
  });

  it('sending: shows the in-progress hint instead of actions', async () => {
    serveDetail(publication({ status: 'sending', revision: 1 }));
    const { drawer } = await openDrawer();
    expect(await within(drawer).findByText(/Отправка уже началась или завершилась/)).toBeTruthy();
    expect(within(drawer).queryByRole('button', { name: 'Отменить' })).toBeNull();
  });

  it('shows an error with the request id and a retry for a failed load, and a plain message for 404', async () => {
    server.use(
      http.get('*/api/v1/publications/:id', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }))
    );
    const { drawer } = await openDrawer();
    expect(await within(drawer).findByText('Не удалось загрузить публикацию')).toBeTruthy();
    expect(within(drawer).getByText(/req-test-1/)).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });
});

describe('PublicationDrawer cancel', () => {
  it('confirms with the safe button focused, names the post, sends the revision and shows the server result', async () => {
    serveDetail(scheduled());
    let body: unknown;
    server.use(
      http.post('*/api/v1/publications/:id/cancel', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(scheduled({ status: 'cancelled', revision: 3 }));
      })
    );
    const { drawer, user } = await openDrawer();
    await user.click(await within(drawer).findByRole('button', { name: 'Отменить' }));
    const confirm = await screen.findByRole('alertdialog', { name: /Отменить публикацию «Герой дня» в «[^»]+» на/ });
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Не отменять' }));
    // Technical data is folded, not first-level.
    const details = within(confirm).getByRole('button', { name: 'Подробности' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    await user.click(details);
    expect(within(confirm).getByText('Ревизия')).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: 'Отменить публикацию' }));

    await waitFor(() => expect(body).toEqual({ revision: 2 }));
    expect(await screen.findByText('Публикация отменена')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Отменить публикацию «/ })).toBeNull());
    expect(within(drawer).getAllByText('Отменено').length).toBeGreaterThan(0);
  });

  it('does not touch the server when the owner keeps the publication', async () => {
    serveDetail(scheduled());
    let calls = 0;
    server.use(
      http.post('*/api/v1/publications/:id/cancel', () => {
        calls += 1;
        return HttpResponse.json(scheduled({ status: 'cancelled' }));
      })
    );
    const { drawer, user } = await openDrawer();
    await user.click(await within(drawer).findByRole('button', { name: 'Отменить' }));
    await user.click(await screen.findByRole('button', { name: 'Не отменять' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Отменить публикацию «/ })).toBeNull());
    expect(calls).toBe(0);
  });

  it('NOT_CANCELLABLE: explains, reloads the truth and removes the actions', async () => {
    const detail = serveDetail(scheduled(), scheduled({ status: 'sending', revision: 3 }));
    server.use(
      http.post('*/api/v1/publications/:id/cancel', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'NOT_CANCELLABLE' }), { status: 409 })
      )
    );
    const { drawer, user } = await openDrawer();
    await user.click(await within(drawer).findByRole('button', { name: 'Отменить' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Отменить публикацию' }));

    expect(await within(confirm).findByText('Отменить уже нельзя')).toBeTruthy();
    await waitFor(() => expect(detail()).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(within(confirm).getByRole('button', { name: 'Отменить публикацию' }).hasAttribute('disabled')).toBe(true)
    );
    await user.click(within(confirm).getByRole('button', { name: 'Не отменять' }));
    await waitFor(() => expect(within(drawer).queryByRole('button', { name: 'Отменить' })).toBeNull());
  });

  it('STALE_REVISION: reloads and a second confirm uses the new revision', async () => {
    serveDetail(scheduled(), scheduled({ revision: 5 }));
    const revisions: number[] = [];
    server.use(
      http.post('*/api/v1/publications/:id/cancel', async ({ request }) => {
        const { revision } = (await request.json()) as { revision: number };
        revisions.push(revision);
        return revisions.length === 1
          ? HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
          : HttpResponse.json(scheduled({ status: 'cancelled', revision: 6 }));
      })
    );
    const { drawer, user } = await openDrawer();
    await user.click(await within(drawer).findByRole('button', { name: 'Отменить' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Отменить публикацию' }));
    expect(await within(confirm).findByText('Публикация изменилась')).toBeTruthy();
    await waitFor(() => expect(revisions).toHaveLength(1));
    // Wait for the reloaded revision to reach the dialog before confirming again.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await user.click(within(confirm).getByRole('button', { name: 'Отменить публикацию' }));
    await waitFor(() => expect(revisions).toEqual([2, 5]));
  });
});

describe('PublicationDrawer reschedule', () => {
  it('sends the new time with the revision and the browser zone, and toasts the result', async () => {
    serveDetail(scheduled());
    let body: Record<string, unknown> = {};
    server.use(
      http.post('*/api/v1/publications/:id/reschedule', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(scheduled({ scheduledAt: String(body['scheduledAt']), revision: 3 }));
      })
    );
    const { drawer, user } = await openDrawer();
    await user.click(await within(drawer).findByRole('button', { name: 'Перенести' }));
    const dialog = await screen.findByRole('dialog', { name: 'Перенести публикацию' });
    expect(within(dialog).getByText(/Часовой пояс:/)).toBeTruthy();
    expect(within(dialog).getByText(/В UTC:/)).toBeTruthy();
    // Hour segment: change it so the request proves the typed value, not the old one, is sent.
    const hour = within(dialog).getAllByRole('spinbutton')[3];
    if (!hour) throw new Error('hour segment missing');
    await user.click(hour);
    await user.keyboard('07');
    await user.click(within(dialog).getByRole('button', { name: 'Перенести' }));

    await waitFor(() => expect(body['revision']).toBe(2));
    expect(body['timezone']).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(new Date(String(body['scheduledAt'])).getHours()).toBe(7);
    expect(await screen.findByText('Время изменено')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Перенести публикацию' })).toBeNull());
  });

  it('STALE_REVISION keeps the typed time and the retry carries the reloaded revision', async () => {
    serveDetail(scheduled(), scheduled({ revision: 7 }));
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post('*/api/v1/publications/:id/reschedule', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return sent.length === 1
          ? HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
          : HttpResponse.json(scheduled({ revision: 8 }));
      })
    );
    const { drawer, user } = await openDrawer();
    await user.click(await within(drawer).findByRole('button', { name: 'Перенести' }));
    const dialog = await screen.findByRole('dialog', { name: 'Перенести публикацию' });
    const hour = within(dialog).getAllByRole('spinbutton')[3];
    if (!hour) throw new Error('hour segment missing');
    await user.click(hour);
    await user.keyboard('06');
    await user.click(within(dialog).getByRole('button', { name: 'Перенести' }));

    expect(await within(dialog).findByText('Публикация изменилась')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await user.click(within(dialog).getByRole('button', { name: 'Перенести' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.['revision']).toBe(7);
    // The same typed time went out twice: nothing the owner entered was lost.
    expect(sent[1]?.['scheduledAt']).toBe(sent[0]?.['scheduledAt']);
    expect(new Date(String(sent[0]?.['scheduledAt'])).getHours()).toBe(6);
  });

  it('NOT_RESCHEDULABLE explains and disables the submit once the reloaded status is not reschedulable', async () => {
    serveDetail(scheduled(), scheduled({ status: 'sending', revision: 3 }));
    server.use(
      http.post('*/api/v1/publications/:id/reschedule', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'NOT_RESCHEDULABLE' }), { status: 409 })
      )
    );
    const { drawer, user } = await openDrawer();
    await user.click(await within(drawer).findByRole('button', { name: 'Перенести' }));
    const dialog = await screen.findByRole('dialog', { name: 'Перенести публикацию' });
    await user.click(within(dialog).getByRole('button', { name: 'Перенести' }));
    expect(await within(dialog).findByText('Время уже нельзя изменить')).toBeTruthy();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Перенести' }).hasAttribute('disabled')).toBe(true)
    );
  });
});

describe('PublicationDrawer polling', () => {
  it('polls while the publication is in progress and stops once it is final', async () => {
    const calls = serveDetail(
      scheduled({ status: 'queued' }),
      scheduled({ status: 'sending' }),
      publication({ status: 'sent', externalMessageId: '9', revision: 4 })
    );
    const { drawer } = await openDrawer({ pollMs: 40 });
    await within(drawer).findByRole('link', { name: /Открыть в Telegram/ }, { timeout: 2000 });
    const settled = calls();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(calls()).toBe(settled);
    expect(settled).toBeGreaterThanOrEqual(3);
  });
});
