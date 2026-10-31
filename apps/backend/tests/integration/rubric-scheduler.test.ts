import { beforeEach, describe, expect, it } from 'vitest';
import { type ContainerEnv, createContainer } from '../../src/app/container';
import { runRubricSchedulerTick } from '../../src/app/rubric-scheduler/tick';
import { runDispatchNow } from '../../src/app/workflows/dispatch-now';
import { runRubricBuild } from '../../src/app/workflows/rubric-build';
import { afterSlotSent } from '../../src/app/workflows/rubric-after-send';
import { releaseSlot } from '../../src/app/workflows/rubric-release';
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
const tick = (extra: Partial<ContainerEnv> = {}) =>
  runRubricSchedulerTick(container(extra), async () => ({ master: true, job: true }));

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

// Switched on, «Цитата дня» planned first; returns that slot still `planned`.
async function planFirst() {
  await switchOn();
  await tick();
  // Riddles read Valve's live numbers: out of these tests.
  await testDb().prepare("UPDATE rubric_settings SET enabled = 0 WHERE rubric_key = 'on_lane'").run();
  await testDb().prepare("UPDATE rubric_slots SET status = 'superseded' WHERE rubric_key = 'on_lane'").run();
  await testDb()
    .prepare("UPDATE rubric_settings SET last_sent_at = ?1 WHERE rubric_key = 'quote_of_day'")
    .bind(START - 60 * 86_400_000)
    .run();
  await testDb().prepare("UPDATE rubric_step_marks SET next_due_at = 0 WHERE step = 'plan'").run();
  await tick();
  const [first] = (await slots()).filter((slot) => slot.status === 'planned');
  if (first === undefined) throw new Error('nothing planned');
  return first;
}

async function buildFirst() {
  const first = await planFirst();
  clock.set(first.build_at);
  await tick();
  const job = jobs.find((each) => each.kind === 'rubric_build' && each.slotId === first.id);
  await runRubricBuild(container(), { slotId: first.id, attempt: job?.attempt ?? 0 }, 'test');
  return first;
}

const statusOf = async (id: string) => (await slots()).find((slot) => slot.id === id)?.status;

