# CONTENT-BOT — FRONTEND / BACKEND INTEGRATION

**Single source of contracts:** `contracts`, with no dependencies on React, Hono or Cloudflare. Implemented endpoints are listed below; the Zod schemas in `apps/contracts/src` are the source, this file explains meaning only.

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
| `POST /api/v1/auth/telegram-widget` | Telegram Login Widget user object from the widget's `auth_user` message from the `oauth.telegram.org` iframe (exact origin and iframe-window check; not `data-onauth`, which needs `unsafe-eval`), passed unchanged | `200 { accessToken, expiresAt }` + refresh cookie (`HttpOnly; Secure; SameSite=Lax`, path `/api/v1/auth`); 401 — invalid, stale (> 15 min) or reused signature; 403 — not the owner or foreign `Origin` |
| `POST /api/v1/auth/refresh` | browser: refresh cookie; Mini App: the current valid Bearer; `Origin` is always checked | `200 { accessToken, expiresAt }` (token 60 min; Mini App session ≤ 12 h, browser refresh cookie — 30 days with rotation) |
| `POST /api/v1/auth/logout` | Bearer + refresh cookie, if present; `Origin` is checked | 204; session and cookie removed on the server |
| `GET /api/v1/auth/me` | Bearer | `{ telegramId, name }` |

Implemented today: `POST /api/v1/auth/telegram`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` (schemas: `apps/contracts/src/auth.ts`); `POST /api/v1/auth/telegram-widget` is the browser sign-in (owner decision 06.10.2026: the classic Login Widget, because BotFather offers no OIDC client credentials for the bot; OIDC can replace it later without changing sessions). `POST /api/v1/auth/local` exists only under `vite serve` (`npm run dev`): no body, answers `200 { accessToken, expiresAt }` + refresh cookie for `OWNER_TELEGRAM_ID`, 403 for a foreign `Origin` or a host Vite does not serve, 404 from the route itself for any host but `localhost`/`127.0.0.1`/`[::1]`; `vite build` drops it from the bundle (docs/LOCAL_PREVIEW.md). Sign-in and refresh are rate-limited per client (`429` `RATE_LIMIT` with `Retry-After`). The browser refresh cookie is `refresh_token`, rotated on every use; presenting an already-rotated token revokes the whole session, so the SPA must run one refresh at a time. A browser session ends after 90 days at most, a Mini App session after 12 hours.

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
  body: string; // plain text
  entities: PostEntity[]; // Telegram entities of `body`, UTF-16 offsets, normal form
  revision: number;
  status: 'draft' | 'approved'; // editorial only; scheduling lives in publications
  archivedAt: string | null; // set while the post is in the archive
  autoDeleteAt: string | null; // archivedAt + 30 days (server setting)
  publicationSummary: PostPublicationSummary; // counts by status, next waiting time, last sent time, destinations
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
  externalMessageId?: string; // first/only Telegram message ID; retained for compatibility
  externalMessageIds?: string[]; // every message ID for a successful media group
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
Idempotency-Key: <uuid generated by the client>

{"title":"Герой дня","body":"Текст","entities":[{"type":"bold","offset":0,"length":5}]}
```

Schemas and per-endpoint error codes: `apps/contracts/src/posts.ts`.

| Endpoint | Meaning |
|---|---|
| `POST /api/v1/posts` | Create a draft; `201` with `PostDto`. `Idempotency-Key` is required: a repeat with the same body replays the first response, a different body or a request still in flight is `409` |
| `GET /api/v1/posts` | Keyset pagination (`cursor`, `limit` ≤ 100) or page numbers (`page` 1–1000 with `limit`, an alternative to `cursor`; both together is `VALIDATION_ERROR`; the response echoes `page`, `nextCursor` is null, and a page past the end returns empty `items` with the real `totalCount`), optional `status` filter, `view` = `live` (default, newest update first) or `archive` (most recently archived first), case-insensitive `q` search and `sort`/`direction` over the complete filtered view. Every page carries `totalCount` for the current filters and `archivedCount` for the Archive tab badge |
| `GET /api/v1/posts/{id}` | One post, with its `publicationSummary` |
| `PATCH /api/v1/posts/{id}` | Edit a draft; the current `revision` goes in the body. A new `body` must come with its `entities` (`[]` for plain text), otherwise `400` `ENTITIES_REQUIRED`: old offsets would point into other text. `entities` alone is allowed and is checked against the stored body. Stale revision → `409` `STALE_REVISION`; approved post → `409` `NOT_EDITABLE` |
| `POST /api/v1/posts/{id}/approve` | Draft → approved with the current `revision`; empty body and no attached media → `400` `EMPTY_BODY` |
| `POST /api/v1/posts/{id}/draft` | Approved → draft with the current `revision` and revision + 1; refuses with `409` `PUBLICATION_PENDING` while a job is `pending`/`retry_wait`, `PUBLICATION_IN_PROGRESS` while `claimed`, or `PUBLICATION_UNKNOWN` until reconciled. Also refuses stale revision (`STALE_REVISION`) or a non-approved post (`NOT_APPROVED`). Final publication history and Telegram messages are preserved; no publication is cancelled or resent |

### Archive and deleting posts

A post moves to the archive by itself (Cron) once it has a sent publication and nothing left to send (`scheduled`, `queued`, `preparing`, `sending`, `retry_wait`, `unknown`); it is deleted by itself 30 days after `archivedAt`. A post with an `unknown` or in-flight publication is never deleted, by Cron or by hand. Deleting never removes anything from a Telegram channel. Schemas and per-endpoint error codes: `apps/contracts/src/posts.ts`.

