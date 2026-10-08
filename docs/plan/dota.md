# Dota Intelligence

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

08.10.2026: only a «Dota Pulse» mock-data preview in the dev-only prototype `/__proto` exists (UX_SPEC §8); no source ingestion yet.

## 3.5 Dota Intelligence

Purpose: continuously represent what is happening in Dota as structured data.

This is not an AI system. Every displayed fact must come from a known source or a deterministic calculation.

Core areas:

- Dota News.
- patches and gameplay updates.
- heroes.
- items.
- treasures/cosmetics.
- events.
- watchlists.
- external statistics adapters.
- source health.
- change detection.
- deterministic alerts.

Target widgets/pages:

- Dota Pulse: important new events in chronological order.
- Latest Update: current official update with structured sections.
- Hero Movers: largest winrate/pickrate/banrate changes for selected periods where data exists.
- Item Movers: popularity/performance changes where data exists.
- Treasure / Cosmetics: new chest/treasure, contained sets, heroes, rarity and official media where legally and technically available.
- Watchlist: heroes, items or topics selected by the owner.
- Source Health: last successful fetch, freshness and failures.
- Dota Event detail: source links, detected changes, related stats and manual action Create post.

Important rule: Studio may surface data and thresholds, but it must not invent a content idea or recommendation. The owner decides what becomes content.

## 4.5 Dota events

Introduce a normalized event model rather than saving every source line as an unrelated news item.

Example event:

New Dota update

may contain:

- official announcement.
- patch sections.
- hero changes.
- item changes.
- treasure/cosmetic additions.
- event changes.
- fixes.
- linked statistics snapshots.

Suggested records:

- dota_events.
- dota_event_sources.
- dota_patch_changes.
- dota_cosmetic_items.
- dota_watchlists.
- dota_watchlist_matches.

Schema should remain normalized enough to query without storing arbitrary unbounded source payloads.

## 12. Dota Intelligence in detail

This system should be useful even before any content automation exists.

### 12.1 Dota News / Pulse

Ingest and normalize:

- official Dota news.
- gameplay updates.
- patch notes.
- client/game announcements.
- events.
- treasure/cosmetic announcements.
- hero announcements.
- Dota Plus/system changes where official data exists.

Each item has:

- title.
- source.
- canonical URL/id.
- published time.
- detected time.
- type.
- raw source hash for dedupe.
- normalized event link.

Known free sources (checked 07.10.2026, no key needed):

- Steam News API `GetNewsForApp` (appid 570): JSON news with a stable `gid`. It mixes Valve announcements with third-party feeds (e.g. PlayGround.ru), so only the official feed counts as a source; the rest is ignored.
- `dota2.com/datafeed/patchnoteslist`: list of patches with number and timestamp; per-patch notes from the same datafeed give hero/item changes in structured form.
- Both are unofficial-in-contract endpoints: shape drift fails closed and is logged; source incident handling belongs to queue item 4. Never generate a guessed draft.

Implemented in queue item 3 (backend only): the once-a-minute Cron polls these two fixed hosts only on exact five-minute UTC slots. Responses are bounded and strictly validated before any D1 write; a failure or shape drift rejects the whole sync. The Steam feed is additionally filtered to `steam_community_announcements`; patch records come only from the official Dota patch list. D1 uses `(source_key, external_id)` uniqueness and atomically seeds each source's first successful snapshot as baseline, so later inserts are distinguishable from historical records.

Queue item 4 (backend, in progress): non-baseline source rows reserve a stable post UUID in D1 before calling the existing `createPost` use case. The draft contains only the persisted official title, UTC publication date and canonical source URL; it remains `draft`, with no approval, destination or publication work. A bounded scan recovers a reserved draft after a crash, even after normal idempotency retention expires. Private owner alerts are claimed in D1 before a single Telegram send; missing token, owner ID or stored app origin leaves the alert pending, while failed/ambiguous sends are not retried. Source fetch/shape failures create one open Dota source incident per source; a successful atomic source sync closes it. Its unclaimed alert stays pending across recovery and, when eventually sent, identifies the source as recovered. Cron runs this bounded work after publication only on an otherwise idle five-minute slot (not UTC minute 00 or 30), preserving the publishing query budget; persisted source rows and incident alerts wait for a later eligible slot. No UI or R2 objects are part of this slice.

### 12.2 Patch Parser

Deterministically parse known sections:

- General.
- Heroes.
- Abilities.
- Talents.
- Items.
- Neutral Items.
- Map/Economy where present.

For every change preserve:

- source excerpt/reference, within storage/copyright policy.
- normalized entity.
- before/after value when parseable.
- direction.
- patch/event id.
- parser confidence only if it is a deterministic parser confidence, not an AI score.
- parse failure state.

Unknown formatting is held for manual inspection instead of guessed.

### 12.3 Hero dashboard

Per hero, where source data permits:

- winrate.
- pickrate.
- banrate.
- rank/bracket filters if available.
- history.
- before/after patch.
- recent changes.
- linked official patch changes.
- owner watchlist status.

### 12.4 Hero Movers widget

Deterministic ranking by configurable deltas:

- biggest winrate rise/fall.
- biggest pickrate rise/fall.
- biggest banrate rise/fall.
- minimum sample threshold.

Every row displays:

- source.
- period.
- sample/freshness where available.
- actual delta.

### 12.5 Item dashboard / movers

Same pattern where the selected source exposes reliable item data:

- purchase/popularity.
- performance.
- linked patch changes.
- hero associations where supported.
- period/source/freshness.

### 12.6 Treasure and cosmetics

A Dota cosmetic event may contain:

- official name.
- release time.
- official source.
- treasure/chest.
- sets/items.
- hero association.
- rarity/tier.
- official images where reuse is permitted.
- availability window/method where explicitly stated by the source.

The owner can open the event and manually create a post from it. Studio should carry source references into the draft, but it does not automatically write the post.

### 12.7 Watchlists

Owner can watch:

- hero.
- item.
- patch/update type.
- treasure/cosmetic events.
- other explicitly supported Dota entities.

Example deterministic conditions:

- hero winrate delta exceeds configured threshold.
- pickrate delta exceeds threshold.
- official update mentions watched hero.
- new treasure contains a watched hero.
- source has a new official event.

Result:

- item appears in Dota Pulse / Requires attention.
- optional owner bot notification based on settings.

### 12.8 Dota event page

One event should aggregate related facts rather than fragment a single update into dozens of unrelated records.

Tabs/sections may include:

- Overview.
- Official sources.
- Heroes.
- Items.
- Cosmetics.
- Statistics.
- Related manual posts/publications.
