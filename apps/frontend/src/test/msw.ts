import { http, HttpResponse, type HttpHandler } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { ApiErrorCode } from '@alexeev/contracts';
import { accessToken, destination, errorBody, me, post, postPage, publication } from './fixtures';

const page = <T>(items: T[]) => ({ items, nextCursor: null });

/** Happy-path handlers for every implemented endpoint; tests override single routes with `server.use`. */
export const handlers: HttpHandler[] = [
  http.post('*/api/v1/auth/telegram', () => HttpResponse.json(accessToken())),
  http.post('*/api/v1/auth/telegram-widget', () => HttpResponse.json(accessToken())),
  http.post('*/api/v1/auth/refresh', () => HttpResponse.json(accessToken('access-refreshed'))),
  http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('*/api/v1/auth/me', () => HttpResponse.json(me)),

  http.get('*/api/v1/posts', () => HttpResponse.json(postPage([post()]))),
  http.post('*/api/v1/posts', () => HttpResponse.json(post(), { status: 201 })),
  http.get('*/api/v1/posts/:id', () => HttpResponse.json(post())),
  http.patch('*/api/v1/posts/:id', () => HttpResponse.json(post({ revision: 1 }))),
  http.post('*/api/v1/posts/:id/approve', () => HttpResponse.json(post({ revision: 1, status: 'approved' }))),

  http.get('*/api/v1/destinations', () => HttpResponse.json(page([destination()]))),
  http.post('*/api/v1/destinations', () => HttpResponse.json(destination(), { status: 201 })),
  http.get('*/api/v1/destinations/:id', () => HttpResponse.json(destination())),
  http.patch('*/api/v1/destinations/:id', () => HttpResponse.json(destination({ revision: 1 }))),

  http.get('*/api/v1/publications', () => HttpResponse.json(page([publication()]))),
  http.post('*/api/v1/publications', () => HttpResponse.json(publication(), { status: 202 })),
  http.get('*/api/v1/publications/:id', () => HttpResponse.json(publication())),
  http.post('*/api/v1/publications/:id/reschedule', () => HttpResponse.json(publication({ revision: 1 }))),
  http.post('*/api/v1/publications/:id/cancel', () =>
    HttpResponse.json(publication({ revision: 1, status: 'cancelled' }))
  ),

  // Never saved: the Обзор applies its default layout.
  http.get('*/api/v1/settings/dashboard-layout', () => HttpResponse.json({ revision: 0, widgets: [] })),
  http.get('*/api/v1/incidents', () => HttpResponse.json({ items: [], nextCursor: null, openCount: 0 }))
];

export const server = setupServer(...handlers);

/** Registers the shared MSW server lifecycle in the calling test file. */
export function setupMswServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

type Method = 'get' | 'post' | 'patch';

export type ErrorCase = {
  status: number;
  code: ApiErrorCode;
  reason?: string;
  headers?: Record<string, string>;
};

/** Replaces one route with a contract error response. */
export function failWith(method: Method, path: string, error: ErrorCase): HttpHandler {
  return http[method](`*${path}`, () =>
    HttpResponse.json(errorBody(error.code, error.reason ? { reason: error.reason } : undefined), {
      status: error.status,
      ...(error.headers ? { headers: error.headers } : {})
    })
  );
}
