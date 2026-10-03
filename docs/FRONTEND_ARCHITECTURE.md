# CONTENT-BOT — ФИНАЛЬНАЯ АРХИТЕКТУРА FRONTEND v1.0

**Дата:** 03.10.2026 · **Статус:** утверждённое техническое направление; приложение ещё не реализовано · **Продукт:** админка ALEXEEV Studio (рабочее имя), `apps/frontend/` в `content-bot`. Бэкенд: `docs/BACKEND_ARCHITECTURE.md`.

> Для наших задач нужен **быстрый SPA-интерфейс оператора**, не публичный SEO-сайт. SSR, Next.js, микрофронтенды и тяжёлый глобальный state management на старте не нужны. Цель — безопасно управлять публикациями и видеть реальные сбои, в том числе с телефона.

## 1. Выбранный стек и правила замены

| Задача | Решение | Причина |
|---|---|---|
| Основа | React + TypeScript strict + Vite | простой SPA, быстрая сборка, локальные тесты |
| Размещение | Cloudflare Pages | независимый деплой, preview для PR |
| BFF | Pages Function `/api/*` + Service Binding к Worker | единый домен, нет токенов бота и CORS-логики в браузере |
| Роутер | React Router | nested layout, ленивая загрузка экранов |
| Server state | TanStack Query | кэш, загрузка/ошибки, refetch по необходимости, invalidation |
| Формы | React Hook Form + Zod | типизация, явные ошибки, редкие ререндеры |
| UI | CSS variables + небольшая собственная библиотека примитивов | единый стиль и замена без переписывания всех экранов |
| Даты | `Intl.DateTimeFormat` (таймзона пользователя) | хранение в UTC, без тяжёлой библиотеки до необходимости |
| Unit/Component | Vitest + React Testing Library + MSW | пользовательское поведение, замена реального API |
| E2E | Playwright | реальные сценарии входа, редактора, ошибок и мобильной ширины |
| Контроль границ | dependency-cruiser + ESLint | запрещённые импорты и циклы |

Выбор библиотек — техническое решение для старта, не лицензионная или ценовая гарантия на будущее. Зафиксировать конкретные версии в lockfile после создания репозитория; не ставить latest вслепую.

## 2. Архитектура по функциональным областям

Не создаём одну гигантскую папку `components/` со всем кодом, но и не копируем полностью сложную Feature-Sliced Design со множеством искусственных слоёв. Используем облегчённую feature-first структуру:

```text
apps/frontend/
├── functions/
│   └── api/[[path]].ts               # BFF; same-origin -> Service Binding
├── public/
│   └── icons/
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx                   # router + top-level providers
│   │   ├── router.tsx                # lazy route definitions
│   │   ├── query-client.ts
│   │   ├── layouts/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── AuthLayout.tsx
│   │   │   └── PageErrorBoundary.tsx
│   │   └── styles/
│   │       ├── tokens.css            # цвета, интервалы, типографика
│   │       └── global.css
│   ├── pages/                         # сборка экранов, минимум бизнес-логики
│   │   ├── dashboard/DashboardPage.tsx
│   │   ├── posts/PostsPage.tsx
│   │   ├── editor/PostEditorPage.tsx
│   │   ├── calendar/CalendarPage.tsx
│   │   ├── media/MediaPage.tsx
│   │   ├── incidents/IncidentsPage.tsx
│   │   ├── settings/SettingsPage.tsx
│   │   └── login/LoginPage.tsx
│   ├── features/                      # функциональные срезы
│   │   ├── posts/
│   │   │   ├── index.ts              # публичный API feature
│   │   │   ├── api/posts-api.ts      # API-функции из общего client
│   │   │   ├── api/posts-queries.ts  # query keys, query/mutation hooks
│   │   │   ├── model/editor-schema.ts
│   │   │   ├── model/use-post-editor.ts
│   │   │   ├── ui/PostList.tsx
│   │   │   ├── ui/PostEditor.tsx
│   │   │   ├── ui/UnsavedChangesGuard.tsx
│   │   │   └── tests/
│   │   ├── calendar/ ...
│   │   ├── media/ ...
│   │   ├── monitoring/ ...
│   │   ├── auth/ ...
│   │   └── settings/ ...
│   ├── entities/                      # реальные общие сущности, создавать по факту
│   │   ├── post/ ...
│   │   └── incident/ ...
│   ├── shared/
│   │   ├── api/
│   │   │   ├── http-client.ts        # fetch, credentials, CSRF, requestId
│   │   │   ├── api-errors.ts
│   │   │   └── query-keys.ts
│   │   ├── ui/                        # Button, Input, Dialog, Toast, DataTable
│   │   ├── lib/                       # format-date, format-error, download
│   │   └── hooks/                     # только действительно общие хуки
│   └── test/
│       ├── setup.ts
│       ├── msw-handlers.ts
│       └── fixtures.ts
├── tests/e2e/
├── package.json
├── vite.config.ts
└── tsconfig.json

apps/contracts/
├── src/index.ts
├── src/posts.ts                   # Zod API DTO
├── src/incidents.ts
├── src/media.ts
├── src/errors.ts
└── package.json
```

