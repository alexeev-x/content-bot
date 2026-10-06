import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyApiError, type ApiErrorKind } from '../shared/api/error-kind';
import { ApiError } from '../shared/api/http-client';
import { clearSession } from '../shared/api/session';
import {
  fetchMe,
  logoutRequest,
  refreshSession,
  signInWithMiniApp,
  signInWithWidget
} from '../features/auth/api/auth-api';
import { approvePost, createPost, getPost, listPosts, updatePost } from '../features/posts/api/posts-api';
import {
  createDestination,
  getDestination,
  listDestinations,
  updateDestination
} from '../features/destinations/api/destinations-api';
import {
  cancelPublication,
  createPublication,
  getPublication,
  listPublications,
  reschedulePublication
} from '../features/publications/api/publications-api';
import { ids, widgetUser } from './fixtures';
import { failWith, server, setupMswServer, type ErrorCase } from './msw';

setupMswServer();

type Case = ErrorCase & { kind: ApiErrorKind };
const err = (status: number, code: ErrorCase['code'], kind: ApiErrorKind, reason?: string): Case =>
  reason ? { status, code, kind, reason } : { status, code, kind };

// Errors every authenticated endpoint can return (documented per endpoint in apps/contracts).
const common: Case[] = [
  err(401, 'UNAUTHORIZED', 'unauthorized'),
  err(403, 'FORBIDDEN', 'forbidden'),
  err(429, 'RATE_LIMIT', 'rate_limited'),
  err(503, 'UNAVAILABLE', 'unavailable')
];
const validation: Case[] = [
  err(400, 'VALIDATION_ERROR', 'validation'),
  err(413, 'VALIDATION_ERROR', 'payload_too_large')
];
const stale = err(409, 'CONFLICT', 'stale_revision', 'STALE_REVISION');
const idempotency: Case[] = [
  err(409, 'CONFLICT', 'idempotency_key_reused', 'IDEMPOTENCY_KEY_REUSED'),
  err(409, 'CONFLICT', 'in_flight', 'IN_FLIGHT')
];
const notFound = err(404, 'NOT_FOUND', 'not_found');

const rev = { revision: 0 };
const schedule = { scheduledAt: '2026-10-07T09:00:00.000Z', timezone: 'Europe/Moscow' };

type Endpoint = {
  name: string;
  method: 'get' | 'post' | 'patch';
  path: string;
  call: () => Promise<unknown>;
  errors: Case[];
};

