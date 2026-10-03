# Execution plan and actual statuses

**Verified:** an approved technical design exists; the code from the previous GitHub main was deleted by commit `e627801`. This PR restores the documentation and development rules; it does not declare a finished production product.

## Gate 0: repository/bootstrap
- [x] npm workspaces (`frontend`, `backend`, `contracts`); lockfile; CI running `npm ci` with commands that actually exist (`npm run verify`).
- [x] Agent system for Claude Code and Codex from a single source (`.agents/`), sync checks and instruction budgets.
- [ ] Quality gates: ESLint, Prettier, dependency-cruiser, Vitest (+ workers pool), stylelint ban on colors outside tokens, gitleaks, npm audit.
- [ ] Wrangler: static assets (SPA), D1, Cron; secrets (bot token, OIDC) are set by the owner; no staging.
- [ ] Protected main, GitHub Actions `npm run verify`; production deploy at the owner's button press (migrations → code).

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