| Endpoint | Meaning |
|---|---|
| `POST /api/v1/posts/{id}/delete` | Delete one post with its publication records; waiting publications (`scheduled`, `queued`, `retry_wait`) are cancelled in the same atomic write and listed in the answer. `409` `PUBLICATION_IN_PROGRESS` (a publication is preparing or sending) or `PUBLICATION_UNKNOWN` (result not reconciled), both with the publication id; stale `revision` is `409` `STALE_REVISION` |
| `POST /api/v1/posts/delete` | The same for 1 to 100 posts, each with its own `revision`. Always `200` with one result per post, in request order: `deleted` (with the cancelled publications) or `refused` with a reason (`NOT_FOUND` also means already deleted, `STALE_REVISION`, `PUBLICATION_IN_PROGRESS`, `PUBLICATION_UNKNOWN`). A repeated id is `400` `DUPLICATE_IDS` |
| `POST /api/v1/posts/{id}/restore` | Archive → live: the post is `approved` again with the same `revision` and nothing is sent. `409` `NOT_ARCHIVED` or `STALE_REVISION` |
| `POST /api/v1/posts/restore` | The same for 1 to 100 posts, per-post results (`restored` or `refused` with `NOT_FOUND`, `NOT_ARCHIVED`, `STALE_REVISION`) |

Scheduling a publication for an archived post is `409` `POST_ARCHIVED`: restore it first. A restored post is archived again only after a publication is sent after the restore.

A request body over 32 KB is `413` `VALIDATION_ERROR`. `entities` is the post's formatting as Telegram message entities (`bold`, `italic`, `underline`, `strikethrough`, `spoiler`, `code`, `pre` with an optional `language`, `text_link` with an http(s) or tg link, `blockquote`); `offset` and `length` count UTF-16 code units of `body`. At most 100 entities; a link is ASCII only (clients normalise with `new URL(address).href`) and at most 2048 characters; the whole list serialized is at most 16 384 characters, which also keeps a maximum post inside the 32 KB request cap. Entities must stay inside the body, must not cut an emoji in half and must nest the way Telegram allows; the server stores the normal form (same-type neighbours merged, bold/italic/underline/strikethrough/spoiler that partially overlap split into nested pieces, sorted) and answers `400` with `details.reason` `ENTITIES_OUT_OF_RANGE`, `ENTITIES_SPLIT_SURROGATE`, `ENTITIES_INVALID_NESTING`, `ENTITIES_TOO_LARGE`, `ENTITIES_TOO_MANY` or `ENTITIES_REQUIRED` otherwise. Title and body reject control characters (the body keeps tabs and line breaks) and broken Unicode. Every change stores a revision snapshot and an audit entry. On `409` the UI keeps the local edits and offers a comparison.

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

The response is `202 Accepted` + `PublicationDto(status="scheduled")`. This is NOT a claim that the post has been published. After Telegram confirms, `GET /api/v1/publications/{id}` returns `sent` with `externalMessageId` (and `externalMessageIds` for a media group). The `Idempotency-Key` header is mandatory (without it — 400 `VALIDATION_ERROR`); the server stores the key and the body hash in D1 (a repeat with a different body — 409 `CONFLICT`), so that a client retry does not create a second scheduled publication. An external Telegram send with an indeterminate response stays `unknown`, despite the internal keys.

Schemas and per-endpoint error codes: `apps/contracts/src/publications.ts`, `apps/contracts/src/destinations.ts`.

| Endpoint | Meaning |
|---|---|
| `POST /api/v1/destinations` | Add a Telegram channel or group (`Idempotency-Key` required); a chat id already in use is `409` `CHAT_ID_TAKEN` |
| `POST /api/v1/destinations/check` | Before saving: Telegram title and type of the chat, whether this environment's bot can post there (`problem`: not a member / not an admin / cannot post), the canonical numeric id, and whether it is already added. Nothing is stored; 20 checks per 10 minutes |
| `GET /api/v1/destinations`, `GET /api/v1/destinations/{id}` | Destinations ordered by title, optional `enabled` filter |
| `GET /api/v1/destinations/{id}/scheduled-count` | Fresh D1 count of pending (scheduled or queued) and retry-wait publications for the disable confirmation; excludes sends already claimed and terminal publications |
| `PATCH /api/v1/destinations/{id}` | Rename, change chat id (group migrated to a supergroup), enable/disable; current `revision` in the body |
| `POST /api/v1/publications` | Schedule an approved post revision to an enabled destination. A time up to 5 minutes in the past means "send now"; more than 366 days ahead is `400` `SCHEDULE_OUT_OF_RANGE`. A draft is `409` `POST_NOT_APPROVED`, a newer post revision `409` `STALE_REVISION`, a disabled destination `409` `DESTINATION_DISABLED` |
| `GET /api/v1/publications`, `GET /api/v1/publications/{id}` | Every `PublicationDto` carries `postDeleted` (true once the owner deleted the post; the publication stays as history, «Пост удалён») and, only then, `postSnapshot {title, body, entities, media}` read from the sent revision (media removed by retention is missing); `GET /posts/{id}` of that post is 404 `NOT_FOUND`. Latest scheduled time first; filters `status`, `statusGroup=errors` (failed + unknown), `postId`, `destinationId`, text `q`, and scheduled-time range `from`/`to`; list responses include `totalCount` matching every filter, accept `page`/`limit` as an alternative to `cursor` (same rules as posts) and echo `page` and exact `statusCounts` matching post, destination, text and time filters while ignoring the selected status/group |
| `GET /api/v1/activity?category&from&to&cursor&limit` | The owner's activity feed (owner, 14.10.2026): audit-log rows of the actions in `apps/contracts/src/activity.ts`, newest first, keyset cursor, `limit` ≤ 50. `category` = posts, media, publications, errors (failed and unconfirmed sends) or system (channels, incidents, automations); `from`/`to` bound a day. Each item carries the actor (`owner` or `system`), the title at read time (post, file, channel), links (`postId`, `publicationId`, null when deleted), the channel, the plan an event set and the error code of a failed send. Autosave edits (`post.update`) are not listed. Forged cursor → `400` |
| `GET /api/v1/publications/{id}/history` | «Хронология»: owner actions from the audit log (created, rescheduled, cancelled, resolved; `scheduledAt` is the plan the event set, absent on rows written before 14.10.2026) and every send attempt with its outcome, error code and Telegram `retry_after`, oldest first, at most 100; unknown id → `404` `NOT_FOUND`. Read-only, no polling: the client refetches it when the publication's `updatedAt` changes |
| `POST /api/v1/publications/{id}/delete` | Requires `{ revision }`; removes a single publication row only when its delivery job is final (`succeeded`, `failed`, `cancelled`). A stale revision is `409` `STALE_REVISION`; `pending`/`retry_wait` is `NOT_FINAL`, `claimed` is `PUBLICATION_IN_PROGRESS`, and `unknown` is `PUBLICATION_UNKNOWN`. Telegram messages are never deleted. Attempt and incident history remains; incidents are detached from the removed publication row. |
| `POST /api/v1/publications/delete` | `{ items: [{ id, revision }] }`, 1–100 unique ids; one `deleted`/`refused` result per requested item in order. Final-state and revision guards are per item, so one refusal does not block others. Duplicate ids are `400` `DUPLICATE_IDS`. |
| `POST /api/v1/publications/{id}/reschedule` | New time, only before sending starts (`scheduled`, `queued`, `retry_wait`); otherwise `409` `NOT_RESCHEDULABLE` |
| `POST /api/v1/publications/{id}/cancel` | Only before sending starts; otherwise `409` `NOT_CANCELLABLE`. A send in progress or with an `unknown` result is never cancelled here |
| `POST /api/v1/publications/{id}/resolve-unknown` | Manual reconciliation of an `unknown` send after the owner checked the channel: `sent` (with either the legacy first message ID or every Telegram message ID) → `sent`; `resend` (new time, same range rules as create) → `scheduled`, or `queued` when the time is already due; `cancel` → `cancelled`. Writes an audit row and closes the open `SEND_UNCONFIRMED` incident. Any other status is `409` `NOT_UNKNOWN` |

