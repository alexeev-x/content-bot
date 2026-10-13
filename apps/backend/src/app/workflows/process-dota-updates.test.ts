import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../tests/helpers/db';
import { resetDb, START } from '../../../tests/helpers/harness';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import { createD1PostRepository, createPost } from '../../modules/content';
import {
  createD1DotaWatcherRepository,
  DOTA_DRAFT_WORK_SQL,
  DOTA_DRAFT_RECOVERY_SQL,
  DOTA_PENDING_PATCH_ANALYSIS_SQL,
  DOTA_OWNER_ALERT_WORK_SQL,
  DOTA_SOURCE_INCIDENT_ALERT_SQL,
  DOTA_PATCH_DETAIL_INCIDENT_RECOVERY_SQL,
  DotaPatchDetailError,
  DotaWatchError,
  type DotaPatchInspection,
  syncDotaUpdates,
  summarizeOfficialPatch,
  parsePatchNameMaps,
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
    readNotificationPreferences?: () => Promise<{
      warningsEnabled: boolean;
      publicationAlerts: boolean;
      sourceAlerts: boolean;
      automationAlerts: boolean;
      recoveryAlerts: boolean;
      dotaWatchlistAlerts: boolean;
    }>;
    send?: (input: { html: string; button: { text: string; url: string } }) => Promise<unknown>;
    patchSummary?: {
      patchNumber: string;
      title: string;
      themes: {
        category: string;
        name: string;
        changes: string[];
        noteCount: number;
        numericNoteCount: number;
        structuralNoteCount: number;
        relativeMagnitudeScore: number;
      }[];
    } | null;
    summarizePatch?: (version: string) => Promise<{
      patchNumber: string;
      title: string;
      themes: {
        category: string;
        name: string;
        changes: string[];
        noteCount: number;
        numericNoteCount: number;
        structuralNoteCount: number;
        relativeMagnitudeScore: number;
      }[];
    } | null>;
    inspectPatch?: (version: string) => Promise<DotaPatchInspection>;
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
          },
          sendMediaWithWebAppButton: () => Promise.resolve({ ok: true })
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
        summarizePatch: options.summarizePatch ?? (() => Promise.resolve(options.patchSummary ?? null)),
        ...(options.inspectPatch === undefined ? {} : { inspectPatch: options.inspectPatch }),
        repo,
        posts,
        idempotency: createIdempotencyStore(db),
        actor: '4242',
        now: () => START + 10,
        newId: () => crypto.randomUUID(),
        messenger,
        ownerChatId: options.ownerChatId === undefined ? '4242' : options.ownerChatId,
        readAppOrigin: options.readAppOrigin ?? (() => Promise.resolve('https://studio.example.com')),
        ...(options.readNotificationPreferences === undefined
          ? {}
          : { readNotificationPreferences: options.readNotificationPreferences }),
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
    const detailRecovery = await db
      .prepare(`EXPLAIN QUERY PLAN ${DOTA_PATCH_DETAIL_INCIDENT_RECOVERY_SQL}`)
      .all<{ detail: string }>();
    const pendingAnalysis = await db
      .prepare(`EXPLAIN QUERY PLAN ${DOTA_PENDING_PATCH_ANALYSIS_SQL}`)
      .bind('claim-token', START, 2, START + 60_000)
      .all<{ detail: string }>();
    const draftPlan = draft.results.map((row) => row.detail).join('\n');
    const alertPlan = alert.results.map((row) => row.detail).join('\n');
    const recoveryPlan = recovery.results.map((row) => row.detail).join('\n');
    const incidentPlan = incident.results.map((row) => row.detail).join('\n');
    const detailRecoveryPlan = detailRecovery.results.map((row) => row.detail).join('\n');
    const pendingAnalysisPlan = pendingAnalysis.results.map((row) => row.detail).join('\n');
    expect(draftPlan).toContain('dota_draft_candidates_idx');
    expect(alertPlan).toContain('dota_draft_recovery_idx');
    expect(recoveryPlan).toContain('dota_draft_recovery_idx');
    expect(incidentPlan).toContain('dota_source_incidents_alert_idx');
    expect(detailRecoveryPlan).toContain('dota_patch_incidents_one_open_idx');
    expect(pendingAnalysisPlan).toContain('dota_patch_analyses_pending_idx');
    expect(
      draftPlan + alertPlan + recoveryPlan + incidentPlan + detailRecoveryPlan + pendingAnalysisPlan
    ).not.toContain('TEMP B-TREE');
  });

  it('claims pending patch analyses once across overlapping ticks and recovers after the lease expires', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [
        {
          sourceKey: 'patch_notes',
          externalId: '7.40',
          title: 'Dota 7.40',
          sourceUrl: 'https://www.dota2.com/patches/7.40',
          publishedAt: START
        }
      ],
      detectedAt: START
    });
    const claim = (claimToken: string, now: number) =>
      repo.claimPendingPatchAnalyses({ claimToken, now, leaseUntil: now + 60_000, limit: 1 });

    const overlapping = await Promise.all([claim('claim-a', START + 1), claim('claim-b', START + 1)]);
    expect(overlapping.flat()).toHaveLength(1);

    const recovered = await claim('claim-c', START + 60_001);
    expect(recovered).toEqual(['7.40']);
    const staleToken = overlapping[0]?.length === 1 ? 'claim-a' : 'claim-b';
    const fact = {
      id: 'patch:7.40:hero:0:hero:0:0',
      entityType: 'hero' as const,
      entityName: 'Axe',
      section: 'hero' as const,
      change: 'Damage: 10 to 12'
    };
    expect(
      await repo.savePatchAnalysis({
        externalId: '7.40',
        claimToken: staleToken,
        parseStatus: 'complete',
        facts: [fact]
      })
    ).toBe(false);
    expect(await repo.getUpdateDetail({ sourceKey: 'patch_notes', externalId: '7.40' })).toMatchObject({
      parseStatus: 'pending',
      facts: []
    });
    expect(
      await repo.savePatchAnalysis({
        externalId: '7.40',
        claimToken: 'claim-c',
        parseStatus: 'complete',
        facts: [fact]
      })
    ).toBe(true);
    expect(await repo.getUpdateDetail({ sourceKey: 'patch_notes', externalId: '7.40' })).toMatchObject({
      parseStatus: 'complete',
      facts: [{ entityName: 'Axe' }]
    });
  });

  it('retries unavailable patch analysis after its lease expires and allows successful recovery', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [
        {
          sourceKey: 'patch_notes',
          externalId: '7.39',
          title: 'Dota 7.39',
          sourceUrl: 'https://www.dota2.com/patches/7.39',
          publishedAt: START
        }
      ],
      detectedAt: START
    });
    expect(
      await repo.claimPendingPatchAnalyses({
        claimToken: 'failed-read',
        now: START,
        leaseUntil: START + 60_000,
        limit: 1
      })
    ).toEqual(['7.39']);
    expect(
      await repo.savePatchAnalysis({
        externalId: '7.39',
        claimToken: 'failed-read',
        parseStatus: 'unavailable',
        facts: [],
        parsedAt: START + 1
      })
    ).toBe(true);

    expect(
      await repo.claimPendingPatchAnalyses({
        claimToken: 'recovered-read',
        now: START + 60_001,
        leaseUntil: START + 120_001,
        limit: 1
      })
    ).toEqual(['7.39']);
    expect(
      await repo.savePatchAnalysis({
        externalId: '7.39',
        claimToken: 'recovered-read',
        parseStatus: 'no_recognized_facts',
        facts: [],
        parsedAt: START + 60_002
      })
    ).toBe(true);
    expect(await repo.getUpdateDetail({ sourceKey: 'patch_notes', externalId: '7.39' })).toMatchObject({
      parseStatus: 'no_recognized_facts',
      facts: []
    });
  });
});

