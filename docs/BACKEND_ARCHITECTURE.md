# CONTENT-BOT — FINAL BACKEND ARCHITECTURE v3.1

**Date:** 03.10.2026 · **Status:** approved technical direction, implemented in DEV; sections marked "as built" describe the running code · **Load:** up to 1,000 background jobs/day; peaks are verified by load tests · **Budget:** free quotas until measured limits are reached.

> This document replaces ALL interim architectures. When it conflicts with the chat or the old README, follow it, then the approved `AGENTS.md`. When decisions change, edit this document; do not create a v4 alongside it.

## 1. Architecture principle

**Pragmatic modular monolith:** one Cloudflare Worker (Hono + TypeScript), one D1, one Cron, and a private R2 bucket per environment for media; Queue — only after measurements. Worker entry points:

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
| Telegram | grammY: commands (`webhookCallback(bot, "cloudflare-mod")`) and sending (`bot.api`) through the publication adapter; bot identity (`getMe`) is stored in D1 (`bot_identity`, one row, migration 0007) by `POST /api/v1/bot/connect` and handed to grammY as `botInfo`, so no `getMe` runs per update and no `BOT_INFO` secret is needed; a valid `BOT_INFO` is an optional override that wins over the row | the `@grammyjs/auto-retry` plugin — forbidden (it retries network errors) |
| Sign-in | Owner's Telegram ID: Mini App — `initData` (HMAC), browser — Telegram Login Widget; session token in a header | custom OTP codes and passwords; Cloudflare Access (does not work inside Telegram) |
| Tests | Vitest 4.1 + `@cloudflare/vitest-plugin`, real D1 migrations, fake Telegram via a port | Vitest 5 — until supported in the Cloudflare plugin |
| Local development | root `.env.example` is the canonical project template; Worker runtime values are copied to gitignored `apps/backend/.dev.vars`; `vite dev` with `@cloudflare/vite-plugin`, `wrangler types` | — |
| Observability | Workers Logs + `incidents` table in D1 | third-party SDKs until real traffic appears (fallback — Sentry) |
| Deploy | Workers `dev` (from `develop`, `dev.alexeevs.workers.dev`) and `app` (from `main`, `app.alexeevs.workers.dev`), each with its own D1; GitHub Actions deploys after green checks; the owner applies remote migrations before pushing code that needs them; Time Travel bookmark before migration | agents never deploy |

## 2. Boundaries: who owns what

| Area | Responsibility | Forbidden |
|---|---|---|
| `content` | drafts, publication content and format, plus post-attached media identity and order | calling Telegram, Cron, R2 directly |
| `publishing` | publication, schedule, state, retries, `jobs`, destinations (channel, group) | computing Dota statistics itself, storing raw images |
| `app/bot` (inbound adapter, not a business module) | parsing Telegram commands and button presses, replying to the owner; like HTTP routes and Cron, it calls only the public APIs of modules | business logic, direct SQL, replying to commands not from the owner; no module imports `app/bot` |
| `identity` | the owner (Telegram ID from settings), sign-in via Mini App `initData` and the Telegram Login Widget, sessions | trusting data without signature verification, logging `initData`, tokens and codes |
| `dota-data` (later) | fetch/normalize/cache statistics with a date and source | sending messages and managing the schedule |
| `media` (later) | a cross-post media library/catalog and card creation | determining post time, calling Telegram |
| `app/workflows` | coordination of two or more capabilities | SQL, HTTP Bot API, dependency on internal module files |
| `integrations` | low-level clients: Telegram (grammY), later Dota and render | making business decisions |
| `platform` | D1, R2, clock, logger, rate limit, HTTP client, security middleware | business entities and "magic" dependencies on modules |

Telegram is an **integration**, not a business module. `publishing` owns the `PublicationTransport` port; its adapter uses the grammY `Api` and translates responses into explicit outcomes (§5). Incoming updates are parsed by the inbound adapter `app/bot` (grammY `Bot` + `webhookCallback`). It is an entry point at the same level as HTTP routes and Cron: it only understands a command and calls the public APIs of `content`/`publishing`, so business modules depend neither on the bot nor on each other beyond public `index.ts` files. The bot is personal: commands and buttons are accepted only from the owner's Telegram ID, all others are silently ignored; the command menu is set only for the owner's private chat. In the owner's group the bot is an administrator with minimal rights (sending messages and media, pinning if needed). Error notifications to the owner go through a separate `AlertNotifier` port.

**Strict boundary rule (owner decision 03.10.2026): modules do not import each other.** A module's public `index.ts` is imported only by the `app/` layer: routes, `app/bot`, `scheduled.ts`, `app/workflows` and `container.ts`. If a module needs another's data, it declares a port of its own, and `container.ts` connects the other module's public API to it. Example: `publishing` declares `PostSource { findState(postId) }` (status and current revision), and `container.ts` passes a function from `content` into it — `publishing` knows nothing about `content`. A multi-module scenario goes in `app/workflows`. Deep imports and cycles are forbidden. The rule is checked by dependency-cruiser (`modules/*` → `modules/*` is an error), so a violation is caught without review. Long-running or deferred work is a job record in D1 that Cron picks up. A simple module does not grow four layers without need.

Post-attached media remains part of `content`: it owns draft attachment identity, order and the immutable approved snapshot. Content declares its own object-storage port; only the `app/container.ts` composition root wires that port to the Cloudflare R2 adapter. A future `media` module is for a separate searchable media library, not a second owner of post attachments.

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
│   │   │   │   ├── scheduled.ts       # Cron: reconcile → dispatch → archive → purge
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
│   │   │   │   ├── lifecycle/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── domain/archive-policy.ts
│   │   │   │   │   ├── application/   # delete-posts.ts, restore-posts.ts, archive-posts.ts, ports.ts
│   │   │   │   │   └── infrastructure/d1-lifecycle-repository.ts
│   │   │   │   └── identity/
│   │   │   │       ├── index.ts
│   │   │   │       ├── application/   # verify-init-data.ts, verify-widget-data.ts, sessions.ts
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

The adapter does not throw exceptions outward: every Telegram response is turned into a `SendOutcome`, so the rule "unclear send → `unknown`" is visible in the types and verified by a test. It sends text, one photo/video/animation, or one ordered photo/video album using streaming `InputFile`s; album results keep every message ID. Do not construct a client holding user state in global scope and do not pass a raw secret to the logger. `PublicationTransport` does not become a "universal sender for all social networks": incompatible channels require a separate port.

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
- Telegram offers no idempotency for send methods: after a timeout, "not sent" and "published without a response" are indistinguishable. Adapter outcomes (§4): `sent` → `succeeded`; `rate_limited` → `retry_wait` with `run_at = now + retry_after` + jitter (Telegram refused — retry is allowed); `rejected` → `failed` with a code and an incident; `unknown` → `unknown`, **no automatic retry**, a manual reconcile button.
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

### Owner actions on a job (cancel, reschedule)

