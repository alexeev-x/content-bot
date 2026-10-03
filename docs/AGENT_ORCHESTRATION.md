# ALEXEEV — мультиагентная разработка v1.0

## Цель и статус
Это **спецификация процесса**, не утверждение о существовании запущенной платформы агентов. Главный Orchestrator — единственная роль, видящая общую карту проекта и решения владельца. Он выдаёт минимальные work packets, управляет зависимостями, изменениями API и проверками. Нельзя передавать специалистам весь чат, полные документы и чужой код по умолчанию.

## Агенты
| Агент | Входной контекст | Выход | Чего не получает |
|---|---|---|---|
| Orchestrator | цели, roadmap, модульная карта, статусы, ADR | task DAG, packets, решение о merge | продакшен-секреты |
| Product Analyst | цель, текущие routes, ограничения продукта | user stories, page map, acceptance criteria | детали реализации внутренних адаптеров |
| Design System | page map, brand constraints, UI inventory | CSS tokens, component contracts, states, responsive/accessibility spec | SQL, Telegram secrets, backend internals |
| Backend | use case, API contract, owned modules, invariants | ports/adapters, migrations, тесты, API | подробный код чужих UI-features |
| Frontend | page spec, tokens/components, API DTO и mock fixtures | isolated feature, accessible screens/tests | Worker internals и лишние документы |
| QA/Security | story, acceptance criteria, diff, contracts, threat model | reproducible findings, tests, release verdict | секреты и нерелевантная история чата |

## Контракт задания
Каждый пакет содержит: `task_id`, `goal`, `role`, `owner_paths`, `dependency_ids`, `required_documents`, `allowed_interfaces`, `input_fixtures`, `acceptance_criteria`, `token_budget`, `exit_artifacts`. Не более нескольких релевантных файлов; агент может запросить конкретный дополнительный файл с обоснованием. Полный монорепозиторий допустим только для оркестратора/архитектурного аудита.

## Жизненный цикл
1. Intake: сформулировать конечный пользовательский результат и ограничения бюджета/безопасности.
2. Analysis: аналитик описывает маршруты, состояния и критерии проверки. Оркестратор фиксирует вертикальные срезы и DAG.
3. Contract-first: backend/frontend согласовывают Zod/DTO, error states, idempotency, auth до параллельной реализации.
4. Design-in-code: дизайнер коммитит tokens/primitives/story examples; **никакой Figma**.
5. Execution: backend и frontend работают в отдельных рабочих ветках/областях; оркестратор объединяет только через публичные интерфейсы. Если токены не готовы, frontend работает с семантическими переменными, не придумывая локальную тему.
6. QA: typecheck, lint, architecture, unit, integration, E2E, security; отрицательные сценарии обязательны. Ошибка возвращается конкретному владельцу.
7. Review: оркестратор сверяет контракт, тесты, docs и фактический diff, затем предлагает PR; производство/необратимые действия только по утверждению владельца.

## Передача результатов и экономия токенов
Агент возвращает компактный handoff: `task_id`, `paths_changed`, `contract_delta`, `tests_run/results`, `known_risks`, `next_dependency`. Передаются diff/typed DTO и сжатое резюме, а не логи целиком. Stable system rules кэшировать, длинные артефакты хранить файлами, контекст выдавать retrieval по owner_paths. Оркестратор прерывает повторяющиеся циклы исправлений и эскалирует спор о контракте.

## Дисциплина безопасности
Агенты не получают реальные ключи; PR не публикует автоматически в Telegram; запрещён auto-retry unknown send; новые платные сервисы требуют решения владельца. Не верить отчёту агента о тестировании без логов CI, не считать созданные документы готовым кодом.

## Примеры задач
- `ANA-01`: карта экранов MVP → `DES-01`, `API-01`.
- `DES-01`: tokens, примитивы, mobile/error states → `FE-01`.
- `API-01`: identity/content/publication DTO → `BE-01`, `FE-01`.
- `BE-01`: auth/drafts/job state → `QA-01`.
- `FE-01`: editor/calendar/incidents → `QA-01`.
- `QA-01`: staging E2E, unknown Telegram, duplicate Queue → owner sign-off.
