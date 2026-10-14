# 4. Key flows

Common: every step names its exit (Esc / back / close) and nothing blocks leaving except a failed save.

### 4.1 Create post -> schedule/publish
1. Entry: Обзор «Новый пост», Посты «Новый пост», `/posts/new`. Mini App: BackButton visible.
2. Type title/body; indicator «Сохраняем…» -> «Сохранено, 14:32»; first non-empty text creates the draft silently. Leave anytime (toast «Черновик сохранён»); empty form creates nothing.
3. «Одобрить» (needs saved draft; dialog «Одобрить пост? Править его можно будет после возврата в черновик.»). Result: chip «Одобрен», button becomes «Опубликовать…».
4. PublishDialog: channel (required; disabled channel not offered), When = «Сейчас» / «Запланировать» (date-time with timezone line). Duplicate guard: «Этот пост уже запланирован или опубликован в этом канале. Опубликовать ещё раз?»
5. Confirm. Result **only on server answer**: 202 «Отправка принята» is NOT «опубликовано»; the Публикации block shows status chip from the DTO (queued -> sending -> sent). Toast «Запланировано на 8 окт., 12:00» with link «Открыть публикацию».
6. Exit/cancel: Esc in dialog, nothing created. Undo of schedule = «Отменить публикацию» in the block (confirm names channel and time).
- G/W/T: Given approved post and a working channel, When I choose «Сейчас» and confirm, Then the dialog shows a pending state, no "Опубликовано" text appears until the server returns `sent`. Given 409/offline, Then the dialog stays with the error and the retry is safe (idempotency key).

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
