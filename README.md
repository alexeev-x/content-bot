# ALEXEEV Content Bot / Studio

**Состояние:** архитектурный комплект и стартовый каркас для реализации, НЕ развёрнутое production-приложение. Канон: `docs/BACKEND_ARCHITECTURE.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `AGENTS.md`. Все промежуточные документы не являются источником требований.

## Стек
- Backend: модульный монолит TypeScript + Hono на Cloudflare Workers; D1 как источник истины, Queue и Cron для фоновых заданий, R2 для медиа при необходимости.
- Frontend: React + TypeScript + Vite на Pages; одна кодовая база, web shell и Telegram Mini App shell, Pages Function как BFF через Service Binding.
- Shared: `packages/contracts` — API DTO и Zod, никаких общих бизнес-объектов.
- UI: **без Figma**; дизайн-токены, библиотека примитивов, кодовые спецификации страниц и Playwright screenshots.
- AI-разработка: единый Orchestrator распределяет задачи между Product Analyst, Design System, Frontend, Backend и QA/Security. Контекст минимален для каждой роли.

## Порядок работы
1. Начинать с `AGENTS.md`, `docs/AGENT_ORCHESTRATION.md`, `docs/IMPLEMENTATION_PLAN.md`.
2. Оркестратор разбивает user story на независимые вертикальные срезы и назначает зависимости. Analyst определяет страницы и acceptance criteria, Design готовит токены/компоненты, Backend и Frontend работают по общему API-контракту.
3. QA выполняет контрактные/интеграционные/E2E/безопасностные проверки. Оркестратор принимает только проверенный результат с доказательствами.
4. Не начинать реальные публикации без секретов, staging, ручной сверки unknown и подтверждённого теста end-to-end.

## Как начать
`npm install` → `npm run typecheck` → `npm test` → `npm run build` после внедрения первого вертикального среза. В текущем комплекте это целевые команды: отсутствие или неисправность команды — блокер, а не повод объявить работу выполненной. Не создавать фиктивные green tests.

## Безопасность
Не хранить секреты в Git, передавать Telegram bot token только в Worker bindings, не делать автоматический retry при `unknown` Telegram send, использовать отдельные staging-ресурсы.
