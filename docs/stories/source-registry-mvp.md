# Sources registry MVP

## User story

As the owner, I want to inspect the two configured official Dota/Steam feeds and their persisted health and provenance, so I can tell whether each feed has been checked successfully and inspect the updates already observed from it.

## Facts

- The existing page is `/sources`; the existing read route is `/api/v1/dota`.
- The current feed set has exactly two configured official sources: `steam_news` and `patch_notes`.
- Persisted latest-attempt and latest-success timestamps already exist. Source health is based on those persisted timestamps and open incidents, not frontend guesses.
- Existing DTOs are `DotaSourceDto`, `DotaUpdateDto`, and `DotaIntelligenceDto`. They cover the two source summaries, bounded observed updates, and optional links to already-existing drafts.
- The route and DTO are owner-only and read-only.

## Assumptions

- The owner remains the only actor for this first slice; no other role or permission model is introduced.
- Source health and update provenance are displayed as returned by the existing read model. The UI does not calculate a separate health status.
- This story documents inspection of the existing two feeds, not a configurable source registry.

## Open decisions and deferred details

- The full source registry described in `docs/plan/sources-automation.md` §3.6/§13 includes fields and behaviors beyond this MVP. Whether and when to expose source type, enabled state, endpoint/domain, item count, parser version, freshness policy, consecutive failure count, or raw payload retention is deferred; the MVP must not imply these are available.
- No owner policy is specified here for stale thresholds, source enable/disable, adding feeds, polling cadence, retry/backoff controls, or incident management. These remain deferred and are not inferred from current health labels.
- No scrape or import behavior is added. Approved statistics/community sources and any broader feed set are deferred.

## Page specification

### `/sources` — Official source health

Purpose: let the owner inspect persisted health for the two configured official feeds and review updates already observed from them.

Title/H1: “Источники — ALEXEEV Studio”; on route change, update the document title and move focus to the H1.

Data: `DotaIntelligenceDto`, containing `DotaSourceDto` summaries and bounded `DotaUpdateDto` observations. The Sources tab is the initial view and keeps both feed summaries visible even when no update has been observed. Show source identity/official link, latest attempt, latest success, health, and any open incident supplied by the data. For updates, show title, source link, publication/detection timestamps, type, and a link only when an existing draft is linked.

Actions: safely refresh the read; open an official source link; open an already-existing linked draft. Refresh repeats only the read and does not trigger source polling. Links are navigation-only, safe to repeat, and do not alter source or publication state. There is no poll-now, enable/disable, add-feed, or edit action in this MVP.

Permissions: owner may view the returned data; this page is read-only. A 403 shows no source or update data and provides safe navigation back. No non-owner access is introduced.

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first read is pending | structural skeleton for the two feed summaries in the initial Sources view; region marked `aria-busy` | none | unchanged |
| empty | no updates are returned | both configured feed summaries plus a clear “no observed updates” explanation in the initial Sources view; not an empty registry | open official source links | unchanged |
| error | network or server failure | concise error and `requestId` when supplied; no fabricated health/update values | retry the safe read | error message |
| 401 | session expired | redirect to login and clear cached private data | sign in | login H1 |
| 403 | owner permission denied | “Нет доступа”; no source summaries, incident details, or updates | navigate back | message |
| 409 | no write/conflict operation exists | n/a | n/a | n/a |
| scheduled/queued | no scheduling or queued action exists | n/a | n/a | n/a |
| unknown | no Telegram send or ambiguous action exists | n/a | n/a | n/a |

Time: display timestamps in the configured owner timezone with UTC offset and IANA zone, retaining enough context to distinguish last attempt from last success and publication from detection. If a timestamp is absent, show “Ещё не проверялся” for attempt or “Успешных проверок пока нет” for success; do not substitute the current time.

Responsive: follow `docs/design/UX_SPEC.md` Conventions; preserve both feed summaries and all update navigation at 320 px through 1920 px+, with no horizontal page overflow. Compact layout stacks summaries and updates; wider layouts may use denser rows.

A11y: semantic page heading and list/table labels; health must be text, not color alone; links have meaningful names; keyboard users can reach all links; focus moves to H1 on route navigation; do not use drag-only interactions.

## Acceptance criteria

1. Given an owner opens `/sources`, when data loads, then exactly the two configured feed summaries (`steam_news` and `patch_notes`) are represented, even if either has no observed updates.
2. Given a feed has persisted attempt or success timestamps, when its summary is shown, then the corresponding timestamps and returned health are displayed in the owner timezone with its UTC offset and IANA zone, without client-side health inference; missing timestamps use the specified “not checked” copy rather than a fabricated date.
3. Given an update is returned, when it appears in the list, then its source identity, type, title, source link, published time, and detected time are shown in the owner timezone with its UTC offset and IANA zone; when a linked draft is present, its title links to that existing draft, and when absent, no draft link is shown.
4. Given no updates are returned, when the page finishes loading, then it still shows both feed summaries and explicitly says no updates have been observed.
5. Given the safe read fails with a network or server error, when the error state appears, then no missing values are represented as healthy or current, a concise error is shown, and retry repeats only the read.
6. Given the session is unauthorized, when the read returns 401, then the user is sent to login and cached private source data is cleared.
7. Given the actor lacks owner permission, when the read returns 403, then no source/update data is rendered and the page offers safe navigation back.
8. Given a user opens an official-source or linked-draft link, when navigation occurs, then no source configuration, feed polling, publication, retry, or reconciliation mutation is triggered.
9. Given the page is used with keyboard navigation or at any required responsive width, when all page links are traversed, then each link is reachable and named, health is not color-only, and there is no horizontal page overflow at 320 px.

## MVP boundary

Included: inspect persisted health/provenance for the two existing official feeds, inspect their returned updates, and navigate to official source pages or already-existing linked drafts.

Deferred: editable registry, new feeds, source toggles, manual polling/retries, scraping, statistics/community sources, automation configuration, confirmed-fact detail, watchlists, freshness policy controls, and unexposed registry telemetry.