describe('summarizeOfficialPatch', () => {
  it('groups named entities and ranks structural and combat-magnitude signals before economy/count signals', async () => {
    const fetcher: DotaSourceFetcher = {
      fetch: () => Promise.resolve(new Response('{}')),
      fetchPatchNameMaps: () =>
        Promise.resolve({
          heroes: new Map([[1, 'Test Hero']]),
          items: new Map([
            [10, 'Test Item'],
            [20, 'Neutral Item']
          ])
        }),
      fetchPatchDetails: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              patch_number: '7.41f',
              patch_name: '7.41f',
              general_notes: [{ title: 'Map changes', generic: [{ note: 'New map mechanic' }] }],
              heroes: [
                {
                  hero_id: 1,
                  hero_notes: [
                    { note: 'damage increased by 10' },
                    { note: 'movement speed adjusted' },
                    { note: 'lifesteal reduced from 30% to 25%' }
                  ]
                }
              ],
              items: [
                { ability_id: -1, title: 'Item notes', is_general_note: true, ability_notes: [{ note: 'header' }] },
                { ability_id: 10, ability_notes: [{ note: 'cost increased from 10 to 20' }] }
              ],
              neutral_items: [{ ability_id: 20, ability_notes: [{ note: 'small change' }] }],
              neutral_creeps: [
                { name: 'creep', localized_name: 'Test Creep', neutral_creep_notes: [{ note: 'small change' }] }
              ]
            })
          )
        )
    };

    const summary = await summarizeOfficialPatch(fetcher, '7.41f');

    expect(summary?.themes).toEqual([
      {
        category: 'Общие изменения',
        name: 'Map changes',
        changes: ['Добавлено: новая механика карты'],
        noteCount: 1,
        numericNoteCount: 0,
        structuralNoteCount: 1,
        relativeMagnitudeScore: 0
      },
      {
        category: 'Герой',
        name: 'Test Hero',
        changes: ['Урон: +10', 'Вампиризм: 30% → 25%'],
        noteCount: 3,
        numericNoteCount: 2,
        structuralNoteCount: 0,
        relativeMagnitudeScore: 1_667
      },
      {
        category: 'Предмет',
        name: 'Test Item',
        changes: ['Стоимость: 10 → 20'],
        noteCount: 1,
        numericNoteCount: 1,
        structuralNoteCount: 0,
        relativeMagnitudeScore: 1_000
      }
    ]);
    expect(summary?.themes.some((theme) => theme.name === 'Neutral Item')).toBe(false);
  });

  it('rejects mismatched detail versions instead of summarizing another patch', async () => {
    const fetcher: DotaSourceFetcher = {
      fetch: () => Promise.resolve(new Response('{}')),
      fetchPatchNameMaps: () => Promise.resolve({ heroes: new Map(), items: new Map() }),
      fetchPatchDetails: () =>
        Promise.resolve(new Response(JSON.stringify({ patch_number: '7.41', patch_name: '7.41', heroes: [] })))
    };
    await expect(summarizeOfficialPatch(fetcher, '7.41f')).rejects.toMatchObject({
      code: 'DOTA_PATCH_DETAIL_SHAPE'
    });
  });

  it('falls back to manual review when notes do not contain a recognized change fact', async () => {
    const fetcher: DotaSourceFetcher = {
      fetch: () => Promise.resolve(new Response('{}')),
      fetchPatchNameMaps: () =>
        Promise.resolve({
          heroes: new Map([
            [1, 'Hero One'],
            [2, 'Hero Two'],
            [3, 'Hero Three'],
            [4, 'Hero Four'],
            [5, 'Hero Five']
          ]),
          items: new Map()
        }),
      fetchPatchDetails: () =>
        Promise.resolve(
          Response.json({
            patch_number: '7.41f',
            patch_name: '7.41f',
            heroes: [
              { hero_id: 1, hero_notes: [{ note: 'Some adjusted value' }] },
              { hero_id: 2, hero_notes: [{ note: 'Different unclear detail' }] },
              { hero_id: 3, hero_notes: [{ note: 'A third unclear detail' }] },
              { hero_id: 4, hero_notes: [{ note: 'Another unclear detail' }] },
              { hero_id: 5, hero_notes: [{ note: 'One more unclear detail' }] }
            ]
          })
        )
    };

    await expect(summarizeOfficialPatch(fetcher, '7.41f')).resolves.toBeNull();
  });

  it('returns no ranked themes when a changed entity has no official name mapping', async () => {
    const fetcher: DotaSourceFetcher = {
      fetch: () => Promise.resolve(new Response('{}')),
      fetchPatchNameMaps: () => Promise.resolve({ heroes: new Map([[2, 'Other Hero']]), items: new Map() }),
      fetchPatchDetails: () =>
        Promise.resolve(
          Response.json({
            patch_number: '7.41f',
            patch_name: '7.41f',
            heroes: [{ hero_id: 1, hero_notes: [{ note: 'damage increased by 10' }] }]
          })
        )
    };

    await expect(summarizeOfficialPatch(fetcher, '7.41f')).resolves.toBeNull();
  });

  it('parses the official hero/item dictionaries into bounded ID maps', () => {
    const names = parsePatchNameMaps(
      { result: { data: { heroes: [{ id: 1, name_english_loc: 'Test Hero' }] } } },
      { result: { data: { itemabilities: [{ id: 10, name_english_loc: 'Test Item' }] } } }
    );
    expect(names.heroes.get(1)).toBe('Test Hero');
    expect(names.items.get(10)).toBe('Test Item');
    expect(() => parsePatchNameMaps({}, {})).toThrowError('DOTA_SOURCE_SHAPE_patch_notes');
  });
});

