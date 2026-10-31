import { describe, expect, it } from 'vitest';
import { type CheckState, judge, SCENARIOS, scenarioFor } from './rehearsal';
import { planCapabilities, rehearsalPace } from './runtime';

// The week-long DEV test answers «всё как задумано?»: a wrong verdict would tell the owner the scheduler works when it
// does not. And none of it may ever run on production.

const NOW = Date.parse('2026-11-04T12:00:00Z');
const state = (extra: Partial<CheckState>): CheckState => ({
  scenario: 'none',
  fired: false,
  kind: 'pool',
  status: 'sent',
  errorCode: null,
  attempt: 1,
  candIdx: 0,
  candidates: 3,
  slotAt: NOW - 3_600_000,
  sends: 1,
  ...extra
});

describe('the rehearsal verdict', () => {
  it.each([
    ['a plain slot that went out', state({}), 'ok'],
    ['a plain slot that came out empty', state({ status: 'empty', errorCode: 'BUILD_LOST' }), 'bad'],
    ['a plain slot with nothing to say', state({ status: 'skipped', errorCode: 'CONTENT_SKIP' }), 'ok'],
    ['a crash the next rubric covered', state({ scenario: 'build_crash', fired: true, candIdx: 1 }), 'ok'],
    [
      'a crash that left the slot empty with candidates left',
      state({ scenario: 'build_crash', fired: true, status: 'empty' }),
      'bad'
    ],
    ['a failed build the fallback replaced', state({ scenario: 'build_fail', fired: true, candIdx: 1 }), 'ok'],
    [
      'a failed build with no fallback left',
      state({ scenario: 'build_fail', fired: true, status: 'empty', candidates: 1 }),
      'ok'
    ],
    ['a failed build that still went out as itself', state({ scenario: 'build_fail', fired: true }), 'bad'],
    [
      'a late build left empty',
      state({ scenario: 'build_late', fired: true, status: 'empty', errorCode: 'BUILD_LOST' }),
      'ok'
    ],
    ['a 429 that went out later', state({ scenario: 'tg_429', fired: true }), 'ok'],
    ['a timeout waiting unknown', state({ scenario: 'tg_timeout', fired: true, status: 'unknown' }), null],
    [
      'a timeout unknown past the stuck limit',
      state({ scenario: 'tg_timeout', fired: true, status: 'unknown', slotAt: NOW - 27 * 3_600_000 }),
      'ok'
    ],
    ['a timeout the owner reconciled, one send', state({ scenario: 'tg_timeout', fired: true, status: 'sent' }), 'ok'],
    [
      'a timeout still unknown after a second send',
      state({ scenario: 'tg_timeout', fired: true, status: 'unknown', sends: 2 }),
      'bad'
    ],
    ['a timeout that was sent again', state({ scenario: 'tg_timeout', fired: true, status: 'sent', sends: 2 }), 'bad'],
    ['a lost channel that failed', state({ scenario: 'tg_forbidden', fired: true, status: 'send_failed' }), 'ok'],
    ['a staged failure the slot never reached', state({ scenario: 'tg_429', status: 'empty' }), 'void'],
    ['a replanned slot', state({ status: 'superseded' }), 'void']
  ])('%s', (_name, check, verdict) => {
    expect(judge(check, NOW)?.verdict ?? null).toBe(verdict);
  });

  it('waits while the slot is on its way, and calls it stuck after a day', () => {
    expect(judge(state({ status: 'ready', slotAt: NOW + 3_600_000 }), NOW)).toBeNull();
    expect(judge(state({ status: 'building', slotAt: NOW - 27 * 3_600_000 }), NOW)?.verdict).toBe('bad');
  });
});

describe('the staged failures', () => {
  it('stages about one slot in four, every failure in turn, and never a follow-up', () => {
    const ids = Array.from({ length: 400 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    let staged = 0;
    const seen = new Set<string>();
    for (const id of ids) {
      const scenario = scenarioFor({ id, kind: 'pool' }, staged);
      if (scenario !== 'none') {
        seen.add(scenario);
        staged += 1;
      }
      expect(scenarioFor({ id, kind: 'follow_up' }, 0)).toBe('none');
    }
    expect(staged).toBeGreaterThan(60);
    expect(staged).toBeLessThan(140);
    expect(seen).toEqual(new Set(SCENARIOS));
  });
});

describe('where the week-long test runs', () => {
  it('only in the DEV rehearsal with the week pace', () => {
    expect(rehearsalPace({ RUBRIC_SCHEDULER: 'on', RUBRIC_REHEARSAL_PACE: 'week' }, 'live')).toBeNull();
    expect(rehearsalPace({ RUBRIC_SCHEDULER: 'rehearsal' }, 'rehearsal')).toBeNull();
    expect(rehearsalPace({ RUBRIC_SCHEDULER: 'rehearsal', RUBRIC_REHEARSAL_PACE: 'week' }, 'rehearsal')).not.toBeNull();
  });

  it('plans the AI rubrics as stubs there, and only there', () => {
    expect(planCapabilities({ RUBRIC_SCHEDULER: 'on' }, 'live').has('ai_text')).toBe(false);
    expect(planCapabilities({ RUBRIC_SCHEDULER: 'rehearsal' }, 'rehearsal').has('ai_text')).toBe(false);
    expect(
      planCapabilities({ RUBRIC_SCHEDULER: 'rehearsal', RUBRIC_REHEARSAL_PACE: 'week' }, 'rehearsal').has('ai_text')
    ).toBe(true);
  });
});
