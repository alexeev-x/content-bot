# CONTENT-BOT — СВЯЗЬ FRONTEND / BACKEND

**Единственный источник контрактов:** `packages/contracts`, без зависимостей от React, Hono и Cloudflare. Это проект будущих контрактов, а не уже запущенный API.

## Сеть и аутентификация

```text
Browser /api/v1/* -> Pages Function (same-origin)
                   -> Service Binding Worker
                   -> Backend (cookie auth, role, CSRF, rate limits)
```

**Авторизационный сценарий:** Telegram allowlist -> запрос OTP -> сервер отправляет код в личный Telegram -> пользователь вводит его в форме -> сервер выдаёт случайную HttpOnly+Secure+SameSite сессию -> React получает `/auth/me`. Не выдавать bot token и session token браузеру. `/webhooks/telegram` — отдельный путь с заголовком Telegram secret token, никакой общей логики cookie auth.

**CSRF:** для POST/PATCH/DELETE сервер выдаёт токен в аутентифицированном ответе `GET /api/v1/auth/csrf`, клиент передаёт `X-CSRF-Token`, сервер сверяет токен и Origin. Сессии — серверные, с TTL и возможностью отзыва. BFF не доверяет пользовательским заголовкам `X-Admin-*`.

## Общие DTO и ответы

```ts
export type ApiErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR'
  | 'CONFLICT' | 'NOT_FOUND' | 'RATE_LIMIT'
  | 'UNAVAILABLE' | 'UNKNOWN_SEND_RESULT';

export interface ApiErrorDto {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, string>;
  };
}

export interface PageDto<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PostDto {
  id: string;
  title: string;
  body: string;
  revision: number;
  status: 'draft' | 'approved' | 'scheduled';
  updatedAt: string; // UTC ISO8601
}

export type PublicationStatus =
  | 'scheduled' | 'queued' | 'preparing' | 'sending'
  | 'sent' | 'retry_wait' | 'failed' | 'unknown' | 'cancelled';

export interface PublicationDto {
  id: string;
  postId: string;
  channelId: string;
  status: PublicationStatus;
  scheduledAt: string;
  externalMessageId?: string;
  lastErrorCode?: string;
  updatedAt: string;
}
```

`PublicationStatus` — **пользовательская проекция** нескольких внутренних job-состояний; не делать интерфейс зависимым от внутренних полей SQL.

## Черновик и конкурирующие правки

```http
POST /api/v1/posts
Content-Type: application/json
X-CSRF-Token: <csrf>

{"title":"Герой дня","body":"..."}
```

Ответ `201 Created` с `PostDto`. Редактирование `PATCH /api/v1/posts/{id}` + `If-Match: <revision>`. Если другой редактор сохранил изменения — `409 CONFLICT`, UI сохраняет локальные правки и предлагает сравнение. `POST /api/v1/posts/{id}/approve` явно меняет редакторский статус.

## Планирование и отправка

```http
POST /api/v1/publications
Content-Type: application/json
X-CSRF-Token: <csrf>

{
  "postId":"uuid",
  "revision":3,
  "channelId":"my-channel",
  "scheduledAt":"2026-10-05T12:00:00Z",
  "timezone":"Europe/Chisinau"
}
```

Ответ `202 Accepted` + `PublicationDto(status="scheduled")`. Это НЕ утверждение, что пост опубликован. После подтверждения Telegram `GET /api/v1/publications/{id}` вернёт `sent` с `externalMessageId`. Если клиент потерял ответ при создании задания — передавать `Idempotency-Key` и сохранить его в D1, чтобы клиентский повтор запроса не создавал вторую запланированную публикацию. Внешняя отправка Telegram при неопределённом ответе остаётся `unknown`, несмотря на внутренние ключи.

`POST /api/v1/publications/{id}/retry` разрешён **только** для статуса, который backend признал безопасным для повтора. `unknown` невозможно принудительно отправить этим методом — сначала `POST /api/v1/publications/{id}/resolve-unknown` с документированной ручной сверкой и аудиторским следом.

## Наблюдаемость

`GET /api/v1/dashboard`, `GET /api/v1/incidents?cursor=...`, `GET /api/v1/jobs?status=...`, `GET /api/v1/health` (приватный расширенный health, без утечки данных публике). Список инцидентов должен иметь `requestId`, `jobId`, `component`, `errorCode`, `occurredAt`, `status`, `attemptCount`. Ошибки изменяющих запросов возвращают единый `ApiErrorDto`.

## Медиа и превью

`POST /api/v1/media/uploads` — ограниченный загрузочный маршрут (или двухэтапный поток при переходе на direct upload), `GET /api/v1/media?cursor=...`, `POST /api/v1/media/preview` — авторизованная асинхронная генерация фактической карточки тем же рендерером, что production. Большой `blob` никогда не передавать через JSON/base64. Каждый медиа-объект содержит `owner`, `mime`, `size`, `sha256`, `storageKey` и аудит.

## Обязательные контрактные тесты

1. API DTO в реальном ответе совпадает с Zod-схемой `packages/contracts`.
2. Unauthorized: 401 и отсутствие приватных данных; forbidden: 403; invalid CSRF: 403.
3. Одновременное редактирование: 409 без потери локального черновика.
4. Повторное создание с одинаковым Idempotency-Key не дублирует намерение публикации.
5. `202` не воспринимается UI как `sent`.
6. `unknown` блокирует автоматическое повторение и требует ручной сверки.
7. Смена версии DTO поддерживает одновременно frontend текущего и предыдущего деплоя или проходит согласованным релизом.