# ALEXEEV Studio admin: UX spec

Status: **Approved 08.10.2026** (owner approved this spec and the prototype at `/__proto`; real pages follow the prototype). Expert review, not validated with users; the owner's words and the existing stories are the primary evidence. Scope: only screens and routes that exist now. Anything needing a missing API is marked **API need**; future items are marked **Later** and are never drawn as working.

Inputs: `docs/design/README.md` (Calm Operations visual rules) and `docs/PAGE_MAP.md`. Publishing-safety rules in `docs/BACKEND_ARCHITECTURE.md` and skill `publishing-reliability` always win.

Conventions: responsive behavior is required on every route from 320 px phone widths through tablets, laptops and large desktop screens (1920 px+); no device class is out of scope. **Viewport checks (the only source for widths):** builders (frontend, design-system, ui-prototyper) run a quick check at **375, 1280 and 1920 px**; the independent ui-qa gate runs the **full matrix 320, 375, 390, 768 (tablet portrait), 1024 (tablet landscape/small laptop), 1280 (laptop), 1440 and 1920 px**, plus intermediate widths where layouts change. The existing 860 px breakpoint switches compact navigation/list composition to desktop composition; it is not a device boundary, and layouts must interpolate cleanly on both sides. Use available width and input capability (touch targets 44 px on touch and in the Mini App, 34-36 px for a fine pointer), not device-name assumptions. No horizontal page overflow, clipped content, inaccessible controls or overlapping sticky UI at any tested width. RU copy is final unless marked `(draft)`.

---

## 0. Decisions at a glance

1. **One page anatomy**: breadcrumb/back (only on depth-2 pages) -> `PageHeader` (title, one-line subtitle max, ONE primary action, optional overflow menu) -> optional **view tabs** -> `Toolbar` (search + filter button + sort) -> content in **one Panel** -> footer line (count / "load more" / stale note).
2. **Three controls, three jobs, never mixed** (see 2.2): **Tabs** = different *views* of the same collection (URL `?view=`). **Segmented control** = a *mode* of one view (2-4 mutually exclusive options, instant, e.g. theme mode, Открытые/Закрытые). **Filters** = refine inside a view (Select/Menu in the Toolbar, phone: one «Фильтры» sheet). Pill chips are removed; the "quick presets" (Сегодня, Ошибки) become view tabs or filter values, not a fourth look.
3. **Lists always live in a Panel** (header strip + rows + footer). No bare tables on the page background, no panel inside a panel. Exception: editor writing surface and Settings detail (they are documents, not collections).
4. **Desktop = DataTable inside Panel; phone = the same data as row cards inside the same Panel** (fixed anatomy: title 2 lines, status chip, one meta line, `…` menu). Detail: desktop inspector (right Drawer, URL-addressable); phone full-height bottom sheet for quick look, route for anything with editing.
5. **Skeletons reserve final geometry** (2.6): header strip, toolbar, row count and row height are fixed, so data arrival never changes section height.
6. **Mobile is first-class**: bottom tab bar (Обзор, Посты, Публикации, Инциденты, Ещё) replaces «Календарь» (stub) while it is not built; primary action in the thumb zone (bottom, inside the sticky action bar or FAB-less header button at top is NOT enough on lists); filters in a bottom sheet with active count; editor is full-screen with one pinned action bar.
7. **Editor autosaves**; the primary action is «Опубликовать…» (publish now or schedule) once the post is approved, «Одобрить» before. Unknown/duplicate sends confirm and name the channel.
8. **Theme in one press, accent by explicit Save** (4.5), colour constructor kept as is: 5 presets per theme + custom colours; only layout compacts (swatch row).
9. **Honest nav, composed Обзор**: nav lists only built sections (Обзор, Посты, Публикации, Инциденты, Настройки). Owner decision 08.10.2026 **reverses** the earlier single-column Обзор: Обзор follows the approved prototype composition (KPI strip, two columns, bottom row of three); Dota Pulse, Аналитика канала and Система stay on it as visibly marked **ПРЕВЬЮ** blocks with «демо» figures (3.1), never presented as real data.
10. **Mini App parity**: same screens, same actions; Telegram BackButton replaces in-page back, MainButton carries the screen's single primary action, app top bar hidden (`docs/FRONTEND_ARCHITECTURE.md` §16).

---

## 1. Shell

**Purpose / primary task:** move between work areas and see what needs attention without losing place.

