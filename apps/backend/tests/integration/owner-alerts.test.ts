import { beforeEach, describe, expect, it } from 'vitest';
import { alertOwnerOfIncidents } from '../../src/app/notifications/alert-owner-of-incidents';
import { createD1SystemState } from '../../src/app/system-state';
import { createD1DispatchRepository, type RaisedIncident } from '../../src/modules/publishing';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { fakeTransport, incidentsOf, makeTick, SENT, seedDueJob } from '../helpers/dispatch';
import {
  type Api,
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { jobOf } from '../helpers/publishing';

const ORIGIN = 'https://studio.example.com';
const REJECTED = { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE' } as const;

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  clock = fakeClock();
  api = createApi({ clock });
  await createD1SystemState(testDb()).rememberAppOrigin(ORIGIN, START);
});

const notifiedAt = async (jobId: string) =>
  (
    await testDb()
      .prepare('SELECT owner_notified_at FROM incidents WHERE job_id = ?1')
      .bind(jobId)
      .first<{ owner_notified_at: number | null }>()
  )?.owner_notified_at;

describe('the owner alert of a failed or unknown publication', () => {
  it('tells the owner after the state is stored, with the reason and an Open button to the publication', async () => {
    const { publicationId, jobId } = await seedDueJob(api, { title: 'Patch 7.40' });
    let jobStatusWhenSent: string | undefined;
    const messenger = fakeOwnerMessenger();
    const send = messenger.sendMessageWithWebAppButton.bind(messenger);
    messenger.sendMessageWithWebAppButton = async (chatId, input, signal) => {
      jobStatusWhenSent = (await jobOf(publicationId)).status;
      return send(chatId, input, signal);
    };

    await makeTick({ clock, transport: fakeTransport(REJECTED), ownerMessenger: messenger }).run();

    expect(jobStatusWhenSent).toBe('failed');
    expect(messenger.sent).toEqual([
      {
        chatId: OWNER_ID,
        html: [
          '<b>Публикация не отправлена</b>',
          'Пост: Patch 7.40',
          'Канал: Main channel',
          'Причина: бот потерял права на публикацию в канале или канал недоступен'
        ].join('\n'),
        button: { text: 'Открыть', url: `${ORIGIN}/publications?id=${publicationId}` }
      }
    ]);
    expect(await notifiedAt(jobId)).toBe(START);
  });

  it('groups a burst from one dispatch tick into one message with all affected posts', async () => {
    await seedDueJob(api, { title: 'Patch 7.40' });
    await seedDueJob(api, { title: 'Weekly recap' });
    const tick = makeTick({ clock, transport: fakeTransport(REJECTED) });

    await tick.run();

    expect(tick.ownerMessages).toHaveLength(1);
    expect(tick.ownerMessages[0]?.html).toContain('Сводка: 2 инцидента');
    expect(tick.ownerMessages[0]?.html).toContain('Patch 7.40');
    expect(tick.ownerMessages[0]?.html).toContain('Weekly recap');
    expect(tick.ownerMessages[0]?.button.url).toBe(`${ORIGIN}/incidents`);
  });

  it('says that the send is unconfirmed, and that it will not be repeated, when the outcome is unknown', async () => {
    const { publicationId } = await seedDueJob(api);
    const tick = makeTick({ clock, transport: fakeTransport({ kind: 'unknown', reason: 'timeout' }) });

    await tick.run();

    expect(tick.ownerMessages).toHaveLength(1);
    expect(tick.ownerMessages[0]?.html).toBe(
      [
        '<b>Отправка не подтверждена</b>',
        'Пост: Patch 7.40',
        'Канал: Main channel',
        'Сообщение могло выйти в канал. Проверьте канал вручную: бот не отправит его повторно сам.'
      ].join('\n')
    );
    expect(tick.ownerMessages[0]?.button.url).toBe(`${ORIGIN}/publications?id=${publicationId}`);
  });

  it('alerts for an unknown that reconcile found, with no titles because it loads none', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    await testDb()
      .prepare("UPDATE jobs SET status = 'claimed', attempts = 1, lease_until = ?1, send_started_at = ?2 WHERE id = ?3")
      .bind(START - 1, START - 2, jobId)
      .run();
    const tick = makeTick({ clock, transport: fakeTransport(SENT) });

    await tick.run();

    expect((await jobOf(publicationId)).status).toBe('unknown');
    expect(tick.ownerMessages).toEqual([
      {
        chatId: OWNER_ID,
        html: [
          '<b>Отправка не подтверждена</b>',
          'Сообщение могло выйти в канал. Проверьте канал вручную: бот не отправит его повторно сам.'
        ].join('\n'),
        button: { text: 'Открыть', url: `${ORIGIN}/publications?id=${publicationId}` }
      }
    ]);
  });

  it('escapes the post and channel titles', async () => {
    await seedDueJob(api, { title: '<b>x</b> & "y"' });
    const tick = makeTick({ clock, transport: fakeTransport(REJECTED) });

    await tick.run();

    expect(tick.ownerMessages[0]?.html).toContain('Пост: &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  });

  it('points an incident without a publication at the list of failed ones', async () => {
    await testDb()
      .prepare(
        `INSERT INTO jobs (id, kind, status, run_at, attempts, dedupe_key, created_at, updated_at)
         VALUES (?1, 'publish', 'pending', ?2, 0, 'orphan', ?2, ?2)`
      )
      .bind(crypto.randomUUID(), START)
      .run();
    const tick = makeTick({ clock, transport: fakeTransport(SENT) });

    await tick.run();

    expect(tick.ownerMessages).toHaveLength(1);
    expect(tick.ownerMessages[0]?.html).toContain('Причина: публикация не найдена');
    expect(tick.ownerMessages[0]?.button.url).toBe(`${ORIGIN}/publications?status=failed`);
  });

  it('sends nothing for a publication that went out', async () => {
    await seedDueJob(api);
    const tick = makeTick({ clock, transport: fakeTransport(SENT) });

    await tick.run();

    expect(tick.ownerMessages).toEqual([]);
  });

  it('stays quiet about a retry: only the end of the road is an incident', async () => {
    await seedDueJob(api);
    const tick = makeTick({ clock, transport: fakeTransport({ kind: 'rate_limited', retryAfterSec: 30 }) });

    await tick.run();

    expect(tick.ownerMessages).toEqual([]);
  });
});

describe('exactly one alert per incident', () => {
  it('two overlapping ticks send one alert', async () => {
    const { jobId } = await seedDueJob(api);
    const messenger = fakeOwnerMessenger();
    const first = makeTick({ clock, transport: fakeTransport(REJECTED), ownerMessenger: messenger });
    const second = makeTick({ clock, transport: fakeTransport(REJECTED), ownerMessenger: messenger });

    await Promise.all([first.run(), second.run()]);

    expect(await incidentsOf(jobId)).toHaveLength(1);
    expect(messenger.sent).toHaveLength(1);
  });

  it('two alerts racing for the same incident claim it once', async () => {
    const { jobId } = await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport(REJECTED) }).run();
    await testDb().prepare('UPDATE incidents SET owner_notified_at = NULL WHERE job_id = ?1').bind(jobId).run();
    const incident = await raisedIncidentOf(jobId);
    const messenger = fakeOwnerMessenger();
    const deps = alertDeps(messenger);

    const [a, b] = await Promise.all([
      alertOwnerOfIncidents(deps, [incident]),
      alertOwnerOfIncidents(deps, [incident])
    ]);

    expect(messenger.sent).toHaveLength(1);
    expect([a.sent, b.sent].sort()).toEqual([0, 1]);
    expect([a.claimed, b.claimed].sort()).toEqual([0, 1]);
  });

  it('a later tick never repeats the alert of an old incident', async () => {
    await seedDueJob(api);
    const messenger = fakeOwnerMessenger();
    await makeTick({ clock, transport: fakeTransport(REJECTED), ownerMessenger: messenger }).run();

    clock.advance(60_000);
    await makeTick({ clock, transport: fakeTransport(SENT), ownerMessenger: messenger }).run();

    expect(messenger.sent).toHaveLength(1);
  });
});

