import { describe, expect, it } from 'vitest';
import { fromMsk } from '../../../shared/msk-time';
import { eventCandidates, patchChains, valveMarks } from './triggers';

// What the channel's events make due: the patch chain, «Валв-тайм» marks, bets, announcements, finds and cards.

const at = (day: string, hour = 12) => fromMsk(day, hour * 60);
const keys = (events: { dedupeKey: string; fromDay: string; toDay: string }[]) =>
  events.map((event) => `${event.dedupeKey} ${event.fromDay}..${event.toDay}`);

describe('patch chains', () => {
  it('joins a hotfix within five days and starts a new chain later', () => {
    expect(
      patchChains([
        { version: '7.41', at: at('2026-11-02') },
        { version: '7.41a', at: at('2026-11-05') },
        { version: '7.41b', at: at('2026-11-20') }
      ])
    ).toEqual([{ base: '7.41', firstAt: at('2026-11-02'), versions: ['7.41', '7.41a'] }]);
  });
});

describe('event candidates', () => {
  const base = { announcements: [], freshFinds: false, openBet: null };

  it('plans the patch chain from the day the patch lands', () => {
    const events = eventCandidates({
      ...base,
      now: at('2026-11-02', 9),
      patches: [{ version: '7.41', at: at('2026-11-02', 8) }]
    });
    expect(keys(events)).toEqual([
      'chain:7.41:patch_broken 2026-11-02..2026-11-03',
      'chain:7.41:who_is_imba 2026-11-03..2026-11-04',
      'chain:7.41:nerf_or_buff 2026-11-05..2026-11-06',
      'chain:7.41:valve_seriously 2026-11-06..2026-11-08'
    ]);
  });

  it('turns an open bet into its result two days after the next patch', () => {
    const events = eventCandidates({
      ...base,
      now: at('2026-11-02', 9),
      patches: [{ version: '7.41', at: at('2026-11-02', 8) }],
      openBet: { chain: '7.40' }
    });
    expect(keys(events)).toContain('bet-result:7.40 2026-11-04..2026-11-05');
  });

  it('marks 30 days without a patch, moved at most two days earlier, and bets after 21', () => {
    const events = eventCandidates({
      ...base,
      now: at('2026-12-01', 9),
      patches: [{ version: '7.41', at: at('2026-11-02') }]
    });
    expect(keys(events)).toContain('valve_time:7.41:30 2026-11-30..2026-12-02');
    expect(keys(events).some((key) => key.startsWith('bet:7.41'))).toBe(true);
    expect(valveMarks(150)).toEqual([150]);
  });

  it('rates an announcement one to five days after it, once', () => {
    const events = eventCandidates({
      ...base,
      now: at('2026-11-02'),
      patches: [],
      announcements: [{ gid: '555', at: at('2026-11-01') }]
    });
    expect(keys(events)).toEqual(['steam:555 2026-11-02..2026-11-06']);
  });

  it('puts a dated card on its own day at its hour, and a missed day never', () => {
    const events = eventCandidates({
      ...base,
      now: at('2026-12-31', 6),
      patches: [],
      cards: [
        { id: 'new_year', day: '2027-01-01', minute: 660, occasion: 'С Новым годом!' },
        { id: 'gone', day: '2026-12-30', minute: 660, occasion: 'Вчера' }
      ]
    });
    expect(events.map((event) => [event.dedupeKey, event.minute])).toEqual([['card:new_year:2027', 660]]);
  });
});
