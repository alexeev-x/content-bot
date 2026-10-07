# Reliability requirements

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 26. Reliability requirements across the product

### State and idempotency

- D1 owns mutable workflow state.
- every external side effect has an idempotency strategy.
- overlapping Cron ticks are expected.
- claims are conditional.
- leases expire safely.
- UNKNOWN is distinct from FAILED.

### External APIs

- finite timeouts.
- bounded retries.
- exponential/backoff where appropriate.
- rate-limit handling.
- stable internal error codes.
- source health.
- no infinite polling.

### Data

- bounded pagination.
- indexes verified for new high-volume queries.
- UTC storage.
- configured timezone presentation.
- migration for every schema change.
- expand/backfill/switch for risky changes.

### Security

- owner authentication rechecked server-side.
- upload validation by content, not just extension.
- secrets only in Worker secrets.
- no tokens in logs.
- external source payloads treated as untrusted.
- destructive actions require explicit confirmation.

### Observability

- structured logs.
- request id.
- job id.
- publication id.
- source id where relevant.
- incident linkage.
- enough diagnostics to act without exposing secrets.