**Правила импортов:** `app` подключает страницы и providers; `pages` композируют `features`, `entities`, `shared`; одна feature не импортирует внутренности другой. Если двум функциям нужен один тип — вынести реальную общую сущность в `entities` или `contracts`, но не делать `shared` свалкой бизнес-логики. Публичные экспорты через `index.ts`, запрет deep imports. Все графы зависимостей проверяет CI.

## 3. Структура одной feature на примере `posts`

- `api/posts-api.ts`: тонкие функции `listPosts`, `getPost`, `createDraft`, `saveRevision`, `schedulePost`, возвращают DTO; никаких импортов React.
- `api/posts-queries.ts`: `queryOptions`, `useMutation`, `invalidateQueries` только после успешного серверного ответа. Для важных операций (publish/retry) **не делать optimistic success**.
- `model/editor-schema.ts`: Zod-схема редакторской формы, отличная от серверного DTO только там, где есть UI-специфика; не дублировать серверную бизнес-валидацию.
- `model/use-post-editor.ts`: жизненный цикл черновика, dirty state, версия ревизии, контроль конфликта 409.
- `ui/PostEditor.tsx`: поля формы + доступность, никаких прямых `fetch`.
- `ui/UnsavedChangesGuard.tsx`: навигационная защита при несохранённых изменениях.
- `tests/`: поведение редактора, состояния loading/error/conflict/unknown.

Удаление feature должно потребовать правку только `app/router.tsx`, `app/navigation.ts` и соответствующего среза. Не создавать перекрёстные импорты календаря из внутренностей редактора: календарь работает с теми же публичными DTO API.

## 4. Правильное разделение состояния

| Состояние | Где хранить | Пример |
|---|---|---|
| Серверное | TanStack Query | публикации, список героев, инциденты, профили |
| URL | React Router search params | фильтр `?status=failed`, страница, поиск, период |
| Форма | React Hook Form | заголовок, текст, герой, время, медиа |
| Кратковременное UI | локальный `useState` | модальное окно, вкладка, фокус |
| Учетная запись | `GET /api/v1/auth/me` + Query | отображение пользователя и прав; сервер всегда перепроверяет |
| Пользовательские настройки | серверная БД через API | timezone, включенные рубрики; локально только внешний вид |

Не копировать серверные объекты в Zustand/Redux/Context без реальной необходимости. Не делать `useEffect` для вычисляемых из props значений. Избегать цепочек `useEffect -> setState -> useEffect`. Context допустим для лёгкой темы/доступности, но не как универсальная шина событий.

У Query по умолчанию данные считаются устаревшими сразу, а неактивные запросы обычно удерживаются в памяти пять минут и повторно запрашиваются при фокусе/переподключении. Задать явный `staleTime` для списков/справочников; на экране инцидентов включать polling 15–30 секунд **только когда вкладка видима**, на остальных экранах polling не использовать. Ограничить параметры пагинации (например, 25–50 записей) и объём кэшируемых изображений. UI нельзя превращать в копию D1 в оперативной памяти.

```ts
// features/posts/api/posts-queries.ts — пример
export const postKeys = {
  all: ['posts'] as const,
  list: (filters: PostFilters) => ['posts', 'list', filters] as const,
  detail: (id: string) => ['posts', 'detail', id] as const,
};

export function useSavePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savePost,
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: postKeys.all });
      void qc.invalidateQueries({ queryKey: postKeys.detail(id) });
    },
  });
}
```

