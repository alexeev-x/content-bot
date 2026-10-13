import { addDotaWatchlistResponseSchema, dotaWatchlistsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GrammyError } from 'grammy';
import type { TelegramOwnerMessageApi } from '../../src/integrations/telegram/telegram-api';
import { addDotaWatchlist, createD1DotaWatchlists } from '../../src/modules/dota-watchlists';
import { createLogger } from '../../src/platform/logging/logger';
import {
  completeIdempotencyStatement,
  createIdempotencyStore,
  type IdempotencyKeyRef
} from '../../src/platform/idempotency/d1-idempotency-store';
import { sendDotaWatchlistAlerts } from '../../src/app/workflows/process-dota-watchlist-alerts';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const fact = {
  id: 'patch:7.41:hero:0:hero:0:0',
  entityType: 'hero',
  entityName: 'Axe',
  section: 'hero',
  change: 'Damage increased by 10',
  direction: 'increase'
} as const;

async function seedPatch(status: 'complete' | 'incomplete' | 'pending' = 'complete') {
  const db = testDb();
  await db
    .prepare(
      `INSERT INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline)
     VALUES ('patch_notes', '7.41', 'Patch 7.41', 'https://www.dota2.com/patches/7.41', ?1, ?1, 0)`
    )
    .bind(START)
    .run();
  await db
    .prepare(
      `INSERT INTO dota_patch_analyses (source_key, external_id, parse_status, facts_json, parsed_at)
     VALUES ('patch_notes', '7.41', ?1, ?2, ?3)`
    )
    .bind(status, JSON.stringify(status === 'pending' ? [] : [fact]), START)
    .run();
}

async function addWatch() {
  const api = createApi({ clock: fakeClock(START), db: testDb() });
  await api.request('/api/v1/dota/watchlists', {
    method: 'POST',
    headers: { 'idempotency-key': 'watch-axe' },
    json: { sourceKey: 'patch_notes', externalId: '7.41', factId: fact.id }
  });
}

async function seedLaterPatch(id: string, detectedAt: number, status: 'complete' | 'incomplete' = 'complete') {
  const db = testDb();
  await db
    .prepare(
      `INSERT INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline)
     VALUES ('patch_notes', ?1, ?2, ?3, ?4, ?4, 0)`
    )
    .bind(id, `Patch ${id}`, `https://www.dota2.com/patches/${id}`, detectedAt)
    .run();
  await db
    .prepare(
      `INSERT INTO dota_patch_analyses (source_key, external_id, parse_status, facts_json, parsed_at)
     VALUES ('patch_notes', ?1, ?2, ?3, ?4)`
    )
    .bind(id, status, JSON.stringify([{ ...fact, id: `patch:${id}:hero:0:hero:0:0` }]), detectedAt)
    .run();
}

