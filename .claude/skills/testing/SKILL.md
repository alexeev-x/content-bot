---
name: testing
description: "How to write and run tests: Worker integration tests with the Cloudflare Vitest plugin and real D1 migrations, race and failure tests, fake Telegram and clock, React tests with Testing Library and MSW v2, Playwright E2E. Use when adding tests or fixing a bug."
---
# Testing

Rule zero (owner decision 14.10.2026): **tests only where a bug costs real damage.** A test must protect money, data, security or a public post. Everything else is verified by types, the browser check and CI.

## Must have tests
- Publishing: claim/lease races, dedup, `unknown` never auto-retried, 429 `retry_after`, Cron overlap.
- Auth: owner-only Telegram ID, `initData`/login signature (valid, expired, tampered, foreign ID), session/refresh, webhook secret and dedup.
- Data integrity: migrations, idempotency keys, 409 conflicts, deletes that cascade.
- Contracts: real responses parse with `apps/contracts` schemas (one test per endpoint family, not per field).
- Pure logic that is easy to get wrong: timezones/dates, media crop math, state machines.
- A fixed bug only when its recurrence would cause the damage above.

## No tests for
Layout, styles, copy, rendering of each state, prop plumbing, simple CRUD forms, query hooks that only fetch, prototypes, snapshots. Don't add a component test per screen. One behavior = one test; prefer a table of cases over copied test bodies. When a test file passes ~400 lines, it is testing details: merge cases or delete.

## Layers (choose only those needed for the risk)
| Layer | Tool | Asserts |
|---|---|---|
| Unit | Vitest | pure domain: state machine, mapping, validation |
| Worker integration | Vitest 4.1 + `@cloudflare/vitest-plugin` (supports Vitest `^4.1` only; `vitest-pool-workers` is deprecated) — one Vitest 4.1 for the whole repo | real routes and handlers against local D1 with real migrations |
| Contract | Worker integration | real responses parse with `apps/contracts` schemas |
| Component | Vitest 4.1 + Testing Library + MSW 2 | what the user sees and can do |
| E2E | Playwright | at most a few critical flows: login, schedule, unknown |

## Backend integration
- Follow the Cloudflare Vitest integration docs for the current config. Read the migrations with `readD1Migrations` and apply them in setup with `applyD1Migrations`, so tests run on the real schema. Storage is isolated per test file.
- Test HTTP through the app (`app.request()` or the Worker fetch). Test `scheduled` with the plugin's `createScheduledController` / `createExecutionContext` / `waitOnExecutionContext`. Storage is isolated per test file, not per test: reset tables in `beforeEach`.
- Don't intercept the network inside workerd (`@msw/cloudflare` needs MSW 3): fake Telegram through ports instead.
- Mini App and login: generate a valid `initData` signed with a test bot token; test expired, tampered and foreign-ID cases.
- Inject a fake clock and a scripted Telegram transport (`ok`, `429 retry_after`, `400`, `403`, `timeout-after-send`, `ok-without-id`). Don't stub D1: assert its rows.
- Race tests: run the competing operations with `Promise.all` on the same D1 and assert exactly one wins (`changes === 1`) and exactly one send happens.

## Frontend component tests
- Query priority: `getByRole` → `getByLabelText` → `getByText` → `getByTestId` (last resort). Interact with `userEvent.setup()`.
- MSW v2: `http.get('/api/v1/…', () => HttpResponse.json(dto))`, and `server.listen({ onUnhandledRequest: 'error' })` so a forgotten handler fails loudly. Build fixtures from the `apps/contracts` types.
- Only the risky interactions: 409 retaining local edits, `unknown` disabling retry/cancel, publish never shown as success before the server confirms.

## Determinism
No real network, no real time (fake timers or `page.clock`), no order dependence, and stable ids in fixtures. A flaky test is a bug: fix or quarantine it with an issue, never auto-retry it.

## Tooling not installed yet
Install a test runner only when the risk requires that layer; pin versions in the lockfile and add only the necessary script/check. Never add an entire testing tier solely for coverage or tooling completeness. Report required checks that were not run as `not_run`.

Sources: `references/sources.md`.
