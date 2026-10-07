import type { PublicationDto } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, ids, publication } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { PublicationDrawer } from '../index';
import { renderInApp } from './harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const unknown = (overrides: Partial<PublicationDto> = {}) =>
  publication({ status: 'unknown', lastErrorCode: 'SEND_UNCONFIRMED', revision: 4, ...overrides });

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

const CANCEL_TITLE = 'Отменить публикацию без отправки?';

type Sent = Record<string, unknown>;

function serveResolve(respond: (body: Sent, call: number) => Response | Promise<Response>) {
  const bodies: Sent[] = [];
  server.use(
    http.post('*/api/v1/publications/:id/resolve-unknown', async ({ request }) => {
      const body = (await request.json()) as Sent;
      bodies.push(body);
      return respond(body, bodies.length);
    })
  );
  return bodies;
}

async function openDrawer(chatId = '@alexeev_chan') {
  await renderInApp(
    <PublicationDrawer
      publicationId={ids.publication}
      isOpen
      onOpenChange={() => undefined}
      postTitle="Герой дня"
      destinationTitle="Канал"
      chatId={chatId}
    />
  );
  const drawer = await screen.findByRole('dialog', { name: 'Герой дня' });
  return { drawer, user: userEvent.setup() };
}

async function openChoice(name: string, chatId?: string) {
  const { drawer, user } = await openDrawer(chatId);
  await user.click(await within(drawer).findByRole('button', { name }));
  return { drawer, user };
}

