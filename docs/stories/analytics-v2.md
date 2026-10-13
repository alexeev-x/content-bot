# Analytics v2 — data-source decision

Queue item: 22 (`docs/IMPLEMENTATION_PLAN.md`), Phase 6. This is a planning story only; no new collection job, connector, database schema, API or UI is authorized by the current decision state.

## Goal

Extend `/analytics` with comparable channel and post performance snapshots at explicit content ages, without presenting unavailable metrics as zero or implying that a correlation caused an outcome.

## Facts

- Queue item 13 is implemented locally as an owner-only read of append-only Studio publication outcome snapshots. It records reliability counts and historically captured destination/media facts; it does not capture rubric, actual Telegram send time or native channel performance metrics.
- The Bot API feasibility proof in `docs/stories/telegram-native-statistics-feasibility.md` found no channel-post views or rich historical channel statistics through the current bot integration.
- Rich Telegram channel/message statistics require MTProto user authorization and channel eligibility. This is a distinct credential, security and runtime boundary; it must not be added to the existing bot-token flow.
- `docs/plan/analytics.md` §11 is the target-design source for same-age snapshots, performance comparisons and supported/partial/unavailable source states.

## Owner decision required

Choose the allowed source for Phase 6 before implementation:

1. **Manual observations/import only.** No Telegram user session; the owner supplies measurements with source, metric, content age and observation time. This avoids a new credential boundary but requires a precise import/entry format and manual collection.
2. **Separate MTProto feasibility/design.** Authorize a distinct security design and eligibility proof before any connector or collection code. This adds a personal Telegram session and its lifecycle to the threat model; it does not approve deploying a connector.
3. **Defer native performance analytics.** Continue using Studio-owned reliability analytics and leave same-age/channel metrics out of scope.

Recommendation: choose option 3 unless the owner has a concrete need for native channel performance data. If it is needed, prefer an explicit security/design review before deciding between manual import and MTProto; do not assume channel eligibility or historical backfill.

Until the owner chooses, queue item 22 is `waiting for owner`. No data is collected and the current `/analytics` page remains limited to item 13.
