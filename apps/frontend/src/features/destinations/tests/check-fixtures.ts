import type { DestinationCheckDto } from '@alexeev/contracts';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { errorBody } from '../../../test/fixtures';

const CHECK_URL = '*/api/v1/destinations/check';

export const checkDto = (overrides: Partial<DestinationCheckDto> = {}): DestinationCheckDto => ({
  chatId: '-1009876543210',
  username: 'my_channel',
  title: 'Мой канал',
  kind: 'channel',
  botCanPost: true,
  problem: null,
  alreadyAddedId: null,
  ...overrides
});

/** Every documented outcome of POST /api/v1/destinations/check, as an MSW handler. */
export const checkOutcomes = {
  ok: () => http.post(CHECK_URL, () => HttpResponse.json(checkDto())),
  notMember: () =>
    http.post(CHECK_URL, () => HttpResponse.json(checkDto({ botCanPost: false, problem: 'BOT_NOT_MEMBER' }))),
  notAdmin: () =>
    http.post(CHECK_URL, () => HttpResponse.json(checkDto({ botCanPost: false, problem: 'BOT_NOT_ADMIN' }))),
  cannotPost: () =>
    http.post(CHECK_URL, () => HttpResponse.json(checkDto({ botCanPost: false, problem: 'BOT_CANNOT_POST' }))),
  alreadyAdded: (id: string) => http.post(CHECK_URL, () => HttpResponse.json(checkDto({ alreadyAddedId: id }))),
  chatNotFound: () =>
    http.post(CHECK_URL, () =>
      HttpResponse.json(errorBody('NOT_FOUND', { reason: 'CHAT_NOT_FOUND' }), { status: 404 })
    ),
  notAChannel: () =>
    http.post(CHECK_URL, () =>
      HttpResponse.json(errorBody('VALIDATION_ERROR', { reason: 'NOT_A_CHANNEL_OR_GROUP' }), { status: 400 })
    ),
  rateLimited: (retryAfterSeconds: number) =>
    http.post(CHECK_URL, () =>
      HttpResponse.json(errorBody('RATE_LIMIT'), {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) }
      })
    ),
  unavailable: () => http.post(CHECK_URL, () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }))
} satisfies Record<string, (...args: never[]) => HttpHandler>;
