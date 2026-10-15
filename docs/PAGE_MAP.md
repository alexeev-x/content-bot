# ALEXEEV Studio — product page map

The admin panel is the primary control plane for the whole ALEXEEV content system. It is not a minimal operations dashboard. Every automated or manual capability should be inspectable and controllable here unless exposing it would weaken security (for example, raw secrets stay in Cloudflare).

The regular browser app and Telegram Mini App are the same SPA. Every route must work from 320 px phones through tablets, laptops and large desktops (1920 px+), with the same operational capabilities. Use available space progressively: compact composition below the existing 860 px breakpoint, denser navigation/tables/split views only when they fit above it. No horizontal page overflow, clipped controls/content or overlapping fixed elements. The canonical responsive contract is in `docs/design/UX_SPEC.md` Conventions.

## Primary navigation

| Path | Product responsibility | Core capabilities | Critical states |
|---|---|---|---|
| `/login` | Owner sign-in | Telegram Login Widget; Mini App automatic sign-in | cancelled, expired, 401, foreign owner 403 |
| `/` | Dashboard | fixed 12-column grid (no layout editor): KPI strip, attention, today, upcoming, recent activity, system status; spec: `docs/design/UX_SPEC.md` §3.1 | partial/stale data |
| `/posts` | Content library | one live server-side search, full-view sort by column header (phone: sort sheet), `totalCount` for the current view/search, drafts/approved content; rubric/source filters later | empty, error, stale |
| `/posts?view=archive` | Posts archive | published posts kept 30 days, restore, delete now | empty, error, 30-day expiry, unknown not deletable |
| `/posts/new` | New content | full editor, source/rubric, media, destination, preview, save/approve/schedule; prototype handoff: `docs/stories/post-editor-prototype.md` | dirty, validation, preview failure |
| `/posts/:id` | Content Studio | edit, real preview, publication history, source provenance | 409 conflict, unsaved, stale revision |
| `/publications` | Publication control | tabs Все / Запланированные / Отправленные / Ошибки (no «Сегодня» until a date-range filter exists), live client-side search and sort over loaded pages, «Опубликовать пост» picker, inspector, status, destination, Telegram message id, safe actions | sending, retry_wait, failed, unknown |
| `/publications/:id` | Publication detail | timeline, attempt/audit detail, linked post, Telegram result, reconciliation | unknown, unsafe retry, partial telemetry |
| `/automations` | (planned; the stub route was removed from the SPA) Automation Center | rubrics, enabled/paused, auto/approval mode, last/next run, health, quick pause/run | source failure, stale run, partial config |
| `/automations/:id` | Rubric detail | sources, rules, template, destination, cadence, run history, candidate/decision details | ambiguous detection, held candidate, failure |
| `/sources` | Official Dota updates, patch facts and exact watchlists | inspect persisted health/provenance for the two configured official Dota/Steam feeds, open stored deterministic patch facts, manage watches for confirmed exact hero/item entities and inspect matching alert outcome (`docs/design/UX_SPEC.md` §3.9; UX handoff: `docs/stories/dota-watchlists-ux.md`; API: `docs/API_CONTRACTS.md`; feed: `docs/stories/source-registry-mvp.md`) | partial/stale feed, incomplete parse requires manual inspection, watch conflict, alert outcome unknown; no unsupported statistics or fictional event data |
| `/analytics` | Content analytics of the owner's channels | platform strip (followers, 7-day change, 30-day curve, 7-day views), 30-day leaders, all posts and videos with a platform filter, item panel with the views curve (`?platform=`, `?id=`); «Обновить» collects now; Обзор shows «Аудитория» and «Лучшее за 30 дней» | not configured, first collection pending, collection error with its cause, empty |
| `/media` | Retained media library | filename/kind/usage filters, metadata, exact-byte duplicate count, private preview, current post links, attach to drafts; standalone upload and manual deletion are unavailable | filtered empty, unavailable preview, stale draft revision; immutable-revision-only assets have no current post link |
| `/templates` | Visual templates | card templates, versions, preview, active/default state | renderer unavailable, invalid template |
| `/jobs` | Execution history | scheduler/automation jobs, status, duration, attempts, request/job ids | stuck, retry_wait, failed |
| `/incidents` | Redirect to `/publications?view=errors`: open incidents are listed above the «Ошибки» tab (acknowledge a failed one, reconcile an unknown one in the drawer) | no optimistic success, stale telemetry |
| `/settings` | Product settings | master/detail: «Каналы», «Оформление» (sections added only when built); phone: list then detail; theme/accent quick control lives in the top bar | save conflict/error, quick-save revert |
| `/settings/channels` | Destinations | Telegram channels/groups, defaults, health and permissions | missing permissions, unreachable destination |
| `/settings/integrations` | Planned; route not implemented. Integrations would show bot/webhook/source connection health without exposing secrets. Bot connection is currently managed in Dashboard system-status details. | disconnected, invalid configuration |
| `/settings/notifications` | Notifications | owner bot status and owner-wide alert preferences; CRITICAL always enabled, WARNING and supported categories configurable (`docs/stories/incident-alerts-next.md`) | loading/save error, stale revision, bot disconnected |
| `/settings/appearance` | Appearance | dark/light/system theme and display preferences | local fallback |
| all routes at phone/tablet/laptop/desktop widths | Responsive layout | compact composition and Mini App behavior (`docs/design/UX_SPEC.md` §1.2, Conventions; `docs/FRONTEND_ARCHITECTURE.md` §16) | overflow, keyboard, safe area, Telegram BackButton/MainButton, clipped/overlapping UI |
| `/*` | Not found | safe navigation back to Studio | — |

## Cross-page product requirements

- Global search/command entry (Ctrl/⌘ K) is not built yet (needs an entity-search endpoint); list pages search their loaded rows. It should navigate quickly to content, publications, automations and settings without becoming a universal mutation console.
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
