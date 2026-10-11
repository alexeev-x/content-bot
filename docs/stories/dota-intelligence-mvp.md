# Dota Intelligence MVP

## Owner goal

> “5. Dota Intelligence — реестр источников, новости и патчи, события, watchlists и уведомления. вот этот блок делай там в прототипе же есть для него все что надо визуально”

## User story

As the authorized Studio owner, I want one place to inspect verified official Dota updates, their source health, and the update drafts already created for me, so I can decide what deserves further content work without relying on invented facts.

## Implementation progress

The first read-only slice is implemented at `/sources`: owner-only `GET /api/v1/dota` surfaces the two configured feeds, persisted attempt/success timestamps, open incidents, newest bounded official updates, and links to drafts that already exist. It does not add source editing, event normalization, watchlists, new notification behavior, or unsupported categories. Later slices below remain planned until their acceptance criteria are implemented and verified.

## Facts

- Phase 1D already polls two fixed official-source feeds (Steam Community announcements filtered to the official feed, and the official Dota patch list), deduplicates persisted records, and seeds each source's first successful read as a baseline. See `docs/plan/dota.md` §12.1.
- New non-baseline updates can create deterministic drafts and private owner alerts. Patch summaries contain only allowlisted, parsed facts; uncertain/unsupported formats are held for manual review. Source failures create incidents and private alerts. This is existing behavior, not this story's implementation.
- The `/__proto` Sources/Dota Pulse visual is a mock, with fictional events and source rows (`docs/design/UX_SPEC.md` §3.5 E/G). It is a visual reference only; it is not evidence that those events or source capabilities exist.
- The additive `DotaIntelligenceDto` and owner-only `GET /api/v1/dota` are limited to the first read-only slice. Existing `PostDto` and `IncidentDto` still do not represent a normalized Dota event, confirmed patch fact or watchlist.
- The current feeds do not establish a trustworthy source for hero/item win rates, pick rates, ban rates, tournament schedules/results, treasure contents or other cosmetic catalog data. The official patch list also does not distinguish gameplay patches from minor updates.

## Assumptions

- This is an owner-only feature, using the existing Studio owner session. It does not introduce collaborators or new access roles.
- Start with the two already configured official feeds and their persisted records. Adding a source is not part of the first slice.
- The visual prototype may guide layout and interaction hierarchy, but its fictional data, images and implied capabilities must be replaced with real states and verified provenance.
- Notification delivery remains private to the owner through the already configured owner bot; this story does not authorize public posts or automatic publication.
- The first watchlist rules can only match exact supported entities/terms in confirmed official update facts. They cannot evaluate game statistics or infer semantic relevance.

## Open decisions / capability checks

- A future source for hero/item statistics has not been approved or verified for coverage, freshness, licensing/terms, or stable access. Keep all stat dashboards and movers out of scope until a source feasibility task supplies evidence and any needed owner approval.
- Structured event, tournament, treasure and cosmetic feeds are not established. Do not show fictional event data as live and do not promise these categories in the MVP.
- It remains to be proven which persisted Phase 1D records and patch facts can be presented as a unified event without a data migration. The read-only slice must expose only fields the current system can substantiate; missing details are visibly unavailable, not inferred.
- Alert preferences, thresholds and quiet hours have no accepted product behavior yet. The first watchlist slice uses one explicit rule and the existing owner notification path; configurable notification preferences are deferred.

## Product boundary and vertical slices

Build incrementally, reusing the existing `/sources` responsibility and the visual language of `/preview/sources`. Do not build a second source registry. The Dota Pulse/events view may be added as a separate tab or sibling view only if it remains a distinct browse task.

1. **Surface existing sources and update records (read-only).** Show only the two fixed feeds, verified last successful check/freshness, current source incident/recovery state, official update title/time/link, and an existing linked draft when present. This makes current Phase 1D behavior inspectable without claiming editable source configuration.
2. **Expose confirmed patch facts.** Present only the facts already accepted by the deterministic parser, with official source link and patch version. Unsupported/held summaries must be labeled for manual review and must not be rendered as a complete or ranked change list.
3. **Owner watchlists and matching alerts.** Allow the owner to add/remove supported exact entity or update-type watches. Evaluate only persisted confirmed facts and source updates; deduplicate each match and send a private owner alert. No statistics thresholds or inferred matches.
4. **Broaden event/source coverage only after evidence.** Add another source or event category only through a separate feasibility-backed slice with provenance, licensing/terms, failure handling and acceptance tests. Statistics, cosmetics and tournaments do not enter this MVP by implication.

## Route and responsibility

Extend the existing `/sources` product responsibility with Dota-specific source health and a Dota updates/Pulse view. Do not add `/dota` unless later research demonstrates that Dota event browsing is an independent owner task that cannot fit within `/sources`.

**Purpose:** Let the authorized owner inspect verified official Dota updates, their source health, confirmed patch facts and linked drafts, then manage narrowly supported watches.

**Title/focus:** “Источники и Dota Pulse — ALEXEEV Studio”. On navigation, set the document title and move focus to the H1. On tab/view change, keep focus on the selected tab; announce updated result counts politely.

**Data needed:**

- Source summaries: stable source identity/name, official host, last attempt, last successful check, freshness, health, and current incident/recovery state.
- Bounded update list: official title, canonical URL, source identity, source publication time when provided, detection time, update type only when established, patch version when provided, and linked generated draft when one exists.
- Confirmed patch facts: named entity, fact/value change, parser support/manual-review state, patch version and official reference. Preserve the source's actual meaning; do not imply buff/nerf or importance where the parser did not establish it.
- Owner watches: supported exact entity/type, enabled state and last matching update. Notification outcome is visible only to the extent that the existing owner alert records can prove it.

