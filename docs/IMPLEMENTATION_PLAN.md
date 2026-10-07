# ALEXEEV Studio — master implementation plan

**Status:** canonical execution plan, fully replaced on 07.10.2026 after a code audit, live DEV UX walkthrough and owner decisions.

This document is the single roadmap for the product. It describes what already works, what is intentionally not being built yet, the target product shape, dependencies between systems, and the order in which work should ship.

ALEXEEV Studio is not a small Telegram admin panel. The target is a complete content operations system for ALEXEEV: create content, attach media, approve it, schedule and publish it safely, understand what happened, monitor Dota changes and news, operate automations, receive incidents in the owner's Telegram bot, and later publish and measure content across Telegram, TikTok and YouTube.

## 1. Fixed product decisions

These decisions are already made and should not be re-opened unless the owner explicitly changes them.

- The admin panel is the primary control plane. Telegram bot is a personal owner surface for quick status, alerts and actions.
- DEV and production are isolated. DEV must remain visibly marked.
- Publishing safety is more important than optimistic UX. An ambiguous Telegram result is UNKNOWN, never silently SUCCESS and never automatically retried.
- The core Telegram publishing path has been manually validated by the owner in DEV on 07.10.2026. Immediate publish, scheduled publish, Telegram message id, reschedule, cancel and failure/unknown handling are no longer roadmap blockers.
- Technical alerts are sent only to the owner's private conversation with the bot. They must never be sent to a content channel.
- A post may contain multiple manually uploaded media files. It is not limited to one attachment.
- The first media scope is manual upload and publishing of photos, GIF/animations and videos. Automatic downloading, server-side asset generation and advanced media production are a later large project.
- No AI/LLM/generative features are part of the active roadmap. No AI recommendations, AI scoring, AI scripts, generative images, AI comment classification, AI agents or AI orchestration are to be built in the phases below.
- Dota intelligence is deterministic: source ingestion, parsing, normalization, comparisons, thresholds, rules, filters, watchlists and explicit provenance.
- Design is implemented in code. Figma is not required. Canonical visual sources are tokens, primitives, real pages and browser screenshot references stored in the repository.
- Desktop and mobile/Telegram Mini App are first-class. Mobile does not become a read-only version.
- D1 remains the operational source of truth. R2 is introduced for media objects when the media phase begins.
- A feature is not complete because a route exists. It is complete only when the real backend, real UI, validation, error states, tests and operational behavior exist.

## 2. Verified baseline

### 2.1 Runtime, CI and environments

Already implemented:

- develop deploys the DEV Worker.
- main deploys production.
- DEV and production have separate D1 bindings.
- DEV Cron exists; production Cron remains deliberately controlled until production release.
- CI performs verification, secret scanning and branch-driven deploys.
- CI on develop and pull requests checks only the areas a push/PR touches, shards the Vitest suites across runners, cancels stale runs and reuses installed dependencies; every deploy ends with a `/api/v1/health` smoke check. `main` (production) always runs the full set.
- Secrets are not stored in Git.

### 2.2 Authentication and owner access

Already implemented:

- Telegram Login Widget.
- Telegram Mini App initData authentication.
- owner-only authorization.
- rotating refresh cookie/session flow.
- unauthorized and forbidden states.
- logout from owner menu.

### 2.3 Current Studio shell

Already implemented:

- desktop sidebar with collapse.
- mobile bottom navigation: Обзор, Посты, Публикации, Ещё.
- visible DEV environment marker.
- dark/light appearance system and accent configuration.
- Settings master/detail pattern.
- top search field exists but is currently disabled and therefore must either become functional or be hidden until it is functional.

### 2.4 Posts and publishing

Owner-validated in DEV:

- posts list.
- draft editing.
- Telegram preview.
- approval confirmation.
- approved posts become read-only for content edits.
- publish flow.
- immediate publish.
- scheduled publish.
- timezone display and UTC conversion.
- future date/time validation.
- reschedule.
- cancel.
- Telegram message id persistence.
- failed and unknown states.
- publication relationship shown from the post.
- current publication engine behavior is considered proven enough to build the rest of the product on top of it.

