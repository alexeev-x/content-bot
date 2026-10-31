import { beforeEach, describe, expect, it } from 'vitest';
import { type ContainerEnv, createContainer } from '../../src/app/container';
import { runRubricSchedulerTick } from '../../src/app/rubric-scheduler/tick';
import { runDispatchNow } from '../../src/app/workflows/dispatch-now';
import { runRubricBuild } from '../../src/app/workflows/rubric-build';
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
