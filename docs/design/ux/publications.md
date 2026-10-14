# §3.4–3.5 Публикации, инциденты и сверка

## 3.4 Публикации `/publications` (+ inspector)
- **Purpose:** find a send/schedule and act safely. **Primary:** «Опубликовать пост» in the header (renamed from «Создать публикацию»; opens PublishDialog with a post select, API exists: `postId` + `destinationId`).
- **Views (tabs, URL):** Все · Запланированные · Отправленные · Ошибки (Ошибки = failed + unknown; badge count). The tabs map to the server status; search (post, channel, status label, time) and sort by time are the only controls: no Статус/Канал filters, search runs over loaded rows. Period «Сегодня»: **API need**.
- **Desktop:** header -> tabs -> Panel{ Toolbar, DataTable: Время (mono, tabular) · Пост (title + excerpt) · Канал · Статус · Сообщение (Telegram id link) } , timezone note moved to the Panel header strip right («Europe/Chisinau, UTC+3»), not a paragraph.
- **Phone:** cards: title + chip; meta `7 окт., 12:00 · Канал`; Telegram link only in sheet. Drop the avatar/icon column.
- **Selection mode:** `Выбрать` in the panel header; checkboxes on final rows only (`sent`, `failed`, `cancelled`), at most 100; `SelectionBar` offers `Удалить` and `Снять выделение`. In-process, waiting and `unknown` rows cannot be selected. Confirmation names the count and states that Telegram messages stay and attempt/incident history is retained. Partial results keep refused rows selected.
- **Inspector / sheet:** header (title, status chip), pipeline (steps muted for future, no clock icons), facts (Канал, Время local + UTC offset, Telegram message link), linked post link, «Технические данные» disclosure (IDs, UTC, attempts, request id), footer actions by status:
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
- **Resolve semantics:** `publish_unknown` closes only through reconciliation (`resolve-unknown`), never with «Закрыть». «Закрыть» on `publish_failed` only acknowledges: it never changes the publication, retries or republishes. Closed rows: «Открыть» only, no reopen. Reason text per `code`: `apps/frontend/src/features/incidents/model/incident-view.ts`; `requestId`/`jobId` in «Детали», never raw `details`. Polling 30 s only while the tab is visible.
- **States:** empty open: «Всё под контролем. Открытых инцидентов нет.» (positive, no CTA); closed empty: «История пуста».