describe('Dota exact watchlists', () => {
  beforeEach(async () => {
    await resetDb();
    await testDb().batch([
      testDb().prepare('DELETE FROM dota_watch_alerts'),
      testDb().prepare('DELETE FROM dota_watch_matches'),
      testDb().prepare('DELETE FROM dota_watches'),
      testDb().prepare('DELETE FROM dota_patch_analyses'),
      testDb().prepare('DELETE FROM dota_update_items'),
      testDb().prepare('DELETE FROM dota_source_state')
    ]);
    await seedSession({ token: OWNER_TOKEN, expiresAt: START + 60 * 60_000 });
    await seedSession({ token: 'foreign-owner-token', telegramId: '999', expiresAt: START + 60 * 60_000 });
    await seedPatch();
  });

  it('is owner-only, derives identity from the persisted confirmed fact, and idempotently deduplicates entities', async () => {
    const api = createApi({ clock: fakeClock(START), db: testDb() });
    const input = { sourceKey: 'patch_notes', externalId: '7.41', factId: fact.id };
    expect((await api.request('/api/v1/dota/watchlists', { token: null })).status).toBe(401);
    expect((await api.request('/api/v1/dota/watchlists', { token: 'foreign-owner-token' })).status).toBe(403);
    expect((await api.request('/api/v1/dota/watchlists?unsupported=true')).status).toBe(400);
    const missingKey = await api.request('/api/v1/dota/watchlists', { method: 'POST', json: input });
    expect(missingKey.status).toBe(400);
    const first = await api.request('/api/v1/dota/watchlists', {
      method: 'POST',
      headers: { 'idempotency-key': 'watch-axe-1' },
      json: input
    });
    expect(first.status).toBe(201);
    const created = addDotaWatchlistResponseSchema.parse(await first.json());
    expect(created.watch).toMatchObject({ entityType: 'hero', entityName: 'Axe' });
    const replay = await api.request('/api/v1/dota/watchlists', {
      method: 'POST',
      headers: { 'idempotency-key': 'watch-axe-1' },
      json: input
    });
    expect(await replay.json()).toEqual(created);
    const duplicate = await api.request('/api/v1/dota/watchlists', {
      method: 'POST',
      headers: { 'idempotency-key': 'watch-axe-2' },
      json: input
    });
    expect(duplicate.status).toBe(200);
    expect(
      await testDb().prepare('SELECT count(*) AS count FROM dota_watches WHERE removed_at IS NULL').first()
    ).toMatchObject({ count: 1 });
  });

  it('rejects unsupported facts and exposes persisted matches, then removes idempotently', async () => {
    const api = createApi({ clock: fakeClock(START), db: testDb() });
    const unsupported = await api.request('/api/v1/dota/watchlists', {
      method: 'POST',
      headers: { 'idempotency-key': 'watch-general' },
      json: { sourceKey: 'patch_notes', externalId: '7.41', factId: 'missing' }
    });
    expect(unsupported.status).toBe(400);
    const added = await api.request('/api/v1/dota/watchlists', {
      method: 'POST',
      headers: { 'idempotency-key': 'watch-axe' },
      json: { sourceKey: 'patch_notes', externalId: '7.41', factId: fact.id }
    });
    const dto = addDotaWatchlistResponseSchema.parse(await added.json());
    const matches = await api.request('/api/v1/dota/watchlists');
    expect(dotaWatchlistsSchema.parse(await matches.json()).watches).toHaveLength(1);
    const removed = await api.request(`/api/v1/dota/watchlists/${dto.watch.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    expect((await api.request(`/api/v1/dota/watchlists/${dto.watch.id}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('serializes simultaneous duplicate entity adds to one active watch', async () => {
    const api = createApi({ clock: fakeClock(START), db: testDb() });
    const body = { sourceKey: 'patch_notes', externalId: '7.41', factId: fact.id };
    const [left, right] = await Promise.all([
      api.request('/api/v1/dota/watchlists', {
        method: 'POST',
        headers: { 'idempotency-key': 'parallel-a' },
        json: body
      }),
      api.request('/api/v1/dota/watchlists', {
        method: 'POST',
        headers: { 'idempotency-key': 'parallel-b' },
        json: body
      })
    ]);
    const statuses = [left.status, right.status];
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(
      await testDb().prepare('SELECT count(*) AS count FROM dota_watches WHERE removed_at IS NULL').first()
    ).toMatchObject({ count: 1 });
  });

  it('accepts an individually persisted hero fact from an incomplete patch parse', async () => {
    await testDb()
      .prepare("UPDATE dota_patch_analyses SET parse_status = 'incomplete' WHERE external_id = '7.41'")
      .run();
    const api = createApi({ clock: fakeClock(START), db: testDb() });
    const response = await api.request('/api/v1/dota/watchlists', {
      method: 'POST',
      headers: { 'idempotency-key': 'watch-incomplete-fact' },
      json: { sourceKey: 'patch_notes', externalId: '7.41', factId: fact.id }
    });
    expect(response.status).toBe(201);
    expect(addDotaWatchlistResponseSchema.parse(await response.json()).watch.entityName).toBe('Axe');
  });

  it('uses the active-watch, alert-claim and match indexes', async () => {
    const plans = await Promise.all([
      testDb()
        .prepare(
          "EXPLAIN QUERY PLAN SELECT id FROM dota_watches WHERE entity_type = 'hero' AND entity_key = 'axe' AND removed_at IS NULL"
        )
        .all<{ detail: string }>(),
      testDb()
        .prepare(
          "EXPLAIN QUERY PLAN SELECT id FROM dota_watch_alerts WHERE status = 'pending' AND created_at >= ?1 ORDER BY created_at, id LIMIT 2"
        )
        .bind(START)
        .all<{ detail: string }>(),
      testDb()
        .prepare(
          "EXPLAIN QUERY PLAN SELECT external_id FROM dota_update_items INDEXED BY dota_update_items_patch_detected_idx WHERE source_key = 'patch_notes' AND is_baseline = 0 AND detected_at > ?1 ORDER BY detected_at, external_id LIMIT 10"
        )
        .bind(START)
        .all<{ detail: string }>()
    ]);
    for (const [index, plan] of plans.entries()) {
      const detail = plan.results.map((row) => row.detail).join(' ');
      expect(detail).toContain('SEARCH');
      expect(detail).toContain('USING');
      expect(detail).toContain(
        ['dota_watches_active_entity_idx', 'dota_watch_alerts_pending_idx', 'dota_update_items_patch_detected_idx'][
          index
        ]
      );
    }
  });

  it('matches only later persisted facts and concurrent cron runs produce one private send', async () => {
    await addWatch();
    await seedLaterPatch('7.42', START + 1, 'incomplete');
    const sendMessageWithWebAppButton = vi.fn(async () => true);
    const messenger: TelegramOwnerMessageApi = {
      sendMessageWithWebAppButton,
      sendMediaWithWebAppButton: async () => true
    };
    const service = createD1DotaWatchlists(testDb());
    await service.processMatches({ now: START + 10, newId: () => crypto.randomUUID(), notificationsEnabled: true });
    const sendDeps = {
      repo: service,
      messenger,
      ownerChatId: '4242',
      now: () => START + 10,
      logger: createLogger(() => {}),
      appOrigin: 'https://content.example'
    };
    await Promise.all([sendDotaWatchlistAlerts(sendDeps), sendDotaWatchlistAlerts(sendDeps)]);
    await sendDotaWatchlistAlerts(sendDeps);
    expect(sendMessageWithWebAppButton).toHaveBeenCalledTimes(1);
    const dto = dotaWatchlistsSchema.parse(await service.list());
    expect(dto.matches).toHaveLength(1);
    expect(dto.matches[0]).toMatchObject({ alertStatus: 'sent', entityName: 'Axe', update: { externalId: '7.42' } });
  });

  it('does not send a pending alert after its watch has been removed', async () => {
    await addWatch();
    await seedLaterPatch('7.42', START + 1);
    const service = createD1DotaWatchlists(testDb());
    await service.processMatches({ now: START + 10, newId: () => crypto.randomUUID(), notificationsEnabled: true });
    const watch = await testDb()
      .prepare('SELECT id FROM dota_watches WHERE removed_at IS NULL')
      .first<{ id: string }>();
    if (watch === null) throw new Error('The watch fixture was not created');
    await service.remove(watch.id, START + 20);
    const pending = await testDb()
      .prepare("SELECT id FROM dota_watch_alerts WHERE status = 'pending'")
      .first<{ id: string }>();
    if (pending === null) throw new Error('The pending alert fixture was not created');
    expect(await service.claimAlert(pending.id, START + 25)).toBe(false);

    const sendMessageWithWebAppButton = vi.fn(async () => true);
    const messenger: TelegramOwnerMessageApi = {
      sendMessageWithWebAppButton,
      sendMediaWithWebAppButton: async () => true
    };
    await sendDotaWatchlistAlerts({
      repo: service,
      messenger,
      ownerChatId: '4242',
      appOrigin: 'https://content.example',
      now: () => START + 30,
      logger: createLogger(() => {})
    });

    expect(await service.listPending(20)).toEqual([]);
    expect(sendMessageWithWebAppButton).not.toHaveBeenCalled();
    expect(dotaWatchlistsSchema.parse(await service.list()).matches).toHaveLength(1);
  });

  it('uses the stable IN_FLIGHT reason for a concurrent idempotent add', async () => {
    await expect(
      addDotaWatchlist({
        db: testDb(),
        actor: 'owner',
        key: 'watch-in-flight',
        rawInput: { sourceKey: 'patch_notes', externalId: '7.41', factId: fact.id },
        now: START,
        newId: () => crypto.randomUUID(),
        idempotency: {
          claim: async () => ({ kind: 'in_flight' }),
          release: async () => {}
        }
      })
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'IN_FLIGHT' } });
  });

  it('uses the stable IDEMPOTENCY_KEY_REUSED reason for a changed payload', async () => {
    await expect(
      addDotaWatchlist({
        db: testDb(),
        actor: 'owner',
        key: 'watch-reused',
        rawInput: { sourceKey: 'patch_notes', externalId: '7.41', factId: fact.id },
        now: START,
        newId: () => crypto.randomUUID(),
        idempotency: {
          claim: async () => ({ kind: 'reused' }),
          release: async () => {}
        }
      })
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('does not complete an existing-watch add if that watch is removed before its response is stored', async () => {
    await addWatch();
    const db = testDb();
    const existing = await db.prepare('SELECT id FROM dota_watches WHERE removed_at IS NULL').first<{ id: string }>();
    if (existing === null) throw new Error('The watch fixture was not created');
    const idempotency = createIdempotencyStore(db);
    const requestHash = 'a'.repeat(64);
    const claim = await idempotency.claim('owner', 'watch-race-remove', requestHash, START + 2);
    expect(claim.kind).toBe('claimed');
    const ref: IdempotencyKeyRef = {
      scope: 'owner',
      key: 'watch-race-remove',
      requestHash,
      claimedAt: START + 2
    };
    await createD1DotaWatchlists(db).remove(existing.id, START + 3);
    const completion = await db.batch([
      completeIdempotencyStatement(
        db,
        ref,
        { status: 200, body: JSON.stringify({ watch: { id: existing.id }, created: false }) },
        START + 4,
        {
          sql: 'EXISTS (SELECT 1 FROM dota_watches WHERE id = ?8 AND removed_at IS NULL)',
          bindings: [existing.id]
        }
      )
    ]);
    expect(completion[0]?.meta.changes).toBe(0);
    expect(
      await db
        .prepare("SELECT status FROM idempotency_keys WHERE scope = 'owner' AND key = 'watch-race-remove'")
        .first()
    ).toMatchObject({ status: 'in_flight' });
  });

  it('records definite rejection, ambiguous send and disabled preference without retrying', async () => {
    await addWatch();
    await seedLaterPatch('7.42', START + 1);
    const service = createD1DotaWatchlists(testDb());
    const deps = { now: START + 10, newId: () => crypto.randomUUID(), notificationsEnabled: true };
    await service.processMatches(deps);
    const rejected: TelegramOwnerMessageApi = {
      sendMessageWithWebAppButton: async () => {
        throw new GrammyError('forbidden', { ok: false, error_code: 403, description: 'blocked' }, 'sendMessage', {});
      },
      sendMediaWithWebAppButton: async () => true
    };
    await sendDotaWatchlistAlerts({
      repo: service,
      messenger: rejected,
      ownerChatId: '4242',
      appOrigin: 'https://content.example',
      now: () => START + 10,
      logger: createLogger(() => {})
    });
    expect(dotaWatchlistsSchema.parse(await service.list()).matches[0]?.alertStatus).toBe('failed');

    await testDb()
      .prepare("UPDATE dota_watch_alerts SET status = 'pending', error_code = NULL WHERE status = 'failed'")
      .run();
    const ambiguous: TelegramOwnerMessageApi = {
      sendMessageWithWebAppButton: async () => {
        throw new Error('network disconnected after request');
      },
      sendMediaWithWebAppButton: async () => true
    };
    await sendDotaWatchlistAlerts({
      repo: service,
      messenger: ambiguous,
      ownerChatId: '4242',
      appOrigin: 'https://content.example',
      now: () => START + 20,
      logger: createLogger(() => {})
    });
    await sendDotaWatchlistAlerts({
      repo: service,
      messenger: ambiguous,
      ownerChatId: '4242',
      appOrigin: 'https://content.example',
      now: () => START + 30,
      logger: createLogger(() => {})
    });
    expect(dotaWatchlistsSchema.parse(await service.list()).matches[0]?.alertStatus).toBe('unknown');

    await seedLaterPatch('7.43', START + 2);
    await service.processMatches({ now: START + 40, newId: () => crypto.randomUUID(), notificationsEnabled: false });
    expect(dotaWatchlistsSchema.parse(await service.list()).matches.map((match) => match.alertStatus)).toContain(
      'disabled'
    );
  });

  it('turns an abandoned sending claim into unknown and never sends it again', async () => {
    await addWatch();
    await seedLaterPatch('7.42', START + 1);
    const watch = await testDb()
      .prepare('SELECT id FROM dota_watches WHERE removed_at IS NULL')
      .first<{ id: string }>();
    if (watch === null) throw new Error('The watch fixture was not created');
    const matchId = crypto.randomUUID();
    const alertId = crypto.randomUUID();
    await testDb().batch([
      testDb()
        .prepare(
          `INSERT INTO dota_watch_matches (id, watch_id, source_key, external_id, fact_id, fact_json, created_at)
         VALUES (?1, ?2, 'patch_notes', '7.42', ?3, ?4, ?5)`
        )
        .bind(
          matchId,
          watch.id,
          'patch:7.42:hero:0:hero:0:0',
          JSON.stringify({ ...fact, id: 'patch:7.42:hero:0:hero:0:0' }),
          START + 1
        ),
      testDb()
        .prepare(
          `INSERT INTO dota_watch_alerts (id, match_id, status, created_at, updated_at, send_started_at)
         VALUES (?1, ?2, 'sending', ?3, ?3, ?3)`
        )
        .bind(alertId, matchId, START + 1)
    ]);
    const sendMessageWithWebAppButton = vi.fn(async () => true);
    const messenger: TelegramOwnerMessageApi = {
      sendMessageWithWebAppButton,
      sendMediaWithWebAppButton: async () => true
    };
    const service = createD1DotaWatchlists(testDb());
    await service.processMatches({ now: START + 10_000, newId: () => crypto.randomUUID(), notificationsEnabled: true });
    await sendDotaWatchlistAlerts({
      repo: service,
      messenger,
      ownerChatId: '4242',
      appOrigin: 'https://content.example',
      now: () => START + 10_000,
      logger: createLogger(() => {})
    });
    expect(
      (
        await testDb()
          .prepare('SELECT status FROM dota_watch_alerts WHERE id = ?1')
          .bind(alertId)
          .first<{ status: string }>()
      )?.status
    ).toBe('unknown');
    expect(sendMessageWithWebAppButton).not.toHaveBeenCalled();
  });
});
