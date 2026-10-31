import { beforeEach, describe, expect, it } from 'vitest';
import { type ContainerEnv, createContainer } from '../../src/app/container';
import { runRubricSchedulerTick } from '../../src/app/rubric-scheduler/tick';
import { runDispatchNow } from '../../src/app/workflows/dispatch-now';
import { runRubricBuild } from '../../src/app/workflows/rubric-build';
import { afterSlotSent } from '../../src/app/workflows/rubric-after-send';
import { closePoll } from '../../src/app/workflows/rubric-poll-close';
import { testDb } from '../helpers/db';
import { fakeTransport, type FakeTransport, SENT } from '../helpers/dispatch';
import {
  type Api,
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { seedDestination } from '../helpers/publishing';

// The rubric scheduler end to end on D1 (stage 4): planned → building → ready → released → sent, the switch-off
// cleanup, the deadlines. Asserts D1 state, not mock calls.

let clock: FakeClock;
let api: Api;
let transport: FakeTransport;
let jobs: { kind: string; slotId?: string; attempt?: number }[];
let destinationId: string;

const env = (extra: Partial<ContainerEnv> = {}): ContainerEnv => ({
  DB: testDb(),
  MEDIA_BUCKET: testMediaBucket(),
  PUBLISHING_ENABLED: 'true',
  TELEGRAM_BOT_TOKEN: '123456:TEST-BOT-TOKEN-PLACEHOLDER',
  OWNER_TELEGRAM_ID: '4242',
  RUBRIC_SCHEDULER: 'on',
  AI_JOBS: {
    send: async (body: { kind: string; slotId?: string; attempt?: number }) => {
      jobs.push(body);
    }
  } as unknown as Queue,
  ...extra
});
const container = (extra: Partial<ContainerEnv> = {}) => createContainer(env(extra), { clock, transport });
const tick = (extra: Partial<ContainerEnv> = {}) => runRubricSchedulerTick(container(extra), async () => true);

const slots = () =>
  testDb()
    .prepare('SELECT id, rubric_key, status, slot_at, build_at, attempt, error_code FROM rubric_slots ORDER BY slot_at')
    .all<{
      id: string;
      rubric_key: string;
      status: string;
      slot_at: number;
      build_at: number;
      attempt: number;
      error_code: string | null;
    }>()
    .then((result) => result.results);

async function switchOn() {
  await testDb()
    .prepare(
      'UPDATE rubric_scheduler_settings SET enabled = 1, destination_id = ?1, revision = revision + 1 WHERE id = 1'
    )
    .bind(destinationId)
    .run();
}

beforeEach(async () => {
  await resetDb();
  await testDb().batch([
    testDb().prepare('DELETE FROM rubric_slot_attempts'),
    testDb().prepare('DELETE FROM rubric_slots'),
    testDb().prepare('DELETE FROM rubric_settings'),
    testDb().prepare('DELETE FROM rubric_notices'),
    testDb().prepare('DELETE FROM rubric_breakers'),
    testDb().prepare('DELETE FROM rubric_bets'),
    testDb().prepare('UPDATE rubric_step_marks SET next_due_at = 0'),
    testDb().prepare('UPDATE rubric_scheduler_settings SET enabled = 0, destination_id = NULL, off_cleanup_done = 1')
  ]);
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  clock = fakeClock();
  api = createApi({ clock });
  transport = fakeTransport(SENT);
  jobs = [];
  destinationId = (await seedDestination(api, { chatId: '-1001234567' })).id;
});

describe('the rubric scheduler', () => {
  it('does nothing while switched off', async () => {
    expect(await tick()).toMatchObject({ locked: 1 });
    expect(await slots()).toEqual([]);
  });

  it('takes a slot from the plan to a sent post', async () => {
    await switchOn();
    await tick();
    // Riddles read Valve's live numbers: out of this test.
    await testDb().prepare("UPDATE rubric_settings SET enabled = 0 WHERE rubric_key = 'on_lane'").run();
    await testDb().prepare("UPDATE rubric_slots SET status = 'superseded' WHERE rubric_key = 'on_lane'").run();
    // «Цитата дня» is long rested: the plan takes it first.
    await testDb()
      .prepare("UPDATE rubric_settings SET last_sent_at = ?1 WHERE rubric_key = 'quote_of_day'")
      .bind(START - 60 * 86_400_000)
      .run();
    await testDb().prepare("UPDATE rubric_step_marks SET next_due_at = 0 WHERE step = 'plan'").run();
    await tick();
    const [first] = (await slots()).filter((slot) => slot.status === 'planned');
    if (first === undefined) throw new Error('nothing planned');

    clock.set(first.build_at);
    await tick();
    const job = jobs.find((each) => each.kind === 'rubric_build' && each.slotId === first.id);
    expect(job).toBeDefined();
    await runRubricBuild(container(), { slotId: first.id, attempt: job?.attempt ?? 0 }, 'test');
    expect((await slots()).find((slot) => slot.id === first.id)?.status).toBe('ready');

    clock.set(first.slot_at - 60_000);
    await tick();
    expect((await slots()).find((slot) => slot.id === first.id)?.status).toBe('released');

    clock.set(first.slot_at);
    await runDispatchNow(container(), 'test');
    expect(transport.calls.length).toBeGreaterThan(0);
    clock.set(first.slot_at + 2 * 60_000);
    await tick();
    expect((await slots()).find((slot) => slot.id === first.id)?.status).toBe('sent');
    const rest = await testDb()
      .prepare('SELECT last_sent_at, last_sent_seeded FROM rubric_settings WHERE rubric_key = ?1')
      .bind(first.rubric_key)
      .first<{ last_sent_at: number; last_sent_seeded: number }>();
    expect(rest?.last_sent_seeded).toBe(0);
    expect(rest?.last_sent_at).toBeGreaterThanOrEqual(first.slot_at);
  });

  it('cancels the slots not yet released once switched off', async () => {
    await switchOn();
    await tick();
    expect((await slots()).length).toBeGreaterThan(0);
    await testDb().prepare('UPDATE rubric_scheduler_settings SET enabled = 0, off_cleanup_done = 0 WHERE id = 1').run();
    await tick();
    expect((await slots()).every((slot) => slot.status === 'cancelled')).toBe(true);
  });

  it('ends a slot nobody built by its deadline, empty', async () => {
    await switchOn();
    await tick();
    const [first] = await slots();
    if (first === undefined) throw new Error('nothing planned');
    clock.set(first.slot_at + 10 * 60_000);
    await tick();
    expect((await slots()).find((slot) => slot.id === first.id)).toMatchObject({
      status: 'empty',
      error_code: 'DEADLINE'
    });
  });

  it('never posts outside the test channel in rehearsal', async () => {
    await switchOn();
    expect(
      await tick({
        RUBRIC_SCHEDULER: 'rehearsal',
        RUBRIC_REHEARSAL_DESTINATION_ID: destinationId,
        RUBRIC_REHEARSAL_CHAT_ID: '-100999'
      })
    ).toMatchObject({ locked: 1 });
    expect(await slots()).toEqual([]);
  });
});

describe('the rubric breaker', () => {
  it('opens after three failures in three days and keeps the rubric out of the plan', async () => {
    const breakers = container().rubricBreakers;
    const fail = (at: number) =>
      breakers.recordFailure({
        scope: 'rubric',
        key: 'quote_of_day',
        now: at,
        code: 'NO_DATA',
        windowMs: 3 * 86_400_000,
        threshold: 3,
        openMs: 2 * 86_400_000
      });
    expect((await fail(START)).opened).toBe(false);
    expect((await fail(START + 3_600_000)).opened).toBe(false);
    expect((await fail(START + 7_200_000)).opened).toBe(true);
    expect((await breakers.open('rubric', START + 86_400_000)).map((each) => each.key)).toEqual(['quote_of_day']);
    expect(await breakers.open('rubric', START + 3 * 86_400_000)).toEqual([]);

    await switchOn();
    clock.set(START + 7_300_000);
    await testDb()
      .prepare("UPDATE rubric_settings SET last_sent_at = ?1 WHERE rubric_key = 'quote_of_day'")
      .bind(START - 60 * 86_400_000)
      .run();
    await tick();
    expect((await slots()).some((slot) => slot.rubric_key === 'quote_of_day')).toBe(false);
  });
});

describe('after a rubric post went out', () => {
  const slotRow = async (dedupeKey: string, rubricKey: string, extra: Record<string, unknown> = {}) => {
    const c = container();
    const id = crypto.randomUUID();
    await c.rubricSlots.insert(
      [
        {
          id,
          mskDay: '2027-01-15',
          slotAt: START + 3_600_000,
          kind: 'event',
          rubricKey,
          candidates: [rubricKey],
          candIdx: 0,
          attempt: 1,
          status: 'released',
          buildAt: START,
          nextActionAt: START,
          deadlineAt: START + 7_200_000,
          weight: 'V',
          interactive: true,
          family: 'patch',
          dedupeKey,
          reason: { kind: 'event', text: 'x' },
          createdAt: START
        }
      ],
      START
    );
    await c.rubricSlots.transition({ id, from: 'released', to: 'released', now: START, set: extra });
    const slot = await c.rubricSlots.byId(id);
    if (slot === null) throw new Error('no slot');
    return slot;
  };

  it('opens a bet, plans the poll close and closes the poll with its final counts', async () => {
    const c = container();
    const bet = await slotRow('bet:7.41', 'who_gets_nerfed', {
      facts: { heroIds: [1, 2, 3], chain: '7.41', look: 'A' }
    });
    await afterSlotSent(c, bet, { at: START, pollId: 'poll-9', messageIds: ['10', '11'], chatId: '-1001234567' });
    expect((await c.rubricBets.open())?.heroIds).toEqual([1, 2, 3]);
    const close = (await slots()).find((slot) => slot.rubric_key === 'who_gets_nerfed' && slot.id !== bet.id);
    expect(close?.slot_at).toBe(START + 168 * 3_600_000);
    const closeSlot = await c.rubricSlots.byId(close?.id ?? '');
    if (closeSlot === null) throw new Error('no close slot');
    await closePoll(
      {
        audience: c.audience,
        rubricSlots: c.rubricSlots,
        pollStopper: { stop: async () => ({ kind: 'closed', total: 5, options: [{ text: 'Pudge', voters: 5 }] }) }
      },
      closeSlot,
      START + 200 * 3_600_000
    );
    expect((await c.rubricSlots.byId(closeSlot.id))?.status).toBe('sent');
  });

  it("plans the riddle's answer three hours after the riddle went out", async () => {
    const c = container();
    const riddle = await slotRow('pool:whose_ability:2027-01-15', 'whose_ability', {
      build: {
        posts: [{ postId: crypto.randomUUID(), revision: 1, kind: 'text' }],
        degradations: [],
        hasPicture: true,
        hasPoll: false,
        bankTurn: null,
        followUp: { afterMinutes: 180, posts: [{ postId: crypto.randomUUID(), revision: 1, kind: 'text' }] }
      }
    });
    await afterSlotSent(c, riddle, { at: START, pollId: null, messageIds: ['12'], chatId: '-1001234567' });
    await afterSlotSent(c, riddle, { at: START, pollId: null, messageIds: ['12'], chatId: '-1001234567' });
    const answers = (await slots()).filter((slot) => slot.status === 'ready');
    expect(answers.map((slot) => slot.slot_at)).toEqual([START + 180 * 60_000]);
  });
});
