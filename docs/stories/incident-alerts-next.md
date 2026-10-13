# Incident alerts and notification preferences — MVP

## Implementation status (12.10.2026)

- Implemented: `/settings/notifications` includes read-only owner-bot connection status and the notification preference editor; responsive browser checks and accessibility scan pass.
- Implemented: owner-only bot status is covered for connected and forbidden responses without exposing bot details to a non-owner.
- Done: cross-Cron-tick publication alert groups, cooldown, preference-aware delivery, recovery notices, and existing Dota source/recovery preference gates. Independent R3 review and repository verify passed.
- The alert-group D1 test measures the worst busy tick at 48 statements and 27 round trips (limit: 50). Cron dispatches up to two jobs and two alert groups per tick; groups are FIFO, oldest first.
- Migration `0024_incident_alert_groups.sql` must be applied to DEV D1 by the owner before pushing. Queue item 11 retention for `incidents`, `job_attempts`, and `audit_log` remains separate and unresolved.

## User story

As the Studio owner, I want repeated operational failures to arrive as one useful private-bot alert, recovery to be announced, and non-critical alert categories to be configurable in Studio, so I can act without notification noise or alerts being sent to a publication channel.

## Facts

- Queue item 10 is in progress: incident alert deduplication/grouping, recovery, and Settings → Notifications.
- The incident plan requires deduplication, burst grouping, cooldown, first occurrence and count, recovery notice, a Studio link where possible, and no secrets/raw sensitive payloads. Alerts go only to the owner's private bot chat.
- Publication alert grouping is cross-tick; Dota source recovery notices already existed and now honor the source/recovery preferences.
- Existing pages/routes: `/incidents`, `/settings/notifications` (under Settings).
- Existing DTOs: `IncidentDto`, `IncidentPageDto`, `ListIncidentsQuery`; `OwnerOperationsSettingsDto`, `UpdateOwnerOperationsSettingsInput` (includes notification preferences, revision and update time); `BotStatusDto` (connection state). The notification preference fields are warnings, publication, source, automation, recovery, and Dota watchlist alerts.
- The existing incident contract covers publication `publish_failed` and `publish_unknown`; it does not expose grouped occurrence count or first/last-seen history. Unknown publication resolution stays on the existing reconciliation flow.
- CRITICAL alerts are always enabled. WARNING can be disabled. A private bot is the only alert destination.

## Assumptions

- MVP applies dedupe/grouping/cooldown and recovery to incident classes already emitted by the product; it does not add new incident sources.
- Notification preferences are owner-wide and affect delivery only, not incident creation or the incident list.
- Bot connection health is read-only on this page; bot setup remains in the existing Dashboard system-status details.
- When a preference is disabled, no queued-but-not-yet-sent alert of that category is delivered; already delivered alerts are not retracted.

## Implemented policy

- Grouping identity is incident class + affected publication (job id fallback) with a 15-minute cooldown; the group retains first/last occurrence and count. A burst alert summarizes the group; recovery is claimed once when its open condition clears.
- `publish_unknown` is CRITICAL and remains deliverable regardless of notification preferences. `publish_failed` is WARNING and requires both `warningsEnabled` and `publicationAlerts`. Dota source warnings require `warningsEnabled` and `sourceAlerts`; recovery notices require `sourceAlerts` and `recoveryAlerts`.
- No explicit transport-failure toggle exists; those failures use the applicable publication/source/automation category. Draft/watchlist notices are unchanged because no preference mapping was specified.

## MVP scope

- `/settings/notifications`: display bot connection state; allow editing WARNING, publication, source, automation, recovery, and Dota watchlist preferences; explain that CRITICAL cannot be disabled and alerts only go to the private owner bot.
- Apply preferences and a cross-tick cooldown to supported alert delivery. Repeated occurrences in the same group update its count/first-seen/last-seen rather than producing a new alert during cooldown. Send one recovery notice with incident name, recovered state, and duration when the grouped condition clears, if recovery alerts are enabled.
- Keep `/incidents` as the place to inspect and act on publication incidents. Do not expand incident classes/history UI in this story.

Deferred: new incident sources, per-channel routing, arbitrary severity controls, watchlist rule configuration, analytics/retention, and expanded incident history UI.

## Page specs

### `/settings/notifications` — Уведомления

