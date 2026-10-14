# 6. Experimental previews (clickable explorations on mock data)

Status: owner request 08.10.2026. Expert review, not validated. Previews are explorations to click through, **not product scope**: no API, no real writes, no AI/LLM (labels in images ignored), nothing here changes sections 0-7. Previews follow sections 2-3 (page anatomy, tabs vs segmented vs column filters, Panel, skeleton geometry, inspector vs sheet, phone cards).

### 6.1 What to prototype (and what to skip)

| # | Preview | Why it earns a slot | Route |
|---|---|---|---|
| 1 | **Аналитика** | Tests chart/tooltip/period patterns that every metrics view reuses | `/preview/analytics` |
| 2 | **Календарь** | Owner's core planning task; the old Календарь tab is a stub; month/week/day/list is the richest interaction set | `/preview/calendar` |
| 3 | **Медиатека** | Editor needs «Выбрать из медиатеки»; grid + inspector is a new pattern | `/preview/media` |
| 4 | **Автоматизации (Cron)** | Cron table + inspector tabs + safe enable/disable is the one risky-action pattern not yet drawn | `/preview/automations` |
| 5 | **Dota Pulse + Источники** | Deterministic feed (RSS/official sources, no AI): list of events, source health | `/preview/sources` |
| 6 | **Палитра поиска** (Ctrl K) | Replaces the disabled search; grouped results are cheap to click through | overlay, no route |
| 7 | **Превью-блоки на Обзоре** | Dota Pulse, Аналитика канала, Система; always visible in DEV, marked ПРЕВЬЮ (3.1, 6.3 G) | `/` |

**Skip:** «Демография» and «Лучшее время» (no data source, implies analytics intelligence); «Скачать отчёт» (no export); subscriber counts as real data (the sidebar «Подключённый канал» card itself is now in scope, 3.1; subscribers stay «—» until an API exists), multi-network switcher (VK; out of scope), «Создать публикацию» in the calendar (we use «Опубликовать пост»), AI/moderation items («авто-модерация», «Автоматическая обрезка»), «Резервное копирование» job, a separate «Правила» tab in Automations (rules are Later), Cloudflare-style metric dashboards for infrastructure.

### 6.2 Navigation and marking

- **Desktop sidebar:** below the working items and above Настройки, one collapsible group header **«Превью»** (muted, chevron, state persisted, collapsed by default) with 5 items: Аналитика, Календарь, Медиатека, Автоматизации, Источники. Each item has a small «Превью» tag (not an icon only); collapsed rail: group shows one flask-like icon with a tooltip «Превью: экспериментальные страницы».
- **Phone:** bottom bar unchanged; inside «Ещё» sheet a section **«Превью»** under Настройки, same 5 items. No preview item ever enters the tab bar.
- **Marking on the page (all previews):** (1) h1 followed by a «Превью» chip; (2) a permanent slim banner under the header, not dismissable: «Превью · демо-данные. Это пример интерфейса: ничего не сохраняется и не отправляется в Telegram.» (3) every number/chart carries the fake mark: chart panel header strip shows «демо» chip; (4) every action button works locally and shows toast «Превью: действие не выполняется» when it would write (Вставить в пост, Удалить, Включить, Перенести, Загрузить).
- **Leaving:** `← К обзору` is not needed (sidebar visible), but the banner has a text link «Закрыть превью» that goes to Обзор; Esc closes inspector/palette; the browser back works (state in URL: `?view=`, `?period=`, `?id=`). Phone: back chevron in header to «Ещё».
- **Обзор (changed 08.10.2026):** no toggle and no group banner. The ПРЕВЬЮ blocks sit in the Обзор composition (3.1) and carry their own marking: chip «ПРЕВЬЮ» in the panel header, «демо» on figures, links to `/preview/*`. Hidden in a production build.
- **Search palette preview** is part of the real shell trigger: results of type «Пост/Публикация» are mock rows tagged «демо» until the entity-search API exists (§5).
- Preview routes are unreachable in a production build (feature flag `VITE_PREVIEW=1` or dev-only); in DEV they are visible. Not in the PAGE_MAP rows of real routes.

### 6.3 Specs per preview

