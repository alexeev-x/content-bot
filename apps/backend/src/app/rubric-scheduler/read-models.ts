import type {
  RubricCalendarDto,
  RubricItemDto,
  RubricKey,
  RubricSchedulerStatusDto,
  RubricSlotDetailDto,
  RubricSlotDto
} from '@alexeev/contracts';
import { LIVE_STATUSES, missingNeeds, type SlotRow } from '../../modules/rubric-scheduler';
import { INNER_RULES_READY, RUBRIC_META } from '../../modules/rubrics';
import { fromMsk } from '../../shared/msk-time';
import type { Container } from '../container';
import { rubricCapabilities } from '../rubric-catalog';
import { rubricDescriptors } from '../rubric-catalog';
import { browserCapMs, browserUsedToday } from './browser-budget';
import { type LabSwitches, lockDto, schedulerState } from './locks';
import { planCapabilities, schedulerMode } from './runtime';

// What «Рубрики» reads: the scheduler's state, its slots and every rubric, composed from the scheduler's own tables.

const iso = (ms: number) => new Date(ms).toISOString();
const DAY_MS = 86_400_000;

type ReadContainer = Pick<
  Container,
  'rubricSchedulerSettings' | 'rubricSlots' | 'destinations' | 'publishing' | 'schedulerEnv' | 'clock'
>;

export function slotDto(slot: SlotRow): RubricSlotDto {
  const meta = RUBRIC_META[slot.rubricKey as RubricKey];
  return {
    id: slot.id,
    rubricKey: slot.rubricKey as RubricKey,
    at: iso(slot.slotAt),
    state: slot.status,
    hasPicture: slot.build?.hasPicture ?? (meta === undefined ? false : meta.weight !== 'L' || meta.browserCalls > 0),
    hasPoll: slot.build?.hasPoll ?? meta?.poll !== undefined,
    reason: { kind: slot.reason.kind.slice(0, 20), text: slot.reason.text.slice(0, 200) },
    detail: slot.errorCode === null ? null : { code: slot.errorCode, step: slot.errorStep },
    publicationId: slot.publicationId,
    candidates: slot.candidates
      .filter((key): key is RubricKey => RUBRIC_META[key as RubricKey] !== undefined)
      .slice(0, 3)
  };
}

export async function readSchedulerStatus(
  container: ReadContainer,
  lab: LabSwitches
): Promise<RubricSchedulerStatusDto> {
  const now = container.clock.now();
  const env = container.schedulerEnv;
  const state = await schedulerState(container, env, lab);
  const capabilities = rubricCapabilities(env);
  const base = {
    capabilities: {
      browser: capabilities.has('browser'),
      openai: capabilities.has('ai_text'),
      stratz: capabilities.has('stratz'),
      statsDb: capabilities.has('stats_db')
    },
    updatedAt: iso(now)
  };
  if (state.mode === 'unavailable' || state.settings === null) {
    return {
      ...base,
      mode: 'forecast_only',
      enabled: false,
      effective: 'unavailable',
      locks: state.locks.map(lockDto),
      destination: null,
      liveSlots: 0,
      next: null,
      firstSlot: null,
      lastPlanAt: null,
      revision: 0
    };
  }
  const live = await container.rubricSlots.live();
  const next = live.filter((slot) => slot.slotAt > now).sort((a, b) => a.slotAt - b.slotAt)[0];
  const lastPlanAt = await container.rubricSchedulerSettings.lastPlanAt();
  return {
    ...base,
    mode: state.mode,
    enabled: state.settings.enabled,
    effective: state.locks.length === 0 ? 'running' : state.settings.enabled ? 'locked' : 'switched_off',
    locks: state.locks.map(lockDto),
    destination: state.destination === null ? null : { id: state.destination.id, title: state.destination.title },
    liveSlots: live.length,
    next: next === undefined ? null : { rubricKey: next.rubricKey as RubricKey, at: iso(next.slotAt) },
    firstSlot: next === undefined ? null : { rubricKey: next.rubricKey as RubricKey, at: iso(next.slotAt) },
    lastPlanAt: lastPlanAt === null ? null : iso(lastPlanAt),
    browserBudget: {
      usedMs: await browserUsedToday(container.rubricSlots, now),
      capMs: browserCapMs(env, state.mode)
    },
    revision: state.settings.revision
  };
}

export async function readCalendar(container: ReadContainer, from: string, to: string): Promise<RubricCalendarDto> {
  const slots = await container.rubricSlots.between(fromMsk(from, 0), fromMsk(to, 0) + DAY_MS);
  return {
    slots: slots.filter((slot) => slot.kind !== 'poll_close' && slot.status !== 'superseded').map(slotDto)
  };
}

export async function readRubricList(container: ReadContainer): Promise<RubricItemDto[]> {
  const settings = new Map((await container.rubricSchedulerSettings.rubrics()).map((row) => [row.rubricKey, row]));
  const env = container.schedulerEnv;
  const capabilities = planCapabilities(env, schedulerMode(env));
  const live = (await container.rubricSlots.live()).filter((slot) =>
    (LIVE_STATUSES as readonly string[]).includes(slot.status)
  );
  return rubricDescriptors().map((rubric) => {
    const row = settings.get(rubric.key);
    const missing = missingNeeds(rubric, capabilities);
    const next = live.filter((slot) => slot.rubricKey === rubric.key).sort((a, b) => a.slotAt - b.slotAt)[0];
    const state: RubricItemDto['state'] =
      row !== undefined && !row.enabled
        ? 'off'
        : row?.pausedReason === 'BANK_EXHAUSTED'
          ? 'paused'
          : missing.length > 0
            ? 'unavailable'
            : INNER_RULES_READY.has(rubric.key as RubricKey)
              ? 'active'
              : 'waiting';
    return {
      key: rubric.key as RubricKey,
      state,
      missing,
      enabled: row?.enabled ?? true,
      hasPicture: rubric.hasPicture,
      hasPoll: rubric.hasPoll,
      rest:
        rubric.restDays === null
          ? null
          : {
              baseDays: row?.baseRestDays ?? rubric.restDays,
              days: row?.restDays ?? rubric.restDays,
              source: row?.restSource ?? 'default'
            },
      lastPostAt: row?.lastSentAt === null || row?.lastSentAt === undefined ? null : iso(row.lastSentAt),
      lastPostSeeded: row?.lastSentSeeded ?? false,
      next: next === undefined ? null : { slotId: next.id, at: iso(next.slotAt) },
      revision: row?.revision ?? 0
    };
  });
}

export async function readSlotDetail(container: ReadContainer, id: string): Promise<RubricSlotDetailDto | null> {
  const slot = await container.rubricSlots.byId(id);
  if (slot === null) return null;
  const attempts = await container.rubricSlots.attempts(id);
  return {
    ...slotDto(slot),
    attempts: attempts.map((attempt) => ({
      attempt: attempt.attempt,
      step: attempt.step,
      rubricKey: attempt.rubricKey as RubricKey,
      outcome: attempt.outcome,
      code: attempt.errorCode,
      message: attempt.message,
      at: iso(attempt.finishedAt)
    }))
  };
}
