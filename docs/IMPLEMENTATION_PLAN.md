# ALEXEEV — implementation roadmap

**Status:** active execution plan, rewritten 07.10.2026 from an audit of the code (not of earlier docs). The admin panel is the primary control plane of the product, not a reduced MVP. The Telegram bot is an execution/notification surface; operational control, configuration, content work, automation, incidents and analytics belong in ALEXEEV Studio.

## Product principles

- Build a complete operator product, not a collection of temporary admin screens.
- The interface must be modern, polished and information-dense without becoming visually noisy.
- Design lives in code only: tokens, primitives, real pages, browser screenshots and automated visual/accessibility checks. No Figma handoff.
- Desktop and Telegram/mobile are first-class. Acceptance widths: 375 px and 1280+ px.
- Every capability gets loading, empty, error, unauthorized, stale and destructive/unknown states where relevant.
- Frontend and backend ship as vertical product slices: contracts + backend + real UI + tests + docs in the same change.
- Do not keep fake UI as a final state. Fixture data is allowed only for design/catalog/visual tests.
- Publishing safety wins over convenience: no optimistic publish success; an indeterminate Telegram send is `unknown` and requires manual reconciliation.

## Where we are (audit 07.10.2026)

Done means built and covered by tests in this repo. "Not verified live" means it has never run against a real Telegram bot and channel.

| Area | State | What exists | Gaps |
|---|---|---|---|
| Runtime and CI | done | `develop` → Worker `dev`, `main` → Worker `app`; separate dev/prod D1 bindings; dev Cron every minute, production Cron off | Branch protection and secrets are owner-side, not provable from the repo |
| Visual foundation | done | Tokens (light/dark, cobalt presets, pointer density), `shared/ui` primitives, `/__catalog` (dev only) | No screenshot baselines (`toHaveScreenshot`) |
| Shell | mostly | Sidebar with collapse, mobile bottom nav, env badge, Settings master/detail | Search field in the top bar is a disabled placeholder |
| Sign-in and session | done | Telegram Login Widget, Mini App `initData`, owner-only check, in-memory token + rotating refresh cookie, 401/403 states, security tests | Mini App MainButton |
| Data and contracts | done | Migrations 0001–0010: posts, revisions, idempotency, audit, destinations, publications, jobs, attempts, incidents; Zod contracts; keyset cursors; 409 on stale revision | No tables for rubrics, sources, media, analytics yet |
| Posts | partial | List with status filter and bulk delete, archive with restore and 30-day purge, editor (title + body), approve, Telegram preview, 409 compare, leave guard, Ctrl+S | **Editor is a plain textarea: no rich text, no entities.** No autosave. Search and sort are client-side. No revision history UI |
| Publishing engine | done, not verified live | Telegram transport, immediate and scheduled sends, idempotency key + body hash, conditional claims with leases, `message_id` stored, ambiguous result → `unknown`, manual reconciliation, owner alerts | Never run end-to-end with the dev bot |
| Publications | partial | List with status and channel filters, drawer with reschedule, cancel, reconcile | No search, period or sort |
| Dashboard and incidents | done (first cut) | `GET /api/v1/dashboard`: attention, today, upcoming, recently sent; `/incidents` with filters and resolve; system status strip | No drafts / approved-not-scheduled, no last Cron run, no week numbers |
| Bot | done | `/start` with «Открыть студию», menu button, `/today` `/next` `/status`, forwarded text → draft (plain text), alerts | Owner timezone hard-coded `Europe/Moscow` in `bot/owner-time.ts`; drafts lose formatting |
| Settings | partial | Channels (list, add, edit, check), bot connection and webhook status, appearance | No owner timezone or publication defaults |
| Calendar, Automations, Media | not started | Routes render `InDevelopmentPage`, hidden from navigation | — |
| Jobs, Analytics, Templates | not started | No routes | — |

## Next queue

