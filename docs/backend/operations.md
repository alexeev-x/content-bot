# 9. CPU, memory and waits

Workers may reuse an isolate. Mutable globals `currentUser`, `job`, `request`, and singleton mutable caches without a strict cleanup scheme are forbidden. Create a lightweight context per request; D1/R2 connections come from env; process large JSON/files as streams and limit their size. For external HTTP use `AbortSignal.timeout`/`AbortController`; limit concurrent outbound requests and the Cron batch size. Do not run uncontrolled `Promise.all()` over hundreds of jobs. `waitUntil()` is only for non-critical side effects; critical work is a D1 job for Cron. The absence of globals reduces the risk of leaks between requests, but does not remove the need for profiling and testing with real images.

# 10. Observability and incidents

Every HTTP request and job has a `requestId`/`jobId`; logs are structured JSON: `timestamp`, `component`, `operation`, `durationMs`, `status`, `errorCode`, `retryable`, `attempt`; no raw webhook body and no secrets. Important `incidents` in D1 with bounded history and a grouping mechanism. The admin UI shows: the last successful Cron, jobs by status, errors over 24 hours, Cron lag (time since the last successful tick), attempts, the `unknown` state, results of manual actions. Aggregate successes and delete old ones per a retention policy. If the Telegram error notification itself fails, save the incident in D1 without infinite recursion.

As built: the dispatcher logs one JSON line per job (`component: 'dispatcher'`, `jobId`, `attempt`, `status`, `errorCode`, `durationMs`), reconcile one per resolved claim, and every tick one summary line (`component: 'scheduled'`, `status`, `durationMs`, `counts`). Only these fields exist in the logger type: no token, chat text, post text or Telegram body can reach a log line. A failed or `unknown` job always has an `incidents` row written in the same batch as the state change (nothing fails silently); the incident carries a code and bounded metadata, and the owner gets one private bot alert per incident (§5 "Owner alerts"). Cron lag is visible from the tick lines.

# 11. Testing and quality gates

- Domain: state machine, status projection, content formation — pure unit tests. Classification of Telegram responses (publishing `infrastructure/`) — unit tests per response class.
- Integration: Vitest 4.1 + `@cloudflare/vitest-plugin` in workerd; D1 migrations are applied via `readD1Migrations`/`applyD1Migrations`; the Cron handler is invoked through the plugin's test APIs; Telegram — a fake `PublicationTransport` and a fake grammY client via a port (we do not intercept network requests).
- Contract: real route responses are parsed by the `apps/contracts` schemas; every `PublicationTransport` passes a shared outcome test suite.
- Architecture: `dependency-cruiser` — no-circular, no-module-to-module (modules do not import each other), no-domain-imports-infra.
- Failure: two Crons at once, crash after `send_started_at`, timeout/5xx/ok without `message_id` → `unknown`, 429 → `retry_wait`, 400/403 → `failed`, repeated webhook `update_id`, command not from the owner, expired/forged `initData`, forged/stale/reused Login Widget data, wrong webhook secret, size limit exceeded, module removal.
- Load: 100 and 1,000 jobs/day with peaks; record CPU per tick, D1 queries, subrequests, the number of duplicates in Telegram (zero expected with normally observed responses; `unknown` — manual check).
- CI (`.github/workflows/ci.yml`, two jobs since the repository went private, 24.10.2026: GitHub bills each job in whole minutes from 2 000 a month): `verify` plans by the changed files, scans the history for secrets and runs the affected checks; every test runs on PRs and `main`, while a `develop` push relies on the pre-push hook's `verify:changed` with tests a minute earlier; then `deploy`. A `qa-security` review is mandatory for migrations, sign-in, the webhook and publications.

# 12. External contracts for the frontend

