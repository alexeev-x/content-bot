# ALEXEEV Content Bot — agent rules

Shared Claude Code/Codex rules. Talk Russian; code, identifiers, docs, commits and branches English.

**Status:** in development, not in production. Old plan removed 14.10.2026, a new one is being written. Judge what works from code and tests; never describe planned parts as working.

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

Search with `rg`; read only needed lines. `npm run verify` prints failures; open `.logs/verify.log` if needed.

## Working with the owner
- The main session does the work itself. Delegate only per skill `orchestrate` (parallel independent areas, noisy research, R3 review). The owner never types a command.
- Decide defaults; escalate only owner-level publishing, access, money or recorded decisions, with a recommendation.
- Recorded decisions live in `docs/DECISIONS.md`; don't relitigate them unprompted.
- Do only what the task asks: no unrequested features, refactors or abstractions.

## Token economy (owner priority)
- Write tersely: no preamble, no restating the task, no recap of a visible diff.
- Read line ranges, not whole files; pipe noisy commands through `tail`/`grep`.
- Images cost ~`⌈w/28⌉×⌈h/28⌉` tokens: view one contact sheet (long edge ≤ 1100 px), only what you compare; ≤ 2 fix rounds.
- One task per session; never resume a finished subagent (start fresh with a ≤ 40-line packet and a path to `.logs/handoff/<task>.md`).
- Don't edit instructions, skills, hooks or settings mid-task unless that is the task (it breaks the prompt cache).

## Non-negotiables
- Modular monolith: one Worker, one D1, one Cron (plus one Queue only where the architecture says so). No microservices, generic repositories, event bus, service locator or DI container; `apps/backend/src/app/container.ts` wires adapters by hand.
- Modules never import each other; only `app/` (routes, bot, Cron, workflows, `container.ts`) connects them via each module's `index.ts` and consumer-owned ports. No cycles; domain never imports infrastructure.
- No mutable module-level state holding user, request or job data. Bound payload sizes, batches, concurrency and timeouts.
- Publishing safety: D1 owns state and dedup. Cron ticks may overlap or repeat, so every claim is conditional. A Telegram send that may have happened but is unconfirmed becomes `unknown` and needs manual reconciliation; it is never retried automatically.
- Secrets only in Worker secrets; never Git, logs or frontend. Tests use separate bot/channel.
- Every local token lives only in the root `.env`, filled by the owner. Agents never look for tokens elsewhere (`.dev.vars` included), never ask where one is and never ask to paste it. Local probes and scripts get it only through the local Worker (`npm run dev` merges the root `.env`), never by reading env files.
- Use placeholders; Gitleaks exceptions: path+pattern, never commit SHA.
- The server re-validates every input with Zod and re-checks the session token and the owner's Telegram ID. Client validation is UX only.
- Design exists only as code: tokens, primitives and browser screenshots. Figma is excluded (owner decision 03.10.2026); never propose it.
- Agents never deploy, run `--remote` D1 commands, or change secrets. The owner runs these.
- No paid AI providers, render APIs or paid cloud tiers without an explicit owner decision.
- Tests only where a bug would cost real damage (skill `testing`). Sync docs/setup when behavior/config changes.

## TypeScript style (all packages)
- `strict`; no `any`; `!` only in bootstrap; parse external `unknown` with Zod. Named exports, kebab-case files, `PascalCase.tsx` components; one responsibility per file.
- Errors use stable `code`s, are never swallowed, and logs omit secrets, `initData`, sign-in payloads and raw payloads. Store UTC; convert timezones in the UI.
- Comments explain why. New dependencies need a reason; prefer platform APIs.

## Git (owner decision 14.10.2026)
- Agents commit and push to `develop` or to their own branches from it (`feat/…`, `fix/…`, `chore/…`). Pushing `develop` deploys Worker `dev`.
- Commit without asking once the task's checks are green; never push and never ask about pushing — the owner pushes `develop` themselves when needed (owner decision 29.10.2026). Push only if the owner says so for that push or for the whole session. Why: work is developed and checked locally and goes to `develop` only a couple of pushes a day, because from 1.11.2026 the repository is private and GitHub Actions minutes are limited.
- `main` is forbidden for agents: no checkout-and-commit, merge, push or PR merge into it. Releases are the owner's `develop → main` PR.
- Never force-push or rewrite pushed history. Commit only the task's files, after its checks are green; conventional commit messages.
- Migrations: a push to `develop` applies pending migrations to DEV D1 in CI before the deploy, so they must stay expand-only (skill `d1-migration`). Production migrations stay a manual owner run.
- A contract change updates `contracts`, the backend, the frontend and the contract tests in the same commit.

## Done means verified
Run `npm run verify:changed` (full `npm run verify` for R2/R3, see skill `orchestrate`) and report actual results.

Main session's final message: short Russian summary of what was done and check results; the commit hash(es) and whether they were pushed; if a migration was added, its number (CI applies it to DEV; production is manual).

Subagents report ≤ 20 lines: `state` (DONE|BLOCKED|FAILED|NOT_VERIFIED), changed paths, checks with the last relevant output lines, risks. Claims need fresh evidence; `not_run` is never success. Missing critical input → `BLOCKED` naming it. After two failed attempts on the same error, stop and report. Stay inside your assigned paths.