describe('unknown publication in the drawer', () => {
  it('explains, links to the channel and offers the three choices without a plain retry', async () => {
    serveDetail(unknown());
    const { drawer } = await openDrawer();
    expect(await within(drawer).findByText('Отправка не подтверждена')).toBeTruthy();
    expect(within(drawer).getByText(/Бот не отправит его повторно сам/)).toBeTruthy();
    const link = within(drawer).getByRole('link', { name: 'Открыть канал в Telegram' });
    expect(link.getAttribute('href')).toBe('https://t.me/alexeev_chan');
    const group = within(drawer).getByRole('group', { name: 'Что произошло' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Пост вышел', 'Не вышел — отправить снова', 'Не вышел — отменить']);
  });

  it('shows no channel link when the chat id has no public form', async () => {
    serveDetail(unknown());
    const { drawer } = await openDrawer('12345');
    await within(drawer).findByText('Отправка не подтверждена');
    expect(within(drawer).queryByRole('link', { name: 'Открыть канал в Telegram' })).toBeNull();
  });
});

describe('outcome «Пост вышел»', () => {
  it('sends the extracted id with the revision and shows the returned confirmed status', async () => {
    serveDetail(unknown());
    const bodies = serveResolve(() =>
      HttpResponse.json(publication({ status: 'sent', externalMessageId: '4821', revision: 5 }))
    );
    const { drawer, user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    await user.type(
      within(dialog).getByRole('textbox', { name: /Ссылка на сообщение или номер/ }),
      'https://t.me/alexeev_chan/4821'
    );
    expect(within(dialog).getByText(/номер сообщения 4821/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));

    await waitFor(() => expect(bodies).toEqual([{ outcome: 'sent', revision: 4, externalMessageId: '4821' }]));
    expect(await screen.findByText('Сообщение № 4821 записано.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Пост вышел в канале' })).toBeNull());
    expect(within(drawer).getAllByText('Опубликовано').length).toBeGreaterThan(0);
  });

  it('accepts a bare number', async () => {
    serveDetail(unknown());
    const bodies = serveResolve(() =>
      HttpResponse.json(publication({ status: 'sent', externalMessageId: '77', revision: 5 }))
    );
    const { user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    await user.type(within(dialog).getByRole('textbox'), ' 77 ');
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));
    await waitFor(() => expect(bodies[0]?.['externalMessageId']).toBe('77'));
  });

  it.each([
    ['', 'Вставьте ссылку на сообщение или его номер.'],
    ['0', 'Не удалось разобрать'],
    ['hello', 'Не удалось разобрать'],
    ['https://example.com/alexeev_chan/12', 'Не удалось разобрать'],
    ['https://t.me/alexeev_chan', 'Не удалось разобрать'],
    ['https://t.me/other_chan/12', 'Ссылка ведёт в другой канал']
  ])('refuses %j without calling the server and keeps the input', async (value, message) => {
    serveDetail(unknown());
    const bodies = serveResolve(() => HttpResponse.json(publication()));
    const { user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    const field = within(dialog).getByRole('textbox');
    if (value) await user.type(field, value);
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));
    expect(await within(dialog).findByText(new RegExp(message))).toBeTruthy();
    expect((field as HTMLInputElement).value).toBe(value);
    expect(bodies).toHaveLength(0);
  });

  it('a double press sends one request', async () => {
    serveDetail(unknown());
    const bodies = serveResolve(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return HttpResponse.json(publication({ status: 'sent', externalMessageId: '5', revision: 5 }));
    });
    const { user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    await user.type(within(dialog).getByRole('textbox'), '5');
    const submit = within(dialog).getByRole('button', { name: 'Подтвердить публикацию' });
    await user.dblClick(submit);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Пост вышел в канале' })).toBeNull());
    expect(bodies).toHaveLength(1);
  });

  it('a returned sent without a message id is not shown as published', async () => {
    serveDetail(unknown());
    serveResolve(() => HttpResponse.json(publication({ status: 'sent', revision: 5 })));
    const { drawer, user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    await user.type(within(dialog).getByRole('textbox'), '9');
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Пост вышел в канале' })).toBeNull());
    expect(screen.queryByText('Опубликовано')).toBeNull();
    expect(within(drawer).getAllByText('Требует проверки').length).toBeGreaterThan(0);
  });

  it('STALE_REVISION explains, reloads, keeps the typed link and the retry carries the new revision', async () => {
    const detail = serveDetail(unknown(), unknown({ revision: 6 }));
    const bodies = serveResolve((_, call) =>
      call === 1
        ? HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
        : HttpResponse.json(publication({ status: 'sent', externalMessageId: '4821', revision: 7 }))
    );
    const { user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    const field = within(dialog).getByRole('textbox') as HTMLInputElement;
    await user.type(field, '4821');
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));
    expect(await within(dialog).findByText('Публикация изменилась')).toBeTruthy();
    await waitFor(() => expect(detail()).toBeGreaterThanOrEqual(2));
    expect(field.value).toBe('4821');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));
    await waitFor(() => expect(bodies.map((body) => body['revision'])).toEqual([4, 6]));
  });

  it('NOT_UNKNOWN shows the current status, disables the action and keeps the input', async () => {
    serveDetail(unknown(), publication({ status: 'sent', externalMessageId: '4821', revision: 5 }));
    serveResolve(() => HttpResponse.json(errorBody('CONFLICT', { reason: 'NOT_UNKNOWN' }), { status: 409 }));
    const { user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    const field = within(dialog).getByRole('textbox') as HTMLInputElement;
    await user.type(field, '12');
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));
    expect(await within(dialog).findByText('Статус уже изменился')).toBeTruthy();
    expect(await within(dialog).findByText(/Сейчас: Опубликовано/)).toBeTruthy();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }).hasAttribute('disabled')).toBe(true)
    );
    expect(field.value).toBe('12');
  });

  it.each([
    [404, 'NOT_FOUND', 'Публикация не найдена'],
    [403, 'FORBIDDEN', 'Нет доступа'],
    [503, 'UNAVAILABLE', 'Сервис недоступен']
  ] as const)('%s %s shows its message and keeps the input', async (status, code, title) => {
    serveDetail(unknown());
    serveResolve(() => HttpResponse.json(errorBody(code), { status }));
    const { user } = await openChoice('Пост вышел');
    const dialog = await screen.findByRole('dialog', { name: 'Пост вышел в канале' });
    const field = within(dialog).getByRole('textbox') as HTMLInputElement;
    await user.type(field, '12');
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить публикацию' }));
    expect(await within(dialog).findByText(title)).toBeTruthy();
    expect(field.value).toBe('12');
  });
});

