import { describe, expect, it } from 'vitest';
import {
  manualObservationInputSchema,
  manualObservationQuerySchema,
  publicationAnalyticsQuerySchema
} from '../src/analytics';

describe('publication analytics query', () => {
  const valid = {
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-10-01T00:00:00.000Z'
  };

  it('defaults to destination comparison and the standard page size', () => {
    expect(publicationAnalyticsQuerySchema.parse(valid)).toMatchObject({
      comparison: 'destination',
      limit: 20
    });
  });

  it('accepts supported filters and media comparison', () => {
    expect(
      publicationAnalyticsQuerySchema.parse({
        ...valid,
        destinationId: '00000000-0000-4000-8000-000000000001',
        mediaKind: 'video',
        outcome: 'unknown',
        comparison: 'media',
        cursor: 'opaque-cursor',
        limit: '50'
      })
    ).toMatchObject({ comparison: 'media', mediaKind: 'video', outcome: 'unknown', limit: 50 });
  });

  it('rejects empty, reversed, and overlong reporting intervals', () => {
    expect(publicationAnalyticsQuerySchema.safeParse({ ...valid, to: valid.from }).success).toBe(false);
    expect(publicationAnalyticsQuerySchema.safeParse({ ...valid, from: valid.to, to: valid.from }).success).toBe(false);
    expect(
      publicationAnalyticsQuerySchema.safeParse({
        from: '2025-01-01T00:00:00.000Z',
        to: '2026-01-03T00:00:00.000Z'
      }).success
    ).toBe(false);
  });

  it('rejects unsupported query properties and malformed filters', () => {
    expect(publicationAnalyticsQuerySchema.safeParse({ ...valid, rubric: 'news' }).success).toBe(false);
    expect(publicationAnalyticsQuerySchema.safeParse({ ...valid, outcome: 'retry_wait' }).success).toBe(false);
    expect(publicationAnalyticsQuerySchema.safeParse({ ...valid, comparison: 'rubric' }).success).toBe(false);
  });
});

describe('manual analytics observations', () => {
  const valid = {
    publicationId: '00000000-0000-4000-8000-000000000001',
    metric: 'views',
    value: 0,
    contentAgeMinutes: 1440,
    sourceLabel: 'Telegram Statistics',
    coverage: 'complete'
  } as const;

  it('accepts explicit zero values and bounded standard content ages', () => {
    expect(manualObservationInputSchema.parse(valid)).toMatchObject({ value: 0, contentAgeMinutes: 1440 });
    expect(manualObservationInputSchema.safeParse({ ...valid, contentAgeMinutes: 1441 }).success).toBe(false);
  });

  it('requires an explanation for partial coverage and rejects unknown fields', () => {
    expect(manualObservationInputSchema.safeParse({ ...valid, coverage: 'partial' }).success).toBe(false);
    expect(
      manualObservationInputSchema.safeParse({ ...valid, coverage: 'partial', coverageNote: 'Some posts unavailable' })
        .success
    ).toBe(true);
    expect(manualObservationInputSchema.safeParse({ ...valid, guessed: true }).success).toBe(false);
  });

  it('bounds observation filters and rejects a content age outside the supported set', () => {
    expect(manualObservationQuerySchema.parse({ metric: 'reactions', contentAgeMinutes: '4320' })).toMatchObject({
      metric: 'reactions',
      contentAgeMinutes: 4320,
      limit: 20
    });
    expect(manualObservationQuerySchema.safeParse({ contentAgeMinutes: 120 }).success).toBe(false);
  });
});
