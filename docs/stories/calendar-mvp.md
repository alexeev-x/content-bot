# Calendar MVP

## `/calendar` — Scheduling calendar

**User story:** As the owner, I can see drafts, approved posts, and scheduled publications in day, week, and month views in my configured timezone, then open an item or use the existing safe flows to create, schedule, reschedule, or cancel it.

**Observable outcome:** each supported item appears at the correct owner-local date and time; the owner can act without relying on drag-and-drop or browser timezone behavior.

### Facts

- `/calendar` is implemented locally for DEV at `apps/frontend/src/pages/calendar/CalendarPage.tsx`; targeted tests, full `npm run verify`, and local-mock browser QA pass. It is not yet deployed to DEV or released to production; this story remains the behavior and state-matrix source.
- The existing publication transition paths support scheduling, rescheduling, and cancellation.
- The owner timezone is canonical in the UI; stored times remain UTC. Browser timezone must not silently override it.
- Dota events are a later overlay. Drag-and-drop is deferred until keyboard-accessible and DST-safe behavior is specified and verified.
- Relevant existing DTOs: `PublicationDto`, `PublicationPageDto`, `PublicationStatus`, `PostDto`, `PostStatus`, `DestinationDto`. Existing post statuses include draft and approved; publication statuses include scheduled, queued, sending, sent, retry_wait, failed, unknown, and cancelled.

### Assumptions

- MVP shows all owner drafts and approved-unscheduled posts in an “Unscheduled” lane and scheduled publications on the calendar. A post with multiple destinations may have multiple publication entries.
- Owner-approved flow choice: “Create from empty slot” opens the existing post creation flow with the selected local date/time carried as a scheduling intent. Creating/saving the post creates only a draft; the owner must continue through the existing publication flow and its explicit confirmation. The calendar has no “send now” action.
- Clicking a draft/approved item opens that post; clicking a publication opens its publication detail.
- The destination filter narrows scheduled publications only. Drafts and approved-unscheduled posts have no destination until the owner chooses one, so the unscheduled lane remains visible and unfiltered; when opening a scheduling flow, the selected destination may be preselected but must remain explicit and confirmed. Rubric filtering is deferred because current DTOs have no rubric association.
- Scheduling and rescheduling use the existing safe publication transitions; calendar interactions do not introduce direct-send or retry behavior.
- The production MVP follows this story’s day/week/month scope. The clickable preview spec also includes List view; do not silently treat that preview-only fourth view as a production requirement.

### Owner decision (13.10.2026)

- **Repeated local time during a DST fall-back:** require the owner to select the first or second occurrence; never silently choose.
- **Nonexistent local time during a DST spring-forward:** reject and ask the owner to choose a valid time; never silently shift.

Date-time submission must not send a UTC instant until this explicit resolution is satisfied.

### Actors, permissions, and flow

- Actor: authenticated owner only. All calendar data and actions are owner-scoped.
- A non-owner receives no calendar data. A session-expired owner is returned to sign-in with cached owner data cleared.
- Main flow: choose day/week/month → navigate dates → optionally filter scheduled publications by destination → inspect item or empty slot → open existing post/publication flow → review the server-confirmed result.
- Only safe existing actions are available: create/open post, schedule, reschedule, cancel. No drag-only interaction, send-now action, or automatic retry.

### Data needs (not endpoint or storage prescriptions)

- Calendar range of publications with status, scheduled UTC instant, post reference/summary, destination, and safe-action eligibility. Existing `PublicationPageDto`/`PublicationDto` cover publication data and `GET /api/v1/publications` supports `from`/`to`, but results are cursor-paginated and there is no calendar aggregate. Traverse every page, bounded at 10 pages × 100 items per collection; if another page remains, show a clear range-too-dense error and do not render partial data as complete.
- Owner-configured timezone identifier. Existing `/api/v1/settings/operations` returns `OwnerOperationsSettingsDto.timezone`; use it, not the browser timezone.
- Eligible draft and approved post summaries. Existing `GET /api/v1/posts?status=...` and `PostDto.publicationSummary.counts` support paginated lists and counts for every publication status. The unscheduled lane excludes posts with any active or unknown publication (`scheduled`, `queued`, `preparing`, `sending`, `retry_wait`, or `unknown`); this is an all-destinations rule, not a destination-specific claim. Each post status collection uses the same 10-page × 100-item bound and fails explicitly rather than claiming a complete lane when more data remains.
- Destination choices are available through `DestinationDto`. Rubric association/filter data is not present in `PostDto` or `PublicationDto`; rubric filtering needs an agreed contract/data source or must be omitted from the first production slice. Do not show a nonfunctional filter.
- Empty-slot navigation to `/posts/new` carries an explicit local date/time intent and owner timezone; the post remains a draft until the existing explicit publication flow is completed.
- Schedule/reschedule/cancel contracts return the authoritative `PublicationDto` and accept UTC `scheduledAt` plus IANA `timezone`; they do not carry a local-time occurrence choice. Require explicit fold resolution and reject gaps before producing UTC. The API cannot independently verify that local intent; request a contract change if server-side verification is required.