describe('outcome «Не вышел — отправить снова»', () => {
  it('defaults to now and sends the time with the browser zone, showing the returned status', async () => {
    serveDetail(unknown());
    const bodies = serveResolve((body) =>
      HttpResponse.json(publication({ status: 'queued', scheduledAt: String(body['scheduledAt']), revision: 5 }))
    );
    const before = Date.now();
    const { drawer, user } = await openChoice('Не вышел — отправить снова');
    const dialog = await screen.findByRole('dialog', { name: 'Отправить снова' });
    expect(within(dialog).getByText(/дубль/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Отправить снова' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    const body = bodies[0] ?? {};
    expect(Object.keys(body).sort()).toEqual(['outcome', 'revision', 'scheduledAt', 'timezone']);
    expect(body['outcome']).toBe('resend');
    expect(body['revision']).toBe(4);
    expect(body['timezone']).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const at = new Date(String(body['scheduledAt'])).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    expect(await screen.findByText(/Сообщение отправится в ближайшую минуту/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Отправить снова' })).toBeNull());
    expect(within(drawer).getAllByText('В очереди').length).toBeGreaterThan(0);
    expect(screen.queryByText('Опубликовано')).toBeNull();
  });

  it('sends a selected date, not the default', async () => {
    serveDetail(unknown());
    const bodies = serveResolve((body) =>
      HttpResponse.json(publication({ status: 'scheduled', scheduledAt: String(body['scheduledAt']), revision: 5 }))
    );
    const { drawer, user } = await openChoice('Не вышел — отправить снова');
    const dialog = await screen.findByRole('dialog', { name: 'Отправить снова' });
    await user.click(within(dialog).getByRole('button', { name: /Открыть календарь/ }));
    const picker = (await screen.findAllByRole('dialog')).at(-1);
    if (!picker) throw new Error('date-time picker missing');
    const nextMonth = within(picker).getAllByRole('button', { name: /Далее/ }).at(0);
    if (!nextMonth) throw new Error('next month button missing');
    await user.click(nextMonth);
    const day = within(picker).getAllByRole('button', { name: /20 / }).at(0);
    if (!day) throw new Error('day 20 missing');
    await user.click(day);
    await user.click(within(picker).getByRole('button', { name: 'Готово' }));
    await user.click(within(dialog).getByRole('button', { name: 'Отправить снова' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    const expected = new Date();
    expected.setMonth(expected.getMonth() + 1, 20);
    expect(new Date(String(bodies[0]?.['scheduledAt'])).getMonth()).toBe(expected.getMonth());
    expect(new Date(String(bodies[0]?.['scheduledAt'])).getDate()).toBe(20);
    expect((await screen.findAllByText(/Запланировано на/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Отправить снова' })).toBeNull());
    expect(within(drawer).getAllByText('Запланировано').length).toBeGreaterThan(0);
  });

  it('SCHEDULE_OUT_OF_RANGE is an inline field error and the field keeps its value', async () => {
    serveDetail(unknown());
    serveResolve(() =>
      HttpResponse.json(errorBody('VALIDATION_ERROR', { reason: 'SCHEDULE_OUT_OF_RANGE' }), { status: 400 })
    );
    const { user } = await openChoice('Не вышел — отправить снова');
    const dialog = await screen.findByRole('dialog', { name: 'Отправить снова' });
    const field = within(dialog).getByRole('button', { name: /Открыть календарь/ });
    await user.click(field);
    const picker = (await screen.findAllByRole('dialog')).at(-1);
    if (!picker) throw new Error('date-time picker missing');
    const nextMonth = within(picker).getAllByRole('button', { name: /Далее/ }).at(0);
    if (!nextMonth) throw new Error('next month button missing');
    await user.click(nextMonth);
    const day = within(picker).getAllByRole('button', { name: /20 / }).at(0);
    if (!day) throw new Error('day 20 missing');
    await user.click(day);
    await user.click(within(picker).getByRole('button', { name: 'Готово' }));
    const selected = field.textContent;
    await user.click(within(dialog).getByRole('button', { name: 'Отправить снова' }));
    expect(await within(dialog).findByText(/Выберите время в будущем, но не дальше чем на 366 дней/)).toBeTruthy();
    expect(within(dialog).queryByText('Время вне допустимого диапазона')).toBeNull();
    expect(field.textContent).toBe(selected);
  });

  it('NOT_UNKNOWN and STALE_REVISION keep the dialog and its content', async () => {
    serveDetail(unknown(), unknown({ revision: 6 }));
    serveResolve(() => HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 }));
    const { user } = await openChoice('Не вышел — отправить снова');
    const dialog = await screen.findByRole('dialog', { name: 'Отправить снова' });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить снова' }));
    expect(await within(dialog).findByText('Публикация изменилась')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Отправить снова' })).toBeTruthy();
  });
});

describe('outcome «Не вышел — отменить»', () => {
  it('confirms destructively with the safe answer focused and shows the returned status', async () => {
    serveDetail(unknown());
    const bodies = serveResolve(() => HttpResponse.json(publication({ status: 'cancelled', revision: 5 })));
    const { drawer, user } = await openChoice('Не вышел — отменить');
    const dialog = await screen.findByRole('alertdialog', { name: CANCEL_TITLE });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Не отменять' }));
    expect(within(dialog).getByText(/получит статус «Отменено»/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Отменить публикацию' }));
    await waitFor(() => expect(bodies).toEqual([{ outcome: 'cancel', revision: 4 }]));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: CANCEL_TITLE })).toBeNull());
    expect(within(drawer).getAllByText('Отменено').length).toBeGreaterThan(0);
  });

  it('keeping the publication sends nothing', async () => {
    serveDetail(unknown());
    const bodies = serveResolve(() => HttpResponse.json(publication()));
    const { user } = await openChoice('Не вышел — отменить');
    await user.click(await screen.findByRole('button', { name: 'Не отменять' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: CANCEL_TITLE })).toBeNull());
    expect(bodies).toHaveLength(0);
  });

  it('a double press sends one request', async () => {
    serveDetail(unknown());
    const bodies = serveResolve(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return HttpResponse.json(publication({ status: 'cancelled', revision: 5 }));
    });
    const { user } = await openChoice('Не вышел — отменить');
    const dialog = await screen.findByRole('alertdialog', { name: CANCEL_TITLE });
    await user.dblClick(within(dialog).getByRole('button', { name: 'Отменить публикацию' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: CANCEL_TITLE })).toBeNull());
    expect(bodies).toHaveLength(1);
  });

  it('NOT_UNKNOWN explains the new status and disables the confirm', async () => {
    serveDetail(unknown(), publication({ status: 'scheduled', revision: 5 }));
    serveResolve(() => HttpResponse.json(errorBody('CONFLICT', { reason: 'NOT_UNKNOWN' }), { status: 409 }));
    const { user } = await openChoice('Не вышел — отменить');
    const dialog = await screen.findByRole('alertdialog', { name: CANCEL_TITLE });
    await user.click(within(dialog).getByRole('button', { name: 'Отменить публикацию' }));
    expect(await within(dialog).findByText('Статус уже изменился')).toBeTruthy();
    expect(await within(dialog).findByText(/Сейчас: Запланировано/)).toBeTruthy();
  });
});
