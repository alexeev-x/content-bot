# Decision log

A short list of accepted decisions. An agent does not propose an alternative to a recorded decision until the owner raises the question: new facts are filed as a "proposal to revisit" with a reason. Details are in the referenced documents.

## Accepted by the owner
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | Modular monolith: one Worker, one D1, Cron (Queue only after measurements); no microservices | `docs/BACKEND_ARCHITECTURE.md` §1 |
| 03.10.2026 | Figma is excluded entirely; design lives only in code (tokens, primitives, screenshots) | `docs/DESIGN_SYSTEM_NO_FIGMA.md` |
| 03.10.2026 | Frontend stack: React Aria Components + CSS Modules, TanStack Router + Query, React Hook Form, `@internationalized/date`, Vite 8; one Worker serves the SPA and the API | `docs/FRONTEND_ARCHITECTURE.md` §0 |
| 03.10.2026 | Backend stack: Hono + Zod contracts (no RPC/OpenAPI), D1 via SQL without an ORM, Cron only (Queue — after measurements), grammY for the bot and sending without auto-retry, Vitest 4.1 + Cloudflare plugin | `docs/BACKEND_ARCHITECTURE.md` §1 |
| 03.10.2026 | Login: a single identity — the owner's Telegram ID; Mini App — `initData`, browser — Telegram OpenID Connect; token in memory, `Authorization: Bearer` | `docs/BACKEND_ARCHITECTURE.md` §8, skill `api-security` |
| 03.10.2026 | The admin UI is one SPA: website and Telegram Mini App; no third-party SDK | `docs/FRONTEND_ARCHITECTURE.md` §16 |
| 03.10.2026 | The bot is personal: commands only from the owner; the bot is an inbound adapter `app/bot` in the same Worker; an administrator of the owner's group with minimal rights; collecting data from the group — later | `docs/BACKEND_ARCHITECTURE.md` §2 |
| 03.10.2026 | All documentation and agent instructions are in English; the owner is addressed in Russian; end-user UI copy is Russian | `AGENTS.md` |
| 03.10.2026 | Uniform code style regardless of which AI writes it: Prettier + Oxlint via Husky/lint-staged on commit, `npm run verify:changed` on pre-push, and full `npm run verify` in GitHub CI | `README.md` |
| 03.10.2026 | Architecture skeleton created up front at the owner's request (exception to "no empty scaffolding"); skeleton files still contain minimal working, tested code | `apps/` |
| 03.10.2026 | Work is done only by project agents (orchestrator + backend, frontend, design-system, product-analyst, qa-security, researcher); built-in Claude Code helpers (Explore, Plan, general-purpose) allowed for read-only support; generic global agents denied in `.claude/settings.json`; no separate text-editor role | `docs/AGENT_ORCHESTRATION.md` |
| 03.10.2026 | Strict backend module boundaries: modules do not import each other; only `app/` wires them (ports + `container.ts`); enforced by dependency-cruiser | `docs/BACKEND_ARCHITECTURE.md` §2 |
| 03.10.2026 | Look and feel: calm monochrome, dark and light themes, no bright accents; color only for errors and `unknown` | `docs/FRONTEND_ARCHITECTURE.md` §10 |
| 03.10.2026 | Product code in `apps/{frontend,backend,contracts}`; agent infrastructure in `.agents/` | `README.md` |
| 03.10.2026 | Agents: one source for Claude Code and Codex (`.agents/` → generated adapters) | `docs/AGENT_ORCHESTRATION.md` |
| 03.10.2026 | Git: work directly in `develop` (shipped to the dev Worker, see 05.10.2026); `main` — releases via a `develop → main` PR; the owner commits and pushes | `AGENTS.md` |
| 05.10.2026 | CI deploys after green checks: `develop` → Worker `dev` (`dev.alexeevs.workers.dev`), `main` → Worker `app` (`app.alexeevs.workers.dev`) via `CLOUDFLARE_ENV`; each environment owns its D1 and vars; remote migrations stay manual owner actions | `.github/workflows/ci.yml`, `apps/backend/wrangler.jsonc` |
| 03.10.2026 | `unknown` from Telegram — manual reconciliation only, never an automatic retry | skill `publishing-reliability` |
| 03.10.2026 | No paid AI/render APIs and no paid plans without a separate owner decision | `AGENTS.md` |
| 03.10.2026 | Token savings: RTK, the caveman proxy, claude-context, context-mode are not used (rationale and measurements) | `docs/AGENT_ORCHESTRATION.md` |
| 05.10.2026 | Secret scanning is full-history Gitleaks with repository config `.gitleaks.toml`; docs/tests use obvious placeholders; false positives may be ignored only by narrow path + pattern rules, never by commit-SHA fingerprints | `.gitleaks.toml`, `.github/workflows/ci.yml`, `README.md` |

## Awaiting owner decision
| Question | Default recommendation |
|---|---|
| Text generation via AI | not in the MVP |
| Dota 2 patch posts published without owner confirmation (`docs/PATCH_AUTOMATION_PLAN_DRAFT.md`) | after the MVP; until then patch posts go through owner confirmation, no paid AI/render APIs |
| Session lifetime | token 60 min; Mini App ≤ 12 h; refresh cookie in the browser 30 days |
| Publication status labels | table in skill `page-spec` |
| Repeated `Idempotency-Key` with a different body | 409 `CONFLICT` with `details.reason` |
| Stale draft revision | revision in the request body → 409 (no `If-Match` header) |
