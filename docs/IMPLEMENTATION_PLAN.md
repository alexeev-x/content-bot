# ALEXEEV Studio — master implementation plan

**Status:** canonical execution plan, fully replaced on 07.10.2026 after a code audit, live DEV UX walkthrough and owner decisions. Updated 08.10.2026: approved admin design applied to all current pages in DEV (§2.3, §2.5); DEV only, nothing is released to production.

This document is the single roadmap for the product: what already works, what is intentionally not being built yet, and the order in which work ships. The target design of each system is split into `docs/plan/*.md` (map in §3).

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
- Phone, tablet, laptop, desktop and Telegram Mini App are first-class; every route remains fully operational and adapts to available space. Required responsive checks and widths are defined in `docs/design/UX_SPEC.md` §1; mobile is not a read-only version.
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

Approved 08.10.2026: `docs/design/UX_SPEC.md` (Calm Operations) plus a dev-only clickable prototype at `/__proto` (`apps/frontend/src/pages/prototypes`). Real pages were restyled to it in DEV.

- desktop sidebar with collapse and a «Подключённый канал» card (subscribers «—» until an API exists).
- top bar: read-only timezone chip, DEV marker, one system-status chip with a single «Проверено в» time, theme toggle, owner menu.
- phone bottom tab bar: Обзор, Посты, Публикации, Инциденты, Ещё.
- session restore renders the shell and route skeletons with stable geometry (no full-screen «Проверяем вход…»).
- dark/light appearance system, accent presets and the colour constructor; Settings master/detail (Каналы with add-channel steps, Оформление).
- global search (top-bar field, Ctrl/⌘ K) is still a disabled placeholder: no entity search API yet. Phone/Mini App header hides it.

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

### 2.4.1 Rich editor and Telegram entities (queue item 1)

Built 07.10.2026, not yet validated by the owner in DEV:

- post body stored as plain text plus Telegram entities (UTF-16 offsets) on posts and revisions (migration 0011); the approved revision freezes them.
- server validation of entities: range, surrogate pairs, Telegram nesting rules, at most 100; staggered bold/italic/underline/strikethrough/spoiler are split into nested pieces.
- publications send `text` + `entities` instead of HTML parse mode; the title stays bold; old posts look the same.
- TipTap editor: bold, italic, underline, strikethrough, spoiler, link, inline code, code block, quote; lists as plain «• » / «1. » text; desktop and mobile toolbars; Ctrl/⌘ shortcuts.
- Telegram preview renders the entities.

Known limits: the 409 compare dialog compares plain text only; owner bot notices still use HTML parse mode; the mobile toolbar wraps to three rows.

### 2.5 Current pages

Current visible product:

- Обзор: customizable 12-column widget grid (15 widget types incl. drafts, week, channels, incidents, quick actions); edit mode (react-grid-layout v2, lazy, edit-only) with keyboard menu, catalog with «скоро» items, undo, leave guard and phone reorder; layout stored server-side (`GET/PUT /api/v1/settings/dashboard-layout`, migration 0012, revision/409). Real-touch drag in Telegram not yet tested on a device.
- Посты: Все / Черновики / Архив; one live search field in the panel header filters loaded rows by any text; sort by column header; phone cards + sort sheet.
- post create/edit/detail (side preview and publications panel, phone tabs).
- Telegram preview.
- approve and publish flow.
- Публикации: tabs Все / Запланированные / Отправленные / Ошибки; client-side search and sort over loaded pages; «Опубликовать пост» picker; publication inspector.
- Инциденты.
- Настройки → Каналы, Оформление.
- owner menu/logout; restyled 404, in-development and error pages.

Search, «Ошибки» and counts are client-side over loaded rows only (shown as «Загружено N»); server-side versions are queue items 10–12.

Current placeholder or incomplete product areas (Calendar, Automations, Media library, Dota Pulse/Sources, channel analytics exist only as mock-data previews in the dev-only prototype `/__proto`, not as product):

- Calendar.
- Automations.
- Media.
- richer analytics.
- Dota intelligence.
- real global search.
- richer publication history.
- native channel analytics.

## 3. Plan map

The product is divided into operational systems. They share data, but each screen has a distinct job. The current Post model remains the starting point; the domain model (§4.x) is expanded without a destructive big-bang rename.

Each system's target design lives in its own file. Open only the one you need.

| Sections | Covers | File |
|---|---|---|
| §3.1, §4.1, §4.2, §4.3, §5, §6 | editor, autosave, internal publication snapshot, post actions, manual media, posts list | `docs/plan/content-studio.md` |
| §3.2, §4.4, §7, §10 | publication results, Publications Center, owner timezone | `docs/plan/publications.md` |
| §3.3, §9 | calendar views and actions | `docs/plan/calendar.md` |
| §3.4, §8, §16 | Decision Center / Overview, global search | `docs/plan/overview-search.md` |
| §3.5, §4.5, §12 | Dota news, patches, heroes/items, treasures, watchlists, events | `docs/plan/dota.md` |
| §3.6, §3.7, §13, §14, §25 | sources registry, Automation Center, /jobs | `docs/plan/sources-automation.md` |
| §3.8, §4.6, §11, §21 | snapshots, Telegram analytics, experiments | `docs/plan/analytics.md` |
| §3.9, §3.10, §15 | incidents, alert rules, owner bot | `docs/plan/incidents-bot.md` |
| §17, §18 | media library, later automated media pipeline | `docs/plan/media.md` |
| §19, §20 | platform expansion, comments | `docs/plan/platforms.md` |
| §22, §23, §24 | visual direction, Mini App, settings map | `docs/plan/design-mobile-settings.md` |
| §26 | cross-product state, API, data, security, observability rules | `docs/plan/reliability.md` |

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

