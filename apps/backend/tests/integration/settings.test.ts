import {
  type AppearanceDto,
  BACKGROUND_DEFAULTS,
  appearanceSchema,
  CUSTOM_PRESETS_MAX,
  ownerOperationsSettingsSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { count } from '../helpers/publishing';

const PATH = '/api/v1/settings/appearance';
const OPERATIONS_PATH = '/api/v1/settings/operations';
const ID_A = '0b8a4c1e-5f6d-4a7b-9c2d-1e3f4a5b6c7d';
const ID_B = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  api = createApi({ clock: fakeClock() });
});

const get = () => api.request(PATH);
const put = (json: unknown) => api.request(PATH, { method: 'PUT', json });
const valid = {
  revision: 0,
  themeMode: 'dark',
  lightAccent: { kind: 'preset', id: 'indigo' },
  darkAccent: { kind: 'custom', id: ID_A },
  customPresets: [{ id: ID_A, name: 'Sea', baseColor: '#112233' }]
};
const parsed = async (response: Response): Promise<AppearanceDto> => appearanceSchema.parse(await response.json());

async function seedRawRow(value: string, revision: number | string, updatedAt: number | string): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO settings (key, value, revision, updated_at, updated_by) VALUES ('appearance', ?1, ?2, ?3, ?4)`
    )
    .bind(value, revision, updatedAt, OWNER_ID)
    .run();
}

function corruptLogs(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(([line]) => typeof line === 'string' && line.includes('SETTINGS_CORRUPT')).length;
}

describe('GET /api/v1/settings/appearance', () => {
  it('answers the defaults at revision 0 when nothing was saved, without writing', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(await parsed(response)).toEqual({
      themeMode: 'system',
      lightAccent: { kind: 'preset', id: 'cobalt' },
      darkAccent: { kind: 'preset', id: 'cobalt' },
      customPresets: [],
      revision: 0,
      updatedAt: null
    });
    expect(await count('settings')).toBe(0);
  });

  it('answers the stored document with its revision and time', async () => {
    await put(valid);

    const stored = await parsed(await get());

    expect(stored).toMatchObject({ ...valid, revision: 1, updatedAt: new Date(START).toISOString() });
  });

  it('answers the defaults at the stored revision for a corrupt row, so a normal save repairs it', async () => {
    await testDb()
      .prepare(
        `INSERT INTO settings (key, value, revision, updated_at, updated_by) VALUES ('appearance', '{"themeMode":"neon"}', 3, ?1, ?2)`
      )
      .bind(START, OWNER_ID)
      .run();

    const read = await parsed(await get());
    expect(read).toMatchObject({ themeMode: 'system', customPresets: [], revision: 3 });

    const repaired = await put({ ...valid, revision: 3 });
    expect(repaired.status).toBe(200);
    expect(await parsed(await get())).toMatchObject({ ...valid, revision: 4 });
  });
});

describe('GET and PUT /api/v1/settings/operations', () => {
  const validOperations = {
    revision: 0,
    timezone: 'Europe/Chisinau',
    notifications: {
      warningsEnabled: true,
      publicationAlerts: true,
      sourceAlerts: true,
      automationAlerts: true,
      recoveryAlerts: true,
      dotaWatchlistAlerts: true
    }
  };
  const operations = async () => ownerOperationsSettingsSchema.parse(await (await api.request(OPERATIONS_PATH)).json());

  it('answers timezone and notification defaults without writing a row', async () => {
    expect(await operations()).toEqual({
      timezone: 'Europe/Moscow',
      notifications: {
        warningsEnabled: true,
        publicationAlerts: true,
        sourceAlerts: true,
        automationAlerts: true,
        recoveryAlerts: true,
        dotaWatchlistAlerts: true,
        // Only errors reach the bot unless the owner switches these on (owner, 22.10.2026).
        scheduleNotices: false,
        sentNotices: false,
        dailyReport: false,
        dailyReportHour: 9,
        // Each notice its own switch, on as before (owner, 25.10.2026).
        draftOffers: true,
        weeklyReport: true,
        contentAlerts: true,
        aiReviews: true,
        scriptPrompts: true,
        aiLearning: true
      },
      // Off until the owner picks a channel and switches it on (owner, 22.10.2026).
      autopublish: { enabled: false, destinationId: null, dailyLimit: 3 },
      // DEV only: every background job off until switched on.
      background: BACKGROUND_DEFAULTS,
      revision: 0,
      updatedAt: null
    });
    expect(await count('settings')).toBe(0);
  });

  it('saves the complete document and refuses a stale revision without another audit', async () => {
    const first = await api.request(OPERATIONS_PATH, { method: 'PUT', json: validOperations });
    expect(first.status).toBe(200);
    expect(ownerOperationsSettingsSchema.parse(await first.json())).toMatchObject({
      ...validOperations,
      revision: 1,
      updatedAt: new Date(START).toISOString()
    });

    const stale = await api.request(OPERATIONS_PATH, { method: 'PUT', json: validOperations });
    await expectError(stale, 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    expect(await count('audit_log')).toBe(1);
  });
});

describe('rows that cannot be represented by the contract', () => {
  const GOOD_DOCUMENT = JSON.stringify({
    themeMode: 'dark',
    lightAccent: { kind: 'preset', id: 'indigo' },
    darkAccent: { kind: 'preset', id: 'mono' },
    customPresets: []
  });

  it.each([
    ['text', 'garbage'],
    ['a huge number', 1e300],
    ['a time before the Date range', -9e15]
  ])('answers defaults with updatedAt null for updated_at = %s and a PUT repairs the row', async (_name, bad) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await seedRawRow(GOOD_DOCUMENT, 3, bad);

    const read = await get();
    expect(read.status).toBe(200);
    expect(await parsed(read)).toMatchObject({ themeMode: 'system', revision: 3, updatedAt: null });
    expect(corruptLogs(log)).toBe(1);

    const repaired = await put({ ...valid, revision: 3 });
    expect(repaired.status).toBe(200);
    expect(await parsed(await get())).toMatchObject({
      ...valid,
      revision: 4,
      updatedAt: new Date(START).toISOString()
    });
    log.mockRestore();
  });

  it.each([
    ['a fraction', 1.5],
    ['text', 'abc'],
    ['a number beyond the safe integers', 1e300]
  ])('answers defaults at revision 1 for revision = %s and a PUT at revision 1 repairs the row', async (_name, bad) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await seedRawRow(GOOD_DOCUMENT, bad, START);

    const read = await get();
    expect(read.status).toBe(200);
    expect(await parsed(read)).toMatchObject({ themeMode: 'system', revision: 1 });
    expect(corruptLogs(log)).toBe(1);

    const repaired = await put({ ...valid, revision: 1 });
    expect(repaired.status).toBe(200);
    expect(await parsed(repaired)).toMatchObject({ ...valid, revision: 2 });
    const row = await testDb().prepare('SELECT typeof(revision) AS kind, revision FROM settings').first();
    expect(row).toEqual({ kind: 'integer', revision: 2 });
    expect(await count('audit_log')).toBe(1);
    log.mockRestore();
  });

  it('keeps answering 409 for a stale revision on such a row', async () => {
    await seedRawRow(GOOD_DOCUMENT, 1.5, START);

    await expectError(await put({ ...valid, revision: 2 }), 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    await expectError(await put({ ...valid, revision: 0 }), 409, 'CONFLICT', { reason: 'STALE_REVISION' });
  });

  it.each([
    ['an array', '[1,2]'],
    ['null', 'null'],
    ['a number', '7'],
    ['an object with unknown fields', '{"themeMode":"dark","extra":1}']
  ])('answers defaults at the stored revision when the stored value is %s', async (_name, value) => {
    await seedRawRow(value, 2, START);

    expect(await parsed(await get())).toMatchObject({ themeMode: 'system', customPresets: [], revision: 2 });
    expect((await put({ ...valid, revision: 2 })).status).toBe(200);
  });
});

describe('PUT /api/v1/settings/appearance', () => {
  it('saves the first document, bumps the revision and writes one audit row', async () => {
    const response = await put(valid);

    expect(response.status).toBe(200);
    expect(await parsed(response)).toMatchObject({ ...valid, revision: 1, updatedAt: new Date(START).toISOString() });
    const audit = await testDb()
      .prepare('SELECT actor_telegram_id, action, entity_type, entity_id, details FROM audit_log')
      .all();
    expect(audit.results).toEqual([
      {
        actor_telegram_id: OWNER_ID,
        action: 'settings.appearance.update',
        entity_type: 'settings',
        entity_id: 'appearance',
        details: '{"revision":1,"fields":["themeMode","lightAccent","darkAccent","customPresets"]}'
      }
    ]);
    const row = await testDb().prepare('SELECT updated_by, revision FROM settings').first();
    expect(row).toEqual({ updated_by: OWNER_ID, revision: 1 });
  });

  it('bumps the revision on every save and audits only the changed fields', async () => {
    await put(valid);
    api.clock.advance(1_000);

    const second = await put({ ...valid, revision: 1, themeMode: 'light' });

    expect(await parsed(second)).toMatchObject({ themeMode: 'light', revision: 2 });
    const audit = await testDb().prepare('SELECT details FROM audit_log ORDER BY id').all();
    expect(audit.results.map((row) => row.details)).toEqual([
      '{"revision":1,"fields":["themeMode","lightAccent","darkAccent","customPresets"]}',
      '{"revision":2,"fields":["themeMode"]}'
    ]);
  });

  it('answers 409 STALE_REVISION for an old revision and changes nothing', async () => {
    await put(valid);

    await expectError(await put({ ...valid, revision: 0, themeMode: 'light' }), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });
    await expectError(await put({ ...valid, revision: 5 }), 409, 'CONFLICT', { reason: 'STALE_REVISION' });

    expect(await parsed(await get())).toMatchObject({ themeMode: 'dark', revision: 1 });
    expect(await count('audit_log')).toBe(1);
  });

  it('lets exactly one of two concurrent first saves win', async () => {
    const [first, second] = await Promise.all([put(valid), put({ ...valid, themeMode: 'light' })]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    await expectError(loser, 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    expect(await count('settings')).toBe(1);
    expect(await count('audit_log')).toBe(1);
    expect((await parsed(await get())).revision).toBe(1);
  });

  it('lets exactly one of two concurrent updates of the same revision win', async () => {
    await put(valid);

    const [first, second] = await Promise.all([
      put({ ...valid, revision: 1, themeMode: 'light' }),
      put({ ...valid, revision: 1, themeMode: 'system' })
    ]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
    expect((await parsed(await get())).revision).toBe(2);
    expect(await count('audit_log')).toBe(2);
  });

  it('lowercases the hex color', async () => {
    const response = await put({
      ...valid,
      customPresets: [{ id: ID_A, name: 'Sea', baseColor: '#AABBCC' }]
    });

    expect((await parsed(response)).customPresets[0]?.baseColor).toBe('#aabbcc');
    expect((await parsed(await get())).customPresets[0]?.baseColor).toBe('#aabbcc');
  });

  it('answers 400 UNKNOWN_CUSTOM_PRESET when an accent points to a missing custom preset', async () => {
    await expectError(await put({ ...valid, darkAccent: { kind: 'custom', id: ID_B } }), 400, 'VALIDATION_ERROR', {
      reason: 'UNKNOWN_CUSTOM_PRESET'
    });
    expect(await count('settings')).toBe(0);
  });

  it('answers 400 DUPLICATE_PRESET_ID for two presets with one id', async () => {
    const presets = [
      { id: ID_A, name: 'Sea', baseColor: '#112233' },
      { id: ID_A, name: 'Sky', baseColor: '#445566' }
    ];

    await expectError(await put({ ...valid, customPresets: presets }), 400, 'VALIDATION_ERROR', {
      reason: 'DUPLICATE_PRESET_ID'
    });
    expect(await count('settings')).toBe(0);
  });

  it('accepts exactly 10 presets and rejects 11', async () => {
    const presets = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `Preset ${i}`,
        baseColor: '#102030'
      }));
    const body = (n: number) => ({
      ...valid,
      lightAccent: { kind: 'preset', id: 'mono' },
      darkAccent: { kind: 'preset', id: 'mono' },
      customPresets: presets(n)
    });

    await expectError(await put(body(CUSTOM_PRESETS_MAX + 1)), 400, 'VALIDATION_ERROR');
    expect((await put(body(CUSTOM_PRESETS_MAX))).status).toBe(200);
  });

  it.each([
    ['a bad hex color', { customPresets: [{ id: ID_A, name: 'Sea', baseColor: '#12345' }] }],
    ['a color without #', { customPresets: [{ id: ID_A, name: 'Sea', baseColor: '112233' }] }],
    ['an empty name', { customPresets: [{ id: ID_A, name: '  ', baseColor: '#112233' }] }],
    ['an unknown theme mode', { themeMode: 'neon' }],
    ['an unknown preset id', { lightAccent: { kind: 'preset', id: 'pink' } }],
    ['an unknown key', { extra: true }],
    ['a negative revision', { revision: -1 }]
  ])('answers 400 VALIDATION_ERROR for %s', async (_name, patch) => {
    await expectError(await put({ ...valid, ...patch }), 400, 'VALIDATION_ERROR');
    expect(await count('settings')).toBe(0);
  });

  it.each([
    ['a name over 40 characters', { customPresets: [{ id: ID_A, name: 'n'.repeat(41), baseColor: '#112233' }] }],
    ['a control character in the name', { customPresets: [{ id: ID_A, name: 'Se\u0007a', baseColor: '#112233' }] }],
    ['a NUL in the name', { customPresets: [{ id: ID_A, name: 'Se\u0000a', baseColor: '#112233' }] }],
    ['an unknown key inside a preset', { customPresets: [{ id: ID_A, name: 'Sea', baseColor: '#112233', extra: 1 }] }],
    ['an unknown key inside an accent', { lightAccent: { kind: 'preset', id: 'indigo', extra: 1 } }]
  ])('answers 400 VALIDATION_ERROR for %s', async (_name, patch) => {
    await expectError(await put({ ...valid, ...patch }), 400, 'VALIDATION_ERROR');
    expect(await count('settings')).toBe(0);
  });

  it('accepts a name of exactly 40 characters', async () => {
    const name = 'n'.repeat(40);

    const response = await put({ ...valid, customPresets: [{ id: ID_A, name, baseColor: '#112233' }] });

    expect((await parsed(response)).customPresets[0]?.name).toBe(name);
  });

  it('answers 413 for a body over 8 KB', async () => {
    await expectError(await put({ ...valid, padding: 'x'.repeat(9 * 1024) }), 413, 'VALIDATION_ERROR');
  });
});

describe('authorization', () => {
  const routes: [string, string][] = [
    ['GET', PATH],
    ['PUT', PATH]
  ];

  it.each(routes)('%s %s answers 401 without a token and 403 for another user', async (method, path) => {
    await seedSession({ token: 'stranger-token-0000000000000000000000000', telegramId: '777' });

    await expectError(
      await api.request(path, { method, token: null, json: method === 'PUT' ? valid : undefined }),
      401,
      'UNAUTHORIZED'
    );
    await expectError(
      await api.request(path, {
        method,
        token: 'stranger-token-0000000000000000000000000',
        json: method === 'PUT' ? valid : undefined
      }),
      403,
      'FORBIDDEN'
    );
    expect(await count('settings')).toBe(0);
  });
});
