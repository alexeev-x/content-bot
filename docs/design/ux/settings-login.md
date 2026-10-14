# §3.6–3.8 Настройки, вход, 404 / «Раздел в разработке»

## 3.6 Настройки `/settings/*`
- **Purpose:** rare configuration. Master/detail: desktop list 200 px + detail; phone list -> detail with «‹ Настройки». The Settings page title is `h1` «Настройки»; section title is `h2` in the detail Panel header strip.
- **Каналы (primary: «Добавить канал», in the detail header, next to the title):** Panel list rows (avatar, name (wrap anywhere, 2 lines), ID mono muted, status chip «Работает / Нет прав / Недоступен», chevron). Row opens the channel Drawer (desktop) / sheet (phone). Add channel = dialog (desktop) / full-screen sheet (phone): step 0 hint «Сначала добавьте бота администратором канала», input, «Проверить» (Enter works), result card (name, rights), «Сохранить канал» footer (button name differs from the opener; `unknown`? n/a).
- **Оформление (primary: none; applies instantly for theme, explicit «Сохранить» for accent as decided):** Panel 1 «Тема» segmented (Светлая · Тёмная · Системная) with three short labels; Panel 2 «Акцентный цвет»: **one swatch row per theme** (5 presets + «Свой цвет» tile + custom ones), name of selected under the row, «Сейчас» tag on the active theme; Panel 3 «Предпросмотр» (live mini UI). Footer: sticky Save/Discard only when dirty, above tab bar on phone; disabled primary keeps accent at 40%. Colour constructor (CustomPresetDialog, up to 10) unchanged. Desktop target height <= 700 px (was 1270).
- **States:** channels loading skeleton 3 rows, error, empty («Каналов пока нет» + «Добавить канал»), channel `no rights` warning chip + «Проверить права», save conflict, quick-save revert toast.

## 3.7 Вход `/login`
Centred card (max 400 px), logo, h1 «Вход», Telegram Login Widget button as the only primary; below: muted «Только для владельца». States: widget loading (reserved 48 px slot), cancelled, expired («Ссылка устарела, войдите снова»), 401, 403 foreign owner («Нет доступа к этой панели»), `Retry-After` countdown (existing `RetryAfterButton`). Mini App: no screen, auto sign-in shows shell skeleton; failure shows the same card with «Повторить». Phone: card fills width with 16 px margins, widget centred.

## 3.8 404 / «Раздел в разработке»
404: h1 «Страница не найдена», one sentence, button «К обзору». Stubs are unreachable from nav; if reached by URL: «Раздел в разработке» + button «К публикациям» (nearest working view).