const endpoints: Endpoint[] = [
  {
    name: 'POST /auth/telegram',
    method: 'post',
    path: '/api/v1/auth/telegram',
    call: signInWithMiniApp,
    errors: [...validation, ...common]
  },
  {
    name: 'POST /auth/telegram-widget',
    method: 'post',
    path: '/api/v1/auth/telegram-widget',
    call: () => signInWithWidget(widgetUser),
    errors: [...validation, ...common]
  },
  { name: 'POST /auth/refresh', method: 'post', path: '/api/v1/auth/refresh', call: refreshSession, errors: common },
  { name: 'POST /auth/logout', method: 'post', path: '/api/v1/auth/logout', call: logoutRequest, errors: common },
  { name: 'GET /auth/me', method: 'get', path: '/api/v1/auth/me', call: () => fetchMe(), errors: common },

  {
    name: 'GET /posts',
    method: 'get',
    path: '/api/v1/posts',
    call: () => listPosts({}, undefined),
    errors: [err(400, 'VALIDATION_ERROR', 'validation'), ...common]
  },
  {
    name: 'GET /posts/:id',
    method: 'get',
    path: `/api/v1/posts/${ids.post}`,
    call: () => getPost(ids.post),
    errors: [notFound, ...common]
  },
  {
    name: 'POST /posts',
    method: 'post',
    path: '/api/v1/posts',
    call: () => createPost({ title: 'T' }, 'key-1'),
    errors: [...validation, ...idempotency, ...common]
  },
  {
    name: 'PATCH /posts/:id',
    method: 'patch',
    path: `/api/v1/posts/${ids.post}`,
    call: () => updatePost(ids.post, { ...rev, title: 'T' }),
    errors: [...validation, notFound, stale, err(409, 'CONFLICT', 'not_editable', 'NOT_EDITABLE'), ...common]
  },
  {
    name: 'POST /posts/:id/approve',
    method: 'post',
    path: `/api/v1/posts/${ids.post}/approve`,
    call: () => approvePost(ids.post, rev),
    errors: [
      err(400, 'VALIDATION_ERROR', 'empty_body', 'EMPTY_BODY'),
      err(413, 'VALIDATION_ERROR', 'payload_too_large'),
      notFound,
      stale,
      err(409, 'CONFLICT', 'already_approved', 'ALREADY_APPROVED'),
      ...common
    ]
  },

  {
    name: 'GET /destinations',
    method: 'get',
    path: '/api/v1/destinations',
    call: () => listDestinations({}, undefined),
    errors: [err(400, 'VALIDATION_ERROR', 'validation'), ...common]
  },
  {
    name: 'GET /destinations/:id',
    method: 'get',
    path: `/api/v1/destinations/${ids.destination}`,
    call: () => getDestination(ids.destination),
    errors: [notFound, ...common]
  },
  {
    name: 'POST /destinations',
    method: 'post',
    path: '/api/v1/destinations',
    call: () => createDestination({ title: 'T', chatId: '@channel_x', kind: 'channel' }, 'key-1'),
    errors: [...validation, err(409, 'CONFLICT', 'chat_id_taken', 'CHAT_ID_TAKEN'), ...idempotency, ...common]
  },
  {
    name: 'PATCH /destinations/:id',
    method: 'patch',
    path: `/api/v1/destinations/${ids.destination}`,
    call: () => updateDestination(ids.destination, { ...rev, enabled: false }),
    errors: [...validation, notFound, stale, err(409, 'CONFLICT', 'chat_id_taken', 'CHAT_ID_TAKEN'), ...common]
  },

  {
    name: 'GET /publications',
    method: 'get',
    path: '/api/v1/publications',
    call: () => listPublications({}, undefined),
    errors: [err(400, 'VALIDATION_ERROR', 'validation'), ...common]
  },
  {
    name: 'GET /publications/:id',
    method: 'get',
    path: `/api/v1/publications/${ids.publication}`,
    call: () => getPublication(ids.publication),
    errors: [notFound, ...common]
  },
  {
    name: 'POST /publications',
    method: 'post',
    path: '/api/v1/publications',
    call: () =>
      createPublication({ postId: ids.post, revision: 1, destinationId: ids.destination, ...schedule }, 'key-1'),
    errors: [
      err(400, 'VALIDATION_ERROR', 'schedule_out_of_range', 'SCHEDULE_OUT_OF_RANGE'),
      err(413, 'VALIDATION_ERROR', 'payload_too_large'),
      err(404, 'NOT_FOUND', 'post_not_found', 'POST_NOT_FOUND'),
      err(404, 'NOT_FOUND', 'destination_not_found', 'DESTINATION_NOT_FOUND'),
      stale,
      err(409, 'CONFLICT', 'post_not_approved', 'POST_NOT_APPROVED'),
      err(409, 'CONFLICT', 'destination_disabled', 'DESTINATION_DISABLED'),
      ...idempotency,
      ...common
    ]
  },
  {
    name: 'POST /publications/:id/reschedule',
    method: 'post',
    path: `/api/v1/publications/${ids.publication}/reschedule`,
    call: () => reschedulePublication(ids.publication, { ...rev, ...schedule }),
    errors: [
      err(400, 'VALIDATION_ERROR', 'schedule_out_of_range', 'SCHEDULE_OUT_OF_RANGE'),
      err(413, 'VALIDATION_ERROR', 'payload_too_large'),
      notFound,
      stale,
      err(409, 'CONFLICT', 'not_reschedulable', 'NOT_RESCHEDULABLE'),
      ...common
    ]
  },
  {
    name: 'POST /publications/:id/cancel',
    method: 'post',
    path: `/api/v1/publications/${ids.publication}/cancel`,
    call: () => cancelPublication(ids.publication, rev),
    errors: [...validation, notFound, stale, err(409, 'CONFLICT', 'not_cancellable', 'NOT_CANCELLABLE'), ...common]
  }
];

beforeEach(() => {
  clearSession();
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: 'query_id=1&hash=x' } };
});
afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  clearSession();
});

describe.each(endpoints)('$name error mapping', ({ method, path, call, errors }) => {
  it.each(errors.map((e) => [`${e.status} ${e.code}${e.reason ? ` ${e.reason}` : ''}`, e] as const))(
    '%s',
    async (_label, error) => {
      server.use(failWith(method, path, error.status === 429 ? { ...error, headers: { 'Retry-After': '30' } } : error));
      const thrown = await call().then(
        () => undefined,
        (e: unknown) => e
      );
      expect(thrown).toBeInstanceOf(ApiError);
      const apiError = thrown as ApiError;
      expect(apiError.status).toBe(error.status);
      expect(apiError.code).toBe(error.code);
      expect(apiError.reason).toBe(error.reason);
      expect(apiError.requestId).toBe('req-test-1');
      expect(classifyApiError(apiError)).toBe(error.kind);
      if (error.status === 429) expect(apiError.retryAfterSeconds).toBe(30);
    }
  );
});