Reschedule, cancel and resolve-unknown carry the publication `revision`; a stale one is `409` `STALE_REVISION`, so a double press or a second tab applies once.

There is no retry endpoint: a `failed` publication is not resent from the API, and `unknown` leaves only through `resolve-unknown`. A future retry may exist only for a status the backend deems safe, never for `unknown`.

## Publication analytics

`GET /api/v1/analytics/publications` is a read-only, owner-authenticated report over append-only Studio publication snapshots. `from` is inclusive and `to` exclusive; both are UTC ISO datetimes and the interval is at most 366 days. Optional filters are `destinationId`, `mediaKind` (`photo|animation|video`) and `outcome` (`sent|failed|unknown`). `comparison` selects `destination` (default) or `media`; `cursor`/`limit` use standard keyset pagination (`limit` 1–100, default 20).

The report returns absolute publication/outcome/attempt/retry counts, a bounded comparison, a page of publication snapshots and media-history coverage, all with an observation timestamp. It returns at most one row per publication: the latest snapshot observed inside the selected interval. Thus an interval containing both an `unknown` observation and its later manual `sent` resolution shows the latter; an interval ending before resolution still shows the earlier `unknown`. Counts are unique publications, not snapshot-event counts. It never returns percentages/rates or infers rubric, mode, or missing history. Unknown remains distinct from sent and failed. Reads do not write snapshots or change publication state. Errors: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `UNAVAILABLE` 503.

The wire shape is defined in `apps/contracts/src/analytics.ts`; route and D1 snapshot behavior are covered by Worker contract tests.

Queue item 22 adds manual performance observations, separate from Studio publication outcomes. `GET /api/v1/analytics/eligible-publications` is a bounded, searchable picker of publications already marked `sent`; `GET /api/v1/analytics/observations` is a bounded, append-only owner-entered history filterable by publication, metric and explicit content age. `POST /api/v1/analytics/observations` requires `Idempotency-Key` and records one value for `views`, `forwards` or `reactions` at one supported content age (+1h, +3h, +6h, +12h, +24h, +48h, +72h or +7d). The owner supplies a source label and complete/partial coverage; partial requires a note. Observation time and actor provenance are server-recorded. Replays with the same key/payload return the original 201 response; different payloads or a live duplicate claim return 409. No automatic collection, MTProto, backfill, editing or deletion is part of this API. Its wire shape is in `apps/contracts/src/analytics.ts`. Contract, migration 0033 and backend routes/tests are implemented locally; the frontend and final R3 review remain pending, so item 22 is still in progress.

## Content analytics

