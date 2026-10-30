# Area plan: design system for «Рубрики» (design-system engineer, 30.10.2026)

Planning only. Nothing outside this file was changed. Inputs: `ui-mock/` (mock.css, app.js, overlap-check.mjs, contact.png), `ui-ia.md`, `architect-plan-v2.md` (L7 badge list, v2.1), `docs/RUBRICS_SCHEDULER.md` (common mechanisms), `docs/design/README.md`, `tokens.css`, `shared/ui/*`. The mocks are static HTML on fake data; the real app is React Aria + CSS Modules + tokens, so every mock rule below is checked against the real primitives before it is reused. Contrast numbers were computed from the real `tokens.css` values (WCAG 2.x luminance formula, alpha tints composited over the surface they sit on); they are measurements, the implementer re-runs them via the audit test in section 8.2.

## 1. Decisions (short)

1. Reuse first. New global tokens: only `--color-heat-0..4` (section 2). No other token.
2. Seven new `shared/ui` primitives, five extensions of existing ones (section 3). Everything specific to rubrics (copy, thresholds such as «< 3 постов», row assembly) stays in `features/rubrics`, never in `shared/ui`.
3. Slot/rubric badges extend `status-meta.ts` (one status set, one `StatusBadge`), flat 22 px / `--radius-1` / no ring as README says. The mock's pill + ring badge is not used.
4. Slot labels follow the canonical `page-spec` mapping where a slot mirrors a publication: sent = «Опубликовано», unknown = «Требует проверки», released = «Публикуется». The mock's «Отправлено / Не подтверждено / Отправляется» (and architect L7 list) are replaced. Owner can overrule (Q3).
5. One bar for «× к обычному» everywhere: `RatioBar`, diverging from a centre line at ×1,0 (two sizes). The mock's second form (`.xbar` filling from the left, rubric list) is dropped.
6. Layout reflow is by container width (agenda rows, comparison rows, 2-column calendar), not viewport width, so the same component works in the 300 px agenda column, the 1000 px list and a 375 px phone.
7. Nothing text-bearing is dimmed by `opacity` or `--color-text-disabled` (both fail 4.5:1, measured below). Past days, forecast, «мало данных» and skipped use muted text colour + a shape or a word.
8. The overlap check becomes a permanent Playwright guard against the real app and a stress catalog (section 8), plus a token contrast audit that runs inside `npm run test`.

## 2. Tokens

### 2.1 Reused as is (no change)
Surfaces `--color-bg|surface-1|2|3`; borders `--color-border-subtle|strong`; text `--color-text|text-muted`; accent `--color-accent|accent-text|accent-soft|on-accent|focus-ring`; status groups `--color-status-{pending,active,done,retry,failed,unknown,muted}-{fg,bg,ring}`; `--font-size-2xs..xl`, `--font-weight-*`, `--font-mono` (times, ×-values, tabular), `--space-1..8`, `--radius-1|3|4|pill`, `--size-control|button|row|target|target-min`, `--measure-content`, `--motion-fast|base` (0 under reduced motion), `--z-*`, `--focus-ring-width|offset`. Up/down meaning reuses `--color-status-done-fg` / `--color-status-failed-fg` exactly as Progress, Timeline, Toast and UploadRow already do (no new `--color-delta-*`).
Kind mark (picture/text, 28 px square in the mock) = existing `IconBadge size="sm"` (32 px; `image` icon with tone `accent` for a picture, `list` icon with tone `muted` for text; `IconBadge` tone accepts any `StatusGroup` or `accent`). The agenda's kind column is therefore 32 px, not 28.

### 2.2 New tokens (justified)
Only the heat-map ramp, in the single token file, after the accent blocks:
```
--color-heat-0: var(--color-surface-2);
--color-heat-1: color-mix(in oklab, var(--color-accent) 14%, var(--color-surface-2));
--color-heat-2: color-mix(in oklab, var(--color-accent) 28%, var(--color-surface-2));
--color-heat-3: color-mix(in oklab, var(--color-accent) 42%, var(--color-surface-2));
--color-heat-4: var(--color-accent);          /* text on it: --color-on-accent; bins 0-3 use --color-text */
```
Why tokens and not an inline `color-mix(... pct%)` per cell (the mock): (a) five discrete bins are readable and make the legend exact; (b) the ramp follows all 8 presets and the custom colour; (c) the audit test can check every bin x theme x preset. Why top bin = solid accent: measured contrast of `--color-text` on an accent mix collapses for light accents. Dark `graphite` accent `#e4e4e7`: text on 45% = 4.5, on 60% = 2.9 (fails). Solid accent with `--color-on-accent` is guaranteed >= 4.5 by the presets and by `derive-accent.ts` (blue dark 5.17, blue light 7.08). The audit may lower bin 3 from 42% if any preset/theme lands below 4.5.
Component-scoped values (custom properties inside the component CSS, not global): dot size 9 px (7 px under 860 px), heat cell height 30 px, bar heights 6 px (`sm`) and 14 px (`md`), agenda columns (time 52/56 px, kind 2rem). Container-query breakpoints (560, 540, 820 px) are literals because custom properties cannot appear in `@container` conditions; they are named in a comment at the top of each module.
Not added: `--color-anchor`, `--color-event` (mock tinted anchor chips with the `unknown` amber, which means «needs attention»; both anchor and event chips use `accent-soft` + an icon, text says which), any z-index, any radius, any shadow.

