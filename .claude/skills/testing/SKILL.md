---
name: testing
description: "How to write and run tests: Worker integration tests with the Cloudflare Vitest plugin and real D1 migrations, race and failure tests, fake Telegram and clock, React tests with Testing Library and MSW v2, Playwright E2E. Use when adding tests or fixing a bug."
---
# Testing

Rule zero: a test proves user-visible or state-visible behavior. A bug fix starts with a failing test. Never weaken an assertion, add retries or skip a test to make it pass.

## Layers (most tests at the top)
| Layer | Tool | Asserts |
|---|---|---|
| Unit | Vitest | pure domain: state machine, mapping, validation |
| Worker integration | Vitest 4.1 + `@cloudflare/vitest-plugin` (supports Vitest `^4.1` only; `vitest-pool-workers` is deprecated) — one Vitest 4.1 for the whole repo | real routes and handlers against local D1 with real migrations |
| Contract | Worker integration | real responses parse with `apps/contracts` schemas |
| Component | Vitest 4.1 + Testing Library + MSW 2 | what the user sees and can do |
| E2E | Playwright | a few critical flows: login, schedule, unknown, 409, mobile |

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
- Cover each page-spec state, keyboard flow, 409 keeping local edits, and that `unknown` disables actions. Don't assert CSS classes or internal state.

## Determinism
No real network, no real time (fake timers or `page.clock`), no order dependence, and stable ids in fixtures. A flaky test is a bug: fix or quarantine it with an issue, never auto-retry it.

## Tooling not installed yet
When you first add a runner, pin exact versions in the lockfile, add `test:unit`, `test:integration` and `test:e2e` scripts, add them to `npm run verify` and CI, and update `apps/*/AGENTS.md` commands in the same PR. Until then, report these checks as `not_run`.

Sources: `references/sources.md`.
