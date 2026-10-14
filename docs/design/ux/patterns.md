# 2. Pattern system (applies to every screen)

### 2.1 Page header
`[← back, depth-2 only]  Title (h1, 1 line, ellipsis)   [primary action] [⋯]`; subtitle optional, **max one line, muted; remove explanatory paragraphs** (rules go into helper text, not subtitles). Phone: title row + primary action as a full-width-ish button only where the action is the page's point (Посты «Новый пост»); on lists the primary lives in the header at top-right as a 44 px button (icon + text, collapses to icon at 320). Focus moves to the h1 on route change.

### 2.2 Which control where (decision table)
| Need | Control | Used on | Why |
|---|---|---|---|
| Switch between sub-collections / different content of one page, deep-linkable | **Tabs** (underline, URL `?view=`) | Посты (Все · Черновики · Архив), Публикации (Все · Запланированные · Отправленные · Ошибки), Инциденты (Открытые · Закрытые) | Cloudflare/Notion convention: tabs = page sections; browser back works; counts allowed (`Архив 3`) |
| One setting with 2-4 exclusive values, applied immediately | **Segmented control** | Appearance theme mode (Светлая · Тёмная · Системная), Calendar view (Later) | Looks like a switch, not navigation; fits 3 options at 375 (shortened labels, no scroll) |
| Narrowing a list | **Search**: one always-visible field (~280 px) in the panel header, never behind an icon, no column-header popovers or dropdown filters (owner, 08.10.2026). It filters the **loaded** rows live (no Enter, no request per keystroke) by all row text: title, excerpt, channel, the status label as the owner reads it, time; case and diacritics ignored; Arrow Down moves focus into the rows, Esc clears. A footer note says the search covers loaded rows only, with «Показать ещё». Phone = the same field above the cards, same matching. **Filters** (other screens): Select/Menu in the Toolbar, phone «Фильтры (N)» -> bottom sheet; applied filters shown as removable chips | Посты, Публикации (search only); Инциденты (Тип: Все · Требуют проверки · Ошибки) | One mental model; the search needs no mode; "chips" appear only as *applied-filter echo*, never as navigation |
| Sort | Desktop: click the column header («Изменён», «Пост», «Время»; arrow shows direction). Phone: the button «Сортировка» (shows the current order) opens a sheet that holds only the sort | Посты, Публикации | Sort lives where the data is; no separate Sort select (owner, 08.10.2026) |

Applied: Публикации loses pill chips (Все/Сегодня/Запланированные/Отправленные/Ошибки): first, third-fifth become **tabs**, «Сегодня» becomes a filter «Период: Сегодня» (the API supports `from`/`to`; the UI period filter is queue item 5 in `docs/IMPLEMENTATION_PLAN.md`). Инциденты: two stacked segmented controls become one tab pair (Открытые/Закрытые) + one Select «Тип». Посты: tabs stay; the separate «Сортировка» full-width select on phone moves into the filter sheet.

### 2.3 Toolbar
Desktop: tables have no separate toolbar row — the search field sits in the panel header, sort is in the column headers (no header filters); list panels without a table (e.g. Каналы) keep a one-row toolbar `[Search] [Selects]`; selection mode (Posts) swaps the row for `SelectionBar` («Выбрано 2 · Удалить · Отмена») in the same space (no height change). Phone: row 1 `[Search field (flex)] [Сортировка button 44 px]` (screens with real filters keep `Фильтры (N)`; chips echo row only when N > 0). Table search behavior is specified per page; in Posts it is server-side. Esc clears; Enter does nothing special. Labels sit **inside** Selects (placeholder-style «Статус: все»), not above.

### 2.4 Table vs row card, inspector vs sheet
- Desktop table: row 48 px; columns per screen (sections 3.x); row hover + keyboard focus ring; whole row opens the inspector (one `button`-semantic target, no nested links except the Telegram link); truncated cells have `title`/tooltip; `overflow-wrap:anywhere` for user strings; numeric/time columns tabular.
- Phone row card (inside the Panel, divider-separated, no per-card border): line 1 title (max 2 lines) + status chip right; line 2 muted meta (channel · time); optional line 3 only for a warning text (`unknown`). Whole card = tap target >= 56 px; `⋯` 44 px. Tracks `minmax(0,1fr)`, no `nowrap`.
- Inspector (desktop): right drawer 440 px, URL param (`?id=`), list stays visible and keeps scroll; Esc/close returns focus to the originating row. Phone: bottom sheet <= 85 dvh with grabber, sticky safe-area footer holding the primary action. Editing flows (post, channel add) are full-screen sheets/routes with sticky footer.
- **Thumbnails in list rows (Посты, Публикации, Обзор):** a leading media tile on every row, same size with or without media so row height never depends on it. Desktop 40 x 40, phone 44 x 44, radius 1 token (`--radius-1`), `object-fit: cover`, no border except a hairline on dark. Text-only post (or no media API yet) = the same tile with a type icon (document icon, muted) on a surface-2 background, never an empty gap or a broken image; failed image = same icon tile. Alt text empty (decorative; the title is the name). Skeleton: the tile is a fixed grey box. Compact dashboard table «Последние публикации»: 32 x 32 inside a 44 px row. Post media exists (`PostDto.media`); a row without media shows the icon tile.
- Row actions order: primary visible action only when the row is "needs me" (`Проверить`, `Открыть`); everything else in `⋯`. Same action, same name everywhere: «Открыть», «Перенести», «Отменить публикацию», «Удалить», «Проверить», «Вернуть из архива».

