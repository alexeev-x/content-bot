# 5. Reliable publishing: states and races

```text
posts:   draft → approved
jobs:    pending ──(Cron: run_at ≤ now, conditional claim)──→ claimed ──→ succeeded
            ↑                                                  │   ├──→ retry_wait ──(run_at)──→ claimed
            └──────────── cancelled (only before sending)      │   ├──→ failed
                                                               │   └──→ unknown ──(manual reconcile)──→ succeeded / pending / cancelled
                                                    audit: job_attempts
```

- `posts` is the editorial entity; `publications` is the intent to deliver a post to a specific destination (channel or group); `jobs` are attempts and leases. One state machine — one owner; we do not store two copies of the same status.
- **Cron is the dispatcher; a queue kick wakes it early.** A publication due now (automatic posts, «Опубликовать сейчас» in the studio and the bot) also sends a `dispatch_now` message to `AI_JOBS`, whose consumer runs the same `dispatchDueJobs` at once instead of waiting up to a minute for the tick (review 24.10.2026, `app/workflows/dispatch-now.ts`). Nothing else differs: the same conditional claim, send mark and outcome classification, so a kick racing a tick sends once, and a lost kick only leaves the post to the next tick. The kick sends the «Опубликовано» notices of what it sent; incidents it stores are alerted by the next tick. Each tick: (1) reconcile — an expired lease without `send_started_at` → `retry_wait`, with `send_started_at` → `unknown`; (2) select up to N jobs (`pending`/`retry_wait`, `run_at ≤ now`) — N is small because of the Free limits (10 ms CPU, 50 subrequests and 50 D1 queries per invocation); (3) for each — conditional claim, set `send_started_at`, send, write the outcome in one `batch()`.
- **Conditional claim** (below) with a `meta.changes === 1` check. Two simultaneous Cron ticks or a retry do not create a second send.
- **`send_started_at` is written by a separate confirmed query before the Telegram call.** If the Worker crashes after sending, this mark is the only evidence that the publication may have happened.
- Telegram offers no idempotency for send methods: after a timeout, "not sent" and "published without a response" are indistinguishable. Adapter outcomes (§4): `sent` → `succeeded`; `rate_limited` → `retry_wait` with `run_at = now + retry_after` + jitter (Telegram refused — retry is allowed); `rejected` → `failed` with a code and an incident; `unknown` → `unknown`, **no automatic retry**, a manual reconcile button.
- Retries only for safe cases (`rate_limited`), with a cap on attempts and exponential delay; after the last one — `failed` and an incident.
- `UNIQUE(dedupe_key)` protects against re-creating a job; a repeated client request is caught by `Idempotency-Key` (see `API_CONTRACTS.md`). If the owner deliberately publishes a post again, that is a new intent and a new `publicationId`.
- **If Queue appears later:** the message carries only `{jobId, schemaVersion}`, state stays in D1, the claim is the same; Queue merely speeds up delivery but does not own state.

### Rich posts (as built, migration 0103)

A post with `rich_html` (owner, 23.10.2026: every post in the approved rich format) is sent with `sendRichMessage`
(Bot API 10.1) instead of `sendMessage`/`sendPhoto`/`sendMediaGroup`; `body` keeps its plain text for the studio. The
HTML names the post's media by position (`tg://photo?id=p1`…, contracts `post-rich.ts`) and only the named ones are
uploaded. Nothing else changes: the same claim, `send_started_at` mark and outcome classification. The dispatcher re-checks
the approved snapshot before the mark (`richHtmlIssue`: a missing picture or `<mark>` → `failed` `CONTENT_INVALID`, over
50 media → `TELEGRAM_MEDIA_UNSUPPORTED`), and Telegram refusing the markup is a definite 400 → `CONTENT_INVALID`, never
`unknown`. The classic album (10 media) and caption (1024) limits do not apply.

### Conditional job claim

```sql
UPDATE jobs
SET status = 'claimed', attempts = attempts + 1,
    lease_until = ?1, updated_at = ?2
WHERE id = ?3 AND status IN ('pending', 'retry_wait')
  AND run_at <= ?2
  AND (lease_until IS NULL OR lease_until < ?2)
  AND (blocked_by_job_id IS NULL OR EXISTS (
    SELECT 1 FROM jobs previous WHERE previous.id = jobs.blocked_by_job_id AND previous.status = 'succeeded'
      AND previous.updated_at + coalesce(jobs.chain_gap_ms, 0) <= ?2))
RETURNING id, publication_id, attempts;
```

The last condition (migration 0098, `SERIES_READY_SQL`) holds a series post until the previous post's job is
`succeeded` and the gap has passed since; the due scan checks it too. See «Series» below.

For compound changes use `D1Database.batch()` (atomic transactional batches). For selecting due jobs — a partial index on `(status, run_at, id)`; keyset pagination only and small pages. No `SELECT *` over the whole history.

### Status projection for the API

`PublicationStatus` in the contracts is a user-facing projection; the interface does not depend on internal fields. Labels and colors — in the `page-spec` skill.

| Internal state | `PublicationStatus` |
|---|---|
| job `pending`, `run_at` > now | `scheduled` |
| job `pending`, `run_at` ≤ now | `queued` |
| job `claimed`, `send_started_at` empty | `preparing` |
| job `claimed`, `send_started_at` set | `sending` |
| job `succeeded` | `sent` (+ `externalMessageId`) |
| job `retry_wait` | `retry_wait` |
| job `failed` | `failed` (+ `lastErrorCode`) |
| job `unknown` | `unknown` |
| job `cancelled` | `cancelled` |

This table and its unit test change together (skill `contract-change`).

### Owner actions on a job (cancel, reschedule)