describe('the rubric scheduler', () => {
  it('does nothing while switched off', async () => {
    expect(await tick()).toMatchObject({ locked: 1 });
    expect(await slots()).toEqual([]);
  });

  it('still counts a post sent after the switch went off', async () => {
    const first = await buildFirst();
    clock.set(first.slot_at - 60_000);
    await tick();
    clock.set(first.slot_at);
    await runDispatchNow(container(), 'test');
    await testDb().prepare('UPDATE rubric_scheduler_settings SET enabled = 0, off_cleanup_done = 0 WHERE id = 1').run();
    // Well past the released deadline: the post is read back as sent, not written off as missed.
    clock.set(first.slot_at + 60 * 60_000);
    await tick();
    expect(await statusOf(first.id)).toBe('sent');
  });

  it('cancels its publication when the slot left ready during the release', async () => {
    const first = await buildFirst();
    const stale = await container().rubricSlots.byId(first.id);
    if (stale === null) throw new Error('no slot');
    // The owner skipped the slot while the release was creating its publication.
    await testDb().prepare("UPDATE rubric_slots SET status = 'cancelled' WHERE id = ?1").bind(first.id).run();
    clock.set(first.slot_at - 60_000);
    expect(await releaseSlot(container(), stale, destinationId)).toBe('lost');
    const rows = await testDb().prepare('SELECT status FROM jobs').all<{ status: string }>();
    expect(rows.results.length).toBeGreaterThan(0);
    expect(rows.results.every((row) => row.status === 'cancelled')).toBe(true);
  });

  it('fails the candidate whose build died, instead of building it again', async () => {
    const first = await planFirst();
    clock.set(first.build_at);
    await tick();
    expect(await statusOf(first.id)).toBe('building');
    clock.set(first.build_at + 16 * 60_000);
    await tick();
    const after = (await slots()).find((slot) => slot.id === first.id);
    expect(after?.error_code).toBe('BUILD_LOST');
    // The next candidate takes the slot, or with none left it ends empty: never the same rubric again.
    expect(after?.status === 'empty' || after?.rubric_key !== first.rubric_key).toBe(true);
  });

  it('recovers after a crash right after the sent transition: no second send, the rest is counted once', async () => {
    const first = await buildFirst();
    clock.set(first.slot_at - 60_000);
    await tick();
    clock.set(first.slot_at);
    await runDispatchNow(container(), 'test');
    const sends = transport.calls.length;
    clock.set(first.slot_at + 2 * 60_000);
    const plain = container();
    let crashed = false;
    const crashing = Object.create(plain, {
      rubricSlots: {
        value: {
          ...plain.rubricSlots,
          transition: async (input: Parameters<typeof plain.rubricSlots.transition>[0]) => {
            if (input.to === 'sent' && !crashed) {
              crashed = true;
              throw new Error('worker died');
            }
            return plain.rubricSlots.transition(input);
          }
        }
      }
    }) as typeof plain;
    await runRubricSchedulerTick(crashing, async () => ({ master: true, job: true })).catch(() => undefined);
    expect(crashed).toBe(true);
    expect(await statusOf(first.id)).not.toBe('sent');
    const rest = await testDb()
      .prepare('SELECT last_sent_at FROM rubric_settings WHERE rubric_key = ?1')
      .bind(first.rubric_key)
      .first<{ last_sent_at: number }>();
    expect(rest?.last_sent_at).toBeGreaterThanOrEqual(first.slot_at);
    await tick();
    expect(await statusOf(first.id)).toBe('sent');
    expect(transport.calls.length).toBe(sends);
  });

  it('deletes the posts of a late build whose slot already moved on, and counts nothing against the rubric', async () => {
    const first = await planFirst();
    clock.set(first.build_at);
    await tick();
    const job = jobs.find((each) => each.kind === 'rubric_build' && each.slotId === first.id);
    const plain = container();
    const late = Object.create(plain, {
      rubricSlots: {
        value: {
          ...plain.rubricSlots,
          transition: async (input: Parameters<typeof plain.rubricSlots.transition>[0]) => {
            if (input.to === 'ready')
              await testDb().prepare("UPDATE rubric_slots SET status = 'cancelled' WHERE id = ?1").bind(first.id).run();
            return plain.rubricSlots.transition(input);
          }
        }
      }
    }) as typeof plain;
    await runRubricBuild(late, { slotId: first.id, attempt: job?.attempt ?? 0 }, 'test');
    expect(await statusOf(first.id)).toBe('cancelled');
    const alive = await testDb()
      .prepare('SELECT count(*) AS n FROM posts WHERE deleted_at IS NULL')
      .first<{ n: number }>();
    expect(alive?.n).toBe(0);
  });

  it('puts the slot back to planned when the queue refuses the build, without blaming the rubric', async () => {
    const first = await planFirst();
    clock.set(first.build_at);
    await tick({
      AI_JOBS: {
        send: async () => {
          throw new Error('queue down');
        }
      } as unknown as Queue
    });
    const after = (await slots()).find((slot) => slot.id === first.id);
    expect(after?.status).toBe('planned');
    // The raised attempt stays: a message the queue took after all no longer matches the slot.
    expect(after?.attempt).toBe(first.attempt + 1);
    expect(after?.error_code).toBeNull();
  });

  it('counts only content slots as bank turns, not a poll close or a riddle answer', async () => {
    const c = container();
    const base = {
      mskDay: '2027-01-15',
      candidates: ['whose_ability'],
      candIdx: 0,
      attempt: 1,
      buildAt: START,
      nextActionAt: START,
      deadlineAt: START + 7_200_000,
      weight: 'V' as const,
      interactive: false,
      family: 'riddle' as const,
      reason: { kind: 'event' as const, text: 'x' },
      createdAt: START,
      rubricKey: 'whose_ability',
      status: 'sent' as const
    };
    await c.rubricSlots.insert(
      [
        { ...base, id: crypto.randomUUID(), slotAt: START, kind: 'pool', dedupeKey: 'pool:a' },
        { ...base, id: crypto.randomUUID(), slotAt: START + 60_000, kind: 'poll_close', dedupeKey: 'poll_close:a' },
        { ...base, id: crypto.randomUUID(), slotAt: START + 120_000, kind: 'follow_up', dedupeKey: 'follow:a' }
      ],
      START
    );
    expect(await c.rubricSlots.countingOf('whose_ability')).toBe(1);
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

  it('empties the build and facts of ended slots older than 90 days, and nothing else', async () => {
    const first = await planFirst();
    // Two more rows copied from the planned one (the plan of one test day may hold fewer slots).
    const columns = (await testDb().prepare('PRAGMA table_info(rubric_slots)').all<{ name: string }>()).results.map(
      (column) => column.name
    );
    const ids = { b: '00000000-0000-4000-8000-00000000000b', c: '00000000-0000-4000-8000-00000000000c' };
    for (const suffix of ['b', 'c'] as const) {
      const values = columns.map((name) =>
        name === 'id' ? `?1` : name === 'dedupe_key' ? `dedupe_key || ?1` : name === 'slot_at' ? `slot_at + ?2` : name
      );
      await testDb()
        .prepare(
          `INSERT INTO rubric_slots (${columns.join(', ')}) SELECT ${values.join(', ')} FROM rubric_slots WHERE id = ?3`
        )
        .bind(ids[suffix], suffix === 'b' ? 1_000 : 2_000, first.id)
        .run();
    }
    const old = { id: first.id };
    const recent = { id: ids.b };
    const live = { id: ids.c };
    const day = 86_400_000;
    const keep = async (id: string, status: string, slotAt: number) =>
      testDb()
        .prepare(
          `UPDATE rubric_slots SET status = ?2, slot_at = ?3, build_json = '{"hasPicture":true}', facts_json = '{"a":1}' WHERE id = ?1`
        )
        .bind(id, status, slotAt)
        .run();
    await keep(old.id, 'sent', START - 100 * day);
    await keep(recent.id, 'sent', START - 10 * day);
    await keep(live.id, 'planned', START - 100 * day + 60_000);
    await testDb().prepare("UPDATE rubric_step_marks SET next_due_at = 0 WHERE step = 'purge'").run();
    await tick();
    const rows = await testDb()
      .prepare('SELECT id, build_json, facts_json FROM rubric_slots WHERE id IN (?1, ?2, ?3)')
      .bind(old.id, recent.id, live.id)
      .all<{ id: string; build_json: string | null; facts_json: string | null }>();
    const of = (id: string) => rows.results.find((row) => row.id === id);
    expect(of(old.id)).toMatchObject({ build_json: null, facts_json: null });
    expect(of(recent.id)?.build_json).not.toBeNull();
    expect(of(live.id)?.facts_json).not.toBeNull();
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

  it('rehearses only into the channel the owner picked', async () => {
    await testDb().prepare('UPDATE rubric_scheduler_settings SET enabled = 1 WHERE id = 1').run();
    expect(await tick({ RUBRIC_SCHEDULER: 'rehearsal' })).toMatchObject({ locked: 1 });
    expect(await slots()).toEqual([]);
    await switchOn();
    expect(await tick({ RUBRIC_SCHEDULER: 'rehearsal' })).not.toMatchObject({ locked: 1 });
  });

  it('runs the week-long test: each slot checked, a staged lost channel never reaching Telegram', async () => {
    const week = { RUBRIC_SCHEDULER: 'rehearsal', RUBRIC_REHEARSAL_PACE: 'week' } as const;
    await switchOn();
    await tick(week);
    await testDb().prepare("UPDATE rubric_settings SET enabled = 0 WHERE rubric_key = 'on_lane'").run();
    await testDb().prepare("UPDATE rubric_slots SET status = 'superseded' WHERE rubric_key = 'on_lane'").run();
    await testDb().prepare("UPDATE rubric_step_marks SET next_due_at = 0 WHERE step = 'plan'").run();
    await tick(week);
    const planned = (await slots()).filter((slot) => slot.status === 'planned');
    // How many fit is the plan's own test (plan.test.ts): here every planned slot must have its check.
    expect(planned.length).toBeGreaterThan(0);
    const checks = await testDb()
      .prepare('SELECT slot_id, scenario FROM rubric_rehearsal_checks')
      .all<{ slot_id: string; scenario: string }>();
    // Replanned slots keep their check (their verdict is «не в счёт»); every live one has its own.
    const checked = new Set(checks.results.map((row) => row.slot_id));
    expect(planned.every((slot) => checked.has(slot.id))).toBe(true);

    const [first] = planned;
    if (first === undefined) throw new Error('nothing planned');
    await testDb()
      .prepare("UPDATE rubric_rehearsal_checks SET scenario = 'tg_forbidden' WHERE slot_id = ?1")
      .bind(first.id)
      .run();
    clock.set(first.build_at);
    await tick(week);
    const job = jobs.find((each) => each.kind === 'rubric_build' && each.slotId === first.id);
    await runRubricBuild(container(week), { slotId: first.id, attempt: job?.attempt ?? 0 }, 'test');
    expect((await slots()).find((slot) => slot.id === first.id)?.status).toBe('ready');
    clock.set(first.slot_at - 60_000);
    await tick(week);
    clock.set(first.slot_at);
    await runDispatchNow(container(week), 'test');
    // The staged answer stood in for Telegram: nothing was sent.
    expect(transport.calls).toEqual([]);
    clock.set(first.slot_at + 2 * 60_000);
    await tick(week);
    expect((await slots()).find((slot) => slot.id === first.id)?.status).toBe('send_failed');

    await testDb().prepare("UPDATE rubric_step_marks SET next_due_at = 0 WHERE step = 'plan'").run();
    await tick(week);
    const check = await testDb()
      .prepare('SELECT fired, verdict, status FROM rubric_rehearsal_checks WHERE slot_id = ?1')
      .bind(first.id)
      .first<{ fired: number; verdict: string; status: string }>();
    expect(check).toEqual({ fired: 1, verdict: 'ok', status: 'send_failed' });
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