Existing technical safety that must remain:

- idempotency key and request hash.
- conditional claims and leases.
- no optimistic publication success.
- ambiguous result becomes UNKNOWN.
- manual reconciliation.
- attempts and incidents.
- private owner alert for each publication incident: claimed in D1 first, sent once to the owner's bot chat, never retried, never to a content channel (`apps/backend/src/app/notifications/alert-owner-of-incidents.ts`). Dedupe/grouping/recovery alerts from §3.9 are not built yet.

### 2.5 Current pages

Current visible product:

- Обзор.
- Посты: Все / Черновики / Архив.
- post create/edit/detail.
- Telegram preview.
- approve and publish flow.
- Публикации.
- Инциденты.
- Настройки → Каналы.
- Настройки → Оформление.
- owner menu/logout.

Current placeholder or incomplete product areas:

- Calendar.
- Automations.
- Media.
- richer analytics.
- Dota intelligence.
- real global search.
- richer publication history.
- native channel analytics.

## 3. Product architecture: the systems we are building

The product is divided into operational systems. They share data, but each screen has a distinct job.

### 3.1 Content Studio

Purpose: manually create and prepare content.

Capabilities:

- draft creation.
- rich text editing.
- Telegram entities.
- autosave.
- revisions.
- approval.
- duplicate.
- archive / restore / permanent delete under safe rules.
- rubric and tags.
- source/provenance references where relevant.
- manual media attachments.
- Telegram preview.
- publication history for the post.
- mobile editing.

### 3.2 Publications Center

Purpose: answer what was or will be sent, where, when, and what happened.

Capabilities:

- scheduled, queued, sending, sent, failed, unknown, cancelled states.
- filters, search, period and sorting.
- channel and platform.
- message identifiers and links where available.
- attempt timeline.
- reschedule.
- cancel.
- safe retry only when backend state explicitly allows it.
- manual reconciliation of UNKNOWN.
- multi-message result support for albums/sequences.

### 3.3 Calendar

Purpose: editorial scheduling rather than low-level job inspection.

Capabilities:

- day, week and month.
- owner's timezone.
- drafts, approved content and scheduled publications.
- create from empty slot.
- schedule/reschedule.
- drag-and-drop only after the same backend safety rules are reused.
- filters by channel/platform/rubric.
- Dota events as an optional overlay once Dota Intelligence exists.

### 3.4 Decision Center / Overview

Purpose: tell the owner what requires attention now.

The home page is not a KPI wall and not four empty cards.

Target sections:

- Требует внимания.
- Сегодня.
- Одобрены, но не запланированы.
- Последние черновики.
- Ближайшие публикации.
- Недавно отправлено.
- active incidents.
- source or automation problems once those systems exist.
- fresh Dota events once Dota Intelligence exists.
- compact system status.

When there is no work, the empty state must contain useful next actions such as Новый пост, Открыть календарь or Посмотреть последние Dota-события.

### 3.5 Dota Intelligence

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

### 3.6 Sources

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

### 3.7 Automation Center

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

### 3.8 Analytics

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

### 3.9 Incident & Alerting System

Purpose: one coherent place for failures.

Incident classes include:

- publication FAILED.
- publication UNKNOWN.
- Telegram transport timeout.
- bot permission loss.
- scheduled job stuck.
- source stale/down.
- parser failure.
- automation repeated failure.
- analytics ingestion failure.
- platform upload/processing failure.
- infrastructure health failure.

Severity:

- INFO.
- WARNING.
- CRITICAL.

Telegram alert route is strictly:

Studio / Worker → incident notification → owner's private bot chat.

Never:

Studio / Worker → content destination channel.

Required alert behavior:

- dedupe repeated errors.
- group bursts.
- cooldown noisy incidents.
- show first occurrence and count.
- recovery notification.
- link/deep-link back to Studio where possible.
- never include secrets or raw sensitive payloads.

### 3.10 Owner bot

The bot is a personal control surface, not the main product UI.

Current commands remain and may grow to include:

- /today.
- /next.
- /status.

Target notifications:

