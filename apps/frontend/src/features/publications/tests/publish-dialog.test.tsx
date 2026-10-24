import type { PostDto, PublicationDto } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, destination, errorBody, ids, post, publication, publicationPage } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { PublicationSettings, PublishDialog } from '../index';
import { defaultScheduledAt, publishFormSchema } from '../model/publish-form';
import { renderInApp } from './harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const approved = (overrides: Partial<PostDto> = {}) => post({ status: 'approved', revision: 3, ...overrides });

type Sent = { body: Record<string, unknown>; key: string | null };

function captureCreate(respond: (call: number) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  server.use(
    http.post('*/api/v1/publications', async ({ request }) => {
      sent.push({
        body: (await request.json()) as Record<string, unknown>,
        key: request.headers.get('Idempotency-Key')
      });
      return respond(sent.length);
    })
  );
  return sent;
}

const accepted = (overrides: Partial<PublicationDto> = {}) =>
  HttpResponse.json(publication(overrides), { status: 202 });

async function open(
  options: {
    post?: PostDto;
    onPublished?: (publication: PublicationDto) => void;
    hasChannels?: boolean;
    existing?: PublicationDto[];
  } = {}
) {
  server.use(http.get('*/api/v1/publications', () => HttpResponse.json(publicationPage(options.existing ?? []))));
  function Host() {
    const [isOpen, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Опубликовать
        </button>
        <PublishDialog
          post={options.post ?? approved()}
          isOpen={isOpen}
          onOpenChange={setOpen}
          {...(options.onPublished ? { onPublished: options.onPublished } : {})}
        />
      </>
    );
  }
  await renderInApp(<Host />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Опубликовать' }));
  const dialog = await screen.findByRole('dialog', { name: 'Опубликовать пост' });
  if (options.hasChannels !== false) await within(dialog).findByRole('button', { name: /Канал/ });
  return { user, dialog };
}

describe('PublishDialog', () => {
  it('sends on the submit press itself, with no second confirmation', async () => {
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.queryByRole('alertdialog', { name: 'Подтвердить публикацию?' })).toBeNull();
  });
  it('PublicationSettings sends once on the press, refuses a second one while the first is on its way', async () => {
    const sent = captureCreate(() => accepted());
    server.use(http.get('*/api/v1/publications', () => HttpResponse.json(publicationPage([]))));
    await renderInApp(
      <PublicationSettings post={approved()} onBack={() => undefined}>
        <div />
      </PublicationSettings>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.queryByRole('dialog', { name: 'Опубликовать пост' })).toBeNull();
    expect(await screen.findByText('Запланировано')).toBeTruthy();
    // Pressing again while the first is still on its way is refused (owner, 17.10.2026): no second request.
    server.use(
      http.get('*/api/v1/publications', () =>
        HttpResponse.json(publicationPage([publication({ status: 'scheduled' })]))
      )
    );
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
    expect(await screen.findByText('Этот пост уже в очереди в этом канале')).toBeTruthy();
    expect(screen.queryByRole('alertdialog', { name: /Опубликовать ещё раз/ })).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('sends «Сейчас» with the post revision, the browser zone and an Idempotency-Key, then toasts the returned status', async () => {
    const onPublished = vi.fn();
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open({ onPublished });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Канал/ }).textContent).toContain('Канал'));
    const before = Date.now();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    const [call] = sent;
    expect(call?.body).toMatchObject({
      postId: ids.post,
      revision: 3,
      destinationId: ids.destination,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    expect(Date.parse(String(call?.body['scheduledAt']))).toBeGreaterThanOrEqual(before - 1000);
    expect(call?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Запланировано')).toBeTruthy();
    expect(screen.queryByText('Опубликовано')).toBeNull();
    expect(onPublished).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Опубликовать пост' })).toBeNull());
  });

  it('shows «В очереди» when the server answers queued, never «Опубликовано»', async () => {
    captureCreate(() => accepted({ status: 'queued' }));
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    expect(await screen.findByText('В очереди')).toBeTruthy();
    expect(screen.queryByText('Опубликовано')).toBeNull();
  });

  it('does not read a bare «sent» 202 as published: without a message id it asks for a check', async () => {
    captureCreate(() => accepted({ status: 'sent' }));
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    expect(await screen.findByText('Требует проверки')).toBeTruthy();
    expect(screen.queryByText('Опубликовано')).toBeNull();
  });

  it('schedules for a later time: the default is a future quarter hour and the field shows the zone', async () => {
    // Only Date is frozen, mid-quarter: on the real clock a run just before :00/:15/:30/:45 let the default
    // pass into the past before the submit (CI 21.10.2026). Timers stay real for user-event and waitFor.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T10:07:00Z'));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('radio', { name: 'Запланировать' }));
    expect(await within(dialog).findByText(/Часовой пояс:/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Запланировать' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    const at = Date.parse(String(sent[0]?.body['scheduledAt']));
    expect(at).toBeGreaterThan(Date.now());
    expect(new Date(at).getUTCMinutes() % 15).toBe(0);
    expect(await screen.findByText(/^Отправка .*Если что-то пойдёт не так, бот напишет\./)).toBeTruthy();
  });

  it('reuses the Idempotency-Key and the same instant when a «Сейчас» submit is retried after a network failure', async () => {
    const sent = captureCreate((call) => (call === 1 ? HttpResponse.error() : accepted()));
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));

    expect(await within(dialog).findByText('Не удалось подтвердить, создана ли публикация')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Открыть список публикаций' })).toBeTruthy();
    // What the owner picked stays.
    expect(within(dialog).getByRole('button', { name: /Канал/ }).textContent).toContain('Канал');

    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(sent[1]?.body['scheduledAt']).toBe(sent[0]?.body['scheduledAt']);
    expect(await screen.findByText('Запланировано')).toBeTruthy();
  });

  it.each([
    ['POST_NOT_APPROVED', 409, 'CONFLICT', 'Пост не одобрен'],
    ['POST_ARCHIVED', 409, 'CONFLICT', 'Пост в архиве'],
    ['STALE_REVISION', 409, 'CONFLICT', 'Пост изменился'],
    ['DESTINATION_DISABLED', 409, 'CONFLICT', 'Канал отключён'],
    ['SCHEDULE_OUT_OF_RANGE', 400, 'VALIDATION_ERROR', 'Время вне допустимого диапазона'],
    ['IN_FLIGHT', 409, 'CONFLICT', 'Заявка уже обрабатывается'],
    ['IDEMPOTENCY_KEY_REUSED', 409, 'CONFLICT', 'Заявка изменилась']
  ] as const)('explains %s in the dialog, keeps it open and keeps the input', async (reason, status, code, title) => {
    server.use(http.post('*/api/v1/publications', () => HttpResponse.json(errorBody(code, { reason }), { status })));
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));

    expect(await within(dialog).findByText(title)).toBeTruthy();
    expect(within(dialog).getByText(/req-test-1/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Канал/ }).textContent).toContain('Канал');
    if (reason === 'STALE_REVISION') {
      expect(within(dialog).getByRole('button', { name: 'Загрузить актуальную версию' })).toBeTruthy();
    }
    if (reason === 'POST_ARCHIVED') {
      expect(within(dialog).getByRole('button', { name: 'Обновить пост' })).toBeTruthy();
    }
    // The submit button is usable again: the owner can correct and resend.
    expect(within(dialog).getByRole('button', { name: 'Отправить сейчас' }).getAttribute('aria-disabled')).not.toBe(
      'true'
    );
  });

  it('explains 429 with the Retry-After wait and 503 as an unconfirmed request', async () => {
    let call = 0;
    server.use(
      http.post('*/api/v1/publications', () => {
        call += 1;
        return call === 1
          ? HttpResponse.json(errorBody('RATE_LIMIT'), { status: 429, headers: { 'Retry-After': '12' } })
          : HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 });
      })
    );
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    expect(await within(dialog).findByText('Слишком много запросов')).toBeTruthy();
    expect(within(dialog).getByText(/Подождите 12 с/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    expect(await within(dialog).findByText('Не удалось подтвердить, создана ли публикация')).toBeTruthy();
  });

  it('lets the owner pick among several channels', async () => {
    const other = destination({ id: '22222222-2222-4222-8222-333333333333', title: 'Новости' });
    server.use(
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [destination(), other], nextCursor: null }))
    );
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: /Канал/ }));
    await user.click(await screen.findByRole('option', { name: /Новости/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent[0]?.body['destinationId']).toBe(other.id));
  });

  it('requires a channel when several exist and says so inline', async () => {
    const other = destination({ id: '22222222-2222-4222-8222-333333333333', title: 'Новости' });
    server.use(
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [destination(), other], nextCursor: null }))
    );
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    expect((await within(dialog).findAllByText('Выберите канал.')).length).toBeGreaterThan(0);
    expect(sent).toHaveLength(0);
  });

  it('links to channel settings when no channel is enabled', async () => {
    server.use(http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [], nextCursor: null })));
    const { dialog } = await open({ hasChannels: false });
    const link = await within(dialog).findByRole('link', { name: 'Открыть каналы' });
    expect(link.getAttribute('href')).toBe('/settings/channels');
    expect(within(dialog).getByRole('button', { name: 'Отправить сейчас' }).hasAttribute('disabled')).toBe(true);
  });

  it('refuses a draft post before any request is made', async () => {
    const sent = captureCreate(() => accepted());
    const { dialog } = await open({ post: post({ status: 'draft' }) });
    expect(within(dialog).getByText('Пост не одобрен')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Отправить сейчас' }).hasAttribute('disabled')).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe('publishFormSchema', () => {
  const base = { destinationId: ids.destination, mode: 'later' as const };
  const at = (offsetMs: number) => ({ toDate: () => new Date(Date.now() + offsetMs) });

  it('rejects a past time, a time more than 366 days ahead and a missing time', () => {
    const issue = (scheduledAt: unknown) => {
      const result = publishFormSchema.safeParse({ ...base, scheduledAt });
      return result.success ? undefined : result.error.issues[0]?.message;
    };
    expect(issue(at(-60_000))).toBe('Укажите время в будущем.');
    expect(issue(at(367 * 86_400_000))).toBe('Публикацию можно запланировать не дальше чем на 366 дней вперёд.');
    expect(issue(null)).toBe('Укажите дату и время публикации.');
    expect(issue(at(3_600_000))).toBeUndefined();
  });

  it('ignores the time field for «Сейчас»', () => {
    expect(publishFormSchema.safeParse({ ...base, mode: 'now', scheduledAt: null }).success).toBe(true);
  });

  it('suggests the next quarter-hour for a new schedule', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-07T10:27:00Z') });
    expect(defaultScheduledAt('Europe/Chisinau').toString()).toContain('T13:30');
    vi.setSystemTime(new Date('2026-10-07T10:52:00Z'));
    expect(defaultScheduledAt('Europe/Chisinau').toString()).toContain('T14:00');
  });
});

