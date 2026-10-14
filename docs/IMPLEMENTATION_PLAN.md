# ALEXEEV Studio — master implementation plan

**Status:** the single roadmap: what works (§2), the target design map (§3), phases (§4) and the execution queue (§5). Updated 13.10.2026 from the code. DEV only; nothing is released to production.

ALEXEEV Studio is not a small Telegram admin panel. The target is a complete content operations system for ALEXEEV: create content, attach media, approve it, schedule and publish it safely, understand what happened, monitor Dota changes and news, operate automations, receive incidents in the owner's Telegram bot, and later publish and measure content across Telegram, TikTok and YouTube.

## 1. Product principles

Made by the owner; not re-opened unless the owner changes them. Dated decisions live in `docs/DECISIONS.md`.

- The admin panel is the primary control plane. The Telegram bot is a personal owner surface for quick status, alerts and actions.
- DEV and production are isolated. DEV stays visibly marked.
- Publishing safety beats optimistic UX. An ambiguous Telegram result is UNKNOWN, never silently SUCCESS and never retried automatically.
- Technical alerts go only to the owner's private chat with the bot, never to a content channel.
- A post may carry several manually uploaded photos, GIFs and videos. Automatic downloading and generated media are a later, separate project.
- No AI/LLM/generative features in the active roadmap (§6).
- Dota intelligence is deterministic: source ingestion, parsing, normalization, comparisons, thresholds, rules, watchlists and explicit provenance.
- Design exists only in code (tokens, primitives, `/__proto`, screenshots); no Figma.
- Phone, tablet, laptop, desktop and the Mini App are first-class; mobile is not read-only. Widths to check: `docs/design/UX_SPEC.md` Conventions.
- D1 is the operational source of truth; R2 holds media objects.
- A feature is done only when the real backend, real UI, validation, error states, tests and operational behavior exist. A route or a prototype is not a feature.

## 2. What works now (DEV)

«Owner-checked» = the owner validated it live in DEV. «Built» = merged and deployed to DEV, waiting for the owner's check (queue item 1).

### 2.1 Platform — owner-checked

- `develop` deploys Worker `dev`, `main` deploys `app`; separate D1 and R2 per environment; DEV Cron every minute, production Cron off until release.
- CI: verification, full-history Gitleaks, changed-area checks with sharded Vitest on `develop`/PRs, full set on `main`, `/api/v1/health` smoke check after deploy.

### 2.2 Sign-in — owner-checked

Telegram Login Widget (browser), Mini App `initData`, owner-only access, rotating refresh cookie, 401/403 states, logout; local sign-in under `npm run dev` only.

### 2.3 Shell and design — owner-checked (08.10.2026)

Approved «Calm Operations» design (`docs/design/UX_SPEC.md`, `/__proto`) applied to every real page: sidebar with collapse and channel card, top bar (timezone chip, DEV marker, system-status chip, theme toggle, owner menu), phone tab bar (Обзор, Посты, Публикации, Инциденты, Ещё), skeletons with stable geometry, dark/light themes, accent presets and custom colours.

### 2.4 Posts and editor

- Owner-checked: list, draft editing, Telegram preview, approval (approved = read-only), publish now / schedule, archive tab.
- Built: rich editor with Telegram entities (bold, italic, underline, strikethrough, spoiler, link, code, code block, quote), autosave of existing drafts (1.2 s), manual media (up to 10 photos/GIF/videos per post, private R2 upload with server validation, reorder, remove, attach from retained assets), approval freezes text, entities and media.
- Server-side archive, restore, single and bulk delete, 30-day purge.

### 2.5 Publishing — owner-checked core, media built

- Owner-checked: immediate and scheduled publish, message id, reschedule, cancel, failed/unknown states, manual `unknown` reconciliation, attempts and incidents, idempotency keys, conditional claims and leases.
- Built: media sends (one photo/video/animation or a 2–10 photo/video album), every message ID stored (`external_message_ids`).
- Owner notices: a private alert per publication incident (claimed once, never retried); a notice with a «Подробнее» button after scheduling.

### 2.6 Pages

