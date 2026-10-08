import { type DashboardLayoutDto, dashboardLayoutSchema, DASHBOARD_WIDGETS_MAX } from '@alexeev/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { count } from '../helpers/publishing';

const PATH = '/api/v1/settings/dashboard-layout';

let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  api = createApi({ clock: fakeClock() });
});

const get = () => api.request(PATH);
const put = (json: unknown) => api.request(PATH, { method: 'PUT', json });
const parsed = async (response: Response): Promise<DashboardLayoutDto> =>
  dashboardLayoutSchema.parse(await response.json());

const widget = (id: string, x: number, y: number, w = 3, h = 2, type = 'today') => ({ id, type, x, y, w, h });
const widgets = [widget('a', 0, 0), widget('b', 3, 0), widget('c', 0, 2, 12)];
const valid = { revision: 0, widgets };

describe('GET /api/v1/settings/dashboard-layout', () => {
  it('answers an empty layout at revision 0 when nothing was saved, without writing', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 0, widgets: [] });
    expect(await count('dashboard_layout')).toBe(0);
  });

  it('answers the stored layout with its revision', async () => {
    await put(valid);

    expect(await parsed(await get())).toEqual({ revision: 1, widgets });
  });

  it('keeps an empty saved layout empty at its revision', async () => {
    await put({ revision: 0, widgets: [] });

    expect(await get().then((r) => r.json())).toEqual({ revision: 1, widgets: [] });
  });

  it.each([
    ['not JSON-shaped as a widget list', '{"a":1}'],
    ['an unknown widget type', '[{"id":"a","type":"nope","x":0,"y":0,"w":1,"h":1}]'],
    ['overlapping widgets', JSON.stringify([widget('a', 0, 0), widget('b', 1, 1)])]
  ])(
    'answers an empty layout at the stored revision for a stored value that is %s, and a save repairs it',
    async (_n, value) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await testDb()
        .prepare(`INSERT INTO dashboard_layout (id, value, revision, updated_at, updated_by) VALUES (1, ?1, 3, ?2, ?3)`)
        .bind(value, START, OWNER_ID)
        .run();

      expect(await (await get()).json()).toEqual({ revision: 3, widgets: [] });
      expect(
        log.mock.calls.filter(([line]) => typeof line === 'string' && line.includes('SETTINGS_CORRUPT'))
      ).toHaveLength(1);

      expect((await put({ revision: 3, widgets })).status).toBe(200);
      expect(await parsed(await get())).toEqual({ revision: 4, widgets });
      log.mockRestore();
    }
  );
});