describe('a failing alert never touches dispatch', () => {
  it('leaves the job, the attempt and the incident as they were, logs a stable code, and is not retried', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    const messenger = fakeOwnerMessenger({ fail: () => new Error('Bad Request: secret-detail') });
    const tick = makeTick({ clock, transport: fakeTransport(REJECTED), ownerMessenger: messenger });

    await expect(tick.run()).resolves.toBeUndefined();

    expect(await jobOf(publicationId)).toMatchObject({ status: 'failed', attempts: 1 });
    expect(await incidentsOf(jobId)).toEqual([
      expect.objectContaining({ kind: 'publish_failed', code: 'DESTINATION_UNAVAILABLE', resolved_at: null })
    ]);
    expect(messenger.sent).toHaveLength(1);
    expect(tick.logs.find((line) => line.component === 'owner_alert')).toMatchObject({
      level: 'warn',
      status: 'failed',
      errorCode: 'UNAVAILABLE'
    });
    expect(JSON.stringify(tick.logs)).not.toContain('secret-detail');
    // Claimed before the send, so the failed alert is final: no second attempt on the next tick.
    expect(await notifiedAt(jobId)).toBe(START);
    clock.advance(60_000);
    await makeTick({ clock, transport: fakeTransport(SENT), ownerMessenger: messenger }).run();
    expect(messenger.sent).toHaveLength(1);
  });

  it('gives up on a Telegram that does not answer after the alert timeout', async () => {
    const { jobId } = await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport(REJECTED) }).run();
    await testDb().prepare('UPDATE incidents SET owner_notified_at = NULL WHERE job_id = ?1').bind(jobId).run();

    const summary = await alertOwnerOfIncidents({ ...alertDeps(fakeOwnerMessenger({ hang: true })), timeoutMs: 20 }, [
      await raisedIncidentOf(jobId)
    ]);

    expect(summary).toEqual({ claimed: 1, sent: 0, failed: 1 });
  });

  it('does not crash without a bot token: the job is stored, nothing is sent, the skip is logged', async () => {
    const { publicationId } = await seedDueJob(api);
    const tick = makeTick({ clock, transport: fakeTransport(REJECTED), token: null });

    await expect(tick.run()).resolves.toBeUndefined();

    expect(await jobOf(publicationId)).toMatchObject({ status: 'failed' });
    expect(tick.logs.find((line) => line.component === 'owner_alert')).toMatchObject({
      status: 'skipped',
      errorCode: 'BOT_TOKEN_MISSING'
    });
  });

  it('skips and leaves the incident unclaimed while the Worker origin is not known yet', async () => {
    await testDb().prepare('DELETE FROM system_state').run();
    const { jobId } = await seedDueJob(api);
    const tick = makeTick({ clock, transport: fakeTransport(REJECTED) });

    await expect(tick.run()).resolves.toBeUndefined();

    expect(tick.ownerMessages).toEqual([]);
    expect(await notifiedAt(jobId)).toBeNull();
    expect(tick.logs.find((line) => line.component === 'owner_alert')).toMatchObject({
      status: 'skipped',
      errorCode: 'APP_ORIGIN_UNKNOWN'
    });
  });

  it('skips when the owner id is not configured', async () => {
    const { jobId } = await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport(REJECTED) }).run();
    const incident = await raisedIncidentOf(jobId);
    const messenger = fakeOwnerMessenger();

    const summary = await alertOwnerOfIncidents({ ...alertDeps(messenger), ownerChatId: null }, [incident]);

    expect(summary).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(messenger.sent).toEqual([]);
  });

  it('a store that cannot be read ends as a logged code, not an exception', async () => {
    const { jobId } = await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport(REJECTED) }).run();
    const incident = await raisedIncidentOf(jobId);
    const logs: Record<string, unknown>[] = [];

    const summary = await alertOwnerOfIncidents(
      {
        ...alertDeps(fakeOwnerMessenger()),
        readAppOrigin: () => Promise.reject(new Error('D1 down')),
        logger: createLogger((line) => logs.push(JSON.parse(line) as Record<string, unknown>))
      },
      [incident]
    );

    expect(summary.failed).toBe(1);
    expect(logs).toEqual([
      expect.objectContaining({ component: 'owner_alert', status: 'failed', errorCode: 'ALERT_STATE_UNAVAILABLE' })
    ]);
  });
});

async function raisedIncidentOf(jobId: string): Promise<RaisedIncident> {
  const row = await testDb()
    .prepare('SELECT id, kind, code, publication_id FROM incidents WHERE job_id = ?1')
    .bind(jobId)
    .first<{ id: string; kind: RaisedIncident['kind']; code: string; publication_id: string | null }>();
  if (row === null) throw new Error('incident missing');
  return {
    id: row.id,
    kind: row.kind,
    code: row.code,
    publicationId: row.publication_id,
    postTitle: null,
    channelTitle: null
  };
}

function alertDeps(messenger: ReturnType<typeof fakeOwnerMessenger>) {
  return {
    repo: createD1DispatchRepository(testDb()),
    messenger,
    ownerChatId: OWNER_ID,
    readAppOrigin: () => createD1SystemState(testDb()).readAppOrigin(),
    clock,
    logger: createLogger(() => {})
  };
}