### State matrix

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | First fetch or changing range/filter; includes all required cursor pages | Calendar-shaped skeleton; region `aria-busy=true` | None until the complete range is ready | Unchanged |
| empty | Range contains no eligible content and no filters hide items | Explicit “No items in this period” and create-post action | Create draft from selected slot | Unchanged |
| filtered empty | Active destination filter hides all scheduled publications | “No scheduled publications for this destination”; keep the unscheduled lane visible | Clear destination filter; create from slot remains available | Unchanged |
| error | Network/5xx while loading any page | Short explanation and request ID; do not label partial results complete | Retry safe read only | Error message |
| 401 | Session expired | No cached calendar content; redirect to sign-in | Sign in | Sign-in H1 |
| 403 | Owner authorization denied | “No access”; no calendar data or item details | Navigate back | Message |
| 409 | Stale/conflicting publication transition | Keep selected date/time and unsaved choices; explain item changed and show request ID | Reload authoritative item; do not silently overwrite | Conflict message/dialog |
| queued | Server accepts a schedule operation with queued status | Canonical “В очереди” status, not “Опубликовано” | Open publication detail; cancel only if server marks it safe | Polite status announcement |
| unknown | Publication result is ambiguous | “Требует проверки” warning and duplicate-risk context | Open reconciliation/detail; no retry or cancel from calendar | Warning message |
| timezone | Calendar renders or changes range | Owner timezone name and the offset applicable to the displayed date/time; labels and slot boundaries use it regardless of browser timezone | Navigate dates; select local slot | Unchanged |
| DST gap | Selected local time does not exist | “Этого времени нет из-за перехода на летнее время. Выберите другое.” No instant is submitted | Choose a valid time | Field error receives focus on submit |
| DST fold | Selected local time occurs twice | Ask “Это время встречается дважды. Выберите первое или второе вхождение”; identify each candidate with its UTC offset | Choose first or second occurrence | Resolution control receives focus; selected choice is announced |
| operation pending | Schedule/reschedule/cancel request in flight | Keep selected item and input visible; disable duplicate submission | Wait; close only if no unsaved input would be lost | Pending status announced politely |
| mutation failure | Definitive 4xx/5xx/network failure | Preserve entered local date/time; show plain-language error and request ID when present; no optimistic calendar change | Correct input or retry only when contract semantics make it safe; refresh authoritative item after conflict | Focus error summary; preserve values; closing returns focus to invoking action |

Status/action availability is server-status-driven: `scheduled`, `queued`, and `retry_wait` may offer reschedule/cancel; `preparing` and `sending` are read-only; `unknown` offers only open/reconciliation; `sent`, `failed`, and `cancelled` are read-only in the calendar. Labels use the canonical status mapping in `.agents/skills/page-spec/SKILL.md`; never infer availability from color or a stale cached row.

### Responsive and accessibility requirements

- Use the viewport conventions in `docs/design/UX_SPEC.md`; compact layout below 860 px, desktop layout at and above 860 px; no horizontal page scroll at 320 px.
- On compact screens, default to Day/agenda and keep day/week/month reachable without a wide grid; use a compact month strip plus stacked/day-focused presentation. Desktop uses a calendar grid and an inspector with the selected day, up to five nearest scheduled events in the loaded period, and the unscheduled lane. Keep view/date in URL state so Back/Forward restores navigation.
- Provide keyboard-operable date navigation, view switching, filters, empty-slot creation, item opening, and action menus. Every drag-equivalent action has a non-drag control (drag-and-drop itself is deferred).
- Announce range changes and server-confirmed schedule/cancel status politely. Dialogs move focus inside, trap focus, and return focus to the invoking control on close. Route change updates document title and focuses the H1. Leaving the calendar never prompts; it owns no unsaved form. Closing a scheduling dialog discards only its local intent and leaves server state unchanged.
- Use text status labels in addition to color; show local time with timezone and UTC offset where ambiguity is possible. Meet WCAG 2.2 AA, including keyboard operation, visible/unobscured focus, target sizing, and error identification.

### Acceptance criteria