- critical publication failure.
- UNKNOWN publication.
- source outage.
- automation failure.
- system recovery.
- optional Dota watchlist alert.

Quick actions may be added only where they can reuse the same server-side authorization and state transition as Studio.

The owner's private chat id is separate from publication destination ids in the data model and code. The notification subsystem must not accept a content destination as a fallback.

## 4. Core domain model evolution

The current Post model remains the starting point. We expand it without a destructive big-bang rename.

### 4.1 Post / Content Unit

A post remains the editable content record in the first phases.

Add over time:

- title.
- body.
- Telegram entities.
- status.
- rubric.
- tags.
- source references.
- created/updated timestamps.
- approved revision id.
- archive timestamps.

Later, when TikTok/YouTube variants exist, the broader concept may be named Content Unit in product language, while database migrations can remain incremental.

### 4.2 Revisions

A revision freezes all publish-relevant content:

- title.
- body.
- entities.
- ordered media references.
- relevant rendering settings.

Approval points to a frozen revision. A publication must always reference the exact approved revision it is sending.

### 4.3 Media

Introduce:

- media_assets.
- post_media or revision_media mapping.
- ordered position.
- kind: photo, animation/GIF, video and later document/audio if intentionally supported.
- R2 key.
- original filename.
- detected MIME.
- byte size.
- width/height where relevant.
- duration where relevant.
- checksum.
- created timestamp.

Do not store binary data in D1.

### 4.4 Publication messages

The current single Telegram message id is insufficient for multiple attachments.

Extend the publication result model so one publication may own one or more sent messages:

- publication_messages.
- platform message id.
- order.
- media asset id when relevant.
- URL/reference where available.
- sent timestamp.

Keep a primary message id for compatibility if useful, but the canonical result for a multi-message publication is an ordered set.

### 4.5 Dota events

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

### 4.6 Analytics snapshots

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

## 5. Content Studio v2

This is the first major product phase after the validated publishing foundation.

### 5.1 Rich editor

Replace the plain textarea.

Requirements:

- bold.
- italic.
- underline.
- strikethrough.
- spoiler.
- link.
- inline code.
- code block.
- quote.
- lists represented safely for Telegram.
- desktop toolbar.
- compact mobile toolbar.
- Ctrl/Cmd shortcuts.
- exact Telegram preview.
- correct UTF-16 entity offsets.
- no HTML parse mode as the canonical storage format.

Storage:

- plain text plus Telegram entities.
- same representation in post and revision.
- pure mapper between editor document and text/entities.
- round-trip tests including emoji and surrogate pairs.

### 5.2 Autosave

Draft behavior:

- debounce after editing.
- explicit state: Сохранено / Сохраняем… / Не сохранено.
- retry action on failure.
- 409 conflict never overwrites server data.
- leaving prompts only when needed.
- approved revisions remain immutable.

### 5.3 Post actions

Posts list and post detail need useful actions:

- Открыть.
- Дублировать.
- Архивировать.
- Восстановить.
- Удалить permanently only under lifecycle rules.
- Открыть публикации.
- Опубликовать / Запланировать when approved.
- Отменить / Перенести relevant pending publication.

Archive UX must explicitly explain how an item gets there and what retention/deletion rules apply.

### 5.4 Manual multi-media attachments

The owner can manually attach multiple files to one post.

Required file classes for the first release:

- photos.
- GIF/animations.
- videos.

UX:

- multi-file picker.
- drag/drop on desktop.
- mobile file selection.
- upload progress per file.
- preview per file.
- reorder.
- replace.
- remove.
- retry a failed upload.
- total media state in the Telegram preview.
- approval freezes media order and identity in the revision.

Validation happens both client-side for UX and server-side for trust:

- magic-byte/type validation.
- accepted MIME list.
- file-size limits based on the actual publishing capability.
- image/video metadata validation.
- filename sanitization.
- no executable interpretation.
- bounded upload count.
- R2 object keys generated server-side.

Telegram publishing strategy:

- no media → send text message.
- one compatible photo → photo message.
- one compatible animation → animation message.
- one compatible video → video message.
- compatible photo/video group → media group where Telegram supports the combination.
- attachments that cannot be represented as one Telegram media group must be rejected with a clear preflight reason or, if product rules explicitly allow it, published as an ordered sequence with a preview that shows the sequence before confirmation.
- never silently transform an unsupported combination.
- store every resulting Telegram message id.

Caption/text limits are capability-specific and validated before approval/publish. Do not hard-code one global 4096 limit for every media mode.

Platform limits that shape the design (checked 07.10.2026 against core.telegram.org/bots/api and developers.cloudflare.com/workers/platform/limits; re-check before implementation):

- Bot API multipart upload: photo ≤ 10 MB (width + height ≤ 10000, ratio ≤ 20); video and animation ≤ 50 MB. Sending by URL is lower (photo 5 MB, other 20 MB), so files are uploaded from R2, not passed as URLs.
- `sendMediaGroup` takes 2–10 items of photo, video, document or audio; animation/GIF cannot be in an album. First release: a GIF together with other media is rejected at preflight, not sent as a sequence, so a half-sent post cannot happen.
- Caption is 0–1024 characters after entity parsing; a text message is 4096.
- A Worker isolate has 128 MB of memory. `FormData` takes only strings and Blobs, so it buffers the file: a 50 MB video fits once but not concurrently. Bound media sends to one per invocation, or build a streamed multipart body with a known length (FixedLengthStream) — prove Telegram accepts it before relying on it.
- Inbound request body ≤ 100 MB on the Free plan, which bounds an upload through the Worker; larger files would need direct-to-R2 upload (a separate decision).

### 5.5 Media failure handling

States:

- selecting.
- uploading.
- uploaded.
- processing metadata.
- upload failed.
- unavailable object.
- invalid type.
- too large.
- removed.

A post cannot be approved while required upload state is unresolved.

## 6. Posts list and server-side data UX

The current table is directionally correct and should stay dense rather than become a card grid on desktop.

Required:

- server-side search.
- status filter.
- rubric filter once rubrics exist.
- media/no-media filter later if useful.
- sort.
- cursor pagination.
- URL state.
- bulk archive/delete only where safe.
- row actions.
- useful columns without overloading the table.
- mobile card adaptation.

No disabled controls. If global search is not ready, the shell placeholder should be removed until the feature exists.

## 7. Publications Center v2

### 7.1 List

Add:

- search by post title/id.
- period.
- status.
- channel.
- platform later.
- sort.
- pagination.
- clear status semantics.
- compact last-error summary.
- message count for albums/sequences.

### 7.2 Publication detail/timeline

Show an operational timeline:

- created.
- scheduled.
- rescheduled.
- claimed by dispatcher.
- attempt started.
- provider accepted.
- message ids.
- sent.
- failed.
- UNKNOWN.
- reconciled.
- cancelled.

Each attempt exposes safe diagnostics:

- timestamp.
- request id.
- stable error code.
- retryability.
- duration.
- no secret/raw token leakage.

### 7.3 Safe actions

- reschedule only from allowed states.
- cancel only from allowed states.
- retry only if backend explicitly says retryable.
- UNKNOWN never gets automatic retry.
- reconciliation is explicit and audited.
- deleting a Studio record never implies deleting the Telegram channel message unless a separate explicit feature is later designed.

## 8. Decision Center / Overview v2

The existing page is too empty when the system is healthy.

Target layout:

### Требует внимания

Contains only actionable items:

- FAILED/UNKNOWN publications.
- stuck job.
- bot/channel permission issue.
- stale source.
- failed automation.
- migration/configuration issue.

### Сегодня

- publications today.
- drafts touched today.
- approved but not scheduled.
- nearest scheduled item.
- timezone.

### Продолжить работу

- latest three drafts.
- direct Continue action.
- New Post primary action.

### Недавно отправлено

- latest successful publications.
- compact status and timestamp.
- open publication.

### Dota Pulse

Appears only after Dota Intelligence exists:

- latest official Dota events.
- new patch/update.
- new treasure/cosmetic event.
- watchlist changes.

No AI suggestion is shown.

### System status

Compact when healthy. Expanded only when something needs attention.

