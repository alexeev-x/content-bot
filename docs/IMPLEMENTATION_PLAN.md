# ALEXEEV — implementation roadmap

**Status:** active execution plan. The admin panel is the primary control plane of the product, not a reduced MVP. The Telegram bot is an execution/notification surface; operational control, configuration, content work, automation, incidents and analytics belong in ALEXEEV Studio.

## Product principles

- Build a complete operator product, not a collection of temporary admin screens.
- The interface must be modern, polished and information-dense without becoming visually noisy.
- Design lives in code only: tokens, primitives, real pages, browser screenshots and automated visual/accessibility checks. No Figma handoff.
- Desktop and Telegram/mobile are first-class. Acceptance widths: 375 px and 1280+ px.
- Every capability gets loading, empty, error, unauthorized, stale and destructive/unknown states where relevant.
- Frontend and backend ship as vertical product slices: contracts + backend + real UI + tests + docs in the same change.
- Do not keep fake UI as a final state. Fixture data is allowed only for design/catalog/visual tests.
- Publishing safety wins over convenience: no optimistic publish success; an indeterminate Telegram send is `unknown` and requires manual reconciliation.

## Stage 0 — runtime readiness

Goal: prove that both Cloudflare environments can support real development safely.

- [x] GitHub CI/CD: `develop` → Worker `dev`; `main` → Worker `app`.
- [x] Cloudflare deployment credentials and Worker runtime secrets are configured by the owner.
- [x] Remote Cron trigger is disabled until the scheduler exists.
- [ ] Create separate dev and production D1 databases and bind them under `env.dev` / `env.production`.
- [ ] Configure `OWNER_TELEGRAM_ID`, destination/channel configuration and the separate dev/prod Telegram bots.
- [ ] Verify `/api/v1/health` on both Workers and a safe Telegram `getMe`/configuration check without publishing.
- [ ] Protect `main` and the GitHub `production` environment according to the release policy.

**Exit:** dev and production are isolated; no test can publish through production credentials or production destinations.

## Stage 1 — ALEXEEV Studio visual foundation and application shell

This is the first implementation milestone because the current placeholder UI is not an acceptable base for the product.

- [ ] Replace the current visual layer with the approved modern monochrome design direction.
- [ ] Move/finalize semantic design tokens: typography, spacing, radii, surfaces, borders, elevation, motion, dark/light themes and responsive layout rules.
- [ ] Build production primitives in `shared/ui`: Button, IconButton, Input, Textarea, Select, SearchField, Tabs, Dialog, Drawer, Popover, Tooltip, Toast, StatusBadge, DataTable, Skeleton, EmptyState, ErrorState and destructive confirmation.
- [ ] Build the real application shell: desktop sidebar, compact/mobile navigation, page header, command/search entry point, account/environment indicator and responsive content layout.
- [ ] Add `/__catalog` with all primitive states instead of Storybook.
- [ ] Establish screenshot acceptance fixtures at 375 px and 1280/1440 px, dark and light.
- [ ] Add axe + keyboard smoke checks for the shell and critical primitives.
- [ ] Produce page specifications before feature implementation for every route in `docs/PAGE_MAP.md`.

**Exit:** the shell and primitives are visually accepted and reusable; future pages do not invent their own styling.

## Stage 2 — identity, session and secure operator access

- [ ] Browser sign-in through Telegram OIDC.
- [ ] Telegram Mini App sign-in through verified `initData`.
- [ ] Owner-only authorization using `OWNER_TELEGRAM_ID`.
- [ ] In-memory access token, browser refresh-cookie flow, logout and cache clearing.
- [ ] 401/403/expired-session states in the same polished shell.
- [ ] Mini App wrapper, safe-area handling, theme integration and native Back/Main button behavior.
- [ ] Security/integration tests for forged/expired auth, wrong owner, foreign Origin and session rotation.

