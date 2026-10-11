import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderPage } from '../../../test/render-app';
import { setupMswServer, server } from '../../../test/msw';
import { DotaIntelligence } from '../ui/DotaIntelligence';

setupMswServer();

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

    expect(await screen.findByText('Официальное обновление Dota 2')).toBeTruthy();
    expect(screen.queryByText('Tournaments')).toBeNull();
    expect(screen.getByRole('link', { name: 'Источник' }).getAttribute('href')).toBe(
      'https://steamcommunity.com/games/dota2/announcements/detail/123'
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Источники' }));
    expect(await screen.findByText('Успешная проверка была ранее; время неизвестно')).toBeTruthy();
    expect(screen.getByText('Устарел')).toBeTruthy();
  });
});
