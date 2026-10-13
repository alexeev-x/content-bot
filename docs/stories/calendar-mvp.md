# Calendar MVP

## `/calendar` — Scheduling calendar

**User story:** As the owner, I can see drafts, approved posts, and scheduled publications in day, week, and month views in my configured timezone, then open an item or use the existing safe flows to create, schedule, reschedule, or cancel it.

**Observable outcome:** each supported item appears at the correct owner-local date and time; the owner can act without relying on drag-and-drop or browser timezone behavior.

### Facts

- `/calendar` currently renders an in-development placeholder; there is no production calendar implementation.
- The existing publication transition paths support scheduling, rescheduling, and cancellation.
- The owner timezone is canonical in the UI; stored times remain UTC. Browser timezone must not silently override it.
- Dota events are a later overlay. Drag-and-drop is deferred until keyboard-accessible and DST-safe behavior is specified and verified.
- Relevant existing DTOs: `PublicationDto`, `PublicationPageDto`, `PublicationStatus`, `PostDto`, `PostStatus`, `DestinationDto`. Existing post statuses include draft and approved; publication statuses include scheduled, queued, sending, sent, retry_wait, failed, unknown, and cancelled.

### Assumptions

- MVP shows all owner drafts and approved-unscheduled posts in an “Unscheduled” lane and scheduled publications on the calendar. A post with multiple destinations may have multiple publication entries.
- “Create from empty slot” opens the existing post creation flow with the selected local date/time prefilled; it does not create or publish automatically.
- Clicking a draft/approved item opens that post; clicking a publication opens its publication detail.
- Destination and rubric filters apply consistently to both calendar items and the unscheduled lane. With no filters selected, all eligible items are shown.
- Scheduling and rescheduling use the existing safe publication transitions; calendar interactions do not introduce direct-send or retry behavior.

### Open decisions / implementation blockers

- **Repeated local time during a DST fall-back:** choose which UTC occurrence to schedule, or require the owner to select one explicitly. Recommended default: require an explicit first/second occurrence choice; never silently choose.
- **Nonexistent local time during a DST spring-forward:** choose whether to reject and request another time or automatically move to the next valid time. Recommended default: reject and ask the owner to choose a valid time; never silently shift.

These policies must be confirmed before implementing date-time submission. The preview can still be built against explicit timezone test cases without inventing a policy.

### Actors, permissions, and flow

- Actor: authenticated owner only. All calendar data and actions are owner-scoped.
- A non-owner receives no calendar data. A session-expired owner is returned to sign-in with cached owner data cleared.
- Main flow: choose day/week/month → navigate dates → optionally filter destination/rubric → inspect item or empty slot → open existing post/publication flow → review the server-confirmed result.
- Only safe existing actions are available: create/open post, schedule, reschedule, cancel. No drag-only interaction, send-now action, or automatic retry.

### Data needs (not endpoint or storage prescriptions)

- Calendar range of publications with status, scheduled UTC instant, timezone context, post reference/summary, destination, and safe-action eligibility. Existing `PublicationPageDto`/`PublicationDto` cover publication data; confirm range completeness/pagination is sufficient for a visible calendar window.
- Owner-configured timezone identifier. Use the existing owner/settings data if it already supplies it; otherwise implementation must identify the existing source before changing contracts.
- Eligible draft and approved post summaries with rubric and destination associations. Existing `PostDto`/`PostStatus` cover post detail/status; confirm list data supports the lane and filters.
- Destination and rubric choices for filters. Existing `DestinationDto` covers destinations; identify the existing rubric data shape before implementation.
- Schedule/reschedule/cancel result and stable error details. Existing publication input/result DTOs and error DTOs apply; preserve server status as authoritative.

