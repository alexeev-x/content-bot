# Dashboard «Обзор» and «Инциденты»: one control desk

Owner (paraphrased from Russian): fill the empty dashboard and the placeholder «Инциденты» as one control desk: what goes out today, what broke, what needs my attention. One owner, Telegram channels. Status: spec for review, not validated with users. Related: `docs/stories/dashboard-system-status.md` (strip), `docs/IMPLEMENTATION_PLAN.md` step 6 («Сегодня», no KPI wall), `docs/PAGE_MAP.md` rows `/` and `/incidents`.

## User story
As the owner I open `/` and within one screen see what is still going out today, which publications or checks need me, and what happened last; from there I reach the exact place to fix each problem. `/incidents` is the full list behind the «Требует внимания» block, with history.

## Facts / assumptions / open decisions
Facts (read in repo):
- `incidents` rows exist (`kind` `publish_failed` | `publish_unknown`, `code`, `publication_id`, `job_id`, `created_at`, `resolved_at`, `details` ≤1 KB metadata). Written in the same batch as the job state change. Partial index `incidents_open_idx` serves the open list only; resolved history has no index.
- `resolve-unknown` (`POST /publications/{id}/resolve-unknown`) already sets `incidents.resolved_at` for the publication's job in the same batch. Nothing else sets `resolved_at` today.
- `failed` publications have no retry or reschedule in the contract (reschedule: scheduled/queued/retry_wait only). Owner Telegram alerts for new incidents already exist (`app/notifications/alert-owner-of-incidents.ts`, one alert per incident); the open list is the place to act on them.
- Cron last run is not stored; the strip story forbids showing it until the server supplies it. Bot API has no views or reach.
- Drawer reconciliation lives at `/publications?id=<id>`.

Assumptions: one owner, one timezone per session (`Intl` of the browser, shown with UTC offset); channels count is small (≤10).

## Scope
In (MVP, one slice, dashboard first, then incidents):
- `/` blocks: «Требует внимания», «Сегодня», «Ближайшие», «Недавно отправлено».
- `/incidents`: list of open and resolved incidents, filter, row actions, «Закрыть» for failed incidents.
- Backend: `GET /api/v1/dashboard`, `GET /api/v1/incidents`, `POST /api/v1/incidents/{id}/resolve`.
- Replace both stub pages; remove «в разработке» for these two.

Out (deferred): views/reach/analytics (no data source); KPI cards and sparklines (rejected: one owner, a handful of items per day, numbers do not drive a decision); Cron last-run check; retry/reschedule of `failed` publications; incident grouping; auto-polling on the dashboard; week heatmap (see open question 3); stale sources (no sources module yet).

Channel member count: **left out.** `getChatMemberCount` is one Bot API subrequest per channel (Free plan: 50 per invocation, shared with the 10 ms CPU budget), and a cached value needs a new D1 column plus a refresh job. It supports no decision in this story. Revisit with Analytics.

## Dashboard `/` — page spec
Purpose: the owner sees today's queue and anything broken in one screen, with one action per item.
Title/H1: «Обзор — ALEXEEV Studio»; focus moves to H1 on route change. Strip stays first (unchanged).
Data: new `DashboardDto` (below); reuses `PublicationStatus` and the canonical label mapping from skill `page-spec`; system checks from `useSystemStatus()`.
Permissions: owner only; 401 → login, 403 → «Нет доступа», no data.

### Blocks, in order
1. **System strip** (existing). When «Требует внимания» has items, the strip keeps only its healthy/count line (as the strip story says).
2. **«Требует внимания»** (hidden when empty; one line «Всё под контролем» appears instead, muted). A flat list, no cards, max 5 rows + link «Все инциденты (N)». Item sources, severity order: `unknown` publications (danger) → `failed` publications / open `publish_failed` incidents (danger) → failing system checks from the strip (warning, bot not connected etc.) → publications stuck: `scheduled`/`queued` with `scheduledAt` more than 10 min in the past (warning; a Cron or kill-switch symptom). Row: status badge (label from mapping, never colour alone), post title (1 line, ellipsis), channel name, time, one action button. Actions: unknown → «Проверить» → `/publications?id=<id>`; failed → «Открыть» → `/publications?id=<id>`; check → its own strip action; stuck → «Открыть». One incident and its publication show as one row (dedupe by publication).
3. **«Сегодня»**: publications with `scheduledAt` inside today in the owner's timezone, ascending, max 8 rows, then «Показать все» → `/publications` (shipped unfiltered: the publications list has no date filter yet; filtering to today needs a contract change in its own story). Row: time `14:30`, title, channel, status badge. Sent ones stay in the list with «Опубликовано» (so the day reads as a timeline). Empty: «На сегодня ничего не запланировано» + button «Запланировать» → `/posts`.
4. **«Ближайшие»**: next 5 publications after today (`scheduled`/`queued`/`retry_wait`), date + time + title + channel. Shown only if non-empty; no empty state of its own (the «Сегодня» empty state carries the call to action).
5. **«Недавно отправлено»**: last 5 `sent` publications (time, title, channel, link «Открыть в Telegram» only when a public `t.me` link can be built; otherwise none). Hidden when empty.