- Обзор: customizable 12-column widget grid (15 widget types, edit mode, catalog, undo, phone reorder), layout stored server-side with revision/409.
- Публикации: tabs Все / Запланированные / Отправленные / Ошибки, search and sort, «Опубликовать пост» picker, inspector. The API already supports server search `q`, a `from`/`to` range and `order`.
- Инциденты: open/closed, acknowledge `publish_failed`, reconciliation link for `unknown`, nav badge.
- Настройки: Каналы (add with a Telegram rights check, edit, enable/disable), Оформление.
- 404, «в разработке» and error pages. `/sources` has a real owner-only, read-only view of two official Dota feeds and persisted health/provenance (`docs/stories/source-registry-mvp.md`). Calendar is implemented locally for DEV with owner-timezone day/week/month views, bounded range loading, DST-safe slot intent, and an unscheduled lane; tests and local-mock browser QA pass, but deployment/owner DEV check remains in queue item 12. Automations remain previews. Media Library implementation is complete locally but is not yet deployed to DEV (migration 0029 and release checks remain).

### 2.7 Owner bot — built

Webhook with secret and `update_id` dedup, owner-only; `/start`, `/today`, `/next`, `/status`; any other owner message becomes a draft.

### 2.8 Dota (Phase 1D) — built

Official sources watched every five minutes with D1 dedup; a new update becomes a draft with the official title, date and link plus a private owner alert; gameplay patches get a summary of confirmed changes; source failures raise an incident. `/sources` provides the owner-only read-only feed health, bounded official updates, provenance, and links only to existing drafts (`docs/stories/dota-intelligence-mvp.md`). Nothing is published without approval.

Patch hero/item watchlists are owner-managed from persisted confirmed facts; D1 deduplicates matches and private alerts. Removed watches cannot claim or send a pending alert; ambiguous Telegram sends remain `unknown` and are not retried. `/sources` includes the watch panel and confirmed event detail.

### 2.9 Known limits

- The top-bar search field is a disabled placeholder (no entity-search endpoint).
- Owner timezone is configurable and used by scheduling, Calendar, and the bot; some older surfaces may still need adoption. Calendar displays UTC offsets for ambiguous repeated event times.
- The 409 compare dialog compares plain text only; bot notices still use HTML parse mode; the phone formatting toolbar wraps to three rows.
- Final publication records can be deleted from Studio; this cannot delete an already-sent Telegram message. Operational history is purged by the retention policy below.
- Retention: terminal-job attempts after 90 days only when no incident remains open; resolved incidents and audit rows after 365 days. Open incidents and active-job attempts are preserved; hourly idle Cron deletes at most 100 rows per table.
- Widget drag is not tested on a real touch device.

## 3. Plan map

Each system's target design lives in its own file; open only the one you need. Section numbers are the files' own.

| Sections                  | Covers                                                                         | File                                                             |
| ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| §3.1, §4.1–4.3, §5, §6    | editor, autosave, publication snapshot, post actions, manual media, posts list | `docs/plan/content-studio.md`                                    |
| §3.2, §4.4, §7, §10       | publication results, Publications Center, owner timezone                       | `docs/plan/publications.md`                                      |
| §3.3, §9                  | calendar views and actions                                                     | `docs/plan/calendar.md`                                          |
| §3.4, §8, §16             | Overview, global search                                                        | `docs/plan/overview-search.md`                                   |
| §3.5, §4.5, §12           | Dota news, patches, heroes/items, treasures, watchlists, events                | `docs/plan/dota.md`                                              |
| §3.6, §3.7, §13, §14, §25 | sources registry, Automation Center, /jobs                                     | `docs/plan/sources-automation.md`                                |
| §3.8, §4.6, §11, §21      | snapshots, Telegram analytics, experiments                                     | `docs/plan/analytics.md`                                         |
| §3.9, §3.10, §15          | incidents, alert rules, owner bot                                              | `docs/plan/incidents-bot.md`                                     |
| §17, §18                  | media library, later automated media pipeline                                  | `docs/plan/media.md`                                             |
| §19, §20                  | platform expansion, comments                                                   | `docs/plan/platforms.md`                                         |
| §22, §23, §24             | visual direction, Mini App, settings map                                       | `docs/plan/design-mobile-settings.md`                            |
| reliability               | cross-product rules                                                            | root `AGENTS.md` Non-negotiables, skill `publishing-reliability` |

## 4. Phases

Work follows this order unless the owner changes priority.