### 1.1 Desktop composition (>= 860 px; adapt fluidly for laptop and large desktop)
- Sidebar 216-224 px expanded / 56-64 px collapsed rail. Collapse control **bottom-anchored** (owner likes it), 200 ms width transition, `prefers-reduced-motion` = instant; state persisted; current route never lost. Order: Обзор, Посты, Публикации, Инциденты (badge = open incidents count, the only badge), Настройки pinned bottom. Active = 2 px accent edge + subtle bg. Collapsed rail: icons with tooltips + `aria-label`.
- Top bar (thin, 48 px): left = search trigger (field-looking, shows `Ctrl K`), right = read-only timezone chip («Europe/Chisinau (UTC+3)»), environment chip (DEV, always visible on dev), system-status chip (see 2.7), theme toggle, owner menu (`Выйти` only). Not a second dashboard.
- Sidebar bottom: card «Подключённый канал» (avatar, name, state chip, subscribers line «—» until an API exists) above «Свернуть меню»; collapsed rail: avatar with tooltip (3.1).
- Search: **today the field is a disabled placeholder unless wired**. Spec: the trigger opens a command palette (navigate-only: Посты, Публикации, Инциденты, Настройки; recents). **API need**: server search over posts/publications for entity results; until then the palette lists destinations + recent routes only, or the trigger is hidden (no disabled placeholder).
- Sticky: sidebar and top bar. Page content scrolls; page header does not stick on desktop.

### 1.2 Compact composition (< 860 px; phone and narrow/tablet portrait widths)
- Bottom tab bar, 4 tabs + «Ещё»: **Обзор, Посты, Публикации, Инциденты (badge dot/number), Ещё**. «Ещё» sheet: «Подключённый канал» card on top (moved from the sidebar), Настройки, theme, Выйти, (Later: Календарь, Медиа, Автоматизации when built). Reason: Календарь is a stub; Инциденты is a daily "resolve" task and an `unknown` is time-sensitive (wasted tap otherwise). 48 px high, labels always visible, 11.5-12 px min, no wrap at 320.
- Top app bar (browser only): logo, DEV, search icon, theme, owner menu. **Inside Telegram: hidden**; search and theme move into the page header's overflow (Ещё sheet holds theme).
- Detail/edit routes (`/posts/new`, `/posts/:id`, Settings detail) hide the tab bar (full-screen) and show a back chevron (44 px) in the header; Mini App uses BackButton instead.
- Safe areas: `max(env(), --tg-content-safe-area-inset-*)` on tab bar, action bar, sheet footers. Pinned UI follows `visualViewport` when the keyboard opens.

### 1.3 Shell states
Session restore: shell + route skeleton at once (done). Offline: persistent slim banner under the top bar «Нет соединения. Данные могут быть устаревшими.»; mutations disabled with reason (never queued). Unauthorised: redirect to `/login`. Route error: `RouteError` inside the content area, shell stays.

---

## 2. Pattern system (applies to every screen)

### 2.1 Page header
`[← back, depth-2 only]  Title (h1, 1 line, ellipsis)   [primary action] [⋯]`; subtitle optional, **max one line, muted; remove explanatory paragraphs** (rules go into helper text, not subtitles). Phone: title row + primary action as a full-width-ish button only where the action is the page's point (Посты «Новый пост»); on lists the primary lives in the header at top-right as a 44 px button (icon + text, collapses to icon at 320). Focus moves to the h1 on route change.

### 2.2 Which control where (decision table)
| Need | Control | Used on | Why |
|---|---|---|---|
| Switch between sub-collections / different content of one page, deep-linkable | **Tabs** (underline, URL `?view=`) | Посты (Все · Черновики · Архив), Публикации (Все · Запланированные · Отправленные · Ошибки), Инциденты (Открытые · Закрытые) | Cloudflare/Notion convention: tabs = page sections; browser back works; counts allowed (`Архив 3`) |
| One setting with 2-4 exclusive values, applied immediately | **Segmented control** | Appearance theme mode (Светлая · Тёмная · Системная), Calendar view (Later) | Looks like a switch, not navigation; fits 3 options at 375 (shortened labels, no scroll) |
| Narrowing a list | **Search**: one always-visible field (~280 px) in the panel header, never behind an icon, no column-header popovers or dropdown filters (owner, 08.10.2026). It filters the **loaded** rows live (no Enter, no request per keystroke) by all row text: title, excerpt, channel, the status label as the owner reads it, time; case and diacritics ignored; Arrow Down moves focus into the rows, Esc clears. A footer note says the search covers loaded rows only, with «Показать ещё». Phone = the same field above the cards, same matching. **Filters** (other screens): Select/Menu in the Toolbar, phone «Фильтры (N)» -> bottom sheet; applied filters shown as removable chips | Посты, Публикации (search only); Инциденты (Тип: Все · Требуют проверки · Ошибки) | One mental model; the search needs no mode; "chips" appear only as *applied-filter echo*, never as navigation |
| Sort | Desktop: click the column header («Изменён», «Пост», «Время»; arrow shows direction). Phone: the button «Сортировка» (shows the current order) opens a sheet that holds only the sort | Посты, Публикации | Sort lives where the data is; no separate Sort select (owner, 08.10.2026) |