Heading order: H1, then H2 per block. Each block is a `section` with `aria-labelledby`. Rows are links/buttons, not clickable divs.

### State matrix (dashboard)
| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first fetch | skeleton per block (same heights), `aria-busy` | none | unchanged |
| empty (new install) | all blocks empty | «Пока нет публикаций» + «Создать пост» | create post | unchanged |
| empty (nothing today) | «Сегодня» 0 | «На сегодня ничего не запланировано» + «Запланировать» | go to posts | unchanged |
| partial/stale | refetch fails after data was shown | old data kept with line «Данные устарели · Обновить», `role="status"` | retry (safe GET) | unchanged |
| error | first fetch 5xx/network | «Не удалось загрузить обзор» + requestId | «Повторить» | message |
| 401 | session expired | redirect to login, cache cleared | n/a | login H1 |
| 403 | wrong owner | «Нет доступа», no data | back | message |
| 409 | n/a (read-only page) | n/a | n/a | n/a |
| scheduled/queued | n/a (no mutation here) | rows show returned status label | n/a | n/a |
| unknown | an `unknown` publication | row in «Требует внимания», badge «Требует проверки», text «Возможен дубль при повторной отправке» | «Проверить» (no retry on this page) | message |
Time: every time shows `14:30` plus the zone and UTC offset once in the block header («Europe/Chisinau, UTC+3»).
Refresh: refetch on focus and every 60 s only while the tab is visible and the dashboard is open; no polling elsewhere.

### Responsive
- 1280: two columns. Left (≈65%): «Требует внимания», «Сегодня». Right: «Ближайшие», «Недавно отправлено». Dense 40 px rows, no cards, one divider style.
- 375 / Mini App: single column in the same order; rows 44 px, title ellipsis, action as a 44 px button aligned right; time column stays left. 320 px: no horizontal scroll, action moves under the title only when the title would be under 12 characters.

### Copy (ru)
H1 «Обзор» · «Требует внимания» · «Сегодня» · «Ближайшие» · «Недавно отправлено» · «Всё под контролем» · «Все инциденты (N)» · «Проверить» · «Открыть» · «Запланировать» · «Показать все» · «Данные устарели · Обновить» · «Не удалось загрузить обзор».

## Incidents `/incidents` — page spec
Purpose: complete list of problems that need or needed a human, with the shortest path to fix each.
Title/H1: «Инциденты — ALEXEEV Studio»; sidebar item shows the open count (`aria-label` «N требуют внимания»), hidden at 0.
Data: `IncidentPageDto`; the linked publication summary comes inline (no per-row fetch).
Filters (URL state `?state=open|resolved&kind=...`): segmented «Открытые · Закрытые» (default Открытые); type chips «Все · Требуют проверки · Ошибки». Cursor pagination, 25 per page, «Показать ещё».

### Row anatomy
Line 1: type badge («Требует проверки» for `publish_unknown`, «Ошибка» for `publish_failed`), post title. Line 2 (muted): channel · reason text mapped from `code` · `occurredAt` in owner zone · attempts «попыток: N». Right: one primary action. Closed rows show «Закрыт 14:40» and, for unknown, the outcome is read from the publication status (no extra field). `requestId` and `jobId` are in an expandable «Детали» line (copyable), never raw `details` JSON.

Code → reason (ru): `SEND_UNCONFIRMED` «Ответ Telegram не получен, сообщение могло уйти» · `RETRIES_EXHAUSTED` «Лимиты Telegram: попытки исчерпаны» · `DESTINATION_UNAVAILABLE` «Бот потерял доступ к каналу» · `DESTINATION_DISABLED` «Канал отключён» · `CONTENT_INVALID` «Текст не принят Telegram» · `CHAT_MIGRATED` «Канал сменил адрес» · `BOT_UNAUTHORIZED` «Токен бота не принят» · `PUBLICATION_MISSING` «Публикация не найдена» · unknown code → «Ошибка <code>».

