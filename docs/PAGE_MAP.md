# ALEXEEV Studio — product page map

The admin panel is the primary control plane for the whole ALEXEEV content system. It is not a minimal operations dashboard. Every automated or manual capability should be inspectable and controllable here unless exposing it would weaken security (for example, raw secrets stay in Cloudflare).

The regular browser app and Telegram Mini App are the same SPA. Every route must work from 320 px phones through tablets, laptops and large desktops (1920 px+), with the same operational capabilities. Use available space progressively: compact composition below the existing 860 px breakpoint, denser navigation/tables/split views only when they fit above it. Validate all routes at 320, 375, 390, 768, 1024, 1280, 1440 and 1920 px, including intermediate widths around layout changes. No horizontal page overflow, clipped controls/content or overlapping fixed elements. The canonical responsive contract is in `docs/design/UX_SPEC.md` §1.

## Primary navigation

| Path | Product responsibility | Core capabilities | Critical states |
|---|---|---|---|
| `/login` | Owner sign-in | Telegram Login Widget; Mini App automatic sign-in | cancelled, expired, 401, foreign owner 403 |
| `/` | Dashboard | customizable 12-column widget grid (edit mode, catalog, undo; layout saved per owner via `/settings/dashboard-layout`; spec: `docs/design/UX_SPEC.md` §3.1); built widgets: system status, attention, today, upcoming, recent activity, drafts, week, channels, incidents, quick actions (older specs: `docs/stories/dashboard-system-status.md`, `docs/stories/dashboard-today-incidents.md`); automation health and stale sources appear when those systems exist | partial/stale data, component failure, layout save conflict |
| `/posts` | Content library | one live search field (client-side over loaded rows), sort by column header (phone: sort sheet), drafts/approved content; server-side search, rubric/source/destination filters later | empty, error, stale |
| `/posts?view=archive` | Posts archive | published posts kept 30 days, restore, delete now; leave-free editor, delete post, cancel/remove publication (spec: `docs/stories/posts-lifecycle.md`) | empty, error, 30-day expiry, unknown not deletable |
| `/posts/new` | New content | full editor, source/rubric, media, destination, preview, save/approve/schedule; prototype handoff: `docs/stories/post-editor-prototype.md` | dirty, validation, preview failure |
| `/posts/:id` | Content Studio | edit, real preview, publication history, source provenance | 409 conflict, unsaved, stale revision |
| `/publications` | Publication control | tabs Все / Запланированные / Отправленные / Ошибки (no «Сегодня» until a date-range filter exists), live client-side search and sort over loaded pages, «Опубликовать пост» picker, inspector, status, destination, Telegram message id, safe actions | sending, retry_wait, failed, unknown |
| `/publications/:id` | Publication detail | timeline, attempt/audit detail, linked post, Telegram result, reconciliation | unknown, unsafe retry, partial telemetry |
| `/calendar` | Scheduling | day/week/month views, schedule/reschedule/cancel, filters by destination/rubric | timezone/DST, collision, unsafe action |
| `/automations` | Automation Center | rubrics, enabled/paused, auto/approval mode, last/next run, health, quick pause/run | source failure, stale run, partial config |
| `/automations/:id` | Rubric detail | sources, rules, template, destination, cadence, run history, candidate/decision details | ambiguous detection, held candidate, failure |
| `/sources` | Source control | official sources, health, last fetch/change, allowed domains, provenance | unreachable, stale, invalid response |
| `/media` | Media library | upload, search/filter, metadata, preview, usage history, source/rights | validation, upload failure, unavailable object |
| `/templates` | Visual templates | card templates, versions, preview, active/default state | renderer unavailable, invalid template |
| `/jobs` | Execution history | scheduler/automation jobs, status, duration, attempts, request/job ids | stuck, retry_wait, failed |
| `/incidents` | Operational incidents (spec: `docs/stories/dashboard-today-incidents.md`) | errors, unknown Telegram sends, manual reconciliation, audit history | no optimistic success, stale telemetry |
| `/analytics` | Content intelligence | period/rubric/destination filters, publishing reliability, automation funnel, comparisons | incomplete period, missing source data |
| `/settings` | Product settings | master/detail: «Каналы», «Оформление» (sections added only when built); phone: list then detail; theme/accent quick control lives in the top bar (spec: `docs/stories/settings.md`) | save conflict/error, quick-save revert |
| `/settings/channels` | Destinations | Telegram channels/groups, defaults, health and permissions | missing permissions, unreachable destination |
| `/settings/integrations` | Integrations | bot/webhook/source connection health without exposing secrets | disconnected, invalid configuration |
| `/settings/appearance` | Appearance | dark/light/system theme and display preferences | local fallback |
| all routes at phone/tablet/laptop/desktop widths | Responsive layout | audit, layout system and backlog for phone/Telegram Mini App (spec: `docs/stories/mobile-layout.md`; responsive contract: `docs/design/UX_SPEC.md` §1) | overflow, keyboard, safe area, Telegram BackButton/MainButton, clipped/overlapping UI |
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

The approved design (08.10.2026, `docs/design/UX_SPEC.md`, live prototype at `/__proto` in DEV) is the acceptance reference. The product language it establishes:

- deliberate typography and hierarchy;
- consistent density, spacing and alignment;
- clear selected/hover/focus/pressed/disabled/loading states;
- polished dark and light themes;
- responsive navigation and content composition;
- real empty/error/permission states;
- browser screenshot/overflow checks at 320, 375, 390, 768, 1024, 1280, 1440 and 1920 px (and intermediate widths around breakpoints);
- WCAG 2.2 AA target and keyboard-complete critical flows.

Canonical implementation sources remain `apps/frontend/src/app/styles/tokens.css`, `apps/frontend/src/shared/ui` and real route code; no Figma artifact is introduced.
