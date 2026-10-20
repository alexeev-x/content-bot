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
| `/analytics` | Content analytics of the owner's channels (layout from `design-refs/analytics/`) | header with «Обновлено …» and «Обновить»; a banner with a link to settings only when a source fails or can be connected; one control row: four tabs (`?tab=`), the period as 7д/30д/90д, the platform select and «Обновить» as an icon (one row on a phone): «Обзор» (reworked 20.10.2026: «аналитика ради аналитики», seven phone screens) — a tile per platform with its own followers and key figure, never summed across platforms (a swipeable strip on a phone); «Что сделать»: three conclusions that change the next step first (videos bring no Telegram subscribers → «Создать ссылку», days without a video, a format far stronger than another), the rest behind «Показать ещё»; «Форматы»: series found in the titles (a sentence whose first two words repeat) with their median against the usual and best publication, top three and bottom two before «Все форматы»; «Что залетает сейчас» (status against the usual at the same age); «Каждая публикация» for one platform at a time, on a log scale when one bar is over eight medians; «Публикации» — «Лучшие и худшие», paged table with search and status filter, «Сравнение роликов»; «Отчёты» (AI plan P8) — the released daily and Monday reports newest first, each a section titled with its kind and time and how its AI review went (model and cost, or why there is none), opening to the report text as the bot built it (monospace, its tables kept on one line down to 375 px) and a daily report's forecasts (video, horizon, band, fact, outcome, method), «Показать ещё» for older ones; «Аудитория» — followers by day, «Откуда приходят подписчики» (Telegram invite links per source: create with a name, copy, revoke; who joined through each in the period, who of them left, and joins without a link), «Цели» (a follower target per platform with progress, the 4-week pace and the forecast day; set in a dialog), platform comparison, «Когда публиковать». Every chart has hover details; the item panel (place, status, metrics against the median, growth against the usual curve, findings, neighbours) opens without moving the page (`?days=&platform=&page=&sort=&dir=&id=`); the studio Обзор shows «Аудитория» and «Что залетает сейчас» | not configured, first collection pending, collection error with its cause, «Собираем данные» until checkpoints exist, growth from the second measured day, empty |
| `/media` | Retained media library | filename/kind/usage filters, metadata, exact-byte duplicate count, private preview, current post links, attach to drafts; standalone upload and manual deletion are unavailable | filtered empty, unavailable preview, stale draft revision; immutable-revision-only assets have no current post link |
| `/incidents` | Redirect to `/publications?view=errors`: open incidents are listed above the «Ошибки» tab (acknowledge a failed one, reconcile an unknown one in the drawer) | no optimistic success, stale telemetry |
| `/settings` | Product settings | master/detail: «Каналы», «Аналитика», «ИИ», «Общие», «Оформление»; phone: list then detail; theme/accent quick control lives in the top bar | save conflict/error, quick-save revert |
| `/settings/channels` | Destinations | Telegram channels/groups, defaults, health and permissions | missing permissions, unreachable destination |
| `/settings/ai` | AI writer | spend and monthly budget, quality by format, models, voice, prices | save error, budget blocked |
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