## 9. Calendar

### 9.1 Views

- day.
- week.
- month.

### 9.2 Content

- scheduled publications.
- optional approved-unscheduled lane.
- Dota events overlay later.
- destination/platform icon.
- status text.

### 9.3 Actions

- click empty slot → choose approved post or create new post.
- click event → publication drawer/detail.
- reschedule through the existing safe backend transition.
- cancel.
- drag/drop after accessibility and DST-safe behavior are implemented.

### 9.4 Time rules

- owner timezone is canonical for UI.
- storage remains UTC.
- DST transitions tested.
- browser timezone does not silently override the configured owner timezone.

## 10. Owner timezone and publication defaults

Settings must add:

- owner timezone.
- default Telegram destination.
- optional default publish mode.
- optional default rubric when rubrics exist.

Bot /today, Dashboard, Calendar and scheduling use the same owner timezone.

Remove the current hard-coded bot timezone.

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

## 15. Incident and owner notification UX

### 15.1 Incidents page

Add over time:

- severity.
- source/system.
- age.
- linked publication/job/source.
- occurrence count.
- first/last seen.
- resolution.
- history.

### 15.2 Owner Telegram message

A useful alert contains:

- severity.
- short title.
- affected object.
- current state.
- safe reason/code.
- occurrence count if grouped.
- time.
- Studio deep link when possible.

Recovery contains:

- incident name.
- recovered state.
- duration.

### 15.3 Notification settings

Settings → Notifications:

- owner bot connection/status.
- WARNING on/off.
- CRITICAL always on unless owner explicitly chooses otherwise.
- publication alerts.
- source alerts.
- automation alerts.
- recovery alerts.
- Dota watchlist alerts.

No notification setting may point to a publication channel.

## 16. Global search / command entry

The current disabled header search is temporary and must not remain dead UI.

First functional scope:

- posts.
- publications.
- incidents.
- Dota events once available.

Later:

- media.
- sources.
- automations.
- channels.

Search is navigation-first. It is not a universal destructive command executor.

Potential quick actions:

- Новый пост.
- Открыть календарь.
- Показать FAILED.
- Показать сегодня.

## 17. Media library

After manual post uploads are stable, build /media.

Capabilities:

- all uploaded assets.
- type.
- dimensions/duration.
- size.
- created time.
- usage count.
- linked posts/revisions/publications.
- search.
- filter.
- preview.
- safe delete only when unused or through explicit lifecycle rules.
- duplicate detection by checksum.

Do not add automatic internet downloading or generated media in this phase.

## 18. Later automated media pipeline — separate large project

This is deliberately deferred.

Possible future non-AI capabilities:

- download an allowed official image from a configured source.
- import official treasure/set images.
- resize/crop.
- transcode.
- create deterministic template cards.
- prepare Telegram/TikTok/YouTube variants.
- render branded cards from structured Dota data.

This project requires its own architecture, storage budgets, copyright/source rules, rendering pipeline and operational limits.

Generative image AI is not part of this plan.

## 19. TikTok and YouTube — later platform expansion

Telegram remains the proven first destination. Multi-platform work begins only after Content Studio, media, scheduling and operational history are stable.

### 19.1 Platform model

Do not bolt platform fields onto Post one by one.

Introduce:

- platform destinations/accounts.
- platform-specific publication records.
- platform capability/preflight data.
- platform-specific result ids.
- processing status.
- platform metrics snapshots.

### 19.2 TikTok target capabilities

Subject to official API access and account eligibility:

- upload.
- direct publish or draft flow as supported.
- privacy/options preflight.
- video duration/capability checks.
- photo/carousel support when supported.
- processing status.
- publication result.
- analytics ingestion where available.

### 19.3 YouTube target capabilities

Subject to official API access:

- resumable upload.
- Shorts/video.
- title/description.
- thumbnail.
- playlist.
- processing state.
- captions later if manually supplied.
- publication result.
- analytics ingestion.
- comments read/manage where permitted.

### 19.4 Platform variants

A single content record may have manually authored variants:

- Telegram text.
- TikTok caption.
- YouTube title.
- YouTube description.