Purpose: let the owner inspect the private bot connection and configure supported non-critical alert categories.
Title/H1: «Уведомления — ALEXEEV Studio»; route change updates the document title and focuses the H1.
Data: `OwnerOperationsSettingsDto`, `UpdateOwnerOperationsSettingsInput`, `BotStatusDto`.
Actions: load settings/status (safe GET; retryable); save changed preferences with current revision (safe to retry only with the same revision; stale revision must be resolved, not silently overwritten). No alert test-send in MVP.
Permissions: owner only; non-owner sees 403 with no settings data.

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | initial read | settings skeleton, busy region | none | unchanged |
| empty | n/a; defaults are supplied by settings | — | — | — |
| error | read/save network or 5xx | short error and requestId; unsaved choices remain visible | retry read; retry save only after confirming current revision | error message |
| 401 | expired session | redirect to login; clear cached private data | — | login H1 |
| 403 | owner check fails | «Нет доступа», no preferences or bot details | back | error message |
| 409 | settings revision is stale | explain another update won; keep local selection visible and identify stored version | reload stored values or reapply selection after reload | conflict message |
| queued | n/a; saving preferences is synchronous | — | — | — |
| unknown | n/a; this page does not publish or send alerts | — | — | — |

Responsive: compact stacked controls below 860 px and readable settings layout above; no horizontal overflow at 320 px. A11y: each toggle has a visible label and description; keyboard operation; save success/error announced; focus remains predictable after save/conflict.

### `/incidents` — Инциденты (alert behavior only)

Purpose: preserve the existing operational incident list and reconciliation/acknowledgement flows while alert delivery becomes grouped and preference-aware.
Data: `IncidentPageDto`, `IncidentDto`.
Actions: list incidents (safe GET; retryable); acknowledge `publish_failed` (idempotent; does not retry or republish); resolve `publish_unknown` only via publication reconciliation (never auto-retry).
Permissions: owner only; 403 shows no incident data.

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | initial list request | list skeleton, busy region | none | unchanged |
| empty | no incidents in selected state | explain there are no matching incidents | change state/filter if available | unchanged |
| error | network or 5xx | short error and requestId | retry safe read | error message |
| 401 | expired session | redirect to login; clear cached private data | — | login H1 |
| 403 | owner check fails | «Нет доступа», no incident data | back | error message |
| 409 | stale/invalid transition | retain incident context; explain required reconciliation for UNKNOWN | open linked publication/reconciliation | error message |
| queued | n/a; this page does not enqueue work | — | — | — |
| unknown | publication may have reached Telegram | show «Требует проверки» and link to manual reconciliation; never offer retry here | resolve manually in publication flow | status/message |

Responsive: preserve all incident actions at 320 px without horizontal overflow. A11y: status is textual, controls keyboard operable, update/error feedback announced, route change focuses H1.

## Acceptance criteria

1. Given the owner opens Notifications, when settings load, then all six supported preference controls show the saved/default values, bot connection status is visible without secrets, and CRITICAL is visibly always on and cannot be switched off.
2. Given the owner changes one or more preferences, when save succeeds, then the values persist after reload and the UI confirms the save; when save returns 409, then local choices remain visible and the UI offers reload/reapply without overwriting the newer revision.
3. Given a non-owner requests either page, when authorization fails, then the response/UI exposes no owner settings, bot details, or incidents.
4. Given the same supported incident recurs for the same affected object during the agreed cooldown, when notification processing runs across multiple Cron ticks, then one grouped alert is delivered to the owner's private bot chat, showing the group's first occurrence and total count; no duplicate per-tick alert is sent.
5. Given a grouped alert category is disabled before delivery, when that alert is evaluated, then it is not delivered, while the underlying incident remains visible/recorded in Studio; CRITICAL remains deliverable regardless of WARNING preference.
6. Given a grouped condition recovers, when recovery alerts are enabled, then exactly one private-bot recovery notice identifies the incident, recovered state, and duration; when recovery alerts are disabled, then no recovery notice is delivered.
7. Given an alert or recovery is delivered, then it contains no secret or raw sensitive payload and never targets a publication channel; when a Studio link is available, the alert links back to the relevant Studio view.
8. Given a `publish_unknown` incident is listed, when the owner opens it, then the interface marks it «Требует проверки» and routes to manual reconciliation; retry and automatic republication remain unavailable.

## Required focused verification

- Cross-tick dedupe/grouping/cooldown, count and recovery delivery, including preference-off and Telegram delivery failure behavior.
- Settings load/save, stale revision conflict, 401/403, and bot status without secret exposure.
- Keyboard and 320 px responsive checks for both routes.
