# Decision log

Accepted decisions that are in force. An agent does not propose an alternative to a recorded decision until the owner raises the question: new facts are filed as a "proposal to revisit" with a reason. Superseded decisions are removed (see Git history); the date is when the current form was accepted.

## Architecture and stack
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | Modular monolith: one Worker, one D1, Cron (Queue only after measurements); no microservices | `docs/BACKEND_ARCHITECTURE.md` §1 |
| 03.10.2026 | Strict backend module boundaries: modules do not import each other; only `app/` wires them (ports + `container.ts`); enforced by dependency-cruiser | `docs/BACKEND_ARCHITECTURE.md` §2 |
| 03.10.2026 | Backend stack: Hono + Zod contracts (no RPC/OpenAPI), D1 via SQL without an ORM, grammY for the bot and sending without auto-retry, Vitest 4.1 + Cloudflare plugin | `docs/BACKEND_ARCHITECTURE.md` §1 |
| 03.10.2026 | Frontend stack: React Aria Components + CSS Modules, TanStack Router + Query, React Hook Form, `@internationalized/date`, Vite 8; one Worker serves the SPA and the API | `docs/FRONTEND_ARCHITECTURE.md` §0 |
| 03.10.2026 | Product code in `apps/{frontend,backend,contracts}`; agent infrastructure in `.agents/` | `README.md` |

## Product
| Date | Decision | Details |
|---|---|---|
| 06.10.2026 | ALEXEEV Studio is the full product control plane, not a minimal admin MVP; backend first, then the redesign and the remaining capabilities; browser and Mini App keep feature parity | `docs/IMPLEMENTATION_PLAN.md`, `docs/PAGE_MAP.md` |
| 03.10.2026 | The admin UI is one SPA: website and Telegram Mini App; no third-party SDK | `docs/FRONTEND_ARCHITECTURE.md` §16 |
| 03.10.2026 | The bot is personal: commands only from the owner; inbound adapter `app/bot` in the same Worker; administrator of the owner's group with minimal rights; collecting data from the group — later | `docs/BACKEND_ARCHITECTURE.md` §2 |
| 07.10.2026 | The end goal is a server that prepares content itself. First step: Phase 1D — watch official Dota sources and turn a new update into a template draft with a private owner alert; publishing still needs owner approval | `docs/IMPLEMENTATION_PLAN.md` Phase 1D |
| 06.10.2026 | Deleting or archiving a post or publication in the admin never deletes the message from the Telegram channel | `docs/BACKEND_ARCHITECTURE.md` §5 |
| 06.10.2026 | Every delete asks for confirmation; post lists (including the Archive) and final publications support bulk delete | `docs/design/UX_SPEC.md` §3.2 |
| 08.10.2026 | Обзор is a customizable widget grid (react-grid-layout v2 in edit mode only); layout stored server-side per owner with revision/409 | `apps/contracts/src/dashboard-layout.ts` |

## Publishing and data
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | `unknown` from Telegram — manual reconciliation only, never an automatic retry | skill `publishing-reliability` |
| 06.10.2026 | Stale draft revision travels in the request body; a stale one is 409 `CONFLICT` with `details.reason = STALE_REVISION` (no `If-Match` / 412) | `apps/contracts/src/posts.ts`, `docs/API_CONTRACTS.md` |
| 08.10.2026 | Post approval stores an immutable content snapshot; publication sends exactly that snapshot; the revision number guards against stale edits | `docs/plan/content-studio.md` |