1. Given eligible items and the owner timezone, when the owner opens day, week, or month view, then all items in the visible range are placed on the correct owner-local date and time, independent of browser timezone.
2. Given a draft or approved-unscheduled post, when the owner activates an empty slot's create action, then the existing post flow opens with that slot prefilled and no post is scheduled until the owner confirms through the existing flow.
3. Given a calendar item, when the owner activates it, then drafts/approved posts open their post view and publications open their publication detail.
4. Given a destination filter, when the owner changes it, then scheduled publications update; the unscheduled lane remains visible because posts have no assigned destination until scheduling. The selected destination may prefill but never silently confirm a publication. No rubric filter is shown until rubric data is contract-backed.
5. Given a scheduled publication that remains eligible, when the owner reschedules it using the form controls, then the server-confirmed time/status replaces the previous value; on 409 the chosen value is retained and no silent overwrite occurs.
6. Given a cancellable scheduled publication, when the owner confirms cancellation, then the calendar shows the server-confirmed cancelled state; a failed request leaves the item unchanged and offers a safe retry only when the operation contract permits it.
7. Given a schedule operation returns `queued`, when the result appears, then the calendar says “В очереди” and never “Опубликовано”.
8. Given a publication is `unknown`, when the owner opens its calendar item, then the UI warns “Требует проверки”, links to reconciliation/detail, and offers neither retry nor cancel.
9. Given the owner timezone differs from the browser timezone, when the owner changes date or view, then slot labels, range boundaries, and event positions remain in the owner timezone and display timezone/UTC offset.
10. Given a DST gap or fold time, when the owner attempts to schedule/reschedule, then no UTC instant is submitted until the explicit owner-approved resolution policy is satisfied; no implicit browser-timezone shift occurs.
11. Given loading, empty, filtered-empty, network/5xx, 401, 403, and 409 conditions, when each occurs, then the corresponding state matrix content and actions are shown; 401 clears cached owner data and 403 exposes no calendar data.
12. Given keyboard-only use at 320 px, 375 px, and desktop width, when the owner changes views, navigates dates, filters scheduled items by destination, opens items, and invokes safe actions, then every operation is reachable without dragging, focus remains visible, and no horizontal page scroll occurs.
13. Given an empty calendar slot, when the owner chooses “Создать пост на это время”, then `/posts/new` receives the selected owner-local date/time intent; saving creates only a draft, and only the existing publication flow with its explicit confirmation can schedule it. No “Отправить сейчас” action is present in the calendar.
14. Given a visible range or unscheduled collection spans multiple API pages, when data loads, then every page up to the 10 × 100 item collection bound is included before the calendar is announced complete; a failed page or a remaining cursor at the cap shows an explicit error rather than a silently incomplete result.
15. Given rubric data is not available in the post/publication DTOs, when the calendar renders, then it does not invent or imply a rubric filter/value; the filter appears only after a contract-backed source is agreed.
16. Given a nonexistent spring-forward local time or repeated fall-back local time, when scheduling/rescheduling, then a gap is rejected and a fold requires explicit first/second occurrence with the resulting UTC offset before conversion; no request is sent until resolved.
17. Given a fall-back day with two publications at the same owner-local wall time, when the owner views the calendar, then both entries visibly include their distinct UTC offsets; the desktop inspector exposes the selected day's entries, up to five nearest scheduled entries within the loaded range, and the unscheduled lane.

### UX audit and implementation follow-up

Expert review, not validated with users. The clickable preview is a mock and is not production evidence. The local implementation has been checked with browser screenshots and local-only API/auth mocks; the final Gate B evidence is in `.logs/calendar-implementation-qa/recheck/report.md`. This does not imply that Calendar is deployed to DEV or released to production.

Cognitive walkthrough (choose period → locate item/slot → act → verify result): the owner can identify the planning surface, inspect the selected day and nearest scheduled items, and open the unscheduled lane; post creation and publication remain distinct steps, with the latter requiring its existing confirmation. DST fold event labels include each occurrence's UTC offset.

Heuristic review, two passes: pass 1 walked the flow above; pass 2 searched for failure, navigation, status, and density problems. The ten heuristic coverage is summarized below; severity is 0–4 (3 = serious task impact, 2 = moderate friction). Findings are expert review only.

| Nielsen heuristic | Evidence/finding | Severity | Fix |
|---|---|---:|---|
| Visibility of system status | Multi-page range could be partial if the cap is reached. | 3 | Keep bounded complete-range loading and explicit incomplete-range error; server-confirmed result only. |
| Match between system and real world | “Unscheduled” cannot be inferred from only one `nextScheduled` destination. | 3 | Define eligibility using destination-specific authoritative data. |
| User control and freedom | Slot intent must survive navigation into post creation. | 3 | Preserve intent; provide free exit and explicit cancel in any modal. |
| Consistency and standards | Preview has List while production story has three views. | 2 | Keep production prototype aligned to day/week/month scope. |
| Error prevention | DST fold can map to two UTC instants. | 3 | Explicit first/second occurrence; reject gaps. |
| Recognition rather than recall | Browser-zone assumptions or hidden filters would obscure the active context. | 2 | Show owner zone/offset and visible applied-filter controls. |
| Flexibility and efficiency | Drag is not keyboard/touch sufficient; range may span multiple pages. | 2 | Provide explicit action controls and complete range loading. |
| Aesthetic and minimalist design | Dense inspector content can compete with the calendar grid. | 1 | Keep the day, nearest, and unscheduled sections compact and token-based; preview layout is not production evidence. |
| Help users recognize/recover from errors | Mutation 409/network failures need preserved input and authoritative refresh. | 3 | Keep chosen values, explain conflict, expose request ID, safe retry only. |
| Help and documentation | No user-facing explanation of slot intent or DST disambiguation exists yet. | 2 | Use the copy and field hints specified below. |