const pendingKeys = () => Object.keys(sessionStorage).filter((name) => name.startsWith('publish-intent:'));

describe('publish intent (lost 202 must never create a second publication)', () => {
  it('reuses the key and the instant when the retry comes 5 minutes after a lost answer', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-06T09:00:00Z') });
    try {
      const sent = captureCreate((call) => (call === 1 ? HttpResponse.error() : accepted()));
      const { user, dialog } = await open();
      await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
      expect(await within(dialog).findByText('Не удалось подтвердить, создана ли публикация')).toBeTruthy();
      expect(pendingKeys()).toHaveLength(1);

      vi.setSystemTime(new Date('2026-10-06T09:05:30Z'));
      await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
      await waitFor(() => expect(sent).toHaveLength(2));
      expect(sent[1]?.key).toBe(sent[0]?.key);
      expect(sent[1]?.body['scheduledAt']).toBe('2026-10-06T09:00:00.000Z');
      expect(sent[1]?.body['scheduledAt']).toBe(sent[0]?.body['scheduledAt']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a remount or reload: the pending attempt is announced, pre-filled and resent unchanged', async () => {
    const sent = captureCreate((call) => (call === 1 ? HttpResponse.error() : accepted()));
    const first = await open();
    await first.user.click(within(first.dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await within(first.dialog).findByText('Не удалось подтвердить, создана ли публикация');
    cleanup();

    const second = await open();
    expect(await within(second.dialog).findByText('Предыдущая попытка могла сработать')).toBeTruthy();
    expect(within(second.dialog).getByRole('button', { name: /Канал/ }).textContent).toContain('Канал');
    await second.user.click(within(second.dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(sent[1]?.body['scheduledAt']).toBe(sent[0]?.body['scheduledAt']);
    await waitFor(() => expect(pendingKeys()).toHaveLength(0));
  });

  it('keeps the intent on 5xx, IN_FLIGHT and 429', async () => {
    const answers = [
      HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }),
      HttpResponse.json(errorBody('CONFLICT', { reason: 'IN_FLIGHT' }), { status: 409 }),
      HttpResponse.json(errorBody('RATE_LIMIT'), { status: 429 })
    ];
    const sent = captureCreate((call) => answers[call - 1] ?? accepted());
    const { user, dialog } = await open();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
      await waitFor(() => expect(sent).toHaveLength(attempt + 1));
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Отправить сейчас' }).getAttribute('aria-disabled')).not.toBe(
          'true'
        )
      );
      expect(pendingKeys()).toHaveLength(1);
    }
    expect(new Set(sent.map((call) => call.key)).size).toBe(1);
  });

  it('a definitive refusal clears the intent: the next attempt is a fresh request', async () => {
    const sent = captureCreate((call) =>
      call === 1
        ? HttpResponse.json(errorBody('VALIDATION_ERROR', { reason: 'SCHEDULE_OUT_OF_RANGE' }), { status: 400 })
        : accepted()
    );
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    expect(await within(dialog).findByText('Время вне допустимого диапазона')).toBeTruthy();
    expect(pendingKeys()).toHaveLength(0);
    expect(within(dialog).queryByText('Предыдущая попытка могла сработать')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
  });

  it('success clears the intent, so a later publish of the same post is a new request', async () => {
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    await waitFor(() => expect(pendingKeys()).toHaveLength(0));
  });

  it('asks before publishing again when the post is already in this channel, with the safe answer focused', async () => {
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open({ existing: [publication({ status: 'sent', externalMessageId: '7' })] });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    const confirm = await screen.findByRole('alertdialog', { name: /уже опубликован в этом канале/ });
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Не публиковать' }));
    expect(sent).toHaveLength(0);

    await user.click(within(confirm).getByRole('button', { name: 'Не публиковать' }));
    expect(sent).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await user.click(await screen.findByRole('button', { name: 'Опубликовать ещё раз' }));
    await waitFor(() => expect(sent).toHaveLength(1));
  });

  it.each(['cancelled', 'failed'] as const)('does not ask when the only earlier publication is %s', async (status) => {
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open({ existing: [publication({ status })] });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent).toHaveLength(1));
  });
});

