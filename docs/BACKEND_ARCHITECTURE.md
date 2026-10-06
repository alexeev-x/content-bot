# CONTENT-BOT — FINAL BACKEND ARCHITECTURE v3.1

**Date:** 03.10.2026 · **Status:** approved technical direction; v3.1 — stack approved by the owner on 03.10.2026 (code not yet implemented) · **Load:** up to 1,000 background jobs/day; peaks are verified by load tests · **Budget:** free quotas until measured limits are reached.

> This document replaces ALL interim architectures. When it conflicts with the chat or the old README, follow it, then the approved `AGENTS.md`. When decisions change, edit this document; do not create a v4 alongside it.

## 1. Architecture principle

**Pragmatic modular monolith:** one Cloudflare Worker (Hono + TypeScript), one D1, one Cron; R2 — when media appears; Queue — only after measurements. Worker entry points:

- `fetch` — the admin UI (SPA from static assets, `not_found_handling: "single-page-application"`), the API `/api/v1/*` and the bot webhook `/webhooks/telegram` (`run_worker_first` only for these paths);
- `scheduled` — Cron once a minute: reconcile, then the publication dispatcher.

The same Worker serves the frontend (built via `@cloudflare/vite-plugin`), without Pages, Pages Functions or a BFF. **The bot is part of this same backend** (inbound adapter `app/bot`), not a separate service: Telegram itself sends updates to the webhook. No mandatory AI. Images from the owner's sources via HTML/CSS templates; expensive rendering is split out only after measurements.

```
Browser / Mini App → /            → SPA admin UI
                   → /api/v1/*    → Hono API ──┐
Telegram           → /webhooks/telegram → bot ─┼→ content · publishing · identity → D1 → Telegram API
Cron (1 min)       → scheduled    → reconcile + dispatch ┘
```

**Qualities in priority order:** publication correctness > security > maintainability > observability > performance. The operational goal: no scheduled job disappears without a trace and no ambiguous send is retried automatically.

Do not use at the start: microservices, Redis, Kafka, Kubernetes, CQRS/Event Sourcing, a universal event bus, dynamic loading of third-party plugins, an abstract `BaseRepository<T>`, and a Dependency Injection container with hidden dependencies.

### Approved stack (owner decision 03.10.2026)

| Layer | Choice | Not used, and why |
|---|---|---|
| HTTP | Hono 4 + `@hono/zod-validator`; schemas — Zod 4 from `apps/contracts` | Hono RPC (couples the frontend to backend types, requires identical versions), OpenAPI (no external consumers) |
| Data | D1: SQL via `prepare().bind()`, small typed helpers, row parsing via Zod; migrations — SQL files for `wrangler d1 migrations` | ORM: the job-claim SQL must be explicit; Drizzle 1.0 is still RC (fallback — Drizzle 0.45 only for types and simple CRUD) |
| Background jobs | Cron dispatcher with small batches; remote Cron trigger stays disabled until the scheduler is implemented, then production cadence is configured explicitly | Durable Object alarms and Workflows: they automatically retry steps on failure, which contradicts the `unknown` rule; Queue — after measurements |
| Telegram | grammY: commands (`webhookCallback(bot, "cloudflare-mod")`) and sending (`bot.api`) through the publication adapter; bot identity is obtained from Telegram `getMe`/`bot.init()` and may be cached only in Worker isolate memory, not stored as a separate `BOT_INFO` secret | the `@grammyjs/auto-retry` plugin — forbidden (it retries network errors) |
| Sign-in | Owner's Telegram ID: Mini App — `initData` (HMAC), browser — Telegram OpenID Connect; session token in a header | custom OTP codes and passwords; Cloudflare Access (does not work inside Telegram) |
| Tests | Vitest 4.1 + `@cloudflare/vitest-plugin`, real D1 migrations, fake Telegram via a port | Vitest 5 — until supported in the Cloudflare plugin |
| Local development | root `.env.example` is the canonical project template; Worker runtime values are copied to gitignored `apps/backend/.dev.vars`; `vite dev` with `@cloudflare/vite-plugin`, `wrangler types` | — |
| Observability | Workers Logs + `incidents` table in D1 | third-party SDKs until real traffic appears (fallback — Sentry) |
| Deploy | Workers `dev` (from `develop`, `dev.alexeevs.workers.dev`) and `app` (from `main`, `app.alexeevs.workers.dev`), each with its own D1; GitHub Actions deploys after green checks; the owner applies remote migrations before pushing code that needs them; Time Travel bookmark before migration | agents never deploy |

