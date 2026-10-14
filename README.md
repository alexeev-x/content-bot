# ALEXEEV Content Bot / Studio

**Status:** in development, NOT production. A new plan is being written (the old one was removed 14.10.2026). Canon: `docs/BACKEND_ARCHITECTURE.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `AGENTS.md`.

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
npm run dev               # the whole app locally: SPA + API + bot webhook + Cron, one process (Vite + Cloudflare plugin); applies local migrations first and signs the owner in without Telegram (docs/LOCAL_PREVIEW.md)
npm run dev:backend       # the Worker alone (API, webhook, Cron) via wrangler dev on http://localhost:8790
npm run preview           # production build served locally
npm run explore           # admin in Chrome with a mock API, no Telegram sign-in (docs/LOCAL_PREVIEW.md)
npm run db:migrate:local  # apply D1 migrations to the local database
npm run verify            # everything CI checks (format, lint, docs, types, architecture, tests, build)
npm run deploy:check      # build + dry-run deploy (nothing is uploaded)
npm run deploy            # manual deploy helper; normal remote deploys happen only in GitHub CI
npm run db:migrate:dev   # OWNER ONLY: apply migrations to the dev D1 (content-db-dev); or GitHub Actions → "D1 migrations"
npm run db:migrate:prod  # OWNER ONLY: apply migrations to the production D1 (content-db-prod; take a Time Travel bookmark first)
npm run agents:sync       # after editing .agents/roles or .agents/skills
```

Local URLs: `npm run dev` prints the address (Vite, usually http://localhost:5173). Useful checks: `/api/v1/health`; trigger the Cron handler with `curl http://localhost:5173/cdn-cgi/handler/scheduled` (or port 8790 for `dev:backend`).

### Local environment

The canonical project environment template is the root `.env.example`. Keep **development-only** values locally; production bot tokens and production destination IDs must not be used for local development.

The Cloudflare Worker currently reads local runtime secrets from `apps/backend/.dev.vars`, so copy the Telegram values from the root template there when running the Worker locally. Both `.env` and `.dev.vars` are gitignored. `BOT_INFO` is optional: connecting the bot stores its identity in D1; set `BOT_INFO` only to override it.

Cloudflare deploys are branch-driven: after the owner provisions each environment's D1/vars/secrets, a green push to `develop` deploys Worker `dev` (`dev.alexeevs.workers.dev`); a green push to `main` deploys Worker `app` (`app.alexeevs.workers.dev`). Remote D1 migrations are an explicit owner action: apply every pending migration to an environment's D1 (Actions → D1 migrations) before pushing code that needs it.

Git hooks (Husky): `npm run prepare` installs the repository hooks in the local Git checkout. Pre-commit formats and lints staged files (Prettier + Oxlint autofix); pre-push runs `npm run verify:changed` for checks touched by unpushed changes. Hooks can be bypassed or left uninstalled, so GitHub CI checks independently and always runs a full-history Gitleaks scan. On `main` it runs the full `npm run verify`; on `develop` and pull requests it checks only the areas the push/PR range touches (`verify --changed --base`), with the Vitest suites sharded across runners. After all checks are green, push events deploy `develop` to `dev` and `main` to `app`, then call `/api/v1/health` as a smoke check; pull requests never deploy.

## Working with AI agents
- **Claude Code** and **Codex** read the same `AGENTS.md`, area rules (`apps/backend/AGENTS.md`, …), roles and skills. Details — `docs/AGENT_ORCHESTRATION.md`.
- Large task: in Claude — `/orchestrate <what is needed>`, in Codex — `$orchestrate <what is needed>`. Targeted task: just ask or name a role («пусть backend …», «проверь через qa-security»).
- Agents talk to the owner in Russian.
- Do not create a root `CLAUDE.md`: otherwise Claude stops reading `AGENTS.md`.

### How to set a task
- Describe the result and 2–3 Given/When/Then acceptance criteria, not the actions.
- One task — one session — one commit to `develop`; start from a clean tree, `/clear` (Claude) or a new session (Codex) for the next task.
- Do not accept "done" without the `npm run verify` output and a list of what was not run.
- Codex: run `/hooks` once and trust the project's `.codex/` layer, otherwise the guard hooks will not load.

## Security
Secrets only in Worker secrets; do not commit `.env*`/`.dev.vars`. CI scans the full Git history with Gitleaks using `.gitleaks.toml`. Documentation and tests must use obvious placeholders such as `<YOUR_SECRET_HERE>`, never realistic-looking fake credentials. Reviewed false positives use narrow path + pattern allowlists; commit-SHA fingerprints are forbidden because merges create new fingerprints. On `unknown` from Telegram — manual reconciliation, never an automatic retry. There is no separate staging environment; tests use fakes or local resources and must not target production Telegram destinations or remote D1.
