# Hero statistics and Hero Movers MVP

Queue item: 18 (`docs/IMPLEMENTATION_PLAN.md`). Source review checked 2026-10-13. This document records source limits and the bounded first implementation. The source is approved for DEV use under the owner decision below; current data-reuse terms remain unverified and no paid tier or key is approved.

## Finding

Valve's public Dota 2 datafeeds provide game dictionaries and patch details, not documented aggregate hero win/pick/ban statistics. OpenDota is the strongest no-cost candidate found for the requested Hero Movers slice: its documented `GET /heroStats` endpoint returns hero performance from recent matches, including pick/win counts by rank bracket and professional pick/win/ban counts. The rank-bucket counts would permit deterministic rates (`wins / picks`) and sample-size disclosure; they are observations of a moving recent-match window, not historical time series.

OpenDota is a community-operated, best-effort third-party source, not Valve. Its API documentation says it can be used without a key and that registering a key raises rate limits. The current API page advertises a free quota and a premium tier; those limits and terms can change. The MIT license found in the OpenDota code repository covers that repository's code; it does not, by itself, establish reuse rights or a service commitment for API data. No production dependency or data-retention assumption should be based on that license.

## Owner decision (13.10.2026)

The owner approved OpenDota's public `/heroStats` API as a bounded initial source, subject to these boundaries:

- Call it a community-derived, recent-match aggregate, never an official Valve statistic.
- Store bounded, timestamped snapshots with source URL and observed time. Compute changes only between saved observations; do not imply historical coverage before the first snapshot.
- Show the reported sample counts and freshness; omit rates when a denominator is zero or missing. Do not turn unavailable data into zero.
- Begin with the unauthenticated free endpoint, conservative bounded polling and explicit handling for rate limits, malformed responses and staleness. Do not buy a key or paid tier without a separate owner decision.
- The official docs reviewed do not establish the service's current data-reuse terms, exact sample windows or effective deployed quota. Keep provenance and source attribution visible, do not represent the source as official or guaranteed, and do not add scraping or undocumented endpoints. Stop expansion if the service's terms prohibit the use.

## Evidence

| Capability or constraint | Evidence | Implication |
|---|---|---|
| Recent-match hero performance and bracket/pro counts | [OpenDota API reference: `GET /heroStats`](https://docs.opendota.com/#tag/hero-stats) | Candidate fields support descriptive rates and sample counts, but not a historical series without our own snapshots. |
| Public API availability and optional key | [OpenDota API documentation](https://docs.opendota.com/) | A no-key technical proof is possible after approval; higher limits require registration and may have separate terms. |
| Service is community-operated and best-effort | [OpenDota FAQ](https://blog.opendota.com/2014/08/01/faq/) | Treat outages, schema drift and latency as normal; do not use it for safety-critical decisions. |
| Code license is not a data license | [OpenDota core repository](https://github.com/odota/core) | The repository's MIT license must not be presented as permission or warranty for API data. |

## Unverified

- Current per-IP unauthenticated quota and actual stability/latency from the DEV Worker environment.
- Data coverage, exact underlying time window, sample-size semantics and patch/version attribution for each returned statistic.
- OpenDota's current data reuse terms for this specific product and any attribution expectation.

## First implementation

- A scheduled Worker poll reads only `GET https://api.opendota.com/api/heroStats`, without a key, at most once every six hours. A conditional D1 claim prevents overlapping Cron ticks from duplicating a poll. The public UI/API never fetches upstream data.
- Each accepted response is bounded to 200 heroes and a 512 KiB body; the Worker validates the complete source shape before saving one snapshot. A malformed or oversized response cannot replace the last good snapshot.
- Retain successful observations for 30 days. The idle hourly cleanup deletes at most 100 expired snapshots per tick; a successful poll also removes an at-most-100-row batch. The API returns the latest and immediately preceding observations, with their server-observed timestamps. The first successful observation is a baseline, not a historical period.
- For the selected skill bracket (1–8) or professional matches, show current wins and picks. Win rate is computed only when both values exist and picks are greater than zero. Pro bans are shown as a raw sample count only; no ban rate is inferred without a denominator.
- Hero Movers compare only win-rate percentage points between the latest two observations, sorted into largest rises and falls. Include a hero only when both observations have at least 100 picks for the selected segment. If there is no prior observation or no qualifying sample, explain that instead of showing zero movement. The source's underlying rolling window is not documented, so never label this as a 6-hour/24-hour trend or a patch effect.
- The UI is read-only on the existing `/sources` page, under a dedicated «Герои» tab. It identifies OpenDota as a community source (not Valve), shows observation/freshness and cached-data warning, and never offers source refresh, draft creation, watch changes, or publishing from this tab.
- Upstream failure, rate limiting, malformed JSON/shape, or body-limit rejection is persisted as a source-health error; the previous snapshot stays available and is marked stale/degraded. The source is best-effort and has no automatic retry inside the same six-hour poll slot.
- Endpoint: owner-only `GET /api/v1/dota/hero-statistics`, read-only from D1, returning source attribution, health, last attempt/success/error, and latest/previous snapshots. No user input, mutation, arbitrary URL, or client-selected upstream parameter.

### Acceptance criteria

1. Given no successful poll yet, when the owner opens «Герои», then the UI identifies the source and shows an explicit unverified/empty state without fabricated metrics.
2. Given a valid source response, when the scheduled poll claims the six-hour slot, then one complete bounded snapshot is saved with server observation time; a competing Cron cannot claim or persist a second snapshot for that slot.
3. Given a timeout, non-2xx, oversized body, invalid JSON, or invalid hero data, when a poll fails, then the last good snapshot remains unchanged, the stable error code is persisted, and the UI warns that cached data may be stale.
4. Given latest and previous snapshots, when the owner chooses a rank bracket or professional matches, then win rate is derived only from positive sample counts and Movers include only heroes meeting the 100-pick floor in both observations.
5. Given fewer than two snapshots or no hero meets the sample floor, when the owner opens Movers, then the UI explains the missing baseline/sample and does not substitute zero deltas.
6. Given an unauthorized or non-owner request, when `GET /api/v1/dota/hero-statistics` is called, then the existing owner auth boundary returns 401/403 without exposing D1 data; this read endpoint never contacts OpenDota.
7. Given a newer source payload contains unknown fields or changes shape, when validation fails, then no partial snapshot is persisted and the last success remains readable.
8. Given observations are older than 30 days, when idle hourly cleanup runs, then it deletes no more than 100 expired snapshots in that tick and leaves newer observations and publication state unchanged.

### Data and source caveats

- Source fields used: `id`, `localized_name`, `pro_pick`, `pro_win`, `pro_ban`, and `1_pick`/`1_win` through `8_pick`/`8_win`. All counts are nonnegative integers; absent metrics become `null`, never zero.
- `GET /heroStats` is documented as recent-match performance, but its exact moving window, patch attribution, and data-reuse terms are not established. Deltas therefore mean only “difference between two observations”, not historical match-period change.
- No Valve endorsement, official status, guaranteed freshness, historical backfill, hero images, patch-specific conclusions, or external publication claims.
- The code repository's MIT license is about code; it is not treated as a license for API data. Attribution and bounded use follow the owner decision; stop expansion if applicable service terms prohibit this use.