### Actions per type and resolve semantics
- `publish_unknown` (open): button «Проверить» → `/publications?id=<id>`, which opens the drawer with the reconciliation dialog (`resolve-unknown`: sent / resend / cancel). **No «Закрыть» here.** The incident is closed only by that action (server sets `resolved_at` in the same batch), so the list can never claim a send was checked when it was not. After return, the list refetches.
- `publish_failed` (open): button «Открыть» → publication drawer (read-only facts, last error). Secondary «Закрыть» = acknowledge: the owner has seen it (and fixed the channel or created a new publication). Acknowledge does not change the publication, does not retry, does not republish.
- Decision: a resolve endpoint is needed **only for failed incidents**, because nothing else closes them and the open list would grow forever (and the dashboard «Требует внимания» with it). It refuses `publish_unknown` with 409 `USE_RESOLVE_UNKNOWN`. Idempotent: closing an already closed incident returns 200 with the same row; a missing id is 404.
- Closed rows: link only («Открыть»); no reopen.
- A failed incident whose publication was meanwhile handled stays open until acknowledged (no hidden coupling).

### State matrix (incidents)
| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first fetch | 5 skeleton rows, `aria-busy` | none | unchanged |
| empty (open) | 0 open | «Открытых инцидентов нет» + link «К публикациям» | switch to «Закрытые» | unchanged |
| empty (closed) | 0 closed | «История пуста» | n/a | unchanged |
| empty (filter) | filter hides all | «Ничего не найдено по фильтру» | «Сбросить фильтры» | unchanged |
| error | 5xx/network | «Не удалось загрузить инциденты» + requestId | «Повторить» (safe GET) | message |
| stale | refetch fails after data | list kept, line «Данные устарели · Обновить» | refresh | unchanged |
| 401 / 403 | as dashboard | redirect / «Нет доступа» | n/a / back | login H1 / message |
| 409 | acknowledge on a changed row | not an error for repeat close; for `publish_unknown`: «Сначала проверьте отправку» + link | open publication | message |
| mutation pending | «Закрыть» pressed | button loading, row not removed until 200 (no optimistic success) | none | button |
| mutation failed | resolve 5xx | row stays, toast with requestId | «Повторить» (safe: idempotent) | button |
| scheduled/queued | n/a | n/a | n/a | n/a |
| unknown | `publish_unknown` open | badge «Требует проверки», warning «Не повторяйте отправку, пока не проверили канал» | «Проверить» | message |
Polling: 30 s only while the tab is visible (FRONTEND_ARCHITECTURE §state), paused otherwise.

### Responsive
- 1280: table-like list, columns: type, post+reason, channel, time, action; 40 px rows; filters on one line above.
- 375: each incident is a two-line row (no card chrome), action buttons 44 px full row width under the text when two actions exist; filters: segmented control full width, type chips horizontally scrollable inside their own container only.

### Copy (ru)
H1 «Инциденты» · «Открытые» · «Закрытые» · «Все» · «Требуют проверки» · «Ошибки» · «Проверить» · «Открыть» · «Закрыть» · «Закрыт 14:40» · «Детали» · «Показать ещё» · «Сбросить фильтры» · «К публикациям». Toast on close: «Инцидент закрыт».

## API needs (data and operations)
Reuse: `PublicationStatus`, page/cursor DTO, `ApiErrorDto`, `resolve-unknown`. New contracts via skill `contract-change` (contracts, backend, frontend, contract tests in one PR).