## 2. Boundaries: who owns what

| Area | Responsibility | Forbidden |
|---|---|---|
| `content` | drafts, versions, publication content and format | calling Telegram, Cron, R2 directly |
| `publishing` | publication, schedule, state, retries, `jobs`, destinations (channel, group) | computing Dota statistics itself, storing raw images |
| `app/bot` (inbound adapter, not a business module) | parsing Telegram commands and button presses, replying to the owner; like HTTP routes and Cron, it calls only the public APIs of modules | business logic, direct SQL, replying to commands not from the owner; no module imports `app/bot` |
| `identity` | the owner (Telegram ID from settings), sign-in via Mini App `initData` and Telegram OpenID Connect, sessions | trusting data without signature verification, logging `initData`, tokens and codes |
| `dota-data` (later) | fetch/normalize/cache statistics with a date and source | sending messages and managing the schedule |
| `media` (later) | catalog of sources, upload, validation, card creation | determining post time, calling Telegram |
| `app/workflows` | coordination of two or more capabilities | SQL, HTTP Bot API, dependency on internal module files |
| `integrations` | low-level clients: Telegram (grammY), later Dota and render | making business decisions |
| `platform` | D1, R2, clock, logger, rate limit, HTTP client, security middleware | business entities and "magic" dependencies on modules |

Telegram is an **integration**, not a business module. `publishing` owns the `PublicationTransport` port; its adapter uses the grammY `Api` and translates responses into explicit outcomes (§5). Incoming updates are parsed by the inbound adapter `app/bot` (grammY `Bot` + `webhookCallback`). It is an entry point at the same level as HTTP routes and Cron: it only understands a command and calls the public APIs of `content`/`publishing`, so business modules depend neither on the bot nor on each other beyond public `index.ts` files. The bot is personal: commands and buttons are accepted only from the owner's Telegram ID, all others are silently ignored; the command menu is set only for the owner's private chat. In the owner's group the bot is an administrator with minimal rights (sending messages and media, pinning if needed). Error notifications to the owner go through a separate `AlertNotifier` port.

**Strict boundary rule (owner decision 03.10.2026): modules do not import each other.** A module's public `index.ts` is imported only by the `app/` layer: routes, `app/bot`, `scheduled.ts`, `app/workflows` and `container.ts`. If a module needs another's data, it declares a port of its own, and `container.ts` connects the other module's public API to it. Example: `publishing` declares `PostContentSource { getPublishable(postId, revision) }`, and `container.ts` passes a function from `content` into it — `publishing` knows nothing about `content`. A multi-module scenario goes in `app/workflows`. Deep imports and cycles are forbidden. The rule is checked by dependency-cruiser (`modules/*` → `modules/*` is an error), so a violation is caught without review. Long-running or deferred work is a job record in D1 that Cron picks up. A simple module does not grow four layers without need.

## 3. Target repository structure

