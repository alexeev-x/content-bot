# 7. Working quotas and cost

The planned load is up to 1,000 **background jobs/day** (a target, not measured); in the first month realistically 20–50. Free limits we design for:

- Workers Free: 100,000 requests/day; **10 ms CPU per invocation** (network wait is not counted); 50 subrequests and 50 D1 queries per invocation; 128 MB memory; up to 5 Cron triggers per account. Cron once a minute = 1,440 invocations/day.
- The per-tick batch is bounded by subrequests and D1 queries: per job ≈ claim + mark + send + outcome write. With a batch of a few jobs, the capacity of thousands of jobs/day is above the target — **but this is a calculation, not a measurement**; it is confirmed by a load test.
- D1 Free: 500 MB per database, Time Travel 7 days. Workers Logs Free: 200,000 events/day, retention 3 days (from 01.12.2026 — a new model: 0.5 GB/day, 7 days).
- Queue (if needed): 10,000 operations/day on Free, ≈ 3 operations per message, retention 24 h.

The number of subscribers does not equal the number of Bot API requests: a post to a channel or group is sent once. Telegram limits sending to a group (about 20 messages per minute) — a 429 response with `retry_after` is handled as `rate_limited`. Large media go to R2, not D1. Image generation on the Free plan (10 ms CPU) lives outside the Worker; the decision comes after measurements.
