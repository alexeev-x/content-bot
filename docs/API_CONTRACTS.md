# CONTENT-BOT — FRONTEND / BACKEND INTEGRATION

**Single source of contracts:** `contracts`, with no dependencies on React, Hono or Cloudflare. This is a design of future contracts, not an already running API.

## Network and authentication

```text
Browser / Telegram Mini App → /api/v1/*  (same Worker and origin, no BFF)
                            → Hono: Bearer token → permissions (owner's Telegram ID)
Telegram                    → /webhooks/telegram (secret header, no session)
```

**One identity — the owner's Telegram ID.** Sign-in endpoints:

| Method and path | Input | Response |
|---|---|---|
| `POST /api/v1/auth/telegram` | `{ initData }` from `Telegram.WebApp` | `200 { accessToken, expiresAt }`; 401 — invalid signature or `auth_date` older than 15 minutes; 403 — not the owner |
| `GET /api/v1/auth/oidc/start` | — | 302 to `oauth.telegram.org/auth` (Authorization Code + PKCE, `state`, `nonce`) |
| `GET /api/v1/auth/oidc/callback` | `code`, `state` | `id_token` verification; refresh cookie (`HttpOnly; Secure; SameSite=Lax`, path `/api/v1/auth`); 302 to the app |
| `POST /api/v1/auth/refresh` | browser: refresh cookie; Mini App: the current valid Bearer; `Origin` is always checked | `200 { accessToken, expiresAt }` (token 60 min; Mini App session ≤ 12 h, browser refresh cookie — 30 days with rotation) |
| `POST /api/v1/auth/logout` | Bearer + refresh cookie, if present; `Origin` is checked | 204; session and cookie removed on the server |
| `GET /api/v1/auth/me` | Bearer | `{ telegramId, name }` |

All other `/api/v1/*` endpoints require `Authorization: Bearer <accessToken>`. The client keeps the token in memory only. The main API does not accept cookies, so no CSRF token is needed; the cookie endpoints `/api/v1/auth/*` are protected by an `Origin` check. The bot token and session tokens never reach the browser, except the short-lived access token.

## Common DTOs and responses

```ts
export type ApiErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR'
  | 'CONFLICT' | 'NOT_FOUND' | 'RATE_LIMIT'
  | 'UNAVAILABLE' | 'UNKNOWN_SEND_RESULT';

export interface ApiErrorDto {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, string>;
  };
}

export interface PageDto<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PostDto {
  id: string;
  title: string;
  body: string;
  revision: number;
  status: 'draft' | 'approved'; // editorial only; scheduling lives in publications
  updatedAt: string; // UTC ISO8601
}

export type PublicationStatus =
  | 'scheduled' | 'queued' | 'preparing' | 'sending'
  | 'sent' | 'retry_wait' | 'failed' | 'unknown' | 'cancelled';

export interface PublicationDto {
  id: string;
  postId: string;
  destinationId: string; // channel or group
  status: PublicationStatus;
  scheduledAt: string;
  externalMessageId?: string;
  lastErrorCode?: string;
  updatedAt: string;
}
```

`PublicationStatus` is a **user-facing projection** of several internal job states; do not make the interface depend on internal SQL fields.

## Draft and concurrent edits

```http
POST /api/v1/posts
Content-Type: application/json
Authorization: Bearer <accessToken>

{"title":"Герой дня","body":"..."}
```

The response is `201 Created` with `PostDto`. Editing is `PATCH /api/v1/posts/{id}` with the current revision (how it is passed is an open question in `DECISIONS.md`). If another editor saved changes — `409 CONFLICT`; the UI keeps the local edits and offers a comparison. `POST /api/v1/posts/{id}/approve` explicitly changes the editorial status.

## Scheduling and sending

```http
POST /api/v1/publications
Content-Type: application/json
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>

{
  "postId":"uuid",
  "revision":3,
  "destinationId":"channel-or-group-id",
  "scheduledAt":"2026-10-05T12:00:00Z",
  "timezone":"Europe/Chisinau"
}
```

The response is `202 Accepted` + `PublicationDto(status="scheduled")`. This is NOT a claim that the post has been published. After Telegram confirms, `GET /api/v1/publications/{id}` returns `sent` with `externalMessageId`. The `Idempotency-Key` header is mandatory (without it — 400 `VALIDATION_ERROR`); the server stores the key and the body hash in D1 (a repeat with a different body — 409 `CONFLICT`), so that a client retry does not create a second scheduled publication. An external Telegram send with an indeterminate response stays `unknown`, despite the internal keys.

`POST /api/v1/publications/{id}/retry` is allowed **only** for a status that the backend has deemed safe to retry. `unknown` cannot be force-sent with this method — first call `POST /api/v1/publications/{id}/resolve-unknown` with the documented manual reconcile and an audit trail.

## Observability

`GET /api/v1/dashboard`, `GET /api/v1/incidents?cursor=...`, `GET /api/v1/jobs?status=...`, `GET /api/v1/health` (private extended health, with no data leaked to the public). The incident list must have `requestId`, `jobId`, `component`, `errorCode`, `occurredAt`, `status`, `attemptCount`. Errors of mutating requests return a single `ApiErrorDto`.

## Media and preview

`POST /api/v1/media/uploads` — a bounded upload route (or a two-step flow when moving to direct upload), `GET /api/v1/media?cursor=...`, `POST /api/v1/media/preview` — authorized asynchronous generation of the actual card with the same renderer as production. Never pass a large `blob` through JSON/base64. Each media object contains `owner`, `mime`, `size`, `sha256`, `storageKey` and an audit.

## Mandatory contract tests

1. The API DTO in a real response matches the `contracts` Zod schema.
2. Without a token or with an expired one — 401 with no private data; another Telegram ID — 403; forged `initData`/`id_token` — 401; `refresh` with a foreign `Origin` — 403.
3. Concurrent editing: 409 without losing the local draft.
4. Repeated creation with the same Idempotency-Key does not duplicate the publication intent.
5. `202` is not treated by the UI as `sent`.
6. `unknown` blocks automatic retry and requires manual reconcile.
7. A DTO version change supports the frontend of both the current and the previous deploy at the same time, or goes out as a coordinated release.
