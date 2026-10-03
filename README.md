# ALEXEEV Content Bot / Studio

**Status:** development scaffold, not production publishing. The current code has the SPA bootstrap, backend Hono/grammY/Cron scaffolding, initial domain modules and Zod contracts. An endpoint, module or test existing does **not** imply that authentication, durable scheduling or public Telegram sending is complete. Track the evidence-based stages in `docs/IMPLEMENTATION_PLAN.md`.

## Canonical structure
```text
apps/frontend/      React SPA, TanStack Router/Query, React Aria + CSS Modules; same Worker deployment
apps/backend/       Cloudflare Worker, Hono, grammY inbound bot, D1 and scheduled handler
apps/contracts/     Shared Zod wire contracts; no business logic
.agents/            SINGLE source for role prompts, skills, hooks and tooling
.claude/, .codex/   Generated/adapter layers from .agents; do not edit role copies
 docs/              Approved decisions, architecture, API, page map, implementation state
```

**Precedence:** `docs/DECISIONS.md` (owner decisions) → root and area `AGENTS.md` → relevant canonical architecture/contract → scoped skills in `.agents/`. If documents disagree with actual code, record the discrepancy; never silently claim planned features are implemented. Obsolete `agents/*.md` files are migration pointers only.

## Local commands
```bash
npm ci --ignore-scripts
npm run dev               # SPA + Worker via Cloudflare Vite plugin
npm run dev:backend       # standalone Worker at localhost:8790
npm run db:migrate:local
npm run verify            # format, lint, docs/agent sync, tooling tests, types, architecture, app tests, build
npm run verify:changed    # subset relevant to unpushed/uncommitted changes
npm run agents:sync       # regenerate Claude/Codex adapters after editing .agents
npm run agents:check      # detect generated-adapter drift
npm run check:docs        # instruction budgets, paths, links
npm run metrics           # collected agent-session usage (if hooks were active)
npm run deploy:check      # build + dry-run only
```
Use the Node version from `.nvmrc`. `npm ci --ignore-scripts` does not set up Husky hooks; use the owner-approved local setup where appropriate. Commands and status must be reported from an **actual run**; their presence in package.json is not proof they passed.

## Agent workflow
- Claude Code and Codex read root `AGENTS.md`; area instructions apply to `apps/{backend,frontend,contracts}`. Their source role prompts live in `.agents/roles`, procedures in `.agents/skills`. Claude/Codex adapters are generated with `npm run agents:sync` and checked in CI.
- For multi-area work invoke `orchestrate`; for small single-area work the main agent can do it without spawning the whole team. Product analyst, design-system, frontend, backend, researcher and independent QA are demand-driven roles.
- Every agent receives one bounded task packet (goal, owned paths, acceptance, minimal references); never pass the entire chat or all architecture documents by default. After two failed repair rounds on the same error, escalate instead of looping.
- Hook policies block dangerous commands and try to verify builders on stop; **confirm hooks are enabled in the actual tool**. QA/CI and manual sign-off remain mandatory where appropriate.
- Evidence-based Done: each criterion has a test/check outcome; `not_run` is explicit; no phantom green CI and no invented token savings. `npm run metrics` is useful only when relevant hooks actually collected data.

## Git and release
The current `develop` instruction set records owner-managed commits directly on `develop`, with `main` updated only through an owner-controlled release PR; this conflicts with the earlier requested `feat/* → develop → main` convention. **Do not silently change either rule:** use a feature PR for this documentation synchronization and have the owner reconcile the permanent contributor workflow. Never push directly to `main`, force-push, run remote migrations or deploy as an agent.

## Runtime security and deployment
Single Worker serves SPA, `/api/v1/*` and `/webhooks/telegram`; Cron drives due work and reconcile; **Queue only after measurement**, not part of the current MVP. D1 is the source of truth; any possibly sent but unconfirmed Telegram request becomes `unknown`, with manual reconciliation and no automatic retry. In Mini App, server verifies `initData`; in browser, Telegram OIDC; short-lived Bearer token in memory. Bot secrets live only in Worker secrets. No separate staging environment is currently configured: use a **dedicated test bot/channel and isolated local D1** for checks and never test production sending implicitly.

Production operations are OWNER ONLY: `npm run db:migrate:remote`, `npm run deploy` and secret changes. A verified Time Travel bookmark precedes remote migrations. Do not claim the application is production-ready before the release criteria in `docs/IMPLEMENTATION_PLAN.md` are met.
