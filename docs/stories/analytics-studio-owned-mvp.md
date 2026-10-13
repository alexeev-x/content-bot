# Analytics — Studio-owned MVP

## Implementation verification status (2026-10-13)

`npm.cmd run verify` passed after the latest code changes. Independent R3 checks also passed for the owner-only read, bounded validation, snapshot retention/backfill/resolution, reporting index, and contract/integration tests. Prototype Gate A and production Gate B passed. The production analytics E2E now confirms that ArrowRight both selects and focuses the next comparison tab; the comparison tab list remains mounted with a busy skeleton while its read refreshes. Latest check: `npm.cmd run test:e2e -- e2e/analytics-visual.spec.ts --workers=1` from `apps/frontend` (1 passed).

Queue item: 13 (`docs/IMPLEMENTATION_PLAN.md`). Scope: append-only snapshots and read-only analytics derived from Studio's own publication history. Telegram-native views, reactions, followers and other externally collected audience metrics are out of scope; they belong to queue item 14's feasibility proof.

## User story

As the Studio owner, I can inspect measured publication outcomes over a selected period and compare absolute counts by destination and media where history is recorded, so I can understand what Studio itself has measured without mistaking missing data for zero or treating a correlation as a cause. Rubric and publication mode are unavailable until they are explicitly captured.

## Facts

- Owner-checked publication history already has publication lifecycle, jobs, attempts, and audit rows. These provide operational events and publication outcomes, including success, failure, and unknown.
- Queue #13 adds append-only publication snapshots for each attempt outcome and a separate row for manual `unknown` resolution. The report selects at most one row per publication: the latest snapshot observed inside the selected `[from, to)` period. Repeated snapshots remain unchanged in storage.
- Existing contract names include `PublicationDto` / `publicationStatusSchema`, `PostDto`, `PostMediaDto`, and destination DTOs. `PublicationDto` carries `postRevision`, `destinationId`, `status`, `scheduledAt`, optional Telegram message IDs, and creation/update timestamps. `PostDto` carries revision, body, current/approved media projection, timestamps, and publication summary.
- The analytics contract and owner-only backend route are implemented in `apps/contracts/src/analytics.ts` and `apps/backend/src/app/analytics-routes.ts`. Existing DTOs do not expose a rubric identifier, initiating mode, or actual Telegram send time as historical analytics dimensions; `scheduledAt` alone does not prove how a send was initiated.
- Existing media DTOs expose media kind and dimensions/size/duration where applicable. Text length can be derived from the immutable publication revision only if that content revision remains available to the analytics read model.
- No rich Telegram channel/post analytics capability is established for the current Bot API connector.

## Assumptions and recommendation

- Analytics is owner-only and read-only; it does not publish, retry, edit, or reconcile publications.
- For this MVP, snapshots are append-only and no analytics data is automatically purged. This avoids destructive loss while no retention policy is recorded. Retention/expiry remains an owner decision before introducing deletion or compaction.
- The screen reports only dimensions with source data. Missing rubric/media/history is shown as unavailable or not recorded, never silently converted to zero or inferred from a current mutable post.
- Initial scope is completed publication outcomes and the history needed to explain them; active scheduled work may appear as a separate absolute count. The MVP shows counts only: no percentages, rates, rankings, or minimum-sample rule.
- The report's `observedAt` is its as-of time, independent of the selected event period; each row has the exact source snapshot observation timestamp. The MVP has no age-based stale threshold; a failed refresh may label the retained report as not refreshed, with the failed request shown separately.

## Open decisions

- Retention and eventual deletion/compaction policy: no destructive policy is implied by this MVP; decide before any automatic purge.
- Whether rubric attribution should be captured for every publication, including manually created posts, is unresolved. Until recorded consistently, rubric breakdown is unavailable for those records and must disclose coverage.
- The precise owner-approved text-length unit is unresolved. The MVP may expose the stored body length only after the unit (Unicode code points) is stated in the UI; otherwise defer that metric.

## Page specification

### `/analytics` — Publication analytics