**Exit:** the same Studio can be used safely in the browser and Telegram Mini App.

## Stage 3 — product data model, contracts and persistence

Implement the product model before wiring complex pages.

- [ ] D1 migrations for posts/revisions, publications, destinations/channels, idempotency, jobs, incidents and audit history.
- [ ] Add models needed by the full control plane: automation/rubric configuration, sources, media/template metadata and analytics snapshots where justified.
- [ ] Shared Zod contracts for list/detail/mutation responses and stable error codes.
- [ ] Cursor pagination, revisions and conflict semantics.
- [ ] Audit fields for important manual actions.
- [ ] Integration tests that parse real API responses with shared contracts.

**Exit:** frontend pages can rely on stable contracts instead of placeholders.

## Stage 4 — Content Studio

This is the core authoring workspace, not a simple textarea page.

- [ ] `/posts`: search, filters, statuses, source/rubric, updated time, destination and useful bulk/navigation actions.
- [ ] `/posts/new` and `/posts/:id`: structured editor, title/body, source provenance, rubric, destination, media, schedule controls and live validation.
- [ ] Revision history and comparison; 409 never overwrites local edits silently.
- [ ] Real Telegram preview using the same formatting rules as publishing.
- [ ] Draft/approved lifecycle, save state, dirty-state protection and keyboard shortcuts where useful.
- [ ] Link the editor to media/templates without duplicating their business logic.
- [ ] Mobile editor remains fully capable rather than becoming a read-only cut-down version.

**Exit:** all manual content work can be completed from Studio.

## Stage 5 — publishing engine and publication control

Backend safety and its full operator UI are delivered together.

- [ ] Telegram transport using the environment-specific bot.
- [ ] Immediate and scheduled publication.
- [ ] Idempotency key + body hash; repeated intent cannot create a duplicate publication.
- [ ] Conditional job claim and explicit `scheduled/queued/preparing/sending/sent/retry_wait/failed/unknown/cancelled` state transitions.
- [ ] Store confirmed Telegram `message_id`.
- [ ] Network/ambiguous result → `unknown`, never automatic resend.
- [ ] `/publications`: complete history/filter/detail/actions.
- [ ] `/calendar`: create, move, reschedule and cancel safely with timezone/DST handling.
- [ ] Manual reconciliation flow for `unknown`.
- [ ] First real E2E: create in Studio → publish with dev bot → receive Telegram message → show confirmed state in Studio → repeat request does not duplicate it.

**Exit:** manual publishing is production-safe and fully manageable through the admin panel.

## Stage 6 — Automation Center

Automation is a first-class product area, not hidden configuration.

- [ ] `/automations`: all rubrics with enabled/paused state, mode, last run, last success/error, next check and destination.
- [ ] Per-rubric configuration: automatic publication vs owner approval, schedule/check cadence, source allowlist, template and destination.
- [ ] Manual “run/check now” action with audit trail and no duplicate side effects.
- [ ] Run history and explanation of why a candidate was published, held or rejected.
- [ ] Global pause and per-rubric pause.
- [ ] Source health visible in Studio.

**Exit:** the owner can understand and control every automated content workflow without editing config files.

## Stage 7 — Dota patch and event automation

Implement the approved `PATCH_AUTOMATION_PLAN_DRAFT.md` on top of the publishing/automation foundation.

- [ ] Monitor approved official Valve/Dota sources only.
- [ ] Deduplicate official announcements and classify major patch / balance / micro / hotfix / major event.
- [ ] Parse patch structure into normalized changes.
- [ ] Group raw lines into hero/item/system/fix themes.
- [ ] Rank importance using deterministic signals first: gameplay impact, magnitude, breadth, bundles and available popularity data.
- [ ] Produce balanced coverage across buffs, nerfs, items and global changes when meaningful.
- [ ] Major named events become separate posts.
- [ ] Never invent missing facts; uncertain detection is held instead of autopublished.
- [ ] Show detected source, classification, extracted themes, generated post, decision and publication result in the Automation Center.
- [ ] Only after end-to-end tests enable the production Cron cadence.