Both are one `batch()` and race the dispatcher's claim on the same row, so the job statement is conditional: `UPDATE jobs … WHERE publication_id = ? AND status IN ('pending','retry_wait') AND EXISTS (publication with the expected revision)`. `claimed` is never matched (the claim SQL above is the only way in, and the only way out is the dispatcher or reconcile); `unknown` needs manual reconciliation; the rest are final. The lease is not part of the condition: a job in `pending`/`retry_wait` is not being sent, whatever `lease_until` says. The publication row (revision + 1, new `scheduled_at`/`timezone`) and the audit row are written only when the job statement changed a row (`changes() = 1`, which is why the statement order in `d1-publication-repository.ts` matters), and the last statement of the batch reads the result, so a refusal is classified from the state it was decided on: the job state first (`NOT_CANCELLABLE` / `NOT_RESCHEDULABLE`, no revision helps), then `STALE_REVISION`, and no row is `NOT_FOUND`. Reschedule moves a `retry_wait` job back to `pending` with the new `run_at` and keeps `attempts`.

**Resolve unknown (as built).** `POST /publications/{id}/resolve-unknown` (`application/resolve-unknown.ts`, `PublicationRepository.resolveUnknown`) is the only way out of `unknown`, never sends to Telegram and never retries; Cron only picks up what the owner made dispatchable again. It is the same guarded batch as cancel/reschedule, except the job statement is conditional on `status = 'unknown'` (instead of `pending`/`retry_wait`) and the publication at the expected revision. Statements, in order: the job update, the publication row (revision + 1), the audit row `publication.resolve_unknown` (actor owner; details: new revision, outcome, and the message id or the new time; never message text), `UPDATE incidents SET resolved_at = max(created_at, now) WHERE job_id = ? AND resolved_at IS NULL` (so the owner alert stops showing it and `countOpenIncidents` drops), and the read of the result. Each statement after the job update runs only if `changes() = 1` held on the previous one. Outcomes: `sent` → job `succeeded` (the archive step then archives the post like after a normal send, because the job's `updated_at` is the resolve time), `publications.external_message_id` = the id the owner entered, `last_error_code` cleared; `resend` → job `pending` with `run_at` = the new time (past times up to 5 minutes back are due at once, beyond that or over 366 days ahead is `400 SCHEDULE_OUT_OF_RANGE`, checked before the write), `send_started_at` cleared (the owner saw the message is not in the channel, and the next claim must be able to set the mark again), `last_error_code` cleared, `publications.scheduled_at`/`timezone` updated; `attempts` is kept, because `job_attempts` is keyed by it and its `unknown` row stays as history, so a resend spends from the same 5-attempt budget (an unknown on the last attempt, resent, fails with `RETRIES_EXHAUSTED` on the first retryable refusal); `cancel` → job `cancelled`. A refusal is classified from the state read inside the batch: a job that is not `unknown` is `409 NOT_UNKNOWN` (whatever the revision, so a double press gets this), then `409 STALE_REVISION`, and no row is `404`. Two concurrent requests with the same revision: the second finds the job already resolved, so exactly one applies. It sends no owner notice.

Creating a publication is one batch guarded in SQL: the publication insert needs the post still approved at the expected revision and the destination still enabled (`WHERE EXISTS` on `posts` and `destinations`, a read-only reference to the content tables the FK already implies), and every later statement (job, audit, completing the idempotency key) keys off the publication row, so a concurrent change writes nothing. `publications.scheduled_at` is the owner's intent; `jobs.run_at` is when the dispatcher may act (it diverges on `retry_wait`). `jobs.publication_scheduled_at` is a copy of `scheduled_at` used only as the sort key of the status-filtered list (index `jobs_status_scheduled_idx`, so a rare status never reads the history of sent ones); create and reschedule write it in the same batch. Reconcile reads `jobs_claimed_lease (status, lease_until) WHERE status = 'claimed'`. The due scan must repeat the `jobs_due` predicate literally (`status IN ('pending','retry_wait')`); `status = 'pending'` alone is not recognised as implying it and loses the index.

### Series (as built, migration 0098)

`POST /publications/series` (`application/create-publication-series.ts`) writes 2–5 publications in one batch: each insert has the guards of a single create plus `series_id`/`series_position`, each job after the first gets `blocked_by_job_id` (the previous job) and `chain_gap_ms` (the interval). A guard refuses by writing nothing, so a statement before the idempotency key fails the batch on purpose (`json()` of a non-JSON string) when the series is incomplete: D1 rolls the whole batch back. A blocked job is due only when the previous job is `succeeded` and `chain_gap_ms` has passed since its `updated_at` (the send, or the owner's «Пост вышел»): the due scan and the claim both check it (`SERIES_READY_SQL`), and nothing is written when the previous post goes out — no trigger, because D1 counts trigger changes in a statement's `changes`, which the dispatcher and the owner actions rely on, and the tick's statement budget stays as it was. So an unknown post holds the later ones until the owner reconciles it, and a failed one (final, never resent) until the owner cancels them; a reschedule of a held post moves its time but it still waits; `retry_wait` of the previous one keeps them waiting too. Cancel (and «Не вышел — отменить»), the owner's post delete and a media delete that leaves a scheduled post empty each cancel the later posts of the series in the same batch (the archive purge does not: an archived post has no waiting publication, and a failed one already holds the later posts until the owner cancels them). Cancel appends to its batch a statement that cancels the later posts of the series still `pending`/`retry_wait`, only when this batch cancelled the post, with one audit row each; the decision stays with the first statement. The DTO's `series.waitingForPrevious` is computed from the same rule at read time, and the dashboard counts a held post as stuck only once it has been ready past the threshold. `blocked_by_job_id` is not a foreign key, so deleting a job never fails on it.
