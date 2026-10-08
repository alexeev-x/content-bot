import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../tests/helpers/db';
import { resetDb, START } from '../../../tests/helpers/harness';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import { createD1PostRepository } from '../../modules/content';
import {
  createD1DotaWatcherRepository,
  DOTA_DRAFT_WORK_SQL,
  DOTA_DRAFT_RECOVERY_SQL,
  DOTA_OWNER_ALERT_WORK_SQL,
  DOTA_SOURCE_INCIDENT_ALERT_SQL,
  DotaWatchError,
  syncDotaUpdates,
  type DotaSourceFetcher,
  type DotaUpdateItem
} from '../../modules/dota';
import { createIdempotencyStore } from '../../platform/idempotency/d1-idempotency-store';
import { createLogger } from '../../platform/logging/logger';
import { createContainer } from '../container';
import { handleScheduled } from '../scheduled';
import { processDotaUpdates } from './process-dota-updates';

beforeEach(async () => {
  await resetDb();
  const db = testDb();
  await db.batch([
    db.prepare('DELETE FROM dota_source_incidents'),
    db.prepare('DELETE FROM dota_update_items'),
    db.prepare('DELETE FROM dota_source_state')
  ]);
});

const steam = (externalId: string, title = 'Patch <b>7.40</b>'): DotaUpdateItem => ({
  sourceKey: 'steam_news',
  externalId,
  title,
  sourceUrl: `https://store.steampowered.com/news/app/570/view/${externalId}`,
  publishedAt: START - 86_400_000
});
const sourceShapeFailure = () => Promise.reject(new DotaWatchError('DOTA_SOURCE_SHAPE', 'patch_notes'));

async function seedNewItem(item = steam('123456789')): Promise<void> {
  const repo = createD1DotaWatcherRepository(testDb());
  await repo.storeSync({ items: [steam('baseline')], detectedAt: START });
  await repo.storeSync({ items: [item], detectedAt: START + 1 });
}

function workflow(
  options: {
    sync?: () => Promise<{ inserted: number; fetched: number }>;
    ownerChatId?: string | null;
    messenger?: TelegramOwnerMessageApi | null;
    readAppOrigin?: () => Promise<string | null>;
    send?: (input: { html: string; button: { text: string; url: string } }) => Promise<unknown>;
  } = {}
) {
  const db = testDb();
  const repo = createD1DotaWatcherRepository(db);
  const posts = createD1PostRepository(db);
  const calls: { html: string; button: { text: string; url: string } }[] = [];
  const messenger =
    options.messenger === undefined
      ? {
          sendMessageWithWebAppButton: (
            _chatId: string,
            input: { html: string; button: { text: string; url: string } }
          ) => {
            calls.push(input);
            return options.send?.(input) ?? Promise.resolve({ ok: true });
          }
        }
      : options.messenger;
  return {
    calls,
    run: () =>
      processDotaUpdates({
        sync:
          options.sync ??
          (async () => {
            await repo.storeSync({ items: [], detectedAt: START + 10 });
            return { inserted: 0, fetched: 2 };
          }),
        repo,
        posts,
        idempotency: createIdempotencyStore(db),
        actor: '4242',
        now: () => START + 10,
        newId: () => crypto.randomUUID(),
        messenger,
        ownerChatId: options.ownerChatId === undefined ? '4242' : options.ownerChatId,
        readAppOrigin: options.readAppOrigin ?? (() => Promise.resolve('https://studio.example.com')),
        logger: createLogger(() => undefined)
      })
  };
}

async function count(sql: string): Promise<number> {
  const row = await testDb().prepare(sql).first<{ n: number }>();
  return row?.n ?? 0;
}

describe('Dota draft scan indexes', () => {
  it('uses bounded partial indexes for unprocessed source rows and pending owner alerts', async () => {
    const db = testDb();
    await db.prepare('PRAGMA optimize').run();
    const draft = await db.prepare(`EXPLAIN QUERY PLAN ${DOTA_DRAFT_WORK_SQL}`).bind(5).all<{ detail: string }>();
    const alert = await db.prepare(`EXPLAIN QUERY PLAN ${DOTA_OWNER_ALERT_WORK_SQL}`).bind(5).all<{ detail: string }>();
    const recovery = await db
      .prepare(`EXPLAIN QUERY PLAN ${DOTA_DRAFT_RECOVERY_SQL}`)
      .bind(5)
      .all<{ detail: string }>();
    const incident = await db
      .prepare(`EXPLAIN QUERY PLAN ${DOTA_SOURCE_INCIDENT_ALERT_SQL}`)
      .bind(2)
      .all<{ detail: string }>();
    const draftPlan = draft.results.map((row) => row.detail).join('\n');
    const alertPlan = alert.results.map((row) => row.detail).join('\n');
    const recoveryPlan = recovery.results.map((row) => row.detail).join('\n');
    const incidentPlan = incident.results.map((row) => row.detail).join('\n');
    expect(draftPlan).toContain('dota_draft_candidates_idx');
    expect(alertPlan).toContain('dota_draft_recovery_idx');
    expect(recoveryPlan).toContain('dota_draft_recovery_idx');
    expect(incidentPlan).toContain('dota_source_incidents_alert_idx');
    expect(draftPlan + alertPlan + recoveryPlan + incidentPlan).not.toContain('TEMP B-TREE');
  });
});

