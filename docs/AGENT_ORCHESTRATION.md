# ALEXEEV — Agent Runtime Contract v2 (03.10.2026)

**Статус:** полноценная спецификация процесса; исполняемый оркестратор и действующие API инструментов ещё должны быть реализованы. Краткие роли: agents/*.md. Figma полностью исключена.

## 1. Модель работы
Один Orchestrator управляет DAG задач с типизированными handoffs. У каждого task ровно один agent owner и изолированный scope файлов. Специалист не читает весь репозиторий или историю разговоров. Code reviews и детерминированные tools предпочтительнее дополнительного AI-агента там, где они решают проблему.

## 2. Ролевая матрица
| Роль | Отвечает за | Допустимый контекст | Выход | Граница |
|---|---|---|---|---|
| Orchestrator | triage, DAG, ownership, routing, gates, PR | roadmap, ADR, module map, task summaries | scoped packets, verdict | не изменяет main автоматически |
| Analyst | story, routes, permissions, acceptance | user goal, existing page map, public DTO | story spec, state matrix | не проектирует SQL |
| Design System | semantic tokens, primitives, visual QA | story/page spec, tokens, shared UI | tokens + components + screenshot criteria | никакой Figma |
| Frontend | React feature UI и tests | story, tokens, DTO, fixtures, owner paths | working feature + test evidence | не импортирует Worker internals |
| Backend | use cases, D1, Queue/Cron, API | relevant backend docs, module, contract | domain code + migrations/tests | не получает UI source по умолчанию |
| QA/Security | independent risk checks and review | acceptance, diff, contracts, threat model | evidence + PASS/FAIL | не подтверждает тесты без логов |

## 3. Task packet и handoff (machine readable)
Задания хранятся как JSON или YAML рядом с task state: `task_id`, `goal`, `role`, `owner_paths`, `required_refs`, `dependencies`, `acceptance_criteria`, `budget.max_tokens`, `budget.max_retries`, `risk`, `branch`, `expected_artifacts`. Статусы `QUEUED→READY→RUNNING→REVIEW→DONE`; `BLOCKED`/ `FAILED` отдельно; таймаут не трактуется как успех. Handoff: changed files, contract delta, actual commands/results, known risks, next dependencies, token usage if provider exposes it.

## 4. DAG и гонки
Если API контракт не утверждён — backend/frontend не должны самостоятельно придумывать несовместимые формы. После Contract Gate backend + frontend параллельно на разных paths, design готовит shared tokens перед новыми UI примитивами. Владение общими файлами: packages/contracts — отдельный contract task; token CSS — design; cross-cutting migration — backend; CI — orchestrator назначает одного owner. Конфликт paths → сериализовать или отдельный интеграционный task; никаких двух конкурирующих writes.

## 5. Context boundary и стоимость
Всегда передавать role prompt + один task packet + минимальные immutable contracts + конкретные owner files. Дополнительные файлы — через CONTEXT_REQUEST с причиной, объёмом и одобрением оркестратора. Длинные логи хранить как artifacts и передавать только строки ошибок/ссылки. Cache stable instructions, не переотправлять транскрипты. Adaptive model routing допускается только с измерением токенов, числа retry, CI pass rate и исправлений. Максимум две автопопытки на конкретный failing test, затем escalation.

## 6. Execution + review
Intake → analyst если requirements неясны → task DAG → contract gate → scoped worktrees/branches → deterministic typecheck/lint/architecture/unit/integration → QA risk review → PR feat/* в develop. Review обязателен для security/publishing; малый docs-only change не запускает весь конвейер. Нет автослияния без разрешения владельца. main только проверенный релиз.

## 7. Система ошибок
Контракт расходится: пометить оба затронутых task BLOCKED, вернуть к владельцу contracts. Нет тестов: status NOT_VERIFIED и конкретная missing command. Подозрение на утечку секретов: прекратить работу, удалить секрет из diff и поднять security incident; настоящие токены не выводить в отчёт. Unknown Telegram send: никаких blind retry и автоматического release.

## 8. Измерения
Записывать на каждый task: input/output tokens (если доступны), model, wall time, work retries, total spend, first-pass tests, defects discovered post-merge, ручные вмешательства. Сравнивать на одинаковом наборе задач и считать cost per accepted task, а не только токены первого ответа. Не заявлять проценты экономии без эксперимента.

## 9. Граница текущей реализации
Данный markdown задаёт поведение агентов, но не запускает их. Следующий самостоятельный feature должен реализовать runner, task store, policy enforcement и интеграционные тесты; до этого Orchestrator — процедурная роль разработчика/AI, а не автоматическая служба.
