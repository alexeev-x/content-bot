# ALEXEEV Content Bot — agent rules

Shared Claude Code/Codex rules. Talk Russian; code, identifiers, docs, commits and branches English.

**Status:** in development, not in production. Plan: `docs/scheduler/MASTER-PLAN.md`. Judge what works from code and tests; never describe planned parts as working.

## Rule #1: save tokens — cheapest way first
- Agents only on the owner's ask or truly parallel work; say count and cost first; cap each brief's reading and output (≤ 150 lines).
- Terse: no preamble, no restating the task or a visible diff.
- `rg`, line ranges, not whole files; noisy output through `tail`/`grep`.
- Images cost ~`⌈w/28⌉×⌈h/28⌉` tokens: one contact sheet (≤ 1100 px), ≤ 2 fix rounds.
- One task per session; never resume a finished subagent (fresh ≤ 40-line packet).
- Don't edit instructions, skills, hooks or settings mid-task (prompt cache).
- While planning, answers go into the plan; no code until «делай».

## Layout
- `apps/frontend/` (React SPA), `apps/backend/` (Hono Worker, D1), `apps/contracts/` (shared Zod DTOs); each has its own `AGENTS.md`.
- `docs/` — canonical architecture. Open only the section you need (`rg -n '^#' file` first, then read that range).
- `.agents/` — role sources (`roles/`), skills (`skills/`), tooling (`scripts/`). `.claude/` and `.codex/` are generated from it: edit sources, then `npm run agents:sync`.
- `design-refs/<task>/` — owner reference images.

## One fact, one place
Edit a fact at its source; elsewhere only link to it.
- Decisions: `docs/DECISIONS.md`.
- Screens and viewport widths: index `docs/design/UX_SPEC.md` → one file in `docs/design/ux/`; visual direction and tokens: `docs/design/README.md`.
- API meaning: `docs/API_CONTRACTS.md`; shapes: `apps/contracts/src`.

## Load context on demand, never everything
| When you touch | Load |
|---|---|
| `apps/backend/**` | `apps/backend/AGENTS.md`, then one topic file from the index `docs/BACKEND_ARCHITECTURE.md` |
| `apps/frontend/**` | `apps/frontend/AGENTS.md`, then the needed section of `docs/FRONTEND_ARCHITECTURE.md` |
| `apps/contracts/**` or any request/response shape | skill `contract-change` |
| publications, jobs, Cron, Queue, Telegram send | skill `publishing-reliability` |
| SQL or migrations | skill `d1-migration` |
| auth, sessions, Mini App, webhook, uploads | skill `api-security` |
| writing or deleting tests | skill `testing` |
| a bug, failing test or CI failure | skill `debugging` |
| Worker runtime, bindings, Wrangler | skills `workers-best-practices`, `wrangler` |
| a page, its states, accessibility | skills `page-spec`, `ui-patterns`, `react-aria` |
| tokens, primitives, look and feel | skill `visual-design`; browser check: skill `visual-check` |

`npm run verify` prints failures; open `.logs/verify.log` if needed.

## Working with the owner
- The main session does the work itself. Delegate only per skill `orchestrate` (parallel independent areas, noisy research, R3 review). The owner never types a command.
- Decide defaults; escalate only owner-level publishing, access, money or recorded decisions, with a recommendation.
- Recorded decisions live in `docs/DECISIONS.md`; don't relitigate them unprompted.
- Do only what the task asks: no unrequested features, refactors or abstractions.

## Non-negotiables
- Modular monolith: one Worker, one D1, one Cron (plus one Queue; stats DB + Workflow: DECISIONS 29.10.2026). No microservices, generic repositories, event bus, service locator or DI container; `apps/backend/src/app/container.ts` wires adapters by hand.
- Modules never import each other; only `app/` (routes, bot, Cron, workflows, `container.ts`) connects them via each module's `index.ts` and consumer-owned ports. No cycles; domain never imports infrastructure.
- No mutable module-level state holding user, request or job data. Bound payload sizes, batches, concurrency and timeouts.
- Publishing safety: D1 owns state and dedup. Cron ticks may overlap or repeat, so every claim is conditional. An unconfirmed Telegram send becomes `unknown` for manual reconciliation, never retried automatically.
- Secrets only in Worker secrets, never Git, logs or frontend. Local tokens only in the root `.env`: never look elsewhere, ask or paste; scripts use the local Worker. Tests use a separate bot/channel. Placeholders; Gitleaks exceptions by path+pattern, never commit SHA.
- The server re-validates every input with Zod and re-checks the session token and the owner's Telegram ID. Client validation is UX only.
- Design exists only as code (tokens, primitives, browser screenshots); never Figma.
- Agents never deploy, run `--remote` D1 commands or change secrets; the owner does.
- No paid AI providers, render APIs or paid cloud tiers without an explicit owner decision. AI trials: `docs/ai/README.md` «Trials».
- Tests only where a bug would cost real damage (skill `testing`). Sync docs/setup when behavior/config changes.

## TypeScript style (all packages)
- `strict`; no `any`; `!` only in bootstrap; parse external `unknown` with Zod. Named exports, kebab-case files, `PascalCase.tsx` components; one responsibility per file.
- Errors use stable `code`s, are never swallowed, and logs omit secrets, `initData`, sign-in payloads and raw payloads. Store UTC; convert timezones in the UI.
- Comments explain why. New dependencies need a reason; prefer platform APIs.

## Git
- Agents commit without asking (green checks) to `develop` or `feat/…`/`fix/…`/`chore/…` from it; the owner pushes unless told (29.10.2026: few pushes a day, limited Actions minutes). Pushing `develop` deploys `dev`.
- `main` is forbidden for agents: no checkout-and-commit, merge, push or PR merge into it. Releases are the owner's `develop → main` PR.
- Never force-push or rewrite pushed history. Commit only the task's files, conventionally.
- Migrations: a push to `develop` applies pending migrations to DEV D1 in CI before the deploy, so they must stay expand-only (skill `d1-migration`). Production migrations stay a manual owner run.
- A contract change updates `contracts`, the backend, the frontend and the contract tests in the same commit.

## Done means verified
Run `npm run verify:changed` (full `npm run verify` for R2/R3, see skill `orchestrate`) and report actual results.

Main session's final message: short Russian summary, check results, commit hashes and push state, a new migration's number (CI applies it to DEV; production is manual).

Subagents report ≤ 20 lines: `state` (DONE|BLOCKED|FAILED|NOT_VERIFIED), changed paths, checks with last output lines, risks. Claims need fresh evidence; `not_run` is never success. Missing critical input → `BLOCKED` naming it. After two failed attempts on the same error, stop and report. Stay inside your assigned paths.