### Phase 0 — Publishing foundation: done, owner-checked

Do not rebuild it; fix concrete regressions only.

### Phase 1 — Content Studio v2 + manual multi-media: built, owner check pending

1a editor (rich editor, entities, autosave) and 1b manual media (upload, R2, preview, reorder/remove, frozen media on approval, albums, all message IDs, mobile flow) are built. Post actions (duplicate, «Вернуть в черновик», remove final publication records) are built. Still open from Phase 1: the editor redesign from the post-editor prototype (`docs/stories/post-editor-prototype.md`).

Definition of Done (checked by the owner in DEV):

- the text-only path still passes; media upload has server validation;
- an approved revision cannot silently change; the preview matches the publish strategy;
- every sent Telegram message id is stored; a failure mid-send is never reported as full success;
- responsive checks pass per `docs/design/UX_SPEC.md` Conventions.

### Phase 1D — Dota update drafts: built

Watcher, draft + private alert, patch summary (§2.8). Not in this slice: publishing without approval (open owner decision, `docs/DECISIONS.md`), visual cards (Phase 9), hero/item statistics (Phase 4). Phase 4 extends this watcher instead of rebuilding it.

### Phase 2 — Core operator UX (in progress)

Make the current Studio coherent before adding product areas:

- owner timezone setting used by the UI, bot, Обзор and scheduling;
- Обзор: «Одобрены, но не запланированы», week-day links into the publications date range;
- Публикации: «Сегодня» and other periods on the existing `from`/`to` API, «Ошибки» = failed + unknown, total counts, server search;
- Посты: server-side search, sort and counts;
- global search (entity-search endpoint + Ctrl/⌘ K palette) or remove the disabled field;
- warning before disabling a channel with scheduled publications (count from the server);
- incident alerts: dedupe, grouping, cooldown, recovery notice, Settings → Уведомления;
- improved empty states and archive explanation.

Definition of Done:

- a healthy empty account still has a clear next action;
- no disabled placeholder remains without explanation;
- list state survives URL/reload where appropriate;
- publication detail explains exactly what happened;
- one failure burst produces one grouped alert, and recovery is announced.

Current implementation note: grouped publication alerts are sent once per Cron dispatch tick and incident claims
remain deduplicated in D1. Source recovery notices already exist for Dota feed incidents. Cooldown across ticks
and notification-preference enforcement still need implementation. Operational-history retention is implemented
with bounded idle-hourly purges; see `docs/DECISIONS.md` and `docs/BACKEND_ARCHITECTURE.md` §10.

### Phase 3 — Calendar + analytics data foundation

Calendar day/week/month on the existing reschedule/cancel paths; analytics snapshot schema; Studio-owned publication analytics; first Analytics screen; feasibility proof for richer Telegram channel statistics (connector only if approved, otherwise only metrics actually available).

DoD: snapshots are append-only; every metric shows source and observed time; no unsupported metric is faked; calendar is DST/timezone tested.

### Phase 4 — Dota Intelligence

Slices: sources registry and health; Dota News / Pulse; normalized Dota Event; patch ingestion/parser (extends Phase 1D); hero changes; approved hero statistics source; Hero Movers; item changes/statistics; Treasure/Cosmetics; watchlists; owner bot alerts for watchlist/source events; Dota event detail with manual «Создать пост».

DoD: every fact has source and freshness; dedupe prevents duplicate events; the parser never invents values; source failures create incidents; an event becomes a draft without copying by hand; no AI.

### Phase 5 — Automation Center

Automation list/detail, cadence, enable/pause, run history, «Запустить сейчас», source polling, snapshot jobs, watchlist evaluation, failure thresholds, incident integration.

DoD: runs are idempotent and bounded; state is auditable; repeated failures are grouped and alerted privately; a paused automation has no side effect.

### Phase 6 — Telegram analytics v2 and content comparisons

Channel overview if a connector supports it, post performance table, same-age snapshots, rubric/media-type/publish-time comparisons, export where useful, manual experiment log.

DoD: data traces back to snapshots; missing periods are visibly incomplete; comparison logic has deterministic tests.

### Phase 7 — Media Library