function seedIntent(overrides: Partial<Record<string, unknown>> = {}) {
  const intent = {
    postId: ids.post,
    revision: 3,
    destinationId: ids.destination,
    mode: 'now',
    scheduledAt: '2026-10-05T09:00:00.000Z',
    timezone: 'Europe/Moscow',
    key: 'seeded-key-0000-0000-0000-000000000000',
    createdAt: Date.now(),
    ...overrides
  };
  sessionStorage.setItem(`publish-intent:${ids.post}:3:${ids.destination}`, JSON.stringify(intent));
  return intent;
}

describe('publish intent follow-ups', () => {
  it('keeps the intent in memory when sessionStorage is blocked, so the retry still reuses the key', async () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    try {
      const sent = captureCreate((call) => (call === 1 ? HttpResponse.error() : accepted()));
      const { user, dialog } = await open();
      await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
      await within(dialog).findByText('Не удалось подтвердить, создана ли публикация');
      await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
      await waitFor(() => expect(sent).toHaveLength(2));
      expect(sent[1]?.key).toBe(sent[0]?.key);
      expect(sent[1]?.body['scheduledAt']).toBe(sent[0]?.body['scheduledAt']);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('an intent older than 23 h asks for confirmation when the post is already in the channel, and sends nothing before', async () => {
    seedIntent({ createdAt: Date.now() - 25 * 3_600_000 });
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open({ existing: [publication({ status: 'sent', externalMessageId: '7' })] });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    const confirm = await screen.findByRole('alertdialog', { name: /уже опубликован в этом канале/ });
    expect(sent).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Опубликовать ещё раз' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.key).toBe('seeded-key-0000-0000-0000-000000000000');
  });

  it('an old intent is not resent silently when the lookup fails', async () => {
    seedIntent({ createdAt: Date.now() - 25 * 3_600_000 });
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open();
    server.use(http.get('*/api/v1/publications', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })));
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    expect(await within(dialog).findByText('Не удалось проверить список публикаций')).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it('an old intent with no earlier publication is resent with its key', async () => {
    seedIntent({ createdAt: Date.now() - 25 * 3_600_000 });
    const sent = captureCreate(() => accepted());
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить сейчас' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.key).toBe('seeded-key-0000-0000-0000-000000000000');
  });

  it('re-applies the pending mode when the channel is switched away and back', async () => {
    const other = destination({ id: '22222222-2222-4222-8222-333333333333', title: 'Новости' });
    server.use(
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [destination(), other], nextCursor: null }))
    );
    seedIntent({ mode: 'later', scheduledAt: inFuture() });
    const { user, dialog } = await open();
    const later = () => (within(dialog).getByRole('radio', { name: 'Запланировать' }) as HTMLInputElement).checked;
    await waitFor(() => expect(later()).toBe(true));

    await user.click(within(dialog).getByRole('button', { name: /Канал/ }));
    await user.click(await screen.findByRole('option', { name: /Новости/ }));
    await user.click(within(dialog).getByText('Сейчас', { exact: true }));
    await waitFor(() => expect(later()).toBe(false));

    await user.click(within(dialog).getByRole('button', { name: /Новости/ }));
    await user.click(await screen.findByRole('option', { name: /Канал/ }));
    await waitFor(() => expect(later()).toBe(true));
  });
});

const inFuture = () => new Date(Date.now() + 2 * 86_400_000).toISOString();

describe('PublicationSettings with a draft', () => {
  it('approves the draft on «Опубликовать», then creates the publication once with the approved revision', async () => {
    const order: string[] = [];
    const sent = captureCreate(() => {
      order.push('create');
      return accepted();
    });
    server.use(http.get('*/api/v1/publications', () => HttpResponse.json(publicationPage([]))));
    const ensureApproved = vi.fn(async () => {
      order.push('approve');
      return { ok: true as const, post: approved({ revision: 4 }) };
    });
    await renderInApp(
      <PublicationSettings
        post={post({ status: 'draft', revision: 3 })}
        onBack={() => undefined}
        ensureApproved={ensureApproved}
      >
        <div />
      </PublicationSettings>
    );
    const user = userEvent.setup();
    expect(screen.queryByText('Сначала подготовьте пост')).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(order).toEqual(['approve', 'create']);
    expect(ensureApproved).toHaveBeenCalledTimes(1);
    expect(sent[0]?.body.revision).toBe(4);
  });
});
