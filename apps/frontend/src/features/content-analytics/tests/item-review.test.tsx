import type { AiVideoReviewDto, ContentItemDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { ItemReview } from '../ui/ItemReview';

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
  observedAt: '2026-10-14T10:00:00.000Z'
};
const ready: AiVideoReviewDto = {
  itemId: item.id,
  status: 'ready',
  limitedReason: null,
  facts: { views: 18_400, likesPer1000: 54.3, commentsPer1000: 3.2, sharesPer1000: null },
  observation: {
    format: 'igrat',
    baselineViews: 12_100,
    baselineItems: 14,
    low: 7_800,
    high: 19_500,
    position: 'above'
  },
  hypotheses: ['Возможно, сработал вопрос в начале.', 'Возможно, помогла тема патча.'],
  nextTest: 'Снять выпуск с тем же началом.',
  model: 'gpt-6-luna',
  costUsd: 0.0007,
  createdAt: '2026-10-14T10:00:00.000Z'
};

const mount = (review: AiVideoReviewDto | null) => {
  server.use(http.get('*/api/v1/ai/reviews/:itemId', () => HttpResponse.json({ review })));
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ItemReview item={item} />
    </QueryClientProvider>
  );
};

describe('72 h review', () => {
  it('shows facts, the observation in words, hypotheses as «не выводы», the next test and the cost', async () => {
    mount(ready);
    await screen.findByText('Выше обычного для формата');
    const section = screen.getByRole('region', { name: 'Разбор через 72 часа' });
    expect(within(section).getByText('18 400')).toBeTruthy();
    expect(within(section).getByText('54,3')).toBeTruthy();
    expect(within(section).getByText('—')).toBeTruthy();
    expect(within(section).getByText('Выше обычного для формата')).toBeTruthy();
    expect(within(section).getByText(/по 14 видео формата «Учусь играть»/)).toBeTruthy();
    expect(within(section).getByRole('heading', { name: 'Гипотезы (не выводы)' })).toBeTruthy();
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(section).getByText('Снять выпуск с тем же началом.')).toBeTruthy();
    expect(within(section).getByText('модель gpt-6-luna · стоимость $0.0007')).toBeTruthy();
  });

  it('says the comparison is weak when there is no format, and gives the reason for facts only', async () => {
    mount({
      ...ready,
      status: 'limited',
      limitedReason: 'no_script',
      observation: { ...ready.observation, format: null, position: 'below' },
      hypotheses: [],
      nextTest: null,
      model: null,
      costUsd: null
    });
    expect(await screen.findByText('Ниже обычного')).toBeTruthy();
    expect(screen.getByText(/сравнение со всеми видео платформы — слабое/)).toBeTruthy();
    expect(screen.getByText('Нет привязанного сценария — гипотез нет')).toBeTruthy();
    expect(screen.queryByText('Гипотезы (не выводы)')).toBeNull();
    expect(screen.queryByText('Следующий тест')).toBeNull();
  });

  it.each([
    ['weak_baseline', 'Мало видео этого формата для сравнения'],
    ['no_snapshot', 'Нет замера на 72 часах'],
    ['contaminated', 'Видео отмечено как искажённое'],
    ['reviews_off', 'Разборы ИИ выключены в настройках'],
    ['budget', 'ИИ сейчас недоступен: бюджет, лимит, ключ или модель'],
    ['model_failed', 'Модель не ответила — только цифры']
  ] as const)('explains «%s»', async (limitedReason, text) => {
    mount({ ...ready, status: 'limited', limitedReason, hypotheses: [], nextTest: null });
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('says it is being prepared while pending', async () => {
    mount({ ...ready, status: 'pending', hypotheses: [], nextTest: null });
    expect(await screen.findByText('Разбор готовится')).toBeTruthy();
    expect(screen.queryByText('Просмотры на 72-м часу')).toBeNull();
  });

  it('shows only a muted line while the video is younger than 72 hours', async () => {
    mount(null);
    expect(await screen.findByText('Разбор появится, когда видео исполнится 72 часа')).toBeTruthy();
    expect(screen.queryByText('Выше обычного для формата')).toBeNull();
  });
});
