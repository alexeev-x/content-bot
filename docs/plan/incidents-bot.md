# Incidents and owner bot

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 3.9 Incident & Alerting System

Purpose: one coherent place for failures.

Incident classes include:

- publication FAILED.
- publication UNKNOWN.
- Telegram transport timeout.
- bot permission loss.
- scheduled job stuck.
- source stale/down.
- parser failure.
- automation repeated failure.
- analytics ingestion failure.
- platform upload/processing failure.
- infrastructure health failure.

Severity:

- INFO.
- WARNING.
- CRITICAL.

Telegram alert route is strictly:

Studio / Worker → incident notification → owner's private bot chat.

Never:

Studio / Worker → content destination channel.

Required alert behavior:

- dedupe repeated errors.
- group bursts.
- cooldown noisy incidents.
- show first occurrence and count.
- recovery notification.
- link/deep-link back to Studio where possible.
- never include secrets or raw sensitive payloads.

## 3.10 Owner bot

The bot is a personal control surface, not the main product UI.

Current commands remain and may grow to include:

- /today.
- /next.
- /status.

Target notifications:

- critical publication failure.
- UNKNOWN publication.
- source outage.
- automation failure.
- system recovery.
- optional Dota watchlist alert.

Quick actions may be added only where they can reuse the same server-side authorization and state transition as Studio.

The owner's private chat id is separate from publication destination ids in the data model and code. The notification subsystem must not accept a content destination as a fallback.

## 15. Incident and owner notification UX

### 15.1 Incidents page

Add over time:

- severity.
- source/system.
- age.
- linked publication/job/source.
- occurrence count.
- first/last seen.
- resolution.
- history.

### 15.2 Owner Telegram message

A useful alert contains:

- severity.
- short title.
- affected object.
- current state.
- safe reason/code.
- occurrence count if grouped.
- time.
- Studio deep link when possible.

Recovery contains:

- incident name.
- recovered state.
- duration.

### 15.3 Notification settings

Settings → Notifications:

- owner bot connection/status.
- WARNING on/off.
- CRITICAL always on unless owner explicitly chooses otherwise.
- publication alerts.
- source alerts.
- automation alerts.
- recovery alerts.
- Dota watchlist alerts.

No notification setting may point to a publication channel.