**Existing DTO coverage:** none for Dota source, update, patch fact or watchlist data. `PostDto` can identify a linked draft and `IncidentDto` can identify an existing source incident, but neither covers the Dota read model. Define/approve the missing shared shapes and operations before implementation; do not overload unrelated DTOs.

**Operations:** safely refresh/read bounded source and update lists; add/remove an owner watch; open the official source; open an already-linked draft. Refresh is safe to retry. Adding/removing a watch must be idempotent. Opening an external source or linked draft has no server mutation. No publish/send action is offered from this page.

**Permissions:** only the authenticated owner can view or change watches. On 403, show no Dota data and a clear no-access state. Source data and notification records are private. Public publishing is not part of this feature.

## State matrix

| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | First read or explicit refresh | Layout-matched source cards and update rows; region marked busy | No duplicate refresh while pending | Unchanged for refresh; H1 on initial navigation |
| empty | Read succeeds with no updates in selected period | “Новых официальных обновлений нет”; source health remains visible | Change period/filter or safely refresh | Empty-state heading |
| filtered empty | Updates exist but current filters match none | “Нет обновлений по этим фильтрам” | Clear filters | Filter summary |
| error | Network/5xx read failure | ErrorState with short message and request ID; previously loaded data marked stale, never presented as current | Retry safe read | Error message |
| 401 | Owner session expired | Session-expired state; Dota data is not shown | Sign in again | Login H1 after redirect |
| 403 | Non-owner or denied session | “Нет доступа”; no Dota data | Return to a permitted page | Message heading |
| 409 | Concurrent watch edit or stale watch revision | Conflict message; current server watch state is shown; no false success | Reload watches and retry the explicit add/remove action | Conflict message |
| queued | n/a — page does not queue owner actions | n/a | n/a | n/a |
| unknown | Source fetch, parser result, or notification outcome is ambiguous/unavailable | Source health is “Неизвестно” or “Требует проверки”; last confirmed data retains its timestamp; never label it current or successfully alerted | Retry safe read; inspect incident; no blind notification resend | Warning message |
| partial/stale | One feed fails or last success exceeds its freshness threshold | Available source data remains visible with per-source stale/unavailable label and last successful time; no aggregate “all healthy” status | Open source incident/details; safely refresh | Status warning |
| unsupported fact | Parser cannot establish a supported fact or entity | Manual-review label and official link; no guessed value/rank/direction | Open official source | Manual-review status |

## Acceptance criteria

1. Given a successful source read, when the owner opens the Sources view, then each displayed source is one of the configured official feeds and shows its official host, last successful check, freshness and health; no fake prototype source is shown.
2. Given a feed has never completed a successful read, when the source list renders, then it is labeled as not yet verified and does not show a fabricated successful timestamp.
3. Given one feed is stale or has an open source incident, when the other feed is healthy, then healthy updates remain available and the stale feed is individually marked with its last successful time; the page does not report both feeds as healthy.
4. Given a persisted official update, when it appears in Dota Pulse, then it links to its canonical official source and displays only source-provided title/time/type/version data; absent fields are omitted or labeled unavailable.
5. Given an update has a linked Phase 1D draft, when the owner opens the update, then the link opens that existing draft; when no linked draft exists, no create/publish success is implied.
6. Given a patch includes parser-confirmed facts, when the owner opens its details, then every shown fact identifies the named entity and official patch reference and is marked confirmed; unknown formatting is not converted into a guessed change.
7. Given patch parsing is held for manual review, when the patch is shown, then it is visibly incomplete/manual-review and does not display an invented ranking, impact, or missing detail as fact.
8. Given the owner adds the same supported watch twice or repeats a request after a lost response, when the watch list reloads, then exactly one active watch exists.
9. Given an official update contains a confirmed exact match for an active watch, when matching runs, then at most one private owner alert is recorded/sent for that watch-update pair; unrelated, unsupported, or merely similar text does not match.
10. Given an alert send outcome is ambiguous, when the owner views the watch/update state, then it is marked as requiring verification and is not automatically sent again.
11. Given the owner removes a watch and retries the same removal, when the watch list reloads, then the watch remains absent and no error is presented as a successful re-add.
12. Given a read fails, when the owner chooses retry, then only the read is repeated; no draft, public post or notification is created by the retry.
13. Given a user without owner permission opens the page or watch action, when the server denies access, then no Dota data is returned/displayed and the page shows the 403 state.
14. At 320, 375, 860, 1280 and 1920 CSS px, when the owner uses the same read, filter, official-link, draft-link and watch actions, then no page-level horizontal scrolling, clipped action, or overlapping fixed control occurs; all actions are keyboard-operable and focus remains visible.

## Deferred

- Hero/item win-rate, pick-rate, ban-rate or popularity dashboards, movers, thresholds and statistical watch rules until a source passes a separate coverage/freshness/terms feasibility check.
- Tournaments, treasure/cosmetic contents, release windows and images until official structured sources and reuse rights are established.
- General-purpose source administration (add/edit arbitrary URLs, allowed-domain configuration, polling cadence, enabling/disabling) and source discovery.
- Semantic/AI extraction, importance scoring, inferred impact, automatic recommendations, and public/automatic publication.
- Configurable notification channels, quiet hours and alert thresholds.
- New event categorization or a broader normalized event model unless the current stored data can supply every accepted field without guessing.
