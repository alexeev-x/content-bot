# 1. Architecture principle

**Pragmatic modular monolith:** one Cloudflare Worker (Hono + TypeScript), one D1, one Cron, and a private R2 bucket per environment for media; one Queue, `AI_JOBS`, for the bot's AI model calls only (owner, 19.10.2026, after a measured timeout). Worker entry points:

- `fetch` — the admin UI (SPA from static assets, `not_found_handling: "single-page-application"`), the API `/api/v1/*` and the bot webhook `/webhooks/telegram` (`run_worker_first` only for these paths);
- `scheduled` — Cron once a minute: reconcile and dispatch publications first, then bounded owner-managed automations when publication work is idle;
- `queue` — consumer of `AI_JOBS` (`app/ai-queue.ts`): one AI writer model call per message, claimed once in D1, never retried by the queue; a chat job records when its run ended, so Cron tells the owner about one that never did (docs/backend/cron.md item 10).

The same Worker serves the frontend (built via `@cloudflare/vite-plugin`), without Pages, Pages Functions or a BFF. **The bot is part of this same backend** (inbound adapter `app/bot`), not a separate service: Telegram itself sends updates to the webhook. No mandatory AI. Images from the owner's sources via HTML/CSS templates; expensive rendering is split out only after measurements.

```
Browser / Mini App → /            → SPA admin UI
                   → /api/v1/*    → Hono API ──┐
Telegram           → /webhooks/telegram → bot ─┼→ content · publishing · identity → D1 → Telegram API
Cron (1 min)       → scheduled    → reconcile + publication dispatch → automations ┘
```

**Qualities in priority order:** publication correctness > security > maintainability > observability > performance. The operational goal: no scheduled job disappears without a trace and no ambiguous send is retried automatically.

Do not use at the start: microservices, Redis, Kafka, Kubernetes, CQRS/Event Sourcing, a universal event bus, dynamic loading of third-party plugins, an abstract `BaseRepository<T>`, and a Dependency Injection container with hidden dependencies.

### Approved stack (owner decision 03.10.2026)

| Layer | Choice | Not used, and why |
|---|---|---|
| HTTP | Hono 4 + `@hono/zod-validator`; schemas — Zod 4 from `apps/contracts` | Hono RPC (couples the frontend to backend types, requires identical versions), OpenAPI (no external consumers) |
| Data | D1: SQL via `prepare().bind()`, small typed helpers, row parsing via Zod; migrations — SQL files for `wrangler d1 migrations` | ORM: the job-claim SQL must be explicit; Drizzle 1.0 is still RC (fallback — Drizzle 0.45 only for types and simple CRUD) |
| Background jobs | Cron dispatcher with small batches; remote Cron trigger stays disabled until the scheduler is implemented, then production cadence is configured explicitly | Durable Object alarms and Workflows: they automatically retry steps on failure, which contradicts the `unknown` rule; Queue — only `AI_JOBS` for AI model calls; publishing stays on Cron |
| Telegram | grammY: commands (`webhookCallback(bot, "cloudflare-mod")`) and sending (`bot.api`) through the publication adapter; bot identity (`getMe`) is stored in D1 (`bot_identity`, one row, migration 0007) by `POST /api/v1/bot/connect` and handed to grammY as `botInfo`, so no `getMe` runs per update and no `BOT_INFO` secret is needed; a valid `BOT_INFO` is an optional override that wins over the row | the `@grammyjs/auto-retry` plugin — forbidden (it retries network errors) |
| Sign-in | Owner's Telegram ID: Mini App — `initData` (HMAC), browser — Telegram Login Widget; session token in a header | custom OTP codes and passwords; Cloudflare Access (does not work inside Telegram) |
| Tests | Vitest 4.1 + `@cloudflare/vitest-plugin`, real D1 migrations, fake Telegram via a port | Vitest 5 — until supported in the Cloudflare plugin |
| Local development | root `.env.example` is the canonical project template; Worker runtime values are copied to gitignored `apps/backend/.dev.vars`; `vite dev` with `@cloudflare/vite-plugin`, `wrangler types` | — |
| Observability | Workers Logs + `incidents` table in D1 | third-party SDKs until real traffic appears (fallback — Sentry) |
| Deploy | Workers `dev` (from `develop`, `dev.alexeevs.workers.dev`) and `app` (from `main`, `app.alexeevs.workers.dev`), each with its own D1; GitHub Actions deploys after green checks; the owner applies remote migrations before pushing code that needs them; Time Travel bookmark before migration | agents never deploy |
