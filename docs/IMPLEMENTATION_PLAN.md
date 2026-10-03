# Execution plan and actual statuses

**Verified:** an approved technical design exists; the code from the previous GitHub main was deleted by commit `e627801`. This PR restores the documentation and development rules; it does not declare a finished production product.

## Gate 0: repository/bootstrap
- [x] npm workspaces (`frontend`, `backend`, `contracts`); lockfile; CI running `npm ci` with commands that actually exist (`npm run verify`).
- [x] Agent system for Claude Code and Codex from a single source (`.agents/`), sync checks and instruction budgets.
- [x] Quality gates: Prettier + Oxlint (decision 03.10.2026, replaces ESLint), dependency-cruiser, Vitest (+ Cloudflare workers pool), colour literals only in `tokens.css` (a frontend test instead of stylelint), `npm audit` (production deps) and gitleaks (full history) in CI.
- [x] Wrangler: one Worker serves the SPA (static assets), the API, D1 and Cron; checked locally with `npm run dev:backend` (health, SPA fallback, Cron handler).
- [x] GitHub Actions: `npm run verify`, `npm audit`, gitleaks on every push to `develop`/`main` and every PR.
- [ ] Owner: create the D1 database and put its id into `apps/backend/wrangler.jsonc`; set `OWNER_TELEGRAM_ID` and secrets; protect `main` (require the CI checks) in GitHub settings. Production deploy at the owner's button press (migrations → code).

## Gate 1: safe Telegram MVP
- [ ] Contracts: auth, posts, publication, incident; 401/403/409/429/unknown.
- [ ] Backend identity, content, publishing, scheduler, Telegram integration, monitoring; D1 migrations.
- [ ] Cron dispatcher: conditional claim, `send_started_at`, idempotency keys, `unknown` without automatic retry.
- [ ] Frontend design-in-code, login, dashboard, editor, calendar, incidents; desktop/mobile and Telegram login (website and Mini App).
- [ ] Unit+integration+E2E: double Cron, webhook replay, lost Telegram response, login (`initData`, OIDC, foreign ID), 409, polling on a hidden tab, keyboard, Mini App.

## Gate 2: extensions (after a working MVP)
- [ ] Dota data adapters + caching/source timestamps; own images and templates in R2.
- [ ] Analytics and content planning; video upload resumability.
- [ ] TikTok/YouTube publishing only after API access and platform-rule compliance are confirmed.

## Release bar
`ready` must not be claimed without a successful CI, E2E on a real Worker with a test bot, a secrets audit, recovery after a failed Cron tick and manual reconciliation of unknown. The 1000 tasks/day target only after a load test, free of charge — within actual quotas.
