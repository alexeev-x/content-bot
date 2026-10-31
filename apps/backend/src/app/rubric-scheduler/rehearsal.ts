import { ENDED_STATUSES, stableHash } from '../../modules/rubric-scheduler';

// The DEV week-long rehearsal (owner, 31.10.2026: «на дев симулируется все варианты… это помечай в бд, чтобы я
// спросил всё норм»): about one slot in four gets a staged failure, every slot of the test gets a check, and the
// verdict says whether the scheduler did what it is meant to. Pure: the journal's D1 lives in rehearsal-journal.ts.

export const SCENARIOS = ['build_crash', 'build_fail', 'build_late', 'tg_429', 'tg_timeout', 'tg_forbidden'] as const;
export type Scenario = 'none' | (typeof SCENARIOS)[number];

/** Only the posts the plan places get a staged failure; a follow-up or a poll's close just gets its check. */
const STAGED_KINDS = new Set(['pool', 'event', 'anchor']);

/** One slot in four, the failures taken in turn so each of them happens within the week. */
export function scenarioFor(slot: { id: string; kind: string }, stagedSoFar: number): Scenario {
  if (!STAGED_KINDS.has(slot.kind) || stableHash(`rehearsal:${slot.id}`) % 4 !== 0) return 'none';
  return SCENARIOS[stagedSoFar % SCENARIOS.length] ?? 'none';
}

export interface CheckState {
  scenario: Scenario;
  fired: boolean;
  kind: string;
  status: string;
  errorCode: string | null;
  attempt: number;
  candIdx: number;
  candidates: number;
  slotAt: number;
  /** Telegram send attempts the slot's publications made (an unknown one counts): more than one is a second send. */
  sends: number;
}

export type Verdict = { verdict: 'ok' | 'bad' | 'void'; note: string };

const HOUR_MS = 3_600_000;
/** A slot still live this long after its time is stuck. */
const STUCK_AFTER_MS = 26 * HOUR_MS;
const QUIET_SKIPS = new Set(['CONTENT_SKIP', 'BANK_EXHAUSTED', 'NO_DATA']);

const ended = (status: string) => (ENDED_STATUSES as readonly string[]).includes(status);
const what = (state: CheckState) => `${state.status}${state.errorCode === null ? '' : ` (${state.errorCode})`}`;

/** The verdict on one slot of the test, or null while it is still on its way. */
export function judge(state: CheckState, now: number): Verdict | null {
  const { scenario, fired, status } = state;
  if (status === 'superseded') return { verdict: 'void', note: 'План перестроен: слот заменён другим, как задумано' };
  if (status === 'cancelled' && state.errorCode === 'SWITCHED_OFF')
    return { verdict: 'void', note: 'Планировщик выключали: слот отменён, как задумано' };
  const done = ended(status);
  if (!done && status !== 'unknown') {
    return now > state.slotAt + STUCK_AFTER_MS
      ? { verdict: 'bad', note: `Слот завис в состоянии ${what(state)} больше суток` }
      : null;
  }
  const notFired = { verdict: 'void' as const, note: `Сбой не сработал: слот не дошёл до него, итог ${what(state)}` };
  switch (scenario) {
    case 'none':
      if (status === 'sent') return { verdict: 'ok', note: 'Вышла' };
      if (status === 'skipped' && QUIET_SKIPS.has(state.errorCode ?? ''))
        return { verdict: 'ok', note: `Пропуск без сбоя: ${what(state)}` };
      if (status === 'yielded') return { verdict: 'ok', note: 'Уступила место по правилам дня' };
      return { verdict: 'bad', note: `Сбоя не было, а пост не вышел: ${what(state)}` };
    case 'build_crash':
      if (!fired) return notFired;
      if (status === 'sent' && state.candIdx >= 1)
        return { verdict: 'ok', note: 'Сборка оборвалась, вышла следующая рубрика' };
      if (status === 'empty' && state.candidates <= state.candIdx + 1)
        return { verdict: 'ok', note: 'Сборка оборвалась, замены не было: слот пустой' };
      return { verdict: 'bad', note: `Сборка оборвалась, а дальше не так: ${what(state)}` };
    case 'build_fail':
      if (!fired) return notFired;
      if (status === 'sent' && state.candIdx >= 1)
        return { verdict: 'ok', note: 'Первая рубрика не собралась, вышла замена' };
      if ((status === 'empty' || status === 'skipped') && state.candidates <= state.candIdx + 1)
        return { verdict: 'ok', note: 'Не собралась, замены не было: слот пустой, следующий в своё время' };
      return { verdict: 'bad', note: `Не собралась, а дальше не так: ${what(state)}` };
    case 'build_late':
      if (!fired) return notFired;
      if (status === 'empty')
        return { verdict: 'ok', note: `Сборка не успела: слот пустой без поста (${state.errorCode})` };
      return { verdict: 'bad', note: `Сборка не успела, а слот не пустой: ${what(state)}` };
    case 'tg_429':
      if (!fired) return done ? notFired : null;
      if (status === 'sent') return { verdict: 'ok', note: 'Telegram ответил «слишком часто», повтор вышел' };
      return { verdict: 'bad', note: `После «слишком часто» не вышла: ${what(state)}` };
    case 'tg_timeout':
      if (!fired) return done ? notFired : null;
      // The check stays open while the slot waits as «unknown»: a second send may still come, and that is the failure.
      if (state.sends > 1)
        return { verdict: 'bad', note: `Telegram не ответил, а пост отправили второй раз: ${what(state)}` };
      if (status === 'unknown' && now <= state.slotAt + STUCK_AFTER_MS) return null;
      // After a timeout the post waits for the owner: still unknown, unresolved, or sent once he reconciled it.
      if (status !== 'unknown' && status !== 'unresolved' && status !== 'sent')
        return { verdict: 'bad', note: `Telegram не ответил, а слот стал ${what(state)}` };
      return {
        verdict: 'ok',
        note: 'Telegram не ответил: пост не отправлялся повторно, ждал разбора в «Публикациях»'
      };
    case 'tg_forbidden':
      if (!fired) return done ? notFired : null;
      if (status === 'send_failed')
        return { verdict: 'ok', note: 'Канал недоступен: пост не вышел, отдых рубрики не потрачен' };
      return { verdict: 'bad', note: `Канал недоступен, а слот стал ${what(state)}` };
  }
}