Purpose: let the owner inspect Studio-measured publication reliability and compare historical outcomes.

Title/H1: “Аналитика публикаций — ALEXEEV Studio”; on route change, update the document title and move focus to the H1.

Data: `PublicationAnalyticsReportDto` from `GET /api/v1/analytics/publications` is the source for the report. It contains absolute publication/outcome/attempt/retry counts, bounded destination-or-media groups, paginated publication rows, media coverage, and report `observedAt` (the report's as-of time). Each row's `observedAt` is the source snapshot time; it is not necessarily the Telegram send time. Do not show an initiating mode, actual-send-time claim, rubric, active-scheduled count, or inferred metric because the current snapshot contract does not record them. Media filters are limited to recorded `photo`, `animation`, and `video`; a no-media snapshot is represented in comparisons, not as a media filter. Do not calculate percentages, rates, or rankings.

Actions: change period and filters → refresh read-only data → show matching summary/table; failure preserves selections and permits safe GET retry. No write, publish, retry, or delete actions.

Permissions: authenticated owner only. 401 follows shared session-expiry handling. 403 shows no analytics data.

Filters and views:

- Period is required and bounded; display the selected interval and timezone/UTC offset for local times.
- Optional destination, media type, and outcome filters narrow the same period. Rubric and publication-mode filters are unavailable and are not offered; a publication row can be opened by its identity.
- MVP views: absolute counts for sent/failed/unknown and attempts/retries; bounded publication table with outcome, snapshot observation time, destination, recorded media kinds, attempt/retry counts, and links to the publication detail; deterministic count comparisons by destination and media. Mode, actual Telegram send time, and rubric are not recorded by this contract and are not displayed.
- Same-age external performance, channel overview, audience metrics, time-of-day recommendations, automation funnel, experiments, and causal conclusions are deferred.

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first request or filter refresh | structural skeleton; analytics region `aria-busy` | none until loaded | unchanged |
| empty | no matching snapshot observations | “Нет публикаций по выбранным фильтрам”; offer clear filters / choose period without claiming whether excluded records exist | clear filters / choose period | unchanged |
| partial | some selected dimensions lack historical coverage | available measures plus explicit “не записано”/coverage counts; no inferred zeros | change/clear filters | unchanged |
| error | network/5xx | short error and request ID; current filter values remain | retry safe read | error message |
| 401 | expired session | redirect to login and clear cached private data | — | login H1 |
| 403 | owner permission absent | access denied, no analytics data | back | message |
| 409 | read-only page; no revision mutation | n/a | — | — |
| scheduled/queued | not represented by the completed-observation report | n/a | inspect it in Publications | no active-work count is inferred here |
| unknown | ambiguous Telegram send in period | separate unknown count/status and link to manual reconciliation; never counted as confirmed success | open publication detail/reconciliation | status remains visible |

Time: query and compare the selected interval in UTC; render the period and both report-as-of and row snapshot-observation instants with the operator's IANA timezone and UTC offset (for example, `14:30 Europe/Chisinau, UTC+3`). Do not relabel a snapshot observation as the event/send time.

Responsive: compact cards/stacked filters below 860 px; denser summary/table above 860 px; check widths from 320 px through 1920 px per `docs/design/UX_SPEC.md` Conventions; no horizontal overflow.

A11y: WCAG 2.2 AA; semantic heading/table labels, keyboard-operable filters, visible focus, announced refresh/error status, and focus moved to H1 on navigation. No chart-only encoding; equivalent text/table values are available.

## Acceptance criteria

1. Given the owner opens `/analytics`, when data loads, then every displayed aggregate and row is limited to the selected reporting interval; the page shows the selected period and the report as-of time, while each publication row shows its snapshot observation time.
2. Given sent, failed, and unknown publications exist in the interval, when the summary loads, then each publication appears once using its latest snapshot observed inside `[from, to)`; each outcome has a distinct absolute publication count, and unknown is not combined with sent or failed. No percentage or rate is displayed.
3. Given the current analytics contract does not record initiating mode or actual Telegram send time, when the owner views a row, then neither is displayed or inferred from `scheduledAt` or snapshot observation time; the MVP offers no mode filter or comparison.
4. Given media coverage is incomplete, when the owner views its comparison, then the result discloses covered and unrecorded records rather than treating missing values as zero; rubric is not offered as a dimension.
5. Given a selected filter combination matches no records, when results load, then the page says no publication observations match the selected period and filters and offers a clear-filter action. It does not claim to distinguish an empty period from records excluded by filters because the report contract does not return that distinction.
6. Given the read fails with network/5xx, when the owner retries, then the same read is repeated without changing publication state and the page retains the selected filters while showing a request ID when supplied by the error response.
7. Given the session expires or the caller is not the owner, when analytics is requested, then expired sessions follow the login flow and a forbidden response reveals no analytics rows or aggregates.
8. Given an unknown snapshot appears, when its row is opened, then the report makes clear the result was unknown at that observation time, the owner can reach the publication's current detail/reconciliation flow, and analytics offers no retry or publish mutation.
9. Given snapshots are recorded more than once for a publication/metric observation, when the backend appends a new observation, then prior rows remain unchanged and the new row has a distinct observed time and source. A report period containing both an `unknown` snapshot and its later manual `sent` resolution shows only the latter for that publication; a period ending before resolution still shows the earlier `unknown`. The MVP UI does not expose a separate snapshot-history browser.
10. Given any supported viewport from 320 px to 1920 px and keyboard-only navigation, when the owner uses filters and opens a publication row, then controls remain reachable, content does not horizontally overflow, and focus is visible and predictable.
11. Given an applied report, when the owner edits filters without applying or opens and closes the phone filter sheet, then the URL and committed report remain unchanged. When Apply, a chip removal, or a comparison dimension is selected, then one new URL history entry represents the resulting applied report/view; Back/Forward restores adjacent applied reports/views. Opening a publication row pushes its identity into the URL, and closing it returns focus to that row and restores the same applied report query.

## MVP and deferred

MVP: append-only Studio-owned snapshots; owner-only read-only report; bounded period, filters, and pagination; absolute publication/attempt/retry counts plus historically recorded destination/media dimensions with explicit coverage; publication-detail links; report as-of time and per-row snapshot-observed time; loading/empty/partial/error/401/403/unknown states. No percentages, rates, rankings, rubric, mode, actual-send-time claims, or age-based stale threshold.

Deferred: Telegram-native audience/post metrics, integration/auth feasibility, scheduled same-age metric collection, automation funnel, causal claims, experiments, recommendations, retention purge/compaction. Rich Telegram statistics require the separate queue #14 proof and an explicit integration decision.

## UX handoff

Review status: expert review, not validated with users. Evidence is the owner's approved story, current page map and the approved Calm Operations conventions in `docs/design/UX_SPEC.md`; no owner reference image was supplied. Keep existing tokens and `shared/ui` primitives. This page is a read-only report: no publish, retry, edit, delete, or reconciliation mutation appears here.

### Entry, task flow, and exit

- Entry: primary navigation «Ещё» on compact layouts; add `/analytics` to the desktop navigation only when the route is implemented and built. Do not surface a disabled placeholder. The current canonical page map already includes the route.
- On entry, the H1 receives focus. Load the default bounded reporting period, clearly state its exact dates and the reporting timezone. Never imply external/channel analytics.
- Owner flow: choose a period and optional filters → activate «Применить» → review the outcome summary and coverage → choose a comparison dimension → open a publication row for its existing detail/reconciliation flow. Refresh/error does not discard filters.
- Desktop filters are visible in a compact toolbar. On phone, «Фильтры (N)» opens a bottom sheet; «Показать результаты» applies, «Сбросить» clears optional filters, and «Закрыть» returns focus to the opener without applying staged edits. Date range stays required. Applied filters appear as removable chips; the exact period remains visible in the toolbar/report caption.
- Keep filter edits local until applied. Encode the committed period, destination, media type, outcome, and comparison dimension in the URL query; rubric is not a filter because it is not captured for this MVP. Apply, clearing an applied chip, and selecting a comparison dimension each push one history entry, so Back/Forward restores the previous applied report/view; links are shareable. Field edits and opening/closing the phone filter sheet do not change the URL. Opening a publication pushes its id into the URL; closing it returns focus to that row and removes only the id. Clearing one chip preserves all other query values. A refresh retry repeats the safe read with the same query.
- Leaving the page is always safe. No confirmation or undo is needed because there are no mutations.

### Hierarchy and responsive wireframes

Use existing `PageHeader`, `Select`/filter-sheet, `Panel`, `StatusBadge`, `Table` (or semantic table), `EmptyState`, `ErrorState`, and `FooterLine` patterns as applicable. Avoid introducing a chart dependency or chart-only information. Summary values and comparisons remain readable as text/table.

375 px (compact, single column):

```text
[H1: Аналитика публикаций]                 [Ещё]
[Период: 1–30 сен. 2026 · Europe/Chisinau]
[Фильтры (0)]
[Применить] (only while filter sheet is open)
┌ За период · 1–30 сентября · UTC+3 ─────┐
│ Данные Studio · обновлено 12 окт., 09:14│
│ 38 отправлено · 2 ошибки · 2 требуют    │
│ проверки                                │
│ Попытки: 47 · повторы: 5                │
├ Сравнение ──────────────────────────────┤
│ [Каналы] [Типы медиа] (scroll-free)     │
│ Канал А                                 │
│ 20 публикаций · 18 отправлено           │
│ 1 ошибка · 1 требует проверки           │
│ Открыть публикации →                    │
├ Публикации (42) ────────────────────────┤
│ Заголовок поста             [Отправлено]│
│ Канал А · 12 сен., 14:30 (UTC+3)        │
│ ...                                     │
└─────────────────────────────────────────┘
[Обзор] [Посты] [Публикации] [Инциденты] [Ещё]
```

At 375 px, comparison rows and publication rows are stacked cards inside their respective single Panels; do not hide fields. The table card exposes title and textual status first, then destination, snapshot observation time, recorded media kinds, attempt/retry counts, and coverage note where relevant. Do not imply that observation time is actual Telegram send time. Filters sheet is a labeled dialog/sheet with a sticky safe-area footer. Keep the shell's fixed bottom navigation from obscuring the last row or panel footer; scroll padding must account for it.

1280 px (desktop):

```text
┌ Sidebar ──────┐ ┌ PageHeader: Аналитика публикаций ───────────────┐
│ …             │ ├ Panel/report caption · period · source · fresh  │
│               │ ├ Summary: [Отправлено] [Ошибки] [Проверить]      │
│               │ │          [Попытки] [Повторы]                      │
│               │ ├ Сравнение по [Каналы | Типы медиа]              │
│               │ │ Название | Учтено | Отправлено | Ошибки | Проверка│
│               │ ├ Публикации · [Период] [Канал] [Тип медиа]       │
│               │ │ Название | Результат | Наблюдалось | Канал | Медиа │
│               │ │ …                                               │
│               │ └ Footer: показано N из M · страницы · данные на… │
└───────────────┘
```

The actual filter toolbar is directly below the page header and above the report, not buried in the publication panel. It wraps before controls become cramped. At desktop, use a dense semantic table inside one Panel per collection; summary metrics can be a four-column strip that wraps to two columns at tablet widths. Row activation opens the publication detail using the existing URL-addressable inspector convention if that flow is available; otherwise navigate to the existing detail route. No new inspector API is implied.

1920 px: retain the same order and hierarchy, use the available content width without stretching metric tiles or making text lines excessively long; center the report body at the existing app's readable max-width if one is already established. Summary stays one row; comparison table and publications table can use more columns/spacing, never additional invented metrics. Keep persistent shell and timezone chip visible. At widths below 860 px, use compact navigation and the phone composition; between 860 and 1280 px, allow toolbar wrapping and narrower table columns without page overflow.

### Example content and comparison semantics

The following numbers and names are fixture-only examples for prototype/tests, not current Studio data: selected interval 1–30 September 2026, Europe/Chisinau (UTC+3); 42 completed outcomes: 38 sent, 2 failed, 2 unknown; 47 attempts and 5 publications had at least one retry. Show these as separate absolute counts only. Never convert them to a percentage, rate, rank, or causal claim; keep retry/attempt counts distinct from publication counts.

Example comparison table, grouped by destination:

| Канал | Учтено | Отправлено | Ошибки | Требуют проверки | Покрытие |
|---|---:|---:|---:|---:|---|
| Канал А | 20 | 18 | 1 | 1 | 20/20 публикаций |
| Канал Б | 22 | 20 | 1 | 1 | 22/22 публикаций |

The table is a descriptive count comparison, not a ranking or causal conclusion. Use stable alphabetical/name order. A media grouping with partial history shows both covered and omitted counts in the row/footer, e.g. «Данные записаны для 8 из 12 публикаций; 4 — не записано». Never render missing as zero. A dimension with no recorded values shows its unavailable explanation in place, not a blank chart or an invented zero row. Percentages/rates are out of MVP, so no sample-size threshold is needed.

Publication list desktop columns: «Публикация», «Результат», «Наблюдалось», «Назначение», «Тип медиа», «Попытки». Mode, actual Telegram send time, and rubric are not captured by this MVP; do not show or infer them. Each report/as-of and snapshot-observation instant is rendered with its zone/offset, e.g. «12 сен. 2026, 14:30 Europe/Chisinau (UTC+3)». The report caption shows the exact selected date interval and zone; never label a time only «локальное». Keep report as-of time separate from each row's snapshot-observation time.

An unknown row uses the canonical textual «Требует проверки» label and distinct icon/status treatment, says that the result was unknown at the observation time (the current publication may since have been manually reconciled), and offers only «Открыть публикацию» / «Перейти к проверке» navigation. Analytics itself never offers retry, resend, mark-sent, or resolve controls. Do not imply reconciliation is complete merely because the detail link opened.

### State and focus matrix

| State | Trigger and visible behavior | Actions / retry safety | Focus and announcement |
|---|---|---|---|
| Initial loading | Header and applied filters remain; reserve summary tile, comparison rows, and publication table skeleton geometry; mark report region `aria-busy`. | No submit mutation exists. | Focus stays on H1/current control; no repeated loading announcements. |
| Filter refresh | Keep previous report visible with a subtle progress line and «Обновляем…»; update only when the new safe read succeeds. | «Применить» repeats a read; rapid applies are disabled/coalesced while pending. | Polite status announces completion once, not every metric. |
| No publication history in period | «Нет публикаций за этот период» plus wider-period selection; do not imply zero external audience performance. | Choose another period. | Focus unchanged; action is keyboard reachable. |
| Filters hide records | «По этим фильтрам публикаций нет» plus «Сбросить фильтры»; preserve required date interval. | Clear optional filters; safe read on apply. | On clear, focus returns to report heading after results update. |
| Partial coverage | Show available measures plus numerator/denominator coverage and «Не записано» for missing historical dimensions. Do not substitute zero. | Adjust filters or inspect a row. | Coverage note is programmatically associated with its measure/row. |
| Read error/network/5xx | Retain prior successful report if available and state that this refresh failed and the visible report was not refreshed; otherwise show error with request ID and no fabricated figures. No age-based stale threshold. Offline banner follows shell policy. | Retry safe GET only; retain committed query and staged filter values. | Blocking initial error receives focus; refresh error is announced politely and retry remains reachable. |
| 401 | Shared session expiration redirects to login and clears private cache. | n/a. | Login H1. |
| 403 | Access-denied message, no aggregate or row data rendered/cached in view. | «Назад» to previous safe route. | Error heading/message. |
| 409 | n/a: read-only, no revision mutation. If a read model signals conflict, treat according to shared read error contract, not as a user-edit conflict. | Safe read retry only if classified retryable. | Error message. |
| Scheduled/queued/in-progress | Separate «В процессе» absolute count if included; link to detail. | Open detail only; no cancellation/reschedule from this screen. | Row status remains textual. |
| Unknown | Separate «Требуют проверки» count; row distinct from failed; link to publication's existing manual reconciliation path. | Navigation only. Retry/resend is never offered here. | Keep focus/status explicit; detail owns reconciliation focus flow. |
| No data for comparison dimension | Explain dimension not historically recorded; show any available coverage count and avoid zero/blank visualization. | Switch comparison dimension or clear filters. | Focus remains on comparison heading/tab. |
| Refresh failed after a prior success | Keep exact last observation timestamp and explain that the latest refresh failed; do not infer staleness from age. | Safe refresh. | One polite update announcement. |

All status rows above are filled; scheduled/queued, unknown, 401, 403, and 409 semantics are inherited from the story. 409 is not applicable to the page's own actions. Error messages include a short Russian explanation and request ID where provided, never only an HTTP code.

### Keyboard, touch, and cognitive walkthrough

- Tab sequence: H1 → period → desktop filter controls (or phone «Фильтры») → Apply if the filter draft differs → comparison dimension tabs → publication rows → pagination. Use native labeled controls. Comparison tabs follow the APG tab keyboard model (arrow keys switch, Tab exits); all rows/links have visible focus, and no action is hover-only.
- Enter/Space applies focused buttons/selection. Escape closes the filter sheet without applying and restores focus to «Фильтры»; Escape from a publication inspector closes it and restores focus to its row. Route change moves focus to destination H1. At 320 px, no page horizontal scroll; filters sheet/table cards and sticky controls respect Telegram/browser safe areas. Touch targets are 44 px minimum for controls and at least 56 px for publication cards.
- Cognitive walkthrough (expert review, not validated):

| Step | Will owner try it? | Notice control? | Link it to goal? | See progress/result? | Finding / resolution |
|---|---|---|---|---|---|
| Open Analytics from navigation | Yes: wants measured publication outcomes. | Yes only if route is present in built navigation. | Yes: label mirrors the task. | H1 then loading/report states. | Do not add nav before route exists; PAGE_MAP is intent, not implementation proof. |
| Set period and optional filters | Yes: period/destination are natural report controls. | Desktop toolbar or clearly counted phone filter button. | Exact interval + selected chips make scope visible. | Apply refreshes with preserved old data/progress. | Avoid silent instant filtering on mobile sheet. |
| Interpret outcome summary | Yes: sent/fail/unknown are operational outcomes. | Separate text labels and absolute counts. | Unknown remains a distinct state. | Coverage/freshness shown adjacent to values. | Prevent zero/unknown conflation and false causal claim. |
| Compare dimension | Yes: compare destinations/media. | Dimension tabs are above one comparison table. | Table labels and coverage show what can be compared. | Rows expose absolute values and coverage counts. | Missing dimensions stay unavailable, not an empty chart. |
| Open unknown row | Yes: needs manual review. | Canonical warning label and row link. | Explicit detail/reconciliation destination. | Existing detail shows current state; analytics offers no mutation. | Duplicate-risk and resolution stay in existing publishing workflow. |

### Expert heuristic audit (not validated with users)

| Screen / step | Heuristic | Evidence | Severity (0–4) | Fix / disposition |
|---|---|---|---:|---|
| Analytics navigation / entry | H4 consistency & standards | `docs/design/UX_SPEC.md` §1.1–1.2 says navigation lists built sections; `docs/PAGE_MAP.md` contains a planned route. | 3 | Add nav only with implemented route; keep this UX handoff from implying the screen is already live. |
| Choose date/filter and read report | H2 match to real world; H6 recognition over recall | Analytics story says dimensions/period are bounded and historical coverage may be absent. Google Analytics puts date selection and comparison in report context; Buffer places date/filter controls near the report and says exports reflect current filters. | 2 | Keep period and filters adjacent to report, exact interval persistent, applied-filter echo visible. [Google Analytics date ranges](https://support.google.com/analytics/answer/13412290?hl=en), [Buffer Insights](https://support.buffer.com/en-us/articles/using-insights-in-buffer-x4gLauQU5a). |
| Compare destination/media | H4 consistency; H5 error prevention | Story Facts/Open decisions: rubric is not captured in this MVP; destination/media comparisons must disclose omitted records. Later Custom Analytics uses explicit platform/profile/post type/time range filters and supports comparisons. | 3 | Offer only destination and media comparison dimensions; missing destination/media data is «Не записано», not zero. Rubric has no control, column, or comparison. [Later Custom Analytics](https://help.later.com/hc/en-us/articles/33109662792471-Later-s-Custom-Analytics). |
| Inspect result/time | H2 real-world mapping; H1 visibility of system status | `docs/stories/analytics-studio-owned-mvp.md` requires period/source/freshness; `docs/design/UX_SPEC.md` §2.5 status/time patterns. | 3 | Separate event period from observation freshness; show IANA timezone and UTC offset on exact instants. |
| Follow unknown publication | H5 error prevention; H3 user control | Story state matrix: unknown never counts as success and links to manual reconciliation; `docs/design/UX_SPEC.md` unknown convention. | 4 | Distinct «Требует проверки» state and navigation-only action; no retry/resend or optimistic resolution on Analytics. |
| Use report on phone | H7 flexibility/efficiency; H8 minimalist design | `docs/design/UX_SPEC.md` Conventions: compact below 860 px, phone cards, 44 px touch targets, no overflow. | 2 | Stacked summary/table cards and bottom-sheet filters; retain all data fields and safe-area padding. |
| Recover from failed read | H9 help recover from errors | `docs/stories/analytics-studio-owned-mvp.md` error criterion requires request ID, safe retry, preserved filters. | 2 | Persistent error with request ID; retry GET only and preserve query/form values. |

### Data/API needs (no endpoint or schema prescribed)

- A bounded owner-authorized report read that returns values only for the requested applied period/filter. Current contract does not distinguish an empty period from rows excluded by optional filters; the UI must not claim that distinction.
- Provenance per displayed metric: report as-of timestamp, row snapshot-observed timestamp, reporting period, and covered/unrecorded media counts. Snapshot observations remain append-only; a separate snapshot-history browser is deferred.
- Historical values for publication outcome and attempted/retried counts; distinguish publication count from attempt count. The MVP exposes counts only, so it defines no rate denominator.
- Initiating mode and actual Telegram send time are not recorded in this MVP. Do not infer either from `scheduledAt` or snapshot-observed time.
- Historically captured destination/media dimensions with explicit coverage; rubric is outside this MVP and must not appear as an available filter or comparison. For body length, defer display until code-point unit and revision source are decided; do not infer from mutable current post.
- Stable row identity and a supported link to existing publication detail; unknown detail must link into the current manual reconciliation flow without adding analytics-side mutation.
- Explicit time semantics for UTC period boundaries, report as-of time, and snapshot-observation time, allowing UI display in the operator's IANA zone with offset. This is reporting display policy, not Calendar scheduling/DST policy.
- Safe bounded pagination and total/coverage semantics for the table; filters, selected interval and comparison dimension need URL-reproducible state. A read error should expose a request ID; 401/403 must not leak cached private analytics data.
- Do not add percentage comparisons or an age-based stale-data threshold in this MVP. Do not add external audience metrics or delete/compact snapshots without the separately recorded decisions.

### External interaction references

- Google Analytics documents changing and comparing ranges inside a report, supporting a persistent period control and period comparison close to the data: [Change and compare date ranges](https://support.google.com/analytics/answer/13412290?hl=en).
- Buffer Insights places date range and filters near the report, provides a no-data recovery cue, and exports the currently selected view; this supports contextual filters and explicit empty-state guidance, not adding unapproved export capability here: [Using Insights in Buffer](https://support.buffer.com/en-us/articles/using-insights-in-buffer-x4gLauQU5a).
- Later Custom Analytics documents period/platform/profile/post-type filters and side-by-side comparisons; this supports explicit dimensions rather than hidden or inferred grouping: [Later's Custom Analytics](https://help.later.com/hc/en-us/articles/33109662792471-Later-s-Custom-Analytics).
