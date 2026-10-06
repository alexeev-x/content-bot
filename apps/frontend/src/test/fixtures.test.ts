import {
  accessTokenSchema,
  apiErrorCodeSchema,
  apiErrorSchema,
  destinationSchema,
  meSchema,
  postSchema,
  publicationSchema,
  publicationStatusSchema,
  telegramWidgetSignInInputSchema
} from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { accessToken, destination, errorBody, me, post, publication, widgetUser } from './fixtures';

describe('fixtures match the contract schemas', () => {
  it('parses every DTO fixture', () => {
    expect(accessTokenSchema.safeParse(accessToken()).success).toBe(true);
    expect(meSchema.safeParse(me).success).toBe(true);
    expect(postSchema.safeParse(post()).success).toBe(true);
    expect(postSchema.safeParse(post({ status: 'approved', revision: 1 })).success).toBe(true);
    expect(destinationSchema.safeParse(destination()).success).toBe(true);
    expect(publicationSchema.safeParse(publication()).success).toBe(true);
  });

  it('parses a publication in every status', () => {
    for (const status of publicationStatusSchema.options) {
      const dto = publication({ status, ...(status === 'sent' ? { externalMessageId: '42' } : {}) });
      expect(publicationSchema.safeParse(dto).success, status).toBe(true);
    }
  });

  it('keeps the widget fixture valid, with its extra field', () => {
    const parsed = telegramWidgetSignInInputSchema.safeParse(widgetUser);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ language_code: 'ru' });
  });

  it('builds contract error bodies for every error code', () => {
    for (const code of apiErrorCodeSchema.options) {
      expect(apiErrorSchema.safeParse(errorBody(code, { reason: 'X' })).success, code).toBe(true);
    }
  });
});