Common to all: anatomy per 2.1 (h1 + chip, banner, one primary action max), state switch lives in a dev-only floating «Состояние: Данные · Загрузка · Пусто · Ошибка» control (bottom-left, hidden in screenshots when asked). Skeleton rules 2.6 apply; Panels per rule 3; targets 44 px at 375.

#### A. Аналитика — Studio-owned publication report

Queue item 13's current UX and acceptance criteria are canonical in [`docs/stories/analytics-studio-owned-mvp.md`](../stories/analytics-studio-owned-mvp.md). The `/__proto/analytics` screen is a preview of that Studio-owned report. The former channel-performance mock outline is superseded: do not show views, reactions, reposts, engagement rate, rubric, or Telegram-native post statistics as current or supported metrics, including as fixtures on this screen. Queue item 14's feasibility proof does not establish those metrics. Keep the preview owner-only and read-only, limited to Studio's recorded publication outcomes and dimensions, with explicit observation times and coverage. The preview banner must continue to identify demo data and non-persisting actions.

#### B. Календарь `/preview/calendar`
- **Purpose:** see and reschedule what is planned. **Primary:** «Опубликовать пост» (opens the existing-style PublishDialog mock, schedule tab pre-set to selected day).
- **View switch:** **segmented control** Месяц · Неделя · День · Список (mode of one collection; matches the rule in 2.2); plus `‹ ›`, «Сегодня», month label (Select for jump). View and date in URL `?view=&date=`.
- **Desktop:** Panel with the grid (month: 7 columns, each day cell 3 visible items + «ещё N»; item = time, 24 px thumbnail, title 1 line, status dot **plus** text icon (Запланировано, Опубликовано, Черновик, Ошибка), not colour alone); right inspector 360 px = «День» list (3-5 items with `⋯`: Открыть, Перенести, Отменить) and «Ближайшие» (5), legend collapsible. Week = 7 columns x hour rows; Day = time axis; Список = grouped by date, same row anatomy as Публикации.
- **375:** default **День** (agenda), not Месяц: compact month strip on top (dots under days with items), tap day -> agenda below; segmented control shortened (Д · Н · М · Список as «День/Неделя/Месяц/Список» with scroll disabled, 4 x 80 px); primary as header button; item tap -> bottom sheet with Перенести / Отменить publication (mock).
- **Clickable:** switch views; click empty day -> inspector with «Нет публикаций · Опубликовать пост»; drag-to-reschedule is **not** prototyped (touch/keyboard unfriendly): «Перенести» opens a dialog showing old -> new time (matches 4.2); item opens inspector; unsafe case: an `unknown` item has only «Проверить» (rule 2.5); DST/timezone line «Europe/Chisinau, UTC+3» in Panel strip; today highlighted by text «Сегодня» tag.
- **States:** loading = grid at final geometry (month 6 rows x 112 px, week 24 rows) with skeleton chips; empty month = «В этом месяце ничего не запланировано» + «Опубликовать пост»; error = ErrorState replacing grid at same height; collision: two items same minute stack and show «2 в одно время» warning chip; long titles ellipsis with `title`.
- **Mock data:** ~35 items over two months, mixed statuses (incl. 1 `unknown`, 1 failed), 20% with thumbnail; one day with 5 items to show «ещё 2»; no "Важная дата / Дедлайн" event types (not product scope).

