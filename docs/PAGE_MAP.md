# ALEXEEV Studio — product page map

The admin panel is the primary control plane for the whole ALEXEEV content system. It is not a minimal operations dashboard. Every automated or manual capability should be inspectable and controllable here unless exposing it would weaken security (for example, raw secrets stay in Cloudflare).

The regular browser app and Telegram Mini App are the same SPA. Mobile at 375 px is fully capable; desktop at 1280+ px uses the extra space for denser navigation, tables, split views and inspectors.

## Primary navigation

| Path | Product responsibility | Core capabilities | Critical states |
|---|---|---|---|
| `/login` | Owner sign-in | Telegram Login Widget; Mini App automatic sign-in | cancelled, expired, 401, foreign owner 403 |
| `/` | Dashboard | system status strip (one line when healthy, one banner row on problems; spec: `docs/stories/dashboard-system-status.md`), upcoming publications, recent activity, automation health, incidents, stale sources, quick actions | partial/stale data, component failure |
| `/posts` | Content library | search/filter/sort, drafts/approved content, rubric/source/destination, navigate to revisions | empty, error, stale |
| `/posts?view=archive` | Posts archive | published posts kept 30 days, restore, delete now; leave-free editor, delete post, cancel/remove publication (spec: `docs/stories/posts-lifecycle.md`) | empty, error, 30-day expiry, unknown not deletable |
| `/posts/new` | New content | full editor, source/rubric, media, destination, preview, save/approve/schedule | dirty, validation, preview failure |
| `/posts/:id` | Content Studio | edit, revision history/diff, real preview, publication history, source provenance | 409 conflict, unsaved, stale revision |
| `/publications` | Publication control | all sends/schedules, filters, status, destination, Telegram message id, safe actions | sending, retry_wait, failed, unknown |
| `/publications/:id` | Publication detail | timeline, attempt/audit detail, linked post, Telegram result, reconciliation | unknown, unsafe retry, partial telemetry |
| `/calendar` | Scheduling | day/week/month views, schedule/reschedule/cancel, filters by destination/rubric | timezone/DST, collision, unsafe action |
| `/automations` | Automation Center | rubrics, enabled/paused, auto/approval mode, last/next run, health, quick pause/run | source failure, stale run, partial config |
| `/automations/:id` | Rubric detail | sources, rules, template, destination, cadence, run history, candidate/decision details | ambiguous detection, held candidate, failure |
| `/sources` | Source control | official sources, health, last fetch/change, allowed domains, provenance | unreachable, stale, invalid response |
| `/media` | Media library | upload, search/filter, metadata, preview, usage history, source/rights | validation, upload failure, unavailable object |
| `/templates` | Visual templates | card templates, versions, preview, active/default state | renderer unavailable, invalid template |
| `/jobs` | Execution history | scheduler/automation jobs, status, duration, attempts, request/job ids | stuck, retry_wait, failed |
| `/incidents` | Operational incidents | errors, unknown Telegram sends, manual reconciliation, audit history | no optimistic success, stale telemetry |
| `/analytics` | Content intelligence | period/rubric/destination filters, publishing reliability, automation funnel, comparisons | incomplete period, missing source data |
| `/settings` | Product settings | master/detail: «Каналы», «Оформление» (sections added only when built); phone: list then detail; theme/accent quick control lives in the top bar (spec: `docs/stories/settings.md`) | save conflict/error, quick-save revert |
| `/settings/channels` | Destinations | Telegram channels/groups, defaults, health and permissions | missing permissions, unreachable destination |
| `/settings/integrations` | Integrations | bot/webhook/source connection health without exposing secrets | disconnected, invalid configuration |
| `/settings/appearance` | Appearance | dark/light/system theme and display preferences | local fallback |
| all routes at 375 px (Mini App) | Mobile layout | audit, layout system and backlog for phone/Telegram Mini App (spec: `docs/stories/mobile-layout.md`) | overflow, keyboard, safe area, Telegram BackButton/MainButton |
| `/*` | Not found | safe navigation back to Studio | — |

## Cross-page product requirements

- Global search/command entry should navigate quickly to content, publications, automations and settings without becoming a universal mutation console.
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

The current placeholder UI is not an acceptance reference. The first implementation must establish a coherent modern product language before feature screens multiply:

- deliberate typography and hierarchy;
- consistent density, spacing and alignment;
- clear selected/hover/focus/pressed/disabled/loading states;
- polished dark and light themes;
- responsive navigation and content composition;
- real empty/error/permission states;
- browser screenshot references at 375 px and 1280/1440 px;
- WCAG 2.2 AA target and keyboard-complete critical flows.

Canonical implementation sources remain `apps/frontend/src/app/styles/tokens.css`, `apps/frontend/src/shared/ui` and real route code; no Figma artifact is introduced.
