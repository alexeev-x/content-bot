# CONTENT-BOT — ФИНАЛЬНАЯ АРХИТЕКТУРА BACKEND v3.0

**Дата:** 03.10.2026 · **Статус:** утверждённое техническое направление (код ещё не реализован) · **Нагрузка:** до 1 000 фоновых заданий/сутки; пики проверяются нагрузочными тестами · **Бюджет:** бесплатные квоты до достижения измеренных ограничений.

> Этот документ заменяет ВСЕ промежуточные архитектуры. При расхождении с чатом или старым README руководствоваться им, затем утверждённым `AGENTS.md`. При изменении решений править этот документ, а не создавать v4 рядом.

## 1. Принцип архитектуры

**Прагматичный модульный монолит**, один Cloudflare Worker (Hono + TypeScript), один D1, одна Queue, один Cron, R2 при потребности. Точки входа Worker: `fetch` (административное API + защищённый Telegram webhook), `scheduled` (сканирование отложенных заданий), `queue` (обработчик). Фронтенд (React/Vite) отдельно на Cloudflare Pages; same-origin `/api/*` проксируется Pages Function через Service Binding. Никакого обязательного ИИ. Картинки из исходников владельца через HTML/CSS-шаблоны; затратный рендер выделять только после замеров.

**Качества в приоритете:** правильность публикаций > безопасность > ремонтопригодность > наблюдаемость > производительность. Операционная цель — ни одно запланированное задание не исчезает бесследно и никакая неоднозначная отправка не повторяется автоматически.

Не использовать на старте микросервисы, Redis, Kafka, Kubernetes, CQRS/Event Sourcing, универсальную event-bus, динамическую загрузку сторонних плагинов, абстрактный `BaseRepository<T>` и Dependency Injection-контейнер со скрытыми зависимостями.

## 2. Границы: кому что принадлежит

| Область | Ответственность | Запрещено |
|---|---|---|
| `content` | черновики, версии, содержание и формат публикации | напрямую вызывать Telegram, Cron, R2 |
| `publishing` | публикация, расписание, состояние, повторы, `jobs` | самостоятельно вычислять статистику Dota, хранить сырые изображения |
| `dota-data` | получить/нормализовать/кэшировать статистику с датой и источником | отправлять сообщения и управлять расписанием |
| `media` | каталог исходников, загрузка, валидация, создание карточек | определять время поста, вызывать Telegram |
| `identity` | разрешённые администраторы, одноразовый код, сессии, права | доверять роли из браузера, логировать коды |
| `app/workflows` | координация двух или более возможностей | SQL, HTTP Bot API, зависимость от внутренних файлов модулей |
| `integrations` | низкоуровневые клиенты Telegram/Dota/рендера | принимать бизнес-решения |
| `platform` | D1, Queue, R2, clock, логгер, rate limit, HTTP client | бизнес-сущности и «магические» зависимости на модули |

Telegram — **интеграция**, а не общий бизнес-модуль для любого отправителя. `publishing` владеет портом `PublicationTransport`; его Telegram-адаптер вызывает технический `integrations/telegram/telegram-api-client.ts`. При появлении пользовательских команд — отдельная входящая возможность `telegram-inbound` с тем же низкоуровневым клиентом. Уведомления владельца об ошибках используют отдельный порт `AlertNotifier`, не подменяя публикации.

Каждый бизнес-модуль экспортирует API только из `index.ts`. Deep imports и циклические зависимости запрещены. При необходимости синхронного чтения из другого модуля вызываем публичный API; многоэтапный сценарий соединяем в `app/workflows`. Асинхронная длительная задача проходит через D1 + Queue. Простой модуль не обрастает четырьмя слоями без необходимости.

## 3. Целевая структура репозитория

