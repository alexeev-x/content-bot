import { describe, expect, it } from 'vitest';
import { classifyApiError } from './error-kind';
import { ApiError } from './http-client';

const make = (code: ApiError['code'], status: number, reason: string) =>
  new ApiError({ code, status, message: 'm', details: { reason } });

describe('classifyApiError reason pairing', () => {
  it('ignores a reason that the code does not document', () => {
    expect(classifyApiError(make('UNAUTHORIZED', 401, 'STALE_REVISION'))).toBe('unauthorized');
    expect(classifyApiError(make('CONFLICT', 409, 'SCHEDULE_OUT_OF_RANGE'))).toBe('conflict');
    expect(classifyApiError(make('FORBIDDEN', 403, 'NOT_CANCELLABLE'))).toBe('forbidden');
    expect(classifyApiError(make('NOT_FOUND', 404, 'STALE_REVISION'))).toBe('not_found');
  });

  it('refines a documented pairing', () => {
    expect(classifyApiError(make('CONFLICT', 409, 'STALE_REVISION'))).toBe('stale_revision');
    expect(classifyApiError(make('NOT_FOUND', 404, 'POST_NOT_FOUND'))).toBe('post_not_found');
    expect(classifyApiError(make('VALIDATION_ERROR', 400, 'EMPTY_BODY'))).toBe('empty_body');
  });
});
