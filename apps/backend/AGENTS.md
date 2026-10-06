# apps/backend/ — Cloudflare Worker rules

Stack (owner decision 03.10.2026): TypeScript, Hono 4 + `@hono/zod-validator`, Zod 4 schemas from `apps/contracts`, Cloudflare Workers (static assets for the SPA, D1, Cron; Queue and R2 only after measurement), grammY for the bot and sending, D1 via plain SQL (`prepare().bind()`, no ORM), Vitest 4.1 + `@cloudflare/vitest-plugin`. Canonical design: `docs/BACKEND_ARCHITECTURE.md`. Open only the section you need: §2 boundaries, §5 publishing, §6 data, §8 security, §11 tests.

## Structure
- `src/index.ts` exports `fetch` (SPA assets, `/api/v1/*`, `/webhooks/telegram`) and `scheduled` (Cron: reconcile → dispatch), each delegating to `src/app/*`.
- `src/app/`:
  - `create-app.ts`: Hono, middleware, `onError`.
  - `container.ts`: manual wiring per request.
  - `routes.ts`, `scheduled.ts`.
  - `bot/`: the Telegram inbound adapter (grammY `Bot`, commands). An entry point like routes and Cron: it calls module public APIs only, answers only `OWNER_TELEGRAM_ID`, and no module imports it.
  - `env.ts`: types from `wrangler types`.
- `src/modules/<capability>/`: `index.ts` is the only public entry. Start flat (`service.ts` + test). Split into `domain/`, `application/` (use cases, ports), `infrastructure/` and `http/` only once complexity is real.
- `src/integrations/<vendor>/`: thin vendor clients (e.g. grammY `Api` without auto-retry); no business decisions, no module imports. Mapping to our types lives in the module's `infrastructure/`.
- `src/platform/`: D1 helpers, clock, logger, fetch-with-timeout, security middleware.
- Modules never import each other (dependency-cruiser enforces it). A module that needs another module's data declares a port in its own `application/ports.ts`; `app/container.ts` wires it to the other module's public API. Flows spanning modules go in `src/app/workflows/`.

## Code style
- Handlers stay thin: parse the input with the `contracts` schema, call one use case, return a DTO. Compose sub-apps with `app.route()`. Write handlers inline, not as controller classes, so Hono keeps the types. No SQL or business rules in route files.
- Use cases take dependencies as arguments (`{ repo, clock, transport }`) and return a value or throw `AppError(code)`. Only `onError` maps errors to `{error:{code,message,requestId}}`.
- Inject the clock. Never call `Date.now()` in domain code. IDs come from `crypto.randomUUID()`.
- Every promise is awaited, returned, or passed to `ctx.waitUntil`. A floating promise can be cancelled silently. `waitUntil` is only for non-critical side effects.
- Every outbound `fetch` gets `AbortSignal.timeout(ms)` and an explicit classification: success, rejected or ambiguous.
- No module-level mutable state: isolates are reused across requests, so state leaks between users.
- Logs are one JSON object per event via `console.log`: `requestId|jobId, component, operation, status, errorCode, durationMs`. Never log tokens, codes, cookies or raw webhook bodies.

## Platform limits (Free plan, design for them)
- 10 ms CPU per request (I/O wait excluded).
- 50 subrequests and 50 D1 queries per invocation. Batch statements; never query in a per-item loop.
- 128 MB memory. 5 Cron triggers per account. Cron runs in UTC.
- Queue messages are at most 128 KB, and `delaySeconds` is at most 24 h. D1 `run_at` owns long schedules.

## D1
- Use prepared statements with `.bind()` only. No `SELECT *`. Lists use keyset pagination with a bounded `LIMIT`.
- Transitions are conditional (`UPDATE … WHERE id=? AND status IN (…)`), then check `meta.changes === 1`. Zero changes means another worker won; do not blindly retry.
- Atomic multi-statement changes go through `db.batch([...])`, which rolls back as a unit. There are no interactive transactions, so never read-modify-write across awaits without a guarding condition.
- Timestamps are UTC epoch milliseconds (`INTEGER`). Schema changes follow the skill `d1-migration`.

## Telegram (grammY)
- Webhook: `webhookCallback(bot, "cloudflare-mod")` with `secretToken`; pass `botInfo` from config so no `getMe` runs per request. Dedupe `update_id` in D1; reply fast and hand slow work to a D1 job.
- Sending goes only through the `PublicationTransport` adapter, which turns every grammY result into a `SendOutcome` (`sent` / `rate_limited` / `rejected` / `unknown`). Never install `@grammyjs/auto-retry` or retry an `HttpError`/5xx/timeout.

## Queue consumer (only if a Queue is added later)
Call `msg.ack()` or `msg.retry({ delaySeconds })` per message. Never throw for one bad message: throwing redelivers the whole batch. Set `max_retries`. A dead-letter queue is optional; without one, an exhausted message must end in a visible `failed` job and incident.

## Security and tests
Auth (Telegram ID: Mini App `initData`, browser Telegram Login Widget, Bearer session token), webhook and input rules: skill `api-security`. Test harness and patterns: skill `testing`. Publishing logic: skill `publishing-reliability`.

Commands: `npm run typecheck|test -w @alexeev/backend` (Vitest 4.1 in workerd), `npm run dev:backend` (Worker alone on :8790), `npm run dev` (with the SPA). Trigger Cron locally: `/cdn-cgi/handler/scheduled`.
