# План исполнения и реальные статусы

**Проверено:** существует утверждённый технический дизайн; код из прежнего GitHub main был удалён коммитом `e627801`. Этот PR восстанавливает документацию и правила разработки, а не объявляет готовый production-продукт.

## Gate 0: repository/bootstrap
- [x] npm workspaces (`frontend`, `backend`, `contracts`); lockfile; CI на `npm ci` с реально существующими командами (`npm run verify`).
- [x] Агентная система для Claude Code и Codex из одного источника (`.agents/`), проверки синхронизации и бюджетов инструкций.
- [ ] Quality gates: ESLint, Prettier, dependency-cruiser, Vitest (+ workers pool), stylelint-запрет цветов вне токенов, gitleaks, npm audit.
- [ ] Wrangler bindings в staging: D1, Queue producer/consumer, Cron, при необходимости R2; secrets отдельно от Git.
- [ ] Protected main, GitHub Actions typecheck/lint/architecture/unit/integration/build; deploy staging.

## Gate 1: безопасный Telegram MVP
- [ ] Contracts: auth, posts, publication, incident; 401/403/409/429/unknown.
- [ ] Backend identity, content, publishing, scheduler, integration Telegram, monitoring; миграции D1.
- [ ] Cron+Queue с at-least-once, durable D1 state, idempotency ключами, unknown без автоповтора.
- [ ] Frontend design-in-code, login, dashboard, editor, calendar, incidents; desktop/mobile и Mini App auth.
- [ ] Unit+integration+E2E: duplicate Cron/Queue, webhook duplicate, lost ack, CSRF, 409, hidden polling, keyboard navigation.

## Gate 2: расширения (после работающего MVP)
- [ ] Dota data adapters + caching/source timestamps; собственные изображения и шаблоны в R2.
- [ ] Аналитика и content planning; видео upload resumability.
- [ ] TikTok/YouTube публикация только после подтверждения API-доступа и соответствия правилам платформ.

## Release bar
Нельзя заявлять `ready` без успешного CI, реального staging E2E, аудита секретов, восстановления после Queue failure и ручной сверки unknown. Ориентир 1000 задач/сутки только после нагрузочного теста, бесплатно — в рамках фактических квот.
