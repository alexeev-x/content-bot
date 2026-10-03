# Implementation plan — verified baseline

**As of 2026-10-03.** The repository is a functioning development scaffold, **not a production publishing system**. Read `docs/DECISIONS.md` before proposing changed architecture. Use `npm run verify` as the documented verification gate; tests listed as planned are not completed by documentation alone.

## Implemented in develop
- [x] npm workspaces under `apps/frontend`, `apps/backend`, `apps/contracts`; lockfile and one-Worker deployment configuration.
- [x] Frontend bootstrap: React/TanStack Router and Query, theme foundation, placeholder UI; full application flows remain planned.
- [x] Backend bootstrap: Hono `fetch` plus `scheduled`, `GET /api/v1/health`, grammY inbound bot scaffold and initial domain modules/helpers. Creating a module or schema does not imply that publication dispatch is operational.
- [x] Shared initial Zod contracts, module import boundaries, representative unit tests and GitHub Actions invoking `npm run verify`.
- [x] One-source agent infrastructure: `.agents/roles`, `.agents/skills`, hooks, adapters for Claude/Codex, sync/budget checks, scoped verification and usage metrics tooling.
- [x] No Figma; design tokens/components and browser checks are the approved delivery model.

## Gate 0 — environment and quality
- [ ] Confirm a fresh `npm ci --ignore-scripts && npm run verify` passes on the current develop SHA, and capture the GitHub Actions result. Presence of CI configuration is not proof of a green run.
- [ ] Configure owner-managed Worker secrets, Telegram bot, OIDC, D1 database ID and Cron. Local `.dev.vars` is excluded from Git.
- [ ] Verify hook enforcement separately for Claude and Codex; Codex requires user trust/enablement. A hook configuration file alone is not proof that guards are active.
- [ ] Add/validate end-to-end browser and security checks needed by a completed workflow, including secret scanning and dependency checks according to actual needs.

## Gate 1 — safe Telegram MVP
- [ ] Implement and integration-test owner-only Mini App `initData` and browser Telegram OIDC; short-lived Bearer token stored in memory. Cookie-based refresh endpoints enforce Origin.
- [ ] Complete drafts/revisions and publications/incident contracts; validate on both sides; handle 401/403/409/429 and errors without data loss.
- [ ] Implement D1 migrations and durable content/publication/job state, conditional claims and deduplication.
- [ ] Implement Cron reconcile + dispatch and grammY publication transport. `unknown` or any possibly-sent ambiguous outcome requires **manual reconciliation**; never auto-retry it. Queue only after measurements and an approved change.
- [ ] Implement the actual web/Mini App login, editor, calendar, incidents and settings routes using React Aria + CSS Modules + semantic tokens. Avoid artificial success states.
- [ ] Run real local Worker/D1 integration tests, duplicate Cron/webhook tests, timeout/unknown tests, browser keyboard/mobile visual tests, and test-bot E2E before calling MVP operational.

## Gate 2 — after MVP
- [ ] Dota data adapters, normalized caching with source/timestamps, R2 media when genuinely needed.
- [ ] Analytics, content planning and reliable large video uploads.
- [ ] TikTok/YouTube only after relevant API access and platform review/limits are verified.

## Release ownership
Agents must never deploy, migrate remote D1 or change production secrets. The owner controls production release and any `develop → main` release PR. Until a new explicit decision, the current develop documents describe owner-driven commits on develop; branch/PR policy disagreements are listed for owner reconciliation rather than silently rewritten by an agent.

**Release bar:** real CI results, authenticated Worker + test Telegram bot E2E, secret audit, failed-Cron recovery and manual `unknown` runbook. The 1,000 jobs/day figure is a *target*, not verified capacity. The exact Free-tier limits require up-to-date measurement and verification.
