import { describe, expect, it } from 'vitest';
import { parseOpenDotaHeroStatistics, DotaHeroStatisticsError } from './index';

function sourceHero(id: number, values: Record<string, unknown> = {}) {
  return { id, localized_name: `Hero ${id}`, ...values };
}

describe('parseOpenDotaHeroStatistics', () => {
  it('normalizes all rank brackets and keeps unavailable counts null', () => {
    const heroes = parseOpenDotaHeroStatistics([
      sourceHero(1, {
        '1_pick': 10,
        '1_win': 6,
        '8_pick': 0,
        pro_pick: 4,
        pro_win: 2,
        pro_ban: 3,
        ignored_future_field: 'ignored'
      })
    ]);

    expect(heroes).toHaveLength(1);
    expect(heroes[0]?.ranked['1']).toEqual({ picks: 10, wins: 6 });
    expect(heroes[0]?.ranked['2']).toEqual({ picks: null, wins: null });
    expect(heroes[0]?.ranked['8']).toEqual({ picks: 0, wins: null });
    expect(heroes[0]?.professional).toEqual({ picks: 4, wins: 2, bans: 3 });
  });

  it('rejects duplicate heroes and malformed source counts without partial results', () => {
    expect(() => parseOpenDotaHeroStatistics([sourceHero(1), sourceHero(1)])).toThrow(DotaHeroStatisticsError);
    expect(() => parseOpenDotaHeroStatistics([sourceHero(1, { '1_pick': -1 })])).toThrow(DotaHeroStatisticsError);
    expect(() => parseOpenDotaHeroStatistics([sourceHero(1, { '1_pick': 10, '1_win': 11 })])).toThrow(
      DotaHeroStatisticsError
    );
    expect(() => parseOpenDotaHeroStatistics([])).toThrow(DotaHeroStatisticsError);
  });
});