All admin endpoints `/api/v1/*` return stable JSON DTOs. Shared types and Zod schemas — `contracts`, with no dependencies on Hono, Cloudflare or React. On a breaking change, add an API version/compatibility parameters; the server must not break the admin UI deployed yesterday. For concurrent draft edits — `revision`, response `409 CONFLICT` on a stale save (the revision travels in the request body, see `DECISIONS.md`). All lists use cursor pagination; UTC timestamps in ISO-8601; error: `{error:{code,message,requestId,details?}}`. The interface document is `docs/API_CONTRACTS.md`.

# 13. Changing and removing modules

1. Mark the feature disabled; forbid new jobs for it.
2. Move current jobs to a completed/cancelled status, unambiguously resolve `unknown`.
3. Remove the wiring in `app/container.ts`, routes, cron/queue type handlers.
4. Delete internal files and tests; keep or migrate public DTOs only if there are real consumers.
5. Run the dependency graph + unit/integration/E2E; update docs and open feature flags.
6. Only later delete the data with a separate SQL migration.

# 14. Acceptance before first production

- A manually created and scheduled post to a channel and to a group works; content preview.
- A forced double Cron tick does not produce two publications.
- A lost Telegram confirmation → `unknown` and a visible incident in the admin UI, with no automatic resend.
- Sign-in: in the Mini App — automatic, in the browser — via Telegram; a foreign Telegram ID gets 403; forged or expired `initData` and forged, stale or reused Login Widget data are rejected.
- Webhook: wrong secret → rejection; a repeated `update_id` is processed once; commands not from the owner are ignored.
- No secrets in the frontend build and logs; a Worker restart does not lose work.
- Quotas are measured for 1,000 test jobs; the application does not depend on paid AI APIs.

## Release checklist (owner runs every step; agents never deploy, run `--remote` or set Worker secrets)

Written 24.10.2026 for the first release that publishes. In this order:

1. **Worker secrets of `app` (production)**, set before the deploy: `TELEGRAM_BOT_TOKEN` (the channel's bot, not the test bot), `TELEGRAM_WEBHOOK_SECRET`, `OPENAI_API_KEY` (the AI writer; without it autopublishing has nothing to write), `GITHUB_TOKEN` (the game-files source; without it the source is off), `YOUTUBE_API_KEY` (analytics). Optional: `ANTHROPIC_API_KEY`; the var `BOT_INFO` saves a Telegram `getMe` round trip on cold starts.
2. **Queue** `content-ai-prod` exists in the account (the AI writer, the watches, the dispatch kick all go through it).
3. **D1 migrations on `content-db-prod`**, every one up to the newest (0111 as of 24.10.2026), before the code that needs them: `npx wrangler d1 migrations apply content-db-prod --remote --env production`. All are expand-only.
4. **Production switches in `apps/backend/wrangler.jsonc`** (`env.production`): `triggers.crons` `["* * * * *"]` (without it nothing is dispatched, reconciled or watched) and `PUBLISHING_ENABLED` `"true"`. Both are set on `develop` (owner, 24.10.2026: «пункт 1 включай») and ship with the release.
5. **Release:** the owner's `develop → main` PR; the merge deploys `app`.
6. **Bot webhook** of the production bot points at `https://<app domain>/webhooks/telegram` with the same `TELEGRAM_WEBHOOK_SECRET`.
7. **Studio, «Настройки»:** the channel added and enabled; «Автопубликация» on with that channel and a daily limit; the AI writer on with its budget.
8. **First hour:** Workers Logs of `app` — one `scheduled`/`tick` line a minute with `status: ok`; `ai_queue` lines for `steam_watch`, `game_files_watch`, `treasure_watch` every five minutes; «Источники → Состояние лент» all green; one manual «Опубликовать сейчас» to the channel arrives within seconds (`dispatch_now`).

Logs: Workers Logs (on in `observability`), free up to 200 000 events a day kept 3 days; about 6 000 a day are written (a tick line a minute, a line per queue job and per sent post, errors). Logpush needs a paid plan and is not used.

# 15. Primary sources and confirmation of decisions

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