## 5. Общий API-контракт и защита от рассинхронизации

`contracts` содержит версии общих Zod-схем и TypeScript DTO (JSON-only). Это **не** общий код бизнес-логики и не ORM. Frontend и backend импортируют одни типы для ответов и запросов, но сервер самостоятельно валидирует каждое изменение.

Пример: `PostDto`, `CreateDraftInput`, `SaveRevisionInput`, `PublicationDto`, `IncidentDto`, `ApiErrorDto`, `PagedResult<T>`. `GET /api/v1/posts?cursor=...`, `POST /api/v1/posts`, `PATCH /api/v1/posts/:id` с `If-Match: revision`, `POST /api/v1/publications/:id/retry` — только подтверждённая безопасная операция.

```ts
// apps/contracts/src/posts.ts
import { z } from 'zod';

export const postDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  revision: z.number().int().nonnegative(),
  status: z.enum(['draft', 'approved', 'scheduled']),
  updatedAt: z.string().datetime(),
});
export type PostDto = z.infer<typeof postDtoSchema>;
```

`ApiError` — стабильные коды: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMIT`, `UNAVAILABLE`, `UNKNOWN_SEND_RESULT`; текст сообщения может локализоваться, код не меняется. UI для 401 ведёт на вход; 403 показывает отсутствие права; 409 оставляет локальные правки и открывает диалог сравнения версий; 429 показывает время повторной попытки; 500/503 показывают requestId и кнопку повторить **только безопасный запрос**.

## 6. Сетевой слой и безопасность

Схема:

```text
Browser -> https://admin-host/api/v1/*
        -> Pages Function same-origin BFF
        -> Service Binding
        -> Backend Worker /api/v1/* (server session + role check)
        -> D1 / Queue / R2
```

BFF пробрасывает строго разрешённые пути/методы и безопасные заголовки; не превращать в открытый HTTP-прокси и не доверять произвольному `X-Admin-Id`. На сервере всегда проверять сессию и права. Бот-токен и API-ключи сторонних источников — только server-side; `import.meta.env.VITE_*` всегда публичен, секреты туда НЕ помещать. HttpOnly+Secure+SameSite session cookie, серверная CSRF и Origin-проверка, короткая жизнь одноразового login code, ограничение попыток. Logout инвалидирует сессию и очищает query cache. Не сохранять сессию в `localStorage`, не внедрять HTML из внешних новостей через `dangerouslySetInnerHTML` без отдельной sanitizer/strict allowlist; по умолчанию отображать текст.

```ts
// shared/api/http-client.ts — компактный пример
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw await mapApiError(response);
  return response.json() as Promise<T>;
}
```

Пример не включает CSRF-header: production client обязан взять token, выданный защищённым `/auth/csrf`, и передавать его для изменяющих методов. Не вставлять произвольную переменную `X-CSRF-Token`, если сервер ещё не реализован; контракт разрабатывается и тестируется одновременно с бекендом.

## 7. Маршруты, загрузка и отказоустойчивость экранов

```text
/login                  вход и одноразовый код
/                       overview / health / ближайшие публикации
/posts                  список публикаций с фильтром
/posts/new              новый черновик
/posts/:id              редактор и история ревизий
/calendar               расписание, перенести/отменить
/media                  галерея героев, исходники, шаблоны
/incidents              ошибки, повторы, unknown Telegram
/settings               расписание и права
/*                      NotFound
```

Ленивая загрузка по маршрутам (`React.lazy` или lazy route modules), общий лёгкий layout. У каждого независимого экрана `loading`, `empty`, `error`, `unauthorized`, `ready`; отдельные error boundaries предотвращают обрушение всей админки, но не заменяют обработку HTTP-ошибок. Таблицы с пагинацией и доступными клавиатурными действиями; не загружать все 10 000 строк в память. Для dashboard разрешён частичный результат: поломка графика не должна скрывать критическую ошибку отправки. Вкладка incidents должна показывать stale-метку времени последнего обновления.

## 8. Превью изображений и работа с медиа

- Исходные изображения героев предоставляет владелец; редактор загружает их с проверкой типа, веса и допустимого разрешения. Не класть blob/base64 в localStorage и TanStack Query.
- Для превью файлов использовать `URL.createObjectURL(file)` только до загрузки и обязательно `URL.revokeObjectURL()` при замене/размонтировании, чтобы не удерживать память.
- Медиатека — пагинация + серверные миниатюры; `loading="lazy"` для списков, отдельные full-size файлы только по запросу. Информация в D1, бинарные объекты в R2.
- Превью окончательной карточки должно использовать **тот же серверный рендерер/шаблон**, что и публикация: `POST /api/v1/media/preview`, а не отдельную копию верстки в браузере. Для ускорения локально можно показать приблизительный макет, но перед публикацией отображать фактическое PNG. Рендер тяжёлых карточек асинхронно, защищён от злоупотребления и лимитирован квотами.
- При недоступности рендера отображать fallback и явно отметить, что картинка не создана; не выдавать пример за реальный результат.

## 9. Редактор и календарь без потери данных

- React Hook Form держит локальные значения, сервер получает только `Save`/контролируемый debounce **черновиков**; не отправлять запрос на каждую клавишу.
- При изменении поля выставить dirty flag и включить предупреждение при навигации/закрытии. `beforeunload` не гарантирован на мобильных: дополнительно кнопка «Сохранить», статус последних правок и локальный in-memory буфер до закрытия страницы (без обещания восстановления после краша).
- Для конкурирующих правок `revision`/`If-Match`; ответ 409 не перезаписывает данные другого редактора, предлагает сравнить/перезагрузить.
- Публикация — отдельная двухэтапная операция: preview -> explicit confirm -> сервер создаёт `publication`/job. UI не показывает «Опубликовано» пока backend не вернул `sent` и `externalMessageId`; после 202 Accepted — подпись возвращённого статуса (обычно «Запланировано») и фоновые обновления.
- Отмена/retry недоступны при `unknown` до ручной проверки. Для неизвестного результата — отдельный экран инцидента и понятное предупреждение о риске дубля.
- В календаре все даты пользовательские, сервер получает UTC ISO 8601 и явный IANA timezone (например, `Europe/Chisinau`), учитываем DST. Не полагаться на текстовые даты из locale браузера.

## 10. UI/UX и дизайн-система

- **Решение владельца 03.10.2026:** спокойный монохром — тёмная и светлая темы на нейтральных серых, без ярких/фирменных акцентов; цвет только для ошибок/деструктивных действий и `unknown`, всегда вместе с текстом и иконкой. Тема по `prefers-color-scheme` + ручной переключатель. **UI-библиотека не выбрана** — сравнение (React Aria Components, HeroUI, Base UI и др.) будет рассмотрено отдельно; до решения библиотеки не устанавливать.
- Токены `--color-bg`, `--color-surface`, `--color-text`, `--color-accent`, `--space-*`, `--radius-*` и типографика в `app/styles/tokens.css`; кнопки и поля через `shared/ui`.
- На desktop: боковая навигация, плотные таблицы и двухпанельный редактор. На mobile: компактная навигация, таблицы превращаются в карточки/доступную горизонтальную прокрутку, основные действия остаются доступными.
- Доступность: WCAG 2.2 AA как целевой ориентир; интерактивы достижимы с клавиатуры, видимый фокус, семантические `label`, корректная структура заголовков, цвет не единственный маркер статуса, диалоги управляют фокусом. Для ошибок формы `aria-describedby`; для фонового обновления — умеренное `aria-live`, без постоянных оповещений.
- Пользовательские статусы: «Запланировано», «В очереди», «Публикуется», «Опубликовано», «Повтор по расписанию», «Ошибка», «Требует проверки», «Отменено». Каноническое соответствие `PublicationStatus` → подпись → группа токенов — skill `page-spec`. Не показывать HTTP 503 как единственное объяснение человеку — дать короткий текст плюс requestId.

## 11. Производительность и утечки памяти

- Route lazy load, дерево импортов без тяжёлых SDK на главном экране. Проверять размер Vite bundle по build report; большие зависимости подключать только на нужном маршруте.
- `useEffect` только для связи с внешними системами; timers/subscriptions/AbortController обязательно очищать на unmount. Polling останавливается при скрытой вкладке и размонтировании экрана; не создавать параллельные интервалы.
- Большие списки серверно пагинируются; при необходимости виртуализация только для реально больших экранов. Не применять `useMemo`/`useCallback` повсюду без профилирования.
- Canvas/image object URLs чистить; превью не держат полноразмерные изображения в состоянии компонентов. Не загружать сразу все hero-art из R2.
- Ошибка сети не должна запускать бесконечный refetch. Для мутаций (особенно publish/retry) по умолчанию `retry: false`. Read-only запросы — ограниченный retry с backoff и явными исключениями для 401/403/400.

## 12. Тесты frontend и интеграция

- Unit: форматирование даты/UTC, mapping API errors, Zod схемы форм, чистые функции фильтров.
- Component (RTL + MSW): пустой список, loading/error, login, editor validation, 409 conflict, сохранение с пересозданием компонента, failed/unknown action restrictions.
- E2E (Playwright): одноразовый вход, создание черновика, preview, безопасное планирование, сбой очереди, неизвестный результат Telegram, журнал инцидентов, logout, mobile viewport, базовая клавиатура. Все тесты изолированы, Telegram мокируется или используется staging.
- Контрактные тесты: `contracts` импортируются API и админкой; fixtures соответствуют продовым DTO. CORS/CSRF и `Set-Cookie` проверять интеграционными тестами BFF+Worker.
- CI: `typecheck`, `eslint`, dependency-cruiser, `vitest`, `vite build`, Playwright smoke на preview/staging. A11y: axe в критичных формах/диалогах + ручной keyboard smoke.
- Не тестировать внутренний `useState` и CSS-классы как основное подтверждение качества; проверять пользовательские действия и видимые результаты.

## 13. Правила добавления/удаления frontend feature

1. Публичный контракт API и пользовательский сценарий, затем feature с необходимым минимумом файлов.
2. Реализовать `loading`, `empty`, `error`, `success` и все права/неуспехи серверных ответов.
3. По возможности не менять layout/router вне регистрации ссылки и lazy route.
4. Запрещены deep imports между feature; общая логика выносится в `entities/shared` только при реальном повторном использовании.
5. Чтобы удалить feature — выключить/скрыть маршрут и навигацию; убрать зависимые query keys; убедиться, что нет других импортов; удалить файлы; прогнать architecture + component + E2E.

## 14. Приёмка frontend первой версии

- Все основные экраны доступны на desktop/mobile, есть понятные состояния loading/empty/error.
- Неавторизованный пользователь не видит приватные данные; при истечении сессии React корректно очищает чувствительный кэш и направляет на вход.
- Нельзя случайно потерять редактируемый черновик при обычной навигации, а конфликт версий не приводит к молчаливому перезаписыванию.
- Админка показывает реальное состояние API/Queue/Cron, явный `unknown`, requestId и безопасную кнопку retry.
- После `202 Accepted` интерфейс не сообщает «Опубликовано» раньше подтверждения Telegram.
- Нет секретов в Vite сборке, нет бесконечных polling или утечки object URLs, CI и базовые E2E зелёные.
- Рендер карточек согласован с backend; API содержит версию/ревизию контента и предоставляет контрактное тестирование.

## 15. Первоисточники по frontend

- React, Choosing State Structure: https://react.dev/learn/choosing-the-state-structure
- React, You Might Not Need an Effect: https://react.dev/learn/you-might-not-need-an-effect
- TanStack Query, Important Defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- React Router, Routing: https://reactrouter.com/start/declarative/routing
- Cloudflare Pages, Service bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Testing Library, guiding principles: https://testing-library.com/docs/guiding-principles/
- Playwright, Best Practices: https://playwright.dev/docs/best-practices
- OWASP, CSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- dependency-cruiser: https://github.com/sverweij/dependency-cruiser

**Это проектная документация. Фактическая производительность, доступность и безопасность подтверждаются только после реализации и тестов.**

## Решение владельца 03.10.2026: Figma полностью исключена

Ни проектирование, ни реализация, ни приёмка не зависят от Figma. Источник дизайна — version-controlled tokens.css, documented component API, story examples и спецификации пользовательских сценариев/страниц. Агент-дизайнер создаёт и корректирует их непосредственно в репозитории; frontend собирает интерфейс из primitives. Проверка — браузерные screenshots и accessibility tests, без промежуточного экспорта макетов. См. docs/DESIGN_SYSTEM_NO_FIGMA.md.