**Exit:** an official patch can be detected, prepared, explained in Studio and safely published once.

## Stage 8 — Media and visual system

- [ ] `/media`: searchable media library, uploads, source/rights metadata, thumbnails and usage history.
- [ ] `/templates`: reusable card templates with preview, versioning and active/default state.
- [ ] Horizontal Dota patch/event cards using approved official assets or abstract fallback — never AI lookalike heroes.
- [ ] Server-side final preview is the same render used for publication.
- [ ] R2 for binary assets once required; D1 stores bounded metadata only.
- [ ] Mobile-safe media selection and preview.

**Exit:** visuals are manageable, reproducible and visible before publication.

## Stage 9 — operations, incidents and observability

- [ ] Dashboard with actionable health: upcoming publications, automation status, failures, stale sources and recent activity.
- [ ] `/jobs`: execution history, timing, attempts and safe diagnostic metadata.
- [ ] `/incidents`: errors, `unknown` sends, manual resolution and audit trail.
- [ ] Surface requestId/jobId, component, error code and timestamps without leaking secrets/raw Telegram payloads.
- [ ] Safe retry only when backend explicitly marks the operation retryable.
- [ ] Stale-data indicators and bounded polling only while visible.

**Exit:** operational problems are diagnosable and resolvable from Studio.

## Stage 10 — analytics and content intelligence

Analytics is part of the product, not an afterthought.

- [ ] `/analytics`: overview by period, rubric, content type and destination.
- [ ] Publication volume, success/failure/unknown rates and timing.
- [ ] Automation performance: detected → prepared → approved/published → failed/held.
- [ ] Content/rubric comparison once reliable outcome data exists.
- [ ] Add external platform/video analytics only after the corresponding data source is connected and its metrics are understood.
- [ ] Historical comparisons must preserve source timestamps and avoid presenting incomplete data as final.

**Exit:** Studio helps decide what to publish next, not only what happened technically.

## Stage 11 — settings and integrations

- [ ] Channels/destinations and default routing.
- [ ] Telegram bot health and webhook configuration status without exposing secrets.
- [ ] Timezone, publication defaults and automation defaults.
- [ ] Source configuration and allowed official domains.
- [ ] Appearance/preferences.
- [ ] Environment-aware destructive actions with clear dev/production distinction.

**Exit:** normal operation no longer requires editing Cloudflare/GitHub configuration except actual secrets/infrastructure.

## Stage 12 — production hardening and release

- [ ] Full unit/integration/contract suite green.
- [ ] Playwright E2E for auth, editor, publish, schedule, automation, incident reconciliation and mobile flows.
- [ ] Accessibility checks on critical routes.
- [ ] Real dev-Worker smoke with the test bot/channel.
- [ ] Double scheduler run produces no duplicate publication.
- [ ] Lost Telegram response produces `unknown` and no automatic resend.
- [ ] Full-history Gitleaks, dependency audit and frontend secret audit green.
- [ ] Load test the actual expected workload before claiming 1,000 jobs/day or changing architecture.
- [ ] Release through `develop → main` PR; production deploy only after all gates pass.

## Immediate execution order

The next development sequence is fixed as:

1. **Studio redesign foundation + application shell.**
2. **Authentication and owner session.**
3. **D1 + contracts + core persistence.**
4. **Full Content Studio.**
5. **Safe publishing engine + Publications + Calendar.**
6. **Automation Center.**
7. **Dota Patch/Event automation.**
8. **Media/Templates.**
9. **Operations/Incidents.**
10. **Analytics + Settings hardening.**

Backend work may start in parallel once the required contract for a vertical slice is fixed, but no feature is considered done until its real Studio UI, failure states, tests and documentation ship together.
