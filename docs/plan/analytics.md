# Analytics

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 3.8 Analytics

Purpose: preserve history and answer operational/content questions with measured data.

Analytics is split into:

1. publication reliability.
2. Telegram channel/post analytics.
3. content comparisons.
4. Dota/statistics monitoring.
5. later TikTok/YouTube analytics.

Comparisons are deterministic. Examples:

- post vs median of the same rubric.
- same-age comparison at +1h/+3h/+6h/+12h/+24h/+48h/+72h.
- media type performance.
- publication time performance.
- destination performance.
- rubric performance.

The UI must always show period, source and freshness. Observation and source data must not be presented as a causal conclusion.

## 4.6 Analytics snapshots

Use timestamped snapshots, not mutable final counters.

Suggested dimensions:

- platform.
- destination/channel.
- post/content id.
- publication id.
- metric.
- value.
- observed_at.
- content_age_seconds.
- source.

This allows same-age comparisons and preserves history.

## 11. Telegram analytics

Telegram analytics is a separate capability from publication reliability.

### 11.1 Stage A — Studio-owned analytics, build first

We can always measure our own operational history:

- post count.
- publication count.
- success/failure/unknown.
- scheduled vs immediate.
- publish time.
- destination.
- rubric.
- text length.
- media type/count.
- revision.
- message ids.
- retries/attempts.
- cancellation/reschedule history.

Start storing this immediately because it becomes useful historical data.

### 11.2 Stage B — message/channel performance metrics

Target metrics where a connected Telegram capability actually exposes them:

- subscribers/followers.
- growth.
- views.
- forwards/shares.
- reactions.
- views per post.
- shares per post.
- top hours.
- traffic/source breakdown.
- follower-source breakdown.
- audience language.
- notification-enabled share.
- recent message interactions.

Important architecture constraint:

The current product uses the Telegram Bot API for publishing. Rich native channel statistics are not assumed to be available through the bot integration. Before implementing rich channel stats, make a dedicated integration decision and proof-of-concept for the allowed Telegram API/auth model. If full statistics require an authenticated Telegram user client, that is a separate security/runtime integration and must not be smuggled into the existing bot token flow.

The Analytics UI must gracefully support:

- full metrics.
- partial metrics.
- source unavailable.
- source stale.
- metric not supported by this connector.

### 11.3 Snapshot schedule

For metrics that can be collected, store observations at useful content ages, for example:

- +1h.
- +3h.
- +6h.
- +12h.
- +24h.
- +48h.
- +72h.
- +7d.

Exact cadence may differ by platform/API rate limits.

### 11.4 Analytics screen

Filters:

- period.
- channel.
- rubric.
- media type.
- post.

Views:

- channel overview.
- post performance table.
- same-age comparison.
- time-of-day performance.
- media-type comparison.
- publication reliability.

Do not label a correlation as a cause.

## 21. Experiments — later, manual

Allow the owner to record controlled experiments:

- hook variant.
- title variant.
- thumbnail variant.
- publish time.
- caption.
- media type.

Record:

- hypothesis.
- variant.
- start time.
- relevant metrics.
- manual conclusion.

Studio may compute deterministic differences. It does not produce AI conclusions.