Applied: Публикации loses pill chips (Все/Сегодня/Запланированные/Отправленные/Ошибки): first, third-fifth become **tabs**, «Сегодня» becomes a filter «Период: Сегодня» (**API need**: date range filter on `GET /publications`; until built, drop «Сегодня», it currently works only client-side over a page). Инциденты: two stacked segmented controls become one tab pair (Открытые/Закрытые) + one Select «Тип». Посты: tabs stay; the separate «Сортировка» full-width select on phone moves into the filter sheet.

### 2.3 Toolbar
Desktop: tables have no separate toolbar row — the search field sits in the panel header, sort is in the column headers (no header filters); list panels without a table (e.g. Каналы) keep a one-row toolbar `[Search] [Selects]`; selection mode (Posts) swaps the row for `SelectionBar` («Выбрано 2 · Удалить · Отмена») in the same space (no height change). Phone: row 1 `[Search field (flex)] [Сортировка button 44 px]` (screens with real filters keep `Фильтры (N)`; chips echo row only when N > 0). Table search is client-side over loaded rows, not debounced (no request); Esc clears; Enter does nothing special. Labels sit **inside** Selects (placeholder-style «Статус: все»), not above.

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

## 3. Screens

### 3.1 Обзор `/`
Owner decision 08.10.2026: the single-column Обзор is rejected; the composition of the approved prototype (`/__proto`) is the target, adapted only where a real constraint forces it (constraints table below). Expert review, not validated.

**Final owner note (08.10.2026, binding for the real build).** Keep the composition, but more minimalist:
- **KPI cards:** value + one detail line, neutral muted icon, no trend and no «демо» chips on KPI, chevron on hover.
- **«демо» marking:** at most one quiet «демо» text per panel header; no per-row or per-cell chips.
- **Сегодня / Ближайшие / Последние rows:** time · thumbnail or icon tile · one-line title · status · views. No excerpt, no channel icon column, no ER, no `⋯`; the row opens the publication.
- **Требует внимания:** icon, title, one-line reason, time, one action; no `⋯`.
- **Dota Pulse:** thumbnail + one-line title + time ago.
- **Аналитика:** one strip of three metrics separated by rules; no boxed tiles.
- **Система:** one line per service (name + status dot + word); latency in a tooltip.
- **Sidebar channel card:** one compact row.
- **Counts** only where actionable.
- **Phone reserve** (skeleton rows) = min(expected rows, 2).
Where the bullets above or the table below conflict with this note, this note wins.