```text
content-bot/
├── apps/
│   ├── frontend/                      # admin UI: see FRONTEND_ARCHITECTURE.md
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts               # fetch / scheduled only
│   │   │   ├── app/
│   │   │   │   ├── create-app.ts      # Hono: middleware, /api/v1, /webhooks/telegram
│   │   │   │   ├── container.ts       # explicit per-request dependency wiring
│   │   │   │   ├── scheduled.ts       # Cron: reconcile → dispatch
│   │   │   │   ├── bot/               # Telegram inbound adapter: grammY Bot, owner's Telegram ID only
│   │   │   │   │   ├── create-bot.ts
│   │   │   │   │   └── commands/      # thin handlers → public module APIs
│   │   │   │   ├── env.ts             # types from `wrangler types`
│   │   │   │   └── workflows/
│   │   │   ├── modules/
│   │   │   │   ├── content/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── domain/post.ts
│   │   │   │   │   ├── application/   # create-draft, update-draft, repository (port)
│   │   │   │   │   ├── infrastructure/d1-post-repository.ts
│   │   │   │   │   └── http/routes.ts
│   │   │   │   ├── publishing/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── domain/        # publication.ts, state-machine.ts, status-projection.ts
│   │   │   │   │   ├── application/   # ports.ts, schedule.ts, dispatch.ts, reconcile.ts, resolve-unknown.ts
│   │   │   │   │   ├── infrastructure/ # d1-publication-repository.ts, telegram-publication-transport.ts, classify-telegram-result.ts
│   │   │   │   │   └── http/routes.ts
│   │   │   │   └── identity/
│   │   │   │       ├── index.ts
│   │   │   │       ├── application/   # verify-init-data.ts, verify-oidc.ts, sessions.ts
│   │   │   │       ├── infrastructure/d1-session-repository.ts
│   │   │   │       └── http/auth-routes.ts
│   │   │   ├── integrations/
│   │   │   │   └── telegram/          # grammY Api factory without auto-retry; no module imports
│   │   │   ├── platform/              # database/, http/fetch-with-timeout.ts, security/, logging/, observability/, clock/
│   │   │   └── shared/                # app-error.ts, result.ts
│   │   ├── migrations/                # NNNN_<name>.sql
│   │   ├── tests/integration/
│   │   ├── wrangler.jsonc
│   │   └── vitest.config.ts
│   └── contracts/                     # Zod schemas and DTOs for the admin UI and API
├── docs/
├── .agents/                           # agent roles, skills, hooks
├── AGENTS.md
└── package.json                       # npm workspaces; versions in the lockfile
```

**No mandatory empty folders.** The tree is the target structure as implementation progresses; `dota-data` and `media` appear together with those capabilities. A simple module may consist of `index.ts`, `service.ts`, `service.test.ts`; split into layers when real complexity appears. Module tests live next to the module.

## 4. Contracts and explicit dependency injection

```ts
// publishing/application/ports.ts — the interface belongs to the consumer
export type SendOutcome =
  | { kind: 'sent'; externalMessageId: string }
  | { kind: 'rate_limited'; retryAfterSec: number }      // 429: Telegram refused, nothing was published
  | { kind: 'rejected'; code: 'CHAT_MIGRATED' | 'CONTENT_INVALID' | 'DESTINATION_UNAVAILABLE' }
  | { kind: 'unknown'; reason: string };                 // timeout, network, 5xx, ok without message_id

export interface PublicationTransport {
  send(input: { chatId: string; text: string; imageKey?: string }): Promise<SendOutcome>;
}

// app/container.ts — the ONLY place where real implementations are wired (per request/tick)
export function createPublishing(env: Env) {
  const api = createTelegramApi(env.TELEGRAM_BOT_TOKEN);      // grammY Api, no auto-retry
  const transport = new TelegramPublicationTransport(api);     // GrammyError/HttpError → SendOutcome
  const repo = new D1PublicationRepository(env.DB);
  return createPublishingService({ transport, repo, clock: systemClock });
}
```

The adapter does not throw exceptions outward: every Telegram response is turned into a `SendOutcome`, so the rule "unclear send → `unknown`" is visible in the types and verified by a test. Do not construct a client holding user state in global scope and do not pass a raw secret to the logger. `PublicationTransport` does not become a "universal sender for all social networks": incompatible channels require a separate port.

Changing the Telegram client affects only the adapter and its tests, but **not the `publishing` domain model**. Adding a Dota provider means a new `DotaDataProvider` implementation, registration and contract tests.

## 5. Reliable publishing: states and races

```text
posts:   draft → approved
jobs:    pending ──(Cron: run_at ≤ now, conditional claim)──→ claimed ──→ succeeded
            ↑                                                  │   ├──→ retry_wait ──(run_at)──→ claimed
            └──────────── cancelled (only before sending)      │   ├──→ failed
                                                               │   └──→ unknown ──(manual reconcile)──→ succeeded / pending / cancelled
                                                    audit: job_attempts
```