Read-only counters of the owner's own Telegram, YouTube and TikTok, collected by the Worker (decision 15.10.2026). Separate from publication analytics above, which reports the Studio's send outcomes. Schemas: `apps/contracts/src/content-analytics.ts`.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/content-analytics` | Overview: one state per platform (`ok`, `pending`, `not_configured`, `error` with a stable code), followers and their change against the closest stored day 7+ days ago, views and count of items published in the last 7 days, 30 days of daily follower counts, the newest items and the 30-day leaders by views |
| `POST /api/v1/content-analytics/sync` | Collects now every configured source whose last claim is at least 5 minutes old (a source claimed by a concurrent Cron tick is skipped), then returns the overview. No body, safe to repeat |
| `GET /api/v1/content-analytics/report?days=7\|30\|90` | Everything the «Аналитика» page compares in one bounded read (≤ 1000 items): the items published in the period and in the previous period of the same length, plus daily followers over both. Medians, period changes, «× к обычному», best posting time and the conclusions are computed by the client from these rows. Also carries the usual curves per platform and `growth`: views gained per UTC day and platform from the daily readings (each item's last reading of the day minus its previous one; an item published that day counts from zero; migration 0046 indexes snapshots by time) |
| `POST /api/v1/content-analytics/tiktok/connect` | Owner-only: creates a single-use OAuth state (10 minutes) and returns TikTok's consent URL; `503` without the app keys |
| `GET /api/v1/content-analytics/tiktok/callback` | Public (TikTok's browser redirect, rate-limited): consumes the state, exchanges the code, stores AES-GCM-encrypted tokens and redirects to `/analytics?platform=tiktok&tiktok=connected\|denied\|expired\|failed`; an unknown, reused or expired state never reaches TikTok |
| `POST /api/v1/content-analytics/tiktok/disconnect` | Owner-only: forgets the tokens and revokes them at TikTok (best effort); `204`, safe to repeat |
| `GET /api/v1/content-analytics/items` | Keyset page of posts and videos, newest first, optional `platform` |
| `GET /api/v1/content-analytics/goals` | Follower goals per platform (migration 0048): target, latest count, followers per week over the last 28 days of daily counts (from 7 days), the UTC day the target is reached at that pace (none when reached, not growing or beyond 5 years) |
| `PUT /api/v1/content-analytics/goals/:platform` | Sets or replaces the platform's target and returns the goals; safe to repeat |
| `DELETE /api/v1/content-analytics/goals/:platform` | Removes the platform's goal and returns the goals; safe to repeat |
| `GET /api/v1/content-analytics/items/:id` | One item with its snapshots (hourly while it is younger than 72 hours, then daily) and the usual curve of its platform; `404` when unknown |

Each collection also records an item's views at 1, 3, 6, 12, 24, 48 and 72 hours of age (migration 0045), but only inside a 90-minute window after each checkpoint, so history read later never fills them. The report and the item detail carry the platform's usual curve: the median of those checkpoints over the items published in the last 90 days, with the 25th–75th percentile range («обычно»), at a checkpoint only with 3 or more items. The page compares an item younger than 72 hours with that curve at its age («Залетает» from 1.5×, «Ниже нормы» up to 0.7×, «Собираем данные» without a curve) and an older one with the period median. Each run reads history as well as new posts: up to 5 preview pages of Telegram (~100 posts) and the 200 newest YouTube uploads (at most 9 API calls). Snapshots of items older than 30 days are weekly. Sources are configured per environment: `ANALYTICS_TELEGRAM_CHANNEL` and `ANALYTICS_YOUTUBE_CHANNEL_ID` in `apps/backend/wrangler.jsonc`, the secret `YOUTUBE_API_KEY`. TikTok needs the secrets `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` and a connected account (`connection` in the overview: `available` → `connected`); its collection refreshes the 24-hour access token ahead of expiry and reads the account and up to 100 newest videos. Telegram previews expose views and reactions only (`comments` and `shares` are null). Errors: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404 (item), `UNAVAILABLE` 503.

Bot alerts (no endpoint; Cron every 10 minutes at minute 8 on idle ticks, migration 0047): a publication of the last 26 hours whose latest recorded 3, 6 or 24 h checkpoint is ≥ 1.5× or ≤ 0.7× the usual curve (usual ≥ 20 views), once per publication and direction; a source that collected before and has failed for 3 hours (a TikTok reconnect at once), once per outage; a TikTok video of the last 7 days that stopped dead (the window before grew by 100+ views and the last window — 6 h while snapshots are hourly, 24 h after 72 h — added none, with ≥ 300 views and a fresh observation) or that TikTok's latest successful collection no longer returns (deleted, hidden or under review), once per video, with a link to the video so the owner can appeal; on Monday from 10:00 in the owner's zone a digest of the previous Monday–Sunday in the owner's zone (its publication count against the week before, the median views at 24 h per platform against the week before when each week has 3 measured publications, follower change by the end of Sunday, each goal with its pace and forecast, the best three and the weakest three publications older than 72 hours against the 30-day median of their platform). At most 3 new alerts are raised per tick. The dedup key is the alert id; each alert is stored with its Telegram HTML (migration 0049; older rows are sent as escaped text) and sent once with a button to the studio (the digest also has one button per listed publication), and a send without a confirmed answer stays `unknown`, never retried.

## Owner settings

Schemas and error codes: `apps/contracts/src/settings.ts`.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/settings/appearance` | Theme mode (system/light/dark) and the accent preset; the client writes the same preset to `lightAccent` and `darkAccent` and an empty `customPresets` (custom colours are no longer offered; the fields stay for compatibility). Preset ids: cobalt, indigo, copper, orchid, mono, teal, green, red |
| `PUT /api/v1/settings/appearance` | Replaces the whole document; the current `revision` goes in the body. Stale → `409` `STALE_REVISION`; an accent pointing to a custom preset that is not in the list → `400` `UNKNOWN_CUSTOM_PRESET`; repeated preset id → `400` `DUPLICATE_PRESET_ID`; body over 8 KB → `413` |
| `GET /api/v1/settings/operations` | Owner timezone and notification preferences; never saved → `Europe/Moscow`, enabled notification preferences and revision 0. The UI uses this shared timezone for scheduling and the dashboard's local-day range; Telegram `/today` and `/next` use it too |
| `PUT /api/v1/settings/operations` | Replaces the complete timezone and notification-preference document using its current `revision`; stale or concurrent saves return `409` `STALE_REVISION` |


### Dashboard layout

Removed 14.10.2026 (owner): Обзор has one fixed layout, so `/api/v1/settings/dashboard-layout` no longer exists. The `dashboard_layout` table stays unused (expand-only migrations).

## Dota Intelligence (first read-only slice)

