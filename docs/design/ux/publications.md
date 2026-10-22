# §3.4–3.5 Публикации, инциденты и сверка

## 3.4 Публикации `/publications` (+ inspector)
- **Purpose:** find a send/schedule and act safely. **Primary:** «Опубликовать пост» in the header (renamed from «Создать публикацию»; opens a post select, then the post's publish screen `/posts/:id/publish`; drafts with something to send are offered too and are approved together with the send — owner, 18.10.2026). Secondary «Опубликовать серию» (owner, 22.10.2026): a dialog with 2–5 posts in order (↑ ↓ ✕, «Добавить пост»), the channel, the first post now or at a time, and the interval (10 мин – 3 ч, default 10 мин); drafts are approved on submit; a refusal names the post. A series row shows «Серия · 2 из 3» under its status, and «· ждёт пост 1» while the previous one has not gone out.
- **Views (tabs, URL):** Все · Запланированные · Отправленные · Ошибки (Ошибки = failed + unknown; badge count). The tabs map to the server status; search (post, channel, status label, time) and sort by time are the only controls: no Статус/Канал filters, search runs over loaded rows. Period «Сегодня»: **API need**.
- **Desktop:** header -> tabs -> Panel{ Toolbar, DataTable: Время (mono, tabular) · Пост (title + excerpt) · Канал · Статус · Сообщение (Telegram id link) } . No timezone note: times are in the owner zone, the zone is shown only in Settings.
- **Phone:** cards: title + chip; meta `7 окт., 12:00 · Канал`; Telegram link only in sheet. Drop the avatar/icon column.
- **Selection mode:** `Выбрать` in the panel header; checkboxes on final rows only (`sent`, `failed`, `cancelled`), at most 100; `SelectionBar` offers `Удалить` and `Снять выделение`. In-process, waiting and `unknown` rows cannot be selected. Confirmation names the count and states that Telegram messages stay and attempt/incident history is retained. Partial results keep refused rows selected.
- **Inspector / sheet:** header (title, status chip), pipeline (steps muted for future, no clock icons), facts (Канал, Время in the owner zone, Telegram message link), linked post link, «Технические данные» disclosure (IDs, attempts, request id), footer actions by status:
  | Status | Footer |
  |---|---|
  | scheduled, queued, retry_wait | «Перенести», «Отменить публикацию» (named confirm; undo not possible once cancelled -> confirm names channel and time) |
  | preparing, sending | none; note «Идёт отправка» + auto refresh |
  | sent | «Открыть в Telegram», «Удалить запись» |
  | failed | «Открыть пост», «Удалить запись»; no retry (no API) |
  | unknown | **only «Проверить в Telegram и закрыть»** (reconciliation), warning text «Не повторяйте отправку, пока не проверили канал» |
  | cancelled | «Открыть пост», «Удалить запись» |
- Deleting a final publication removes its Studio record only: a sent Telegram message stays in the channel; attempt history and incidents remain available, detached from that publication record. Unknown and in-flight results are never deletable.
- Auto-refresh while any row is in process (as today), silent, no skeleton flash.

## 3.5 Инциденты `/incidents` and reconciliation
- **Purpose:** resolve what broke. **Primary:** the first row's action («Проверить» for `unknown`); no header primary. Badge in nav = open count.
- **Layout (both):** header -> Tabs Открытые · Закрытые (one control) -> Panel{ Toolbar: Select «Тип» + search? (no, ≤ dozens of items: only the Select) , rows }. Rows in a Panel. Row: chip, title, reason, channel, time, actions: `unknown` -> «Проверить» (primary-looking), failed -> «Открыть» + «Закрыть». «Детали» disclosure keeps technical code + `CopyButton`.
- **Phone:** cards with one primary full-width button per card; secondary «Закрыть» as text button in `⋯`; two stacked segmented controls removed.
- **Resolve semantics:** `publish_unknown` closes only through reconciliation (`resolve-unknown`), never with «Закрыть». Opening a failed publication's drawer acknowledges its `publish_failed` incident (owner, 22.10.2026: the error was seen, so the sidebar badge drops it); an unknown one stays open. «Закрыть» on `publish_failed` only acknowledges: it never changes the publication, retries or republishes. Closed rows: «Открыть» only, no reopen. Reason text per `code`: `apps/frontend/src/features/incidents/model/incident-view.ts`; `requestId`/`jobId` in «Детали», never raw `details`. Polling 30 s only while the tab is visible.
- **States:** empty open: «Всё под контролем. Открытых инцидентов нет.» (positive, no CTA); closed empty: «История пуста».