### State matrix

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | First fetch or changing range/filter | Calendar-shaped skeleton; region `aria-busy=true` | None until data is ready | Unchanged |
| empty | Range contains no eligible content and no filters hide items | Explicit “No items in this period” and create-post action | Create draft from selected slot | Unchanged |
| filtered empty | Active filters hide all eligible content | “Nothing matches these filters” | Clear filters; create from slot remains available | Unchanged |
| error | Network/5xx while loading | Short explanation and request ID | Retry safe read only | Error message |
| 401 | Session expired | No cached calendar content; redirect to sign-in | Sign in | Sign-in H1 |
| 403 | Owner authorization denied | “No access”; no calendar data or item details | Navigate back | Message |
| 409 | Stale/conflicting publication transition | Keep selected date/time and unsaved choices; explain item changed and show request ID | Reload authoritative item; do not silently overwrite | Conflict message/dialog |
| queued | Server accepts a schedule operation with queued status | Canonical “В очереди” status, not “Опубликовано” | Open publication detail; cancel only if server marks it safe | Polite status announcement |
| unknown | Publication result is ambiguous | “Требует проверки” warning and duplicate-risk context | Open reconciliation/detail; no retry or cancel from calendar | Warning message |
| timezone | Calendar renders or changes range | Owner timezone name and current UTC offset; labels and slot boundaries use it regardless of browser timezone | Navigate dates; select local slot | Unchanged |
| DST gap/fold | Selected local time is nonexistent or occurs twice | No silent conversion; show validation and explicit resolution UI per owner-approved policy | Choose a valid time / choose occurrence | Validation message or dialog |

### Responsive and accessibility requirements

- Use the viewport conventions in `docs/design/UX_SPEC.md`; compact layout below 860 px, desktop layout at and above 860 px; no horizontal page scroll at 320 px.
- On compact screens, day/week/month remain reachable without requiring a wide grid; use stacked/day-focused presentation. Desktop may use a calendar grid plus an unscheduled lane.
- Provide keyboard-operable date navigation, view switching, filters, empty-slot creation, item opening, and action menus. Every drag-equivalent action has a non-drag control (drag-and-drop itself is deferred).
- Announce range changes and server-confirmed schedule/cancel status politely. Dialogs move focus inside, trap focus, and return focus to the invoking control on close. Route change updates document title and focuses the H1.
- Use text status labels in addition to color; show local time with timezone and UTC offset where ambiguity is possible. Meet WCAG 2.2 AA, including keyboard operation, visible/unobscured focus, target sizing, and error identification.

### Acceptance criteria

1. Given eligible items and the owner timezone, when the owner opens day, week, or month view, then all items in the visible range are placed on the correct owner-local date and time, independent of browser timezone.
2. Given a draft or approved-unscheduled post, when the owner activates an empty slot's create action, then the existing post flow opens with that slot prefilled and no post is scheduled until the owner confirms through the existing flow.
3. Given a calendar item, when the owner activates it, then drafts/approved posts open their post view and publications open their publication detail.
4. Given destination/rubric filters, when the owner changes either filter, then both scheduled items and the unscheduled lane update consistently; clearing filters restores all eligible items.
5. Given a scheduled publication that remains eligible, when the owner reschedules it using the form controls, then the server-confirmed time/status replaces the previous value; on 409 the chosen value is retained and no silent overwrite occurs.
6. Given a cancellable scheduled publication, when the owner confirms cancellation, then the calendar shows the server-confirmed cancelled state; a failed request leaves the item unchanged and offers a safe retry only when the operation contract permits it.
7. Given a schedule operation returns `queued`, when the result appears, then the calendar says “В очереди” and never “Опубликовано”.
8. Given a publication is `unknown`, when the owner opens its calendar item, then the UI warns “Требует проверки”, links to reconciliation/detail, and offers neither retry nor cancel.
9. Given the owner timezone differs from the browser timezone, when the owner changes date or view, then slot labels, range boundaries, and event positions remain in the owner timezone and display timezone/UTC offset.
10. Given a DST gap or fold time, when the owner attempts to schedule/reschedule, then no UTC instant is submitted until the explicit owner-approved resolution policy is satisfied; no implicit browser-timezone shift occurs.
11. Given loading, empty, filtered-empty, network/5xx, 401, 403, and 409 conditions, when each occurs, then the corresponding state matrix content and actions are shown; 401 clears cached owner data and 403 exposes no calendar data.
12. Given keyboard-only use at 320 px, 375 px, and desktop width, when the owner changes views, navigates dates, filters, opens items, and invokes safe actions, then every operation is reachable without dragging, focus remains visible, and no horizontal page scroll occurs.