#### C. Медиатека `/preview/media`
- **Purpose:** find a file and put it into a post. **Primary:** «Загрузить файлы» (header; opens dropzone mock: drag-over state, progress, one failed file with «Повторить»).
- **Views (tabs, URL `?view=`):** Все · Изображения · GIF · Видео · Документы (counts); «Используется / Не используется» is a column filter / filter popover, not tabs. View mode **segmented** Сетка · Список (icons + text at phone). Sort: column header in list, «Сортировка» in filter sheet in grid. Storage usage («2.4 ГБ из 10 ГБ») is shown only in the Panel footer as a muted line with «демо».
- **Desktop:** Toolbar (search by name/tags, segmented, Фильтры) in a Panel; grid of cards (140 px thumbnail, name 1 line, `1920 × 1080` or size meta, type badge, checkbox on hover/focus); list mode = DataTable (thumb, Название, Тип, Размер, Используется, Загружено, `⋯`). Row/card opens inspector 440 px: preview, facts, tags (chips; add/remove local), description, «Используется в (3)» as links, footer: **«Вставить в пост»** (primary), «Копировать ссылку», «Скачать», «Удалить» (danger, dialog «Удалить файл? Он используется в 3 постах» naming effect).
- **375:** header «Загрузить»; tabs scrollable allowed here only (5 tabs; show fade + active in view); toolbar = search + Фильтры; grid 2 columns; list = row cards (thumb 56 px). Item tap -> bottom sheet with the inspector content; multi-select long-press -> SelectionBar «Выбрано 2 · Вставить в пост · Отмена».
- **«Вставить в пост» flow (clickable):** from the library: opens a mock picker «Выберите пост» (3 drafts) -> toast «Превью: файл добавлен в пост» -> link «Открыть пост» (goes to the real editor, no changes). Reverse entry (the real use): editor «Выбрать из медиатеки» opens this page as a sheet in selection mode with «Добавить (N)» footer; prototype that as a separate state.
- **States:** loading = 10 grid cards at final size / 8 table rows; empty library = EmptyState «Файлов пока нет» + «Загрузить файлы»; filtered empty = «Ничего не найдено» + «Сбросить фильтры»; unavailable object = card with broken-thumbnail placeholder + chip «Файл недоступен», inspector actions limited to «Удалить»; upload error per file; long names ellipsis with `title`.
- **Mock data:** 24 items of common types (jpg/png/gif/mp4/pdf/svg), generic gradient thumbnails drawn in CSS (no copyrighted game art), 3 tags, 2 «Не используется», 1 unavailable.

#### D. Автоматизации `/preview/automations`

Канонические продуктовый объём, поток, матрица состояний, правила паузы и критерии приёмки находятся в [`docs/stories/automation-center.md`](../stories/automation-center.md). Этот маршрут — только кликабельное демо: он не сохраняет данные и не запускает реальные задачи.

- **Назначение:** просматривать и безопасно управлять только зарегистрированным опросом источников/обработкой обновлений, обновлением статистики героев и проверкой списка наблюдения. **Основное действие:** `Запустить сейчас` только для выбранной безопасной задачи; создания/настройки автоматизаций нет.
- **Навигация:** список и подробности «Запуски». На широком экране — таблица с подписями и инспектор шириной 400 px; на телефоне (<860 px) — карточки и полноэкранная выезжающая панель. При ширине 320–1920 px нет горизонтальной прокрутки страницы; действия видимы, подписаны и имеют область нажатия не менее 44 px.
- **Строка задачи:** название/назначение, категория, источник/результат, cadence и следующий запуск только из ответа сервера, последний запуск/результат/длительность, текстовый статус, действия строки. Не показывать выдуманные задачи или расписание. В запуске: время, результат, длительность, безопасное сообщение, ID и ссылку на сохранённый результат, если он есть.
- **Пауза:** подтверждение называет задачу. Текст: `Новые запуски этой автоматизации будут остановлены. Уже начатый запуск продолжится. Запланированные публикации в Telegram продолжат отправляться по расписанию.` После подтверждения сервера показать статус и действие `Возобновить`; возобновление выполняется сразу. Не показывать обработчик публикаций как задачу, которую можно приостановить.
- **Запустить сейчас:** демо показывает один объединённый запуск и изменение статуса. Никаких дублей, прямой отправки в Telegram, обработки публикаций или обхода обычного D1 claim. Опрос источника/разбор обновления могут сохранить факты, черновик на проверку владельцу и личное уведомление; проверка списка наблюдения может создать дедуплицированное личное уведомление; обновление статистики сохраняет ограниченный снимок. Указывать только эффекты конкретной задачи.
- **Граница публикаций:** если fixture показывает обработчик отправки публикаций, он доступен только для чтения и сопровождается текстом `Запланированные публикации продолжают отправляться независимо от паузы автоматизаций.` Никаких кнопок паузы, запуска, повтора, отмены или отправки. Управление публикациями остаётся в `/publications` и `/calendar` в соответствии с их текущей машиной состояний.
- **Состояния:** загрузка со скелетоном; действительно пустой список без CTA создания; безопасная ошибка чтения/повтор; 401/403; неполные/устаревшие данные; неизвестный статус с недоступным действием; конфликт паузы; ожидание/выполнение с отключённым повторным запуском; ошибка и неизвестный результат показаны раздельно. Неизвестный результат нельзя повторять.
- **Клавиатура:** при переходе фокус на H1; строка открывается ссылкой/кнопкой; диалог использует общие правила фокуса/Escape/возврата; панель подробностей имеет видимую кнопку закрытия. Результаты действий сервера (в продукте; локальная имитация — только в превью) объявляются в одной вежливой live region.
- **Фикстуры:** только опрос источников, статистика героев и проверка watchlist; детерминированные запуски: в очереди, успешно, ошибка, неизвестный результат, приостановлено, частичные/устаревшие данные. Все действия остаются локальными, с постоянной маркировкой «Превью / демо-данные».