Work goes top to bottom, one step at a time (the owner's 16 GB laptop does not run parallel heavy checks). Each step ships contracts, backend, UI, tests and docs together. R3 steps get a qa-security review before the owner commits.

### Step 1 — Live publishing smoke on dev (R3, owner + agent, ~1 hour)

The engine has never sent a real message. Everything below builds on it, so it is proven first.

- Agent prepares a checklist and reads Worker logs and dev D1 state (read-only queries) during the run.
- Owner creates a post in Studio on `dev`, publishes now and schedules one for +3 minutes into the **test** channel, watches Telegram.
- Pass: both messages arrive once; Studio shows «Опубликовано» with the Telegram link; a repeated publish request does not create a duplicate; the owner gets no false alert.
- Owner inputs: migrations applied to dev (`npm run db:migrate:dev`); the dev bot token set; a test channel where the dev bot is admin, added in Studio → Настройки → Каналы.

### Step 2 — Rich text editor (R3, ~3–4 working sessions)

The owner's main ask: a real editor instead of the textarea.

- Editor: TipTap 3 (ProseMirror, MIT), individual extensions only, no `starter-kit` (researcher, 07.10.2026). Marks: bold, italic, underline, strikethrough, spoiler (small custom mark), link, inline code, code block, quote; lists rendered as «• » / «1. » lines.
- Toolbar on desktop; a compact toolbar above the keyboard on a phone; standard shortcuts (Ctrl+B/I/U/K).
- Storage: plain text + Telegram `entities` (UTF-16 offsets) per post and revision. Own pure mapper text+entities ⇄ editor document with a round-trip property test.
- Title: bold by default, editable.
- Sending: `sendMessage` with `entities`, no HTML `parse_mode`. Publication body hash covers the entities.
- Migration: existing plain posts become text with no entities (expand → backfill → switch).
- Preview «как в канале» renders the same entities; the length counter counts UTF-16 units against Telegram's 4096.
- Bot: a forwarded or typed message keeps its entities in the new draft.
- Contract change across contracts, backend, frontend and contract tests in one PR.
- Done when: unit tests for the mapper, integration tests for save/send with entities, e2e for formatting and preview, screenshots at 375/1280 in both themes, a manual pass in real Telegram on Android and iOS with the Russian keyboard (owner).

### Step 3 — Autosave (frontend, ~1 session)

- Drafts save on their own after a pause in typing, with the existing save indicator («Сохранено», «Сохраняем…», «Не сохранено — повторить»).
- Leaving asks for confirmation only when the last save failed (`docs/stories/posts-lifecycle.md` §4).
- A 409 during autosave never overwrites; it shows the existing compare banner.

### Step 4 — Dashboard that is worth opening + owner timezone (R2, ~2 sessions)

- New blocks: «Черновики» (last 3 unpublished, «Продолжить»), «Одобрены, но не запланированы», «За 7 дней» (sent / errors / scheduled), last Cron run in the status strip.
- «Новый пост» in the dashboard header.
- «Бот не настроен» explains what is missing and where it is set.
- Owner timezone setting in Settings; the bot's `/today` and the dashboard use it instead of the hard-coded `Europe/Moscow` and the browser zone.
- Extends `GET /api/v1/dashboard` (bounded, one batch) and the settings contract.

### Step 5 — Server-side tables (R2, ~2 sessions)

- Posts and Publications: server-side search, filters (status, channel, period) and sorting, all in the URL; quick filters; filter sheet on a phone. Indexes checked with EXPLAIN.
- ux-designer spec first.

### Step 6 — Calendar (R3, ~3 sessions)

- `/calendar`: week and month views of publications in the owner's timezone; drag or dialog to reschedule; cancel; create from an empty slot; DST-safe. Reschedule and cancel reuse the conditional publication transitions.

### Step 7 — Post lifecycle gaps (R3, ~1 session)

- Cancel and reschedule as row actions in Posts and on the post page, not only in the publication drawer.
- Remove records of final publications (sent/failed/cancelled) with confirmation; never delete channel messages.

### Step 8 — Images (R3, after the owner enables R2: one bucket for dev, one for production)

- One JPEG, PNG or WebP per post, up to 10 MB, type checked by magic bytes; stored in R2, metadata in D1; sent with `sendPhoto`; caption limit 1024 enforced in the editor. Albums later.

### Step 9 — Mobile P1/P2

- BottomSheet primitive, full-screen editor on a phone, Telegram MainButton, screenshot baselines in the CI Linux container (`docs/stories/mobile-layout.md` §5).

## Later (in this order, each needs its own story first)

1. **Automation Center** — rubrics with mode (auto / owner approval), cadence, sources, template, destination; run/check now with audit; run history with reasons; global and per-rubric pause (today only the env kill switch `PUBLISHING_ENABLED`); source health.
2. **Dota patch and event automation** — `docs/PATCH_AUTOMATION_PLAN_DRAFT.md`: official Valve/Dota sources only, dedupe and classify, parse and group changes, deterministic ranking, never invent facts, uncertain → held. Production Cron is enabled only after its end-to-end tests.
3. **Media and templates** — `/media` library with rights metadata, `/templates` with preview and versions, patch/event cards from approved assets (never AI lookalike heroes), server-side render identical to the published image.
4. **Operations** — `/jobs` history with attempts and safe diagnostics (requestId, jobId, code, timestamps; no secrets or raw payloads), stale-data indicators, retry only where the backend marks it retryable.
5. **Analytics** — `/analytics` by period, rubric, destination: volume, success/failure/unknown, timing, automation funnel. External metrics only after their source is connected.
6. **Settings hardening** — default routing, publication and automation defaults, allowed source domains, environment-aware destructive actions.
7. **Shell search** — the top-bar search becomes a working command/search palette over posts and publications.
8. **Production release** — e2e for auth, editor, publish, schedule and incidents; axe on every critical route; full-history Gitleaks and dependency audit green; load test before any claim of 1 000 jobs/day; release PR `develop → main` opened by the owner; production Cron on.

## Owner actions outside the queue

- Apply each new migration to dev after a push: `npm run db:migrate:dev` (production only at release).
- Confirm `main` branch protection and the GitHub `production` environment reviewers.
- Enable R2 before step 8.
