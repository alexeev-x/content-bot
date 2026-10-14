import { http, HttpResponse } from 'msw';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../../test/render-app';
import { setupMswServer, server } from '../../../test/msw';
import { DotaHeroStatistics } from '../ui/DotaHeroStatistics';
import { DotaIntelligence } from '../ui/DotaIntelligence';

setupMswServer();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function hero(
  heroId: number,
  name: string,
  rankOne: { picks: number; wins: number },
  pro = { picks: 110, wins: 55, bans: 20 }
) {
  const blank = { picks: null, wins: null };
  return {
    heroId,
    name,
    ranked: {
      '1': rankOne,
      '2': blank,
      '3': blank,
      '4': blank,
      '5': blank,
      '6': blank,
      '7': blank,
      '8': blank
    },
    professional: pro
  };
}

const statistics = {
  source: { name: 'OpenDota · статистика героев (сообщество)', url: 'https://api.opendota.com/api/heroStats' },
  health: 'healthy',
  lastAttemptAt: '2026-10-13T00:15:00.000Z',
  lastSuccessAt: '2026-10-13T00:15:00.000Z',
  lastErrorCode: null,
  latest: {
    observedAt: '2026-10-13T00:15:00.000Z',
    heroes: [hero(1, 'Axe', { picks: 500, wins: 300 }), hero(2, 'Bane', { picks: 400, wins: 160 })]
  },
  previous: {
    observedAt: '2026-10-12T18:15:00.000Z',
    heroes: [hero(1, 'Axe', { picks: 600, wins: 300 }), hero(2, 'Bane', { picks: 400, wins: 200 })]
  }
};

const baseDota = {
  sources: [
    {
      key: 'steam_news',
      name: 'Dota 2 · Steam Community',
      officialUrl: 'https://steamcommunity.com/app/570/news/',
      lastAttemptAt: null,
      lastSuccessAt: null,
      health: 'unverified'
    },
    {
      key: 'patch_notes',
      name: 'Dota 2 · Patch notes',
      officialUrl: 'https://www.dota2.com/patches',
      lastAttemptAt: null,
      lastSuccessAt: null,
      health: 'unverified'
    }
  ],
  updates: []
};

describe('DotaHeroStatistics', () => {
  it('shows attributed current samples and deltas only between saved observations', async () => {
    server.use(http.get('*/api/v1/dota/hero-statistics', () => HttpResponse.json(statistics)));
    await renderPage(<DotaHeroStatistics timezone="Europe/Chisinau" />);

    expect(await screen.findByRole('link', { name: 'OpenDota · источник' })).toBeTruthy();
    expect(screen.getByText(/источник стороннего сообщества, не Valve/)).toBeTruthy();
    expect(screen.getAllByText('Axe').length).toBeGreaterThan(0);
    expect(screen.getByText('+10,0 п.п.')).toBeTruthy();
    expect(screen.getByText('−10,0 п.п.')).toBeTruthy();
    expect(screen.getByText(/минимум 100 выборов/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Обновить' })).toBeNull();
  });

  it('explains the missing baseline instead of showing zero movers', async () => {
    server.use(
      http.get('*/api/v1/dota/hero-statistics', () =>
        HttpResponse.json({
          ...statistics,
          previous: null,
          latest: { ...statistics.latest, heroes: [hero(1, 'Axe', { picks: 5, wins: 2 })] }
        })
      )
    );
    await renderPage(<DotaHeroStatistics timezone="UTC" />);

    expect((await screen.findAllByText('Для сравнения нужны два успешных наблюдения.')).length).toBe(2);
    expect(screen.queryByText(/^[+−-]0,0 п.п\.$/)).toBeNull();
  });

  it('keeps labels beside each hero metric in narrow-screen rows', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(max-width: 859px)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }) as unknown as MediaQueryList
    );
    server.use(http.get('*/api/v1/dota/hero-statistics', () => HttpResponse.json(statistics)));
    await renderPage(<DotaHeroStatistics timezone="Europe/Chisinau" />);

    const list = await screen.findByRole('list', { name: 'Статистика героев: ранг 1' });
    expect(within(list).getAllByText('Победы')).toHaveLength(2);
    expect(within(list).getAllByText('Выборы')).toHaveLength(2);
    expect(within(list).getAllByText('Доля побед')).toHaveLength(2);
    expect(screen.getByText('Доля побед растёт')).toBeTruthy();
    expect(screen.getByText('Доля побед снижается')).toBeTruthy();
  });

  it('loads the saved statistics only when the owner opens the new Heroes tab', async () => {
    let reads = 0;
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json({ ...baseDota, updates: [] })),
      http.get('*/api/v1/dota/watchlists', () => HttpResponse.json({ watches: [], matches: [] })),
      http.get('*/api/v1/dota/hero-statistics', () => {
        reads += 1;
        return HttpResponse.json({ ...statistics, latest: null, previous: null, health: 'unverified' });
      })
    );
    await renderPage(<DotaIntelligence />);

    expect(reads).toBe(0);
    await userEvent.click(await screen.findByRole('tab', { name: 'Герои' }));
    expect(await screen.findByText('Наблюдений пока нет')).toBeTruthy();
    expect(reads).toBe(1);
  });
});
