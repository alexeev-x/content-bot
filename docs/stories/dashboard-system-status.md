# Dashboard: system status strip

Owner (verbatim): «ты на главную добавил этого бота, но некрасиво же, пусть ux/ui поразмыслят как проще, чтобы экономить место». Expert review, not validated. Replaces the two side-by-side cards («Состояние сервиса» + bot widget) on `/`.

## Decision
One **system strip** (`SystemStatus`) at the top of `/`, under the header. Never cards. Healthy = one quiet line; any problem = the same strip turns into one banner row with one action. Details open on demand. Service health and bot become *checks* inside one component; Cron last run and publishing on/off are added as more checks, not more widgets.

## Comparable products (convention, not look)
- GitHub Primer Banner: one tone-coded message with title, one primary action, compact layout ([primer.style/components/banner](https://primer.style/components/banner/react/latest)). Copy: tone + one action, compact variant.
- Vercel: status is reduced to a small dot/icon visible without opening anything; details live behind it (Geist guide, [blakecrosley.com/guides/design/vercel](https://blakecrosley.com/guides/design/vercel)). Copy: dot + short text when healthy.

## Healthy (32 px line, no card, no border box)
`● Всё работает` (dot `success` + text, `text-sm`, muted). Whole line is one button opening details. Right side: `Проверено 14:05` only at ≥768 px. Colour is never the only signal: text always present.

## Problem (one row, 40–44 px, tone background `warning`/`danger`)
`⚠ Бот не подключён` + button `Подключить` (primary action of the row) + `Подробнее` as text link on the left chip is replaced by tapping the text. One problem: its headline and its action (connect / reconnect / «Повторить»).
Several problems: `⚠ Требует внимания: 2` + button `Разобраться` (opens details list; each item has its own action). Tone = worst one (danger > warning). Rows never stack; the strip is always exactly one row (text truncates with ellipsis, full text in details).
Loading: 32 px skeleton line, `aria-busy`. Check failed to load: counts as a problem «Не удалось проверить» + `Повторить`.
Not offered: `Подключить` appears only when DTO state is `not_connected`/`other_address`; `not_configured` shows no action (owner fixes secrets), details list the missing names. During connect: button loading, no double submit; result by toast + strip returns to healthy line.

## Details
Desktop (≥768): popover anchored to the strip, ≤360 px wide. Phone / Mini App: bottom sheet (existing `Drawer`). Content = checks list, one row each: status dot, name, short state, row action.
Rows: «Сервис» (API, версия), «Бот» (@username / причина; reuse existing bot drawer content: webhook address, last error, pending updates, `BotConnection`), later «Автопубликация (Cron)» `последний запуск 14:05`, «Публикация» `включена/пауза`. Healthy rows stay listed so the owner sees what was checked. Escape / swipe down closes; focus returns to the strip.

## Fit with «Сегодня»
Strip stays first. The same checks feed «Требует внимания»: each failing check = one item (title, one action) in that block, so the strip drops its row there when the block exists and keeps only the healthy/count line. Data comes from one `useSystemStatus()` aggregating checks; no new layout rewrite. No KPI cards.

## Phone 375 / Mini App
Strip full width, 44 px tap target (line padded to 44 px hit area, 32 px visual). Problem row: text truncated, action button 44 px, right-aligned; never wraps to two rows. Telegram chrome: sheet respects safe area; native Back closes the sheet before navigating. Parity with web: same component, same copy.

## Keyboard / a11y
Strip: `button` with `aria-expanded`, `aria-haspopup="dialog"`; popover/sheet `role="dialog"` labelled «Состояние системы». Status changes announced via `role="status"` (healthy→problem) / `role="alert"` only on first appearance of danger. Tab order: strip → its action → page content. Contrast AA both themes.

## Copy (ru)
Healthy «Всё работает» · Problem «Бот не подключён» + «Подключить» · Multiple «Требует внимания: 2» + «Разобраться» · Details title «Состояние системы» · Error «Не удалось проверить» + «Повторить» · Close «Закрыть».

## Given / When / Then
1. Given all checks ok, When `/` opens, Then one 32 px line «Всё работает» shows and no cards.
2. Given the bot is not connected, When `/` opens, Then one row «Бот не подключён · Подключить» shows; pressing it connects and the row becomes the healthy line with a success toast.
3. Given bot and Cron both fail, Then one row «Требует внимания: 2 · Разобраться»; the action opens the list with two items, each with its own action.
4. Given the strip is focused, When Enter is pressed, Then details open, focus moves in; Escape closes and focus returns to the strip.
5. Given 375 px width, Then the strip stays one row ≤44 px with no horizontal scroll.
6. Given bot state `not_configured`, Then no «Подключить» is offered.

## API needs
None now (existing health + bot status DTOs). Cron last run and publishing on/off need a status DTO field before those checks appear; do not show them until the server supplies them.