#### E. Dota Pulse и Источники `/preview/sources`
- **Purpose:** deterministic feed of official Dota 2 news/events and the health of the sources behind it (no AI, no scoring, no summaries: title + source + time + link). **Primary:** none.
- **Views (tabs):** События · Источники.
- **События (desktop):** Panel list rows: type chip (Патч · Новость · Турнир), title, source, relative time, `⋯` Открыть источник (external link, mock href `#`), «Создать черновик поста» opens editor mock (new post with title prefilled — only copy of the headline, never generated text). Column filters: Тип, Источник, search in title.
- **Источники:** table: Источник, Адрес (domain), Последняя проверка, Изменение, Статус (Доступен · Устарел · Недоступен). Inspector: allowed domains, last 5 checks, provenance line «Получено с steamcommunity.com».
- **375:** row cards; Источники as cards with status chip; sheet detail.
- **Same content as the Обзор widget** (6.3 G): the widget is the first 3 events and a «Все события» link here.
- **States:** loading 8 rows x 56; empty = «Новых событий нет» (positive, no CTA); filtered empty; source unreachable = chip + warning text «Источник не отвечает 2 ч, показаны данные на 06:40»; partial = events from 2 of 3 sources with a note; stale footer.
- **Mock data:** 12 events from 3 fake-labelled sources (RSS «Dota 2 · блог», «Patch notes», «Tournaments»), real-looking but fictional titles; CSS-gradient thumbnails.

#### F. Палитра поиска (Ctrl K)
- **Purpose:** jump anywhere in two keystrokes. Trigger is the top-bar field (desktop), search icon on phone (full-screen sheet).
- **Layout:** centred 640 px dialog (phone: full-screen), input with autofocus, **grouped results** with fixed headers: Недавнее, Разделы (Обзор, Посты, Публикации, Инциденты, Настройки, + «Превью» group items tagged), Посты (3), Публикации (3), Инциденты (2), Действия («Новый пост»). Each row: icon, label, muted secondary (status chip / channel / time), `Enter` hint on the active row; footer line «↑↓ выбрать · Enter открыть · Esc закрыть». Max 8 rows total, 3 per group.
- **Clickable:** typing filters locally (case-insensitive, 150 ms debounce); arrow keys + Enter navigate (real routes for Разделы/Действия; entity rows open real `/posts` or `/publications?id=` only for existing mock ids, else toast); `Esc` closes and returns focus to the trigger; empty query shows Недавнее + Разделы.
- **States:** empty query, no results («Ничего не найдено. Попробуйте название поста или канал»), loading (3 skeleton rows 48 px, only for entity groups), offline («Поиск по постам недоступен без сети», sections still work).
- **Mock data:** 6 posts, 6 publications, 3 incidents with realistic fake titles; marked «демо» in group header Посты/Публикации until API exists.

#### G. Превью-блоки на Обзоре (composed in 3.1)
- **Purpose:** show Dota Pulse, channel analytics and system health inside the real Обзор composition, .
- **Blocks:** Dota Pulse (right column, 3 rows with image thumbnails, «Все события» -> `/preview/sources`), Аналитика канала (right column, 3 tiles with sparkline, «Все метрики» -> `/preview/analytics`), Система (bottom row, 4 rows with state + latency). Layout, heights and phone behaviour: 3.1. «Ближайшие» and «Последние публикации» are **real** blocks, not previews.
- **States:** loading at skeleton heights (3.1), widget error inline (others stay), empty Dota Pulse «Новых событий нет».
- **Rule:** previews never enter the KPI strip or the left column and never push «Требует внимания» down.
