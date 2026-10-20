# ALEXEEV Studio — product page map

The admin panel is the primary control plane for the whole ALEXEEV content system. It is not a minimal operations dashboard. Every automated or manual capability should be inspectable and controllable here unless exposing it would weaken security (for example, raw secrets stay in Cloudflare).

The regular browser app and Telegram Mini App are the same SPA. Every route must work from 320 px phones through tablets, laptops and large desktops (1920 px+), with the same operational capabilities. Use available space progressively: compact composition below the existing 860 px breakpoint, denser navigation/tables/split views only when they fit above it. No horizontal page overflow, clipped controls/content or overlapping fixed elements. The canonical responsive contract is in `docs/design/UX_SPEC.md` Conventions.

## Primary navigation

| Path | Product responsibility | Core capabilities | Critical states |
|---|---|---|---|
| `/login` | Owner sign-in | Telegram Login Widget; Mini App automatic sign-in | cancelled, expired, 401, foreign owner 403 |
| `/` | Dashboard | fixed 12-column grid (no layout editor, widgets from `design-refs/обзор/`): «Лента дня»; «Следующая публикация» (countdown card, opens the publication); «Итоги недели» (sent/scheduled bars by weekday); «Последний ролик · YouTube» and «· TikTok» (status, numbers against the usual at the same age; a video opens its details drawer in place); «Что залетает сейчас»; «Новости и источники» (latest Dota updates with «Создать пост», analytics sources needing attention); spec: `docs/design/UX_SPEC.md` §3.1 | partial/stale data |
| `/posts` | Content library | views Все / Черновики / Архив (`?view=`), one live server-side search, full-view sort by column header (phone: sort sheet), `totalCount` for the current view/search | empty, error, stale |
| `/posts?view=archive` | Posts archive | published posts kept 30 days, restore, delete now | empty, error, 30-day expiry, unknown not deletable |
| `/posts/new` | New content | full editor, source/rubric, media, destination, preview, save/approve/schedule | dirty, validation, preview failure |
| `/posts/:id` | Content Studio | edit, real preview, publication history, source provenance | 409 conflict, unsaved, stale revision |
| `/posts/:id/publish` | Publish step | destination, schedule and send options for an approved post | 409 conflict, stale revision |
| `/publications` | Publication control | tabs Все / Запланированные / Отправленные / Ошибки (`?view=`), period filter (today / 7 / 30 days), live search and sort, «Опубликовать пост» picker, status, destination, Telegram message id, safe actions; open incidents above «Ошибки» | sending, retry_wait, failed, unknown |
| `/publications?id=` | Publication drawer | timeline, attempt/audit detail, linked post, Telegram result, reconciliation | unknown, unsafe retry, partial telemetry |
| `/sources` | Official Dota updates | event feed with a status filter (`?status=`); health of the two official feeds with «Проверить сейчас» / «Пауза» for the watcher; update detail (`?update=`) with deterministic patch facts and «Следить за …» on a confirmed hero/item fact. **Planned:** watch list, removal and match/alert display (`docs/stories/dota-watchlists-ux.md`). Spec: `docs/design/UX_SPEC.md` §3.9 | partial/stale feed, incomplete parse requires manual inspection, watch conflict; no unsupported statistics or fictional event data |
| `/terms`, `/privacy` | Public legal pages (TikTok app requirement, `docs/stories/tiktok-public-legal-pages.md`) | static HTML in `apps/frontend/public/` (`terms.html`, `privacy.html`, `legal.css`) served by Workers assets: readable without JavaScript or sign-in, light/dark, linked to each other | content must change with the product (TikTok connection, retention) |
| `/settings/analytics` | Sources of «Аналитика» | per-platform state (updated, error with its cause, not connected), TikTok connect/disconnect, «Обновить» | collection error, TikTok app keys missing |
| `/analytics` | Content analytics of the owner's channels (layout from `design-refs/analytics/`) | header with «Обновлено …» and «Обновить»; a banner with a link to settings only when a source fails or can be connected; one control row: four tabs (`?tab=`), the period as 7д/30д/90д, the platform select and «Обновить» as an icon (one row on a phone): «Обзор» (reworked 20.10.2026: «аналитика ради аналитики», seven phone screens) — a tile per platform with its own followers and key figure, never summed across platforms (a swipeable strip on a phone); «Что сделать»: at most four cards, an odd last one full width (owner, 20.10.2026) — videos bring no Telegram subscribers → «Создать ссылку», a pause in videos past 1.5× the owner's usual interval, a format far stronger than another with the turn in the latest videos, the Telegram pace against the plan («9,6 из 14»); «Форматы»: series found in the titles (a sentence whose first two words repeat) with their median against the usual and best publication, top three and bottom two before «Все форматы»; «Что залетает сейчас» (status against the usual at the same age); «Каждая публикация» for one platform at a time, on a log scale when one bar is over eight medians; «Публикации» — «Лучшие и худшие» (one list at a time behind a switch on a phone), paged table with search and status filter, «Сравнение роликов» (its detail cards a swipeable strip on a phone); «Отчёты» (AI plan P8; no period or platform filters, the reports are not cut by them) — «Как сбываются прогнозы» (30 days, per horizon: in band of scored, below, above, and how many wait for the next report), then a table of the released daily and Monday reports newest first, a row each with its kind, time and the review's main line (or why there is no review) and the review cost; a row opens a side panel (a sheet on a phone) with the report as prose and monospace tables (kept on one line down to 375 px) and a daily report's forecasts as one card per video (title without hashtags, each horizon's band → fact and outcome, or when it is checked), «Показать ещё» for older ones; «Аудитория» — followers by day, «Откуда приходят подписчики» (Telegram invite links per source: create with a name, copy, revoke; who joined through each in the period, who of them left, and joins without a link), «Цели» (a follower target per platform with progress, the 4-week pace and the forecast day; set in a dialog), «Один ролик на платформах» (how many times more the same video gets on TikTok than on YouTube, the pairs as a swipeable strip on a phone), «Когда публиковать» (six 4-hour windows of the day, all weekdays together, each against the usual with how many publications it rests on; «мало» under three; the weekday × hour grid and the platform comparison table were removed 20.10.2026, the tiles on Обзор carry the per-platform figures). Every chart has hover details; the item panel (place, status, metrics against the median, growth against the usual curve, findings, neighbours) opens without moving the page (`?days=&platform=&page=&sort=&dir=&id=`); the studio Обзор shows «Аудитория» and «Что залетает сейчас» | not configured, first collection pending, collection error with its cause, «Собираем данные» until checkpoints exist, growth from the second measured day, empty |
| `/ai` | «ИИ-редактор» (owner, 20.10.2026: what the AI writes and learns, moved out of Настройки → ИИ) | tabs in `?tab=`: «Сводка» — provider state with the way to the settings, «Нужно ваше решение» (an analysis rule waiting for «Учитывать», a hypothesis the bot asked about, Reels scripts without a video, low approvals, the budget threshold, the AI off or stopped by a limit; each with the button to where it is decided, else «Всё в порядке»), the month's money, quality for 30 days with «По форматам» (a swipeable card per format on a phone); «Черновики» — one row per draft with filters (все, одобрены, с правками, с отзывами, не одобрены), a row opens its versions, texts and verdicts in a side panel (`?draft=`); «Обучение» — «Как ИИ учится» in four owner steps, then «Ждут вашего ответа» (asked lessons with «Учитывать» / «Не учитывать») and «Замечено один раз», the rules, scripts without a video and hypotheses (each only when not empty), the examples table, and «История отзывов» folded (only when any) (search, «Учитывается» and «Откуда» filters, pages of 20, `?lq&luse&lfrom&lpage`; a text from 20.10.2026 on is off until «Учитывать») | not configured, AI off, budget blocked, each list's own load error, empty lists |
| `/media` | Retained media library | filename/kind/usage filters, metadata, exact-byte duplicate count, private preview, current post links, attach to drafts; standalone upload and manual deletion are unavailable | filtered empty, unavailable preview, stale draft revision; immutable-revision-only assets have no current post link |
| `/incidents` | Redirect to `/publications?view=errors`: open incidents are listed above the «Ошибки» tab (acknowledge a failed one, reconcile an unknown one in the drawer) | no optimistic success, stale telemetry |
| `/settings` | Product settings | master/detail: «Каналы», «Аналитика», «ИИ», «Общие», «Оформление»; phone: list then detail; theme/accent quick control lives in the top bar | save conflict/error, quick-save revert |
| `/settings/channels` | Destinations | Telegram channels/groups, defaults, health and permissions | missing permissions, unreachable destination |
| `/settings/ai` | AI settings (only what is set, owner 20.10.2026) | provider state with «Включён» and «Проверить», «Деньги» (the month against the budget, today, what is left, and where the money went: bot drafts, control runs, the rest), models and the video reviews switch, monthly and daily budget and the warning threshold, the provider's prices folded at the end | save error, budget blocked |
| `/settings/general` | General | owner bot status, time zone, owner-wide alert preferences (CRITICAL always on); `/settings/notifications` and `/settings/operations` redirect here | loading/save error, stale revision, bot disconnected |
| `/settings/appearance` | Appearance | dark/light/system theme and display preferences | local fallback |
| all routes at phone/tablet/laptop/desktop widths | Responsive layout | compact composition and Mini App behavior (`docs/design/UX_SPEC.md` §1.2, Conventions; `docs/FRONTEND_ARCHITECTURE.md` §16) | overflow, keyboard, safe area, Telegram BackButton/MainButton, clipped/overlapping UI |
| `/*` | Not found | safe navigation back to Studio | — |

## Cross-page product requirements

- No global search (decision 14.10.2026); list pages have their own search.
- Environment must be visually obvious when running on dev; production-destructive actions require explicit confirmation.
- Every list supports bounded pagination/filtering; no route loads an unbounded D1 table.
- Statuses are textual + iconographic; color is never the only signal.
- Important details open in a page or accessible inspector/drawer without hiding the underlying state.
- Publishing and automation mutations never show optimistic success.
- `unknown` always links to the reconciliation flow.
- Source provenance is visible wherever generated/automated content is reviewed.
- Empty states teach the next useful action; they are not decorative placeholders.
- Loading uses structural skeletons where useful rather than blocking the whole application.
- Mobile contains the same operational capabilities; layout changes, capability does not.

## Visual quality bar

The approved design (`docs/design/UX_SPEC.md` for flows, `docs/design/README.md` for the look) is the acceptance reference. The product language it establishes:

- deliberate typography and hierarchy;
- consistent density, spacing and alignment;
- clear selected/hover/focus/pressed/disabled/loading states;
- polished dark and light themes;
- responsive navigation and content composition;
- real empty/error/permission states;
- browser screenshot/overflow checks at the widths in `docs/design/UX_SPEC.md` Conventions;
- WCAG 2.2 AA target and keyboard-complete critical flows.

Canonical implementation sources remain `apps/frontend/src/app/styles/tokens.css`, `apps/frontend/src/shared/ui` and real route code; no Figma artifact is introduced.
