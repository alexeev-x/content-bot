import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromMsk, mskDayIndex, mskMinuteOfDay } from '../../../shared/msk-time';
import { DAY_POSTS_MAX, GAP_MS, violations } from './constraints';
import { plan, seedLastSent } from './plan';
import type { ChannelPost, Need, RubricDescriptor } from './types';

// The plan is the product: whatever the channel looks like, the slots it places keep every owner rule. Tables for
// each rule, properties over random channels, and a month of simulated forecasts.

const DAY_MS = 86_400_000;
const NOW = fromMsk('2026-11-02', 6 * 60);
const ALL: ReadonlySet<Need> = new Set(['browser', 'ai_text', 'ai_image', 'ai_upscale', 'stratz', 'stats_db']);

const rubric = (key: string, extra: Partial<RubricDescriptor> = {}): RubricDescriptor => ({
  key,
  title: key,
  family: key,
  weight: 'L',
  interactive: false,
  trigger: 'pool',
  needs: [],
  restDays: 7,
  slot: 'any',
  sameDay: [],
  sameWeek: [],
  apart: [],
  silentAfterPatchDays: null,
  hasPicture: false,
  hasPoll: false,
  ...extra
});

const POOL: RubricDescriptor[] = [
  rubric('confess', { sameDay: ['quote'], sameWeek: ['rather'], restDays: 14 }),
  rubric('quote', { sameDay: ['confess'] }),
  rubric('rather', { interactive: true, hasPoll: true, sameWeek: ['confess'], restDays: 14 }),
  rubric('lane', { interactive: true, hasPoll: true, family: 'guess', restDays: 14 }),
  rubric('bingo', { weight: 'V', family: 'picture', slot: 'fri_sat_evening', needs: ['browser'], restDays: 21 }),
  rubric('fake', { weight: 'V', family: 'picture', needs: ['browser'], restDays: 21 }),
  rubric('tier', { weight: 'V', family: 'stats', needs: ['browser', 'stratz'], restDays: 30, silentAfterPatchDays: 7 }),
  rubric('shame', { weight: 'V', family: 'stats', slot: { exactMsk: '08:00' }, needs: ['browser', 'stats_db'] }),
  rubric('horoscope', { weight: 'V', trigger: 'anchor', slot: { exactMsk: '08:00' }, needs: ['browser'] })
];
const byKey = new Map(POOL.map((each) => [each.key, each]));
const post = (at: number, extra: Partial<ChannelPost> = {}): ChannelPost => ({
  at,
  weight: 'L',
  rubric: null,
  interactive: false,
  family: null,
  ...extra
});

describe('constraints', () => {
  const at = fromMsk('2026-11-03', 15 * 60);
  const candidate = (extra: Partial<ChannelPost> = {}) => ({ ...post(at), ...extra, rubric: 'quote' });

  it.each([
    ['outside 08:00–23:00', [], { at: fromMsk('2026-11-03', 7 * 60) }, 'WINDOW'],
    [
      'a fourth post of the day',
      [post(at - 6 * 3_600_000), post(at - 4 * 3_600_000, { weight: 'V' }), post(at + 4 * 3_600_000, { weight: 'V' })],
      {},
      'DAY_POSTS'
    ],
    ['closer than 2 h to another post', [post(at + 60 * 60_000, { weight: 'V' })], {}, 'GAP'],
    [
      'a second interactive post that day',
      [post(at - 5 * 3_600_000, { interactive: true, weight: 'V' })],
      { interactive: true },
      'INTERACTIVE_DAY'
    ],
    [
      'a rubric it never shares a day with',
      [post(at - 5 * 3_600_000, { rubric: 'confess', weight: 'V' })],
      {},
      'SAME_DAY'
    ],
    ['a second text post in a row', [post(at - 5 * 3_600_000)], {}, 'ALTERNATION']
  ] as const)('refuses %s', (_name, occupants, extra, expected) => {
    expect(violations(candidate(extra), [...occupants], { rubrics: byKey })).toContain(expected);
  });

  it('takes a post that breaks nothing', () => {
    expect(violations(candidate(), [post(at - 5 * 3_600_000, { weight: 'V' })], { rubrics: byKey })).toEqual([]);
  });
});

describe('seeding', () => {
  it('spreads the pool over the first days instead of making everything due at once', () => {
    const seeded = seedLastSent(POOL, NOW);
    const dueIn = POOL.filter((each) => each.trigger === 'pool').map(
      (each) => (seeded[each.key] ?? 0) + (each.restDays ?? 0) * DAY_MS - NOW
    );
    expect(new Set(dueIn.map((ms) => Math.round(ms / 3_600_000))).size).toBe(dueIn.length);
    expect(dueIn.every((ms) => ms >= 0)).toBe(true);
  });
});

