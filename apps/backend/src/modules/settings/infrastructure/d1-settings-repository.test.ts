import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { createD1SettingsRepository } from './d1-settings-repository';

beforeEach(resetDb);

const write = (expectedRevision: number, value = '{"themeMode":"dark"}') => ({
  key: 'appearance' as const,
  value,
  expectedRevision,
  actor: '4242',
  now: START,
  fields: ['themeMode']
});

async function seed(revision: number | string, value = '{"themeMode":"light"}'): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO settings (key, value, revision, updated_at, updated_by) VALUES ('appearance', ?1, ?2, ?3, '1')`
    )
    .bind(value, revision, START)
    .run();
}

async function state(): Promise<{ value: string; revision: unknown; audits: number }> {
  const row = await testDb().prepare("SELECT value, revision FROM settings WHERE key = 'appearance'").first<{
    value: string;
    revision: unknown;
  }>();
  const audits = await testDb().prepare('SELECT count(*) AS n FROM audit_log').first<{ n: number }>();
  return { value: row?.value ?? '', revision: row?.revision, audits: audits?.n ?? 0 };
}

describe('save guard (independent of any pre-read)', () => {
  it('inserts the first document at revision 1 with its audit row', async () => {
    expect(await createD1SettingsRepository(testDb()).save(write(0))).toBe('saved');

    expect(await state()).toEqual({ value: '{"themeMode":"dark"}', revision: 1, audits: 1 });
  });

  it('writes nothing when a first save finds an existing row', async () => {
    await seed(1);

    expect(await createD1SettingsRepository(testDb()).save(write(0))).toBe('not_applied');

    expect(await state()).toEqual({ value: '{"themeMode":"light"}', revision: 1, audits: 0 });
  });

  it('writes nothing when the revision does not match', async () => {
    await seed(2);

    expect(await createD1SettingsRepository(testDb()).save(write(1))).toBe('not_applied');
    expect(await createD1SettingsRepository(testDb()).save(write(3))).toBe('not_applied');

    expect(await state()).toEqual({ value: '{"themeMode":"light"}', revision: 2, audits: 0 });
  });

  it('writes nothing when the row is missing and a revision above 0 is expected', async () => {
    expect(await createD1SettingsRepository(testDb()).save(write(1))).toBe('not_applied');

    expect(await state()).toEqual({ value: '', revision: undefined, audits: 0 });
  });

  it('updates a matching revision exactly once when two saves race', async () => {
    await seed(1);
    const repo = createD1SettingsRepository(testDb());

    const outcomes = await Promise.all([repo.save(write(1, '{"a":1}')), repo.save(write(1, '{"b":2}'))]);

    expect([...outcomes].sort()).toEqual(['not_applied', 'saved']);
    expect((await state()).revision).toBe(2);
    expect((await state()).audits).toBe(1);
  });

  it.each([1.5, 'abc', 1e300])(
    'treats a revision of %s as revision 1 and stores an integer afterwards',
    async (bad) => {
      await seed(bad);
      const repo = createD1SettingsRepository(testDb());

      expect(await repo.save(write(2))).toBe('not_applied');
      expect(await repo.save(write(1))).toBe('saved');

      expect(await state()).toEqual({ value: '{"themeMode":"dark"}', revision: 2, audits: 1 });
    }
  );
});
