# ALEXEEV Content Bot — agent rules

Shared Claude Code/Codex rules. Talk Russian; code, identifiers, docs, commits and branches English.

**Status:** in development, not in production; what works is in `docs/IMPLEMENTATION_PLAN.md`. Never describe planned parts as working.

## Layout
- `apps/frontend/` (React SPA), `apps/backend/` (Hono Worker, D1), `apps/contracts/` (shared Zod DTOs); each has its own `AGENTS.md`.
- `docs/` — canonical architecture. Open only the section you need.
- `.agents/` — role sources (`roles/`), skills (`skills/`), tooling (`scripts/`). `.claude/` and `.codex/` are generated from it: edit sources, then `npm run agents:sync`.

## One fact, one place
Edit a fact at its source; elsewhere only link to it.
- Before delegation, read `.agents/roles/<role>.md` and relevant skill, not memory. UI: `docs/AGENT_UI_WORKFLOW.md`.
- Status and queue: `docs/IMPLEMENTATION_PLAN.md`. Decisions: `docs/DECISIONS.md`.
- Screens, patterns, viewport widths: `docs/design/UX_SPEC.md`; visual direction and tokens: `docs/design/README.md`.
- API meaning: `docs/API_CONTRACTS.md`; shapes: `apps/contracts/src`.

## Load context on demand, never everything
| When you touch | Load |
|---|---|
| `apps/backend/**` | `apps/backend/AGENTS.md`, then the needed section of `docs/BACKEND_ARCHITECTURE.md` |
| `apps/frontend/**` | `apps/frontend/AGENTS.md`, then the needed section of `docs/FRONTEND_ARCHITECTURE.md` |
| `apps/contracts/**` or any request/response shape | skill `contract-change` |
| publications, jobs, Cron, Queue, Telegram send | skill `publishing-reliability` |
| SQL or migrations | skill `d1-migration` |
| auth, sessions, Mini App, webhook, uploads | skill `api-security` |
| writing or fixing tests | skill `testing` |
| a bug, failing test or CI failure | skill `debugging` |
| Worker runtime, bindings, config, Wrangler commands | skills `workers-best-practices`, `wrangler` |
| a page, its states, accessibility | skills `page-spec`, `ui-patterns`, `react-aria` |
| tokens, primitives, look and feel, UI copy | skill `visual-design` |
| visual verification in a browser | skill `visual-check` |

Codex doesn't auto-load area AGENTS.md files: open them yourself. Search with `rg`; read only needed lines. `npm run verify` prints failures; open `.logs/verify.log` if needed.

Write tersely: no preamble, no restating the task, no recap of a visible diff. Code, commands and error text stay exact.

## Working with the owner
- Main session only (not subagents): you orchestrate every owner request; the owner never types a command. Small single-area edits: do yourself; larger: follow skill `orchestrate`.
- Decide defaults; escalate only owner-level publishing, access, money or recorded decisions, with a recommendation.
- Recorded decisions live in `docs/DECISIONS.md`; don't relitigate them unprompted.
- Do only what the task asks: no unrequested features, refactors or abstractions.

## Non-negotiables
- Modular monolith: one Worker, one D1, one Cron (plus one Queue only where the architecture says so). No microservices, generic repositories, event bus, service locator or DI container; `apps/backend/src/app/container.ts` wires adapters by hand.
- Modules never import each other; only `app/` (routes, bot, Cron, workflows, `container.ts`) connects them via each module's `index.ts` and consumer-owned ports. No cycles; domain never imports infrastructure.
- No mutable module-level state holding user, request or job data. Bound payload sizes, batches, concurrency and timeouts.
- Publishing safety: D1 owns state and dedup. Cron ticks may overlap or repeat, so every claim is conditional. A Telegram send that may have happened but is unconfirmed becomes `unknown` and needs manual reconciliation; it is never retried automatically.
- Secrets only in Worker secrets; never Git, logs or frontend. Tests use separate bot/channel. Use placeholders; Gitleaks exceptions: path+pattern, never commit SHA.
- The server re-validates every input with Zod and re-checks the session token and the owner's Telegram ID. Client validation is UX only.
- Design exists only as code: tokens, primitives and browser screenshots. Figma is excluded (owner decision 03.10.2026); never propose it.
- Agents never deploy, run `--remote` D1 commands, or change secrets (`wrangler secret put/delete` deploys immediately). The owner runs these.
- No paid AI providers, render APIs or paid cloud tiers without an explicit owner decision.
- No empty scaffolding: ship behavior/error handling; test critical paths; sync docs/examples/setup when behavior/config changes.

## TypeScript style (all packages)
- `strict`; no `any`; `!` only in bootstrap; parse external `unknown` with Zod. Named exports, kebab-case files, `PascalCase.tsx` components; one responsibility per file.
- Errors use stable `code`s, are never swallowed, and logs omit secrets, `initData`, sign-in payloads and raw payloads. Store UTC; convert timezones in the UI.
- Comments explain why. New dependencies need a PR reason and lockfile entry; prefer platform APIs.

## Git
Work on `develop` (CI deploys Worker `dev`). `main` = releases (Worker `app`), changed only by the owner's release PR from `develop`. The owner commits and pushes: leave the task's changes ready (verified, `git status` shows only task files). Never commit or push to `main`, never force-push. A SQL change needs a migration. A contract change updates `contracts`, the backend, the frontend and the contract tests in the same PR.

## Done means verified
Follow the risk gate in skill `orchestrate`. Run required checks and report actual results.

Main session's final message, in order: short Russian summary of what was done and check results; only if a file was added to `apps/backend/migrations/`, its number and that the owner applies it to DEV D1 (Actions → D1 migrations) before pushing; last, the commit message in a code block.

Subagents report:
```json
{"task_id":"","state":"DONE|BLOCKED|FAILED|NOT_VERIFIED","changed_paths":[],"contract_changes":[],"checks":[{"cmd":"","result":"passed|failed|not_run","evidence":"last relevant lines"}],"risks":[],"next":[]}
```
Report ≤ 30 lines; tables to `.logs/<task_id>/report.md`; tokens: `docs/TOKEN_BUDGET.md`. Claims need fresh evidence: run the command, read the output, then state the result ("should work" is not a status). Before reporting, self-check: each acceptance criterion has evidence; the diff stays in your paths; no TODOs, debug logs or commented-out code; docs are updated if behavior changed. `not_run` is never success. If a critical input is missing, return `BLOCKED` naming it; do not invent requirements. After two failed attempts on the same error, stop and report. Stay inside your assigned paths; for anything else, ask the orchestrator with a reason.