describe('processDotaUpdates', () => {
  it('creates no draft from the baseline and makes one draft from new persisted source facts', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    await repo.storeSync({ items: [steam('baseline')], detectedAt: START });
    const setup = workflow();
    await setup.run();
    expect(await count('SELECT count(*) AS n FROM posts')).toBe(0);

    await repo.storeSync({ items: [steam('123456789')], detectedAt: START + 1 });

    await setup.run();

    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    const post = await testDb().prepare('SELECT id, title, body, status FROM posts').first<{
      id: string;
      title: string;
      body: string;
      status: string;
    }>();
    expect(post?.status).toBe('draft');
    expect(post?.title).toBe('Patch <b>7.40</b>');
    expect(post?.body).toContain('Опубликовано (UTC):');
    expect(post?.body).toContain('Официальный источник: https://store.steampowered.com/news/app/570/view/123456789');
    expect(post?.body).not.toContain('summary');
    expect(setup.calls).toHaveLength(1);
    expect(setup.calls[0]?.html).not.toContain('<b>7.40</b>');
    expect(setup.calls[0]?.button.url).toBe(`https://studio.example.com/posts/${post?.id}`);
  });

  it('survives overlap and replay, including after idempotency retention by reusing the durable reserved id', async () => {
    await seedNewItem();
    const setup = workflow();

    await Promise.all([setup.run(), setup.run()]);
    await testDb().prepare('DELETE FROM idempotency_keys').run();
    await setup.run();

    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(setup.calls).toHaveLength(1);
  });

  it('recovers a crash after reserving the post id but before createPost', async () => {
    await seedNewItem();
    const postId = '33333333-3333-4333-8333-333333333333';
    await createD1DotaWatcherRepository(testDb()).reserveDraft({
      sourceKey: 'steam_news',
      externalId: '123456789',
      postId
    });
    const setup = workflow();

    await setup.run();

    const row = await testDb().prepare('SELECT id FROM posts').first<{ id: string }>();
    expect(row?.id).toBe(postId);
    expect(setup.calls).toHaveLength(1);
  });

  it.each([
    ['missing bot token', { messenger: null }],
    ['missing owner id', { ownerChatId: null }],
    ['missing app origin', { readAppOrigin: () => Promise.resolve(null) }]
  ])('keeps the draft alert pending with %s and sends it once prerequisites return', async (_label, missing) => {
    await seedNewItem();
    const pending = workflow(missing);

    await pending.run();

    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(
      await count(
        'SELECT count(*) AS n FROM dota_update_items WHERE owner_alert_claimed_at IS NULL AND is_baseline = 0'
      )
    ).toBe(1);
    expect(pending.calls).toHaveLength(0);

    const ready = workflow();
    await ready.run();
    expect(ready.calls).toHaveLength(1);
  });

  it('claims before Telegram and does not retry a failed or ambiguous send', async () => {
    await seedNewItem();
    const failed = workflow({ send: () => Promise.reject(new Error('ambiguous provider response')) });

    await failed.run();
    await failed.run();

    expect(failed.calls).toHaveLength(1);
    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(await count('SELECT count(*) AS n FROM dota_update_items WHERE owner_alert_claimed_at IS NOT NULL')).toBe(1);
  });

  it('dedupes an open source incident, alerts once, resolves after successful sync, then alerts on a later failure', async () => {
    const first = workflow({ sync: sourceShapeFailure });

    await first.run();
    await first.run();

    expect(await count('SELECT count(*) AS n FROM dota_source_incidents WHERE resolved_at IS NULL')).toBe(1);
    expect(first.calls).toHaveLength(1);

    const recovered = workflow();
    await recovered.run();
    expect(await count('SELECT count(*) AS n FROM dota_source_incidents WHERE resolved_at IS NULL')).toBe(0);

    const later = workflow({ sync: sourceShapeFailure });
    await later.run();
    expect(await count('SELECT count(*) AS n FROM dota_source_incidents')).toBe(2);
    expect(later.calls).toHaveLength(1);
  });

  it('alerts once with recovered status after config returns following source recovery', async () => {
    const unavailable = workflow({ sync: sourceShapeFailure, messenger: null });
    await unavailable.run();
    expect(
      await count(
        'SELECT count(*) AS n FROM dota_source_incidents WHERE resolved_at IS NULL AND owner_alert_claimed_at IS NULL'
      )
    ).toBe(1);

    const recoveredWithoutConfig = workflow({ messenger: null });
    await recoveredWithoutConfig.run();
    expect(
      await count(
        'SELECT count(*) AS n FROM dota_source_incidents WHERE resolved_at IS NOT NULL AND owner_alert_claimed_at IS NULL'
      )
    ).toBe(1);

    const ready = workflow();
    const result = await ready.run();

    expect(result.sourceAlertsSent).toBe(1);
    expect(ready.calls).toHaveLength(1);
    expect(ready.calls[0]?.html).toContain('Источник Dota восстановился');
    expect(
      await count('SELECT count(*) AS n FROM dota_source_incidents WHERE owner_alert_claimed_at IS NOT NULL')
    ).toBe(1);
  });

  it('keeps processing persisted draft work when the current source fetch fails', async () => {
    await seedNewItem();
    const failed = workflow({ sync: () => Promise.reject(new DotaWatchError('DOTA_SOURCE_HTTP', 'steam_news')) });

    const result = await failed.run();

    expect(result.sourceFailures).toBe(1);
    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(failed.calls).toHaveLength(2);
    expect(failed.calls.map((call) => call.button.url)).toContain('https://studio.example.com/');
    expect(failed.calls.some((call) => call.button.url.includes('/posts/'))).toBe(true);
  });

  it('claims a source incident alert before sending and never retries an ambiguous failure', async () => {
    const failed = workflow({
      sync: () => Promise.reject(new DotaWatchError('DOTA_SOURCE_HTTP', 'steam_news')),
      send: () => Promise.reject(new Error('ambiguous provider response'))
    });

    await failed.run();
    await failed.run();

    expect(failed.calls).toHaveLength(1);
    expect(
      await count('SELECT count(*) AS n FROM dota_source_incidents WHERE owner_alert_claimed_at IS NOT NULL')
    ).toBe(1);
  });

  it('does not partially write when one official feed fails shape validation', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const fetcher: DotaSourceFetcher = {
      fetch: (source) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              source === 'steam_news'
                ? { appnews: { appid: 570, count: 0, newsitems: [] } }
                : { success: true, patches: [{ patch_number: '7.40', patch_name: 7, patch_timestamp: 1 }] }
            )
          )
        )
    };

    await expect(syncDotaUpdates({ fetcher, repo, detectedAt: START })).rejects.toMatchObject({
      code: 'DOTA_SOURCE_SHAPE',
      sourceKey: 'patch_notes'
    });
    expect(await count('SELECT count(*) AS n FROM dota_update_items')).toBe(0);
  });

  it('runs the draft workflow from the scheduled handler against migrated D1 after publication work', async () => {
    const db = testDb();
    const repo = createD1DotaWatcherRepository(db);
    await repo.storeSync({ items: [steam('baseline')], detectedAt: START });
    const sent: { html: string; button: { text: string; url: string } }[] = [];
    const container = createContainer(
      { DB: db, OWNER_TELEGRAM_ID: '4242', PUBLISHING_ENABLED: 'false' },
      {
        clock: { now: () => START },
        dotaFetcher: {
          fetch: (source) =>
            Promise.resolve(
              new Response(
                JSON.stringify(
                  source === 'steam_news'
                    ? {
                        appnews: {
                          appid: 570,
                          count: 1,
                          newsitems: [
                            {
                              gid: '987654321',
                              title: 'New official update',
                              url: 'https://store.steampowered.com/news/app/570/view/987654321',
                              date: Math.floor(START / 1000),
                              feedname: 'steam_community_announcements'
                            }
                          ]
                        }
                      }
                    : { success: true, patches: [] }
                )
              )
            )
        },
        ownerMessenger: {
          sendMessageWithWebAppButton: (_chatId, input) => {
            sent.push(input);
            return Promise.resolve({ ok: true });
          }
        }
      }
    );
    await container.systemState.rememberAppOrigin('https://studio.example.com', START);

    await handleScheduled({ cron: '* * * * *', scheduledTime: START + 5 * 60_000 } as ScheduledController, container);

    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.button.url).toMatch(/^https:\/\/studio\.example\.com\/posts\/[0-9a-f-]{36}$/);
  });
});