### 2.3 Measured contrast (computed from tokens.css; dark / light)
| Pair | Dark | Light | Verdict |
|---|---|---|---|
| `text-muted` on surface-1 / 2 / 3 | 7.36 / 6.91 / 6.18 | 6.32 / 5.75 / 5.22 | ok >= 4.5 |
| `text-disabled` on surface-1 / 2 | 3.17 / 2.98 | 2.79 / 2.54 | FAIL: mock used it for «мало данных» values and bars. Banned for information. |
| `text-muted` at `opacity:.6` (mock past days) | 3.38 | 2.63 | FAIL: no opacity on text, ever |
| status fg on its own tint over surface-1 (min over 7 groups) | 6.20 (muted) | 5.65 (done) | ok badge text |
| status fg on tint over surface-2 (agenda `.repl` rows, `.sc`) min | 5.72 | 5.18 | ok |
| status dot (non-text) vs surface-1 / 2, min over groups | 7.55 / 7.09 | 6.60 / 6.01 | ok >= 3 |
| status dot at `opacity:.45` (mock forecast) vs surface-1 | 2.46..3.19 (muted/failed < 3) | 2.05..2.35 | FAIL: forecast uses a ring shape, not opacity |
| `.sc.s-muted` at opacity .75 (text) | not measured, text-muted x .75 on surface-2 is below the 6.9 above by construction | | do not dim; use muted text + line-through + «Пропуск» word |
| accent vs surface-1 / 2 (selected-day ring, blue) | 3.65 / 3.43 | 7.08 / 6.44 | ok >= 3 |
| `--color-focus-ring` vs surface-1 (blue) | 8.82 | 7.08 | ok |
| bar fill done-fg / failed-fg at .85 over surface-2 | 8.16 / 6.04 | 4.43 / 5.24 | ok >= 3, but fills are solid in the real build |
| bar centre line `text-muted` 2 px vs surface-2 | 6.91 | 5.75 | ok |
| `border-strong` vs surface-1 | 1.83 | 1.67 | below 3: it is a decorative control border only; the calendar cell, heat cell and row separators carry no information through it |
| `--color-text` on heat-0..3, blue | 15.2 / 13.3 / 11.3 / 9.4 | 16.1 / 12.9 / 10.1 / 7.8 | ok |
| `--color-on-accent` on heat-4 (blue) | 5.17 | 7.08 | ok |
| `--color-text` on 45% / 60% accent mix, dark graphite | 4.5 / 2.9 | n/a | why bin 4 is solid accent and bin 3 stops at 42% |
Non-blue presets were not individually measured (my preset parser matched the wrong blocks): the audit test must cover all 8 presets x 2 themes and the custom preset path.

## 3. Primitives

All typed, named exports, CSS Modules, React Aria where behaviour is needed (skill `react-aria`), no new library. Exports added to `shared/ui/index.ts`. Check for near-duplicates done: nothing in `shared/ui` renders a day grid, an agenda row, a centred ratio bar or a heat grid; `DateTimeField`'s popover calendar is a picker, not reused.

### 3.1 New

