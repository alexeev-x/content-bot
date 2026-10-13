# Hero statistics source feasibility

Queue item: 18 (`docs/IMPLEMENTATION_PLAN.md`). Source review checked 2026-10-13. This is a source feasibility note only: it adds no connector, API call, snapshot job, schema, or UI.

## Finding

Valve's public Dota 2 datafeeds provide game dictionaries and patch details, not documented aggregate hero win/pick/ban statistics. OpenDota is the strongest no-cost candidate found for the requested Hero Movers slice: its documented `GET /heroStats` endpoint returns hero performance from recent matches, including pick/win counts by rank bracket and professional pick/win/ban counts. The rank-bucket counts would permit deterministic rates (`wins / picks`) and sample-size disclosure; they are observations of a moving recent-match window, not historical time series.

OpenDota is a community-operated, best-effort third-party source, not Valve. Its API documentation says it can be used without a key and that registering a key raises rate limits. The current API page advertises a free quota and a premium tier; those limits and terms can change. The MIT license found in the OpenDota code repository covers that repository's code; it does not, by itself, establish reuse rights or a service commitment for API data. No production dependency or data-retention assumption should be based on that license.

## Recommendation

Ask the owner to approve or reject OpenDota's public `/heroStats` API as the initial external source for Hero Movers, subject to these boundaries:

- Call it a community-derived, recent-match aggregate, never an official Valve statistic.
- Store bounded, timestamped snapshots with source URL and observed time. Compute changes only between saved observations; do not imply historical coverage before the first snapshot.
- Show the reported sample counts and freshness; omit rates when a denominator is zero or missing. Do not turn unavailable data into zero.
- Begin with the unauthenticated free endpoint, conservative bounded polling and explicit handling for rate limits, malformed responses and staleness. Do not buy a key or paid tier without a separate owner decision.
- Confirm data-use terms and an acceptable freshness/snapshot cadence before implementation. If the owner declines, leave the item waiting for an approved source rather than scraping a site or substituting undocumented endpoints.

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
- Whether the owner accepts community-derived data and its best-effort availability.
