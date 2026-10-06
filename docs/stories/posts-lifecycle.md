# Posts lifecycle: leave, delete, cancel, archive

Status: spec for review (UX). Not implemented. Owner words: leaving the editor forces a save/approve decision; wants to delete posts, delete or cancel publications; published posts go to an Archive for ~30 days, then are deleted.

## 1. Audit (severity 0 none … 4 blocker)

| # | Task | Finding | Sev | Evidence |
|---|---|---|---|---|
| A1 | Create a post and leave | Any unsaved edit opens a modal «Выйти без сохранения?» with "Остаться" / "Выйти без сохранения". The owner must decide between losing text and staying to press Save. Nothing saves automatically. | 4 | `use-leave-guard.ts:9-12`, `PostEditor.tsx:225-235`, `copy.ts:111-116` |
| A2 | Leave a new, never-saved post | A new post exists only after pressing «Создать»; a half-written draft cannot be left without loss. | 3 | `use-post-editor.ts:127-134`, `PostEditor.tsx:174-182` |
| A3 | Approve is a one-way trap | Approved post is read-only, no "back to draft". Approve sits next to Save and looks like the "finish" action. | 2 | `use-post-editor.ts:61`, `PostEditor.tsx:120-135,184-190` |
| A4 | Delete a draft/post | No delete anywhere: list rows only open the post; editor has no delete. API has none. | 4 | `PostsList.tsx:134`, `posts.ts:37-79` |
| A5 | Cancel a scheduled publication | Works only inside a drawer opened from the Publications table; not reachable from the post page; reschedule/cancel are two buttons in the drawer footer. A disabled-looking hint replaces them for final statuses. | 3 | `PublicationDrawer.tsx:273-303`, `PublicationTable.tsx:100` |
| A6 | Remove a failed/cancelled/sent publication from the list | Impossible; the list only grows. No delete API. | 3 | `publications.ts` (cancel/reschedule only) |
| A7 | Find a published post | Posts list filters only Все/Черновик/Одобрен; a post never changes status after publishing, so published posts stay mixed with live ones. | 4 | `PostsList.tsx:38-42`, `posts.ts:6` |
| A8 | Status vocabulary | Post status is editorial only (`draft|approved`); owner's "scheduled/published" come from publications, but the post list shows neither. | 3 | `posts.ts:5-6`, `PostsList.tsx:62` |

## 2. Lifecycle as the owner sees it

Draft → Approved → Scheduled → Published → Archive → auto-deleted after 30 days.

Editorial status stays `draft | approved`. "Scheduled / Published / Archive" are derived from the post's publications (D1 is the truth). Archive is a stored fact, not a UI guess (see API needs).

Derived list state of a post (first match wins):
1. Archived: `archivedAt` set.
2. Has a publication in `sending`, `unknown`, `preparing`: «Отправляется» / «Нужна сверка» (needs attention, never archived).
3. Has a publication in `scheduled|queued|retry_wait`: «Запланирован» (+ nearest time).
4. `approved` without live publications: «Одобрен».
5. `draft`: «Черновик».

Rules (recommended defaults):
- **When it moves to Archive:** when the post has at least one `sent` publication and no publication is still active (`scheduled, queued, preparing, sending, retry_wait, unknown`). Moved by the server (on the sent transition or the daily Cron), not by the browser. Reason: a post with a pending second channel must stay actionable; `unknown` must stay visible until reconciled.
- **Several publications:** the post stays out of Archive until the last active one is final. `failed`/`cancelled` publications do not block archiving if at least one is `sent`. A post whose publications are all `cancelled/failed` (none sent) is NOT archived; it returns to «Одобрен» and the owner may reschedule or delete it.
- **If a new publication is created for an archived post:** disallowed from the archive (restore first).
- **Restore:** yes, within 30 days, «Вернуть из архива» → post returns as `approved` (keeps text, history of publications). Restoring never resends anything. Archived posts are read-only otherwise.
- **During the 30 days:** Archive tab shows title, excerpt, destinations, sent time, «Удалится через N дн.»; opens the read-only post page with its publication history and the Telegram message id/link. Row menu: «Вернуть из архива», «Удалить сейчас».
- **What "deleted" removes (post, manual or automatic):** the post and its final publication records (sent/failed/cancelled) from D1. It never touches the Telegram message (owner decision 06.10.2026, §10). Audit/incident entries of an `unknown` publication are never auto-deleted; a post with such a publication is not deletable.
- **Day 30:** counted from `archivedAt`. Cron deletes in bounded batches; a failed batch retries next tick; deletion is idempotent.