- `posts` is the editorial entity; `publications` is the intent to deliver a post to a specific destination (channel or group); `jobs` are attempts and leases. One state machine — one owner; we do not store two copies of the same status.
- **Cron is the only dispatcher.** Each tick: (1) reconcile — an expired lease without `send_started_at` → `retry_wait`, with `send_started_at` → `unknown`; (2) select up to N jobs (`pending`/`retry_wait`, `run_at ≤ now`) — N is small because of the Free limits (10 ms CPU, 50 subrequests and 50 D1 queries per invocation); (3) for each — conditional claim, set `send_started_at`, send, write the outcome in one `batch()`.
- **Conditional claim** (below) with a `meta.changes === 1` check. Two simultaneous Cron ticks or a retry do not create a second send.
- **`send_started_at` is written by a separate confirmed query before the Telegram call.** If the Worker crashes after sending, this mark is the only evidence that the publication may have happened.
- Telegram offers no idempotency for `sendMessage/sendPhoto`: after a timeout, "not sent" and "published without a response" are indistinguishable. Adapter outcomes (§4): `sent` → `succeeded`; `rate_limited` → `retry_wait` with `run_at = now + retry_after` + jitter (Telegram refused — retry is allowed); `rejected` → `failed` with a code and an incident; `unknown` → `unknown`, **no automatic retry**, a manual reconcile button.
- Retries only for safe cases (`rate_limited`), with a cap on attempts and exponential delay; after the last one — `failed` and an incident.
- `UNIQUE(dedupe_key)` protects against re-creating a job; a repeated client request is caught by `Idempotency-Key` (see `API_CONTRACTS.md`). If the owner deliberately publishes a post again, that is a new intent and a new `publicationId`.
- **If Queue appears later:** the message carries only `{jobId, schemaVersion}`, state stays in D1, the claim is the same; Queue merely speeds up delivery but does not own state.

### Conditional job claim

```sql
UPDATE jobs
SET status = 'claimed', attempts = attempts + 1,
    lease_until = ?1, updated_at = ?2
WHERE id = ?3 AND status IN ('pending', 'retry_wait')
  AND run_at <= ?2
  AND (lease_until IS NULL OR lease_until < ?2)
RETURNING id, publication_id, attempts;
```

For compound changes use `D1Database.batch()` (atomic transactional batches). For selecting due jobs — a partial index on `(status, run_at, id)`; keyset pagination only and small pages. No `SELECT *` over the whole history.

### Status projection for the API

`PublicationStatus` in the contracts is a user-facing projection; the interface does not depend on internal fields. Labels and colors — in the `page-spec` skill.

| Internal state | `PublicationStatus` |
|---|---|
| job `pending`, `run_at` > now | `scheduled` |
| job `pending`, `run_at` ≤ now | `queued` |
| job `claimed`, `send_started_at` empty | `preparing` |
| job `claimed`, `send_started_at` set | `sending` |
| job `succeeded` | `sent` (+ `externalMessageId`) |
| job `retry_wait` | `retry_wait` |
| job `failed` | `failed` (+ `lastErrorCode`) |
| job `unknown` | `unknown` |
| job `cancelled` | `cancelled` |

This table and its unit test change together (skill `contract-change`).

## 6. Data and migrations

Core MVP tables: `sessions` (token hash, Telegram ID, expiry), `posts`, `post_revisions`, `destinations` (channel/group, chat id), `publications` (+ `idempotency_key` and body hash, UNIQUE), `jobs`, `job_attempts`, `incidents`, `telegram_updates` (`update_id` PRIMARY KEY — protection against webhook repeats), `settings`. Later: `media_assets`, `heroes`, `hero_stats_snapshots`. The owner's Telegram ID is a Worker setting (`OWNER_TELEGRAM_ID`), not a table. UTC timestamps (epoch ms) in the DB; time zone only in the UI and schedule settings.

Example:

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  publication_id TEXT REFERENCES publications(id),
  status TEXT NOT NULL CHECK(status IN (
    'pending','claimed','retry_wait','succeeded','failed','unknown','cancelled'
  )),
  run_at INTEGER NOT NULL,
  lease_until INTEGER,
  send_started_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX jobs_due ON jobs(status, run_at, id) WHERE status IN ('pending','retry_wait');
