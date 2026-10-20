import type { AiFeedbackDto, AiLearningItemDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { ToastProvider } from '../../../shared/ui';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { AiFeedbackList } from '../ui/AiFeedbackList';
import { AiLearningList } from '../ui/AiLearningList';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const revision: AiLearningItemDto = {
  source: 'revision',
  id: '00000000-0000-4000-8000-0000000000a1',
  format: 'telegram',
  excerpt: 'Поправленный текст про патч',
  text: 'Поправленный текст про патч.\n\nВторой абзац, которого нет в таблице.',
  changedParts: ['hook', 'ending'],
  editRatio: 0.34,
  excluded: false,
  createdAt: '2026-10-17T10:00:00.000Z'
};
const own: AiLearningItemDto = {
  source: 'post',
  id: '00000000-0000-4000-8000-0000000000a2',
  format: 'telegram',
  excerpt: 'Мой собственный пост',
  text: 'Мой собственный пост',
  changedParts: [],
  editRatio: null,
  excluded: true,
  createdAt: '2026-10-16T10:00:00.000Z'
};

const page = (items: AiLearningItemDto[]) => ({
  items,
  page: 1,
  totalCount: items.length,
  includedCount: items.filter((item) => !item.excluded).length
});

const mount = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );

describe('AI learning list', () => {
  it('lists both sources with their switches', async () => {
    server.use(http.get('*/api/v1/ai/learning', () => HttpResponse.json(page([revision, own]))));
    mount(<AiLearningList />);
    expect(await screen.findByText(/Правка ИИ-черновика · изменено 34%/)).toBeTruthy();
    expect(screen.getByText('Пост, написанный вами')).toBeTruthy();
    const switches = screen.getAllByRole('switch', { name: 'Учитывать' });
    expect((switches[0] as HTMLInputElement).checked).toBe(true);
    expect((switches[1] as HTMLInputElement).checked).toBe(false);
  });

  it('asks the server for the picked filter and moves the count when a text is switched on', async () => {
    const asked: string[] = [];
    server.use(
      http.get('*/api/v1/ai/learning', ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json(page([own]));
      }),
      http.put('*/api/v1/ai/learning/:source/:id', () => HttpResponse.json({ ...own, excluded: false }))
    );
    mount(<AiLearningList />);
    expect(await screen.findByText('В примерах: 0')).toBeTruthy();
    expect(asked[0]).toBe('');
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'Учитывать' }));
    expect(await screen.findByText('В примерах: 1')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Учитывается/ }));
    await user.click(await screen.findByRole('option', { name: 'Выключенные' }));
    await waitFor(() => expect(asked.at(-1)).toBe('?state=off'));
  });

  it('sends {excluded} and locks the switch while the request runs', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const sent: { url: string; body: unknown }[] = [];
    server.use(
      http.get('*/api/v1/ai/learning', () => HttpResponse.json(page([revision]))),
      http.put('*/api/v1/ai/learning/:source/:id', async ({ request }) => {
        sent.push({ url: new URL(request.url).pathname, body: await request.json() });
        await gate;
        return HttpResponse.json({ ...revision, excluded: true });
      })
    );
    mount(<AiLearningList />);
    const user = userEvent.setup();
    const toggle = (await screen.findByRole('switch', { name: 'Учитывать' })) as HTMLInputElement;
    await user.click(toggle);
    await waitFor(() => expect(toggle.disabled).toBe(true));
    expect(sent).toEqual([{ url: `/api/v1/ai/learning/revision/${revision.id}`, body: { excluded: true } }]);
    release();
    await waitFor(() => expect(toggle.disabled).toBe(false));
    expect(toggle.checked).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the whole text from its row', async () => {
    server.use(http.get('*/api/v1/ai/learning', () => HttpResponse.json(page([revision]))));
    mount(<AiLearningList />);
    await userEvent.setup().click(await screen.findByText('Поправленный текст про патч'));
    const panel = await screen.findByRole('dialog');
    expect(panel.textContent).toContain('Второй абзац, которого нет в таблице.');
    expect(panel.textContent).toContain('Правили: хук, концовку');
  });

  it('restores the switch and shows an inline error when the save fails', async () => {
    server.use(
      http.get('*/api/v1/ai/learning', () => HttpResponse.json(page([revision]))),
      http.put('*/api/v1/ai/learning/:source/:id', () => HttpResponse.json(errorBody('NOT_FOUND'), { status: 404 }))
    );
    mount(<AiLearningList />);
    const toggle = (await screen.findByRole('switch', { name: 'Учитывать' })) as HTMLInputElement;
    await userEvent.setup().click(toggle);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });
});

describe('AI feedback note', () => {
  it('shows the verdict note when present', async () => {
    const base: AiFeedbackDto = {
      id: '00000000-0000-4000-8000-0000000000f1',
      kind: 'weak_hook',
      format: 'telegram',
      task: 'задание',
      text: 'текст',
      note: 'начало как у всех',
      createdAt: '2026-10-16T18:20:00.000Z'
    };
    server.use(
      http.get('*/api/v1/ai/feedback', () =>
        HttpResponse.json({
          items: [base, { ...base, id: '00000000-0000-4000-8000-0000000000f2', note: null }]
        })
      )
    );
    mount(<AiFeedbackList />);
    expect(await screen.findByText('«начало как у всех»')).toBeTruthy();
    expect(screen.getAllByText(/^«/)).toHaveLength(1);
  });
});