Schema: `apps/contracts/src/dota.ts`.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/dota?source&limit` | Owner-only read of the two fixed official feeds and their persisted updates. `source` optionally filters updates to `steam_news` or `patch_notes`; both source summaries are always returned. `limit` defaults to 50 and is capped at 100; updates are newest first. No fetch, draft creation, notification or other mutation occurs on read. |
| `GET /api/v1/dota/updates/:sourceKey/:externalId` | Owner-only read of one persisted update and its stored deterministic patch parse. It never fetches an upstream source. Steam updates use `not_applicable`; patches distinguish `pending`, `complete`, `incomplete`, `no_recognized_facts` and `unavailable`. Only explicitly recognized fact rows are returned; the canonical source URL is attached to the update, not represented as a fact-level citation. |

Each feed summary carries `lastError` (`null` after a success): the last failed check as `{code, httpStatus, detail, at, consecutiveFailures, lastSuccessAt}`. `code` is `FETCH` (network/timeout), `HTTP` (with `httpStatus`; 3xx counts, redirects are not followed), `BODY_LIMIT` (with sizes in `detail`), `JSON`, `SHAPE` (`detail` names the failing field) or `STORE` (D1 write failed; no incident, no alert), prefixed `DOTA_SOURCE_`. A tick that ran out of subrequests is skipped and recorded as nothing. `detail` is short and never holds secrets.

The two official feed summaries report `lastAttemptAt`, `lastSuccessAt` and a server-derived health: `degraded` when a source-level incident is open, `unverified` before its first successful check, `stale` after 30 minutes without a success (including legacy sources with a successful baseline but no recoverable timestamp), otherwise `healthy`. A legacy source's unknown success time remains `null`; clients must not invent a timestamp. A patch-detail incident is exposed on the source but does not by itself mark the feed degraded. Update links are returned only for the canonical Steam Community announcement or official Dota patch URL validated against its stored source key and ID. `linkedDraft` is present only when the existing post still exists. These reads do not expose source editing, cross-source event matching, tournaments or cosmetics.

Errors: list reads return `401` `UNAUTHORIZED`, `403` `FORBIDDEN`, and `503` `UNAVAILABLE`; event detail additionally returns `400` `VALIDATION_ERROR` and `404` `NOT_FOUND` for an update that is not persisted. Safe retries repeat only the read.

### AI

The AI writer's settings, connection and spend (stage A; migration 0053). One provider port on the server, OpenAI the first adapter (Responses API, `store: false`); the key is the Worker secret `OPENAI_API_KEY`, set by the owner, never stored, logged or returned. `GET /api/v1/ai` returns the settings (off by default; the draft and cheap model, chosen from the provider's catalog; the owner's own prices if any; monthly budget, daily cap, warning percent), the catalog (the provider's models with a one-line note, their roles, the recommended pick and the provider's prices in USD per 1M tokens for input, cached input and output, with the day they were read; defined in `apps/backend/src/modules/ai/catalog.ts`), the connection (whether the key is set, its secret name, the last check) and this owner-zone month's spend (spent, today, left, requests, average, unpriced requests, by kind, and `blockedBy`: disabled, no key, no model, a chosen model without a price, monthly budget, daily cap). `PUT /api/v1/ai/settings` saves under a revision (`CONFLICT`/`STALE_REVISION`); every chosen model must have a price (its own or the catalog's), since a request without one would never count against the budget: otherwise `VALIDATION_ERROR` with `details.reason` NO_PRICE. `POST /api/v1/ai/check` sends one tiny request to the cheap model and records it; at most 5 per 10 minutes (`RATE_LIMIT`); refused with `UNAVAILABLE` and `details.reason` NO_KEY, DISABLED, NO_MODEL, NO_PRICE or BUDGET; a provider failure is the check's stored result. Every request is recorded with its tokens (cache reads and cache writes at 1.25× input included) and its cost from the model's price; a dated snapshot (`-YYYY-MM-DD`) bills as its base model, never by a bare prefix; a model without a price counts as unpriced. When a request crosses the warning share, the monthly budget or the daily cap for the first time in its period, the bot tells the owner once (`ai_budget_alerts`). The overview also carries «Качество» for the last 30 days (migration 0054 data): drafts, rewrites, failed calls, drafts with code-check findings, approvals, approvals with ≤ 5 % changed, the mean edit ratio before approval, «Шутка не зашла» taps and the mean cost of a draft. `POST /api/v1/ai/drafts` `{ format, mode, task, holdOut? }` writes one draft (`holdOut`: Reels example ids kept out of the prompt, so a control run compares the draft with an original the model did not see) from the studio (stored as AI_DRAFT, never publishable without approval) and returns its hooks, text and check codes, or `status: failed` with the provider's code; not idempotent (each call is paid), at most 20 per 10 minutes (`RATE_LIMIT`), refused like the check. Studio: «Настройки → ИИ». «ИИ-редактор → Обо мне» (migration 0058): `GET /api/v1/ai/profile` returns the author's fields (Dota Friend ID, hours, heroes being learnt, what is not understood yet, rubric experiments, temporary notes), the last OpenDota read (rank tier and its label, Dota Plus, whether match data is public, wins, losses, top 5 heroes) and `promptText`, the exact state sent after the cached prefix of every AI request; `PUT /api/v1/ai/profile` saves the fields under a revision (`CONFLICT`/`STALE_REVISION`); `POST /api/v1/ai/profile/dota` reads OpenDota now (`UNAVAILABLE` NO_ACCOUNT or DOTA_UNREACHABLE, at most 5 per 10 minutes); Cron reads it once a day on an idle tick of minute 17.

### Dota hero assets

Official hero media mirrored from Valve's CDN (Akamai mirror first, the Cloudflare mirror after a refusal or an error) into the environment's R2 bucket (`dota/heroes/<slug>/<kind>.<ext>`, migration 0050), the source material for AI posts and auto content. Kinds: the animated render with transparency as WebM (VP9) and MOV (HEVC), its still PNG, the portrait, the icon and the close-up crop. The hero list comes from `dota2.com/datafeed/herolist` only when the owner presses «Проверить у Valve» (`POST /api/v1/dota/hero-assets/refresh`, owner decision 15.10.2026: Cron never asks Valve on its own); it adds new heroes and queues again the files Valve did not have. A Cron step on idle ticks of minutes ending in 1 and 6 claims up to 5 due files (a conditional claim moves them 10 minutes forward, so overlapping ticks never copy one file twice) and copies each into R2 (read whole and measured: the CDN may answer a Worker without Content-Length); a 404 is `missing` and waits for the next «Проверить у Valve»; any other failure (a 403 included) backs off up to a day. With nothing queued the step is one indexed read. `GET /api/v1/dota/hero-assets` lists every hero with each file's state, the last failure code (with the runtime's own words for a failed call) and the totals; `GET /api/v1/dota/hero-assets/{slug}/{kind}` streams a stored file through the Worker with the owner's session (`NOT_FOUND` until stored). The studio shows them in «Медиа → Герои Dota».

### Exact Dota watchlists

Schema: `apps/contracts/src/dota-watchlists.ts`.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/dota/watchlists` | Owner-only read of up to 100 active exact hero/item watches and the newest 100 persisted watch-update matches with alert outcomes. It reads D1 only; it does not fetch sources or send alerts. |
| `POST /api/v1/dota/watchlists` | Owner-only add from a persisted confirmed patch fact. Body identifies `sourceKey`, `externalId` and `factId`; the server derives the entity type/name and refuses non-hero/item or unsupported facts. Requires `Idempotency-Key`. Returns 201 when created or 200 with the existing active watch for a duplicate entity. Same key/payload replays the original response; same key with a different payload returns 409 `CONFLICT` (`IDEMPOTENCY_KEY_REUSED`), and a duplicate request while the original is still in progress returns 409 `CONFLICT` (`IN_FLIGHT`). |
| `DELETE /api/v1/dota/watchlists/:watchId` | Owner-only idempotent removal. Returns 204 whether the active watch was removed now or was already absent. Alert history is retained. |