describe('PUT /api/v1/settings/dashboard-layout', () => {
  it('saves the first layout, bumps the revision and writes one audit row', async () => {
    const response = await put(valid);

    expect(response.status).toBe(200);
    expect(await parsed(response)).toEqual({ revision: 1, widgets });
    const audit = await testDb()
      .prepare('SELECT actor_telegram_id, action, entity_type, entity_id, details FROM audit_log')
      .all();
    expect(audit.results).toEqual([
      {
        actor_telegram_id: OWNER_ID,
        action: 'settings.dashboard_layout.update',
        entity_type: 'settings',
        entity_id: 'dashboard-layout',
        details: '{"revision":1,"widgets":3}'
      }
    ]);
    expect(await testDb().prepare('SELECT updated_by, revision, updated_at FROM dashboard_layout').first()).toEqual({
      updated_by: OWNER_ID,
      revision: 1,
      updated_at: START
    });
  });

  it('bumps the revision on every save', async () => {
    await put(valid);
    api.clock.advance(1_000);

    const second = await put({ revision: 1, widgets: [widget('a', 6, 0)] });

    expect(await parsed(second)).toEqual({ revision: 2, widgets: [widget('a', 6, 0)] });
    expect(await parsed(await get())).toEqual({ revision: 2, widgets: [widget('a', 6, 0)] });
    expect(await count('audit_log')).toBe(2);
  });

  it('answers 409 STALE_REVISION for an old or future revision and changes nothing', async () => {
    await put(valid);

    await expectError(await put({ revision: 0, widgets: [] }), 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    await expectError(await put({ revision: 5, widgets: [] }), 409, 'CONFLICT', { reason: 'STALE_REVISION' });

    expect(await parsed(await get())).toEqual({ revision: 1, widgets });
    expect(await count('audit_log')).toBe(1);
  });

  it('lets exactly one of two concurrent first saves win', async () => {
    const [first, second] = await Promise.all([put(valid), put({ revision: 0, widgets: [widget('z', 0, 0)] })]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
    await expectError(first.status === 409 ? first : second, 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    expect(await count('dashboard_layout')).toBe(1);
    expect(await count('audit_log')).toBe(1);
    expect((await parsed(await get())).revision).toBe(1);
  });

  it('lets exactly one of two concurrent updates of the same revision win', async () => {
    await put(valid);

    const [first, second] = await Promise.all([
      put({ revision: 1, widgets: [widget('x', 0, 0)] }),
      put({ revision: 1, widgets: [widget('y', 0, 0)] })
    ]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
    expect((await parsed(await get())).revision).toBe(2);
    expect(await count('audit_log')).toBe(2);
  });

  it('accepts exactly 40 widgets and rejects 41', async () => {
    const grid = (n: number) => Array.from({ length: n }, (_, i) => widget(`w${i}`, i % 12, Math.floor(i / 12), 1, 1));

    await expectError(await put({ revision: 0, widgets: grid(DASHBOARD_WIDGETS_MAX + 1) }), 400, 'VALIDATION_ERROR');
    expect(await count('dashboard_layout')).toBe(0);
    expect((await put({ revision: 0, widgets: grid(DASHBOARD_WIDGETS_MAX) })).status).toBe(200);
  });

  it('accepts widgets that touch edge to edge', async () => {
    const touching = [widget('a', 0, 0, 6, 2), widget('b', 6, 0, 6, 2), widget('c', 0, 2, 12, 12)];

    expect((await put({ revision: 0, widgets: touching })).status).toBe(200);
  });

  it('answers 400 WIDGETS_OVERLAP for overlapping rectangles', async () => {
    await expectError(
      await put({ revision: 0, widgets: [widget('a', 0, 0, 4, 4), widget('b', 3, 3, 4, 4)] }),
      400,
      'VALIDATION_ERROR',
      {
        reason: 'WIDGETS_OVERLAP'
      }
    );
    expect(await count('dashboard_layout')).toBe(0);
  });

  it('answers 400 DUPLICATE_WIDGET_ID for a repeated id', async () => {
    await expectError(
      await put({ revision: 0, widgets: [widget('a', 0, 0), widget('a', 6, 0)] }),
      400,
      'VALIDATION_ERROR',
      {
        reason: 'DUPLICATE_WIDGET_ID'
      }
    );
  });

  it('answers 400 OUT_OF_GRID when x + w passes the 12 columns', async () => {
    await expectError(await put({ revision: 0, widgets: [widget('a', 10, 0, 3)] }), 400, 'VALIDATION_ERROR', {
      reason: 'OUT_OF_GRID'
    });
  });

  it.each([
    ['x over 11', widget('a', 12, 0, 1)],
    ['a negative x', widget('a', -1, 0)],
    ['y over 199', widget('a', 0, 200)],
    ['a zero width', widget('a', 0, 0, 0)],
    ['a width over 12', widget('a', 0, 0, 13)],
    ['a zero height', widget('a', 0, 0, 1, 0)],
    ['a height over 12', widget('a', 0, 0, 1, 13)],
    ['a fractional x', widget('a', 0.5, 0)],
    ['an unknown type', widget('a', 0, 0, 1, 1, 'chart')],
    ['an uppercase id', widget('A', 0, 0)],
    ['an id with a space', widget('a b', 0, 0)],
    ['an empty id', widget('', 0, 0)],
    ['an id over 40 characters', widget('a'.repeat(41), 0, 0)],
    ['an unknown key', { ...widget('a', 0, 0), extra: 1 }]
  ])('answers 400 VALIDATION_ERROR for %s', async (_name, bad) => {
    await expectError(await put({ revision: 0, widgets: [bad] }), 400, 'VALIDATION_ERROR');
    expect(await count('dashboard_layout')).toBe(0);
  });

  it.each([
    ['a negative revision', { revision: -1, widgets: [] }],
    ['a fractional revision', { revision: 0.5, widgets: [] }],
    ['a missing widgets list', { revision: 0 }],
    ['an unknown top-level key', { revision: 0, widgets: [], extra: true }]
  ])('answers 400 VALIDATION_ERROR for %s', async (_name, body) => {
    await expectError(await put(body), 400, 'VALIDATION_ERROR');
  });

  it('answers 413 for a body over 8 KB', async () => {
    await expectError(await put({ ...valid, padding: 'x'.repeat(9 * 1024) }), 413, 'VALIDATION_ERROR');
  });

  it('stores the largest allowed layout inside the value limit', async () => {
    const biggest = Array.from({ length: DASHBOARD_WIDGETS_MAX }, (_, i) =>
      widget(`${'a'.repeat(30)}-${String(i).padStart(9, '0')}`, i % 12, Math.floor(i / 12), 1, 1, 'quick-actions')
    );

    expect((await put({ revision: 0, widgets: biggest })).status).toBe(200);
    expect((await parsed(await get())).widgets).toHaveLength(DASHBOARD_WIDGETS_MAX);
  });
});

describe('authorization', () => {
  it.each([
    ['GET', undefined],
    ['PUT', valid]
  ])('%s answers 401 without a token and 403 for another user', async (method, json) => {
    await seedSession({ token: 'stranger-token-0000000000000000000000000', telegramId: '777' });

    await expectError(await api.request(PATH, { method, token: null, json }), 401, 'UNAUTHORIZED');
    await expectError(
      await api.request(PATH, { method, token: 'stranger-token-0000000000000000000000000', json }),
      403,
      'FORBIDDEN'
    );
    expect(await count('dashboard_layout')).toBe(0);
  });
});
