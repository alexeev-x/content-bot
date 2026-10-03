# ALEXEEV Content Bot — agent rules

Shared by Claude Code and Codex, loaded into every agent: keep it short. Talk to the owner in Russian; code, identifiers, commits and branch names are English.

**Status:** scaffold. Working today: `GET /api/v1/health`, a placeholder admin page, three Zod schemas. Auth, D1, Cron/Queue and Telegram sending are not implemented — never describe planned parts as working.

## Layout
- `apps/frontend/` — React + Vite admin SPA. Rules: `apps/frontend/AGENTS.md`.
- `apps/backend/` — Hono on Cloudflare Workers (`fetch` / `scheduled` / `queue`); D1 is the source of truth. Rules: `apps/backend/AGENTS.md`.
- `apps/contracts/` — Zod DTOs shared by both sides. Rules: `apps/contracts/AGENTS.md`.
- `docs/` — canonical architecture (Russian). Open only the section you need.
- `.agents/` — role sources (`roles/`), skills (`skills/`), tooling (`scripts/`). `.claude/` and `.codex/` are generated from it: edit sources, then `npm run agents:sync`.

## Load context on demand, never everything
| When you touch | Load |
|---|---|
| `apps/backend/**` | `apps/backend/AGENTS.md`, then the needed section of `docs/BACKEND_ARCHITECTURE.md` |
| `apps/frontend/**` | `apps/frontend/AGENTS.md`, then the needed section of `docs/FRONTEND_ARCHITECTURE.md` |
| `apps/contracts/**` or any request/response shape | skill `contract-change` |
| publications, jobs, Cron, Queue, Telegram send | skill `publishing-reliability` |
| SQL or migrations | skill `d1-migration` |
| auth, sessions, CSRF, webhook, uploads | skill `api-security` |
| writing or fixing tests | skill `testing` |
| a bug, failing test or CI failure | skill `debugging` |
| Worker runtime, bindings, config, Wrangler commands | skills `workers-best-practices`, `wrangler` (official Cloudflare) |
| a page, its states, accessibility | skill `page-spec`, skill `ui-patterns` |
| tokens, primitives, look and feel, UI copy | skill `visual-design` |
| visual verification in a browser | skill `visual-check` |
| a task spanning several roles or steps | skill `orchestrate` |

Codex loads only the AGENTS.md files between the repo root and its working directory: open area files yourself. Claude Code loads them when it reads files in that area. Search with `rg` and read the specific lines you need, not whole large files. Don't reread files you have. `npm run verify` prints only failures; open `.logs/verify.log` only if the summary is not enough.

Write tersely: no preamble, no restating the task, no recap of a visible diff. Code, commands and error text stay exact.

## Working with the owner
- Decide, don't quiz: pick the conventional default, say it in one line with the reason, and proceed. Escalate only owner-level choices (publishing behavior, access, money, changing a recorded decision), batched, each with your recommended default.
- Recorded decisions live in `docs/DECISIONS.md`; don't relitigate them unprompted.
- Do only what the task asks: no unrequested features, refactors or abstractions.

## Non-negotiables
- Modular monolith: one Worker, one D1, one Cron (plus one Queue only where the architecture says so). No microservices, generic repositories, event bus, service locator or DI container; `apps/backend/src/app/container.ts` wires adapters by hand.
- Other modules are imported only through their `index.ts`. No cycles. Domain code never imports infrastructure.
- No mutable module-level state holding user, request or job data. Bound payload sizes, batches, concurrency and timeouts.
- Publishing safety: D1 owns state and dedup. Queue delivery is at-least-once. A Telegram send that may have happened but is unconfirmed becomes `unknown` and needs manual reconciliation; it is never retried automatically.
- Secrets (bot token, API keys) live only in Worker secrets. They never go into the frontend, git, logs or reports. Staging has its own bot, channel and D1.
- The server re-validates every input with Zod and re-checks the session, permissions and CSRF/Origin. Client validation is UX only.
- Design exists only as code: tokens, primitives and browser screenshots. Figma is excluded (owner decision 03.10.2026); never propose it.
- Agents never deploy, run `--remote` D1 commands, or change secrets (`wrangler secret put/delete` deploys immediately). The owner runs these.
- No paid AI providers, render APIs or paid cloud tiers without an explicit owner decision.
- No empty scaffolding: a new module ships with behavior, error/empty handling, tests and doc updates.
- Never claim 1 000 jobs/day before a load test.

## TypeScript style (all packages)
- `strict`; no `any`; `!` only in bootstrap code; external data is `unknown` until parsed with Zod.
- Named exports. Files are kebab-case; React components are `PascalCase.tsx`. One responsibility per file.
- Errors carry a stable `code` (see `contracts`). Never swallow an error. Never log secrets, one-time codes or raw payloads.
- Store time as UTC; convert to a timezone only in the UI.
- Comments say why, not what; match surrounding code.
- Each new dependency needs a reason in the PR and goes into the lockfile. Prefer platform APIs.

## Git
Work directly on `develop`: it is the development environment (there are no other stands). `main` holds releases and changes only through a release PR from `develop`, opened by the owner. The owner commits and pushes: leave the task's changes ready (verified, `git status` shows only task files) and propose a commit message. Never commit or push to `main`, never force-push. A SQL change needs a migration. A contract change updates `contracts`, the backend, the frontend and the contract tests in the same PR.

## Done means verified
Run `npm run verify` plus the tests of the area you touched. To the owner: a short Russian summary. A subagent reports to the orchestrator in this format, listing only what actually ran:
```json
{"task_id":"","state":"DONE|BLOCKED|FAILED|NOT_VERIFIED","changed_paths":[],"contract_changes":[],"checks":[{"cmd":"","result":"passed|failed|not_run","evidence":"last relevant lines"}],"risks":[],"next":[]}
```
Claims need fresh evidence from this session: run the command, read the output, then state the result ("should work" is not a status). Before reporting, self-check: each acceptance criterion has evidence; the diff stays in your paths; no TODOs, debug logs or commented-out code; docs are updated if behavior changed. `not_run` is never success. If a critical input is missing, return `BLOCKED` naming it; do not invent requirements. After two failed attempts on the same error, stop and report. Stay inside the paths you were assigned; to read or change anything else, ask the orchestrator with a reason.