```text
content-bot/
├── apps/
│   ├── admin/                           # фронтенд: см. FRONTEND_ARCHITECTURE.md
│   └── api/
│       ├── src/
│       │   ├── index.ts                 # только fetch / scheduled / queue
│       │   ├── app/
│       │   │   ├── create-app.ts        # middleware + маршруты Hono
│       │   │   ├── container.ts         # явная сборка зависимостей
│       │   │   ├── routes.ts            # /api/v1/* + /webhooks/telegram
│       │   │   ├── job-handlers.ts      # whitelist типов заданий
│       │   │   ├── env.ts               # типы и проверка настроек
│       │   │   └── workflows/
│       │   │       └── publish-hero-digest.ts
│       │   ├── modules/
│       │   │   ├── content/
│       │   │   │   ├── index.ts         # публичные типы и use-case API
│       │   │   │   ├── domain/post.ts
│       │   │   │   ├── application/create-draft.ts
│       │   │   │   ├── application/update-draft.ts
│       │   │   │   ├── application/repository.ts  # порт хранилища
│       │   │   │   ├── infrastructure/d1-post-repository.ts
│       │   │   │   ├── http/routes.ts
│       │   │   │   └── tests/
│       │   │   ├── publishing/
│       │   │   │   ├── index.ts
│       │   │   │   ├── domain/publication.ts
│       │   │   │   ├── domain/state-machine.ts
│       │   │   │   ├── application/ports.ts
│       │   │   │   ├── application/schedule.ts
│       │   │   │   ├── application/dispatch.ts
│       │   │   │   ├── application/resolve-unknown.ts
│       │   │   │   ├── jobs/scan-due.ts
│       │   │   │   ├── jobs/handle-job.ts
│       │   │   │   ├── jobs/reconcile.ts
│       │   │   │   ├── infrastructure/d1-publication-repository.ts
│       │   │   │   ├── infrastructure/telegram-publication-transport.ts
│       │   │   │   ├── http/routes.ts
│       │   │   │   └── tests/
│       │   │   ├── dota-data/
│       │   │   │   ├── index.ts
│       │   │   │   ├── domain/hero-stats.ts
│       │   │   │   ├── application/provider.ts
│       │   │   │   ├── application/get-hero-stats.ts
│       │   │   │   ├── infrastructure/d1-stats-cache.ts
│       │   │   │   ├── infrastructure/provider-registry.ts
│       │   │   │   └── tests/
│       │   │   ├── media/
│       │   │   │   ├── index.ts
│       │   │   │   ├── application/card-renderer.ts
│       │   │   │   ├── application/upload-hero-art.ts
│       │   │   │   ├── infrastructure/r2-media-store.ts
│       │   │   │   ├── infrastructure/html-card-renderer.ts
│       │   │   │   ├── http/routes.ts
│       │   │   │   └── tests/
│       │   │   └── identity/
│       │   │       ├── index.ts
│       │   │       ├── application/request-login.ts
│       │   │       ├── application/verify-login.ts
│       │   │       ├── application/verify-session.ts
│       │   │       ├── infrastructure/d1-session-repository.ts
│       │   │       ├── http/auth-routes.ts
│       │   │       └── tests/
│       │   ├── integrations/
│       │   │   ├── telegram/telegram-api-client.ts
│       │   │   ├── telegram/webhook-handler.ts
│       │   │   └── dota/opendota-client.ts
│       │   ├── platform/
│       │   │   ├── database/d1.ts
│       │   │   ├── queue/cloudflare-queue.ts
│       │   │   ├── storage/r2.ts
│       │   │   ├── http/fetch-with-timeout.ts
│       │   │   ├── security/csrf.ts
│       │   │   ├── security/allowlist.ts
│       │   │   ├── logging/structured-logger.ts
│       │   │   ├── observability/incident-repository.ts
│       │   │   └── clock/clock.ts
│       │   └── shared/
│       │       ├── app-error.ts
│       │       └── result.ts
│       ├── migrations/
│       ├── tests/integration/
│       ├── tests/architecture/
│       ├── wrangler.jsonc
│       └── vitest.config.ts
├── packages/contracts/                  # схемы и DTO для админки/API
├── docs/                                # этот документ, фронтенд, безопасность
├── AGENTS.md
└── package.json                         # npm workspaces; versions locked
```

**Никаких обязательных пустых папок.** Дерево — структура по мере реализации. Для простого модуля допустимы `index.ts`, `service.ts`, `service.test.ts`; разбить на слои при появлении реальной сложности.

## 4. Контракты и явное внедрение зависимостей