No AI generation is used. The owner edits variants directly.

## 20. Comments and audience data — later, non-AI

Where platform APIs permit:

- comments list.
- search.
- sort.
- unanswered filter.
- manual tags.
- manual reply.
- moderation actions where allowed.
- link a comment to a manually created content note/idea.

No automated sentiment, clustering or AI reply generation in the active plan.

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

## 22. Design system and visual direction

Target: Calm Intelligence.

Principles:

- dense where work is tabular.
- calm, restrained dark/light themes.
- cobalt accent used sparingly.
- minimal decorative card chrome.
- strong hierarchy.
- responsive width.
- no oversized whitespace.
- consistent state language.
- accessibility and keyboard behavior.
- no generic dashboard made of identical rounded cards.

Screen personalities:

- Posts = database/table.
- Post editor = document + inspector/preview.
- Publications = operational table + detail timeline.
- Calendar = scheduling canvas.
- Dota Intelligence = data/radar dashboard.
- Analytics = analytical console.
- Settings = master/detail.
- Incidents = operations queue.

Target geometry, adjusted by visual testing:

- desktop sidebar approximately 216–224 px.
- controls approximately 34–36 px.
- table rows approximately 38–40 px.
- restrained radii.
- content width determined by screen purpose, not one global max-width.

Repository design references should eventually live under:

- docs/design/references/dashboard/
- docs/design/references/posts/
- docs/design/references/editor/
- docs/design/references/publications/
- docs/design/references/dota/
- docs/design/references/analytics/
- docs/design/references/settings/

Each major visual redesign gets screenshot references at desktop and mobile before or with implementation.

## 23. Mobile / Telegram Mini App

Acceptance width starts at 375/390 px.

Required parity:

- create/edit post.
- attach media.
- reorder/remove media.
- approve.
- schedule.
- publish confirmation.
- publications.
- incidents.
- essential settings.
- Dota Pulse and watchlists later.

Mobile-specific needs:

- safe areas.
- keyboard handling.
- full-screen editor where needed.
- bottom sheets.
- BackButton integration.
- MainButton only where it genuinely improves a critical action.
- no horizontal overflow.
- touch targets.

## 24. Settings target map

### Channels

- add/edit destination.
- enable/disable.
- permission check.
- bot status.
- clear explanation of what disabling a channel does to already scheduled publications.
- confirmation when an action may affect scheduled work.

### Notifications

- owner private bot alert settings.
- severity/categories.
- recovery alerts.
- Dota watchlist alerts later.

### Appearance

- theme.
- accent.
- custom colors.
- explicit unsaved/saved state so Add color is not confused with Save settings.

### Time & publishing

- owner timezone.
- default destination.
- other safe defaults.

### Integrations

Later:

- Telegram publishing.
- Telegram statistics connector if separately approved.
- TikTok.
- YouTube.
- Dota/statistics sources.

Never display secrets.

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

## 27. Roadmap and dependency order

Work should follow this order unless the owner explicitly changes priority.

### Phase 0 — Publishing foundation: COMPLETE / validated

Status: complete enough to unblock product work.

Validated in DEV by owner:

- create/edit/approve.
- immediate publish.
- scheduled publish.
- message id.
- reschedule.
- cancel.
- failed/unknown behavior.

Do not spend another phase rebuilding this foundation. Only fix concrete regressions.

### Phase 1 — Content Studio v2 + manual multi-media

Primary goal: make creation good enough for daily use.

Ships in two slices, each releasable on its own; 1b starts only after 1a is in DEV.

Phase 1a — editor (queue items 1–2):

- rich Telegram-aware editor.
- entities storage and preview.
- autosave.
- revision history UI.
- useful post actions.

Phase 1b — manual media (queue items 3–4):

- manual multi-file upload.
- R2 storage.
- photo/GIF/video preview.
- reorder/replace/delete.
- approval freezes media.
- Telegram publishing for supported media combinations.
- multi-message result storage.
- mobile editor/media flow.

Definition of Done:

