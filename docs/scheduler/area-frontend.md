# Rubric scheduler — FRONTEND area plan (30.10.2026)

Planning only. Nothing built. Inputs: `architect-plan-v2.md` (+ v2.1), `review-backend.md`, `review-qa.md`, `release-model.md`, `research-*.md`, `ui-ia.md`, `ui-mock/*` (+ `contact.png`), `docs/RUBRICS_SCHEDULER.md`, DECISIONS 30.10.2026, the real frontend code (`apps/frontend/src`, read 30.10.2026). Owner decisions are final and not reopened. UI strings are Russian, everything else English. Server meaning is taken only from contracts (`CONTRACT_REQUEST` below); no backend code was read.

## 0. Summary of decisions (frontend)

1. One new section **«Рубрики»**: route `/rubrics` (tabs Календарь · Рубрики · Сравнение · Комментарии, `?tab=`) and `/rubrics/$key` (rubric card). One feature slice `features/rubrics/`; the DEV-only sample tool stays in `features/rubric-samples/`.
2. Menu: `NAV_ITEMS` gets `{ to: '/rubrics', label: 'Рубрики', icon: 'list', primary: false }` right after «Публикации» (sidebar order: Обзор, Посты, Публикации, **Рубрики**, Аналитика, ИИ-редактор, Медиа, Источники, [Тестирование], Настройки). On a phone it lives in the «Ещё» sheet («Разделы»); the bottom bar keeps its three primary items + «Ещё» (`moreActive` already matches `/rubrics` and `/rubrics/…`; `NAV_ROOT_PATHS` makes `/rubrics` a Telegram BackButton root and `/rubrics/$key` a child whose `parentPath` is `/rubrics`).
3. The manual «Рубрики Telegram» (owner: «ручные вообще раздел можешь удалить») are **deleted** — no merge, no «Свои метки» dialog (the mock's «Свои метки» button and `ui-ia.md` §5.7 are superseded). They are removed in the same PR that introduces the first `/rubrics` screen, so the word «Рубрики» never means two things in one build (assumption A1, see §14).
4. All times, days and weekdays in this section are **Europe/Moscow** (owner 8a), shown as «время МСК» once in the page header — a deliberate exception to the «don't name the zone» pattern, because the section's zone is fixed by the owner and may differ from the Settings zone. Never use `useOwnerTimezone()` here.
5. The server is the only source of truth for what exists, what state a slot is in, which locks apply and what the reason text says. The client never recomputes eligibility, rest, locks or ×; it only formats, groups and merges (forecast under real slots).
6. Nothing optimistic. The scheduler switch, per-rubric pause and every slot state come from a server response; a state is shown as sent («Опубликовано») only when the DTO proves it (`state='sent'` and `externalMessageId` present); `unknown` has no retry/cancel/resend control anywhere in the section.
7. Stages follow the backend (§3): a screen block is rendered **iff its DTO block is present**; nothing is shown as a placeholder for a later stage (docs rule: never describe planned parts as working). The Комментарии tab does not exist until stage 7.

## 1. Owner decisions that shape the UI (checked against RUBRICS_SCHEDULER.md / DECISIONS)

| Decision | UI consequence |
|---|---|
| Prod automatic + switch; DEV never posts to the main channel | Switch states incl. `unavailable` (DEV) and `rehearsal` (§6.2) |
| DEV rehearsal into the test channel, no AI | Banner «Репетиция…», rubrics needing AI show «Нужен ИИ · на DEV репетиция без ИИ» |
| Prod BROWSER binding with a daily cap | Picture rubrics without the binding show «Нужен Browser Rendering», no errors (stage P adds the daily budget line) |
| All times MSK, D1 UTC | `model/msk.ts`, §0.4 |
| Hours learned per weekday, 08–23, exploration hours | Card «Часы» with «выучено/вручную», heat-map `peak`/`trial` marks (stage 8) |
| Bank runs out: pause (guess rubrics) vs new round (jokes), owner told in the bot chat | Status «Банк исчерпан», card bank block, round counter; no UI button (it resumes by itself) |
| A rubric that did not go out: replacement / skip, rest not consumed | «Что поменялось» feed, replacement/moved/skip flags, note «Отдых не сбрасывается» |
| Weekly report gets a «Рубрики» block | Backend only: `ReportsPanel` renders report `blocks` generically (`kind: text|table`, ReportsPanel.tsx:188) — no frontend change, nothing to test |
| Comments text kept 7 days (**ждёт владельца** — still open), counts + summaries kept | Quotes rendered only if the DTO carries them; the answer changes server retention, not the UI |
| Semantic similarity deferred 4 weeks | No UI; card shows lexical «заблокировано N» only |
| Picture + its poll = one of the 3 daily posts | One slot row with picture + poll icons, counted once |
| Manual «Рубрики Telegram» removed in the UI stage | §10 |

## 2. CONTRACT_REQUESTs (what the frontend needs; shapes to be merged with the contracts/backend plans — names are proposals)

All under `/api/v1/rubrics`, Bearer session, owner-only (401 silent re-auth → login, 403 «Нет доступа» no data). New `apps/contracts/src/rubrics.ts`, exported from `index.ts`. Dates: instants are UTC ISO; day buckets are MSK `YYYY-MM-DD` strings computed by the client from instants (the server sends no local days except `from`/`to` query params).

- **C1 constants** — `RUBRIC_KEYS` (the 30 + `greeting_card` when 31 is approved; `rubricSampleKeySchema` is rebuilt from it), `rubricKeySchema`, `RUBRIC_TITLES: Record<RubricKey,string>` (single source for backend META, `/lab` list and this section; today the titles are hard-coded in `RubricSamples.tsx:11–42`). DTOs carry `rubricKey`, never titles.
- **C2 `GET /rubrics/status`** → `{ mode: 'live'|'rehearsal'|'unavailable', enabled: boolean, effective: 'running'|'switched_off'|'locked'|'unavailable', locks: {code}[], transition: 'enabling'|'disabling'|null, pendingCancel: number, liveSlots: number, next: {slotId, rubricKey, at, reason}|null, destination: {kind:'channel'|'rehearsal', title}|null, lastPlanAt: iso|null, planStale: boolean, capabilities: {browser, openai, stratz, statsDb}: boolean, browserBudget?: {usedToday, capToday} (stage P), updatedAt }`. Lock codes: `CRON_OFF`, `PUBLISHING_OFF`, `BOT_NOT_CONFIGURED`, `VAR_OFF`, `DEV_NO_REHEARSAL`, `REHEARSAL_TARGET_MISSING`. `planStale` is decided by the backend health check (threshold lives there). Errors: `503 UNAVAILABLE reason SCHEDULER_NOT_READY` (tables missing, H9/N2).
- **C3 `PUT /rubrics/scheduler`** `{ enabled }` → 200 same DTO as C2. Idempotent; locks do not make it fail (a lock is state, not an error). Errors: 400, 401, 403, 503 `SCHEDULER_NOT_READY`, `409 CONFLICT reason UNAVAILABLE_HERE` only on `mode='unavailable'`. Turning off cancels unreleased slots and deletes unpublished posts on the next Cron tick: the response carries `transition:'disabling'`, `pendingCancel:n`.
- **C4 `GET /rubrics/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`** (MSK dates, ≤ 42 days) → `{ slots: SlotDto[], changes: ChangeDto[], oldestDay, updatedAt }`.
  `SlotDto = { id: uuid, rubricKey, at, role: 'post'|'followup', hasPicture, hasPoll, state: SlotState, reason: {kind: 'rest'|'event'|'anchor'|'chain'|'weekly'|'filler'|'replacement', text}, detail?: { code, message, step?, provider?, httpStatus? }, replacementOf?: {slotId, rubricKey, at}, replacedBy?: {slotId, rubricKey, at}, movedFrom?: iso, publicationId?: uuid, externalMessageId?: string, manual?: boolean }`.
  `SlotState = planned|building|ready|released|waiting_parent|sent|partial|unknown|unresolved|send_failed|missed|empty|yielded|cancelled|superseded` (the backend state machine verbatim). `poll_close` housekeeping slots are never sent to the UI. `reason.text` and `detail.message` are server-composed plain Russian (same wording as the bot's failure notice, so one fact lives once) and rendered as text only. A failure always carries step, provider, HTTP status and message (owner rule «errors in full detail»).
  `ChangeDto = { kind: 'replacement'|'moved'|'skip', at, rubricKey, otherRubricKey?, from?, to?, text }` (the «Что поменялось» feed, last 7 days + next 7).
- **C5 `GET /rubrics/forecast`** → `{ days: {date, slots: {rubricKey, at, hasPicture, hasPoll, reason}[]}[], from, until, computedAt }` — read-only 35-day forecast (pure `plan()` output, architect step 4). Separate from C4 so the polled calendar read stays cheap (backend: serve it from the 30-min plan step, never recompute per request).
- **C6 `GET /rubrics`** → `{ items: RubricListItem[], updatedAt }`; item: `{ key, state: 'active'|'paused'|'waiting_event'|'bank_exhausted'|'unavailable'|'breaker', unavailable?: 'browser'|'openai'|'stratz'|'statsDb', breaker?: {until, code}, enabled, hasPicture, rest: {baseDays, currentDays, reason?}|null, trigger: {text}, lastPostAt, next: {at, slotId}|null, liveSlots, version, bank?: {total, used, round, kind: 'pause'|'cycle'}, posts?: number, multiple?: number|null (stage 7) }`.
- **C7 `GET /rubrics/{key}`** → item + `recent: SlotDto[]` (last 8) + optional blocks, each present only when its stage exists: `bet` (06 open bet, stage 5), `innerRules: {id, title, detail, progress?: {done,total}, blocked?: number}[]` (stage 6), `restHistory: {at, fromDays, toDays, reason}[]`, `hours: {weekday, time, source: 'default'|'learned'|'manual'}[]`, `advice?: {days, reason}` (stage 8). `404 NOT_FOUND reason RUBRIC_NOT_FOUND`.
- **C8 `PATCH /rubrics/{key}`** `{ enabled, expectedVersion }` → 200 item; `409 CONFLICT reason STALE_VERSION` (someone changed it), 400, 401, 403, 404. (Rest days are **not** editable in v1, see Q2.)
- **C9 (stage 7) `GET /rubrics/compare?period=7d|30d|90d`** → `{ usual: {medianViews}, minPosts, rows: {rubricKey, posts, multiple|null, medianViews, few}[] }` — × against the channel's usual post (same definition as the old `model/rubrics.ts`, now server-side). **C10 `GET /rubrics/compare/hours?period`** → `{cells: {weekday 0–6, hour 8–23, multiple|null, n, peak?, trial?}[]}` (`peak/trial` stage 8). **C11 `GET /rubrics/{key}/posts?period=30d|90d|all&cursor`** → `{ usual, counted, total, items: {slotId, at, label, line, hasPicture, multiple|null, publicationId}[], nextCursor }` (× against the rubric's own median). **C12 `GET /rubrics/{key}/slices?period`** → `{ groups: {dimension: 'hero'|'bankLine'|'format'|'hour'|'weekday', rows: {label, n, multiple}[]}[] }`. **C13 `GET /rubrics/comments?period=7d|30d|90d`** → `{ state: 'not_connected'|'no_data'|'limited'|'ready', rubrics: {rubricKey, count, topic, mood?, quote?}[], topics: {text, count}[] }` (no author names or ids ever).
- **C14** `BACKGROUND_JOBS` += `'rubricScheduler'` (frontend adds its row copy in `BackgroundJobsPanel.tsx`, it is a `Record<BackgroundJob,…>`).
- **C15 removal** of `GET/POST/PUT/DELETE /content-analytics/rubrics…` and `GET/PUT /content-analytics/posts/:postId/rubric` and their DTOs (`contentRubric*`, `contentPostRubric*`, `contracts/src/content-analytics.ts:365–423`), backend routes and `apps/backend/tests/integration/content-rubrics.test.ts` — one cross-area commit with the frontend part of §10 (contract rule). Tables of migration 0089 stay (expand-only); dropping them is a later backend migration, not frontend.
- Error mapping: add `SCHEDULER_NOT_READY`, `STALE_VERSION`, `RUBRIC_NOT_FOUND`, `UNAVAILABLE_HERE` pairs to `shared/api/error-kind.ts` and rows to `src/test/error-matrix.test.ts`.

## 3. Design-system requests (before the screen that needs them; else local styles fork the system)

| # | Primitive | Needed by | Spec |
|---|---|---|---|
| D1 | `CalendarMonthGrid` (RAC `Calendar` wrapper, same stack as `DateTimeField`) | F1 month view | props: `value`/`onChange` (selected `CalendarDate`), `visibleWeeks` (5), `firstDayOfWeek='mon'`, `timeZone`, `min/max`, `renderDay(date)` for dots + flags, `aria-label`; cell ≥ 44 px at 375 (53 px wide), keyboard = RAC (arrows, PageUp/Down), today ring, selected fill, `data-forecast` cells dimmer. **Spike first**: whether RAC honours `visibleDuration={{weeks:5}}` aligned to Monday; fallback is a button grid with roving tabindex. |
| D2 | `DivergingMeter` | F5 rank rows, post rows, slices, list «К обычному» | center = ×1,0; `value` multiple; up bar = `--color-status-done-fg`, down = `--color-status-failed-fg`; value always printed as text beside it (colour never alone); `few` variant (hatched/muted). |
| D3 | `HeatGrid` | F5 heat-map | real `<table>` with `<caption>`, row/column headers, cell = number text + intensity `color-mix(accent N%, surface-2)` via a CSS variable, `peak` (★ + outline), `trial` (dashed outline), low-n style; labelled `role="region" tabindex="0"` scroller below 600 px (min width 560). |
| D4 | icon `rubrics` (or reuse `list`) | nav | default: reuse existing `list`; ask design-system only if they want a dedicated glyph. |

Reused as-is: `Tabs`, `SegmentedControl`, `Switch`, `ConfirmDialog`, `Banner`, `EmptyState`, `ErrorState`, `StatusPill` (label+group+icon — slot badges, no new primitive), `StatGrid/StatTile`, `ProgressBar`, `Select` (has `description`), `DataTable` (+ narrow cards), `RowCard`, `Disclosure`, `SearchField`, `StaleRegion`, `Skeleton`, `PageHeader`, `Panel`, `PollMark`, `VisuallyHidden`, `Toast`. All mock tokens exist in `tokens.css` (verified: every `var(--…)` of `mock.css` resolves). Needs a token check at F5: no new token expected for the heat ramp (mock uses `color-mix` of existing tokens).

## 4. Stages (frontend slices follow backend stages; each ends green and is committed with its contract commit)

| F | Backend stage | Frontend deliverable | Exit |
|---|---|---|---|
| F1 | 3 (pure core, DEV forecast) | route `/rubrics`, nav item, **Календарь forecast-only** (month/week/list, agenda, forecast styling, no switch, no feed), removal of manual «Рубрики Telegram» (§10), docs | typecheck, unit tests F1, shots 375/1280/1920, axe/keyboard, real-DEV look |
| F2 | 4 (slot machinery, prod go-live) | C2/C3 status + switch (all states), live calendar (all slot states, notes, «Что поменялось», polling, announcer), tab **Рубрики** (list), `/rubrics/$key` base card (header switch, facts, bank block, banners, «Последние выходы»), per-rubric pause, `/lab` job row, error-kind rows | + 409/unknown/no-optimistic/polling tests |
| F3 | 5 (events, anchors) | chips `event/anchor/chain` styling, `greeting_card` in the key list, card `bet` block (06), «Ждёт события» triggers | typecheck, shots of those states |
| F4 | 6 (inner planners, lexical similarity) | card block «Внутренние правила» | shots |
| F5 | 7 (analytics, comments) | tabs **Сравнение** (between, inside, heat-map) and **Комментарии**, list column «К обычному», card «Сравнение постов» + «Срезы» | + slices/format tests, comments-text test |
| F6 | 8 (learning, advise 4 weeks) | card «Часы» (выучено/вручную), «История отдыха», `advice` line, heat `peak/trial` | shots |
| F7 | P (browser capability) | `browserBudget` line («Картинки сегодня: 3 из 12»), copy for budget breaker; picture rubrics leave `unavailable` by themselves | shots |

Each F-stage is one commit (frontend + its docs), landed after or together with the backend/contract commit of the same stage (additive endpoints may land first; the C15 removal is one cross-area commit). Frontend never merges mocks of a shape the contract does not have: until a contract exists the stage is `CONTRACT_REQUEST` blocked.

## 5. Routes, search params, document titles

Files: `routes/rubrics/index.tsx` (lazy `RubricsPage`), `routes/rubrics/$key.tsx` (lazy `RubricCardPage`), same folder pattern as `routes/posts/`. `routeTree.gen.ts` is tracked and regenerated by the router plugin (commit it). `ru.nav.rubrics = 'Рубрики'`, `ru.pages.rubrics = 'Рубрики'`; document title `Рубрики — ALEXEEV Studio`, card `<Название рубрики> — ALEXEEV Studio` via `useDocumentTitle`; H1 gets focus on mount (`PageHeader focusHeadingOnMount`).

`/rubrics` search (Zod `.looseObject(...).catch({})`, every field `.optional().catch(undefined)`, defaults stay out of the URL):
- `tab`: `list | compare | comments` (default calendar). Tabs rendered = stage-available set (F1: only Календарь, so no TabList; F2: + Рубрики; F5: + Сравнение, Комментарии).
- Календарь: `view` `week | list` (default month), `day` ISO date (anchor/selected day, default today MSK; outside `[oldestDay, forecast.until]` → clamped).
- Рубрики: `q` (≤100), `state` `active | waiting | paused | attention`.
- Сравнение: `mode` `inside` (default between), `period` `7d | 30d | 90d | all` (between: 7/30/90 default 30d; inside: 30d/90d/all default all), `rubric` (`rubricKeySchema`; inside only).
Card: `$key` validated with `rubricKeySchema`; unknown → `NotFoundPage`-style state «Такой рубрики нет» + link «К рубрикам». Filters replace history entries; opening a card is a step Back can undo (as in `/ai`).

## 6. Pages (page-spec). `n/a` is explicit. Common: errors = short text + `requestId` + «Повторить» (safe GETs only); 401 = silent re-auth then login, cache cleared; 403 = «Нет доступа», no data.

### 6.1 `/rubrics` — Рубрики (shell)
Purpose: the owner sees what will go to the channel, when and why, switches it on/off, and later reads how rubrics perform. H1 «Рубрики»; description «Календарь: все рубрики на 5 недель вперёд, время МСК» (changes per tab as in the mock subtitles). Tabs by APG via shared `Tabs` (scroll-x on narrow; check «Комментарии» at 320).

### 6.2 Scheduler master card (top of Календарь from F2; F1 has none) — component `SchedulerSwitch`
Layout from mock `master()`: `Switch` «Автопубликация рубрик» + sub-line, meta «Следующий выход» (day, time, title) and «Обновлено N мин назад»; on phone only the first meta item (mock). Locks render as a `Banner` under it, one per lock, copy below.

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first `status` fetch | skeleton card (fixed height, no jump) | none | unchanged |
| on, running | `mode live|rehearsal`, `enabled`, no locks | «Включена · работает только на проде» (live) / «Включена · репетиция» | switch off (ConfirmDialog) | switch |
| off | `enabled=false` | «Выключена»; calendar shows forecast only + Banner «Автопубликация выключена: это прогноз, ничего не выйдет» | switch on (ConfirmDialog) | switch |
| locked | `locks.length>0` | switch as stored + Banner per lock: `CRON_OFF` «Фоновые задачи (Cron) выключены — рубрики не выйдут» (+ link «Тестирование → Фоновые задачи» only in a lab build), `PUBLISHING_OFF` «Публикации выключены на сервере — рубрики не выйдут», `BOT_NOT_CONFIGURED` «Бот не подключён — публиковать нечем», `VAR_OFF` «Планировщик выключен настройкой сервера (RUBRIC_SCHEDULER)», `REHEARSAL_TARGET_MISSING` «Не задан тестовый канал репетиции» | none (state, not error) | message |
| DEV unavailable | `mode='unavailable'` | disabled switch (`isDisabled`, described by text) «На DEV не работает, только ручной запуск» + link «Тестирование» (lab build) | none | — |
| rehearsal | `mode='rehearsal'` | Banner «Репетиция: посты уходят только в «<destination.title>», ИИ не работает. В основной канал ничего не уходит» | switch on/off as live | — |
| saving | PUT in flight | switch keeps the **previous** value, `aria-busy`, spinner in the card; no success text | none | switch |
| transition | `transition≠null` | «Отменяем N слотов…» / «Расписание соберётся в течение минуты» (`aria-live=polite`), poll 5 s, max 2 min then normal | none | — |
| error | PUT 5xx/network | inline error + requestId under the switch, switch back at the server value | «Повторить» is **not** offered (the owner presses the switch again) | message |
| 409 | `UNAVAILABLE_HERE` | same as DEV unavailable | — | message |
| 503 | `SCHEDULER_NOT_READY` | `ErrorState` «Планировщик ещё не готов на этом сервере: не применена миграция базы» | «Повторить» (GET) | message |
| 202/queued | n/a (PUT is 200 with `transition`) | — | — | — |
| unknown | n/a for the switch (slot `unknown` is in the calendar) | — | — | — |
| stale plan | `planStale` | Banner warning «План не обновлялся давно» + «Обновлено …» | — | — |

ConfirmDialog copy (destructive/impactful, owner rule 14.10; `role=alertdialog`, focus on «Нет»):
- Off: «Выключить автопубликацию рубрик?» — «Не вышедшие рубрики (N) отменятся, собранные посты удалятся. То, что уже отправляется, выйдет. Включить можно в любой момент — расписание соберётся заново.» «Да, выключить» / «Нет». `N = status.liveSlots`.
- On: «Включить автопубликацию рубрик?» — «Рубрики начнут выходить в канал «<title>» сами, без вашего подтверждения. Ближайшая — «<next>» в <time>. Выключить можно здесь же.» (rehearsal: «в тестовый канал «…», без ИИ»). «Да, включить» / «Нет».
After a 200 the toast `role=status` says «Автопубликация включена» / «выключена» (server-confirmed).

### 6.3 Календарь (tab; default)
Data: C4 (window = Monday of `day` … +42 days, key by `from,to`), C5 forecast, C2 status. Views via `SegmentedControl` «Месяц / Неделя / Список» (`?view`). Toolbar: range title («26 окт — 29 ноя»), «←» «→» (shift one week; list: 7 days), «Сегодня»; navigation clamped to `oldestDay` and forecast `until`. Legend: «Бледные точки дальше недели — прогноз, пересчитывается».
- **Merge** (`model/merge-calendar.ts`, pure): real slots (C4) always win; forecast days are only days **after** the last day that has real planning (`today+1` MSK or the last real slot day) and never a day that already has a real slot for that rubric/time; forecast items get `state:'forecast'`, no id (key `f:<rubricKey>:<at>`). When `enabled=false` the whole window shows forecast (no real future rows exist).
- **Месяц** (mock `calendar()`): 5×7 `CalendarMonthGrid`; cell = day number, ≤6 dots (colour by state group **and** shape: filled/ring/spinner; forecast = hollow dashed), count «N поста» (`pluralRu`), flags ⇄ replacement, ↷ moved, ∅ skip with `aria-label` text; today ring, selected fill. `aria-label` per cell: «30 октября, 4 слота: 12:30 Что брать рекруту — опубликовано; …; есть замена». Selecting a day (click/Enter) fills the agenda; on phone the agenda sits under the grid (list→detail without a route change, no jump: agenda has a reserved min-height).
- **Неделя** (mock `scheduleB()`): ≥1180 px 7 columns, 600–1179 auto-fill 210 px, <600 stacked days; `SlotCard` = time (mono), kind icon, name, reason chip, state label + dot/spinner, note; left border = state group, label text always present.
- **Список** (mock `scheduleA()`; its «Состояния выключателя» block is a mock demo, not shipped): 7 days from `day`, per day a `Card` of `SlotRow`s; today highlighted; header «Пт 30 окт · сегодня · N постов» (count = slots expected to go out: forecast, planned, building, ready, released, waiting_parent, sent, partial, unknown, unresolved).
- **Agenda/`SlotRow`** (shared by agenda and list; grid 52 px time · 28 icon · content): name is a link to `/rubrics/$key`; picture/text icon with accessible name «С картинкой»/«Только текст» (+ `PollMark` when `hasPoll`); `role: followup` prefixes «Ответ · »; reason chip (`event` and `anchor` tones differ, text from `reason.text`); `StatusPill`; note (`detail.message`) and a `Disclosure` «Подробности» with step · provider · HTTP · code (monospace) for failures; skipped/failed/superseded names struck through (not the only signal — the label says it); replacement rows tinted (`surface-2`) with «Замена слота 15:10»; `now` row (building) gets an inset accent edge; `manual` shows «Изменён вручную»; `sent`/`partial`/`unknown`/`unresolved`/`send_failed` rows link «Открыть публикацию» → `/publications?id=<publicationId>`; `unknown` also shows «Telegram мог принять пост — проверьте канал. Повторной отправки не будет.» and «Сверить в Публикациях».
- **«Что поменялось»** (panel under/next to the agenda, `ChangesFeed`): rows with icon (⇄ retry, ↷ arrow-right, ∅ minus-circle) + `text` (e.g. «Замена · Пт 30 окт «Оцениваем» (15:10) не собралась: Browser Rendering 429. Вместо неё «Что выберешь?» в 21:30»), skip rows end with the server's «Отдых рубрики не сбрасывается». Empty: «Изменений нет». Hidden in F1.
- **Slot badges** (`model/slot-badge.ts`, one table; group = token group of `StatusPill`):

| state | label | group | icon |
|---|---|---|---|
| forecast | «Прогноз» | muted | clock |
| planned | «Запланировано» | pending | clock |
| building | «Собирается» | active | loader (spin; off under reduced motion) |
| ready | «Готово к выходу» | pending | check |
| released | «Отправляется» | active | send |
| waiting_parent | «Ждёт предыдущий пост» | pending | clock |
| sent | «Опубликовано» (only with `externalMessageId`; else «Требует проверки») | done | check-circle |
| partial | «Вышло частично» | retry | alert |
| unknown | «Требует проверки» | unknown | help |
| unresolved | «Не подтверждено» | unknown | help |
| send_failed | «Ошибка отправки» | failed | x-circle |
| missed | «Не вышло вовремя» | failed | x-circle |
| empty | «Пропуск» (reason in note) | muted | minus-circle |
| yielded | «Уступил» | muted | minus-circle |
| cancelled | «Отменено» | muted | minus-circle |
| superseded | «Заменён» | muted | minus-circle |

(Note: mock/QA wording «Отправлено» is replaced by the canonical «Опубликовано» of skill `page-spec` so Календарь and Публикации use one word; `unknown` keeps «Требует проверки».)

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first fetch | skeleton: toolbar + grid/list rows of final height, `aria-busy` | none | unchanged |
| placeholder | change of week/view | previous data dimmed under `StaleRegion` (`keepPreviousData`), no layout jump | none | unchanged |
| empty | no slots in window and no forecast (rubrics all off) | `EmptyState` «Расписание пустое» + why (all rubrics on pause / nothing eligible) + link «К рубрикам» | link | — |
| empty day | selected day without slots | «В этот день ничего не запланировано» | — | — |
| error | 5xx/network | `ErrorState` with requestId; **last data stays** with «Обновлено 12 мин назад» when a refetch fails | «Повторить» | message |
| 401 / 403 | as common | — | — | — |
| 409 | n/a (read-only) | — | — | — |
| 202/queued | n/a | — | — | — |
| unknown | slot `unknown` | see `SlotRow` | link to publication only | — |
| forecast only | F1 or switch off | Banner «Это прогноз: ничего не выходит» (F1: «Автопубликация ещё не включена») | — | — |
| 503 | `SCHEDULER_NOT_READY` | as 6.2 | retry | message |

Polling (hook `useCalendarPolling`): calendar refetch every **30 s** while the window holds a live slot (planned within 3 h, building, ready, released, waiting_parent) or `transition≠null` (then 5 s), else every **5 min**; status every 30 s; forecast no polling (`staleTime` 10 min). `refetchIntervalInBackground` stays false; no polling in a hidden tab; stops on unmount; `refetchOnWindowFocus: true` for these two reads only. Announcer (`useSlotAnnouncer`): after each poll, transitions of known slot ids into `sent|partial|unknown|send_failed|missed|empty` produce **one** batched polite message in a `VisuallyHidden role="status"` (the region exists before text); timer cleaned on unmount.
Query keys (`rubricKeys`): `['rubrics']` · `status` · `calendar,from,to` · `forecast` · `list` · `card,key` · `card,key,posts,period` · `card,key,slices,period` · `compare,period` · `compare-hours,period` · `comments,period`. `staleTime`: status 0, calendar 15 s, forecast 10 min, list 60 s, card 60 s, compare/comments 5 min.
A11y: month grid = RAC calendar grid (arrows, PageUp/PageDown by month, Home/End); dots `aria-hidden`; meaning only in the cell label and agenda; targets ≥ 44 px at 375; focus ring visible, never under sticky bars; headings order H1 → H2 (day) → rows; reduced motion removes spinners; colours never the only signal (labels + shape + text).

### 6.4 Рубрики (tab, F2)
Mock `rubrics()`. Subtitle «30 рубрик · 24 активны · 2 на паузе · 4 ждут события» (counts from C6; adds «· N требуют внимания» when > 0). Toolbar: `SearchField` «Поиск по названию» (`?q`), `SegmentedControl` Все · Активные · Ждут события · На паузе · **Нужно внимание** (shown only when count > 0; deviation D1 below). **No «Свои метки» button.**
Columns (`DataTable`, narrow = its card density): Рубрика (kind icon + title + trigger line `trigger.text`), Статус (`StatusPill`), Отдых сейчас, Последний пост, Следующий, К обычному (F5, absent before). Row action → `/rubrics/$key` (whole row; real link semantics via `onRowAction`).
- Status pills: active «Активна» (done), paused «На паузе» (muted), waiting_event «Ждёт события» (unknown hue as mock `b-unknown`; text carries meaning), **bank_exhausted «Банк исчерпан»** (retry hue + «пополните банк» in the row note), unavailable «Нужен Browser Rendering» / «Нужен ИИ · на DEV репетиция без ИИ» / «Нужен STRATZ» / «Нужна база матчей» (muted; no notice noise), breaker «Сбой, пауза до 22:00» (failed hue, `breaker.until` in МСК).
- «Отдых сейчас»: «14 д · без изменений», «↓ 12 д» (shorter = comes in better than usual; tooltip as mock) / «↑ 16 д»; event rubrics «по событию»; reason from `rest.reason` in the tooltip and card. «Последний пост»: «9 д назад» / «—» (> 30 d on pause). «Следующий»: `next.at` in МСК or the trigger text («ждёт анонса Valve»). «К обычному»: `DivergingMeter`-lite + «×1,3»; «мало» when `posts < minPosts`.
- Phone: DataTable card density (title + status trailing + one meta line «Отдых 12 д ↓ · Вт 3 ноя 12:30 · ×1,3»); the mock's six labelled fields are the visual-check target — if the compact density loses «К обычному», build `RubricRowCard` locally from `RowCard` (decide at F2 shots; ≤ 1 fix round).

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first fetch | table/card skeleton, 8 rows | none | unchanged |
| empty (no data) | `items=[]` | `EmptyState` «Рубрик нет» (cannot happen after deploy; shows requestId-free text) | none | — |
| empty (filters) | filter/search hides all | «Ничего не найдено» | «Сбросить фильтры» | — |
| error/401/403 | common | — | retry | message |
| 409/202/unknown | n/a (read-only list) | — | — | — |
| 503 | not ready | as 6.2 | retry | — |

### 6.5 Rubric card `/rubrics/$key` (F2 base, blocks per stage)
Mock `card()`. Phone: a page with back link «Рубрики» + Telegram BackButton, tab bar unchanged. Header: back link, H1 title, sub-line (`rest` cadence · «с картинкой»/«только текст» · trigger), **per-rubric `Switch`** («Активна»/«На паузе»).
Blocks: (F2) key facts `StatGrid` — Отдых, Последний пост, Следующий (`Вс 1 ноя, 19:00`); notices `Banner` for `bank_exhausted` («Рубрика «Ребус» закончила банк и поставлена на паузу. Пополните банк.» — resumes by itself after a deploy with new entries), `cycle` rounds («Закончила банк и начала с начала (круг N). Пополните банк, иначе будет по кругу.»), `unavailable`, `breaker`; bank `ProgressBar` «Использовано 22 из 60»; «Последние выходы» (8 `SlotRow`s with `publicationId` links). (F3) `bet` block for 06: «Ставка открыта: герои…, патч …, опрос закрывается …» (read-only). (F4) «Внутренние правила»: `Panel` list of `innerRules` (title, detail, progress bar «74 из 126 героев уже были · осталось 52», «Заблокировано 3 за месяц»). (F5) fact «К обычному», «Сравнение постов» (`PostCompare`) and «Срезы рубрики» (`SliceList`), link «Все посты в «Сравнении»» → `/rubrics?tab=compare&mode=inside&rubric=<key>`, «О чём пишут в комментариях» (top topics). (F6) fact «Часы (Вс) 19:00 · выучено|вручную|по умолчанию», «История отдыха», `advice` line «Рекомендуется 10 д (изменение не применено)».
Pause flow: toggle off → `ConfirmDialog` «Поставить «<название>» на паузу?» — «Её не вышедшие слоты (N) отменятся. Другие рубрики не затрагиваются. Возобновить можно тем же переключателем.» «Да, поставить на паузу» / «Нет»; PATCH `{enabled:false, expectedVersion}` only after the confirm; resume = PATCH without confirm; result only from the response; toast with the server's next slot.

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | fetch | header + blocks skeleton | none | H1 |
| empty | no posts yet | «Постов пока не было» in «Последние выходы» + next slot | — | — |
| error | 5xx/network | `ErrorState` + requestId | retry | message |
| 404 | `RUBRIC_NOT_FOUND` / bad `$key` | «Такой рубрики нет» | «К рубрикам» | H1 |
| 401/403 | common | — | — | — |
| **409** | `STALE_VERSION` on PATCH | Banner conflict «Рубрика уже изменена. Показано актуальное состояние» ; card refetched; the owner's attempted toggle is **not** replayed silently | «Понятно» (dismiss), switch again | banner |
| saving | PATCH in flight | switch keeps old value, `aria-busy` | none | switch |
| unknown | n/a (rows of `unknown` slots link to publications) | — | — | — |
| young/few data | `posts < minPosts` | «мало» marker beside ×, text «меньше 3 постов — цифра не показатель» | — | — |

### 6.6 Сравнение (tab, F5) — two modes via `SegmentedControl` «Между рубриками / Внутри рубрики» (`?mode`)
**Между рубриками** (mock `compare()`): period 7 д/30 д/90 д; caption «Только Telegram · «обычный пост» — медиана канала». Left: ranking `RankRow`s (place, title link to card, `DivergingMeter`, «×1,9», «9п» via `pluralRu`), top 12, «… ещё N · худшие внизу» then the last 4; rubrics with `few` go into a muted group «Мало данных» (not ranked). Right (desktop two columns, phone stacked): **«Часы: день недели × час (МСК)»** `HeatGrid` 7×16 (08–23): cell number + intensity, ★ peak, dashed = пробный час (F6), legend lines under the grid (mock `legend`), caption «Просмотры и реакции на одном возрасте поста, × к обычному».
**Внутри рубрики** (mock `compareInside()`): `Select` of rubrics (option description «22 поста»), period 30 д / 90 д / Все посты, caption «Против обычного поста самой рубрики, а не канала»; four `StatTile`s — «Постов в расчёте» (14, meta «из 22, у остальных ещё нет охвата»), «Обычный пост рубрики» (×1,0, «медиана · у канала в целом ×1,4»), «Лучший» (×1,9 · Axe, 28 ноя), «Худший» (×0,5 · Sniper, 12 сен); then the same `PostCompare` + `SliceList` the card uses (written once). Default `rubric` = the rubric with most counted posts; none → `EmptyState` «Постов рубрик пока нет».
Rules (`model/slices.ts`, pure): slices with fewer than `minPosts` rows are marked «мало данных» and never labelled best/worst; best/worst = max/min × among non-few rows; a single non-few row is «лучший» only; ties keep list order; «×» printed with a decimal comma (`formatMultiple`).
States: loading (tiles + rows skeleton, `StaleRegion` on period/mode change), empty (no settled posts yet: «Охват появится через сутки после выхода поста»), error/401/403 common, 409/202/unknown n/a, `few` per row.

### 6.7 Комментарии (tab, F5 only)
Mock `comments()` is a sketch banner («источник не подключён») plus per-rubric cards and «Темы недели». Built only when C13 exists.

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | fetch | skeleton cards | none | — |
| not_connected | `state='not_connected'` | `EmptyState` «Комментарии не подключены» + what to do (add the bot as admin to the channel's discussion group; the owner reconnects the bot) | none | — |
| no_data | connected, none yet | «Пока никто не комментировал» | — | — |
| limited | few comments | Banner «Комментариев мало — выводы осторожные» + cards | — | — |
| ready | data | per-rubric card (title link, «31 комм.», tone word, quote if the DTO has one) + «Темы недели» (text + count) | — | — |
| error/401/403 | common | — | retry | message |
| 409/202/unknown | n/a | — | — | — |
Quotes are user text from Telegram: rendered as plain text in React (no `dangerouslySetInnerHTML`, no link autoformat), no author, no ids. Retention note shown only if the DTO has `retentionDays` (owner question on 7 days is open — **ждёт владельца**).

## 7. Frontend architecture of the slice

```
features/rubrics/
  index.ts                      public API: RubricsPage parts only what pages compose
  api/rubrics-api.ts            apiRequest fetchers (zod from contracts)
  api/rubrics-queries.ts        rubricKeys, queryOptions factories, polling options
  api/rubrics-mutations.ts      useSetScheduler, useSetRubricEnabled (retry:false, invalidate after server success, setQueryData from response)
  model/msk.ts                  RUBRICS_TZ, mskDate/mskClock/mondayOf/addDays/weekGrid (via @internationalized/date)
  model/merge-calendar.ts       real + forecast merge, day buckets, flags
  model/slot-badge.ts           SlotState → label/group/icon table
  model/locks.ts                lock code → Banner copy (+ lab link only in lab build)
  model/slices.ts               best/worst/few, formatMultiple
  model/list-filters.ts         state filter + counts + sort (key order)
  model/use-slot-announcer.ts   batched live announcements
  ui/calendar/ …                SchedulerSwitch, CalendarToolbar, MonthView, WeekBoard, SlotList, DayAgenda, SlotRow, SlotCard, ChangesFeed, Legend
  ui/list/ …                    RubricsToolbar, RubricsTable, RubricStatusPill, RestCell
  ui/card/ …                    CardHeader, KeyFacts, BankBlock, InnerRules, RestHistory, HoursBlock, BetBlock, RecentSlots
  ui/compare/ …                 CompareBetween, CompareInside, RankRow, HeatMap (wraps HeatGrid), PostCompare, SliceList
  ui/comments/ …                CommentsTab, CommentCard, TopicList
  ui/copy.ts                    feature copy (not ru.ts; code is dropped with the slice)
  tests/                        §12
pages/rubrics/RubricsPage.tsx, RubricCardPage.tsx   compose; no data logic (tab state in the URL)
routes/rubrics/index.tsx, routes/rubrics/$key.tsx
```
Rules: one responsibility per file, named exports, `PascalCase.tsx` components, kebab-case else, CSS Modules with tokens only (no raw colours, no ad-hoc sizes — the colour check `scripts/colors-only-in-tokens.test.mjs` guards it); no import from another feature (`rubric-samples`, `content-analytics`); titles from contracts `RUBRIC_TITLES`; text rendered as text; every effect cleaned (announcer timer; polling is TanStack's). Mutations: `retry:false`; `onSuccess` writes the response with `setQueryData` for status/card and invalidates calendar + list; no cross-feature invalidation (Публикации refresh by their own staleTime/navigation).

## 8. Mock → component map (`ui-mock/*.html`, all built from `app.js` + `mock.css`)

| Mock file (`R_SCREEN.*`) | Screen | Components |
|---|---|---|
| `schedule.html` (`calendar`) | Календарь, Месяц, desktop 1280 + phone 375 | `SchedulerSwitch`, `CalendarToolbar` (range, `SegmentedControl`, arrows, «Сегодня»), `CalendarMonthGrid` (D1) + `MonthDayCell`, `DayAgenda` (sticky right pane ≥1100 px, below the grid under it), `SlotRow`, `ChangesFeed`, `Legend` |
| `schedule-b.html` (`scheduleB`) | Календарь, Неделя | `WeekBoard`, `SlotCard`, `Legend` |
| `schedule-list.html` (`scheduleA`) | Календарь, Список | `SlotList` (`DaySection` + `SlotRow`); the «Состояния выключателя» block is the fixture matrix of §12 (not UI) |
| `rubrics.html` (`rubrics`) | Рубрики | `RubricsToolbar`, `RubricsTable` (`DataTable`), `RubricStatusPill`, `RestCell`, legend (↓ ↑ «мало») |
| `card.html` (`card`) | Карточка | `CardHeader` (+ `Switch`), `KeyFacts`, `PostCompare`, `SliceList`, `InnerRules`, `RestHistory`, `RecentSlots`, comments block |
| `compare.html` (`compare`) | Сравнение · между | `CompareModeSwitch`, period `SegmentedControl`, `RankRow` + `DivergingMeter` (D2), `HeatMap` (D3) |
| `compare-inside.html` (`compareInside`) | Сравнение · внутри | rubric `Select`, period `SegmentedControl`, `StatGrid/StatTile`, `PostCompare`, `SliceList` |
| `comments.html` (`comments`) | Комментарии | `CommentsTab`, `CommentCard`, `TopicList`, `EmptyState` for `not_connected` |
| shared shell (side nav, bottom bar «Ещё · Рубрики») | menu | `nav-items.ts`; the bottom-bar label «Ещё · Рубрики» is **not adopted** (shell keeps `data-current` on «Ещё»; changing the shell label is out of scope) |

Mock deviations (decided, not reopened): D1 «Нужно внимание» filter added for bank/breaker/capability states the mock has no home for; «Свои метки» button dropped (owner removal); «Отправлено» → «Опубликовано»; the mock's master meta «Фоновые задачи (Cron) включены» is shown only as a lock banner when off; the mock's «Комментарии» sketch banner becomes the real `not_connected` state; mock dummy numbers are not requirements (invented data). Mock design is used for layout and element set only; `mock.css` classes are re-expressed in CSS Modules.

## 9. `/lab` changes

- `features/rubric-samples/ui/RubricSamples.tsx`: titles from contracts `RUBRIC_TITLES` (delete the local table, lines 11–42), add `greeting_card` when it enters the key list; the REASONS block unchanged. It stays the DEV way to call one rubric (RUBRICS_SCHEDULER item 9).
- `pages/lab/LabPage.tsx`: tab «Рубрики» intro gets one sentence «Автопубликация рубрик — в разделе «Рубрики» (репетиция на DEV)». No new tab and **no rehearsal controls**: rehearsal is set by the server variable and run from the «Рубрики» page itself (switch + calendar in `mode='rehearsal'`), «Фоновые задачи» is its master Cron (Q4).
- `features/owner-settings/ui/BackgroundJobsPanel.tsx`: row `rubricScheduler: ['Планировщик рубрик', 'Репетиция расписания: слоты, сборка и выпуск в тестовый канал без ИИ.']` (C14).
- `scripts/check-no-lab.mjs`: unaffected (`/api/v1/rubrics` is not a lab route). Production build keeps `/rubrics`; the `/lab` code is still dropped.

## 10. Removal of the manual «Рубрики Telegram» (one cross-area commit with C15; frontend list)

Delete: `features/content-analytics/ui/RubricsPanel.tsx`, `ui/RubricsSettings.tsx`, `ui/PostRubricSelect.tsx`, `ui/Rubrics.module.css`, `model/rubrics.ts`, `tests/rubrics.test.tsx`.
Edit:
- `features/content-analytics/api/content-analytics-api.ts`: remove `getContentRubrics`, `createContentRubric`, `updateContentRubric`, `deleteContentRubric`, `getPostRubric`, `setPostRubric` and their contract imports (`contentPostRubricSchema`, `contentRubricSchema`, `contentRubricsSchema`, `ContentRubricInput`).
- `api/content-analytics-queries.ts`: remove keys `rubrics`, `rubricsOf`, `postRubric`, `RUBRICS_STALE_MS`, `contentRubricsQueryOptions`, `useSaveContentRubric`, `useDeleteContentRubric`, `postRubricQueryOptions`, `useSetPostRubric`.
- `index.ts` (2 exports: `RubricsSettings`, `PostRubricSelect`); `ui/AnalyticsBoard.tsx` (lines 7,10,22,113–117,149–151: the query, `rubricStats`, `showRubrics`, `RubricsPanel`; keep `onOpenSettings`, still used at :223); `pages/posts/PostEditPage.tsx` (import + `postSettings`), `features/posts/ui/PostEditor.tsx` (`postSettings` prop and its two render sites 278/284 — its only caller was the rubric select); `pages/settings/AnalyticsSourcesPage.tsx` (import, `<RubricsSettings />`, doc comment «и Telegram-рубрики»).
- **Do not touch**: `ItemScript.tsx:rubricOf` / `ItemDrawer.tsx` — they name AI **Reels-script formats**, a different meaning; `features/ai-settings` hypotheses «rubric» field — unrelated. After deletion, `rg -n "rubric" apps/frontend/src` must show only `features/rubrics`, `rubric-samples`, `pages/lab`, `pages/rubrics`, those two untouchables, and `BackgroundJobsPanel`.
- Docs (same commit): `docs/PAGE_MAP.md` lines 15 («source/rubric»), 16 («Telegram rubric pick»), 22 («Рубрики Telegram» in `/settings/analytics`), 23 (`/analytics` «Рубрики Telegram» block) — reworded; new rows `/rubrics`, `/rubrics/:key`; `docs/API_CONTRACTS.md` lines 193–195 deleted and the new rubric endpoints documented by the backend/contract author; `docs/PLAN.md:183–184` («Their results show in Аналитика → «Рубрики Telegram»») → «in Рубрики → Сравнение»; `docs/DECISIONS.md` 30.10.2026 row «Not done yet» → done (date of the commit); new `docs/design/ux/rubrics.md` (this plan's §5–6 distilled: state matrices, the mapping, MSK exception) + index line in `docs/design/UX_SPEC.md`; `docs/design/ux/shell.md` §1.1 menu list if it enumerates sections; `docs/FRONTEND_ARCHITECTURE.md` §2 only if features are enumerated (no change otherwise).
- Old tabs with the removed endpoints: `reload-on-stale-build.ts` already reloads a stale SPA; no shim.

## 11. Polling, budgets, security (summary)

Requests while the page is open and visible: status (30 s) + calendar (30 s / 5 min) = ≤ 4 GET/min, none hidden (verified by test). Forecast, list, card, compare, comments are on demand. No secrets or `initData` in any URL; no `localStorage`; text from the server (`reason.text`, `detail.message`, quotes, topics, titles) is always React text; links only from ids (`/publications?id=`, `/rubrics/$key`) built by the client, never from server URLs. Rubric `$key` and period params pass Zod before use. Switch and pause calls are not idempotency-keyed (idempotent by nature, `enabled` is a state); no retry on failure.

## 12. Tests (only the risky behaviour; skill `testing`) and fixtures

Fixtures: `src/test/rubric-fixtures.ts` — typed builders from contracts (`rubricStatus`, `rubricSlot`, `rubricCalendar`, `rubricForecast`, `rubricListItem`, `rubricCard`; stage-5 builders added then) with a state matrix mirroring the mock's «Состояния выключателя»; default handlers added to `src/test/msw.ts` (`onUnhandledRequest:'error'` already on); `e2e/support/mock-rubrics.ts` reuses the builders for the Playwright mock and the scenarios below.
Committed tests (all small, table-driven where possible):
1. `model/msk.test.ts` — MSK day bucketing: a slot at 21:30Z lands on the next MSK day; Monday-first 5-week grid; clamping; merge rule (real wins, forecast only after the real horizon, switch off → all forecast). *Risk: dates.*
2. `model/slot-badge.test.ts` — table over every `SlotState`: label/group; `sent` without `externalMessageId` is never «Опубликовано»; `ready`/`released`/`planned` never use success wording; `unknown` and `unresolved` expose no action. *Risk: false success.*
3. `tests/scheduler-switch.test.tsx` — (a) off→on and on→off only after ConfirmDialog «Да…», no PUT before; (b) while the PUT is pending the switch still shows the old value and no success text; (c) 500 → error with requestId, switch at server value; (d) `mode='unavailable'` → disabled switch, no PUT; (e) `locks` shown as banners while switch stays as stored; (f) per-rubric pause: confirm first, `STALE_VERSION` 409 → conflict banner, state refetched, toggle not replayed. *Risk: false claim / publishing control.*
4. `tests/unknown-slot.test.tsx` — a calendar row `unknown` shows «Требует проверки», the duplicate-risk text, a link to `/publications?id=…` and no button matching /повтор|отправ|отмен/i.
5. `tests/rubrics-polling.test.tsx` — fake timers: interval 30 s with a live slot, 5 min without, 5 s during `transition`; `focusManager.setFocused(false)` (hidden tab) → no request; unmount → no request. (AGENTS asks for this test.)
6. `model/slices.test.ts` — best/worst with ties, all-few, single row, `formatMultiple` (comma, rounding). *Risk: wrong numbers to the owner (F5).*
7. `tests/comments-text.test.tsx` (F5) — a quote containing markup renders as text, no element created. *Risk: injection.*
8. `tests/rubric-fixtures.test.ts` — every fixture builder output passes its contract schema (guards fixture/contract drift; one table).
9. `src/test/error-matrix.test.ts` — new rows for the four new reason pairs.
Deleted with the manual rubrics: `tests/rubrics.test.tsx`. Not tested (by rule): layout, copy, per-state rendering, query hooks that only fetch, the weekly-report block.
Playwright mock scenarios (`mockRubrics(page, scenario)`): `normal` (mock's 4-slot today incl. building, failed→replacement, skipped, moved), `off`, `forecast-only` (F1), `locked-cron`, `dev-unavailable`, `rehearsal`, `unknown-slot`, `bank-exhausted`, `capability-missing`, `breaker`, `empty`, `error503`, `slow` (skeleton). Comments: `not_connected`, `no_data`, `limited`, `ready`.

## 13. Visual-check and accessibility protocol (skill `visual-check`; owner memory: 375, 1280 **and 1920**; mocks are not DEV)

Per F-stage: add to `e2e/shots.ts` PAGES `/rubrics`, `/rubrics?view=week`, `/rubrics?view=list`, `/rubrics?tab=list`, `/rubrics/recruit_picks`, F5: `?tab=compare`, `?tab=compare&mode=inside&rubric=recruit_picks`, `?tab=comments`; add width 1920 for these paths only; `e2e/layout-stability.ts` list gets the same paths (`npm run layout:check`: no layout jump skeleton → data, at 375/1280). One contact sheet per stage (long edge ≤ 1100 px), ≤ 2 fix rounds; compare against the mock's six frames in `contact.png`. Scenarios above are captured for the states that changed (not every state × every width). Checks: no horizontal page scroll down to 320 (the heat-map scrolls only inside its labelled region); axe (wcag2a/aa/21aa/22aa) zero violations on `/rubrics` (each view), the list, the card, compare, comments; keyboard pass: Tab order tabs → switch → toolbar → grid (arrows, Enter selects) → agenda → feed; Esc closes the ConfirmDialog and returns focus to the switch; focus ring not under sticky bars; targets ≥ 44 px on phone (24 minimum elsewhere); `prefers-reduced-motion` stops the spinner; dark and light themes. Tooling gaps are reported `not_run`. After the owner's push to DEV: real-DEV look through the saved profile `.logs/chrome-dev-profile` (read-only on DEV data, act freely on DEV, never call `/auth/refresh` by hand), reported separately from the mock run.

## 14. Risks and assumptions

- A1 Removal timing: manual rubrics disappear with the first `/rubrics` build (F1), before real scheduler data exists; if the owner wants the old panel kept until the first real post, only §10 moves to F2 (one commit).
- RAC `Calendar` week-duration behaviour (D1 spike) — fallback grid costs ~1 day.
- `DataTable` narrow density may not carry six fields (mock) — local `RubricRowCard` fallback.
- Polling cost on a busy tab — bounded by §11; backend must serve C5 from a cache and C4 as plain row reads.
- Contract drift: rubric DTOs are large; fixtures validated by test 8; FE and BE ship as one Worker + assets, so no version skew except a stale tab (reload handler).
- Time: if the owner's Settings zone is not Moscow the section still shows МСК; only a one-line header mention exists (no per-user switch).
- `sent` proof: UI trusts `externalMessageId`; a backend projection that sets `sent` without it would show «Требует проверки» — intended fail-safe.
- Phone Mini App: month grid + agenda is the heaviest screen; keep agenda height reserved to avoid jumps; tab bar stays visible on the card.

## 15. Open owner questions (recommendation first)

- Q1 (carried over, **ждёт владельца**): keep comment texts 7 days? No UI work depends on the answer.
- Q2 Edit rest days from the card? Rec: no in v1 (scheduler adapts it; «На паузе» is the lever); a field (7–60, 409 keeps edits) is a one-file addition later.
- Q3 A «Пропустить этот слот» button in Календарь? Rec: no in v1 (switch + per-rubric pause cover it; avoids fighting the plan, N4).
- Q4 Rehearsal reset button on DEV? Rec: no (switch off/on cancels live slots and re-plans).
- Q5 «Рубрики» as a bottom-bar slot on phone? Rec: no, stays in «Ещё» (the three primary tabs are the daily ones).
- Q6 Remove the manual rubrics at F1 or at F2 (A1)? Rec: F1.

## 16. Definition of done per frontend stage

`npm run typecheck -w @alexeev/frontend`, `npm run test -w @alexeev/frontend` (with the stage's tests), `npm run verify:changed`; `npm run shots` + `npm run layout:check` evidence (or `not_run` with the reason); axe + keyboard findings; `git status --porcelain` only inside `apps/frontend/**`, `apps/contracts/**` (when the commit carries the contract), `docs/PAGE_MAP.md`, `docs/design/**`, `docs/PLAN.md`; report format of root AGENTS.md (≤ 20 lines: state, paths, checks, risks, `not_run`).
