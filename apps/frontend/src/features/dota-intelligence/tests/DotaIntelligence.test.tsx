import { http, HttpResponse } from 'msw';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPage } from '../../../test/render-app';
import { setupMswServer, server } from '../../../test/msw';
import { DotaIntelligence } from '../ui/DotaIntelligence';

setupMswServer();
beforeEach(() => {
  server.use(http.get('*/api/v1/dota/watchlists', () => HttpResponse.json({ watches: [], matches: [] })));
});
afterEach(cleanup);

const dto = {
  sources: [
    {
      key: 'steam_news',
      name: 'Dota 2 · Steam Community',
      officialUrl: 'https://steamcommunity.com/app/570/news/',
      lastAttemptAt: '2026-10-11T12:00:00.000Z',
      lastSuccessAt: '2026-10-11T12:00:00.000Z',
      health: 'healthy'
    },
    {
      key: 'patch_notes',
      name: 'Dota 2 · Patch notes',
      officialUrl: 'https://www.dota2.com/patches',
      lastAttemptAt: null,
      lastSuccessAt: null,
      health: 'stale'
    }
  ],
  updates: [
    {
      id: 'steam_news:123',
      sourceKey: 'steam_news',
      type: 'news',
      title: 'Официальное обновление Dota 2',
      sourceUrl: 'https://steamcommunity.com/games/dota2/announcements/detail/123',
      publishedAt: '2026-10-11T11:00:00.000Z',
      detectedAt: '2026-10-11T12:00:00.000Z',
      isBaseline: false
    }
  ]
};

describe('DotaIntelligence', () => {
  it('shows only official updates and the actual source health', async () => {
    server.use(http.get('*/api/v1/dota', () => HttpResponse.json(dto)));
    await renderPage(<DotaIntelligence />);

    expect(await screen.findByText('Официальные источники')).toBeTruthy();
    expect(screen.getByText('Попытка:')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Обновления' }));
    expect(await screen.findByText('Официальное обновление Dota 2')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Открыть разбор: Официальное обновление Dota 2' }).getAttribute('href')
    ).toContain('update=steam_news');
    expect(screen.queryByText('Tournaments')).toBeNull();
    expect(screen.getByRole('link', { name: 'Источник' }).getAttribute('href')).toBe(
      'https://steamcommunity.com/games/dota2/announcements/detail/123'
    );
    expect(screen.getByText('Обнаружено:')).toBeTruthy();
    expect(document.querySelector('time[datetime="2026-10-11T12:00:00.000Z"]')?.getAttribute('title')).toContain(
      'Europe/Moscow'
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Источники' }));
    expect(await screen.findByText(/успешных проверок пока нет/)).toBeTruthy();
    expect(screen.getByText(/ещё не проверялся/)).toBeTruthy();
    expect(screen.getByText('Устарел')).toBeTruthy();
  });

  it('keeps both feed summaries visible when no updates have been observed', async () => {
    server.use(http.get('*/api/v1/dota', () => HttpResponse.json({ ...dto, updates: [] })));
    await renderPage(<DotaIntelligence />);

    expect(await screen.findByText('Официальные источники')).toBeTruthy();
    expect(screen.getByText('Dota 2 · Steam Community')).toBeTruthy();
    expect(screen.getByText('Dota 2 · Patch notes')).toBeTruthy();
    expect(await screen.findByText('Пока не наблюдалось обновлений')).toBeTruthy();
  });

  it('shows navigation only for a draft already linked in the read model', async () => {
    const linkedDto = {
      ...dto,
      updates: [
        {
          ...dto.updates[0],
          linkedDraft: { id: '2c1ae3b6-31e0-4ebd-bfe9-d124d4698fb3', title: 'Already created draft' }
        }
      ]
    };
    server.use(http.get('*/api/v1/dota', () => HttpResponse.json(linkedDto)));
    await renderPage(<DotaIntelligence />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Обновления' }));

    expect(screen.getByRole('link', { name: 'Черновик' }).getAttribute('href')).toBe(
      '/posts/2c1ae3b6-31e0-4ebd-bfe9-d124d4698fb3'
    );
  });

  it('shows unknown alert outcomes inline without exposing any resend action', async () => {
    const match = {
      id: 'cc9a09b9-b80a-4b72-b977-6972029fd56a',
      watchId: 'bb9a09b9-b80a-4b72-b977-6972029fd56a',
      entityType: 'hero',
      entityName: 'Axe',
      update: {
        id: 'patch_notes:7.41',
        sourceKey: 'patch_notes',
        externalId: '7.41',
        title: 'Patch 7.41',
        sourceUrl: 'https://www.dota2.com/patches/7.41',
        publishedAt: '2026-10-11T10:00:00.000Z',
        detectedAt: '2026-10-11T10:15:00.000Z'
      },
      fact: { id: 'hero:axe:armor', entityType: 'hero', entityName: 'Axe', section: 'hero', change: 'Armor increased' },
      alertStatus: 'unknown'
    };
    server.use(
      http.get('*/api/v1/dota', () =>
        HttpResponse.json({
          ...dto,
          updates: [
            {
              id: 'patch_notes:7.41',
              sourceKey: 'patch_notes',
              type: 'patch',
              title: 'Patch 7.41',
              sourceUrl: 'https://www.dota2.com/patches/7.41',
              publishedAt: '2026-10-11T10:00:00.000Z',
              detectedAt: '2026-10-11T10:15:00.000Z',
              isBaseline: false
            }
          ]
        })
      ),
      http.get('*/api/v1/dota/watchlists', () => HttpResponse.json({ watches: [], matches: [match] }))
    );
    await renderPage(<DotaIntelligence />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Обновления' }));
    expect(await screen.findByText('Совпадение: Axe')).toBeTruthy();
    expect(screen.getByText('Требует проверки')).toBeTruthy();
    expect(screen.getByText(/повторная отправка не предлагается/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /повтор|отправить снова/i })).toBeNull();
  });
});