- existing text-only post path still passes.
- media upload has backend validation.
- approved revision cannot silently change.
- preview matches publish strategy.
- every sent Telegram message id is stored.
- failure mid-sequence cannot be reported as full success.
- 375/390 and 1280/1440 screenshots verified.

Owner prerequisite:

- provision separate DEV and production R2 buckets/bindings before remote media testing.

### Phase 2 — Core operator UX

Primary goal: make current Studio coherent before adding new product areas.

Deliver:

- Overview v2 / Decision Center.
- owner timezone.
- Publications v2.
- server-side Posts filters/search/sort.
- server-side Publications filters/search/sort.
- Archive explanation/actions.
- channel toggle impact warning.
- appearance save-state clarification.
- remove disabled global search or make first functional version.
- improved empty states.

Definition of Done:

- a healthy empty account still has a clear next action.
- no visible disabled placeholder feature remains without explanation.
- all list state survives URL/reload where appropriate.
- publication detail explains exactly what happened.

### Phase 3 — Calendar + analytics data foundation

Primary goal: start preserving useful history early.

Deliver:

- Calendar day/week/month.
- safe reschedule/cancel reuse.
- analytics snapshot schema.
- Studio-owned Telegram/publication analytics.
- Analytics first screen for reliability/history.
- feasibility proof for richer Telegram channel statistics.
- if approved, connector design for supported channel statistics; otherwise show only metrics actually available.

Definition of Done:

- historical snapshots are append-only observations.
- metrics always show source and observed time.
- no unsupported Telegram metric is faked.
- calendar is DST/timezone tested.

### Phase 4 — Dota Intelligence

Primary goal: Studio understands what changed in Dota as structured, sourced data.

Deliver in slices:

1. Sources registry and health.
2. official Dota News / Dota Pulse.
3. normalized Dota Event.
4. patch ingestion/parser.
5. hero changes.
6. approved hero statistics source.
7. Hero Movers.
8. item changes/statistics where available.
9. Treasure/Cosmetics events.
10. Watchlists.
11. owner bot alerts for selected watchlist/source events.
12. Dota event detail and manual Create post.

Definition of Done:

- every displayed fact has source/freshness.
- dedupe prevents duplicate events.
- parser never invents unknown values.
- source failures create incidents.
- owner can turn a Dota event into a manual draft without copying everything by hand.
- no AI/LLM service is involved.

### Phase 5 — Automation Center

Primary goal: make recurring deterministic work visible and controllable.

Deliver:

- automation list/detail.
- cadence.
- enable/pause.
- run history.
- Run now.
- source polling jobs.
- analytics snapshot jobs.
- watchlist evaluation.
- failure thresholds.
- incident integration.

Definition of Done:

- all runs are idempotent/bounded.
- automation state is auditable.
- repeated failures are grouped and alert the owner privately.
- a paused automation performs no side effect.

### Phase 6 — Telegram analytics v2 and content comparisons

Primary goal: turn accumulated history into useful comparisons.

Deliver:

- channel overview if connector supports it.
- post performance table.
- same-age snapshots.
- rubric comparisons.
- media-type comparisons.
- publish-time comparisons.
- export where useful.
- manual experiment log.

Definition of Done:

- data can be traced back to source snapshots.
- missing periods are visibly incomplete.
- comparison logic has deterministic tests.

### Phase 7 — Media Library

Primary goal: reuse and manage manually uploaded assets.

Deliver:

- /media.
- search/filter.
- previews.
- metadata.
- usage links.
- checksum duplicate detection.
- safe deletion rules.

Still no automatic internet download/generation.

### Phase 8 — TikTok + YouTube platform expansion

Primary goal: reuse proven content/publishing concepts across platforms.

Order per platform:

1. connection/auth.
2. capability/preflight.
3. manual publication.
4. processing/result state.
5. publications integration.
6. analytics snapshots.
7. comments where permitted.
8. Calendar integration.

Do not launch both platforms in one giant change.

### Phase 9 — Later automated media pipeline

Separate project after manual media, sources and platform publishing are stable.

Potential deterministic functions:

- source image import.
- resize/crop/transcode.
- template rendering.
- platform variants.
- Dota treasure/update cards.