```ts
// publishing/application/ports.ts — интерфейс принадлежит потребителю
export interface PublicationTransport {
  send(input: {
    destinationId: string;
    text: string;
    imageKey?: string;
  }): Promise<{ externalMessageId: string }>;
}

export interface PublicationRepository {
  claim(jobId: string, now: number): Promise<ClaimResult>;
  markSent(jobId: string, externalMessageId: string): Promise<void>;
  markUnknown(jobId: string, reason: string): Promise<void>;
}

// app/container.ts — ЕДИНСТВЕННОЕ место связывания реальных реализаций
export function createPublishing(env: Env) {
  const telegram = new TelegramApiClient(env.TELEGRAM_BOT_TOKEN);
  const sender = new TelegramPublicationTransport(telegram);
  const repo = new D1PublicationRepository(env.DB);
  return createPublishingService({ sender, repo, clock: systemClock });
}
```

Важно: пример упрощён; не конструировать клиент с состоянием пользователя в глобальной области и не передавать сырой секрет в логгер. `PublicationTransport` не должен становиться «универсальным отправителем всех соцсетей»: адаптер поддерживает только согласованные возможности (`text`, `photo` и т.д.), несовместимые каналы требуют отдельного порта или capability discovery.

Смена Telegram-клиента должна затрагивать его реализацию и тесты, но **не доменную модель `publishing`**. Добавление нового провайдера Dota — новая реализация `DotaDataProvider`, регистрация и контрактные тесты, без правки `get-hero-stats.ts`.

## 5. Надёжная публикация: состояния и гонки

```text
draft -> approved -> scheduled -> pending_enqueue -> queued -> claimed
                                                              |
                                           +------------------+----------------+
                                           |                  |                |
                                          sent          retry_wait        unknown
                                           |                  |                |
                                           |              queued     manual verify sent/
                                           |                         manual retry/cancel
                                           +---- audit trail / job_attempts -----+
```

- Статус публикации (`publications`) отличается от статуса исполнителя (`jobs`), не хранить две независимые копии одной state-machine. `posts` — редакторская сущность; `publications` — одна доставка контента в конкретный канал; `jobs` — конкретная фоновая операция.
- `UNIQUE(channel_id, post_id, revision)` или отдельный `dedupe_key` для повторного Cron. **Нельзя** накладывать такую уникальность, если редактор сознательно разрешает повторно разместить тот же пост; тогда новый `publicationId` и новое намерение.
- Для Queue посылаем только `{jobId, schemaVersion}`; исходное состояние — D1. Очередь может повторно доставить сообщение.
- В D1 переход из `queued/retry_wait` в `claimed` — условным `UPDATE` с `WHERE status IN (...) AND lease_expire...`; проверить `meta.changes === 1`. Повторы и устаревшие сообщения не должны инициировать новую отправку.
- Lease и heartbeat пригодятся для долгой подготовки, но **не** должны запускать автоматический повтор публикации после того, как запрос к Telegram мог начаться. Сохраняем отдельный `send_started_at`; после сбоя в опасной фазе только `unknown`.
- Telegram не предоставляет идемпотентность `sendMessage/sendPhoto`: после таймаута нельзя различить «не отправлено» и «опубликовано без ответа». Фиксируем `unknown` и показываем кнопку ручной сверки; **не запускать автоматический retry**.
- Явная ошибка до отправки (невалидные данные, запрет) -> `failed` либо ручное исправление; подтверждённый rate limit -> `retry_wait` с `retry_after`; другие транспортные ошибки после начала отправки консервативно -> `unknown`.
- Не объединять пост в D1 и `queue.send()` в фиктивную «транзакцию»: запись в D1 -> попытка enqueue -> Cron reconciliation находит `pending_enqueue`/просроченные безопасные статусы. При усложнении можно добавить outbox-таблицу в D1.
- Ограничить retry maxAttempts и экспоненциальную задержку с jitter. `DLQ` опционально позднее; с 1 000 задач/сутки достаточно видимой error-таблицы + ручной retry.

### Условный захват задания

```sql
UPDATE jobs
SET status = 'claimed', attempts = attempts + 1,
    lease_until = ?1, updated_at = ?2
WHERE id = ?3 AND status IN ('queued', 'retry_wait')
  AND (lease_until IS NULL OR lease_until < ?2)
RETURNING id, publication_id, attempts;
```

Для составных изменений использовать `D1Database.batch()` (атомарные транзакционные батчи). Для массовых выборок индекс `(status, run_at, id)`; только keyset pagination и небольшие страницы. Никакого `SELECT *` по всей истории.

## 6. Данные и миграции