**MonthCalendar** (`MonthCalendar.tsx/.module.css`). A 5-week (configurable `weeks`, default 5) Monday-first window, not a calendar month: the mock shows `26 окт - 29 ноя` for today Fri 30 окт. Base: React Aria `Calendar`/`CalendarGrid`/`CalendarCell` for the APG date-grid keyboard model, `visibleDuration={{ weeks: 5 }}`, `selectionAlignment="start"`, time zone `Europe/Moscow` via `@internationalized/date` (`today('Europe/Moscow')`), locale `ru-RU` (Monday first). Spike first (Q7): confirm `visibleDuration` with weeks and a custom window start work in the installed `react-aria-components` 1.21.x; fallback is a hand-written `role="grid"` with roving tabindex (same keys), same props.
Props: `startDate: CalendarDate`, `weeks?: number`, `today: CalendarDate`, `value: CalendarDate` (selected day, default today), `onChange`, `days: Record<IsoDate, DaySummary>`, `isLoading`, `onWindowChange?(direction)`, `aria-label`. `DaySummary = { dots: readonly DotKind[]; count: number; flag?: 'replaced' | 'moved' | 'skipped'; forecast?: boolean }`; `DotKind` is the `StatusGroup` plus shape: `'done' | 'pending' | 'active' | 'attention' | 'muted'`.
Cell anatomy: day number (mono; `--color-text-muted` for past days, never opacity; today = accent pill `on-accent`, 22 px high), optional flag icon (`swap` replaced, `arrow-right` moved, `minus-circle` skipped; 18 px desktop, 14 px phone; decorative), dots row (max 6, then `+N` text on desktop, `…` on phone), count line `4 поста` (desktop only, `text-muted`, `2xs`/`xs`).
Dot shapes (so colour is not the only signal): filled circle = done, pending, active; rounded square = `attention` (failed, unknown, unresolved, missed); ring = muted (skipped, cancelled) and every forecast dot (ring in the pending hue). The whole cell is the only interactive element; dots are `aria-hidden`; the cell's accessible name is built by the feature: «Пт 30 октября: 4 слота, 1 опубликован, 1 заменён, 1 собирается, 1 запланирован». Forecast cells append «прогноз, может измениться».
Size: desktop cell min 96 px high, 7 equal columns (`minmax(0,1fr)`); phone (< 860 px) min 64 px high, 7 columns in 351 px = 50 px wide: both >= 44 px targets. Selected = `--color-accent-soft` fill + 1 px accent inset; `data-focus-visible` = 2 px `--color-focus-ring` outline, `outline-offset: -2px` (the grid has `overflow: hidden` for rounded corners, so an outer ring would be clipped: the mock's `.mc.sel` 2 px accent inset would also collide with the focus ring).
States: default, hover (surface-2 fill, pointer only), focus-visible, selected, today, past, forecast, empty day (no dots, number only), loading (35 skeleton cells of identical geometry), error (the page shows the error state, the primitive is not drawn). Disabled: days outside the window do not exist.
Keys (APG grid): arrows +-1 day / +-7 days, Home/End start/end of week, PageUp/PageDown previous/next window, Enter/Space select, Tab leaves the grid (one tab stop). Selected-day change updates the agenda heading (`aria-live="polite"`).
Reduced motion: no transitions beyond `--motion-fast` (0 under reduce).

**Agenda** (`Agenda.tsx/.module.css`): `AgendaList` (`ul`, `container-type: inline-size; container-name: agenda`, owns border/radius/overflow) + `AgendaRow` (`li`). Rebuilds the mock's `.slots/.slot`.
`AgendaRow` props: `time: string` (already formatted MSK), `kind: 'picture' | 'text'`, `title: string`, `reason?: ReactNode` (one or more `ReasonChip`), `status: StatusKey`, `note?: string`, `onPress?`, `trailing?: ReactNode` (outside the pressable area, like `RowCard.menu`), `flags?: { replacement?: boolean; moved?: boolean; skipped?: boolean; live?: boolean }`.
Reflow by container width (no media queries inside):
- default (container < 560 px): 3-column grid `time 52px | kind 2rem | 1fr`; the title row, then the reason chips, then the status badge, then the note, each in column 3 (so a 300 px agenda column and a 375 px phone are identical).
- container >= 560 px: 4th column `auto` for the badge, which spans the title and reason lines; the note spans columns 3-4; time column 56 px.
Text rules: title weight medium, `overflow-wrap: anywhere` (never ellipsis: names such as «Переводчик с токсичного» must stay whole); chips `white-space: normal`; skipped/failed rows: `--color-text-muted` + `line-through` on the title (never opacity); replacement row = surface-2 fill; the live (building) row = 3 px accent inset on the leading edge plus the `Собирается` badge (colour is not the only signal).
Row height >= `--size-row` (44 / 52 px). If `onPress` is set the title area is a button (RAC `Button`, `data-focus-visible` ring offset -2) filling the row height; secondary actions go in `trailing` as their own 44 px targets (e.g. «Открыть публикацию», «Сверить»). Day grouping (Список view): the feature renders `h2` per day (`Пт 30 окт · сегодня`, count in `text-muted`), each followed by an `AgendaList`; today's heading uses `--color-accent-text`.
States: every `StatusKey` below; loading = `n` skeleton rows of the same min height (rows keep a 2-line height reserve so the day block does not jump more than the note line); empty day = `EmptyState` compact «На этот день ничего не запланировано».

**ReasonChip** (`ReasonChip.tsx`, inside `Agenda.module.css` or own file): the «why» pill: `tone: 'neutral' | 'accent'`, optional `icon` (`clock` rest, `bell` event, `calendar` anchor). 22 px high, `--radius-1`, 2xs text; neutral = surface-2 + subtle border + `text-muted`; accent = `accent-soft` + `accent-text`. Multiple chips wrap. Non-interactive. Replaces the mock's `.chip` / `.chip.ev` / `.chip.an` (amber anchor dropped).

**RatioBar + RatioValue** (`RatioBar.tsx/.module.css`): the «×» bar centred on 1.0. Props: `value: number | null`, `size: 'sm' | 'md'`, `few?: boolean`, `maxDeviation?: number` (default 1.3: x = 2,3 or 0,0 reaches the end; mock factor 38 %/unit gives 50 % at 1,31). Anatomy: track `--color-surface-3` (`sm`: 6 px high, max 60 px; `md`: 14 px high, fluid), 2 px centre line `--color-text-muted`, fill from the centre: right and `--color-status-done-fg` when >= 1, left and `--color-status-failed-fg` when < 1, solid (no opacity); a value clamped at the end shows a small end cap. Fill length < 2 px at ×1,0 shows the centre line only. `few`: fill `--color-status-muted-fg`, value in `--color-text-muted` (not text-disabled), caption «мало данных». `null`: «—», no bar (stat not computable).
`RatioValue`: `×1,9` in mono, `Intl.NumberFormat('ru-RU', 1 decimal)`; visible text `aria-hidden`, plus `VisuallyHidden` «в 1,9 раза от обычного поста» (fractional numbers take genitive singular «раза»), `few` appends «, мало данных». The bar itself is `aria-hidden` (the value is adjacent text).
Why not extend `BarChart`/`Progress`: those are 0-based; this is signed around a baseline, 20 lines of CSS.

**HeatGrid** (`HeatGrid.tsx/.module.css`): day-of-week x hour learned-hours map (stage 7/8 «Часы» block). Props: `rows: readonly string[]` (Пн..Вс), `cols: readonly number[]` (hours 8..23), `cells: Record<string, { bin: 0|1|2|3|4; label: string; value?: string; peak?: boolean; trial?: boolean; few?: boolean }>`, `aria-label`, `legend`.
Cell: 30 px high (44 px on touch), colour `--color-heat-<bin>`, value printed inside (`1,4` mono 2xs, colour `--color-text`, bin 4 `--color-on-accent`) so colour is not the only signal; `peak` = `star` icon + 2 px inset ring in `currentColor`; `trial` (learned-hours experiment) = 1 px dashed inset ring in `currentColor`; `few` (< 3 posts) = bin 0, text `·`, caption in legend. Rings are `currentColor`, so contrast equals the text-on-fill pair (>= 4.5), not the 1.7:1 `border-strong` of the mock.
Layout by container width: wide (>= 560 px): hours across, 16 columns, days down. Narrow (< 560 px): transposed (days across = 7 columns of ~44 px, hours down = 16 rows): no horizontal scroll at 375 (the mock's `min-width: 560px` + `overflow-x: auto` scroller is dropped; the guard would have to whitelist it).
Semantics: `role="grid"`, `role="gridcell"` with roving tabindex, arrows/Home/End/PageUp-Down (APG grid), cell `aria-label` «Пн, 19:00: ×1,4, 6 постов, выученный пик». Pointer/focus hint via the existing `Tooltip`. Legend below: swatches heat-0..4 (labelled «хуже … лучше»), ★ «выученный пик», dashed «пробный час», `·` «мало данных»; plus the feature offers «Таблицей» (a `DataTable` of the same cells) as the non-visual alternative.
States: loading (skeleton grid same geometry), empty («Часы пока не выучены: нужно больше постов» via `EmptyState`), few, ready.

**SliceCard** (`SliceCard.tsx/.module.css`): one «Срез рубрики» card: `title` (h3), `rows: { id; label; caption?; value: number | null; n: number; few: boolean; mark?: 'best' | 'worst' }[]`. Row grid `minmax(0,1fr) | minmax(48px,.8fr) | 52px` (label+caption, `RatioBar md` track, `RatioValue`), min 44 px high, separators `--color-border-subtle`. Label wraps to 2 lines (`overflow-wrap:anywhere`, no ellipsis: a joke line like «Крикни ему в ухо» is the content); caption: «N постов» + « · лучший» / « · худший» / « · мало данных». Best/worst are shown with an arrow icon (`arrow-up` / `arrow-down`, 12 px) and the word, not colour alone. Sort: non-`few` by value desc, `few` rows last. Best/worst never come from a `few` row. Grid container: `repeat(auto-fit, minmax(min(100%, 270px), 1fr))` in the feature's layout.

**ComparisonRow** (`ComparisonRow.tsx/.module.css`) + `ComparisonList` (container-query host): the post-by-post row (`.cp`): `when` (mono, `Пт 30 окт, 19:00`), `title` (hero) + `subtitle` (bank line, wraps) + optional `Лучший`/`Худший` `StatusBadge`-style tag (`done` / `failed` group, text + icon), kind `IconBadge`, `RatioBar md`, `RatioValue`. Container >= 540 px: 5 columns `92px | 1fr | 2rem | minmax(72px,150px) | 56px` with a header row; < 540 px: two-line card (`when` + kind + value on line 1, hero/line on line 2, bar full width on line 3), header row hidden. Best row = `--color-status-done-bg`, worst = `--color-status-failed-bg` (text stays `--color-text`; tag word and icon carry the meaning). Lives in `shared/ui` (not the feature) because the mock reuses it in the rubric card and the Сравнение tab and the repo forbids ad-hoc sizes in features.

### 3.2 Extensions of existing primitives
1. **`status-meta.ts` + `StatusBadge`** (no new component): add keys to `StatusKey`; labels in `ru.status` (`shared/lib/ru.ts`, a one-line coordination edit outside `shared/ui`, copy owned here).
 | key | label | group | icon | note |
 |---|---|---|---|---|
 | `scheduled` (existing) | Запланировано | pending | clock | slot `planned` |
 | `building` | Собирается | active | loader | slot `building` (static under reduced motion, as `Spinner`) |
 | `ready` | Готово к выходу | pending | check | slot `ready`; same group as planned: it will go out |
 | `waiting_parent` | Ждёт предыдущий пост | pending | more | series follow-up |
 | `sending` (existing) | Публикуется | active | loader | slot `released` |
 | `sent` (existing) | Опубликовано | done | check-circle | slot `sent` |
 | `partial` | Вышло частично | unknown | alert | picture sent, poll not |
 | `unknown` (existing) | Требует проверки | unknown | help | owner reconciliation; link «Сверить» |
 | `unresolved` | Не сверено | unknown | alert | closed at 72 h |
 | `failed` (existing) | Ошибка | failed | x-circle | slot `send_failed` |
 | `missed` | Не вышло в срок | failed | x-circle | `RELEASE_LATE`, `NOT_BUILT_IN_TIME`, deleted publication |
 | `skipped` | Пропуск | muted | minus-circle | slot `empty`: content skip is not a failure (owner rule) |
 | `yielded` | Уступил | muted | minus-circle | final gate lost to another post |
 | `superseded` | Заменён | muted | swap (new icon) | patch version change, re-plan |
 | `cancelled` (existing) | Отменено | muted | minus-circle | |
 | `forecast` | Прогноз | muted | calendar | read-only 35-day forecast, dashed variant: `data-variant="dashed"` draws a 1 px dashed ring instead of fill, so it is never mistaken for a planned slot |
 | `rubric_active` | Активна | done | check-circle | rubric list |
 | `paused` (existing) | На паузе | muted | pause | |
 | `rubric_waiting` | Ждёт события | pending | clock | mock used amber (`unknown`): amber means «needs attention», wrong here |
 | `bank_empty` | Банк исчерпан | unknown | alert | owner mechanism: guessing rubrics pause; joke banks run a new round |
 | `needs_browser` | Нужен Browser Rendering | muted | alert | capability map (H7); no notices, not a failure |
 Replaced/moved are modifiers (row flag + `swap`/`arrow-right` icon), not statuses; «Вручную» (owner rescheduled, N4) is a `ReasonChip`.
2. **Switch**: add `isPending` (saving): the control stays focusable (`aria-busy`, press ignored, small `Spinner` in the thumb, label suffix «Сохраняю…» via `description`), never `isDisabled`, so focus is not lost mid-save. States the feature maps: on, off, DEV-unavailable (`isDisabled` + a separate non-disabled `Banner info` / description with ≥ 4.5:1 text), Cron-off (on + `Banner warning`: «Выключено в „Фоновых задачах“: рубрики не выйдут»), saving, error (`Banner error` with `requestId`), 409 (`Banner conflict`, edit kept).
3. **DataTable**: new optional prop `cardsBelow?: string` (media query, default `(max-width: 859px)` unchanged). The rubric list has 6 columns (minimum ~870 px of table); with the 232 px sidebar the frame would scroll sideways between 860 and about 1150 px viewport width, which the mocks never showed (they checked 375/1280/1920 only). The rubrics page passes `(max-width: 1149px)`; the exact threshold is measured, not guessed (Q6).
4. **Tabs**: no API change. «Календарь / Рубрики / Сравнение / Комментарии» must fit 375 and 320 px without sideways scroll (existing `max-width: 479px` padding rule helps); the guard asserts `tablist.scrollWidth <= clientWidth`. If it fails at 320: shorten the label («Отклик») rather than allow a hidden scroller. Until stage 7 only three tabs exist.
5. **Icon**: add `swap` (replaced) and `star` (peak). Moved reuses `arrow-right`, nav entry reuses `list`. No other icons.

### 3.3 Not built (decisions)
- No `Chip`/`Tag` generic component beyond `ReasonChip`; no `KindMark` (use `IconBadge`); no separate week-column card (`SlotCard`): see Q1.
- Mock `.seg` (spans) is the existing `SegmentedControl` (RadioGroup: Месяц/Неделя/Список, 7д/30д/90д, Между рубриками/Внутри рубрики); mock `.tabs` (underline) is the existing bordered `Tabs`; mock `.sw` is `Switch`; mock `.btn` is `Button`; mock `.pick` combobox is the existing `Select`/`ComboBox`; mock `.kv/.kv4` is `StatGrid`/`StatTile`; mock `.rule` list is `Panel` + `PanelRow` + `Progress` (pool coverage bar «74 из 126 героев»); mock `.hist` is `Timeline`; comments chips use `ReasonChip`. The mock's `.bnav`, `.side`, `.mockbar` are mock-only: the real shell is reused (bottom bar, sidebar, nav entry `to: '/rubrics', icon: 'list', primary: false`).

## 4. Screen layouts (container-driven; viewport checks 375, 768, 1024, 1280, 1920; plus 320 for no-hscroll)
Content column is `--measure-content` (1200 px) centred, so 1920 renders as 1280 with larger margins: the guard still runs it (wide-only overflow, e.g. 7 week columns).

| Screen | 375 / phone (< 860) | 1280 | 1920 |
|---|---|---|---|
| Shell | `PageHeader`, `Tabs`, content padding bottom = bottom bar + safe area (not the mock's 96 px constant) | sidebar 232 + content 1000 | same column, 1200 max |
| Календарь | master card (switch row; meta shows only «Следующий выход», Cron-off and DEV as Banners, never hidden), toolbar: range label + view `SegmentedControl` (44 px), `MonthCalendar` 50x64 cells, dots 7 px, no count line; agenda below, default selected = today so no scroll is needed after load; «Что поменялось» list below | master card one row; two columns when the page container >= 820 px (container query on the page wrapper, not viewport 1100): calendar `1.7fr`, agenda `1fr` (agenda column ~380 px = narrow tier); calendar cells ~88x96, dots 9 px, count line | same as 1280 (max 1200) |
| Список | `h2` per day + `AgendaList` narrow tier | full-width `AgendaList` >= 560 px container, badge in the 4th column | same |
| Неделя (optional, Q1) | single column = Список | 7 columns >= 1180 px viewport; row in a ~150 px column uses the narrow tier | same |
| Рубрики (list) | `DataTable` cards (label: value pairs), `RatioBar sm` | table, 44 px rows, `cardsBelow` threshold measured | same |
| Карточка рубрики | page (list -> detail, `BackButton` per Telegram rules): `StatGrid` 2 columns, comparison rows two-line, slices 1 column | two columns (`1.6fr | 1fr`) when container >= 820 px: left comparison + slices, right rules, rest history, comments | same |
| Сравнение | `SegmentedControl` (Между рубриками / Внутри рубрики) full width; ranking rows `22px | 1fr | 56px` with bar on its own line | ranking + heat map side by side (container >= 820 px) | same |
| Комментарии (stage 7) | `Panel` rows; chips wrap | two columns | same |
Mini App: same SPA; safe-area padding via the existing layout; Telegram `BackButton` on the card page is the layout's job.

## 5. State matrix per primitive (what each looks like)
| Primitive | default | hover | focus-visible | disabled | loading | invalid / error | empty / few / stale |
|---|---|---|---|---|---|---|---|
| MonthCalendar cell | number, dots, count | surface-2 fill (fine pointer) | 2 px focus ring inset | n/a (cells outside window do not exist) | 35 skeleton cells, same geometry | page-level `ErrorState`/`Banner error` | empty day = number only; forecast = ring dots + «прогноз» in name; `StaleRegion` dims while refetching |
| AgendaRow | 3-col / 4-col by container | surface-2 (only if pressable) | 2 px ring on the pressable area | n/a | skeleton row, min height | status badge `failed`/`missed` + `note` with the Russian cause and `requestId` where it exists | skipped/yielded = muted + line-through |
| StatusBadge keys | tinted fill + icon + word | none | none (non-interactive) | n/a | `building`/`sending` spinner | `failed`/`missed` red tint | `forecast` dashed |
| Switch | on / off | track border strong | 2 px ring | `isDisabled` (DEV) with readable reason | `isPending` | Banner error, 409 Banner conflict | Cron-off Banner |
| RatioBar/Value | centred bar + `×1,9` | none | none | n/a | `Skeleton` 60x6 / fluid | n/a | `few`: muted fill + «мало данных»; `null`: «—» |
| HeatGrid | filled bins with values | tooltip | 2 px ring (roving) | n/a | skeleton grid | n/a | `few` cell `·`; empty `EmptyState` |
| SliceCard / ComparisonRow | rows | none | pressable row only if linked | n/a | skeleton rows | n/a | `few` rows last, never best/worst; <3 posts whole card: `EmptyState` + `Progress` «1 из 3 постов» |
Whole-page states come from skill `page-spec` (loading, empty, error, unauthorized, ready, stale label «Обновлено …»), not repeated here. «мало данных» is always visible words + muted colour; it is a count threshold in the feature model (`< 3`), not styling logic.

## 6. Keyboard and focus
- One tab stop per composite (calendar grid, heat grid, `SegmentedControl` group, `Tabs` list); arrows inside, Tab leaves (APG).
- Focus ring always `--focus-ring-width` 2 px in `--color-focus-ring`, inset inside clipped containers (`overflow: hidden` on the calendar, agenda list and heat grid: use `outline-offset: -2px`).
- Nothing sticky is introduced: the mock's sticky agenda (`top: var(--space-4)`) would slide under the real sticky top bar and hide focus (2.4.11); it is not built. The only fixed element is the existing bottom bar; the guard checks that a focused element is never covered by it.
- Day selection: Enter/Space on a cell selects; the agenda heading is `aria-live="polite"` (announces «Пт 30 октября, 4 слота»). Focus is never moved on selection.
- Row actions in `trailing` (open publication, reconcile) are real links/buttons >= 44 px on touch, >= 24 px desktop; no hover-only controls (touch has no hover).
- Dialogs/sheets used by the pages (rubric settings, «Свои метки», slot detail) reuse `Dialog`, `BottomSheet`, `Drawer`: Esc closes, focus returns to the trigger.
- Reduced motion: no animation except the existing static-partial-ring spinner; calendar/heat transitions use `--motion-*` (0).

## 7. Copy owned by the design system (RU strings the primitives need; page copy stays with frontend)
Status labels in 3.2; legend: «вышло», «запланировано», «собирается», «ошибка», «пропуск», «прогноз, меняется»; «мало данных»; «×» formats; `ReasonChip` texts come from the feature («Отдых прошёл: 18 д», «Событие: патч 7.41», «Якорь: Хэллоуин, 21:00», «Раз в неделю · 5 д назад»). Comments retention line: placeholder `ru.rubrics.comments.retention`, text **ждёт владельца** (7-day comment text retention is an open owner question; the tab's empty/limited states are specified without that sentence).

## 8. Permanent guards

### 8.1 Overlap / overflow guard (from `ui-mock/overlap-check.mjs`)
Keep the mock's three probes (text-rect overlap with clip-aware rects, sibling-box intersection, element overflow, page hscroll) and make it a real, repeatable check:
- Files: `apps/frontend/e2e/support/overlap-probe.ts` (the in-page function, pure, importable), `apps/frontend/e2e/overlap-check.ts` (test), `apps/frontend/playwright.overlap.config.ts` (copy of `playwright.layout.config.ts`: production build + `vite preview` on its own port), script `"overlap:check": "playwright test --config playwright.overlap.config.ts"` in `apps/frontend/package.json`. It runs against the real app with `mockApi` fixtures and against the stress catalog (8.3), never against `file://` mocks.
- Matrix: pages `/rubrics` (every tab and view: Месяц, Неделя if built, Список), `/rubrics/:key`, `/rubrics?tab=compare` both modes, `/rubrics?tab=comments`, plus the catalog route; widths 320, 375, 768, 1024, 1280, 1920; dark at all widths, light at 375 and 1280; reduced motion on at 375. Wait for `document.fonts.ready` (Onest wraps differently before the font loads; the mock waited a fixed 150 ms) and web-first assertions, not sleeps.
- Additions the mock lacks:
 1. Vertical clip: `overflow: hidden` with `scrollHeight > clientHeight + 1` (cards cutting text), not only horizontal.
 2. Ellipsis audit: every element with `text-overflow: ellipsis` must have `title` or `aria-label` equal to its full text; rubric names, bank lines and reasons must wrap instead (the guard counts ellipsised elements per page and fails on any inside `AgendaRow`, `SliceCard`, `ComparisonRow`).
 3. Deliberate scrollers are not exempt by default: only elements carrying `data-scroll-region` (with `tabindex=0`, `role="region"`, `aria-label`) are skipped; `tablist` is never exempt (hidden tab scroll fails).
 4. Target size: every visible interactive element (button, link, `[role=tab|switch|gridcell|radio|combobox]`) >= 24 px, and >= 44 px under 860 px for primary controls (calendar cell, row, switch, tabs, segmented control).
 5. Focus not obscured: tab through the first N stops per page, and after each focus assert the element rect does not intersect any `position: fixed|sticky` bar (bottom bar, top bar).
 6. Fixed bars are not excluded from the content check any more: the last content block bottom must be above the bottom bar top (the mock hid fixed elements from overlap testing).
 7. No hscroll at 320 (WCAG 1.4.10), `documentElement.scrollWidth === clientWidth`.
- Stress fixtures (in the catalog and in `mock-api`): 30 rubrics incl. the longest names («Переводчик с токсичного», «Инструкция по применению»), a day with 7 slots (dot cap + `+N`), every `StatusKey`, a 3-line note, a reason with 3 chips, replaced + moved + skipped on one day, ×0,0 / ×1,0 / ×2,3+ / `null` / `few`, 5 digits post counts, a 60-character hero/bank line.
- Exit: non-zero on any finding; findings print selector, text excerpt, width, theme. Reports to `.logs/overlap.txt`. Run by the implementing agent before reporting any `shared/ui` or `features/rubrics` change; it is not part of `npm run verify` (verify has no browser step; `layout:check` and `shots` are manual in the same way).
- Wiring (stage task, touches instruction files so done deliberately in its own commit, then `npm run agents:sync`): `.agents/skills/visual-check/SKILL.md` step 6 gets «`npm run overlap:check -w @alexeev/frontend` must print `TOTAL issues: 0`», `apps/frontend/AGENTS.md` «Responsive» line gets the same sentence, and `e2e/layout-stability.ts` PAGES gains `/rubrics`, `/rubrics?tab=rubrics`. The probe is also reused by `e2e/shots.ts` so screenshots are only taken after a clean probe.

### 8.2 Token contrast audit (runs in `npm run test`)
`apps/frontend/scripts/rubrics-contrast.test.mjs` (the `node --test scripts/*.test.mjs` glob already picks it up). Parses `tokens.css` per theme x accent preset (8 presets x 2 themes, plus the `--custom-*` path through `shared/lib/color/derive-accent.ts` sample colours), composites alpha tints over the surface they are drawn on, and asserts: text pairs >= 4.5 (`text` and `text-muted` on surface-1/2/3, status fg on its tint over surface-1/2, `text` on heat-0..3, `on-accent` on heat-4); non-text >= 3 (status dots on surface-1/2, accent vs surface for the selected-day ring, focus ring); and the banned pair `--color-text-disabled` is not referenced from `shared/ui/{MonthCalendar,Agenda,RatioBar,HeatGrid,SliceCard,ComparisonRow}.module.css` (grep assertion), nor `opacity:` on text-bearing selectors there. It also complements `colors-only-in-tokens.test.mjs` (no colour literal outside tokens).

### 8.3 Catalog (decision needed, Q4)
`docs/design/README.md` and DECISIONS (03.10.2026) promise a dev-only `/__catalog`, but there is no such route in `apps/frontend/src` (grep: only a doc line and a `catalog` word in unrelated mock data). Recommendation: build a minimal dev-only `/__catalog` containing only the new and changed primitives with static props (every `StatusKey`, calendar with 0/1/3/7 dots + flags + forecast, agenda tiers at forced container widths 300/560/900, `RatioBar` edge values, heat grid both orientations, `Switch` pending/disabled/error). Reason: real data seldom produces the rare states (unresolved, bank_empty, clamped bars, 7 slots, 60-char lines), and the overlap guard needs deterministic stress input. It is excluded from the production bundle by `import.meta.env.DEV`/lab-build gating and a check like `scripts/check-no-lab.mjs`. If the owner declines, the README line must be corrected in the same change (docs state only what exists) and the stress fixtures live in `mock-api` only.

## 9. Files to touch (design-system ownership unless marked)
New: `shared/ui/MonthCalendar.tsx` `.module.css`, `Agenda.tsx` `.module.css` (+ `ReasonChip`), `RatioBar.tsx` `.module.css`, `HeatGrid.tsx` `.module.css`, `SliceCard.tsx` `.module.css`, `ComparisonRow.tsx` `.module.css`; `apps/frontend/scripts/rubrics-contrast.test.mjs`; `e2e/support/overlap-probe.ts`, `e2e/overlap-check.ts`, `playwright.overlap.config.ts`; catalog route files (Q4) under `src/pages/catalog/` (path agreed with frontend; routing registration is frontend's).
Changed: `app/styles/tokens.css` (heat tokens); `shared/ui/status-meta.ts`; `shared/ui/Switch.tsx` `.module.css` (`isPending`); `shared/ui/DataTable.tsx` (`cardsBelow`); `shared/ui/Icon.tsx` (`swap`, `star`); `shared/ui/index.ts`; `docs/design/README.md` (token layer line for heat tokens; catalog line per Q4; status = also slot states) and `docs/design/ux/*` page file of the Рубрики screens (only together with the implementation, per ui-ia §6).
Not mine, requested from frontend/orchestrator: `shared/lib/ru.ts` (`ru.status` keys of 3.2, `ru.rubrics.*` page copy), `app/layouts/nav-items.ts` (entry), route and feature slice `features/rubrics/`, removal of `RubricsPanel` / `RubricsSettings` (ui-ia rules), `mock-api.ts` fixtures, `apps/frontend/package.json` script, `.agents/skills/visual-check/SKILL.md` and `apps/frontend/AGENTS.md` sentences (then `npm run agents:sync`).

## 10. Build order mapped to scheduler stages
- D0 (with stage 3, DEV forecast Календарь): heat tokens not yet needed; `status-meta` keys, `Switch.isPending`, `Icon` additions, `MonthCalendar`, `Agenda`/`ReasonChip`, overlap guard + contrast audit + catalog states for them.
- D1 (stage 4, Календарь/Рубрики with switch, prod go-live): `RatioBar`, `DataTable.cardsBelow`, rubric list statuses (`bank_empty`, `needs_browser`, `rubric_*`), rubric card layout from existing primitives.
- D2 (stage 7 analytics): `SliceCard`, `ComparisonRow`, comments states (limited sample, source not connected, retention line «ждёт владельца»).
- D3 (stage 8 learning): `HeatGrid` (learned/trial/peak), legend, table alternative.
Each step ends with: `npm run typecheck`, `npm run test` (incl. contrast audit), `npm run overlap:check`, `npm run shots` pages at 375/1280/1920 (shots currently covers 375/1280 only: add 1920 for `/rubrics*`), axe 0 violations (WCAG 2.2 AA) per page state, keyboard pass, `emulateMedia({ reducedMotion: 'reduce' })`.

## 11. Tests (design-system scope)
- Vitest + Testing Library: `StatusBadge` renders label/group/icon for every new key (table-driven, catches a missing `ru.status` key via the `Record<StatusKey,…>` type); `RatioBar` geometry (value -> side/length, clamp, `few`, `null`) and `RatioValue` Russian text («в 1,9 раза»); `MonthCalendar` keys (arrows, Home/End, PageUp/Down, Enter selects, one tab stop), accessible name built from props, dots `aria-hidden`; `HeatGrid` roving tabindex and cell names; `Switch.isPending` keeps focus and ignores press; `Agenda` renders the same DOM in both tiers (tier is CSS only: asserted in the guard, not jsdom).
- Playwright (`overlap:check`, axe, keyboard) as in section 8; not in `verify`.
- Contrast audit as in 8.2 (in `npm run test`).
No snapshot baselines are added now (skill `visual-check`: Docker-only baselines; owner's check is on real DEV).

## 12. Risks
1. `Calendar` `visibleDuration` weeks unproven in 1.21.x: spike first; fallback custom grid is ~120 lines but must be tested for APG keys.
2. Container queries: Telegram WebView on old Android/iOS lacks them (< Chrome 105 / Safari 16): the default (no query) styles are the narrow tier, so nothing breaks, only the wide tier is lost.
3. Per-preset heat contrast unmeasured (8 presets x 2 themes, custom colour): the audit may force lowering heat-3 or a preset change; custom colours from `derive-accent.ts` guarantee only on-accent/accent text, so bins 1-3 are checked against `--color-text` in the audit sample set only. A pathological custom colour may fail: the audit lists the failing hues and `derive-accent` gets a clamp (frontend/shared lib, flagged).
4. `DataTable.cardsBelow` threshold ~1150 px is an estimate (870 table + 232 sidebar + paddings): measure at 860..1200 in the guard.
5. Agenda rows have variable height (notes); skeleton-to-data shift is bounded by min heights but `layout:check` may report the block below: acceptable if < the existing tolerance, otherwise reserve 3 note lines.
6. Dot shapes at 7 px are small; the accessible name and the agenda are the real source, dots are a summary. If the owner finds shapes unreadable on a phone, the fallback is a per-day count badge, not more colours.
7. `status-meta` grows from 14 to ~28 keys; any key not in a `Record<StatusKey,...>` fails typecheck (intended). `partial`/`missed` vs canonical page-spec: add the new labels to `page-spec` mapping in the same commit so there is still one source.
8. Mock fidelity: the mock was approved visually; deviations (flat badge, one bar form, canonical labels, no sticky agenda, accent chips, transposed heat) are deliberate and listed above so the owner can veto any.
9. Overlap guard false positives: probe a2 (sibling boxes) can flag intentional overlays (tooltips, popovers, focus rings): popovers render in a portal and are excluded by `position: fixed|absolute` as in the mock; add `data-overlap-ok` as the only escape hatch, reviewed in code review.

## 13. Open questions
Q1 (owner): keep the «Неделя» view? Recommendation: ship Месяц + Список now; at 375 Неделя becomes the same single column as Список and at 1280 it adds little over month + day agenda, while costing a 7-column responsive layout. Built later only if wanted.
Q2 (owner, already open): comment text kept 7 days: **ждёт владельца**. Design carries a copy slot only.
Q3 (owner, low stakes): slot labels follow canonical «Опубликовано / Требует проверки / Публикуется» instead of the mock's «Отправлено / Не подтверждено / Отправляется». Recommendation: canonical (one mapping everywhere).
Q4 (owner): build the promised dev-only `/__catalog` (recommended, section 8.3) or correct the README.
Q5 (owner): anchor and event chips share the accent tone instead of the mock's amber anchor. Recommendation: yes.
Q6 (design/frontend, measure): `DataTable.cardsBelow` threshold and whether the sidebar collapses (56 px) before 1150 px.
Q7 (design/frontend, spike): `Calendar` with `visibleDuration` in weeks; also history paging: how far back the window pager may go (rubric slots kept; attempts 90 d), default back-limit proposed 90 days, forward limit = the 35-day forecast.
Q8 (architect/frontend): rubric status for «Ждёт события» vs «Активна» is derived server-side or client-side? Design needs the enum values of 3.2 (`rubric_active|paused|rubric_waiting|bank_empty|needs_browser`) in the contract view.

## 14. Handoff note for frontend (summary; the long form is this file)
- Use: `MonthCalendar`, `AgendaList/AgendaRow`, `ReasonChip`, `StatusBadge` (new keys), `RatioBar/RatioValue`, `SliceCard`, `ComparisonRow/List`, `HeatGrid`, plus existing `Tabs`, `SegmentedControl`, `Switch(isPending)`, `DataTable(cardsBelow)`, `IconBadge`, `StatGrid`, `Panel`, `Banner`, `EmptyState`, `Skeleton`, `Timeline`, `Progress`. Never pass raw colours or px; do not wrap any text in an opacity.
- Layout: calendar + agenda two columns only when the page container is >= 820 px; everything below that stacks; agenda/compare rows reflow by their own container (300 px column and 375 phone look the same). Default selected day = today.
- States: every slot status has a badge from the table in 3.2; skipped/yielded are muted + line-through, not errors; forecast is dashed + ring dots; «мало данных» is words + muted, never best/worst; Cron-off, DEV-unavailable and capability states are Banners, not hidden meta.
- Features own: the `< 3 постов` threshold, accessible names of calendar cells, copy, retention sentence (waiting for the owner), hours learned/trial flags.
- Verify before reporting: `npm run test`, `npm run overlap:check` (TOTAL issues 0), shots 375/1280/1920, axe 0, keyboard pass, reduced motion.