Requires separate owner approval before implementation.

### Phase 10 — Production hardening/release

Before production is considered ready:

- auth e2e.
- editor e2e.
- multi-media e2e.
- immediate/scheduled publication e2e.
- cancel/reschedule e2e.
- UNKNOWN reconciliation e2e.
- incidents/owner alert tests.
- Calendar tests.
- source/automation tests for enabled production systems.
- accessibility checks.
- visual regressions for critical pages.
- backup/restore procedure.
- production migration procedure.
- rollback procedure.
- production Cron decision.
- security review.
- load tests before any throughput claim.

## 28. Near-term execution queue

This is the actionable queue from the master roadmap. Whoever starts or finishes an item updates its status here (`not started` / `in progress` / `done`) in the same change.

| # | Item | Status |
|---|---|---|
| 1 | Content Studio rich editor and Telegram entities | not started |
| 2 | Autosave and revision history UI | not started |
| 3 | Manual multi-media model, R2 upload and preview | not started |
| 4 | Telegram multi-media publishing and publication_messages | not started |
| 5 | Post actions/archive UX | in progress (Archive tab exists, see §2.5) |
| 6 | Owner timezone | not started |
| 7 | Overview/Decision Center v2 | not started |
| 8 | Publications v2 | not started |
| 9 | Server-side Posts/Publications queries | not started |
| 10 | Calendar | not started |
| 11 | Analytics snapshot schema and Studio-owned Telegram analytics | not started |
| 12 | Telegram native statistics feasibility proof | not started |
| 13 | Sources registry | not started |
| 14 | Dota News / Pulse | not started |
| 15 | Dota Event + patch parser | not started |
| 16 | Hero statistics + Hero Movers | not started |
| 17 | Treasure/Cosmetics | not started |
| 18 | Watchlists + private owner bot alerts | not started |
| 19 | Automation Center | not started |
| 20 | Analytics v2 | not started |
| 21 | Media Library | not started |
| 22 | Platform expansion | not started |
| 23 | Automated media pipeline | not started |
| 24 | Production release | not started |

A task lower in the list may be pulled earlier only when it does not destabilize or duplicate an unfinished dependency above it.

## 29. Explicitly out of scope for the active plan

Do not build or silently introduce:

- LLM providers.
- AI-generated post text.
- AI-generated scripts.
- AI recommendations.
- AI content scoring.
- AI Idea Radar.
- AI comment sentiment/clustering.
- AI reply drafts.
- AI Learning Cards.
- generative images.
- AI thumbnail generation.
- AI Clip Factory.
- AI agents.
- AI orchestrator.
- Agent Inspector for AI execution.
- Shadow Mode for AI decisions.

If the owner later wants AI, it gets a new dedicated plan after the non-AI product foundation is mature.

## 30. Documentation/source-of-truth rules

- This file is the canonical implementation roadmap.
- docs/PAGE_MAP.md describes page responsibilities but does not override this roadmap.
- docs/DECISIONS.md records durable owner decisions.
- architecture documents describe constraints and implementation boundaries.
- stories may specify one feature in detail, but their status must agree with this plan.
- AGENTS.md should point agents here for current state and queue.
- completed work must update the relevant Current state/phase status instead of leaving stale planned language.
- never claim a future system is implemented because its route or placeholder exists.

## 31. Definition of product success

The finished non-AI ALEXEEV Studio should let the owner:

- open one app and immediately see what needs attention.
- create a formatted Telegram post from desktop or phone.
- attach several photos/GIFs/videos manually.
- preview exactly how the publication will be represented.
- approve a frozen revision.
- publish now or schedule it.
- safely reschedule/cancel/reconcile.
- see every resulting provider message id.
- receive real operational failures only in the private owner bot.
- understand publication and channel history from saved analytics.
- see current Dota news, updates, patches, hero/item movement and treasures with sources.
- place heroes/items/topics on a watchlist.
- turn a sourced Dota event into a manual post.
- inspect and control recurring automations.
- later publish the same content operation to TikTok and YouTube through explicit platform variants.
- operate the system without depending on hidden scripts, fake success states or AI-generated decisions.
