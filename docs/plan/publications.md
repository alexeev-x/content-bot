# Publications

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 3.2 Publications Center

Purpose: answer what was or will be sent, where, when, and what happened.

Capabilities:

- scheduled, queued, sending, sent, failed, unknown, cancelled states.
- filters, search, period and sorting.
- channel and platform.
- message identifiers and links where available.
- attempt timeline.
- reschedule.
- cancel.
- safe retry only when backend state explicitly allows it.
- manual reconciliation of UNKNOWN.
- multi-message result support for albums/sequences.

## 4.4 Publication messages

The current single Telegram message id is insufficient for multiple attachments.

Extend the publication result model so one publication may own one or more sent messages:

- publication_messages.
- platform message id.
- order.
- media asset id when relevant.
- URL/reference where available.
- sent timestamp.

Keep a primary message id for compatibility if useful, but the canonical result for a multi-message publication is an ordered set.

## 7. Publications Center v2

### 7.1 List

Delivered 08.10.2026 (DEV): tabs Все / Запланированные / Отправленные / Ошибки, live search and column sort (client-side over loaded pages), «Опубликовать пост» picker, inspector. Still missing: date-range filter («Сегодня»), failed+unknown multi-status filter, total counts, server-side search/sort.

Add:

- search by post title/id.
- period.
- status.
- channel.
- platform later.
- sort.
- pagination.
- clear status semantics.
- compact last-error summary.
- message count for albums/sequences.

### 7.2 Publication detail/timeline

Show an operational timeline:

- created.
- scheduled.
- rescheduled.
- claimed by dispatcher.
- attempt started.
- provider accepted.
- message ids.
- sent.
- failed.
- UNKNOWN.
- reconciled.
- cancelled.

Each attempt exposes safe diagnostics:

- timestamp.
- request id.
- stable error code.
- retryability.
- duration.
- no secret/raw token leakage.

### 7.3 Safe actions

- reschedule only from allowed states.
- cancel only from allowed states.
- retry only if backend explicitly says retryable.
- UNKNOWN never gets automatic retry.
- reconciliation is explicit and audited.
- deleting a Studio record never implies deleting the Telegram channel message unless a separate explicit feature is later designed.

## 10. Owner timezone and publication defaults

Settings must add:

- owner timezone.
- default Telegram destination.
- optional default publish mode.
- optional default rubric when rubrics exist.

Bot /today, Dashboard, Calendar and scheduling use the same owner timezone.

Remove the current hard-coded bot timezone.