### 2.5 State matrix per panel (every list panel draws all of these)
| State | What the Panel shows | Rule |
|---|---|---|
| loading | header strip + toolbar real; rows = skeleton (N fixed, 2.6) | `aria-busy`, no spinner on page |
| refreshing | old rows stay, 2 px progress line under header strip | no flicker, no layout change |
| empty (no data) | EmptyState inside the Panel: one sentence + the one action that fills it | teach next step |
| empty (filtered) | Search with no match: «Ничего не найдено» + «Очистить поиск» (clears the field, keeps the tab); a narrowed tab with no rows: «Показать все …» | action clears, keeps tab |
| error (first load) | ErrorState inside Panel: what failed, `requestId`, «Повторить» | panel height = skeleton height |
| stale (refetch failed) | rows kept, footer strip «Данные устарели · Обновить» (`role=status`) | never silently hide |
| partial | rows with per-row fallback («Пост удалён», muted) | not an error |
| mutation pending | button loading + disabled, row dimmed; **never optimistic success** for publish/schedule/cancel/resolve | server confirms, then toast |
| 409 / revision | inline banner on the object: «Изменено на другом устройстве. Обновить» | |
| `unknown` | danger-warning chip «Требует проверки», retry/cancel/reschedule **absent**, only «Проверить» | link to reconciliation |

### 2.6 Skeleton geometry rules (no jumps)
- Panel header strip: fixed 48 px, title real text, count/actions skeleton-or-real.
- Toolbar: rendered real immediately (search + filters are static) and disabled until data.
- Rows: desktop 48 px (two-line posts/publications row 56 px: pick one per screen and keep it for skeleton and data); phone card 72 px. Skeleton rows = the page size above the fold: 8 desktop, 6 phone. After data: fewer rows -> panel keeps `min-height` of the skeleton until the first load completes ("settle"), then shrinks; "load more" footer line is always reserved (24 px).
- Обзор: KPI strip fixed 4 x 96 px (phone 2 x 2 grid, 2 x 88 px); each panel (all nine, incl. ПРЕВЬЮ) reserves 48 px strip + max rows x row height with the counts and heights listed in 3.1; when empty it shows its single-line empty state **inside the same panel height** (min-height = header + 1 row).
- Editor: toolbar, title field, body area (min 320 px desktop / 240 phone) and preview panel are fixed; save indicator slot reserves its width («Сохранено, 14:32»).
- Settings: list rows 72 px x 2 skeleton; Appearance swatch rows reserved (2 rows x 56 px).
- Image/avatars: fixed boxes. Fonts: `font-display:swap` with metric-matched fallback so text blocks do not reflow.

### 2.7 System status chip (top bar, replaces content row on Обзор)
Chip width = content: dot + «Всё работает» + chevron, `aria-haspopup`; popover lists 3 rows (Сервис, Бот, Публикация: one-word state) and one footer line «Проверено в 12:41 · обновляется каждую минуту»; a row shows its own age («нет ответа 10 мин») only when that check is stale (owner, 08.10.2026: three near-identical times are noise). On a problem the chip turns warning/danger («Нужна проверка: бот») and Обзор shows a Banner naming the first problem with a real button («Подключить бота»). Healthy popover never shows «Переподключить» (inside «Ещё» menu).

### 2.8 Destructive / public effects
Reversible + local (theme, archive restore, cancel of a scheduled item before it is due) = undo toast 8 s. Public or irreversible (publish now, delete post, «Удалить сейчас», resend after reconciliation) = dialog that **names the effect and channel** («Опубликовать сейчас в «Official RU»? Пост сразу появится в канале.»), primary button repeats the verb. `unknown`: no cancel/retry buttons exist; only reconciliation (3.5). Focus after dialog close returns to the trigger; after delete goes to the list heading «Посты» with the toast announced via `aria-live`.

---

# 3. Screens