1. **GET `/api/v1/dashboard`** (query: `from`, `to` as UTC instants for the owner's "today", computed by the client; server never guesses the zone). Returns: `attention[]` (≤5: `kind` unknown|failed|stuck, `publicationId`, `incidentId?`, `code?`, `postTitle`, `destinationName`, `scheduledAt`, `occurredAt`), `attentionTotal`, `today[]` (≤8: `publicationId`, `scheduledAt`, `status`, `postTitle`, `destinationName`), `todayTotal`, `upcoming[]` (≤5, same shape), `recentSent[]` (≤5: same plus `sentAt` = `updatedAt`), `generatedAt`. System checks stay on their own existing health/bot endpoints. Post title is truncated to 120 chars server side; no post body.
   D1 budget: one `db.batch` of **5 statements**: (a) open `unknown`/`failed` publications + open incidents via `incidents_open_idx`, LIMIT 6; (b) stuck scheduled/queued past due, LIMIT 6; (c) today range with COUNT in a bounded subquery, LIMIT 9; (d) upcoming LIMIT 5; (e) recent sent LIMIT 5. Titles and destination names are joined in the same statements (no per-row lookups). Total 1 round trip, 5 of 50 statements; every SELECT has LIMIT and an EXPLAIN-checked index (pin in a test as `bot-entry-point.test.ts` does). Needs an index check for (c)/(d)/(e) by `scheduled_at` / `status`; add a migration only if EXPLAIN shows a scan.
2. **GET `/api/v1/incidents`** (query: `state` open|resolved, `kind`, `cursor`, `limit` ≤50, default 25). Items: `id`, `kind`, `code`, `createdAt` (as `occurredAt`), `resolvedAt?`, `requestId?` (from `details` when stored), `jobId`, `attemptCount` (from `job_attempts`, `COUNT` bounded), `publication` {`id`, `status`, `postTitle`, `destinationName`, `scheduledAt`}. Pagination `{items, nextCursor}` keyed `(created_at, id)`.
   D1 budget: **1 statement** (join incidents → publications → posts/destinations, attempts as a bounded correlated count), LIMIT n+1. Open filter uses `incidents_open_idx`. The **resolved** filter has no index: add partial index `incidents_resolved_idx (resolved_at DESC, id DESC) WHERE resolved_at IS NOT NULL` in a migration (skill `d1-migration`) and EXPLAIN-pin both. Open count for the sidebar badge comes from `attentionTotal`/an `openCount` field on the page DTO (existing bounded `countOpenIncidents`, +1 statement, cap 99).
3. **POST `/api/v1/incidents/{id}/resolve`** (no body; `Idempotency-Key` not needed, naturally idempotent). 200 returns the incident item with `resolvedAt`. Errors: 404 `NOT_FOUND`; 409 `CONFLICT` with `details.reason` `USE_RESOLVE_UNKNOWN` (kind `publish_unknown`); 401/403. Writes the incident and one audit row in one guarded batch (`UPDATE … WHERE id=? AND kind='publish_failed' AND resolved_at IS NULL`, then check changes; zero changes → re-read to answer idempotently). 2–3 statements.

Security: server revalidates all input with Zod and the owner session; `details` is never returned raw.

## Acceptance criteria
1. Given 2 publications today (one `sent` 09:00, one `scheduled` 18:00, owner zone UTC+3), When `/` opens, Then «Сегодня» lists both ascending with «Опубликовано» and «Запланировано» and the header shows the zone and offset.
2. Given a publication in `unknown`, When `/` opens, Then «Требует внимания» shows a row with «Требует проверки» and «Проверить», no retry or cancel control exists on the page, and «Проверить» navigates to `/publications?id=<id>`.
3. Given an open `publish_unknown` incident, When `/incidents` opens, Then the row has «Проверить» and no «Закрыть»; after `resolve-unknown` succeeds in the drawer and the owner returns, the incident is absent from «Открытые» and present in «Закрытые» with a closed time.
4. Given an open `publish_failed` incident with code `DESTINATION_UNAVAILABLE`, When the owner presses «Закрыть», Then the button shows loading, the row stays until a 200, then it moves to «Закрытые» with toast «Инцидент закрыт» and the publication stays `failed`.
5. Given `POST /incidents/{id}/resolve` for a `publish_unknown` incident, Then the response is 409 with `details.reason` `USE_RESOLVE_UNKNOWN` and the incident stays open.
6. Given the same «Закрыть» sent twice (two tabs), Then both return 200 and exactly one audit row exists.
7. Given nothing is open, When `/` opens, Then no «Требует внимания» list is shown, one muted line «Всё под контролем» is, and `/incidents` shows «Открытых инцидентов нет» with the link «К публикациям».
8. Given the dashboard request returns 500, When `/` opens first time, Then the page shows «Не удалось загрузить обзор», the requestId and «Повторить»; no block shows zeros or empty states.
9. Given data was shown and the next refetch fails, Then old data stays and «Данные устарели · Обновить» appears with `role="status"`.
10. Given 375 px width, Then `/` and `/incidents` have no horizontal page scroll, all actions are ≥44 px high, and the block order is unchanged.
11. Given any dashboard request, Then it issues one D1 batch of at most 5 statements, each with LIMIT, and the EXPLAIN test shows no full scan of `publications` or `incidents`; the response contains no post body and no incident `details`.
12. Given 30 open incidents, Then `/incidents` shows 25, «Показать ещё» loads the rest by cursor without duplicates, and the sidebar badge reads «30»; at the cap the server returns 99 meaning "99 or more" and the badge reads «99+».

## Open questions (recommended default)
1. Does «Закрыть» on failed incidents need an owner-confirmed outcome (note field)? Default: no, one tap; the audit row records who and when.
2. Stuck rule threshold (scheduled past due by 10 min)? Default: 10 min, constant on the server, no setting; Cron runs every minute so 10 min means a real fault.
3. Week-day emptiness strip (empty days of the week)? Default: deferred. It needs a per-day count (`summarizeRange` exists), but with one owner the «Ближайшие» list already shows gaps; add only if the owner misses it.
4. Telegram link in «Недавно отправлено»? Default: show only for public channels with a username (derive `t.me/<username>/<id>`), otherwise omit; no extra API call.
5. Owner Telegram alert for new incidents? Default: out of this slice (publishing/notification decision for the owner); the badge and block are the only signal for now.
6. Should a `failed` publication get retry/reschedule from the incident row? Default: no; needs a contract and a duplicate-risk review (`publishing-reliability`), separate story.
