---
name: publishing-reliability
description: "Invariants, state machine and mandatory failure tests for scheduling and sending Telegram posts: Cron dispatcher, claims and leases, send_started_at, unknown results, 429 retry_after, webhook dedup. Use for any change to publications, jobs, scheduler or Telegram transport."
---
# Publishing reliability

Goal: no scheduled post silently disappears, and no ambiguous send repeats automatically. Telegram `sendMessage`/`sendPhoto` have no idempotency key, so after a timeout "not sent" and "sent without a reply" look identical.

## Invariants
1. **D1 is the only state; Cron is the only dispatcher** (every minute: reconcile, then claim a small batch of due jobs; Free plan allows 50 subrequests and 50 D1 queries per invocation). Concurrent Cron ticks are expected (overlap is undocumented, so assume it happens). If a Queue is added later, its message carries `{ jobId, schemaVersion }` only.
2. **Claim with a condition** — the exact SQL is in `docs/backend/publishing.md` §5 ("Условный захват задания"); copy it from there, never retype it. Continue only if `meta.changes === 1`.
3. **Mark before sending:** a separate statement, `UPDATE jobs SET send_started_at=? WHERE id=? AND status='claimed' AND send_started_at IS NULL`, must report `changes === 1`, and only then may you call Telegram. Never fold this into the result write: if the Worker dies after the send, this marker is the only evidence the send may have happened.
4. **Classify the outcome:**

| Telegram response | job status (`PublicationStatus` is projected from it, BACKEND §5) | Why |
|---|---|---|
| `ok:true` with `result.message_id` | `succeeded` + `external_message_id`, one `batch()` with the attempt row | confirmed |
| 429, `parameters.retry_after` | `retry_wait`, `run_at = now + retry_after` + jitter, clear `send_started_at` | Telegram rejected it, nothing was posted |
| 400 with `parameters.migrate_to_chat_id` | `failed`, code `CHAT_MIGRATED`, incident | config fix: update the channel id |
| 400 content errors (too long, can't parse entities) | `failed`, code `CONTENT_INVALID` | fix the content; never auto-retry |
| 403 (bot not admin or blocked), 400 chat not found | `failed`, code `DESTINATION_UNAVAILABLE` | needs a human |
| timeout, network error, 5xx, unparsable body, `ok:true` without `message_id` | `unknown` | it may have been posted |

5. **Reconcile on every Cron tick:**
   - `claimed` with an expired lease and `send_started_at IS NULL` → `retry_wait`
   - `claimed` with an expired lease and `send_started_at IS NOT NULL` → `unknown`
   - due `pending`/`retry_wait` → claimed by this tick's dispatcher
6. **`unknown` is resolved by a human and audited.** The operator chooses "was sent" (enters the message link/id), "was not sent" (allows a retry), or "cancel". No endpoint re-sends `unknown` blindly.
7. **Bounded retries:** a max attempt count with exponential backoff and jitter. After the last attempt the job becomes `failed` and an incident is raised.
8. **One owner per state machine:** `posts` is editorial, `publications` is the delivery intent, `jobs` holds attempts and leases. Never keep two copies of one status.

## Content and limits
- Text is 1–4096 characters after entity parsing; a caption is 0–1024. Validate this before claiming the job.
- With `parse_mode: 'HTML'`, escape user text (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`). Control link previews explicitly with `link_preview_options`.
- One post is one API call regardless of subscriber count. Honor `retry_after`. The bots FAQ limits groups to about 20 msg/min; the channel limit is undocumented, so throttle conservatively and treat 429 as the signal.
- Queue (only if added later): `delaySeconds` ≤ 24 h, at-least-once delivery, `ack()`/`retry()` per message; DLQ optional, but an exhausted message must end in a visible `failed` job. Free plan: about 3 operations per message out of 10 000/day, with 24 h retention.
- Never build logic on the bot receiving its own `channel_post`; that is unverified. The `message_id` in the send response is the confirmation.

## Mandatory tests (assert D1 state, not mock calls)
- Two Cron ticks at once (two dispatchers racing for the same job) → one send.
- A job whose tick crashed before `send_started_at` → picked up again by a later tick (lease expiry).
- Crash after `send_started_at` → `unknown`, and a retry does not send again.
- Timeout, 5xx, or ok without an id → `unknown`. 429 → `retry_wait` at `retry_after`. Each 400/403 class → its `failed` code.
- `unknown` cannot be retried through the API before it is resolved.
- Webhook `update_id` replay → processed once.

Before you finish, run these tests and paste their names and results into the report.

Sources: `references/sources.md`.