describe('processDotaUpdates', () => {
  it('analyzes an already-linked persisted patch without creating a duplicate draft', async () => {
    const db = testDb();
    const repo = createD1DotaWatcherRepository(db);
    const patchItem = (externalId: string) => ({
      ...steam(externalId),
      sourceKey: 'patch_notes' as const,
      title: `Dota ${externalId}`,
      sourceUrl: `https://www.dota2.com/patches/${externalId}`
    });
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [patchItem('7.40')],
      detectedAt: START
    });
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [patchItem('7.41')],
      detectedAt: START + 1
    });
    const draft = await createPost(
      {
        repo: createD1PostRepository(db),
        idempotency: createIdempotencyStore(db),
        now: START,
        newId: () => crypto.randomUUID()
      },
      {
        actor: '4242',
        idempotencyKey: 'existing-dota-draft',
        input: { title: 'Existing patch draft', body: '', entities: [] }
      }
    );
    await repo.reserveDraft({ sourceKey: 'patch_notes', externalId: '7.41', postId: draft.id });
    const inspectPatch = async () => ({
      summary: null,
      analysis: {
        status: 'complete' as const,
        facts: [
          {
            id: 'patch:7.41:hero:0:hero:0:0',
            entityType: 'hero' as const,
            entityName: 'Axe',
            section: 'hero' as const,
            change: 'Damage: 10 → 12'
          }
        ],
        unknownNoteCount: 0,
        unresolvedEntityCount: 0,
        truncatedFactCount: 0
      }
    });
    const setup = workflow({ inspectPatch });

    await setup.run();

    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(await repo.getUpdateDetail({ sourceKey: 'patch_notes', externalId: '7.41' })).toMatchObject({
      parseStatus: 'complete',
      facts: [{ entityName: 'Axe', change: 'Damage: 10 → 12' }]
    });
  });

  it('persists scheduled patch analysis once and keeps its identity on repeated writes', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [
        {
          sourceKey: 'patch_notes',
          externalId: '7.40',
          title: 'Dota 7.40',
          sourceUrl: 'https://www.dota2.com/patches/7.40',
          publishedAt: START - 1
        }
      ],
      detectedAt: START
    });
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [
        {
          sourceKey: 'patch_notes',
          externalId: '7.41',
          title: 'Dota 7.41',
          sourceUrl: 'https://www.dota2.com/patches/7.41',
          publishedAt: START
        }
      ],
      detectedAt: START + 1
    });
    const fact = {
      id: 'patch:7.41:hero:0:hero:0:0',
      entityType: 'hero' as const,
      entityName: 'Axe',
      section: 'hero' as const,
      change: 'Damage: 10 → 12',
      direction: 'increase' as const,
      before: '10',
      after: '12'
    };
    const setup = workflow({
      inspectPatch: async () => ({
        summary: null,
        analysis: {
          status: 'complete',
          facts: [fact],
          unknownNoteCount: 0,
          unresolvedEntityCount: 0,
          truncatedFactCount: 0
        }
      })
    });

    await setup.run();
    await repo.savePatchAnalysis({
      externalId: '7.41',
      parseStatus: 'incomplete',
      facts: [{ ...fact, change: 'Different recognized change' }],
      parsedAt: START + 99
    });

    const row = await testDb()
      .prepare('SELECT parse_status, facts_json, parsed_at FROM dota_patch_analyses WHERE external_id = ?1')
      .bind('7.41')
      .first<{ parse_status: string; facts_json: string; parsed_at: number }>();
    expect(row?.parse_status).toBe('complete');
    expect(JSON.parse(row?.facts_json ?? '[]')).toEqual([fact]);
    expect(row?.parsed_at).toBe(START + 10);
  });

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

  it('adds named, ranked patch themes to the review draft without asserting change direction', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const patchItem = (externalId: string) => ({
      ...steam(externalId),
      sourceKey: 'patch_notes' as const,
      title: `Dota ${externalId}`,
      sourceUrl: `https://www.dota2.com/patches/${externalId}`
    });
    await repo.storeSync({ items: [steam('baseline'), patchItem('baseline')], detectedAt: START });
    await repo.storeSync({ items: [patchItem('7.41f')], detectedAt: START + 1 });
    const setup = workflow({
      patchSummary: {
        patchNumber: '7.41f',
        title: '7.41f',
        themes: [
          {
            category: 'Герой',
            name: 'Crystal Maiden',
            changes: ['Перезарядка: 10 → 8'],
            noteCount: 4,
            numericNoteCount: 2,
            structuralNoteCount: 1,
            relativeMagnitudeScore: 0
          },
          {
            category: 'Предмет',
            name: 'Blink Dagger',
            changes: ['Стоимость: 10 → 20'],
            noteCount: 3,
            numericNoteCount: 1,
            structuralNoteCount: 0,
            relativeMagnitudeScore: 0
          }
        ]
      }
    });

    await setup.run();

    const post = await testDb().prepare('SELECT body FROM posts').first<{ body: string }>();
    expect(post?.body).toContain('— Герой — Crystal Maiden: Перезарядка: 10 → 8');
    expect(post?.body).toContain('— Предмет — Blink Dagger: Стоимость: 10 → 20');
    expect(post?.body).toContain('Предварительная сводка по официальным заметкам');
    expect(post?.body).not.toContain('популяр');
    expect(setup.calls).toHaveLength(1);
  });

  it('labels an unrankable patch draft for manual review instead of inventing themes', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const patchItem = (externalId: string) => ({
      ...steam(externalId),
      sourceKey: 'patch_notes' as const,
      title: `Dota ${externalId}`,
      sourceUrl: `https://www.dota2.com/patches/${externalId}`
    });
    await repo.storeSync({ items: [steam('baseline'), patchItem('baseline')], detectedAt: START });
    await repo.storeSync({ items: [patchItem('7.41f')], detectedAt: START + 1 });
    await workflow({ patchSummary: null }).run();

    const post = await testDb().prepare('SELECT body FROM posts').first<{ body: string }>();
    expect(post?.body).toContain('Автоматическая сводка не сформирована');
    expect(post?.body).toContain('проверьте изменения вручную');
    expect(post?.body).toContain('Официальный источник: https://www.dota2.com/patches/7.41f');
  });

  it('holds a patch draft during detail-feed failure and preserves the incident until details recover', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const patchItem = (externalId: string) => ({
      ...steam(externalId),
      sourceKey: 'patch_notes' as const,
      title: `Dota ${externalId}`,
      sourceUrl: `https://www.dota2.com/patches/${externalId}`
    });
    await repo.storeSync({ items: [steam('baseline'), patchItem('baseline')], detectedAt: START });
    await repo.storeSync({ items: [patchItem('7.41f')], detectedAt: START + 1 });
    const unavailable = workflow({
      messenger: null,
      summarizePatch: () => Promise.reject(new DotaPatchDetailError('DOTA_PATCH_DETAIL_SHAPE', '7.41f'))
    });

    const failed = await unavailable.run();

    expect(failed.sourceFailures).toBe(1);
    expect(await count('SELECT count(*) AS n FROM posts')).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM dota_source_incidents WHERE code = 'DOTA_PATCH_DETAIL_SHAPE' AND resolved_at IS NULL"
      )
    ).toBe(1);
    const unavailableAnalysis = await testDb()
      .prepare('SELECT parse_status, facts_json, parsed_at FROM dota_patch_analyses WHERE external_id = ?1')
      .bind('7.41f')
      .first<{ parse_status: string; facts_json: string; parsed_at: number }>();
    expect(unavailableAnalysis).toMatchObject({ parse_status: 'unavailable', facts_json: '[]' });

    const stillUnavailable = workflow({
      messenger: null,
      summarizePatch: () => Promise.reject(new DotaPatchDetailError('DOTA_PATCH_DETAIL_SHAPE', '7.41f'))
    });
    await stillUnavailable.run();
    const repeatedUnavailable = await testDb()
      .prepare('SELECT parsed_at FROM dota_patch_analyses WHERE external_id = ?1')
      .bind('7.41f')
      .first<{ parsed_at: number }>();
    expect(repeatedUnavailable?.parsed_at).toBe(unavailableAnalysis?.parsed_at);
    expect(
      await count(
        "SELECT count(*) AS n FROM dota_source_incidents WHERE code LIKE 'DOTA_PATCH_DETAIL_%' AND resolved_at IS NULL"
      )
    ).toBe(1);

    const recovered = workflow({
      patchSummary: {
        patchNumber: '7.41f',
        title: '7.41f',
        themes: [
          {
            category: 'Герой',
            name: 'Crystal Maiden',
            changes: ['Cooldown: 10 → 8'],
            noteCount: 1,
            numericNoteCount: 0,
            structuralNoteCount: 0,
            relativeMagnitudeScore: 0
          }
        ]
      }
    });
    await recovered.run();
    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM dota_source_incidents WHERE code LIKE 'DOTA_PATCH_DETAIL_%' AND resolved_at IS NOT NULL"
      )
    ).toBe(1);
    expect(recovered.calls).toHaveLength(2);
    expect(recovered.calls.some((call) => call.html.includes('восстановился'))).toBe(true);
  });

  it('does not recover one patch incident when a different patch detail succeeds in the same batch', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const patchItem = (externalId: string) => ({
      ...steam(externalId),
      sourceKey: 'patch_notes' as const,
      title: `Dota ${externalId}`,
      sourceUrl: `https://www.dota2.com/patches/${externalId}`
    });
    await repo.storeSync({ items: [steam('baseline'), patchItem('baseline')], detectedAt: START });
    await repo.storeSync({ items: [patchItem('7.41e'), patchItem('7.41f')], detectedAt: START + 1 });
    const mixed = workflow({
      messenger: null,
      summarizePatch: (version) =>
        version === '7.41e'
          ? Promise.reject(new DotaPatchDetailError('DOTA_PATCH_DETAIL_SHAPE', version))
          : Promise.resolve({
              patchNumber: version,
              title: version,
              themes: [
                {
                  category: 'Герой',
                  name: 'Crystal Maiden',
                  changes: ['Cooldown: 10 → 8'],
                  noteCount: 1,
                  numericNoteCount: 0,
                  structuralNoteCount: 0,
                  relativeMagnitudeScore: 0
                }
              ]
            })
    });

    await mixed.run();

    expect(
      await count("SELECT count(*) AS n FROM dota_source_incidents WHERE external_id = '7.41e' AND resolved_at IS NULL")
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM dota_source_incidents WHERE external_id = '7.41f' AND resolved_at IS NOT NULL"
      )
    ).toBe(0);
    expect(await count('SELECT count(*) AS n FROM posts')).toBe(1);
    expect(mixed.calls).toHaveLength(0);

    const recovered = workflow({
      patchSummary: {
        patchNumber: '7.41e',
        title: '7.41e',
        themes: [
          {
            category: 'Герой',
            name: 'Crystal Maiden',
            changes: ['Cooldown: 10 → 8'],
            noteCount: 1,
            numericNoteCount: 0,
            structuralNoteCount: 0,
            relativeMagnitudeScore: 0
          }
        ]
      }
    });
    await recovered.run();

    expect(
      await count(
        "SELECT count(*) AS n FROM dota_source_incidents WHERE external_id = '7.41e' AND resolved_at IS NOT NULL"
      )
    ).toBe(1);
    expect(await count('SELECT count(*) AS n FROM posts')).toBe(2);
    expect(recovered.calls.filter((call) => call.html.includes('восстановился'))).toHaveLength(1);
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

  it('suppresses Dota source alerts when the source preference is disabled but records the one-shot claim', async () => {
    const disabled = workflow({
      sync: sourceShapeFailure,
      readNotificationPreferences: () =>
        Promise.resolve({
          warningsEnabled: true,
          publicationAlerts: true,
          sourceAlerts: false,
          automationAlerts: true,
          recoveryAlerts: true,
          dotaWatchlistAlerts: true
        })
    });

    const result = await disabled.run();

    expect(result.sourceAlertsSent).toBe(0);
    expect(disabled.calls).toEqual([]);
    expect(
      await count('SELECT count(*) AS n FROM dota_source_incidents WHERE owner_alert_claimed_at IS NOT NULL')
    ).toBe(1);
  });

  it('suppresses a Dota recovery notice when recovery alerts are disabled', async () => {
    await workflow({ sync: sourceShapeFailure }).run();
    const disabled = workflow({
      readNotificationPreferences: () =>
        Promise.resolve({
          warningsEnabled: true,
          publicationAlerts: true,
          sourceAlerts: true,
          automationAlerts: true,
          recoveryAlerts: false,
          dotaWatchlistAlerts: true
        })
    });

    const result = await disabled.run();

    expect(result.sourceAlertsSent).toBe(0);
    expect(disabled.calls).toEqual([]);
    expect(
      await count(
        'SELECT count(*) AS n FROM dota_source_incidents WHERE resolved_at IS NOT NULL AND owner_alert_claimed_at IS NOT NULL'
      )
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

  it('persists one successful feed and records the other feed shape failure', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const fetcher: DotaSourceFetcher = {
      fetchPatchDetails: () => Promise.resolve(new Response('{}')),
      fetchPatchNameMaps: () => Promise.resolve({ heroes: new Map(), items: new Map() }),
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

    await expect(syncDotaUpdates({ fetcher, repo, detectedAt: START })).resolves.toEqual({ inserted: 0, fetched: 1 });
    const states = await testDb()
      .prepare('SELECT source_key, last_attempt_at, last_success_at FROM dota_source_state ORDER BY source_key')
      .all();
    expect(states.results).toEqual([
      { source_key: 'patch_notes', last_attempt_at: START, last_success_at: null },
      { source_key: 'steam_news', last_attempt_at: START, last_success_at: START }
    ]);
    expect(await count("SELECT count(*) AS n FROM dota_source_incidents WHERE source_key = 'patch_notes'")).toBe(1);
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
          fetchPatchDetails: () => Promise.resolve(new Response('{}')),
          fetchPatchNameMaps: () => Promise.resolve({ heroes: new Map(), items: new Map() }),
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
          },
          sendMediaWithWebAppButton: () => Promise.resolve({ ok: true })
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
