# ALEXEEV Content Bot / Studio

**Status:** architecture and starter skeleton, NOT production. Only `GET /api/v1/health` and an admin placeholder work. Canon: `docs/BACKEND_ARCHITECTURE.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `AGENTS.md`.

## Structure
```text
apps/                all product code
├── frontend/        admin UI: React + TypeScript + Vite
├── backend/         Cloudflare Worker: Hono, D1, Cron, bot (grammY)
└── contracts/       shared Zod API schemas (the only link frontend ↔ backend)
docs/                architecture and decisions (in English)
.agents/             roles, skills and scripts of AI agents (source for .claude/ and .codex/)
```

## Commands
```bash
npm ci                    # install from the lockfile (Node from .nvmrc); `npm install` also sets up git hooks
npm run dev               # the whole app locally: SPA + API + bot webhook + Cron, one process (Vite + Cloudflare plugin)
npm run dev:backend       # the Worker alone (API, webhook, Cron) via wrangler dev on http://localhost:8790
npm run preview           # production build served locally
npm run db:migrate:local  # apply D1 migrations to the local database
npm run verify            # everything CI checks (format, lint, docs, types, architecture, tests, build)
npm run deploy:check      # build + dry-run deploy (nothing is uploaded)
npm run deploy            # manual deploy helper; normal remote deploys happen only in GitHub CI
npm run db:migrate:dev   # OWNER ONLY: apply migrations to the dev D1 (content-db-dev); or GitHub Actions → "D1 migrations"
npm run db:migrate:prod  # OWNER ONLY: apply migrations to the production D1 (content-db-prod; take a Time Travel bookmark first)
npm run agents:sync       # after editing .agents/roles or .agents/skills
npm run metrics           # tokens and cost per agent session
```

Local URLs: `npm run dev` prints the address (Vite, usually http://localhost:5173). Useful checks: `/api/v1/health`; trigger the Cron handler with `curl http://localhost:5173/cdn-cgi/handler/scheduled` (or port 8790 for `dev:backend`).

### Local environment

The canonical project environment template is the root `.env.example`. Keep **development-only** values locally; production bot tokens and production destination IDs must not be used for local development.

The Cloudflare Worker currently reads local runtime secrets from `apps/backend/.dev.vars`, so copy the Telegram values from the root template there when running the Worker locally. Both `.env` and `.dev.vars` are gitignored. `BOT_INFO` is optional: Settings → Бот → «Подключить бота» calls Telegram `getMe` with `TELEGRAM_BOT_TOKEN` and stores the bot identity in D1 (`bot_identity`, migration 0007). Set `BOT_INFO` only to override it.

Cloudflare deploys are branch-driven: after the owner provisions each environment's D1/vars/secrets, a green push to `develop` deploys Worker `dev` (`dev.alexeevs.workers.dev`); a green push to `main` deploys Worker `app` (`app.alexeevs.workers.dev`). Remote D1 migrations remain an explicit owner action before code that depends on them is released. Apply every pending migration to an environment's D1 before setting its `PUBLISHING_ENABLED` to `"true"`: the dispatcher writes `job_attempts` (migration 0005) after each send. Likewise apply migration 0007 (`bot_identity`) to an environment's D1 (Actions → D1 migrations) before pushing code that needs it; until then the bot answers 503 `MIGRATION_PENDING`.

Git hooks (Husky): `npm run prepare` installs the repository hooks in the local Git checkout. Pre-commit formats and lints staged files (Prettier + Oxlint autofix); pre-push runs `npm run verify:changed` for checks touched by unpushed changes. Hooks can be bypassed or left uninstalled, so GitHub CI independently runs full `npm run verify` plus a full-history Gitleaks scan on pushes to `develop`/`main` and pull requests. After all checks are green, push events deploy `develop` to `dev` and `main` to `app`; pull requests never deploy.

## Working with AI agents
- **Claude Code** and **Codex** read the same `AGENTS.md`, area rules (`apps/backend/AGENTS.md`, …), roles and skills. Details — `docs/AGENT_ORCHESTRATION.md`.
- Large task: in Claude — `/orchestrate <what is needed>`, in Codex — `$orchestrate <what is needed>`. Targeted task: just ask or name a role («пусть backend …», «проверь через qa-security»).
- Agents talk to the owner in Russian.
- Do not create a root `CLAUDE.md`: otherwise Claude stops reading `AGENTS.md`.

### How to set a task so it is cheap and good
1. **A result, not actions:** "the operator sees a list of publications with statuses and can filter unknown", not "make a table".
2. **One task — one session — one commit to `develop`.** Start from a clean working tree and commit after a green `npm run verify`; do not mix unrelated changes.
3. **Acceptance criteria** (at least 2–3 given/when/then items) — the agent verifies against them, not "by eye".
4. **A new session for a new task** (`/clear` in Claude, a new session in Codex) — the old conversation does not drag along and does not spend tokens.
5. **Plan first for large work** (planning mode), edits after the plan is agreed.
6. **Do not accept "done" without the `npm run verify` output** and a list of what was not run.
7. **Do not change instructions, settings and hooks in the middle of a working session** — they sit in the cached prefix, and an edit re-reads the whole context at full price.
8. **Look at `npm run metrics`** before changing models or roles: decisions by data, not by feel.
9. **Codex:** run `/hooks` once and trust the project's `.codex/` layer, otherwise the guard hooks will not load.
10. **A repeated request → a skill.** If you explain the same thing to the agent a second time, it is a candidate for `.agents/skills/`.

## Security
Secrets only in Worker secrets; do not commit `.env*`/`.dev.vars`. CI scans the full Git history with Gitleaks using `.gitleaks.toml`. Documentation and tests must use obvious placeholders such as `<YOUR_SECRET_HERE>`, never realistic-looking fake credentials. Reviewed false positives use narrow path + pattern allowlists; commit-SHA fingerprints are forbidden because merges create new fingerprints. On `unknown` from Telegram — manual reconciliation, never an automatic retry. There is no separate staging environment; tests use fakes or local resources and must not target production Telegram destinations or remote D1.