Watch matching is limited to exact hero/item identities in persisted confirmed patch facts from updates detected after the watch was created. One D1-unique alert record exists per watch/update pair. It is claimed before sending to the private owner bot. Confirmed sends and definite failures are recorded; a crash or ambiguous Telegram response becomes `unknown` and is never automatically retried. The global `dotaWatchlistAlerts` owner notification preference can suppress delivery; a suppressed match is recorded as `disabled`. No statistics thresholds, inferred matches, or new sources are included.

### Sources events («Источники»)

Schema: `apps/contracts/src/sources.ts`. Design: `docs/backend/sources.md`. All owner-only.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/sources/events?status&type&page&limit` | Detected Dota events newest first: `{ items, page, totalCount, nextCursor: null }`. `status` = `new` (no draft), `drafted`, `published` (the draft's latest publication is sent), `hidden`; `type` = `patch`, `treasure`, `news`. `page` is 1-based, `limit` defaults to 10 (max 100). Each item has `id` (`<sourceKey>:<externalId>`), `title`, `sourceName`, `sourceUrl`, `publishedAt`, `detectedAt`, `summary`, `facts` (patch: changed heroes and items; otherwise empty), `watchHits` (the watched subset), `status`, `draft` (`{ postId, title }` or null) and `publication` (`{ status }` or null). D1 only; never fetches a source. The first sync's seeded history is not an event. |
| `POST /api/v1/sources/events/{id}/draft` | Creates the template draft if the event has none. `201 { event, created: true }` when this call created it, `200 { event, created: false }` when it existed. Idempotent without a key (one draft per event, shared with the Cron auto-draft); a concurrent duplicate may get `409 CONFLICT` `IN_FLIGHT` and should re-read. A hidden event is `409 CONFLICT` with `details.reason` `EVENT_HIDDEN`. |
| `POST /api/v1/sources/events/{id}/hide` and `.../unhide` | Idempotent; `200` with the event. A hidden event gets no auto-draft or notice. |

Errors: `400` `VALIDATION_ERROR` (bad query or id), `401`, `403`, `404` `NOT_FOUND`, `409` `CONFLICT`, `503` `UNAVAILABLE`.

Errors: add returns `400` `VALIDATION_ERROR`, `401` `UNAUTHORIZED`, `403` `FORBIDDEN`, `409` `CONFLICT`, or `503` `UNAVAILABLE`; delete returns `400` `VALIDATION_ERROR`, `401` `UNAUTHORIZED`, `403` `FORBIDDEN`, or `503` `UNAVAILABLE`. `GET` is safe to retry; a notification action is not exposed as an HTTP retry.

## Bot connection

Schemas and error codes: `apps/contracts/src/bot.ts`.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/bot/status` | Which bot settings are missing on this Worker (names only), the bot username, the URL this Worker expects, and Telegram's webhook info: the current URL, whether it points here, pending updates and the last error. Changes nothing |
| `POST /api/v1/bot/connect` | The Worker registers its own webhook with the token and secret it already holds, removes stale command lists, and sets the owner-chat commands and the menu button. Safe to repeat. Returns the fresh status. With missing settings → `503` `BOT_NOT_CONFIGURED` |

## Automations

The following owner-only routes manage the two registered Dota tasks only. Schemas and error shapes are in `apps/contracts/src/automations.ts`.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/automations` and `GET /api/v1/automations/{automationId}` | The registered Dota source/watchlist job only; returns server-owned cadence, next run, health, current execution, latest run, revision, and declared side effects. No arbitrary jobs or publication dispatch. |
| `GET /api/v1/automations/{automationId}/runs?cursor&limit` | Keyset-paginated run history with bounded status/error data and output counts. |
| `POST /api/v1/automations/{automationId}/pause` and `/resume` | `Idempotency-Key` + expected revision; accepted state and audit record are atomic. Pause prevents future automation claims only; an already claimed run completes, and scheduled Telegram publications remain dispatchable. |
| `POST /api/v1/automations/{automationId}/run-now` | `Idempotency-Key`; queues/coalesces one bounded run through the ordinary D1 claim path and returns 202. The server enforces each source's minimum polling interval. It never calls Telegram publication transport. |

## Observability

Schemas and error codes: `apps/contracts/src/dashboard.ts`, `apps/contracts/src/incidents.ts`.

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/dashboard?from&to` | The owner's day in one read. `from` (inclusive) and `to` (exclusive) are the UTC instants of the owner's "today" as the client computed them (UTC `Z` datetimes, `to` after `from`, at most 48 h apart; otherwise `400`). Returns `attention` (at most 5 rows: `unknown`, then `failed`, then `stuck` = scheduled/queued more than 10 minutes past due) with `attentionTotal` (capped at 99), `today` (at most 8, earliest first, cancelled left out) with `todayTotal` (capped at 100), `upcoming` (next 5 waiting after `to`), `recentSent` (last 5 sent, with `sentAt` and a `messageUrl` only for a destination saved with a public `@username`) and `generatedAt`. Post titles are cut to 120 characters; no post body and no incident `details`. Read-only |
| `GET /api/v1/incidents?state&kind&cursor&limit` | Incidents with their publication inline. `state` `open` (default) or `resolved`; `kind` `publish_failed` or `publish_unknown`; `limit` default 25, at most 50. Open: newest first by `occurredAt`; resolved: most recently closed first by `resolvedAt`. `openCount` is the number of open incidents (all kinds, whatever the filter), capped at 99 (99 means "99 or more"), for the sidebar badge |
| `POST /api/v1/incidents/{id}/resolve` | Acknowledges a `publish_failed` incident (no body). Returns the incident with `resolvedAt`. Idempotent: a repeat is `200` with the same row and no second audit row. Does not touch the publication, never retries or republishes. A `publish_unknown` incident is `409` `CONFLICT` `USE_RESOLVE_UNKNOWN` (close it with `resolve-unknown`); an unknown id is `404` |