Основные таблицы: `admin_users`, `admin_sessions`, `login_challenges`, `posts`, `post_revisions`, `publications`, `jobs`, `job_attempts`, `media_assets`, `heroes`, `hero_stats_snapshots`, `incidents`, `settings`, `telegram_webhook_updates`. Хранить `schema_version` в Queue payload. UTC timestamps в БД; часовой пояс только в UI и настройках расписания.

Пример:

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  publication_id TEXT REFERENCES publications(id),
  status TEXT NOT NULL CHECK(status IN (
    'pending_enqueue','queued','claimed','retry_wait','succeeded','failed','unknown'
  )),
  run_at INTEGER NOT NULL,
  lease_until INTEGER,
  send_started_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX jobs_due ON jobs(status, run_at, id);
```

В SQL миграциях придерживаться expand -> migrate -> contract. Удаление бизнес-модуля: остановить создание его задач; отменить/завершить существующие; удалить публичную регистрацию и пройти CI; старые таблицы удалять **отдельной** миграцией после проверки.

## 7. Рабочие квоты и стоимость

Плановая нагрузка — до 1 000 **фоновых заданий/сутки**, а не 10 000. Очередь Free предоставляет 10 000 операций/сутки: обычное сообщение расходует операции записи, чтения и удаления (приблизительно 3 000 на 1 000 успешных сообщений; повторы/батчи меняют оценку). Workers Free: 100 000 HTTP-запросов/сутки; жёсткий лимит CPU обычного запроса требует нагрузочного замера, память ограничена 128 МБ. D1 Free: лимиты чтения/записи/размера необходимо отслеживать в панели, а не рассчитывать на платный overage. Если в первом месяце достаточно 20–50 задач/сутки, это нормальная эксплуатация — не увеличивать сложность искусственно.

Количество подписчиков канала не является количеством Telegram Bot API-запросов: пост в канал отправляется один раз. Большой архив медиа хранить в R2, а не в D1. HTML→PNG `CardRenderer` может использовать Browser Run; сначала тест реальной стоимости и резервная статичная карточка, после замеров принять решение о выделенном Worker.

## 8. Безопасность и аутентификация

- Telegram webhook: HTTPS, `X-Telegram-Bot-Api-Secret-Token`, уникальные `update_id`, allowlist ожидаемых типов команд. Webhook и админка — разные маршруты с разной аутентификацией.
- Админка same-origin `https://admin-host/api/v1/...` через Pages Function Service Binding. На административных endpoints **всегда** проверять серверную сессию/права; одно только Service Binding не является авторизацией конечного пользователя.
- Начальная аутентификация: allowlist ID владельца Telegram и одноразовый код с коротким TTL, попытками и серверной проверкой; сессия — случайный секрет в Secure+HttpOnly+SameSite cookie, в D1 хранить хэш. При изменяющих запросах проверять Origin и CSRF. Не отправлять токен сессии/бота на фронтенд и не хранить в `localStorage`.
- Настоящие секреты — Wrangler secrets отдельно staging/prod; `.dev.vars` и `.env*` не коммитить. Логи маскируют токены, коды и личные сведения. Ограничить админку разрешёнными аккаунтами и login rate limit.
- Zod-валидация входных JSON, ограничение размера upload, MIME + сигнатура файла, лимиты скачивания по URL и allowlist доменов, SSRF-защита. Клиентская Zod-валидация улучшает UX, но никогда не подменяет серверную.
- Отдельный staging Worker, тестовая D1/R2 и отдельный Telegram-бот/канал; production отправка в тестах запрещена.

## 9. CPU, память и ожидания

Workers могут повторно использовать isolate. Запрещены изменяемые глобальные `currentUser`, `job`, `request`, singleton mutable caches без строгой схемы очистки. На запрос создавать лёгкий контекст; соединения D1/R2/Queue из env; крупные JSON/файлы обрабатывать потоково, ограничивать размер. Для внешнего HTTP использовать `AbortSignal.timeout`/`AbortController`; ограничение одновременных исходящих запросов и максимальной длины Queue batch. Не запускать бесконтрольные `Promise.all()` на сотни задач. `waitUntil()` — лишь для некритичных побочных действий, критичная работа — D1 + Queue. Отсутствие глобальных переменных уменьшает риск утечек между запросами, но не отменяет профилирование и тестирование с реальными изображениями.

## 10. Наблюдаемость и инциденты

