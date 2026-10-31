import { RUBRIC_KEYS, rubricSampleKeySchema } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { DEGRADATION_CODES } from './degradations';
import { RUBRIC_META } from './meta';

// The scheduler plans from this table alone: a wrong row posts a rubric at the wrong time or breaks an owner's rule.

describe('RUBRIC_META', () => {
  it('has one row per rubric key, numbered 1–30 in the owner order', () => {
    expect(Object.keys(RUBRIC_META)).toEqual([...RUBRIC_KEYS]);
    expect(rubricSampleKeySchema.options).toEqual([...RUBRIC_KEYS]);
    expect(RUBRIC_KEYS.map((key) => RUBRIC_META[key].number)).toEqual(RUBRIC_KEYS.map((_, index) => index + 1));
  });

  it('keeps rest within 7–60 days for pool rubrics and none for chain and event ones', () => {
    for (const key of RUBRIC_KEYS) {
      const meta = RUBRIC_META[key];
      if (meta.trigger === 'chain') expect(meta.restDays, key).toBeNull();
      if (meta.trigger === 'pool') expect(meta.restDays, key).toBeGreaterThanOrEqual(7);
      if (meta.restDays !== null) expect(meta.restDays, key).toBeLessThanOrEqual(60);
    }
  });

  it('stores every pairing rule on both sides', () => {
    for (const key of RUBRIC_KEYS) {
      const meta = RUBRIC_META[key];
      for (const other of meta.sameDay) expect(RUBRIC_META[other].sameDay, `${key}↔${other}`).toContain(key);
      for (const other of meta.sameWeek ?? [])
        expect(RUBRIC_META[other].sameWeek ?? [], `${key}↔${other}`).toContain(key);
      for (const { key: other, days } of meta.apart ?? [])
        expect(RUBRIC_META[other].apart ?? [], `${key}↔${other}`).toContainEqual({ key, days });
      expect(meta.sameDay, key).not.toContain(key);
    }
  });

  it('names each bank after its rubric and allows only known degradations', () => {
    for (const key of RUBRIC_KEYS) {
      const meta = RUBRIC_META[key];
      if (meta.bank !== undefined) expect(meta.bank.name, key).toBe(key);
      for (const code of meta.allowDegrade) expect(DEGRADATION_CODES, key).toContain(code);
    }
  });
});
