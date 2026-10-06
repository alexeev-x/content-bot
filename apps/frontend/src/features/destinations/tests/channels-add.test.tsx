import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, destination, errorBody, ids } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { checkDto, checkOutcomes } from './check-fixtures';
import { renderChannels } from './render-channels';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

async function openDialog(user: ReturnType<typeof renderChannels>['user']) {
  await screen.findByRole('list', { name: 'Список каналов' });
  await user.click(screen.getByRole('button', { name: 'Добавить канал' }));
  return screen.findByRole('dialog', { name: 'Добавить канал' });
}

async function checkChannel(
  user: ReturnType<typeof renderChannels>['user'],
  dialog: HTMLElement,
  value = 'my_channel'
) {
  await user.type(within(dialog).getByRole('textbox', { name: /@username или ID канала/ }), value);
  await user.click(within(dialog).getByRole('button', { name: 'Проверить' }));
}

const saveButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Добавить канал' });

describe('add channel', () => {
  it('checks, prefills the Telegram title, then saves the canonical numeric chat id', async () => {
    let created: { body: unknown; key: string | null } | undefined;
    server.use(
      checkOutcomes.ok(),
      http.post('*/api/v1/destinations', async ({ request }) => {
        created = { body: await request.json(), key: request.headers.get('Idempotency-Key') };
        return HttpResponse.json(destination({ id: ids.post, title: 'Мой канал', chatId: '-1009876543210' }), {
          status: 201
        });
      })
    );
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);

    expect(await within(dialog).findByText('Бот может публиковать')).toBeTruthy();
    expect((within(dialog).getByRole('textbox', { name: /Название в админке/ }) as HTMLInputElement).value).toBe(
      'Мой канал'
    );
    await user.click(saveButton(dialog));

    expect(await screen.findByText('Канал «Мой канал» добавлен')).toBeTruthy();
    expect(created?.body).toEqual({ title: 'Мой канал', chatId: '-1009876543210', kind: 'channel' });
    expect(created?.key).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Добавить канал' })).toBeNull());
  });

  it('truncates a long Telegram title to 100 characters and keeps it editable', async () => {
    server.use(http.post('*/api/v1/destinations/check', () => HttpResponse.json(checkDto({ title: 'Я'.repeat(140) }))));
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);
    const title = (await within(dialog).findByRole('textbox', { name: /Название в админке/ })) as HTMLInputElement;
    expect(title.value).toHaveLength(100);
    await user.clear(title);
    await user.type(title, 'Своё имя');
    expect(title.value).toBe('Своё имя');
  });

  it('keeps Save disabled until a successful check, and again after the input changes', async () => {
    server.use(checkOutcomes.ok());
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(true);

    await checkChannel(user, dialog);
    await within(dialog).findByText('Бот может публиковать');
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(false);

    await user.type(within(dialog).getByRole('textbox', { name: /@username или ID канала/ }), 'x');
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(true);
    expect(within(dialog).queryByText('Бот может публиковать')).toBeNull();
  });

  it('refuses an invalid address without calling the server', async () => {
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog, 'ab');
    expect(await within(dialog).findByText(/Введите @username/)).toBeTruthy();
  });

  it.each([
    ['notMember', 'Бота нет в канале', /Добавьте бота в администраторы/],
    ['notAdmin', 'Бот не администратор канала', /назначьте его администратором/i],
    ['cannotPost', 'У бота нет права публиковать', /Включите право «Публикация сообщений»/]
  ] as const)('explains the exact fix for %s and re-checks after it', async (outcome, title, step) => {
    server.use(checkOutcomes[outcome]());
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);

    expect(await within(dialog).findByText(title)).toBeTruthy();
    expect(within(dialog).getByText(step)).toBeTruthy();
    expect(within(dialog).getByText('Бот не может публиковать')).toBeTruthy();
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(true);

    server.use(checkOutcomes.ok());
    await user.click(within(dialog).getByRole('button', { name: 'Проверить снова' }));
    expect(await within(dialog).findByText('Бот может публиковать')).toBeTruthy();
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(false);
  });

  it('links to the existing channel instead of allowing a duplicate', async () => {
    server.use(checkOutcomes.alreadyAdded(ids.destination));
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);

    expect(await within(dialog).findByText('Этот чат уже добавлен')).toBeTruthy();
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Открыть канал' }));
    expect(await screen.findByRole('dialog', { name: 'Канал' })).toBeTruthy();
  });

  it.each([
    ['chatNotFound', 'Telegram не нашёл такой чат'],
    ['notAChannel', 'Это не канал и не группа'],
    ['unavailable', 'Проверка сейчас недоступна']
  ] as const)('shows %s and keeps Save disabled', async (outcome, message) => {
    server.use(checkOutcomes[outcome]());
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);
    expect(await within(dialog).findByText(message)).toBeTruthy();
    expect(within(dialog).getByText('req-test-1')).toBeTruthy();
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(true);
  });

  it('blocks checking during the Retry-After countdown after a 429, then allows it again', async () => {
    server.use(checkOutcomes.rateLimited(2));
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);

    const wait = await within(dialog).findByRole('button', { name: /Повторить можно через \d с/ });
    expect(wait.getAttribute('aria-disabled') === 'true' || wait.hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Проверить' }).hasAttribute('disabled')).toBe(true);

    server.use(checkOutcomes.ok());
    const again = await within(dialog).findByRole('button', { name: 'Проверить снова' }, { timeout: 4000 });
    await user.click(again);
    expect(await within(dialog).findByText('Бот может публиковать')).toBeTruthy();
  });

  it('keeps what was typed when the save fails with 409 CHAT_ID_TAKEN, and recovers with a re-check', async () => {
    server.use(
      checkOutcomes.ok(),
      http.post('*/api/v1/destinations', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'CHAT_ID_TAKEN' }), { status: 409 })
      )
    );
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);
    const title = (await within(dialog).findByRole('textbox', { name: /Название в админке/ })) as HTMLInputElement;
    await user.clear(title);
    await user.type(title, 'Моё имя');
    await user.click(saveButton(dialog));

    expect(await within(dialog).findByText(/Этот чат уже добавлен\. Проверьте его ещё раз/)).toBeTruthy();
    expect(title.value).toBe('Моё имя');
    expect((within(dialog).getByRole('textbox', { name: /@username или ID канала/ }) as HTMLInputElement).value).toBe(
      'my_channel'
    );
    expect(screen.getByRole('dialog', { name: 'Добавить канал' })).toBeTruthy();
  });

  it.each([
    ['IN_FLIGHT', /ещё выполняется/],
    ['IDEMPOTENCY_KEY_REUSED', /безопасно повторить запрос/]
  ] as const)('explains 409 %s without losing the form', async (reason, message) => {
    server.use(
      checkOutcomes.ok(),
      http.post('*/api/v1/destinations', () => HttpResponse.json(errorBody('CONFLICT', { reason }), { status: 409 }))
    );
    const { user } = renderChannels();
    const dialog = await openDialog(user);
    await checkChannel(user, dialog);
    await within(dialog).findByText('Бот может публиковать');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText(message)).toBeTruthy();
    expect(saveButton(dialog).hasAttribute('disabled')).toBe(false);
  });

  it('shows the empty state with a call to action when there are no channels', async () => {
    server.use(http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [], nextCursor: null })));
    const { user } = renderChannels();
    expect(await screen.findByText('Каналов пока нет')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Добавить канал' });
    await user.click(buttons[buttons.length - 1]!);
    expect(await screen.findByRole('dialog', { name: 'Добавить канал' })).toBeTruthy();
  });
});
