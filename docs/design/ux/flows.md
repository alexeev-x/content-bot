# 4. Key flows

Common: every step names its exit (Esc / back / close) and nothing blocks leaving except a failed save.

### 4.1 Create post -> schedule/publish (current flow and planned UI)

For the target 17.10.2026 composer, see [post-composer.md](post-composer.md). “Редактор / Опрос / Настройки” is a **planned UI**; emoji and AI improvement are also **new work**, native poll requires a new API.

1. Enter from `/posts/new` or a post's editor. New post starts with a single text body, **no title**; empty untouched form creates nothing. Existing legacy titled posts retain their title.
2. Type/format text; optional media is added **below the editor**; autosave shows real state. The Telegram preview shows **media above caption**. Editing error/offline/stale revision never silently overwrites text.
3. Optional proposed “Улучшить через ИИ”: choose a mode and text scope → wait for paid suggestion → compare “Было/Стало” → only an explicit “Применить” changes editable body; cancellation never changes content or publishes.
4. Press **“К публикации”**. This saves the draft and navigates to the **existing** `/posts/:id/publish` page; do not move channel/now/schedule to another unimplemented backend flow.
5. On the publication page choose destination and now/schedule, and explicitly confirm. The backend approves the current revision and follows the usual idempotent send/scheduling path. `202`/queued does not mean `sent`; an `unknown` publication requires manual reconciliation, never blind retry.
6. Back/Esc on non-confirmed send returns without sending; already scheduled publication is cancelled via existing guarded actions, not an imagined undo.

Checks: no new title in outgoing Telegram text; no AI-induced implicit approval; media caption length validated; scheduled and sent statuses use server values; API change for polls comes separately.

### 4.2 Find a publication -> inspect -> safe action
1. Публикации -> tab (e.g. Запланированные) -> search/filter. 2. Row -> inspector (URL `?id=`). 3. Read facts. 4. Action per 3.4 table: Перенести (dialog with date-time, shows old -> new), Отменить публикацию (confirm). 5. Row updates from the server response; toast with «Отменено» (no undo promise because cancel is not reversible; reschedule available only from posts: say so in confirm copy: «Её можно будет запланировать заново из поста»). Exit: Esc / close, focus back on the row.

### 4.3 Resolve an `unknown`
Entry: nav badge, Обзор «Требует внимания», Инциденты row, Публикации «Ошибки» tab (all land on `/publications?id=`).
1. Inspector shows warning «Telegram не ответил. Сообщение могло уйти.» + steps: «1. Откройте канал и найдите пост.» with button «Открыть канал» (if public link) and copyable title.
2. Three choices (radio-card list, none preselected): «Сообщение есть в канале» (+ field «Номер сообщения» when required by API), «Сообщения нет, отправить снова» (+ date-time), «Сообщения нет, не отправлять».
3. Button «Подтвердить» disabled until a choice; confirm dialog names the effect («Будет отправлено повторно в 12:00 в «Канал»; возможен дубль, если сообщение всё же есть»). 4. Result from server: status becomes `sent`/`scheduled`/`cancelled`, incident closes (`resolve-unknown` already does this). Exit: close leaves it `unknown` (no change).
- G/W/T: Given an `unknown` publication, Then no «Повторить», «Перенести» or «Отменить» is rendered anywhere (list, row menu, inspector, dashboard); only «Проверить».

### 4.4 Add channel
Настройки (phone: Ещё -> Настройки -> Каналы) -> «Добавить канал» -> hint (bot must be admin) -> enter `@username` or ID -> Enter/«Проверить» -> result card (OK / no rights with steps / unreachable) -> «Сохранить канал» -> sheet closes, new row highlighted 2 s, focus on it, toast «Канал добавлен». Exit: Esc/close, nothing saved. Disabled-channel toggle warns about scheduled publications (**API need**: count).

### 4.5 Change theme / accent
- Theme: top-bar button (or «Ещё» sheet on phone) flips light/dark, saved instantly (409: re-apply on the newest revision once, silently), toast on failure «Не удалось сохранить тему. Вернули прежнюю.» with «Повторить». From «Системная» a press sets the opposite of the theme on screen. Tooltip «Тема: тёмная».
- Accent: Настройки -> Оформление -> tap swatch in the active theme's row -> live preview updates -> «Сохранить» / «Отменить» appear sticky -> toast «Оформление сохранено». Leaving with unsaved accent: confirm «Выйти без сохранения?». Custom colour: «Свой цвет» -> dialog (existing) -> new swatch appears and is selected, still needs «Сохранить».

---

# 5. API needs (listed, not designed around)
count of scheduled publications per destination (disable warning); approved -> draft («Вернуть в черновик»); hide/remove final publication records. Everything else here uses existing endpoints.
