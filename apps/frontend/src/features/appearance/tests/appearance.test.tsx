import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { errorBody } from '../../../test/fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { server, setupMswServer } from '../../../test/msw';
import { appearance, customPreset, getAppearance, putAppearance, putConflict } from './fixtures';
import { renderEditor } from './harness';

setupMswServer();
afterEach(cleanup);

const lightGroup = async () => within((await screen.findAllByRole('radiogroup', { name: 'Акцентный цвет' }))[0]!);
const groups = () => screen.getAllByRole('radiogroup', { name: 'Акцентный цвет' });

async function pickLight(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await screen.findAllByRole('radiogroup', { name: 'Акцентный цвет' });
  await user.click(within(groups()[0]!).getByRole('radio', { name }));
}

describe('appearance editor', () => {
  it('previews an edit instantly and saves it with the current revision, confirming only after the server answers', async () => {
    let body: unknown;
    server.use(
      getAppearance(appearance({ revision: 3 })),
      putAppearance((b) => (body = b))
    );
    const user = userEvent.setup();
    const { preview } = renderEditor();
    await lightGroup();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
    await pickLight(user, /Индиго/);
    expect(preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ lightAccent: { kind: 'preset', id: 'indigo' } })
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Оформление сохранено')).toBeTruthy();
    expect(body).toMatchObject({ revision: 3, lightAccent: { kind: 'preset', id: 'indigo' }, customPresets: [] });
    await waitFor(() => expect(screen.queryByText(/Есть несохранённые изменения/)).toBeNull());
  });

  it('offers colours as swatch radios, names the selected one and keeps «Свой цвет» at the md size', async () => {
    server.use(getAppearance(appearance()));
    const user = userEvent.setup();
    renderEditor();
    await lightGroup();
    expect(within(groups()[0]!).getAllByRole('radio')).toHaveLength(5);
    expect(within(groups()[0]!).getByRole('radio', { name: 'Кобальт' })).toHaveProperty('checked', true);
    expect(screen.getByRole('button', { name: 'Свой цвет' }).getAttribute('data-size')).toBe('md');
    await pickLight(user, /Медь/);
    expect(within(groups()[0]!).getByRole('radio', { name: 'Медь' })).toHaveProperty('checked', true);
    // Nothing is stored by picking: Save and Cancel stay (owner decision).
    expect(screen.getByRole('button', { name: 'Сохранить' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Отменить изменения' })).toBeTruthy();
  });

  it('keeps local edits on 409 and lets the operator reload the other version explicitly', async () => {
    server.use(getAppearance(appearance({ revision: 1 })), putConflict());
    const user = userEvent.setup();
    renderEditor();
    await pickLight(user, /Медь/);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Изменено на другом устройстве')).toBeTruthy();
    expect(within(groups()[0]!).getByRole('radio', { name: /Медь/ })).toHaveProperty('checked', true);
    server.use(getAppearance(appearance({ revision: 2, lightAccent: { kind: 'preset', id: 'orchid' } })));
    await user.click(screen.getByRole('button', { name: 'Загрузить актуальную версию' }));
    await waitFor(() =>
      expect(within(groups()[0]!).getByRole('radio', { name: /Орхидея/ })).toHaveProperty('checked', true)
    );
    expect(screen.queryByText('Изменено на другом устройстве')).toBeNull();
  });

  it('can keep local edits over the newest revision after a 409', async () => {
    let body: unknown;
    server.use(getAppearance(appearance({ revision: 1 })), putConflict());
    const user = userEvent.setup();
    renderEditor();
    await pickLight(user, /Медь/);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Изменено на другом устройстве');
    server.use(
      getAppearance(appearance({ revision: 5 })),
      putAppearance((b) => (body = b))
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить мои правки поверх' }));
    await waitFor(() => expect(screen.queryByText('Изменено на другом устройстве')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Оформление сохранено');
    expect(body).toMatchObject({ revision: 5, lightAccent: { kind: 'preset', id: 'copper' } });
  });

  it('adds a custom colour, warns about a red-ish one without blocking, and offers it in both themes', async () => {
    let body: unknown;
    server.use(
      getAppearance(),
      putAppearance((b) => (body = b))
    );
    const user = userEvent.setup();
    renderEditor();
    await lightGroup();
    await user.click(screen.getByRole('button', { name: 'Свой цвет' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый цвет' });
    await user.type(within(dialog).getByRole('textbox', { name: /Название/ }), 'Алый');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Базовый цвет' }), { target: { value: '#e03a2e' } });
    expect(await within(dialog).findByText('Цвет похож на статус «Ошибка»')).toBeTruthy();
    // Previews start collapsed so the dialog stays short; each theme opens on demand, both may stay open.
    expect(within(dialog).queryAllByRole('group', { name: /Предпросмотр/ })).toHaveLength(0);
    const lightToggle = within(dialog).getByRole('button', { name: 'Как будет в светлой теме' });
    const darkToggle = within(dialog).getByRole('button', { name: 'Как будет в тёмной теме' });
    expect(lightToggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(lightToggle);
    await user.click(darkToggle);
    expect(lightToggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getAllByRole('group', { name: /Предпросмотр/ })).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Добавить цвет' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(groups()).toHaveLength(2);
    for (const group of groups()) expect(within(group).getByRole('radio', { name: /Алый/ })).toBeTruthy();
    await user.click(within(groups()[1]!).getByRole('radio', { name: /Алый/ }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Оформление сохранено');
    expect(body).toMatchObject({
      darkAccent: { kind: 'custom' },
      customPresets: [{ name: 'Алый', baseColor: '#e03a2e' }]
    });
  });

  it('does not warn for a calm colour and rejects an empty name', async () => {
    server.use(getAppearance());
    const user = userEvent.setup();
    renderEditor();
    await lightGroup();
    await user.click(screen.getByRole('button', { name: 'Свой цвет' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый цвет' });
    expect(within(dialog).queryByText(/Цвет похож/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Добавить цвет' }));
    expect(await within(dialog).findByText('Введите название цвета')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Новый цвет' })).toBeTruthy();
  });

  it('confirms deleting a preset in use and falls back to cobalt there', async () => {
    const preset = customPreset();
    server.use(
      getAppearance(appearance({ revision: 2, darkAccent: { kind: 'custom', id: preset.id }, customPresets: [preset] }))
    );
    const user = userEvent.setup();
    renderEditor();
    await lightGroup();
    expect(within(groups()[1]!).getByRole('radio', { name: /Бирюза/ })).toHaveProperty('checked', true);
    await user.click(screen.getByRole('button', { name: 'Удалить цвет «Бирюза»' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText(/тёмной темы: там вернётся кобальт/)).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: 'Удалить цвет' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(groups()[1]!).getByRole('radio', { name: /Кобальт/ })).toHaveProperty('checked', true);
    expect(within(groups()[1]!).queryByRole('radio', { name: /Бирюза/ })).toBeNull();
  });

  it('disables adding at the limit of ten custom colours', async () => {
    const presets = Array.from({ length: 10 }, (_, index) =>
      customPreset({
        id: `44444444-4444-4444-8444-4444444444${String(index).padStart(2, '0')}`,
        name: `Цвет ${index + 1}`
      })
    );
    server.use(getAppearance(appearance({ customPresets: presets })));
    renderEditor();
    await lightGroup();
    expect(screen.getByRole('button', { name: 'Свой цвет' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Достигнут предел: 10/)).toBeTruthy();
  });

  it('reverts the preview to the saved appearance when the page is left unsaved', async () => {
    server.use(getAppearance(appearance({ revision: 1, themeMode: 'dark' })));
    const user = userEvent.setup();
    const { preview, unmount } = renderEditor();
    await pickLight(user, /Индиго/);
    unmount();
    expect(preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ themeMode: 'dark', lightAccent: { kind: 'preset', id: 'cobalt' } })
    );
  });

  it('shows a retryable error with the request id when loading fails', async () => {
    server.use(
      http.get('*/api/v1/settings/appearance', () =>
        HttpResponse.json({ error: { code: 'UNAVAILABLE', message: 'x', requestId: 'req-77' } }, { status: 503 })
      )
    );
    renderEditor();
    expect(await screen.findByText('Не удалось загрузить оформление')).toBeTruthy();
    expect(screen.getByText('req-77')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });

  describe('with the top bar toggle', () => {
    const toggleName = /Включить (светлую|тёмную) тему/;

    it('keeps the theme mode control when the top bar toggle is available', async () => {
      server.use(getAppearance(appearance({ themeMode: 'system' })));
      renderEditor();
      await lightGroup();
      expect(screen.getByRole('region', { name: 'Тема' })).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Системная' })).toBeTruthy();
    });

    it('saves the theme the toggle saved, not a stale copy', async () => {
      let body: Record<string, unknown> | undefined;
      server.use(getAppearance(appearance({ themeMode: 'dark', revision: 1 })));
      const user = userEvent.setup();
      renderEditor(true);
      await pickLight(user, /Индиго/);
      server.use(
        putAppearance((b) => {
          body = b as Record<string, unknown>;
        })
      );
      await user.click(await screen.findByRole('button', { name: toggleName }));
      await waitFor(() => expect(body).toBeDefined());
      expect(body).toMatchObject({ themeMode: 'light', revision: 1 });
      body = undefined;
      await user.click(screen.getByRole('button', { name: 'Сохранить' }));
      await waitFor(() => expect(body).toBeDefined());
      expect(body).toMatchObject({
        themeMode: 'light',
        revision: 2,
        lightAccent: { kind: 'preset', id: 'indigo' }
      });
    });

    it('keeps both the unsaved accent and the toggled theme when the save races the toggle (409)', async () => {
      const bodies: Record<string, unknown>[] = [];
      server.use(getAppearance(appearance({ themeMode: 'dark', revision: 1 })));
      const user = userEvent.setup();
      renderEditor(true);
      await pickLight(user, /Медь/);
      // The toggle's save lands first on the server; the editor still holds revision 1 in its request.
      server.use(
        http.put('*/api/v1/settings/appearance', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown> & { revision: number };
          bodies.push(body);
          if (body.revision !== 2)
            return HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 });
          return HttpResponse.json({ ...body, revision: 3, updatedAt: '2026-10-06T09:00:00.000Z' });
        }),
        getAppearance(appearance({ themeMode: 'light', revision: 2 }))
      );
      await user.click(screen.getByRole('button', { name: 'Сохранить' }));
      expect(await screen.findByText('Оформление сохранено')).toBeTruthy();
      expect(bodies.at(-1)).toMatchObject({
        themeMode: 'light',
        revision: 2,
        lightAccent: { kind: 'preset', id: 'copper' }
      });
    });

    it('does not lose the unsaved accent when the toggle saves meanwhile', async () => {
      server.use(getAppearance(appearance({ themeMode: 'dark', revision: 1 })), putAppearance());
      const user = userEvent.setup();
      const { client, preview } = renderEditor(true);
      await pickLight(user, /Медь/);
      await user.click(await screen.findByRole('button', { name: toggleName }));
      await waitFor(() =>
        expect(client.getQueryData<{ themeMode: string }>(['appearance', 'detail'])).toMatchObject({
          themeMode: 'light'
        })
      );
      expect(preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ themeMode: 'light', lightAccent: { kind: 'preset', id: 'copper' } })
      );
      expect(within(groups()[0]!).getByRole('radio', { name: /Медь/ })).toHaveProperty('checked', true);
      expect(screen.getByRole('button', { name: 'Сохранить' }).hasAttribute('disabled')).toBe(false);
    });
  });
});
