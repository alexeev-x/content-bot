# Calendar

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 3.3 Calendar

Purpose: editorial scheduling rather than low-level job inspection.

Capabilities:

- day, week and month.
- owner's timezone.
- drafts, approved content and scheduled publications.
- create from empty slot.
- schedule/reschedule.
- drag-and-drop only after the same backend safety rules are reused.
- filters by channel/platform/rubric.
- Dota events as an optional overlay once Dota Intelligence exists.

## 9. Calendar

### 9.1 Views

- day.
- week.
- month.

### 9.2 Content

- scheduled publications.
- optional approved-unscheduled lane.
- Dota events overlay later.
- destination/platform icon.
- status text.

### 9.3 Actions

- click empty slot → choose approved post or create new post.
- click event → publication drawer/detail.
- reschedule through the existing safe backend transition.
- cancel.
- drag/drop after accessibility and DST-safe behavior are implemented.

### 9.4 Time rules

- owner timezone is canonical for UI.
- storage remains UTC.
- DST transitions tested.
- browser timezone does not silently override the configured owner timezone.
