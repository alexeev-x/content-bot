# ALEXEEV Content Bot — agent rules

Shared by Claude Code and Codex, loaded into every agent: keep it short. Talk to the owner in Russian; code, identifiers, commits and branch names are English.

**Status:** in development, not in production. State and queue: `docs/IMPLEMENTATION_PLAN.md`; the publishing engine is not yet verified live. Never describe planned parts as working.

## Layout
- `apps/frontend/` — React + Vite admin SPA. Rules: `apps/frontend/AGENTS.md`.
- `apps/backend/` — Hono on Cloudflare Workers (`fetch` / `scheduled`); D1 is the source of truth. Rules: `apps/backend/AGENTS.md`.
- `apps/contracts/` — Zod DTOs shared by both sides. Rules: `apps/contracts/AGENTS.md`.
- `docs/` — canonical architecture. Open only the section you need.
- `.agents/` — role sources (`roles/`), skills (`skills/`), tooling (`scripts/`). `.claude/` and `.codex/` are generated from it: edit sources, then `npm run agents:sync`.

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
| Worker runtime, bindings, config, Wrangler commands | skills `workers-best-practices`, `wrangler` (official Cloudflare) |
| a page, its states, accessibility | skills `page-spec`, `ui-patterns`, `react-aria` |
| tokens, primitives, look and feel, UI copy | skill `visual-design` |
| visual verification in a browser | skill `visual-check` |

Codex doesn't auto-load area AGENTS.md files: open them yourself (Claude Code loads them on read). Search with `rg`; read the lines you need, not whole files. Don't reread files. `npm run verify` prints only failures; open `.logs/verify.log` only if the summary is not enough.

Write tersely: no preamble, no restating the task, no recap of a visible diff. Code, commands and error text stay exact.

## Working with the owner
- Main session only (not subagents): you orchestrate every owner request; the owner never types a command. Small single-area edits: do yourself; larger: follow skill `orchestrate`.
- Decide, don't quiz: pick the conventional default, state it with the reason, proceed. Escalate only owner-level choices (publishing, access, money, a recorded decision), batched, with your recommended default.
- Recorded decisions live in `docs/DECISIONS.md`; don't relitigate them unprompted.
- Do only what the task asks: no unrequested features, refactors or abstractions. Never claim 1 000 jobs/day before a load test.

## Non-negotiables
- Modular monolith: one Worker, one D1, one Cron (plus one Queue only where the architecture says so). No microservices, generic repositories, event bus, service locator or DI container; `apps/backend/src/app/container.ts` wires adapters by hand.
- Modules never import each other; only `app/` (routes, bot, Cron, workflows, `container.ts`) connects them via each module's `index.ts` and consumer-owned ports. No cycles; domain never imports infrastructure.
- No mutable module-level state holding user, request or job data. Bound payload sizes, batches, concurrency and timeouts.
- Publishing safety: D1 owns state and dedup. Cron ticks may overlap or repeat, so every claim is conditional. A Telegram send that may have happened but is unconfirmed becomes `unknown` and needs manual reconciliation; it is never retried automatically.
- Secrets only in Worker secrets; never Git, logs or frontend. Tests use separate bot/channel. Use placeholders; Gitleaks exceptions: path+pattern, never commit SHA.
- The server re-validates every input with Zod and re-checks the session token and the owner's Telegram ID. Client validation is UX only.
- Design exists only as code: tokens, primitives and browser screenshots. Figma is excluded (owner decision 03.10.2026); never propose it.
- Agents never deploy, run `--remote` D1 commands, or change secrets (`wrangler secret put/delete` deploys immediately). The owner runs these.
- Hooks only inspect command text; isolate agent sessions from production credentials and access.
- No paid AI providers, render APIs or paid cloud tiers without an explicit owner decision.
- No empty scaffolding: ship behavior/error handling; test critical paths; sync docs/examples/setup when behavior/config changes.

## TypeScript style (all packages)
- `strict`; no `any`; `!` only in bootstrap; parse external `unknown` with Zod. Named exports, kebab-case files, `PascalCase.tsx` components; one responsibility per file.
- Errors use stable `code`s, are never swallowed, and logs omit secrets, `initData`, OIDC codes and raw payloads. Store UTC; convert timezones in the UI.
- Comments explain why. New dependencies need a PR reason and lockfile entry; prefer platform APIs.

## Git
Work directly on `develop`: CI deploys it to Worker `dev`. `main` holds releases (deployed to Worker `app`) and changes only through a release PR from `develop`, opened by the owner. The owner commits and pushes: leave the task's changes ready (verified, `git status` shows only task files) and propose a commit message. Never commit or push to `main`, never force-push. A SQL change needs a migration. A contract change updates `contracts`, the backend, the frontend and the contract tests in the same PR.

## Done means verified
Follow the risk gate in `.agents/skills/orchestrate/SKILL.md`. Run required checks and report actual results. To the owner: short Russian summary. Subagents report:
```json
{"task_id":"","state":"DONE|BLOCKED|FAILED|NOT_VERIFIED","changed_paths":[],"contract_changes":[],"checks":[{"cmd":"","result":"passed|failed|not_run","evidence":"last relevant lines"}],"risks":[],"next":[]}
```
Claims need fresh evidence from this session: run the command, read the output, then state the result ("should work" is not a status). Before reporting, self-check: each acceptance criterion has evidence; the diff stays in your paths; no TODOs, debug logs or commented-out code; docs are updated if behavior changed. `not_run` is never success. If a critical input is missing, return `BLOCKED` naming it; do not invent requirements. After two failed attempts on the same error, stop and report. Stay inside the paths you were assigned; to read or change anything else, ask the orchestrator with a reason.