```

In SQL migrations follow expand → migrate → contract (skill `d1-migration`). Removing a business module: stop creating its jobs; cancel/complete existing ones; remove the public registration and pass CI; drop the old tables in a **separate** migration after verification.

## 7. Working quotas and cost

The planned load is up to 1,000 **background jobs/day** (a target, not measured); in the first month realistically 20–50. Free limits we design for:

- Workers Free: 100,000 requests/day; **10 ms CPU per invocation** (network wait is not counted); 50 subrequests and 50 D1 queries per invocation; 128 MB memory; up to 5 Cron triggers per account. Cron once a minute = 1,440 invocations/day.
- The per-tick batch is bounded by subrequests and D1 queries: per job ≈ claim + mark + send + outcome write. With a batch of a few jobs, the capacity of thousands of jobs/day is above the target — **but this is a calculation, not a measurement**; it is confirmed by a load test.
- D1 Free: 500 MB per database, Time Travel 7 days. Workers Logs Free: 200,000 events/day, retention 3 days (from 01.12.2026 — a new model: 0.5 GB/day, 7 days).
- Queue (if needed): 10,000 operations/day on Free, ≈ 3 operations per message, retention 24 h.

The number of subscribers does not equal the number of Bot API requests: a post to a channel or group is sent once. Telegram limits sending to a group (about 20 messages per minute) — a 429 response with `retry_after` is handled as `rate_limited`. Large media go to R2, not D1. Image generation on the Free plan (10 ms CPU) lives outside the Worker; the decision comes after measurements.

## 8. Security and authentication

**One identity — the owner's Telegram ID** (`OWNER_TELEGRAM_ID`) for the browser admin UI, the Mini App and bot commands.

- **Mini App:** the client sends `Telegram.WebApp.initData` to `POST /api/v1/auth/telegram`. The server computes the secret as HMAC-SHA256 with key `"WebAppData"` over `bot_token`, then HMAC-SHA256 of the data-check-string with that secret, compares the hash in constant time, requires a fresh `auth_date` (≤ 15 minutes) and `user.id` matching the owner, then issues a session.
- **Browser:** sign-in via the official Telegram OpenID Connect (Authorization Code + PKCE, redirect without a popup): `/api/v1/auth/oidc/start` → `oauth.telegram.org` → `/api/v1/auth/oidc/callback`. The server verifies the `id_token` signature against Telegram's JWKS, `iss`, `aud` (bot ID), `exp`, `nonce` and the user's Telegram ID.
- **Session:** a random token (32 bytes); only its hash is stored in D1. The client keeps the short-lived access token **in memory only** and passes it in `Authorization: Bearer` — cookies do not work as the basis because the Telegram Web Mini App runs in a frame where third-party cookies are blocked. In the browser, additionally, a refresh cookie `HttpOnly; Secure; SameSite=Lax`, only on `/api/v1/auth/*`, with an `Origin` check. The main API does not accept cookies, so CSRF does not apply to it.
- **Bot webhook** `/webhooks/telegram`: the only open entry without a session. Check `X-Telegram-Bot-Api-Secret-Token` in constant time, `update_id` unique in D1, only allowed update types, commands only from the owner. The response is fast; heavy work is a job in D1.
- **Headers:** CSP with `frame-ancestors 'self'` and the domains of Telegram web clients (exact list to be clarified during implementation); no `X-Frame-Options: DENY`.
- Zod validation of all inputs (`z.strictObject`), body and upload size limits, MIME + file signature, allowlist of domains for outbound requests (SSRF). Client-side validation is UX only. Rate limit on sign-in endpoints.
- Real secrets are Wrangler secrets (set by the owner); do not commit `.dev.vars` and `.env*`. Logs mask tokens, `initData`, codes and personal data.
- A separate Telegram test environment (its own bot and channel) — once the owner sets it up; production sending in tests is forbidden. Detailed rules and checklist — skill `api-security`.

## 9. CPU, memory and waits

Workers may reuse an isolate. Mutable globals `currentUser`, `job`, `request`, and singleton mutable caches without a strict cleanup scheme are forbidden. Create a lightweight context per request; D1/R2 connections come from env; process large JSON/files as streams and limit their size. For external HTTP use `AbortSignal.timeout`/`AbortController`; limit concurrent outbound requests and the Cron batch size. Do not run uncontrolled `Promise.all()` over hundreds of jobs. `waitUntil()` is only for non-critical side effects; critical work is a D1 job for Cron. The absence of globals reduces the risk of leaks between requests, but does not remove the need for profiling and testing with real images.

## 10. Observability and incidents

Every HTTP request and job has a `requestId`/`jobId`; logs are structured JSON: `timestamp`, `component`, `operation`, `durationMs`, `status`, `errorCode`, `retryable`, `attempt`; no raw webhook body and no secrets. Important `incidents` in D1 with bounded history and a grouping mechanism. The admin UI shows: the last successful Cron, jobs by status, errors over 24 hours, Cron lag (time since the last successful tick), attempts, the `unknown` state, results of manual actions. Aggregate successes and delete old ones per a retention policy. If the Telegram error notification itself fails, save the incident in D1 without infinite recursion.

## 11. Testing and quality gates

- Domain: state machine, status projection, content formation — pure unit tests. Classification of Telegram responses (publishing `infrastructure/`) — unit tests per response class.
- Integration: Vitest 4.1 + `@cloudflare/vitest-plugin` in workerd; D1 migrations are applied via `readD1Migrations`/`applyD1Migrations`; the Cron handler is invoked through the plugin's test APIs; Telegram — a fake `PublicationTransport` and a fake grammY client via a port (we do not intercept network requests).
- Contract: real route responses are parsed by the `apps/contracts` schemas; every `PublicationTransport` passes a shared outcome test suite.
- Architecture: `dependency-cruiser` — no-circular, no-module-to-module (modules do not import each other), no-domain-imports-infra.
- Failure: two Crons at once, crash after `send_started_at`, timeout/5xx/ok without `message_id` → `unknown`, 429 → `retry_wait`, 400/403 → `failed`, repeated webhook `update_id`, command not from the owner, expired/forged `initData`, invalid `id_token`, wrong webhook secret, size limit exceeded, module removal.
- Load: 100 and 1,000 jobs/day with peaks; record CPU per tick, D1 queries, subrequests, the number of duplicates in Telegram (zero expected with normally observed responses; `unknown` — manual check).
- CI on every push/PR: `npm ci` → `npm run verify` (lint, types, boundaries, unit/integration, build). A `qa-security` review is mandatory for migrations, sign-in, the webhook and publications.

## 12. External contracts for the frontend

All admin endpoints `/api/v1/*` return stable JSON DTOs. Shared types and Zod schemas — `contracts`, with no dependencies on Hono, Cloudflare or React. On a breaking change, add an API version/compatibility parameters; the server must not break the admin UI deployed yesterday. For concurrent draft edits — `revision`, response `409 CONFLICT` on a stale save (how the revision is passed is an open question in `DECISIONS.md`). All lists use cursor pagination; UTC timestamps in ISO-8601; error: `{error:{code,message,requestId,details?}}`. The interface document is `docs/API_CONTRACTS.md`.

## 13. Changing and removing modules

1. Mark the feature disabled; forbid new jobs for it.
2. Move current jobs to a completed/cancelled status, unambiguously resolve `unknown`.
3. Remove the wiring in `app/container.ts`, routes, cron/queue type handlers.
4. Delete internal files and tests; keep or migrate public DTOs only if there are real consumers.
5. Run the dependency graph + unit/integration/E2E; update docs and open feature flags.
6. Only later delete the data with a separate SQL migration.

## 14. Acceptance before first production

- A manually created and scheduled post to a channel and to a group works; content preview.
- A forced double Cron tick does not produce two publications.
- A lost Telegram confirmation → `unknown` and a visible incident in the admin UI, with no automatic resend.
- Sign-in: in the Mini App — automatic, in the browser — via Telegram; a foreign Telegram ID gets 403; forged or expired `initData` and an invalid `id_token` are rejected.
- Webhook: wrong secret → rejection; a repeated `update_id` is processed once; commands not from the owner are ignored.
- No secrets in the frontend build and logs; a Worker restart does not lose work.
- Quotas are measured for 1,000 test jobs; the application does not depend on paid AI APIs.

## 15. Primary sources and confirmation of decisions

- Cloudflare Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Static assets and SPA: https://developers.cloudflare.com/workers/static-assets/ · Pages → Workers: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- D1 batch and limits: https://developers.cloudflare.com/d1/worker-api/d1-database/ · https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare Vitest plugin: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Telegram Mini Apps (initData): https://core.telegram.org/bots/webapps · Log in with Telegram (OIDC): https://core.telegram.org/bots/telegram-login
- Telegram Bot API: https://core.telegram.org/bots/api · grammY on Cloudflare Workers: https://grammy.dev/hosting/cloudflare-workers-nodejs
- Hono best practices: https://hono.dev/docs/guides/best-practices
- dependency-cruiser rules: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- Martin Fowler, Monolith First: https://martinfowler.com/bliki/MonolithFirst.html

**Measured performance results, real costs and the code implementation do not exist yet; this is a technical standard that must be implemented and verified.**