Both are one `batch()` and race the dispatcher's claim on the same row, so the job statement is conditional: `UPDATE jobs … WHERE publication_id = ? AND status IN ('pending','retry_wait') AND EXISTS (publication with the expected revision)`. `claimed` is never matched (the claim SQL above is the only way in, and the only way out is the dispatcher or reconcile); `unknown` needs manual reconciliation; the rest are final. The lease is not part of the condition: a job in `pending`/`retry_wait` is not being sent, whatever `lease_until` says. The publication row (revision + 1, new `scheduled_at`/`timezone`) and the audit row are written only when the job statement changed a row (`changes() = 1`, which is why the statement order in `d1-publication-repository.ts` matters), and the last statement of the batch reads the result, so a refusal is classified from the state it was decided on: the job state first (`NOT_CANCELLABLE` / `NOT_RESCHEDULABLE`, no revision helps), then `STALE_REVISION`, and no row is `NOT_FOUND`. Reschedule moves a `retry_wait` job back to `pending` with the new `run_at` and keeps `attempts`.

**Resolve unknown (as built).** `POST /publications/{id}/resolve-unknown` (`application/resolve-unknown.ts`, `PublicationRepository.resolveUnknown`) is the only way out of `unknown`, never sends to Telegram and never retries; Cron only picks up what the owner made dispatchable again. It is the same guarded batch as cancel/reschedule, except the job statement is conditional on `status = 'unknown'` (instead of `pending`/`retry_wait`) and the publication at the expected revision. Statements, in order: the job update, the publication row (revision + 1), the audit row `publication.resolve_unknown` (actor owner; details: new revision, outcome, and the message id or the new time; never message text), `UPDATE incidents SET resolved_at = max(created_at, now) WHERE job_id = ? AND resolved_at IS NULL` (so the owner alert stops showing it and `countOpenIncidents` drops), and the read of the result. Each statement after the job update runs only if `changes() = 1` held on the previous one. Outcomes: `sent` → job `succeeded` (the archive step then archives the post like after a normal send, because the job's `updated_at` is the resolve time), `publications.external_message_id` = the id the owner entered, `last_error_code` cleared; `resend` → job `pending` with `run_at` = the new time (past times up to 5 minutes back are due at once, beyond that or over 366 days ahead is `400 SCHEDULE_OUT_OF_RANGE`, checked before the write), `send_started_at` cleared (the owner saw the message is not in the channel, and the next claim must be able to set the mark again), `last_error_code` cleared, `publications.scheduled_at`/`timezone` updated; `attempts` is kept, because `job_attempts` is keyed by it and its `unknown` row stays as history, so a resend spends from the same 5-attempt budget (an unknown on the last attempt, resent, fails with `RETRIES_EXHAUSTED` on the first retryable refusal); `cancel` → job `cancelled`. A refusal is classified from the state read inside the batch: a job that is not `unknown` is `409 NOT_UNKNOWN` (whatever the revision, so a double press gets this), then `409 STALE_REVISION`, and no row is `404`. Two concurrent requests with the same revision: the second finds the job already resolved, so exactly one applies. It sends no owner notice.

Creating a publication is one batch guarded in SQL: the publication insert needs the post still approved at the expected revision and the destination still enabled (`WHERE EXISTS` on `posts` and `destinations`, a read-only reference to the content tables the FK already implies), and every later statement (job, audit, completing the idempotency key) keys off the publication row, so a concurrent change writes nothing. `publications.scheduled_at` is the owner's intent; `jobs.run_at` is when the dispatcher may act (it diverges on `retry_wait`). `jobs.publication_scheduled_at` is a copy of `scheduled_at` used only as the sort key of the status-filtered list (index `jobs_status_scheduled_idx`, so a rare status never reads the history of sent ones); create and reschedule write it in the same batch. Reconcile reads `jobs_claimed_lease (status, lease_until) WHERE status = 'claimed'`. The due scan must repeat the `jobs_due` predicate literally (`status IN ('pending','retry_wait')`); `status = 'pending'` alone is not recognised as implying it and loses the index.

### Post lifecycle as built (archive, restore, delete, purge)

UI: `docs/design/UX_SPEC.md` §3.2. Deleting or archiving never touches the Telegram channel (owner decision 06.10.2026); nothing here calls Telegram.

**Archive is a stored fact:** `posts.archived_at` (UTC ms, migration 0008), set only by the Cron archive step and cleared only by restore. `posts.restored_at` records the last restore. Editorial `status` stays `draft | approved`; an archived post is `approved`, read-only and not schedulable (`createPublication` refuses it with 409 `POST_ARCHIVED`; the publication insert is also guarded by `posts.archived_at IS NULL`, so a create racing the archive step either sees the post live or finds nothing to schedule).

**Who owns what.** The `lifecycle` module is the only writer of `archived_at` and the only place that deletes a post; it reads and writes posts together with `publications`, `jobs`, `job_attempts` and `incidents`, because a decision on publication state and the change to the post must be one atomic batch. It names the job states it relies on: `pending`/`retry_wait` (nothing in flight: cancellable), `claimed` (preparing or sending) and `unknown` (a send that may have happened) block a delete, `succeeded`/`failed`/`cancelled` are final. `content` reads `archived_at` (list views, DTO) and gets a post's publication summary through its own port `PostPublicationSummarySource`, wired in `container.ts` to `publishing`'s `summarizeByPost`; `app/workflows/restore-post.ts` composes restore (lifecycle) with the answer (content). Modules still import nothing from each other.

**Post DTO** carries `archivedAt`, `autoDeleteAt = archivedAt + ARCHIVE_RETENTION_MS` (30 days, `src/shared/archive-retention.ts`, server-side only) and `publicationSummary` (counts for every `PublicationStatus`, `nextScheduled {scheduledAt, destinationId}` among scheduled/queued/retry_wait, `lastSentAt` = the job's `updated_at` when it succeeded, destinations of live or sent publications by title, at most 20). `summarizeByPost` is one grouped read for the whole page: post ids travel as one JSON parameter (`json_each`, D1 allows 100 parameters), rows are grouped by post, destination and job state, and the statuses come from `projectPublicationStatus`; a test pins every job state. Only approved posts are asked (a draft has no publications). Create, update and approve answer with the empty summary, which is exact: no publication can exist for a draft. A create response stored before migration 0008 lacks the new fields, so its replay fills the defaults.

**List.** `GET /posts?view=live|archive` (default live): the app-owned read query composes posts and publication facts without a module cross-import. One parameterized D1 statement returns the ordered keyset page, its `totalCount`, and `archivedCount` from one read snapshot. Defaults remain live `updated_at DESC` and archive `archived_at DESC`; optional sorts use title, update time, latest confirmed sent time (`jobs.updated_at` of `succeeded`) or expiry (`archived_at + ARCHIVE_RETENTION_MS`), with null sort keys last and `id` as a deterministic tie-breaker. Title uses the persisted `posts.title_sort_key`, produced by the content module's ru-RU base/numeric key function; migration 0021 adds the column and indexes, and `scripts/backfill-post-title-sort-keys.mjs` repairs existing local or DEV rows in bounded batches. Content writes title and key together; a trigger invalidates a stale key if an older Worker edits a title during rollout. The cursor is bound to view, sort, direction, status and a hash of the query. Search covers title/body, current destination titles that appear in the publication summary, and the displayed post state; relative/date strings are excluded because they vary with time and timezone. Migration 0020 adds FTS5 trigram indexes for case-insensitive Unicode substring matching on post text and destination titles, maintained by triggers. Search terms shorter than three Unicode code points use a Russian/ASCII case-fold fallback because trigram MATCH needs at least three. DTO hydration follows the fixed page IDs through content's public API.

**Delete (single and bulk) is one batch** for all requested posts, set-based over a CTE `target(id)` built from `json_each` of `[{id, revision}]`: a post is in the target when it exists, the revision matches and no publication has a job `claimed` or `unknown`. Statements, in order: report of the waiting (`pending`/`retry_wait`) publications (read before anything is removed), audit row `post.delete` (counts of cancelled and removed publications, no text), then deletes of `job_attempts`, `incidents`, `jobs`, `publications`, `post_revisions` and finally `posts ... RETURNING id`, then a read of each requested post's state. Each statement recomputes the same target; the batch is a transaction and only a post's own rows disappear, so an eligible post stays eligible to the last statement and a blocked one is never touched. Cancelling is therefore the removal of the waiting job in the same transaction as the post: a dispatcher claim that wins first (job `claimed`) makes the post refuse, one that loses finds no job (`lost`); nothing is ever sent for a deleted publication. A refused post is classified from the state read inside the batch, what a publication is doing first: `PUBLICATION_UNKNOWN`, `PUBLICATION_IN_PROGRESS` (both with `publicationId`), then `STALE_REVISION`, and a missing post is `NOT_FOUND` (also "already deleted", so a retried request is harmless). The single endpoint is the bulk with one item mapped to 404/409; the bulk answers 200 with per-item results in request order. Incidents and attempts of the removed publications go with them; `audit_log` keeps the `post.delete` row. Idempotency keys of `POST /posts` are not touched (they expire on their own).

**Restore** is one batch (audit `post.restore`, `UPDATE posts SET archived_at = NULL, restored_at = now, updated_at = now WHERE ... archived_at IS NOT NULL AND revision matches RETURNING id`, state read). The revision is not bumped (no content changed), the post returns to the top of the live list, and no publication or job is created. Refusals: `NOT_FOUND`, `NOT_ARCHIVED`, `STALE_REVISION`.

**Archive step** (every Cron tick, after dispatch). A post qualifies when it is `approved`, not archived, has a publication whose job `succeeded` after `restored_at`, and none with a job `pending`, `claimed`, `retry_wait` or `unknown` (`failed`/`cancelled` do not block, but a post with only those never qualifies: it stays «Одобрен»). The read starts from jobs that reached a final state inside a lookback window (`jobs_final_updated_idx`, a partial index on `updated_at`, pinned with `INDEXED BY` because without table statistics SQLite picks `jobs_status_scheduled_idx` and would read the history): 15 minutes on a regular tick, 48 hours on the hourly tick (the safety net for ticks that failed). A post whose last publication finished before the window is not archived by the step (a Cron outage longer than 48 hours would leave it in the live list); posts published before this release are covered by the one-time backfill in migration 0008 below. The write is one batch of two statements for up to 25 posts (audit `post.archive` with actor `system`, then `UPDATE ... archived_at = now RETURNING id`), each re-checking every condition per post; a second overlapping tick, a post that got a new publication, or one restored in between changes nothing. The restore rule (`updated_at > restored_at`) is why a restored post is not put straight back, while a new publication that is sent archives it again.

**Purge step** (the tick of UTC minute 30, and only when that tick found nothing due, so a busy tick spends nothing on housekeeping; the next hour retries). One read of up to 50 archived posts with `archived_at <= now - 30 days` that have no `claimed`/`unknown` job (`posts_archive_idx`, oldest first), then the same delete batch as above with a cutoff instead of revisions: the post must still be archived and expired at write time (a restored post is skipped), and a post with an `unknown` or in-flight publication is never deleted, so its incident and attempt data stay until the result is reconciled. Audit `post.purge`, actor `system`. Idempotent and overlap-safe: the second tick finds nothing. `job_attempts` and `incidents` of purged posts go with them.

**Error reasons** (all `CONFLICT` 409 `details.reason`, no new `ApiErrorCode`): delete `STALE_REVISION | PUBLICATION_IN_PROGRESS | PUBLICATION_UNKNOWN`; restore `STALE_REVISION | NOT_ARCHIVED`; schedule `POST_ARCHIVED`.

### Owner notice on schedule (as built)

After a publication is created for a future time, or rescheduled to one, the bot sends the owner's private chat (`chat_id` = the session's Telegram ID) one message: post title (the first words of the text if it has none), channel, and the time in the zone the owner scheduled in (`publications.timezone`; the settings module stores no zone), with a `web_app` button «Подробнее» to `<origin>/publications?id=<publicationId>`. If the selected revision has media, the first attachment is sent with that notice as one media message; otherwise it is a text message. The text/caption is Telegram HTML with every user-controlled part escaped. `publishing` owns the port `ScheduleNotifier` (`application/ports.ts`); the use cases call it only after the guarded D1 write applied, so an idempotent replay, a refused request, a send-now publication (status `queued`) or a move to "now" announce nothing. The adapter `app/notifications/create-schedule-notifier.ts` is wired in `publications-routes.ts` and runs in `ctx.waitUntil` with no retry; the Telegram send call has a 5 s deadline (the two D1 reads before it do not). It is best effort: any failure, or a missing `TELEGRAM_BOT_TOKEN`, ends as a log line (`component: owner_notice`, stable `errorCode`, no text, token or payload; a Telegram failure also adds the shared `component: telegram` line), never as a changed response. It is not the publishing transport and never reads or writes jobs. Its two reads (revision snapshot, destination) count toward the per-invocation D1 budget (pinned in `query-budget.test.ts`).

### Bot as the entry point (as built, plan step 1a)

**Webhook.** `app/bot/webhook-route.ts` checks the secret header in constant time, loads the bot identity and builds a grammY `Bot` per request. The middleware chain is: failure catch (the webhook always answers 200 once past the secret, so Telegram never redelivers an update whose reply may be out), owner check (`from.id === OWNER_TELEGRAM_ID`; everyone else is dropped silently and their update id is not stored), private chats only, then dedup. **Dedup:** `webhook_updates.update_id` is a PRIMARY KEY; `INSERT ... ON CONFLICT DO NOTHING` and `changes === 1` means first sight, a replay ends without a reply. The same batch deletes at most 5 rows older than 3 days, so the table needs no Cron step. A claimed update whose handler then fails is not retried (the owner sends it again); a crash between claim and reply loses that one update, which is preferred to a second draft.

**Owner commands** (registered with `setMyCommands` for the owner's chat scope on `/start` and on connect; the owner presses `/start` once after a deploy that changes the list). Every answer is Telegram HTML with one `web_app` button; a failed read is answered with «Не удалось получить данные. Попробуйте ещё раз.» and logged with a stable code.
- `/start`: «Студия на связи. Откройте её кнопкой ниже.», button «Открыть студию» → `<origin>/`. In the background it stores the origin (below) and refreshes the commands and the menu button.
- `/today`: the day's publications by scheduled time, counted by status (`summarizeRange`, one grouped read over at most 500 rows): «План: ждут отправки N, ближайшая в HH:MM.» and «Итоги: отправлено…, не отправлено…, неизвестно…, отменено….»; button «Открыть студию» → `<origin>/`.
- `/next`: the next 5 jobs to run (`listUpcoming`, the `jobs_due` partial index, retries included), one line each (`15 янв., 12:00 · Канал · Название`, titles by primary-key lookup); button «Все запланированные» → `<origin>/publications?status=scheduled`.
- `/status`: «Публикация: включена | выключена | включена, но не задан токен бота», «Cron: последний запуск N мин назад, без ошибок | с ошибкой (давно: проверьте Cron when older than 3 min) | нет данных о запусках», «Проблемы: неизвестно N, не отправлено N, открытых инцидентов N | проблем нет». Counts stop at 5, 5 and 20 (shown as `5+`); button «Разобраться» → `<origin>/publications?status=unknown` (else `failed`) when there is a problem, otherwise «Открыть студию» → `<origin>/`.
- **Time zone.** Settings store none, so the day boundaries and times use the zone of the publication with the latest scheduled time, or `Europe/Moscow` while there is none (`app/bot/owner-time.ts`; a zone the runtime does not know falls back to Moscow too). The zone is printed in the answer. A day is the local calendar day (23 or 25 hours across a clock change).
- Reads go through `PublicationRepository` (`list`, `listUpcoming`, `summarizeRange`), `DispatchRepository.countOpenIncidents` (bounded count over `incidents_open_idx`), `PostRevisionSource` and the system state; each command costs about 3-8 statements, every SELECT has a LIMIT or is a primary-key lookup (pinned in `bot-entry-point.test.ts` with EXPLAIN checks).

**Drafts.** Any other text from the owner (typed or forwarded; an unknown `/command` is ignored) becomes a draft through `createPost` with the idempotency key `tg-update-<update_id>`. A draft from a message has no entities (`entities: []`): **Telegram formatting (bold, links, and so on) is not carried over**. The first line becomes the title; the rest is the body; a first line over 200 UTF-16 units is cut at the limit (never inside an emoji) with «…» and its remainder starts the body, so nothing is lost. A body over 4096 UTF-16 units, or a control character, is refused with a reply and no draft. Reply: «Черновик создан», button «Открыть» → `<origin>/posts/<id>`.

**Owner alerts.** When a tick writes an incident (`publish_failed` or `publish_unknown`, from the dispatcher or reconcile), `DispatchSummary.raised` / `ReconcileSummary.raised` return it after the guarded D1 batch applied. Step 6 of the tick (`alertOwnerOfIncidents`, `app/notifications/`) reads the stored origin, claims all incidents with one `UPDATE incidents SET owner_notified_at = ? WHERE id IN (...) AND owner_notified_at IS NULL RETURNING id`, then sends one message per claimed incident (5 s deadline, no retry, in parallel). The claim comes first, so an incident is alerted at most once however many ticks overlap, and a failed alert is not repeated. A failure (Telegram, D1, no bot token, no owner id, origin not known yet) is one log line `component: owner_alert` with a stable `errorCode` (`BOT_TOKEN_MISSING`, `OWNER_ID_MISSING`, `APP_ORIGIN_UNKNOWN`, `ALERT_STATE_UNAVAILABLE`, `UNAVAILABLE`, `RATE_LIMIT`) and never changes job state; the alert writes no incident of its own, so there is no recursion: if the Telegram error notification itself fails, the incident is already saved in D1. A tick without incidents spends nothing. Incidents that existed before migration 0009 are marked notified. There is no periodic check of channel rights: loss of rights is seen only as a send that fails with `DESTINATION_UNAVAILABLE`, whose alert says so. Templates: failed «Публикация не отправлена / Пост / Канал / Причина»; unknown «Отправка не подтверждена / Пост / Канал / Сообщение могло выйти в канал. Проверьте канал вручную: бот не отправит его повторно сам.»; button «Открыть» → `<origin>/publications?id=<id>` (without a publication: `<origin>/publications?status=failed|unknown`). Post and channel lines appear when the dispatcher had them in hand (reconcile has none).

**System state (`system_state`, migration 0009).** `cron_last_run` is one upsert at the end of every tick (also a failed one); it is why an idle tick now costs 3 reads and 1 write. `app_origin` is stored by `/start` and by connect, because Cron has no request to learn the Worker's public origin from; alerts are skipped (`APP_ORIGIN_UNKNOWN`) until one of them ran. A deployment before the migration logs `heartbeat` / `ALERT_STATE_UNAVAILABLE` and keeps ticking.

**Owner instructions: webhook registration and its status.** Secrets are set by the owner: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` (1-256 characters of `A-Za-z0-9_-`). Apply migration 0009 to the environment's D1 first. Then press «Подключить бота» on Обзор (system status): the Worker calls `getMe`, `setWebhook` (`<origin>/webhooks/telegram`, the secret as `secret_token`, `allowed_updates: message, callback_query`), clears stale command lists, sets the owner's commands and menu button and stores the origin. Status (`GET /api/v1/bot/status`, shown in the system status) reads `getWebhookInfo`: the expected URL, `pointsHere`, `pendingUpdateCount`, `lastErrorAt` and message. Without the UI: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"` (do not paste the token anywhere shared) and, to register by hand, `curl -F url=<origin>/webhooks/telegram -F secret_token=<SECRET> -F 'allowed_updates=["message","callback_query"]' "https://api.telegram.org/bot<TOKEN>/setWebhook"`. Then send `/start` to the bot.

### Dashboard and incidents as built

Three endpoints (`app/dashboard-routes.ts`, `app/incidents-routes.ts`; use cases and SQL in `publishing`, repositories `DashboardRepository` and `IncidentRepository`). Their SQL reads `post_revisions` (the title of the revision a publication sends) and `destinations` read-only, joined by primary key, like the create guard that already reads `posts`; no post body is ever selected.

- `GET /api/v1/dashboard?from&to`: `from`/`to` are the UTC instants of the owner's day, chosen by the client (the server never guesses a zone; `to` after `from`, at most 48 h apart). One `db.batch` of five statements, each bounded: (a) open incidents, `unknown` before `failed`, newest first, two walks of `incidents_open_idx` with LIMIT 5, joined to their publication by key, carrying the capped open count; (b) stuck publications: `pending` jobs with `run_at` more than 10 minutes in the past (`STUCK_AFTER_MS`, a server constant), walked through `jobs_due`, LIMIT 5, carrying their capped count; (c) the day, `publications_scheduled_idx` range, LIMIT 8 and a count over a bounded subquery (cap 100); a cancelled publication is not going out and is left off; (d) upcoming: the same two-branch `jobs_due` walk as `/next`, from `to` on, LIMIT 5; (e) recent sent: `jobs_status_scheduled_idx` for `succeeded`, latest scheduled first, LIMIT 5. Attention is incidents then stuck, cut to 5; `attentionTotal` = open incidents + stuck, capped at 99. A sent row has a `messageUrl` (`https://t.me/<username>/<messageId>`) only when the destination was saved with a public `@username`; a numeric chat id has no public link. Titles are cut to 120 characters in SQL. Total cost: 1 session read + 1 batch (5 statements); EXPLAIN pins in `tests/integration/dashboard.test.ts`.
- `GET /api/v1/incidents?state&kind&cursor&limit`: one batch of the page and the open count (capped at 99). Open incidents walk `incidents_open_idx` ordered `(created_at, id)`, resolved ones `incidents_resolved_idx` (or `incidents_resolved_kind_idx` with a kind filter) ordered `(resolved_at, id)`, so the history lists the most recently closed first; the cursor is the keyset of that order. `attemptCount` is a correlated count over `job_attempts` (primary key prefix, bounded at 50); the incident's `details` are never returned (they hold no `requestId`: an incident is written by Cron, not by a request).
- `POST /api/v1/incidents/{id}/resolve` acknowledges a `publish_failed` incident only. One guarded batch: `UPDATE incidents SET resolved_at = max(created_at, now) WHERE id = ? AND kind = 'publish_failed' AND resolved_at IS NULL`, an audit row `incident.resolve` (`INSERT ... SELECT ... WHERE changes() = 1`, details `{code}`), and a read of the row. Two presses at once: one UPDATE wins, the other changes nothing and writes no audit row, and both answer 200 with the same row. It never touches the publication or the job: nothing is retried or sent. A `publish_unknown` incident is `409` `CONFLICT` `details.reason = USE_RESOLVE_UNKNOWN`, whatever its state: only `resolve-unknown` closes it. A missing or malformed id is `404`.

### Destination check (`POST /api/v1/destinations/check`)

A read-only look at Telegram before a destination is saved; nothing is stored, so there is no state to reconcile and a failure is safe to repeat. The `publishing` module owns a `ChatInspector` port; its adapter (`infrastructure/telegram-chat-inspector.ts`) makes at most three Bot API calls, each with its own 8 s `AbortSignal.timeout`, without retry: `getChat`, then `getMe` (skipped when the `BOT_INFO` override carries the bot `id`), then `getChatMember(canonical chat id, bot id)`. `domain/bot-posting-rights.ts` decides `BOT_NOT_MEMBER | BOT_NOT_ADMIN | BOT_CANNOT_POST` (channel: administrator with `can_post_messages` or creator; group: member or administrator not restricted from sending, honouring the group's default `permissions.can_send_messages`). Outcomes: a private chat is 400 `NOT_A_CHANNEL_OR_GROUP`; Telegram 400 "chat not found" or 403 is 404 `CHAT_NOT_FOUND`; a `getChatMember` 400 "member list is inaccessible" (a public channel where the bot is not an administrator) is `BOT_NOT_MEMBER`, not 503; 429 is 429 `RATE_LIMIT` with `Retry-After` (`AppError.retryAfterSec`, clamped to 1-3600 s); timeout, network, 5xx, a bad bot token (401/404 from Telegram, never mapped to 401 so the client does not sign out), a missing token or an unexpected response shape is 503 `UNAVAILABLE`. `alreadyAddedId` is one D1 read: `chat_id IN (numeric id, @username)` (the column is `COLLATE NOCASE`). The route has its own rate-limit bucket (`destination-check`, 20 per 10 minutes per client) because every call costs Telegram requests. Logs carry only a stable failure code (`timeout`, `telegram_http_<code>`, `network_error`), never the Telegram description, chat id or token.

### The Cron tick as built (stage 4a)

`scheduled` → `app/scheduled.ts`, once a minute (`"* * * * *"`, UTC). Steps run in this order and each is isolated: a failing step is logged with a stable `errorCode`, the later ones still run, and the tick ends with an error so the Cron invocation shows as failed.

1. **Reconcile** (always, even with the kill switch off). One read through `jobs_claimed_lease` (`status = 'claimed' AND lease_until < now`, 1 row per tick), then one guarded batch for them. Without `send_started_at`: `retry_wait` with `run_at = now + backoff + jitter`, or `failed` / `RETRIES_EXHAUSTED` + incident once the attempts are used up (a Worker that keeps dying cannot loop for ever). With `send_started_at`: `unknown` + incident `SEND_UNCONFIRMED`. Each attempt that has no row gets one (`outcome` `lease_expired` or `unknown`; its `started_at` is the job's last write, so approximate). Every statement is guarded by the same conditions as the job update (`status = 'claimed'`, the same `attempts`, the lease expired, the same send-mark state): a dispatcher that finishes between the read and the write wins and reconcile writes nothing.
2. **Dispatch** (only when `PUBLISHING_ENABLED` is exactly `"true"` and `TELEGRAM_BOT_TOKEN` is set; a missing or whitespace-only token logs `BOT_TOKEN_MISSING` every tick and claims nothing). One due scan for up to **3** jobs, then each job to the end before the next one:
   - the due scan repeats the `jobs_due` predicate literally in two branches (`pending`, `retry_wait`), each `ORDER BY run_at, id LIMIT n`, merged oldest-first. A single `IN` with one `ORDER BY` would read every due row to sort it; this reads at most 2 x n whatever the backlog;
   - conditional claim (SQL above, lease 2 min, `changes === 1`); `RETURNING` gives the attempt number that guards every later write;
   - load the publication's destination (`publications JOIN destinations`) and the post revision snapshot `post_revisions (post_id, revision)` at `publications.post_revision`, through the consumer-owned `PostRevisionSource` port wired in `container.ts` to the content module;
   - refusals before any send: destination disabled → `failed` `DESTINATION_DISABLED`; revision missing, empty text without media, text over 4096, media caption over 1024, unsupported album composition, or stored entities that no longer fit (`validatePostEntities`) → a visible failed state. Posts with media use caption length ≤1024; 2–10 photo/video assets may be one media group; animation is only allowed alone. No text is truncated or split. Every refusal writes the attempt row (`outcome = 'skipped'`), incident, `publications.last_error_code` and audit row in one guarded batch and never calls Telegram;
   - `send_started_at` in its own statement, `WHERE status = 'claimed' AND send_started_at IS NULL AND attempts = ? AND lease_until >= now + 15 s`. The last condition makes the lease outlive the call (timeout 10 s) and the outcome write; if it is not met (or `changes !== 1`) nothing is sent and reconcile recovers the job. Only a confirmed mark allows the call;
   - one `PublicationTransport.send` (grammY `Api` without auto-retry, `AbortSignal.timeout(10 s)`), never throws: an unexpected throw is also `unknown`;
   - one guarded batch for the outcome (attempt row, incident, publication, audit, then the job update last), guarded by `status = 'claimed'` and the same attempt; if the first write throws, the job and its attempt row are re-read: a write that committed and lost its response counts as applied, otherwise it is repeated once (guarded, so a repeat cannot duplicate). One such retry is allowed per tick; the next failing write ends the tick (the job is recovered by reconcile). If a write is not applied, reconcile resolved the job first and its state stands.

   | Outcome | job | attempt `outcome` / `error_code` | incident |
   |---|---|---|---|
   | sent | `succeeded`, `publications.external_message_id` (first) and `external_message_ids` (all) | `sent` | no |
   | 429 | `retry_wait`, `run_at = now + max(retry_after, backoff) + jitter (0-5 s)`, `send_started_at` cleared | `rate_limited` / `RATE_LIMITED` | no |
   | 429 on attempt 5 (`MAX_ATTEMPTS`) | `failed` | `rate_limited` / `RETRIES_EXHAUSTED` | `publish_failed` |
   | 400 migrate / content / 403 / chat not found | `failed` | `rejected` / `CHAT_MIGRATED`, `CONTENT_INVALID`, `DESTINATION_UNAVAILABLE` | `publish_failed` |
   | 401 / 404 from the Bot API (wrong token) | `failed`, and the tick stops dispatching | `rejected` / `BOT_UNAUTHORIZED` | `publish_failed` |
   | timeout, network, 5xx, unparsable, ok without id, transport threw | `unknown`, never retried automatically | `unknown` / `SEND_UNCONFIRMED` (the reason is in the incident `details`) | `publish_unknown` |

3. **Archive** (every tick, even with the kill switch off): see "Post lifecycle as built". One indexed read of the jobs that finished inside the lookback window; only when it finds a qualifying post, one batch of two statements.
4. **Purge** (tick of minute 30, only when nothing was due): one read; only when it finds expired posts, one batch of seven statements (audit row, five child deletes, the posts).
5. **Cleanup**, only on the tick whose scheduled time has UTC minute 0 (read from `controller.scheduledTime`; no state between invocations). Per table at most 100 rows: expired `idempotency_keys`, old `rate_limits` windows, expired `widget_sign_ins`, and ended sessions (revoked, or past both token and hard expiry, 24 h grace) with their `refresh_tokens` deleted first (no `ON DELETE`). Two round trips (platform tables, identity tables). Detached/staged private R2 media is a separate bounded batch (at most 5 objects) on an idle hourly tick; cleanup never delays publication work. `job_attempts`, `incidents` and `audit_log` are not purged yet (retention policy pending).

**Message format.** Telegram text is sent as plain `text` plus `entities`, never with a `parse_mode`: trimmed title, blank line, trimmed body. Media captions use the same serialization and entities but are capped at 1024; text-only sends are capped at 4096. The title is a `bold` entity at offset 0; approved-body entities are shifted by `title.length + 2` (UTF-16 units). Trimming clips and shifts entities, dropping any left empty. `link_preview_options.is_disabled = true` is explicit for text. Media bytes are read from private R2 as streams and passed to grammY `InputFile`; there is no intermediate whole-file buffer. A mixed 2–10 photo/video group is one `sendMediaGroup` call, with caption/entities on its first item only. Animation in a group, overlong captions, or unsupported combinations fail before the send mark; there is no silent split or truncation. On success, `external_message_ids` stores every result ID and `external_message_id` remains the first for compatibility.

**Idle tick.** With nothing expired, nothing due and nothing finished lately the tick is three indexed `SELECT`s (reconcile, due scan, archive scan; two when publishing is off), no token lookup, no Telegram call, no write, one log line. The archive scan reads the jobs that finished in the last 15 minutes (48 hours on the hourly tick), so its cost follows the recent publishing rate, not the history. Cleanup and purge are not part of it (hourly only). The test pins the query count and a small `rows_read` over 300 finished jobs older than the window.

**Budget per invocation** (Free: 50 D1 queries and 50 subrequests). Per job: 5 round trips (claim, target, revision, send mark, outcome batch), at most 9 statements, 1 subrequest. True worst tick (1 reconciled claim with an incident, 3 jobs of which two end with an incident and one is sent, one outcome-write retry with its re-read, hourly cleanup, and the archive step archiving the sent post): 27 round trips and 50 statements (47 plus the origin read and the alert claim of the owner alerts, and the heartbeat upsert), 6 subrequests (3 sends and 3 alerts), so it fits 50 with no statement to spare even if every statement of a batch were counted as a query (unverified; the repo counts a batch as one). The purge runs on another tick and only when nothing was due: its worst is 6 round trips and 12 statements (reconcile, due, archive scan, expired scan, 7 for the delete, the heartbeat). A test pins these numbers. Calculation, not a load test.

**Wrong token.** A 401/404 fails the job that met it (`BOT_UNAUTHORIZED` + incident) and ends the tick's dispatching, but the next tick will fail the next due job the same way until the token is fixed: switch `PUBLISHING_ENABLED` off first, then fix the secret.

**Settings.** `PUBLISHING_ENABLED` (var in `wrangler.jsonc`, per environment; anything but `"true"` is off; `/api/v1/health` `publishingEnabled` reports the effective state, switch on and token present), secret `TELEGRAM_BOT_TOKEN`. Cron Triggers are declared per environment (`triggers.crons`: `dev` every minute, `production` `[]`), so what runs does not depend on how Wrangler inherits `triggers`; `vars` are not inherited and are repeated per environment.

## 6. Data and migrations

Core MVP tables: `sessions` (token hash, Telegram ID, expiry), `posts`, `post_revisions` (both carry `entities`, migration 0011: a JSON array in the normal form, `json_valid` and at most 16 384 characters, default `'[]'`; every revision snapshot, including the approved one, stores its own list, so the sent text and its formatting never drift; the same migration rebuilds `idempotency_keys` to raise the stored-response cap from 16 384 to 32 768 characters, since a maximum post now serializes to about 26 KB), `idempotency_keys` (scope = Telegram ID, UNIQUE with the key; an in-flight claim is a 60 s lease, a completed one replays for 24 h), `audit_log` (metadata only, written in the same batch as the change), `destinations` (channel/group, chat id), `publications` (+ `idempotency_key` and body hash, UNIQUE), `jobs`, `job_attempts`, `incidents`, `webhook_updates` (`update_id` PRIMARY KEY — protection against webhook repeats, migration 0009), `system_state` (the last Cron run and the Worker origin, migration 0009), `settings`, `bot_identity`, `media_assets`, `post_media`, `post_media_uploads`, and `post_media_cleanup` (migration 0016); migration 0017 stores all publication message IDs while retaining the legacy first ID, and 0018 adds keyset indexes for retained-media library queries. The owner's Telegram ID is a Worker setting (`OWNER_TELEGRAM_ID`), not a table. UTC timestamps (epoch ms) in the DB; time zone only in the UI and schedule settings.

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

`job_attempts (job_id, attempt)` is the audit of finished attempts: `started_at`, `finished_at`, `outcome` (`sent`, `rate_limited`, `rejected`, `unknown`, `skipped`, `lease_expired`), `error_code`, `retry_after` (seconds), `external_message_id`; the primary key makes a replayed write fail instead of duplicating. `incidents (id)`: `kind` (`publish_failed`, `publish_unknown`), `publication_id`, `job_id`, `code`, `created_at`, `resolved_at`, `details` (valid JSON, at most 1 KB, metadata only); `incidents_open_idx` is partial on `resolved_at IS NULL`. Migration 0010 adds the resolved-history indexes: `incidents_resolved_idx (resolved_at DESC, id DESC)` and `incidents_resolved_kind_idx (kind, resolved_at DESC, id DESC)`, both partial on `resolved_at IS NOT NULL` (expand only, no data change). Both are written in the same batch as the job's new state (migration 0005, which also adds `sessions_expires_idx` and the partial `sessions_revoked_idx` for the hourly cleanup).

`settings (key)` (migration 0006) holds one JSON document per owner setting; the CHECK allows only known keys (today `appearance`), `value` is bounded valid JSON, `revision` starts at 1 and no row means "never saved" (the API answers defaults at revision 0). A save is one batch of the audit row and a write guarded by the revision (an insert guarded by `NOT EXISTS` for the first save), so a stale or concurrent save changes nothing and answers 409 `STALE_REVISION`. A stored document that no longer parses is logged (`SETTINGS_CORRUPT`) and read as defaults at the stored revision, so the next ordinary save repairs it; a revision that is not a safe positive integer is reported as 1 (the save guard treats such a row as revision 1) and an unusable `updated_at` as null.

`dashboard_layout` (migration 0012, expand only) is a single-row table (`id` CHECKed to 1) with the owner's Обзор widget layout: `value` (a bounded valid JSON array of widgets, at most 8 KB, parsed with the contract schema on every read), `revision` (an integer, at least 1), `updated_at`, `updated_by`. It is a table of its own rather than a `settings` key because that table's CHECK lists the known keys and SQLite cannot widen a CHECK without rebuilding the table. No row means "never saved" (the API answers `{ revision: 0, widgets: [] }`). A save is the same guarded batch as `settings` (audit row `settings.dashboard_layout.update` with the revision and widget count, then a write guarded by the revision, or by `NOT EXISTS` for the first save), so a stale or concurrent save changes nothing and answers 409 `STALE_REVISION`. A stored value that no longer parses is logged (`SETTINGS_CORRUPT`) and read as an empty layout at the stored revision, so the next ordinary save repairs it. Apply migration 0012 to an environment's D1 before the code reaches it (the two routes fail without the table).

`bot_identity` (migration 0007) is a single-row table (`id` is CHECKed to 1) with the bot's `getMe` answer: `bot_id`, `info` (bounded valid JSON, parsed with Zod on every read) and `updated_at`. It is machine-written system state, so it is not a `settings` key (those are owner-edited documents behind a CHECK on their key list). `POST /api/v1/bot/connect` upserts it; the status and the webhook read it with one primary-key lookup when no `BOT_INFO` override is set. A row that no longer parses is logged (`BOT_IDENTITY_CORRUPT`) and read as absent; a row whose `id` differs from the id in the bot token (the token was replaced) or a token without a readable id is not used (`BOT_IDENTITY_MISMATCH` is logged for the first case), and connecting again rewrites the row. Code deployed before the migration reaches a database without the table: the store maps SQLite's "no such table" to 503 `UNAVAILABLE` with `details.reason = MIGRATION_PENDING` (logged as that code) on status, connect and the webhook, so apply 0007 to an environment's D1 before pushing code that needs it. A `BOT_INFO` override never touches the table.

`posts.archived_at` and `posts.restored_at` (migration 0008, both nullable, expand only) belong to the post lifecycle. The migration also backfills once: every post that already qualifies (approved, a sent publication, nothing scheduled, queued, preparing, sending, retry_wait or unknown) gets `archived_at` = the time the migration is applied (plus a `post.archive` audit row, `details.reason = backfill`), so the 30-day retention starts at deploy and nothing already published is purged early. Chosen over an hourly scan without a window because it is a bounded set-based statement run once, costs nothing on any tick afterwards, and keeps the Cron step's bounded cost; the test runs the migration's own statements against seeded data. Two plain indexes, `incidents_publication_idx` and `incidents_job_idx`, let the delete find a post's incidents without scanning the table. **Apply migration 0008 to an environment's D1 before the code reaches it** (every post query reads `archived_at`, so code ahead of the migration fails on every post read). The indexes: the partial `posts_archive_idx (archived_at DESC, id DESC) WHERE archived_at IS NOT NULL` serves the archive list, its count and the purge scan, and the partial `jobs_final_updated_idx (updated_at) WHERE status IN ('succeeded','failed','cancelled')` serves the archive scan. The live list keeps `posts_updated_idx` / `posts_status_updated_idx` and skips archived rows; those indexes can be narrowed to live posts in a later migration if the archive ever grows.

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
- **Browser:** sign-in with the classic Telegram Login Widget (owner decision 06.10.2026: BotFather shows only the domain for this bot, no OIDC client credentials; no new secret, verification uses `TELEGRAM_BOT_TOKEN`). The SPA embeds the widget and listens for its `auth_user` postMessage from the `oauth.telegram.org` iframe (exact origin and source checks; no `data-onauth`, which needs `unsafe-eval`), so the signed user object reaches JavaScript and never a URL, and posts it as JSON to `POST /api/v1/auth/telegram-widget`. OpenID Connect can replace this method later without touching sessions: only the route that creates the browser session changes.
  - Verification ([login-legacy](https://core.telegram.org/widgets/login-legacy)): `secret_key = SHA256(bot_token)` (raw bytes); `data_check_string` is every received field except `hash`, sorted by key, `key=value` joined by `\n`; hex HMAC-SHA256 of it with `secret_key` is compared with `hash` in constant time. Values are rendered with JavaScript `String()`: strings verbatim, integers (`id`, `auth_date`) as decimal digits, exactly as the widget callback delivers them. Extra scalar fields Telegram may add are accepted and covered by the hash; a field that is sent but not signed, or a value that renders differently (a boolean, a non-integer number), changes the string and fails closed. Field names must be `[a-z][a-z0-9_]{0,31}` and values must not contain a newline, so the string cannot be read in two ways.
  - Then `auth_date` must be at most 15 minutes old and at most 60 s ahead of the injected clock, and `id` must equal `OWNER_TELEGRAM_ID` (empty means nobody: 403 for a valid signature, 401 for a forged one). Missing `TELEGRAM_BOT_TOKEN` is 503. Bad, stale, future or reused signatures all answer the same 401 message; another user is 403.
  - One-time use: the SHA-256 of the widget `hash` is the primary key of `widget_sign_ins` (migration 0004), kept 30 minutes (a payload can pass for 16 minutes at most). One `batch` purges up to 20 expired rows, claims the key with `INSERT OR IGNORE`, and inserts the session and its first `refresh_tokens` row only `WHERE` the claim row carries this request's session id. A replay, sequential or concurrent, loses the claim (`changes = 0`), creates nothing and gets 401. Cost: 2 D1 round trips (rate limit, this batch); a bad signature costs 1.
  - The session is `kind = 'browser'` with the signed first and last name (cleaned, at most 64 code points), `hard_expires_at = now + 90 days`, an access token of 60 minutes and a 30-day refresh token. The response is `AccessTokenDto` with `Set-Cookie: refresh_token` (same attributes as on refresh) and `Cache-Control: no-store`.
  - `Origin` must equal the request origin (403 otherwise, before anything is read); the route shares the sign-in rate limit bucket with `/auth/telegram`; the body is limited to 8 KB (413).
  - Nothing of the payload, hash or tokens is logged.
- **Session:** a random token (32 bytes, base64url); only its SHA-256 hash is stored in D1 (`sessions.token_hash`). The access token lives 60 minutes and travels in `Authorization: Bearer`; the client keeps it **in memory only** — cookies do not work as the basis because the Telegram Web Mini App runs in a frame where third-party cookies are blocked. `sessions.hard_expires_at` is the absolute end of the session: 12 h for a Mini App session (then the owner reopens the app from the bot, because `initData` is accepted for 15 minutes only), 90 days for a browser session (constant `BROWSER_SESSION_MAX_MS`, set by the widget sign-in; owner may change it). A refresh never moves an access token past it.
  - `POST /auth/telegram` creates a `miniapp` session (needs the `TELEGRAM_BOT_TOKEN` secret; missing means 503). The display name comes from the signed Telegram user, stripped of control and invisible characters, at most 64 code points.
  - `POST /auth/refresh`, Mini App: the valid Bearer token is swapped for a new one in one conditional `UPDATE` (the old token dies, two parallel refreshes cannot both win). A browser session cannot be refreshed with a Bearer token alone.
  - `POST /auth/refresh`, browser: the cookie `refresh_token` (`HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, 30 days) holds a one-time token stored in `refresh_tokens` (hash only). One atomic `batch` claims the old token (`used_at IS NULL`), stores its successor and swaps the access token. Presenting a token that was already exchanged, or losing the claim race, revokes the whole session (theft detection; two tabs refreshing at the same moment sign the owner out, so the SPA must serialize refreshes). If the cookie is present it decides; a stale Bearer next to it is ignored.
  - `POST /auth/logout` revokes the session named by the Bearer token and/or the cookie and always clears the cookie.
  - `/auth/refresh` and `/auth/logout` require `Origin` equal to the origin of the request URL (the Worker serves SPA, Mini App and API from one origin); a missing, `null` or foreign `Origin` is 403 before anything else happens.
  - Rate limit: fixed 10-minute window per client (`cf-connecting-ip`, stored as a hash; IPv6 counts by its /64, IPv4-mapped IPv6 as the IPv4 address, so rotating lower address bits buys no new bucket) in D1 table `rate_limits`, 10 sign-ins and 30 refreshes per window, then 429 `RATE_LIMIT` with `Retry-After`; a bucket already past its limit is not written again. D1 is used instead of the Workers Rate Limiting binding because that binding is per location and approximate, and cannot be driven by the injected clock in tests.
- **Guard:** `app/require-owner.ts` protects every `/api/v1/*` route except `/api/v1/health`: the SHA-256 of the Bearer token must match a non-revoked, unexpired `sessions` row whose Telegram ID equals `OWNER_TELEGRAM_ID` (empty means nobody). Missing or unknown token is 401, another user's session 403, a database error fails the request. Only `POST /auth/telegram`, `/auth/telegram-widget`, `/auth/refresh` and `/auth/logout` (and health) bypass it, because they authenticate themselves; `GET /auth/me` is guarded. On `npm run dev` only, `src/index.ts` also mounts `POST /auth/local` before the guard (`app/local-sign-in-route.ts`, localhost hosts only): it issues an owner browser session without Telegram, because the Login Widget refuses localhost; the `__LOCAL_SIGN_IN__` build constant is `false` in `vite build`, so the deployed bundle does not contain it.
- **Bot webhook** `/webhooks/telegram`: the only open entry without a session. Check `X-Telegram-Bot-Api-Secret-Token` in constant time, `update_id` unique in D1, only allowed update types, commands only from the owner. The response is fast; heavy work is a job in D1.
- **Headers:** every response the Worker handles (`/api/*`, `/webhooks/*`; static assets are served by the assets binding and are not covered) carries `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`; `/api/v1/*` except health is `Cache-Control: no-store`. CSP with `frame-ancestors 'self'` and the domains of Telegram web clients (exact list to be clarified during implementation); no `X-Frame-Options: DENY`.
- Zod validation of all inputs (`z.strictObject`), body and upload size limits, MIME + file signature, allowlist of domains for outbound requests (SSRF). Client-side validation is UX only. Rate limit on sign-in endpoints.
- Real secrets are Wrangler secrets (set by the owner); do not commit `.dev.vars` and `.env*`. Logs mask tokens, `initData`, codes and personal data.
- A separate Telegram test environment (its own bot and channel) — once the owner sets it up; production sending in tests is forbidden. Detailed rules and checklist — skill `api-security`.

## 9. CPU, memory and waits

Workers may reuse an isolate. Mutable globals `currentUser`, `job`, `request`, and singleton mutable caches without a strict cleanup scheme are forbidden. Create a lightweight context per request; D1/R2 connections come from env; process large JSON/files as streams and limit their size. For external HTTP use `AbortSignal.timeout`/`AbortController`; limit concurrent outbound requests and the Cron batch size. Do not run uncontrolled `Promise.all()` over hundreds of jobs. `waitUntil()` is only for non-critical side effects; critical work is a D1 job for Cron. The absence of globals reduces the risk of leaks between requests, but does not remove the need for profiling and testing with real images.

## 10. Observability and incidents

Every HTTP request and job has a `requestId`/`jobId`; logs are structured JSON: `timestamp`, `component`, `operation`, `durationMs`, `status`, `errorCode`, `retryable`, `attempt`; no raw webhook body and no secrets. Important `incidents` in D1 with bounded history and a grouping mechanism. The admin UI shows: the last successful Cron, jobs by status, errors over 24 hours, Cron lag (time since the last successful tick), attempts, the `unknown` state, results of manual actions. Aggregate successes and delete old ones per a retention policy. If the Telegram error notification itself fails, save the incident in D1 without infinite recursion.

As built: the dispatcher logs one JSON line per job (`component: 'dispatcher'`, `jobId`, `attempt`, `status`, `errorCode`, `durationMs`), reconcile one per resolved claim, and every tick one summary line (`component: 'scheduled'`, `status`, `durationMs`, `counts`). Only these fields exist in the logger type: no token, chat text, post text or Telegram body can reach a log line. A failed or `unknown` job always has an `incidents` row written in the same batch as the state change (nothing fails silently); the incident carries a code and bounded metadata, and the owner gets one private bot alert per incident (§5 "Owner alerts"). Cron lag is visible from the tick lines.

## 11. Testing and quality gates

- Domain: state machine, status projection, content formation — pure unit tests. Classification of Telegram responses (publishing `infrastructure/`) — unit tests per response class.
- Integration: Vitest 4.1 + `@cloudflare/vitest-plugin` in workerd; D1 migrations are applied via `readD1Migrations`/`applyD1Migrations`; the Cron handler is invoked through the plugin's test APIs; Telegram — a fake `PublicationTransport` and a fake grammY client via a port (we do not intercept network requests).
- Contract: real route responses are parsed by the `apps/contracts` schemas; every `PublicationTransport` passes a shared outcome test suite.
- Architecture: `dependency-cruiser` — no-circular, no-module-to-module (modules do not import each other), no-domain-imports-infra.
- Failure: two Crons at once, crash after `send_started_at`, timeout/5xx/ok without `message_id` → `unknown`, 429 → `retry_wait`, 400/403 → `failed`, repeated webhook `update_id`, command not from the owner, expired/forged `initData`, forged/stale/reused Login Widget data, wrong webhook secret, size limit exceeded, module removal.
- Load: 100 and 1,000 jobs/day with peaks; record CPU per tick, D1 queries, subrequests, the number of duplicates in Telegram (zero expected with normally observed responses; `unknown` — manual check).
- CI on every push/PR: `npm ci` → `npm run verify` (lint, types, boundaries, unit/integration, build). A `qa-security` review is mandatory for migrations, sign-in, the webhook and publications.

## 12. External contracts for the frontend

All admin endpoints `/api/v1/*` return stable JSON DTOs. Shared types and Zod schemas — `contracts`, with no dependencies on Hono, Cloudflare or React. On a breaking change, add an API version/compatibility parameters; the server must not break the admin UI deployed yesterday. For concurrent draft edits — `revision`, response `409 CONFLICT` on a stale save (the revision travels in the request body, see `DECISIONS.md`). All lists use cursor pagination; UTC timestamps in ISO-8601; error: `{error:{code,message,requestId,details?}}`. The interface document is `docs/API_CONTRACTS.md`.

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
- Sign-in: in the Mini App — automatic, in the browser — via Telegram; a foreign Telegram ID gets 403; forged or expired `initData` and forged, stale or reused Login Widget data are rejected.
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
- Telegram Mini Apps (initData): https://core.telegram.org/bots/webapps · Login Widget: https://core.telegram.org/widgets/login-legacy
- Telegram Bot API: https://core.telegram.org/bots/api · grammY on Cloudflare Workers: https://grammy.dev/hosting/cloudflare-workers-nodejs
- Hono best practices: https://hono.dev/docs/guides/best-practices
- dependency-cruiser rules: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- Martin Fowler, Monolith First: https://martinfowler.com/bliki/MonolithFirst.html

**Measured performance results and real costs do not exist yet: capacity figures are calculations until a load test.**