`/media` implementation is complete locally over the retained-assets API (`GET /api/v1/media`): server search and kind/usage filters, grid/list, authenticated private previews, metadata, bounded usage links, checksum duplicate counts, and attach-to-draft. It is not yet deployed to DEV; migration 0029 and release checks remain. No standalone upload, manual deletion, download, or automatic generation.

### Phase 8 — TikTok + YouTube

Per platform, never both at once: connection/auth → capability preflight → manual publication → processing/result state → Publications integration → analytics snapshots → comments where permitted → Calendar.

### Phase 9 — Automated media pipeline

Separate project after manual media, sources and platform publishing are stable: source image import, resize/crop/transcode, template rendering, platform variants, Dota cards. Needs separate owner approval.

### Phase 10 — Production hardening and release

Only after the owner says DEV is ready (owner, 07.10.2026). Before release:

- e2e: auth, editor, multi-media, immediate/scheduled publication, cancel/reschedule, UNKNOWN reconciliation;
- incidents/owner alert tests, Calendar tests, source/automation tests for enabled systems;
- accessibility checks and visual regressions for critical pages;
- a separate Telegram test bot and channel for manual checks;
- backup/restore, production migration and rollback procedures;
- production Cron decision, security review, load tests before any throughput claim.

## 5. Execution queue

Whoever starts or finishes an item updates its status here in the same change (`not started` / `in progress` / `waiting for owner` / `done`). A lower item may be pulled earlier only when it does not destabilize or duplicate an unfinished item above it.

| #   | Item                                                                                                                                                                                    | Phase | Status            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------- |
| 1   | Owner confirmed DEV working for the rich editor, media, Dota and bot flows (13.10.2026).                                                                                         | 1, 1D | done              |
| 2   | Post editor redesign: v3 implementation and core media fixes are complete; focused tests/typecheck, MEDIA-002 E2E, crop recovery, real-photo crop pixel samples, responsive/theme matrix, axe, UI-003 focus, mobile keyboard traversal, safe-area, and full verify passed. Only the network-blocked Telegram SDK audit remains; details in `docs/stories/post-editor-v3-handoff.md`. | 1     | in progress       |
| 3   | Post actions: duplicate, «Вернуть в черновик», remove final publication records                                                                                                         | 1     | done              |
| 4   | Owner timezone setting (UI, bot, Обзор, scheduling)                                                                                                                                     | 2     | done              |
| 5   | Публикации v2: periods on `from`/`to`, «Ошибки» = failed + unknown, total counts, server search in the UI                                                                               | 2     | done              |
| 6   | Обзор v2: «Одобрены, но не запланированы», week-day links                                                                                                                               | 2     | done              |
| 7   | Посты: server-side search, sort and counts                                                                                                                                              | 2     | done              |
| 8   | Global search palette, or remove the disabled field                                                                                                                                     | 2     | done              |
| 9   | Channel disable warning with the scheduled count                                                                                                                                        | 2     | done              |
| 10  | Incident alerts: settings, bot status, cross-tick grouping/cooldown, preference-aware delivery, and recovery; full verify and R3 review passed. Details: `docs/stories/incident-alerts-next.md`. | 2     | done              |
| 11  | Bounded operational retention for `job_attempts`, `incidents`, `audit_log`; migration 0030 and R3 review passed. Owner applies migration to DEV D1. | 2     | done              |
| 12  | Calendar — owner-timezone day/week/month, bounded pagination, DST gap/fold intent, and desktop inspector implemented; targeted tests, full verify, and local-mock Gate B pass. Awaiting owner push/deploy and DEV smoke check. Details: `docs/stories/calendar-mvp.md`. | 3 | in progress |
| 13  | Analytics snapshot schema and Studio-owned publication analytics. Details: `docs/stories/analytics-studio-owned-mvp.md`.                                                                 | 3     | done              |
| 14  | Telegram native statistics feasibility proof. Bot API is limited to current counts/future subscribed updates; rich native metrics require separately approved MTProto user auth. Details: `docs/stories/telegram-native-statistics-feasibility.md`. | 3     | done              |
| 15  | Sources registry: owner-only read-only inspection of two official feeds, persisted attempt/success health, bounded updates and provenance. Details: `docs/stories/source-registry-mvp.md`. | 4     | done              |
| 16  | Dota News / Pulse: bounded official updates and only already-existing linked drafts in `/sources`. Details: `docs/stories/dota-intelligence-mvp.md`.                                      | 4     | done              |
| 17  | Dota Event + patch parser: read-only persisted update detail, deterministic fact states, Steam `not_applicable`, responsive/accessibility UI, and bounded legacy/new-patch analysis queue. Details: [`UX_SPEC.md` §3.9](design/UX_SPEC.md), [`API_CONTRACTS.md`](API_CONTRACTS.md), [`Dota plan` §12.2](plan/dota.md). | 4     | done |
| 18  | Hero statistics + Hero Movers. Bounded OpenDota `/heroStats` candidate approved with provenance/freshness and no-key/no-paid limits; current data-reuse terms remain unverified. `docs/stories/hero-statistics-feasibility.md`. | 4 | in progress |
| 19  | Treasure/Cosmetics narrowed to an official announcement index only; no catalog or artwork until a structured authorized source exists. `docs/stories/dota-cosmetics-feasibility.md`. | 4 | deferred |
| 20  | Watchlists + private owner bot alerts: persisted-fact add/remove, deduplicated matching, guarded private delivery, unknown/no-retry behavior; integration, browser matrix and axe passed. | 4     | done              |
| 21  | Automation Center; pause policy approved: stop future automation runs only, never suspend already-scheduled Telegram publications. Contracts, migration 0032 and backend run control are implemented locally. Gate A still fails because Escape does not dismiss the pause alertdialog in the served prototype; production UI is not started. `docs/stories/automation-center.md`. | 5 | in progress |
| 22  | Analytics v2 uses manual observations only; no MTProto session. Contracts, migration 0033, owner-only backend routes and integration tests are implemented locally. Screen UX handoff is in progress; prototype, frontend, independent review and DEV migration remain. `docs/stories/analytics-v2.md`. | 6 | in progress |
| 23  | Media Library — owner-only retained assets, server filters, private preview, bounded usage/duplicate details, and attach-to-draft; no standalone upload or manual deletion. | 7 | done |
| 24  | YouTube first, owner-only OAuth; implementation awaits Google API project/OAuth setup and privacy-policy URL. No credentials or uploads exist yet. `docs/stories/platform-expansion-feasibility.md`. | 8 | waiting for external setup |
| 25  | Separate automated media project approved for later; defer until manual media, sources and platform publishing are stable. No paid providers/render tiers. | 9 | deferred |
| 26  | Production release — only when the owner says DEV is ready                                                                                                                              | 10    | not started       |

