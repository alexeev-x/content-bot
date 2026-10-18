import type { AiItemScriptDto, AiScriptChainDto, ContentItemDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { ItemScript } from '../ui/ItemScript';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const item: ContentItemDto = {
  id: 'youtube:yt1',
  platform: 'youtube',
  title: 'Оракл',
  url: 'https://example.com/v',
  thumbnailUrl: null,
  publishedAt: '2026-10-10T10:00:00.000Z',
  views: 100,
  likes: 1,
  comments: 0,
  shares: 0,
  observedAt: '2026-10-11T10:00:00.000Z'
};
const long = 'Длинная строка сценария про Оракла и лечение вовремя. '.repeat(6);
const chain: AiScriptChainDto = {
  task: 'сделай рилс учусь играть про оракла',
  model: 'gpt-6.1-sol',
  packRevision: 'a1b2c3d4',
  draft: `Черновик: ${long}`,
  approved: `Одобрено: ${long}`,
  editRatio: 0.34,
  changedParts: ['hook', 'ending'],
  draftedAt: '2026-10-08T10:00:00.000Z',
  otherItems: ['tiktok:tt9'],
  warnings: []
};
const script: AiItemScriptDto = {
  linked: {
    revisionId: '00000000-0000-4000-8000-0000000000b1',
    format: 'igrat',
    excerpt: 'Начало сценария',
    approvedAt: '2026-10-09T10:00:00.000Z'
  },
  candidates: [],
  chain
};

const mount = (data: Record<string, unknown>, onOpen: (id: string) => void = () => undefined) => {
  server.use(http.get('*/api/v1/ai/scripts/:itemId', () => HttpResponse.json(data)));
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ItemScript item={item} timezone="UTC" onOpen={onOpen} />
    </QueryClientProvider>
  );
};

describe('script chain', () => {
  it('shows the draft, the edits, the approved text and the other videos', async () => {
    const onOpen = vi.fn();
    mount(script, onOpen);
    const list = await screen.findByRole('list', { name: 'Путь сценария' });
    expect(within(list).getByText('сделай рилс учусь играть про оракла')).toBeTruthy();
    expect(within(list).getByText(/модель gpt-6\.1-sol · набор a1b2c3d4/)).toBeTruthy();
    expect(within(list).getByText(/^Черновик:/)).toBeTruthy();
    expect(within(list).getByText('изменено 34%')).toBeTruthy();
    expect(within(list).getByText('Правили: хук, концовку')).toBeTruthy();
    expect(within(list).getByText(/^Одобрено:/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();

    const toggles = within(list).getAllByRole('button', { name: 'Показать полностью' });
    expect(toggles).toHaveLength(2);
    const user = userEvent.setup();
    await user.click(toggles[0] as HTMLElement);
    expect(within(list).getByRole('button', { name: 'Свернуть' }).getAttribute('aria-expanded')).toBe('true');

    await user.click(within(list).getByRole('button', { name: 'Открыть видео: TikTok · tt9' }));
    expect(onOpen).toHaveBeenCalledWith('tiktok:tt9');
  });

  it('says «без правок» and drops the empty parts line', async () => {
    mount({ ...script, chain: { ...chain, editRatio: 0, changedParts: [], otherItems: [] } });
    expect(await screen.findByText('без правок')).toBeTruthy();
    expect(screen.queryByText(/Правили:/)).toBeNull();
    expect(screen.queryByText('Это же видео')).toBeNull();
  });

  it('warns when the script was approved after the video, and keeps «Отвязать» in reach', async () => {
    mount({ ...script, chain: { ...chain, warnings: ['approved_after_video'] } });
    const banner = await screen.findByRole('status');
    expect(within(banner).getByText('Сценарий одобрен после выхода видео — возможно, привязан не тот')).toBeTruthy();
    expect(within(banner).getByRole('button', { name: 'Отвязать' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Отвязать' })).toHaveLength(1);
  });

  it('warns about a link made more than 14 days before the video', async () => {
    mount({ ...script, chain: { ...chain, warnings: ['approved_long_before'] } });
    expect(
      await screen.findByText('Сценарий одобрен больше чем за 14 дней до видео — проверьте привязку')
    ).toBeTruthy();
  });

  it('renders the plain script when an older server sends no chain', async () => {
    mount({ linked: script.linked, candidates: [] });
    expect(await screen.findByText('Начало сценария')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Путь сценария' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Отвязать' })).toBeTruthy();
  });
});