| Screen/step | Heuristic and evidence | Severity | Required fix / handoff |
|---|---|---:|---|
| `/calendar` entry | Visibility of system status: route fetches the configured owner timezone and all bounded range pages before presenting data. | 3 | Keep explicit loading and incomplete-range error states; do not present preview fixtures as live. |
| View selection | Consistency/scope: UX_SPEC §6.2 B includes List, while this production MVP scopes day/week/month. | 2 | Keep List preview-only; prototype day/week/month, with Day as compact default. |
| Range data | Error prevention/completeness: `apps/contracts/src/publications.ts` supports `from`/`to` plus cursor pagination; `apps/contracts/src/posts.ts` exposes cursor-paginated status lists. | 3 | Fetch every relevant page or add a bounded range contract; never communicate completeness for partial results. |
| Filters and unscheduled lane | Match to real world: drafts have no selected destination; `PostDto.publicationSummary.nextScheduled` represents only one destination/time. | 3 | Destination filter applies only to scheduled publications. Keep unscheduled posts visible and use selected destination only as an unconfirmed default in the existing scheduling flow; omit rubric control until DTO-backed. |
| Empty-slot create | User control and freedom: selected local slot is carried into `/posts/new`; saving is distinct from publishing. | 3 | Preserve selected slot as an intent; save draft only, then require existing explicit publication confirmation. |
| Schedule/reschedule time | Error prevention: publication inputs accept a UTC instant plus zone, not DST fold choice; existing DateTimeField use does not prove approved behavior. | 3 | Require explicit fold choice and gap rejection before conversion; test DST transitions with owner and different browser zones. |
| Item action/result | Visibility/consistency: `publicationActions()` allows cancel/reschedule only for `scheduled`, `queued`, `retry_wait`; `unknown` is reconciliation-only. | 3 | Derive actions from authoritative status; confirm cancellation naming item/time; show only server-confirmed results. |
| Compact layout and exit | User control/accessibility: UX_SPEC §6.2 B specifies 375 px Day default; PAGE_MAP requires 320 px minimum/no overflow. | 2 | Compact agenda/month strip, URL-backed view/date, keyboard actions, visible focus, no drag-only action; leaving is free. |

### Russian interface copy and focus behavior

- H1: “Календарь”; view label “Вид календаря”; options “День”, “Неделя”, “Месяц”. Compact default: “День”.
- Main action: “Опубликовать пост” opens the existing post flow; empty-slot action: “Создать пост на это время”. It creates/opens a draft only and does not publish.
- Navigation: “Сегодня”, “Предыдущий период”, “Следующий период”. Announce the selected date/range politely and persist it in URL state.
- Empty range: “В этот период публикаций нет”; filtered empty: “Нет запланированных публикаций для этого канала” + “Сбросить фильтр”. Keep the unscheduled lane visible.
- Slot hint: “Время публикации: {date}, {time}, {zone} ({offset})”. The existing publication confirmation names destination and time.
- Cancellation confirmation names post, destination and scheduled time; buttons use verbs (“Отменить публикацию” / “Оставить публикацию”). `unknown` says “Требует проверки” and never offers retry/cancel.
- Entry focuses H1; after changing view/date retain focus on the activated control and announce the new range; after mutation close dialog and focus the invoking item/action; on error focus the error summary and preserve entered values.

### API needs before production implementation

1. Complete-range loading is defined as explicit cursor traversal, up to 10 pages × 100 items for each collection. Test page boundaries, page failures, and a remaining cursor at the cap; never display a partial result as complete.
2. Define the unscheduled-lane rule as live draft/approved posts whose `publicationSummary.counts` are zero for every active/unknown status. The destination filter does not filter this lane.
3. Add rubric association/filter DTO data only if rubric filtering remains in MVP. Until then, omit that filter rather than render a fake/inert control.
4. Define `/posts/new` slot-intent query/state and preserve it through save without scheduling; do not bypass existing publication confirmation.
5. Make DST gap/fold behavior explicit in the date-time control and test before converting to existing `{ scheduledAt: UTC, timezone: IANA }` inputs. The current API has no occurrence field; if server-side verification is required, request a shared contract change before implementation.