## 3. Where each action lives

| Action | List row (⋯ menu / swipe-free) | Post page | Publication drawer / list |
|---|---|---|---|
| Open | row press | – | row press |
| Delete post | «Удалить» | «Удалить» (secondary, in the ⋯ menu of the header, not next to Save) | – |
| Cancel publication | «Отменить публикацию» if one scheduled publication, else opens the post's publications | In the «Публикации» block, per row | Drawer footer |
| Reschedule | – | per row in the block | Drawer footer |
| Remove final publication from list | – | per row ⋯: «Скрыть из списка» | drawer ⋯ |
| Restore / delete from archive | Archive row ⋯ | Archive post page header | – |

Same names everywhere: «Удалить», «Отменить публикацию», «Перенести», «Вернуть из архива». The post page gains a «Публикации» block (list of the post's publications with status badge and actions) so cancel is reachable in one step from the post. The same ⋯ menu exists at 375 px (44 px targets); Mini App has identical actions and uses the Telegram BackButton for leaving (see §4).

Navigation (posts-related only): Posts has three tabs «Все · Черновики · Архив» via URL `?view=` (draft/approved/scheduled listed in «Все» with status badges; filter chips «Черновик / Одобрен / Запланирован»). Publications keeps the full list; a post link from each publication row and a publication link from each post. Dashboard: out of scope.

## 4. Flow: leave the editor (autosave)

Principle: leaving is always free; drafts save themselves.

- **Autosave:** a draft (new or existing, status `draft`) is saved automatically 1.5 s after the last keystroke and on blur, on route leave, tab hide (`visibilitychange`) and Mini App close. The first autosave of a new post creates it (needs ≥1 non-space character in title or body; an untouched empty form creates nothing). Same revision/409 rules as manual save.
- **Indicator** (always visible next to the title, `aria-live=polite`): «Не сохранено» → «Сохраняем…» → «Сохранено, 14:32» → on failure «Не удалось сохранить. Повторить» (button). Buttons «Сохранить» is removed as primary; `Ctrl/Cmd+S` still forces a save.
- **Leave with no guard when:** state is Saved, or an autosave completes within a 2 s wait on leaving (navigation proceeds after the save resolves; indicator shows «Сохраняем…» meanwhile).
- **Confirm is still shown only when work would really be lost:** the last autosave failed (offline, 413, 5xx) or a 409 conflict is unresolved. Dialog: «Не удалось сохранить изменения» / «Последние правки ещё не сохранены на сервере. Если выйти, они пропадут.» Buttons: «Повторить и выйти» (primary), «Выйти без сохранения» (danger), «Остаться». Esc = «Остаться».
- **Toast on leaving after autosave:** «Черновик сохранён» (only when the leave triggered a save).
- **Approved posts:** read-only, never a guard.
- **Approve:** stays an explicit button, never part of leaving. Dialog text unchanged. The Approve button is available only if the draft is saved; it triggers a save first.
- **Empty new post:** leaving silently, nothing created.
- **Browser tab close:** `beforeunload` only in the failure case above.
- **Focus:** after the dialog «Остаться» → focus returns to the field last edited; after a leave, focus goes to the page heading of the target page.

Priority A3 change (optional, recommended): allow «Вернуть в черновик» for an approved post that has no active or sent publication, so Approve is not a trap (API need).

## 5. Flow: delete post

Availability from DTO (derived from post + publications):

| Post state | Delete |
|---|---|
| draft, approved without publications | yes |
| has `scheduled|queued|retry_wait` publication | yes, but dialog explains the publications will be cancelled first (server does both atomically: cancel then delete) |
| has `preparing|sending|unknown` | no. Row menu item disabled with reason «Идёт отправка» / «Нужна сверка результата» + link to the publication |
| archived | yes («Удалить сейчас»), confirm |

Confirmation type (owner decision 06.10.2026: **every delete is confirmed**, no undo-only deletes):
- Draft or approved without publications: confirm dialog «Удалить пост «{название}»?» / «Пост будет удалён без возможности восстановления. Сообщения в каналах не удаляются.» Buttons «Удалить» (danger) / «Не удалять». Focus after success: the next row (or the previous when last); on the post page, navigate to the list and focus the heading.
- Post with live scheduled publications, or any archived/sent post: confirm dialog (irreversible, public side effects possible). Title «Удалить пост «{название}»?». Description with scheduled: «Будут отменены запланированные публикации: {N}. Первая: {канал}, {дата}. Сообщения в каналах не удаляются.» Without scheduled: «Пост и записи о его публикациях будут удалены без возможности восстановления. Сообщения в каналах не удаляются.» Buttons «Удалить» (danger) / «Не удалять». Pending state «Удаляем…». On success toast «Пост «{название}» удалён».
- Errors: 409 state changed → dialog closes, banner «Состояние поста изменилось. Обновили данные.» and the actions re-derive from the fresh DTO; 5xx → inline error in dialog with «Повторить», nothing removed (never optimistic for scheduled/sent).

## 6. Flow: cancel / hide publications

- **Cancel:** available only for `scheduled|queued|retry_wait` (existing `publicationActions`). Dialog stays (public effect): «Отменить публикацию?» / «Пост «{название}» не будет отправлен в «{канал}» {дата}. Сам пост останется.» Buttons «Отменить публикацию» (danger) / «Не отменять». Success toast «Публикация отменена», status badge «Отменено» in place. Focus: the same row's ⋯ button. Never optimistic.
- `sending`, `preparing`: no actions, hint «Идёт отправка, отменить нельзя». `unknown`: no cancel, no delete; button «Сверить результат» (reconciliation flow; currently disabled stub).
- **Remove from list:** for `cancelled` and `failed` publications: «Скрыть из списка» / «Удалить запись» removes the record from D1 (post stays). Confirm dialog «Удалить запись о публикации?» / «Пост останется. Сообщение в канале не удаляется.» Buttons «Удалить» / «Не удалять». For `sent`: not removable while the post is not archived (history of what went out); gets removed with the post. For `unknown`: never.
- Owner phrase "delete a publication" is therefore: cancel (scheduled), remove record (cancelled/failed), and nothing for sent/unknown beyond deleting the whole post.

## 6a. Bulk selection and delete

Owner decision 06.10.2026: the owner can select several rows and delete them at once, especially in the Archive.
- Lists with bulk delete: Posts («Все», «Черновики», «Архив») and Publications (only `cancelled|failed` rows are selectable).
- Desktop: a checkbox column; the header checkbox selects all rows on the loaded page, and a link «Выбрать все {N}» selects every row that matches the filter. Mobile: long-press or a «Выбрать» button switches the list into selection mode with checkboxes on cards.
- When something is selected, a bar shows «Выбрано: N», «Удалить» (danger) and «Снять выделение». In the Archive it also shows «Вернуть из архива».
- Rows that cannot be deleted (`sending|preparing|unknown`) cannot be selected, and a tooltip says why. Rows with scheduled publications can be selected, and the dialog counts the publications that will be cancelled.
- Confirm dialog: «Удалить {N} постов?» / «Будут отменены запланированные публикации: {M}. Сообщения в каналах не удаляются. Восстановить нельзя.» Buttons «Удалить {N}» / «Не удалять».
- Result: the server processes the batch with bounded size (≤ 100 per request) and reports per item. Toast «Удалено: N» or, on a partial result, «Удалено: N из M. Не удалось: K» with «Показать», which keeps the failed rows selected with their reasons. Never optimistic.
- Keyboard: Space toggles a row, Shift+click selects a range, Esc clears the selection. Selection survives pagination but not a filter change.

## 7. Archive view

- Tab «Архив» in Posts (`/posts?view=archive`). Columns: Название, Каналы, Опубликовано, Осталось (дней). Sorted by publish time desc. Search works as in the list.
- Header note: «Опубликованные посты хранятся здесь 30 дней, затем удаляются.»
- States: loading skeleton; empty: «Архив пуст» / «Здесь появятся посты после публикации. Они хранятся 30 дней.»; error with «Повторить»; filtered-empty with «Сбросить».
- Last 3 days: «Удалится через N дн.» in warning tone with text, not color alone.
- Archived post page: read-only editor, banner «Пост в архиве. Удалится {дата}.» + «Вернуть из архива», «Удалить сейчас».
- Toast on restore: «Пост возвращён из архива»; focus on the post page heading.
- Move to archive is announced nowhere intrusive: the post leaves «Все»; the Archive tab shows a count.

## 8. Acceptance criteria

1. Given a new post with text typed, When the owner navigates away, Then the draft is saved, no dialog appears, toast «Черновик сохранён» shows, and the post is in the list.
2. Given a new post with empty title and body, When the owner leaves, Then no post is created and no dialog appears.
3. Given autosave failed (offline), When the owner leaves, Then the dialog «Не удалось сохранить изменения» shows with «Повторить и выйти», «Выйти без сохранения», «Остаться»; Esc keeps the owner on the page.
4. Given a draft was edited, When 1.5 s passes without typing, Then the indicator goes «Сохраняем…» then «Сохранено, HH:MM» and no layout shift occurs.
5. Given a draft without publications, When the owner chooses «Удалить» in its row menu, Then a confirm dialog names the post; «Не удалять» or Esc keeps it; «Удалить» removes it and shows toast «Пост «…» удалён».
6. Given a post with a `scheduled` publication, When the owner chooses «Удалить», Then a confirm dialog names the post and the number of publications to be cancelled and states that channel messages are not deleted; confirming results in both post and publication gone from lists.
7. Given a post with a publication in `sending` or `unknown`, Then «Удалить» and «Отменить публикацию» are disabled with a stated reason, and the server also answers 409 if forced.
8. Given a `scheduled` publication, When opened from the post page «Публикации» block, Then «Отменить публикацию» is one step away; after confirm the badge reads «Отменено» and focus returns to that row's menu button.
9. Given a `cancelled` publication, When the owner chooses «Удалить запись» and confirms, Then it disappears; the post remains.
9a. Given 3 archived posts selected, When the owner chooses «Удалить» in the selection bar and confirms «Удалить 3 поста», Then all 3 disappear and toast «Удалено: 3» shows; a post with a `sending|unknown` publication cannot be selected.
9b. Given a bulk delete where one item fails on the server, Then the toast reads «Удалено: N из M. Не удалось: 1», and the failed row stays selected with its reason.
10. Given a post whose only publication became `sent`, When the server processes it, Then within one Cron tick it appears in «Архив» and not in «Все».
11. Given a post with one `sent` and one `scheduled` publication, Then it stays in «Все» until the second is final; after the second is `sent` it moves to the archive.
12. Given a post with all publications `failed`/`cancelled`, Then it is not archived and shows «Одобрен».
13. Given an archived post 30 days after `archivedAt`, When Cron runs, Then the post and its publication records are deleted; a post with an `unknown` publication is never deleted.
14. Given an archived post, When the owner chooses «Вернуть из архива», Then it appears in «Все» as `approved`, nothing is sent, and the archive count decreases.
15. Given 375 px and Mini App, Then every action above is reachable with 44 px targets and the same labels; BackButton follows rule 1-3.
16. Given any destructive flow fails with 5xx, Then nothing is shown as removed and a retry is offered.

## 9. API needs (for orchestrator; no endpoints/SQL here)

- Post delete (single and bulk, ≤ 100 ids per request, per-item result): hard delete after confirmation; revision-checked; refuses when any publication is `preparing|sending|unknown`; cancels live `scheduled|queued|retry_wait` ones in the same transaction; reports what it cancelled.
- Publication record removal for `cancelled|failed` (single and bulk); refused for `sent` (unless via post delete), `unknown`, active ones.
- Post DTO additions: `archivedAt`, derived summary (`publicationSummary`: counts by status, nearest `scheduledAt`, destinations, last sent time), `autoDeleteAt`. Post list needs a view filter: live / archive; count of archived.
- Archive: move to archive on last-active-final with ≥1 `sent`; restore operation (back to `approved`); daily bounded purge Cron for `archivedAt + 30d`; purge keeps `unknown` incident/audit data.
- Optional: unapprove (approved → draft) when no active/sent publication.
- Autosave: draft update must tolerate frequent small PATCHes; first-save creation needs idempotency (existing key) per editor session so autosave retries do not create duplicates.
- List publications of a post (exists via `postId` filter).
- Retention constant (30 days) server-side config, not in the browser.

## 10. Open owner decisions

1. **Decided (owner, 06.10.2026):** deleting or archiving in the admin never touches the Telegram channel (no deleteMessage). Dialogs state it. A separate "Удалить из канала" action is possible future scope, not part of this spec.
2. **Archive trigger:** at least one sent and none active (recommended) vs. all publications sent.
3. **30-day clock** from `archivedAt` (recommended) vs. from first send time.
4. **Restore from archive** (recommended yes) vs. none.
5. **Decided (owner, 06.10.2026):** every delete is confirmed; bulk select + delete is required, especially in the Archive (§6a).
6. **Allow unapprove** (recommended yes, when nothing sent/active).
7. Retention of `unknown`-linked data: keep until reconciled (recommended).