Ships in two slices, each releasable on its own; 1b starts only after 1a and Phase 1D are in DEV.

Phase 1a — editor (queue items 1–2):

- rich Telegram-aware editor — built (§2.4.1).
- entities storage and preview — built (§2.4.1).
- autosave — built, awaiting owner DEV check.
- useful post actions.

Phase 1b — manual media (queue items 6–7):

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
- Responsive screenshots and overflow checks verified at 320, 375, 390, 768, 1024, 1280, 1440 and 1920 px, plus intermediate widths around layout changes (contract: `docs/design/UX_SPEC.md` §1).

Owner prerequisite:

- done 07.10.2026: R2 buckets `content-r2-dev` and `content-r2-prod` exist. Bindings are added to `apps/backend/wrangler.jsonc` (each environment its own bucket, like D1) in the same change as the first code that uses them, not earlier.

### Phase 1D — Dota update drafts (early slice of Phase 4, DEV)

Primary goal: the server notices a new Dota update on its own and hands the owner a ready draft, so a patch released today can go out the same day. Runs after Phase 1a and before Phase 1b, in DEV only.

Deliver, each step usable on its own:

1. Watcher: a Cron step polls the official sources (§12.1 «Known free sources») every 5–10 minutes with finite timeouts; each item is deduplicated in D1 by its source id, so overlapping ticks never create two events.
2. Draft + alert: a new patch or official announcement becomes a draft post from a deterministic template containing the official title, published date and exact official link; the owner gets a private bot alert «Вышло обновление …, черновик готов» with a link to the draft. Publishing goes through the existing approve → publish path.
3. Patch summary: for gameplay patches the draft lists the most important confirmed changes picked by the rules in `docs/PATCH_AUTOMATION_PLAN_DRAFT.md` §8; unknown values are never invented.

Definition of Done:

- the same update never produces two drafts, including under overlapping Cron ticks.
- a source that fails or changes shape raises an incident and an owner alert, never a broken draft.
- draft text contains only facts from the source and always the official link.
- nothing is published without the owner's approval.

Not in this slice: publishing without approval (separate owner decision, see `docs/DECISIONS.md` «Awaiting»), visual cards (Phase 9), hero/item statistics (Phase 4). Phase 4 slices 1, 2 and 4 extend this watcher instead of rebuilding it.

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

All work is tested only in DEV until the owner says DEV is ready; production is not touched before that (owner, 07.10.2026). Before production is considered ready:

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
| 1 | Content Studio rich editor and Telegram entities | done (awaiting owner DEV check) |
| 2 | Autosave | done (awaiting owner DEV check) |
| 3 | Dota update watcher: official sources, D1 dedup (Phase 1D) | done (deployed to DEV, smoke-check passed) |
| 4 | Dota update → template draft + private owner alert (Phase 1D) | done (deployed to DEV, smoke-check passed) |
| 5 | Patch summary from confirmed changes (Phase 1D) | in progress |
| 6 | Manual multi-media model, R2 upload and preview | in progress |
| 7 | Telegram multi-media publishing and publication_messages | not started |
| 8 | Post actions/archive UX | in progress (Archive tab exists, see §2.5) |
| 9 | Owner timezone | not started (top bar shows a read-only timezone chip) |
| 10 | Overview/Decision Center v2 | in progress (widget grid + server-side layout in DEV, awaiting migration 0012 on DEV D1; real attention/today data still partly client-side; no real views/ER) |
| 11 | Publications v2 | in progress (tabs, search, sort, inspector in DEV; needs date-range filter, multi-status «Ошибки», total counts) |
| 12 | Server-side Posts/Publications queries | not started (search/sort/«Ошибки» are client-side over loaded pages) |
| 13 | Calendar | not started |
| 14 | Analytics snapshot schema and Studio-owned Telegram analytics | not started |
| 15 | Telegram native statistics feasibility proof | not started |
| 16 | Sources registry | not started |
| 17 | Dota News / Pulse | not started |
| 18 | Dota Event + patch parser | not started |
| 19 | Hero statistics + Hero Movers | not started |
| 20 | Treasure/Cosmetics | not started |
| 21 | Watchlists + private owner bot alerts | not started |
| 22 | Automation Center | not started |
| 23 | Analytics v2 | not started |
| 24 | Media Library | not started |
| 25 | Platform expansion | not started |
| 26 | Automated media pipeline | not started |
| 27 | Production release — only when the owner says DEV is ready | not started |

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

- This file is the canonical implementation roadmap; `docs/plan/*.md` hold each system's target design and never their own status or queue.
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
- get a ready draft from the server within minutes of a new Dota update, without searching for it; publishing it stays one approval away unless the owner later allows automatic publishing.
- place heroes/items/topics on a watchlist.
- turn a sourced Dota event into a manual post.
- inspect and control recurring automations.
- later publish the same content operation to TikTok and YouTube through explicit platform variants.
- operate the system without depending on hidden scripts, fake success states or AI-generated decisions.