`GET /api/v1/jobs?status=...` and the private extended health are not built. An incident has no `requestId` (Cron raises it, not a request); it carries `jobId` and `attemptCount`. Errors of mutating requests return a single `ApiErrorDto`.

## Media and preview

Media is attached to a draft in the post editor. The library is a reusable view over retained `media_assets`, not a duplicate storage system. `PostDto.media` is an ordered list of server-confirmed attachments. Only the owner can upload, reorder, remove, select or preview them. Binary content is private in R2 and is never returned as a public URL or embedded in JSON/base64.

| Endpoint | Meaning |
|---|---|
| `POST /api/v1/posts/{id}/media?revision={revision}&fileName={name}` | Raw file bytes with required `Content-Length`, `Content-Type` and `Idempotency-Key`; signature and actual streamed byte count are independently checked server-side. Returns the confirmed media and the incremented post revision. A stale revision is `409`; upload calls for one post are sequential. Replaying the same key and payload returns the original response until that attachment is explicitly deleted. |
| `POST /api/v1/posts/{id}/media/{mediaId}/crop?revision={revision}&fileName={name}` | Raw rasterized photo bytes with required `Content-Length`, photo `Content-Type` and `Idempotency-Key`. Atomically replaces that attached draft photo at the same position and increments revision; it does not add a media slot. The response is `{ media, revision }`. A derivative retains a reference to the original source asset, so recropping never overwrites or prematurely removes the original. Crop geometry is embodied by the derivative bytes. Same-key/same-payload retry replays the original response; same key with a different payload or an in-flight duplicate is `409`. |
| `DELETE /api/v1/posts/{id}/media/{mediaId}` | JSON `{ revision }`; removes one draft attachment and increments revision. |
| `PATCH /api/v1/posts/{id}/media/order` | JSON `{ revision, mediaIds }`; replaces the order only when the list is exactly the draft's current attachments and increments revision. |
| `GET /api/v1/media?kind=all|photo|video&search&usage=all|used|unused&cursor|page&limit` | Owner-authorized retained-media library; replaced originals (`library_state` 2) are left out (state 1, the former «hidden», is listed like 0), keyset- or page-number-paginated (`page`/`limit` as for posts); every response carries `totalCount` for the filters and `page`. `search` is a bounded filename substring match, case-insensitive for Cyrillic as well as ASCII; `usage` filters current post attachments. Each item includes exact SHA-256 duplicate count, total current-attachment count, at most three post links and `deletable` (false while a post, a publication snapshot or a crop holds the file; computed by the same predicate as the delete). Assets referenced only by immutable revisions remain listed with no current post links. Media bytes remain private. |
| `POST /api/v1/posts/{id}/media/attach` | JSON `{ revision, mediaIds }`; appends selected library assets in request order (bytes are copied in R2 only for a repeated picture). Every ID must be retained and attachable; a picture already in the post (or repeated in the request) is attached again as a new asset with its own copy of the file; stale revision or exceeding 10 total items is refused. Removing the post link does not delete an asset still used elsewhere. |
| `GET /api/v1/media/{mediaId}/content` | Owner-authorized private byte stream for preview; clients fetch with the session Bearer token and use a temporary object URL. |
| `POST /api/v1/media?fileName={name}&kind=photo\|animation\|video` | Raw bytes (JPEG, PNG, WebP, GIF or MP4) of a new library file with required `Content-Length`, `Content-Type` and `Idempotency-Key`; validation is the post-upload one (signature, streamed byte count, per-kind limit, dimensions). Stores a retained library item with no post and returns `201 MediaLibraryItemDto`. Same key and payload replays the original response; a reused key with a different payload is `409` `IDEMPOTENCY_KEY_REUSED`. Other errors: `400 VALIDATION_ERROR` (bad query, kind mismatch, invalid media), `413`, `503`. `document` is not supported (no document upload exists for posts either). |
| `POST /api/v1/media/{sourceId}/derived?fileName={name}&kind=photo\|video` | Raw cropped photo (JPEG, PNG, WebP) or MP4 video bytes with required `Content-Length`, `Content-Type` and `Idempotency-Key`; validation matches uploads (signature, streamed byte count, per-kind limit, dimensions). The source must be a retained library item of the same `kind`. Stores a NEW library item (no post involved) and returns `201 MediaLibraryItemDto`; the original is untouched and cannot be deleted while the derivative exists. Same key and payload replays the original response; a reused key with a different payload is `409` `IDEMPOTENCY_KEY_REUSED`. Other errors: `400 VALIDATION_ERROR` (bad query, kind mismatch, invalid media), `404`, `413`, `503`. The browser re-encodes video (WebCodecs via `mediabunny`, lazy chunk); the server never transcodes. Optional `mode=new\|replace` (default `new`): `replace` also, in the same guarded D1 batch, swaps the source for the new item in every DRAFT post that holds it (same position, one revision bump and audit row per post like an edit, so a stale editor gets `STALE_REVISION`) and takes the source out of the listing for good (`in_library=0`, `library_state=2`). Approved, scheduled and published posts and all revision snapshots keep the source; its object goes through the normal cleanup only when nothing references it (a root original stays while the new crop points at it). The key hash includes the mode; a replay returns the stored item with no second swap; replacing an already replaced source is `404`. ~11 statements regardless of draft count. |
| `DELETE /api/v1/media/{mediaId}?detach=drafts\|all` | Owner-only; removes a library file and returns `204`. Without `detach`, a file in use (held by any draft, approved or archived post, named by a publication's snapshot, or the source of a crop) is `409` `CONFLICT` `details.reason: MEDIA_IN_USE` plus `details.blockedBy` (`SENDING` > `PUBLISHED` > `SCHEDULED` > `APPROVED` > `DERIVATIVES` > `DRAFTS`); nothing is removed; unknown id is `404`. Whatever `detach` says, a file named by a publication whose job is `claimed` or `unknown` answers `details.reason: MEDIA_PUBLICATION_IN_FLIGHT` (`blockedBy: SENDING`). `detach=drafts` first removes the file from DRAFT posts (one revision bump and audit row per post, positions renumbered, at most 20 drafts per file, otherwise `blockedBy: DRAFTS`) and then deletes it; sent, scheduled and approved holders still block. `detach=all` (the owner confirmed the warning from `/usage`) always deletes, in one D1 batch, except while a publication naming the file has a job `claimed` or `unknown` (`409` `details.reason: MEDIA_PUBLICATION_IN_FLIGHT`, `blockedBy: SENDING`, nothing changes; an unknown publication is never touched) or a crop still points at it (`DERIVATIVES`). It also detaches drafts, drops the attachment of approved posts, leaves scheduled (`pending`/`retry_wait`) publications scheduled without the file (readers skip a missing asset) and keeps sent history (Telegram has its own copy). A scheduled publication left with no title, no body and no media is cancelled (job `cancelled`, publication `lastErrorCode: MEDIA_DELETED`, audit `publication.cancel`). All guards run in the same statements as the delete, so a Cron claim racing it either lands first (409) or finds the file gone. The R2 object is deleted afterwards; if that fails it stays in the durable cleanup queue and is retried by Cron. |
| `GET /api/v1/media/{mediaId}/usage` | Owner-only -> `200 MediaUsageDto`, each list at most 20 entries: `drafts` and `approved` (approved posts with no publication naming the file) as `{ postId, title }`; `scheduled` `{ publicationId, postId, title, scheduledAt, wouldBeEmpty }` (job `pending`/`retry_wait`; `wouldBeEmpty` = deleting would cancel it); `sending` `{ publicationId, postId, title, state: sending\|unknown }` (job `claimed`/`unknown`); `sent` `{ postId, title, sentAt }` (succeeded; `sentAt` = last job change). Also `derivatives` (crops pointing at it), `deletable` (a plain delete would succeed) and `detachable` (`detach=all` would succeed now). Two D1 statements in one batch. Unknown id is `404`. |
| `POST /api/v1/media/delete` | JSON `{ ids, detach? }` (1–50 unique UUIDs; `detach` as for the single delete, a blocked id keeps its drafts) -> `200 { deleted, inUse }`. Same rules, decided in one D1 batch (constant round trips: 1 batch, 1 R2 `delete(keys[])`, 1 cleanup statement, so 50 ids fit the free-plan subrequest limit). A source and its crop selected together are both deleted or both kept: a member held by a post/snapshot or by a crop outside the selection is `inUse`, and that blocks its selected source too. An id that no longer exists counts as `deleted`, so retries are safe. |

The editor accepts up to 10 attachments: JPEG, PNG and WebP photos (10,000,000 bytes each), GIF animation (50,000,000 bytes), and MP4 video (50,000,000 bytes). Limits are enforced against actual uploaded bytes, not only the request header. Telegram delivery supports text-only messages, one photo/video/animation, and 2–10 photo/video albums; animation in albums and caption text over 1024 characters are rejected before sending. No text is truncated or automatically split. Contract schemas and error codes are in `apps/contracts/src/media.ts`.

`PostMediaDto.sourceMediaId` is `null` for an original asset and the original asset ID for a cropped derivative. A derivative is a separate retained raster asset; editing it replaces only the draft attachment, and the original remains available for another crop while the derivative is retained. Crop accepts only an already attached photo and a valid supported photo raster within the existing per-photo byte limit. A stale revision is `409` `STALE_REVISION`; a non-editable draft is `409` `NOT_EDITABLE`; invalid query, headers, target type or image bytes are `400` `VALIDATION_ERROR`; missing post/attachment is `404`; storage failure is `503` `UNAVAILABLE`. The total media cap remains 10 because crop replaces rather than appends.

Upload staging and detached objects use a durable D1 cleanup queue; Cron retries a bounded batch during hourly idle housekeeping ticks, while preview stops resolving as soon as an attachment is detached. This cleanup is operational and does not turn a committed detach into a failed API operation.

## Mandatory contract tests

1. The API DTO in a real response matches the `contracts` Zod schema.
2. Without a token or with an expired one — 401 with no private data; another Telegram ID — 403; forged `initData` or Login Widget data — 401; `refresh` with a foreign `Origin` — 403.
3. Concurrent editing: 409 without losing the local draft.
4. Repeated creation with the same Idempotency-Key does not duplicate the publication intent.
5. `202` is not treated by the UI as `sent`.
6. `unknown` blocks automatic retry and requires manual reconcile.
7. A DTO version change supports the frontend of both the current and the previous deploy at the same time, or goes out as a coordinated release.