## Auth and security
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | A single identity — the owner's Telegram ID; Mini App — `initData`; token in memory, `Authorization: Bearer` | `docs/BACKEND_ARCHITECTURE.md` §8, skill `api-security` |
| 06.10.2026 | Browser sign-in: classic Telegram Login Widget (no OIDC: BotFather gives no client credentials for this bot). The page listens for the widget's `auth_user` postMessage from `oauth.telegram.org` with exact origin/source checks (not `data-onauth`, which needs `unsafe-eval`); the server verifies the hash, one-time use | `docs/API_CONTRACTS.md`, skill `api-security` |
| 05.10.2026 | Secret scanning: full-history Gitleaks with `.gitleaks.toml`; placeholders in docs/tests; false positives only by narrow path + pattern rules, never commit-SHA fingerprints | `.gitleaks.toml`, `README.md` |
| 03.10.2026 | No paid AI/render APIs and no paid plans without a separate owner decision | `AGENTS.md` |

## Design
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | Figma is excluded entirely (reaffirmed 07.10.2026, including picking templates); design lives only in code | `docs/design/README.md` |
| 08.10.2026 | Admin design approved: `UX_SPEC.md` + the `/__proto` prototype are the design source; real pages follow the prototype; preview pages stay DEV-only | `docs/design/README.md`, `docs/design/UX_SPEC.md` |
| 06.10.2026 | Accent palette per theme in Settings → Appearance: presets (cobalt default, indigo, copper, orchid, mono) or up to 10 custom presets (one base color + name; light/dark shades derived to keep WCAG AA; warning when close to failed/unknown hues); stored on the server | `apps/contracts/src/settings.ts` |
| 07.10.2026 | A top-bar button toggles light ↔ dark and saves at once; accent changes need an explicit Save; Settings is master/detail; bot status lives on the dashboard | `docs/design/UX_SPEC.md` §3.6, §4.5 |
| 03.10.2026 | Documentation and agent instructions are in English; the owner is addressed in Russian; UI copy is Russian | `AGENTS.md` |

## Process and environments
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | Git: work directly in `develop`; `main` — releases via a `develop → main` PR; the owner commits and pushes | `AGENTS.md` |
| 05.10.2026 | CI deploys after green checks: `develop` → Worker `dev`, `main` → Worker `app`; each environment owns its D1 and vars; remote migrations stay manual owner actions | `.github/workflows/ci.yml`, `apps/backend/wrangler.jsonc` |
| 07.10.2026 | Everything is tested only in DEV; production is not prepared or released until the owner says DEV is ready | `docs/IMPLEMENTATION_PLAN.md` Phase 10 |
| 03.10.2026 | Uniform code style: Prettier + Oxlint via Husky/lint-staged on commit, `verify:changed` on pre-push, full `verify` in CI | `README.md` |
| 03.10.2026 | Agents: one source for Claude Code and Codex (`.agents/` → generated adapters); work only by project roles; built-in read-only helpers allowed; generic global agents denied in `.claude/settings.json` | `docs/AGENT_ORCHESTRATION.md` |
| 09.10.2026 | Substantive UI tasks go UX → mock-only clickable prototype → independent UI QA → implementation → UI QA; owner approval is optional unless requested or an owner-only decision is needed | `docs/AGENT_UI_WORKFLOW.md` |
| 09.10.2026 | Owner reference images are reproduced visually exactly (composition, element shapes, sizes, spacing) using our colours, fonts and components; a shape our system lacks becomes a new primitive variant or token, never local CSS | `docs/AGENT_UI_WORKFLOW.md` § Reference fidelity |
| 03.10.2026 | Token-saving tools (RTK, caveman proxy, claude-context, context-mode) are not used: measured gains were negligible or they send code to external services | — |

## Awaiting owner decision
| Question | Default recommendation |
|---|---|
| Text generation via AI | not in the MVP |
| Dota 2 patch posts published without owner confirmation (`docs/PATCH_AUTOMATION_PLAN_DRAFT.md`) | after the MVP; until then patch posts go through owner confirmation, no paid AI/render APIs |
| Session lifetime | token 60 min; Mini App ≤ 12 h; refresh cookie in the browser 30 days |
| Publication status labels | table in skill `page-spec` |
| Repeated `Idempotency-Key` with a different body | 409 `CONFLICT` with `details.reason` |
