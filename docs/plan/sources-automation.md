# Sources, automations and jobs

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 3.6 Sources

Purpose: make every external input inspectable.

Each source records:

- source type.
- canonical identifier.
- enabled/disabled.
- allowed endpoint/domain.
- last fetch started/completed.
- last success.
- freshness.
- item count.
- parser version.
- latest error code.
- consecutive failures.
- provenance on imported records.

Initial source classes:

- official Valve/Dota/Steam sources.
- approved Dota statistics sources.
- approved community or feed sources where terms and access permit them.
- platform APIs used by Telegram/TikTok/YouTube integrations.

Do not build brittle scraping of a site such as Dotabuff unless access and terms are explicitly reviewed. Dota statistics must sit behind replaceable source adapters.

## 3.7 Automation Center

Purpose: deterministic scheduled/rule-based work.

Examples:

- check an official Dota news source every N minutes.
- ingest a new patch.
- detect a new treasure.
- refresh hero statistics.
- refresh a watchlist.
- collect analytics snapshots.
- schedule owner notifications.
- execute publishing jobs.

Each automation needs:

- name.
- enabled / paused state.
- cadence.
- mode.
- source(s).
- destination or output.
- last run.
- next run.
- duration.
- result.
- failure count.
- run history.
- Run now where safe.
- Pause.
- audit record.

No LLM step exists in an automation.

## 13. Sources and data provenance

Every imported fact must answer:

- Where did it come from?
- When was it fetched?
- What period does it cover?
- Is it stale?
- Has the parser changed since it was fetched?

Required behaviors:

- dedupe by stable source id/hash.
- bounded fetches.
- backoff.
- source-specific rate limits.
- schema validation.
- parser versioning.
- raw payload retention only when justified and bounded.
- source failure incidents.
- no invented fallback values.

## 14. Deterministic automations

### 14.1 Automation categories

- source polling.
- patch/news ingestion.
- Dota statistics refresh.
- watchlist evaluation.
- analytics snapshots.
- publication dispatch.
- maintenance/cleanup.
- incident recovery checks.

### 14.2 Safety

Each automation has:

- explicit enable.
- owner-visible cadence.
- bounded batch size.
- idempotency.
- overlap-safe execution.
- timeout.
- retry policy.
- failure threshold.
- incident integration.
- audit log.

### 14.3 Automation UI

List:

- name.
- type.
- enabled.
- health.
- last run.
- next run.
- last result.

Detail:

- configuration.
- source.
- cadence.
- run history.
- output count.
- error history.
- Run now.
- Pause/Resume.

## 25. Jobs and operational history

Create /jobs after the automation/data-ingestion workload grows enough to need it.

Show:

- job type.
- status.
- scheduled/start/end timestamps.
- duration.
- attempt count.
- related object.
- safe error code.
- request/job id.
- retryability.
- next retry where relevant.

No raw secret-bearing payloads.