## 6. Out of scope for the active plan

Do not build or silently introduce: LLM providers; AI-generated post text or scripts; AI recommendations or content scoring; AI Idea Radar; AI comment sentiment/clustering or reply drafts; AI Learning Cards; generative images or AI thumbnails; AI Clip Factory; AI agents or an AI orchestrator; Agent Inspector or Shadow Mode for AI decisions. If the owner later wants AI, it gets a new plan after the non-AI product is mature.

## 7. Documentation rules

- This file is the only place for status and order. `docs/plan/*.md` hold target design only; stories hold a feature spec only while it is being built and are deleted once their rules move into `docs/design/UX_SPEC.md` or the architecture docs.
- `docs/PAGE_MAP.md` describes page responsibilities; `docs/DECISIONS.md` records owner decisions; architecture docs describe constraints and as-built behavior.
- Finishing work updates §2 and §5 in the same change. Never claim a system works because its route, prototype or placeholder exists.

## 8. Definition of product success

The finished non-AI ALEXEEV Studio lets the owner:

- open one app and immediately see what needs attention;
- create a formatted Telegram post from desktop or phone with several photos/GIFs/videos;
- preview exactly what will be published, approve a frozen revision, publish now or schedule;
- safely reschedule, cancel and reconcile, and see every provider message id;
- receive real operational failures only in the private owner bot;
- understand publication and channel history from saved analytics;
- see current Dota news, updates, patches, hero/item movement and treasures with sources;
- get a ready draft within minutes of a new Dota update, one approval away from publishing unless the owner later allows automatic publishing;
- watch heroes/items/topics and turn a sourced Dota event into a post;
- inspect and control recurring automations;
- later publish the same content to TikTok and YouTube through explicit platform variants;
- operate the system without hidden scripts, fake success states or AI-generated decisions.