**DEV-only previews, NOT built in the real app now:** the §6 pages (Аналитика, Календарь, Медиатека, Автоматизации, Источники) and the palette's mock results exist only in the prototype (`/__proto`). The real app builds only the five nav sections (Обзор, Посты, Публикации, Инциденты, Настройки); the ПРЕВЬЮ panels on Обзор stay DEV-only.
- **Purpose:** open it and in one screen know what goes out today, what needs me and whether the system is alive. **Primary action:** «Новый пост» (header, desktop right of the title block; phone: header button 44 px; Mini App: MainButton **not** used, it is a hub).
- **Header:** h1 «Обзор»; one-line subtitle «Центр управления контентом, публикациями и состоянием системы»; right: date/time chip («Вт, 7 окт. 2025 · 21:05», minute precision, owner's timezone, no seconds, not `aria-live`) then «Новый пост». Top bar (1.1) carries search `Ctrl K`, read-only timezone chip «Europe/Chisinau (UTC+3)» (display only, not a button until a timezone setting exists), «Сервисы работают» status chip (2.7), theme, owner.
- **Desktop composition (container >= 1200 px; at 1440 the content is ~1180 px, drawn 12-col grid, 16 px gaps):**
  1. **KPI strip**, 4 cards x 96 px: icon tile 48 px (accent per meaning), label, big value, trend slot, detail line, chevron. «Публикации сегодня» (detail «Запланировано и отправлено») -> `/publications`; «Отправлено в каналы» («Успешных публикаций») -> `/publications?view=sent`; «Требует внимания» («Инциденты и ошибки») -> `/incidents`; «Ближайшая публикация» (value `21:00`, detail «Через 1 ч 55 мин», recomputed each minute; other day: «Завтра, 10:00») -> `/publications?id=` of that item; none: value «—», detail «Нет запланированных», no chevron, not a link.
  2. **Main row, two columns 2 : 1.**
     - Left (real data): **«Требует внимания» (N)** + link «Все инциденты ->»: rows of severity icon tile (danger = failed, warning = unknown), title, reason line (from DTO), time, one action button, `⋯`. **«Сегодня» (N)** + «Все публикации ->»: rows of time (mono), thumbnail, title + one-line excerpt, channel icon (accessible name = channel), status chip, Просмотры, ER, `⋯`.
     - Right (**ПРЕВЬЮ**): **Dota Pulse** (chip «ПРЕВЬЮ», subtitle «Свежие новости и события из мира Dota 2.», 3 rows: 40 px image thumbnail, title, one-line summary, «2 ч назад»; «Все события ->» to `/preview/sources`). **Аналитика канала** (chip «ПРЕВЬЮ», 3 metric tiles Просмотры / Подписчики / Вовлечённость: value, trend, sparkline; «Все метрики ->» to `/preview/analytics`).
  3. **Bottom row, three panels** (1.1 : 1.2 : 0.8): **«Ближайшие публикации» (N)** + «Все в календаре ->» (until Календарь is built the link goes to `/publications?view=scheduled`, label «Все запланированные»): time, thumbnail, title + excerpt, «Через 1 ч 55 мин», channel name. **«Последние публикации»** + «Все публикации ->»: compact table Время · Пост (32 px thumb + title) · Статус · Просмотры · `⋯`. **«Система»** (chip «ПРЕВЬЮ») + «Все сервисы ->»: 4 rows icon, name, state chip, latency (Бот публикаций, Telegram API, База данных, Очередь задач).
  4. **Sidebar bottom card «Подключённый канал»** (above «Свернуть меню»): avatar, channel name, subscribers line, state chip «Работает». Hidden on the collapsed rail (only the avatar with tooltip). Several channels: the first enabled one; click -> `/settings/channels`.
  - 860-1199 px: one main column, order Требует внимания, Сегодня, Ближайшие, Последние, Dota Pulse, Аналитика, Система (Ближайшие and Последние side by side from 1000 px). KPI stays 4 across (labels wrap to 2 lines).
- **Reconciling the prototype mock data with reality:**
  | Prototype element | Rule |
  |---|---|
  | Views, ER, trend arrows («+100%»), subscribers, latency | No data source (**API need**). Real rows show «—» (tooltip «Нет данных»); the slot stays so layout never shifts. Values exist only in ПРЕВЬЮ blocks and in the prototype's mock mode, where each carries the «демо» mark. A real post never shows an invented number. |
  | Preview marking | Each ПРЕВЬЮ panel: chip «ПРЕВЬЮ» in the header strip, «демо» chip on every figure group, links lead to `/preview/*`; no real write. Banner and toggle from 8.2 are dropped for Обзор: the blocks are visible by default (owner), never inside the left column or the KPI strip, never above «Требует внимания». In a production build the three ПРЕВЬЮ panels are hidden until the owner decides otherwise (DEV only until the owner says ready). |
  | «Требует проверки / Подозрительное содержимое (авто-модерация)» | AI/moderation dropped. Warning row = `unknown` («Требует проверки», reason «Telegram не ответил. Сообщение могло уйти.»), action «Проверить». Failed row: action «Открыть» (no retry exists). «Проверить» is never offered on a failed row. |
  | Status «Опубликовано» | Only when the server says `sent`. Otherwise Запланировано / Отправляется / Ошибка / Требует проверки (text + icon, never colour only). 202 never renders as published. |
  | Thumbnails | Real rows use the post's media; a post without media shows the type-icon tile (2.4) at the same height. Prototype uses demo images. |
  | Система | Real states only where a source exists (Бот <- bot check, Очередь <- publication check, from 2.7); other rows «Нет данных» chip; latency always demo. Whole panel stays ПРЕВЬЮ. |
  | Подключённый канал | Name, avatar and state are real (channels API); subscribers line shows «—» until an API exists (prototype mock: «12 456 подписчиков» + «демо»). |
  | «Все в календаре» | Календарь not built: see bottom row above. |
- **Row anatomy and actions:** desktop row 56 px (thumb 40), whole row opens the inspector (`/publications?id=`); `⋯` opens: Открыть; by status as in 3.4 (Перенести, Отменить публикацию); `unknown`: only «Проверить»; never «Повторить». Row action button visible only for «needs me» rows. Same action names as 2.4.
- **Phone (375, tab bar visible, order top to bottom):** header (h1, one-line subtitle, date chip under it, «Новый пост» 44 px at right of the title) -> Banner only if a service problem (2.7) -> KPI 2 x 2 (88 px, labels «Сегодня», «Отправлено», «Внимание», «Ближайшая») -> «Требует внимания» (3 rows max, title + reason, button full row height 44 on the right, `⋯`) -> «Сегодня» (cards: time, thumb 44, title, status chip; line 2 channel; views/ER dropped) -> «Ближайшие» (3 cards) -> Dota Pulse (2 items + «Все события»; no horizontal scroll) -> Аналитика канала (3 tiles in a row, no sparkline, trend under value) -> «Последние публикации» (row cards: thumb, title, status chip, `7 окт., 19:00 · 12.4K` meta; no table) -> «Система» (4 rows 48 px). Sidebar «Подключённый канал» moves to the top of the «Ещё» sheet. Mini App: same order, no app bar.
- **Skeleton geometry (2.6):** header and KPI (4 x 96 / 2 x 88) real or fixed; each panel reserves 48 px strip + max rows x row height: Требует внимания 3 x 56 = 216; Сегодня 4 x 56 = 272; Ближайшие 3 x 56 = 216; Последние 32 table header + 5 x 44 = 300 (bottom row panels share the tallest height); Система 4 x 48 = 240; Dota Pulse 32 subtitle + 3 x 64 = 272; Аналитика 3 tiles x 96 (phone 72). Thumbnail slots are fixed boxes (grey tile) so image arrival never shifts text. Phone uses the same counts with card height 72 and Dota Pulse 2 x 64. First load: panels keep skeleton height until loaded ("settle", then shrink).
- **States per panel (2.5):** empty day «Сегодня»: «На сегодня публикаций нет» + button «Новый пост» (inside panel, height = strip + 1 row); «Требует внимания» empty: positive «Всё под контролем» with success icon, no CTA; «Ближайшие» empty «Ничего не запланировано» + «Опубликовать пост»; error per panel independent (ErrorState at skeleton height, requestId, «Повторить»); stale footer strip; `unknown` rule 2.5. KPI error: value «—», tile not a link. New install (no channel): Banner «Подключите канал, чтобы публиковать» + «Добавить канал» replaces the attention list's empty state; Подключённый канал card becomes «Канал не подключён» + «Добавить».
- **Focus and refresh:** h1 on route change; polling silent (no skeleton flash); after closing the inspector focus returns to the row.
- **Given / When / Then:** (1) Given an `unknown` publication, Then it appears in «Требует внимания» with only «Проверить» and its row in «Сегодня» has no retry/move/cancel. (2) Given no media API, Then every row shows the same height with a type-icon tile and views/ER «—», and no number from a ПРЕВЬЮ block appears in a real row. (3) Given the server returns 202 for a send, Then no «Опубликовано» appears until `sent`. (4) Given an empty day, Then «Сегодня» shows its empty state in the same panel and the page does not change height at data arrival. (5) Given 320 px, Then no horizontal scroll and all targets >= 44 px. (6) Given the owner collapses the sidebar, Then the channel card shrinks to an avatar with tooltip.

#### Widget grid and edit mode (owner decision 08.10.2026, built)
- **Grid:** 12 columns, 56 px row unit, 16 px gap, saved per owner (`/settings/dashboard-layout`, revision, 12-col `{id,type,x,y,w,h}`). View mode is plain CSS Grid; the skeleton uses the same geometry from a localStorage copy of the last saved layout (`ui-dashboard-layout`, non-secret). Revision 0 = default layout (kpi-summary 12x2; attention 8x4 + system 4x4; today 8x4 + upcoming 4x4; recent 8x5 + drafts 4x5; week 8x3 + quick-actions 4x3). A saved empty layout stays empty.
- **Widgets (default / minimum, columns x rows):** kpi-summary 12x2 / 8x2; kpi-today, kpi-sent, kpi-attention, kpi-next 3x2 / 2x2; attention 8x4 / 4x3; today 8x4 / 4x3; upcoming 4x4 / 3x3; recent 8x5 / 4x3; drafts 4x5 / 3x3; week 8x3 / 6x2; channels 4x3 / 3x3; incidents 4x3 / 3x3; system 4x4 / 3x3; quick-actions 4x3 / 3x3. A widget adapts to its own width (cards below 5 columns, table from 7 for recent, compact tiles below 200 px) and lists as many rows as its height holds. Data is requested only for widgets on the page; none while editing.
- **Edit mode** («Настроить» in the header; «Готово», «Отмена» asks when dirty, «Сбросить к стандартному», «Добавить виджет» catalog drawer with the planned widgets as «скоро»): react-grid-layout (lazy chunk, edit mode only) with a visible drag handle, a 44 px resize corner, snapping and vertical compaction; widgets show a light placeholder. Every widget has a menu (move left/right/up/down, wider/narrower/taller/shorter, remove) with a polite live region; removing offers an 8 s undo toast. Save sends the loaded revision; 409 keeps the draft behind «Раскладку изменили в другом окне» («Загрузить заново» / «Сохранить мою»); 400 shows the reason.
- **Phone / Mini App (< 860 px):** one column in reading order (top to bottom, left to right). Edit mode is a reorderable list (drag handle with keyboard drag, or the row menu: earlier, later, remove). Rule: a reorder keeps each widget's width and height and re-flows the grid in rows in the new order (no compaction), so the desktop layout stays valid.
- «Неделя» day links open `/publications?view=upcoming`: the list has no date filter, and the widget says so.

### 3.2 Посты `/posts` (+ `?view=archive`)
- **Purpose:** find a post and open/continue it. **Primary:** «Новый пост» (header; phone: header button).
- **Views (tabs, URL):** Все · Черновики · Архив (count only on Архив). «Все» includes derived states with badges (Черновик, Одобрен, Запланирован + time, Отправляется, Нужна сверка).
- **Desktop:** Header -> Tabs -> Panel{ header: title, «Выбрать», search field; DataTable (checkbox, Пост: title + one-line excerpt, Статус, Изменён, `⋯`; sort by clicking «Пост»/«Изменён») , footer «Загружено 4 · Показать ещё» (+ «Поиск идёт только по уже загруженным постам.» while a search runs and more pages exist) }. No status filter (the «Черновики» tab covers it). The count line sits in the footer, not floating below the table. Selection: row checkboxes appear in «Выбрать» mode; bulk bar replaces the toolbar.
- **Phone:** Header + «Новый пост» -> Tabs (scrollable never needed, 3 tabs) -> Panel{ Toolbar [search][Сортировка] , cards }. «Сортировка» opens a sheet with the sort only; the search filters the cards with the same text matching as the desktop table. `Выбрать` stays in the panel header. Title column gets full width: status chip drops to the meta line when the title is 2 lines.
- **Derived list state of a post** (first match wins): archived (`archivedAt` set, only in Архив) → a publication `preparing`/`sending` «Отправляется» or `unknown` «Нужна сверка» (never archived) → a publication `scheduled`/`queued`/`retry_wait` «Запланирован» + nearest time → `approved` «Одобрен» → `draft` «Черновик». Icon plus text, never colour alone.
- **Row `⋯`:** Открыть, Удалить; Архив: Вернуть из архива, Удалить сейчас. Every delete is confirmed: the dialog names the post (or the count), the number of scheduled publications that will be cancelled, and that Telegram messages stay. Rows with a `preparing`/`sending`/`unknown` publication cannot be deleted or selected (reason in a tooltip). Bulk: ≤ 100 per request, per-item result; a partial result toasts «Удалено: N из M. Не удалось: K» and keeps failed rows selected with their reasons. Archive rules (when a post moves there, 30-day purge, restore): `docs/BACKEND_ARCHITECTURE.md` §5 "Post lifecycle as built".
- **States:** 2.5; empty Все: «Пока нет постов» + «Новый пост»; empty Архив: «Здесь будут опубликованные посты 30 дней».

### 3.3 Редактор поста `/posts/new`, `/posts/:id`
- **Purpose:** write a post and send it. **Primary:** one button whose label follows state: «Одобрить» (draft, saved) -> «Опубликовать…» (approved; opens PublishDialog: channel, now/schedule). Desktop: top-right of the header. Phone/browser: pinned action bar; Mini App: MainButton with the same label (action bar hidden).
- **Header (compact, ~56 px, replaces today's ~110 px):** `← Посты` (back, 44 px) · title (inline editable text on phone: growing textarea) · SaveIndicator («Не сохранено / Сохраняем… / Сохранено, 14:32 / Не удалось сохранить · Повторить») · status chip · `⋯` (Удалить, История правок, Вернуть в черновик when allowed). Remove «Черновик ещё не создан» and «Ревизия N» from the header.
- **Desktop 1440:** two columns: writing column (max 720 px: title, formatting toolbar, body, one counter in the field corner «0 / 4096») + right side column 360 px with tabs **Превью** (Telegram-style) · **Публикации поста** (rows: channel, short time, status chip, `⋯` Перенести/Отменить). No bottom action bar on desktop; Ctrl/Cmd+S forces a save.
- **Phone:** full-screen (tab bar and app bar hidden). Segmented-style tabs **Текст · Превью · Публикации** under the header. Pinned action bar above the keyboard (visualViewport); the formatting toolbar becomes a single horizontally *non-scrolling* row of the 6 most-used marks + «⋯» sheet for the rest (code, quote, lists) as today. Counter on one line.
- **Approved/archived:** read-only banner with the way out («Вернуть в черновик» / «Вернуть из архива»). `unknown`/sending publication: banner links to reconciliation.
- **States:** new-empty (nothing created), dirty (autosave pending), saving, saved, save-failed (leave guard only here), 409 (ConflictBanner + compare), offline (indicator + disabled publish), preview failure (inline note, editor still usable), long text (4096 limit counter turns warning at 90%, error at limit, with text, not colour only).
- **Focus:** after approve -> focus on the primary action label change (live-announced «Пост одобрен»); after leave -> h1 of the target.

### 3.4 Публикации `/publications` (+ inspector)
- **Purpose:** find a send/schedule and act safely. **Primary:** «Опубликовать пост» in the header (renamed from «Создать публикацию»; opens PublishDialog with a post select, API exists: `postId` + `destinationId`).
- **Views (tabs, URL):** Все · Запланированные · Отправленные · Ошибки (Ошибки = failed + unknown; badge count). The tabs map to the server status; search (post, channel, status label, time) and sort by time are the only controls: no Статус/Канал filters, search runs over loaded rows. Period «Сегодня»: **API need**.
- **Desktop:** header -> tabs -> Panel{ Toolbar, DataTable: Время (mono, tabular) · Пост (title + excerpt) · Канал · Статус · Сообщение (Telegram id link) } , timezone note moved to the Panel header strip right («Europe/Chisinau, UTC+3»), not a paragraph.
- **Phone:** cards: title + chip; meta `7 окт., 12:00 · Канал`; Telegram link only in sheet. Drop the avatar/icon column.
- **Inspector / sheet:** header (title, status chip), pipeline (steps muted for future, no clock icons), facts (Канал, Время local + UTC offset, Telegram message link), linked post link, «Технические данные» disclosure (IDs, UTC, attempts, request id), footer actions by status:
  | Status | Footer |
  |---|---|
  | scheduled, queued, retry_wait | «Перенести», «Отменить публикацию» (named confirm; undo not possible once cancelled -> confirm names channel and time) |
  | preparing, sending | none; note «Идёт отправка» + auto refresh |
  | sent | «Открыть в Telegram» |
  | failed | «Открыть пост»; no retry (no API) |
  | unknown | **only «Проверить в Telegram и закрыть»** (reconciliation), warning text «Не повторяйте отправку, пока не проверили канал» |
  | cancelled | «Открыть пост» |
- Auto-refresh while any row is in process (as today), silent, no skeleton flash.

### 3.5 Инциденты `/incidents` and reconciliation
- **Purpose:** resolve what broke. **Primary:** the first row's action («Проверить» for `unknown`); no header primary. Badge in nav = open count.
- **Layout (both):** header -> Tabs Открытые · Закрытые (one control) -> Panel{ Toolbar: Select «Тип» + search? (no, ≤ dozens of items: only the Select) , rows }. Rows in a Panel. Row: chip, title, reason, channel, time, actions: `unknown` -> «Проверить» (primary-looking), failed -> «Открыть» + «Закрыть». «Детали» disclosure keeps technical code + `CopyButton`.
- **Phone:** cards with one primary full-width button per card; secondary «Закрыть» as text button in `⋯`; two stacked segmented controls removed.
- **Resolve semantics:** `publish_unknown` closes only through reconciliation (`resolve-unknown`), never with «Закрыть». «Закрыть» on `publish_failed` only acknowledges: it never changes the publication, retries or republishes. Closed rows: «Открыть» only, no reopen. Reason text per `code`: `apps/frontend/src/features/incidents/model/incident-view.ts`; `requestId`/`jobId` in «Детали», never raw `details`. Polling 30 s only while the tab is visible.
- **States:** empty open: «Всё под контролем. Открытых инцидентов нет.» (positive, no CTA); closed empty: «История пуста».

### 3.6 Настройки `/settings/*`
- **Purpose:** rare configuration. Master/detail: desktop list 200 px + detail; phone list -> detail with «‹ Настройки». The Settings page title is `h1` «Настройки»; section title is `h2` in the detail Panel header strip.
- **Каналы (primary: «Добавить канал», in the detail header, next to the title):** Panel list rows (avatar, name (wrap anywhere, 2 lines), ID mono muted, status chip «Работает / Нет прав / Недоступен», chevron). Row opens the channel Drawer (desktop) / sheet (phone). Add channel = dialog (desktop) / full-screen sheet (phone): step 0 hint «Сначала добавьте бота администратором канала», input, «Проверить» (Enter works), result card (name, rights), «Сохранить канал» footer (button name differs from the opener; `unknown`? n/a).
- **Оформление (primary: none; applies instantly for theme, explicit «Сохранить» for accent as decided):** Panel 1 «Тема» segmented (Светлая · Тёмная · Системная) with three short labels; Panel 2 «Акцентный цвет»: **one swatch row per theme** (5 presets + «Свой цвет» tile + custom ones), name of selected under the row, «Сейчас» tag on the active theme; Panel 3 «Предпросмотр» (live mini UI). Footer: sticky Save/Discard only when dirty, above tab bar on phone; disabled primary keeps accent at 40%. Colour constructor (CustomPresetDialog, up to 10) unchanged. Desktop target height <= 700 px (was 1270).
- **States:** channels loading skeleton 3 rows, error, empty («Каналов пока нет» + «Добавить канал»), channel `no rights` warning chip + «Проверить права», save conflict, quick-save revert toast.

### 3.7 Вход `/login`
Centred card (max 400 px), logo, h1 «Вход», Telegram Login Widget button as the only primary; below: muted «Только для владельца». States: widget loading (reserved 48 px slot), cancelled, expired («Ссылка устарела, войдите снова»), 401, 403 foreign owner («Нет доступа к этой панели»), `Retry-After` countdown (existing `RetryAfterButton`). Mini App: no screen, auto sign-in shows shell skeleton; failure shows the same card with «Повторить». Phone: card fills width with 16 px margins, widget centred.

### 3.8 404 / «Раздел в разработке»
404: h1 «Страница не найдена», one sentence, button «К обзору». Stubs are unreachable from nav; if reached by URL: «Раздел в разработке» + button «К публикациям» (nearest working view).

---

## 4. Key flows

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

## 5. API needs (listed, not designed around)
Date-range filter on `GET /publications` («Сегодня»); entity search endpoint (palette); count of scheduled publications per destination (disable warning); approved -> draft («Вернуть в черновик»); hide/remove final publication records. Everything else here uses existing endpoints.

---

## 6. Experimental previews (clickable explorations on mock data)

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

#### A. Аналитика `/preview/analytics`
- **Purpose:** see how channel content performs over a period. **Primary:** none (read-only page).
- **Desktop (1440):** header (h1 + chip) -> banner -> controls row: period **Select** with presets (7 дней · 30 дней · Месяц) + prev/next arrows, channel **Select**; tabs not needed. Then: KPI strip 4 tiles with sparkline (reference shows 5; take 4: Просмотры, Отправлено постов, Ошибки отправки, Вовлечённость; sparkline allowed in the preview only), Panel «Просмотры и вовлечённость» (line chart, legend checkboxes Просмотры/Реакции/Репосты, Select «По дням/неделям») beside Panel «Топ публикаций» (5 rows: #, thumbnail 40 px, title + rubric chip, date, views, ER), then a row of 2 Panels: «Отправленные посты» (bars), «Ошибки отправки» (bars; red + pattern, not colour only).
- **375:** controls collapse into one «Период и канал» button (sheet); KPI 2x2 without sparklines; each chart a Panel, 180 px high, legend under it, tap on chart shows tooltip pinned above the finger; «Топ публикаций» = row cards (title, ER chip, views); nothing scrolls horizontally.
- **Clickable:** period/channel change re-renders mock series (with 400 ms fake loading to show skeleton); hover/focus tooltip with date + three values (keyboard: arrow keys move along points, `aria-live` reads the value); legend checkbox toggles series; «По дням/неделям» regroups; row in «Топ публикаций» opens inspector (title, mini stats, «Открыть пост» disabled-with-reason «Превью»).
- **States:** loading = KPI 4 x 96, chart panels at final height with axis lines only, top-5 rows x 5; empty (no sends in period) = «За выбранный период нет публикаций» + «Выбрать другой период» (resets); error = ErrorState in each Panel independently («Не удалось загрузить» + Повторить), **partial** = one chart error while the rest stay; incomplete period (current month) = footer note «Данные за сегодня неполные».
- **Mock data:** 30 daily points per series (views 6k-48k, reactions ~10%, reposts ~3%) generated deterministically from a seed; one day with 3 errors; 5 top posts with fake titles; clear «демо» in every Panel strip.

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

#### D. Автоматизации (Cron) `/preview/automations`
- **Purpose:** see that scheduled jobs run, and pause one safely. **Primary:** none in the header (a «Новая задача» is Later; not drawn).
- **Views (tabs, URL):** Задачи · Последние запуски («Правила» omitted). Filters in column headers: Статус (Активна · Выключена · Ошибка), search in «Название».
- **Desktop:** KPI strip 4 (Всего задач, Активные, Следующий запуск, Источники) — only four, no sparklines; Panel «Задачи» = DataTable: Название + purpose line, Cron (mono) + human text («каждые 5 минут»), Следующий запуск, Последний запуск (time + result chip), Длительность, Статус, switch «Вкл.», `⋯`. Row opens inspector 440 px with **tabs Обзор · Логи · Настройки**: Обзор = key/value (Расписание, Источник, Следующий, Последний, Длительность, «Что делает задача» list), Логи = last 10 runs as rows (time, result chip, duration, short message, «Копировать id»), Настройки = read-only retries (3 attempts, 30 s, timeout 2 min) with «Изменить» disabled-with-reason «Превью».
- **375:** row cards (name, status chip, switch 44 px, meta line «каждый час · след. 21:00»); inspector as sheet with the same three tabs as segmented; KPI 2x2.
- **Safe enable/disable (the point of the preview):** the switch never acts on tap. Turning **off** opens a dialog «Остановить задачу «Очередь публикаций»? Запланированные посты перестанут уходить в Telegram, пока вы её не включите.» [Остановить] [Отмена] (names the effect); after confirm, switch moves, status «Выключена», toast with undo 8 s «Задача остановлена · Вернуть». Turning **on** needs no confirm, but shows toast «Задача включена, следующий запуск 21:08». Critical job (publication queue) additionally shows banner in the inspector while off: «Публикации по расписанию не отправляются». Disabled while pending; `aria-checked` + visible text, not colour only. «Запустить сейчас» in `⋯` opens confirm that names effect (mock).
- **States:** loading = KPI 4 x 96, 7 rows x 56 px; empty = «Задач пока нет» (explains: they appear when automations are configured); error = ErrorState at table height; partial = one row «Статус неизвестен» (muted chip, switch disabled); stale run = chip «Не запускалась 40 мин» warning; failed last run = chip «Ошибка» + «Открыть логи» in `⋯`.
- **Mock data:** 7 jobs (queue every 5 min, Dota source import every 15 min, patch notes hourly, analytics snapshots daily, media cleanup, retry processing disabled, one failed), 10 runs each, deterministic durations.

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