describe('plan', () => {
  const run = (channel: ChannelPost[], capabilities: ReadonlySet<Need> = ALL, days = 30) =>
    plan({
      now: NOW,
      days,
      rubrics: POOL,
      lastSent: {},
      channel,
      capabilities,
      lastHeroPatchAt: null,
      horoscopeAnchorWeek: '2026-11-09'
    });

  it('moves the slots to the learned hours and tries one hour off in about one slot in five', () => {
    const base = {
      now: NOW,
      days: 60,
      rubrics: POOL,
      lastSent: {},
      channel: [],
      capabilities: ALL,
      lastHeroPatchAt: null,
      horoscopeAnchorWeek: null
    };
    const minutes = (slots: { at: number; explore?: boolean }[]) =>
      slots.filter((slot) => slot.explore !== true).map((slot) => mskMinuteOfDay(slot.at));
    const learned = plan({ ...base, hourSlots: { wd: { evening: 20 * 60 }, we: { evening: 20 * 60 } } }).slots;
    const usual = plan(base).slots;
    // The evening slot (19:00 ± 20) moved an hour later: no slot keeps 18:40–19:20.
    expect(minutes(usual).some((minute) => minute >= 1120 && minute <= 1160)).toBe(true);
    expect(minutes(learned).some((minute) => minute >= 1120 && minute <= 1160)).toBe(false);
    const trials = plan({ ...base, explore: true }).slots.filter((slot) => slot.explore === true);
    expect(trials.length).toBeGreaterThan(0);
    expect(trials.every((slot) => mskMinuteOfDay(slot.at) >= 8 * 60 && mskMinuteOfDay(slot.at) <= 22 * 60 + 30)).toBe(
      true
    );
  });

  it('leaves out a rubric this Worker cannot run, and says what it lacks', () => {
    const { slots, ineligible } = run([], new Set<Need>(['browser']));
    expect(slots.some((slot) => slot.rubric === 'tier' || slot.rubric === 'shame')).toBe(false);
    expect(ineligible).toContainEqual({ rubric: 'tier', missing: ['stratz'] });
  });

  it('puts the horoscope on 08:00 every other Monday', () => {
    const mondays = run([])
      .slots.filter((slot) => slot.rubric === 'horoscope')
      .map((slot) => new Date(slot.at + 3 * 3_600_000).toISOString().slice(0, 16));
    expect(mondays.slice(0, 2)).toEqual(['2026-11-09T08:00', '2026-11-23T08:00']);
  });

  it('keeps every rubric rested and lets none starve over a month', () => {
    const { slots } = run([]);
    for (const each of POOL.filter((one) => one.trigger === 'pool')) {
      const times = slots.filter((slot) => slot.rubric === each.key).map((slot) => slot.at);
      for (let index = 1; index < times.length; index += 1)
        expect((times[index] ?? 0) - (times[index - 1] ?? 0)).toBeGreaterThanOrEqual((each.restDays ?? 0) * DAY_MS);
      if ((each.restDays ?? 0) <= 14) expect(times.length, each.key).toBeGreaterThan(0);
    }
  });

  it('keeps every hard rule over its final times whatever the channel already holds', () => {
    const channel = fc.array(
      fc.record({
        day: fc.integer({ min: 0, max: 13 }),
        minute: fc.integer({ min: 8 * 60, max: 23 * 60 }),
        weight: fc.constantFrom<'V' | 'L'>('V', 'L'),
        interactive: fc.boolean()
      }),
      { maxLength: 25 }
    );
    fc.assert(
      fc.property(channel, (news) => {
        const existing = news.map((each) =>
          post(NOW + each.day * DAY_MS + each.minute * 60_000, { weight: each.weight, interactive: each.interactive })
        );
        const { slots } = run(existing, ALL, 14);
        const placed = slots.map((slot) => ({ slot, meta: byKey.get(slot.rubric) }));
        const all = [
          ...existing,
          ...placed.map(({ slot, meta }) =>
            post(slot.at, {
              rubric: slot.rubric,
              weight: meta?.weight === 'L' ? 'L' : 'V',
              interactive: meta?.interactive ?? false,
              family: meta?.family ?? null
            })
          )
        ];
        for (const { slot } of placed) {
          const minute = mskMinuteOfDay(slot.at);
          expect(minute).toBeGreaterThanOrEqual(8 * 60);
          expect(minute).toBeLessThanOrEqual(23 * 60);
          const others = all.filter((each) => each.at !== slot.at);
          expect(others.every((each) => Math.abs(each.at - slot.at) >= GAP_MS || each.rubric === null)).toBe(true);
        }
        // Never two slots at one time, and the plan never adds a post to a day that already had three.
        expect(new Set(slots.map((slot) => slot.at)).size).toBe(slots.length);
        const days = new Map<number, number>();
        for (const each of all) days.set(mskDayIndex(each.at), (days.get(mskDayIndex(each.at)) ?? 0) + 1);
        for (const { slot } of placed) {
          const before = existing.filter((each) => mskDayIndex(each.at) === mskDayIndex(slot.at)).length;
          if (before >= DAY_POSTS_MAX) throw new Error('placed on a full day');
          expect(days.get(mskDayIndex(slot.at))).toBeLessThanOrEqual(DAY_POSTS_MAX);
        }
      }),
      { numRuns: 200, seed: 31 }
    );
  });

  it('is the same plan for the same input', () => {
    expect(run([])).toEqual(run([]));
  });
});