Каждый HTTP-запрос и job имеют `requestId`/`jobId`, логи — структурированный JSON: `timestamp`, `component`, `operation`, `durationMs`, `status`, `errorCode`, `retryable`, `attempt`; без сырого тела webhook и секретов. В D1 важные `incidents` с ограниченной историей и механизмом группировки. Админка показывает: последний успешный Cron, задачи по статусам, ошибки за 24 часа, lag очереди, попытки, состояние `unknown`, результаты ручных действий. Успехи агрегировать и удалять старые по retention policy. Если уведомление об ошибке в Telegram само сломалось, сохранить incident в D1 без бесконечной рекурсии.

## 11. Тестирование и quality gates

- Domain: state-machine, запреты и переходы, формирование контента — чистые unit-тесты.
- Contract: каждый `DotaDataProvider`, `PublicationTransport`, `CardRenderer` проходит общий набор тестов с фиктивным HTTP.
- Integration: Cloudflare Workers Vitest в workerd + локальные D1, Queue/R2 bindings, настоящие миграции.
- Architecture: `dependency-cruiser` no-circular, no-cross-module-internals, no-domain-imports-infra; не коммитить без прохождения.
- Failure: два Cron одновременно, два queue message с одним jobId, падение D1 до enqueue, падение Queue после записи D1, 429 Telegram, обрыв ответа после send, потерянный `message_id`, невалидные данные Dota, удаление модуля, CSRF/401/403, превышение размера файла, выключение источника, предел памяти.
- Load: сценарии 100 и 1 000 задач/сутки с искусственными пиками; фиксировать latency p95, CPU, memory, D1 reads/writes, Queue ops, число Telegram дублей (ожидается ноль при штатно наблюдаемых ответах; `unknown` — ручная проверка).
- CI на pull request: `npm ci` -> typecheck -> lint -> architecture -> unit -> integration -> build. Review применяется к migrations, настройкам безопасности и новым провайдерам.

## 12. Внешние контракты для фронтенда

Все admin endpoints `/api/v1/*` возвращают стабильные JSON DTO. Общие типы и Zod-схемы — `packages/contracts` без зависимостей от Hono, Cloudflare или React. При breaking change добавлять версию API/параметры совместимости; сервер не должен ломать развёрнутую вчера админку. Для конкурентных правок черновика — `revision`/`If-Match`, ответ `409 CONFLICT` при устаревшем сохранении. Все списки с курсорной пагинацией; UTC timestamp в ISO-8601; ошибка: `{error:{code,message,requestId,details?}}`. Документ интерфейса — `docs/API_CONTRACTS.md`.

## 13. Изменение и удаление модулей

1. Пометить функцию выключенной; запретить новые задания на неё.
2. Перевести текущие задания в завершённый/отменённый статус, однозначно разрешить `unknown`.
3. Убрать wiring в `app/container.ts`, маршруты, cron/queue type handlers.
4. Удалить внутренние файлы и тесты, оставить или мигрировать публичные DTO только при реальных потребителях.
5. Прогнать dependency graph + unit/integration/E2E + staging; обновить docs и открытые feature flags.
6. Только позднее удалить данные отдельной SQL migration.

## 14. Приёмка перед первым production

- Работает вручную созданный и отложенный пост; проверка контента и preview.
- Принудительный двойной Cron и двойная queue delivery не дают двух Telegram-публикаций.
- Потерянное подтверждение Telegram -> `unknown` и заметное событие в админке, без автоматического повторного send.
- При падении Queue задание остаётся в D1 и попадает в reconciliation.
- 401/403/CSRF защищают все изменения; секреты не присутствуют в фронтенд-сборке.
- Рестарт Worker/отключение интеграции не приводит к потере работы или глобальной утечке данных.
- Для 1 000 тестовых задач измерены квоты; приложение не зависит от платных AI API.

## 15. Первичные источники и подтверждение решений

- Cloudflare Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 atomic `batch`: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Queues at-least-once: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Pages Service Binding: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Vitest: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Hono best practices: https://hono.dev/docs/guides/best-practices
- dependency-cruiser rules: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- Martin Fowler, Monolith First: https://martinfowler.com/bliki/MonolithFirst.html
- M. Kleppmann & C. Riccomini, Designing Data-Intensive Applications, 2nd ed., O'Reilly (2026).

**Измеренные результаты производительности, реальные расходы и реализация кода ещё отсутствуют; это технический стандарт, который требуется реализовать и проверить.**