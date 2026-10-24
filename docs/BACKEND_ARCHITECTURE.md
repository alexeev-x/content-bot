# CONTENT-BOT — FINAL BACKEND ARCHITECTURE v3.1

**Date:** 03.10.2026 · **Status:** approved technical direction, implemented in DEV; sections marked "as built" describe the running code · **Load:** up to 1,000 background jobs/day; peaks are verified by load tests · **Budget:** free quotas until measured limits are reached.

> This document replaces ALL interim architectures. When it conflicts with the chat or the old README, follow it, then the approved `AGENTS.md`. When decisions change, edit this document; do not create a v4 alongside it.

**Index.** The architecture is split by topic so agents load only what they need: open the one file for your task. Section numbers (§) are kept.

| File | Sections |
|---|---|
| [`docs/backend/principles.md`](./backend/principles.md) | §1 Architecture principle, approved stack |
| [`docs/backend/boundaries.md`](./backend/boundaries.md) | §2 Boundaries: who owns what |
| [`docs/backend/structure.md`](./backend/structure.md) | §3 Repository structure, §4 contracts and dependency injection |
| [`docs/backend/publishing.md`](./backend/publishing.md) | §5 Reliable publishing: states, claims, status projection, owner actions on a job |
| [`docs/backend/post-lifecycle.md`](./backend/post-lifecycle.md) | §5 Post lifecycle (archive, restore, delete, purge) |
| [`docs/backend/bot.md`](./backend/bot.md) | §5 Owner notice on schedule, bot as the entry point |
| [`docs/backend/dashboard-incidents.md`](./backend/dashboard-incidents.md) | §5 Dashboard, incidents, destination check |
| [`docs/backend/cron.md`](./backend/cron.md) | §5 The Cron tick as built |
| [`docs/backend/sources.md`](./backend/sources.md) | «Источники»: event classification, draft templates, owner notice |
| [`docs/backend/data-migrations.md`](./backend/data-migrations.md) | §6 Data and migrations |
| [`docs/backend/quotas.md`](./backend/quotas.md) | §7 Working quotas and cost |
| [`docs/backend/security.md`](./backend/security.md) | §8 Security and authentication |
| [`docs/backend/operations.md`](./backend/operations.md) | §9–15 CPU/memory, observability, testing, frontend contracts, changing modules, acceptance, sources |
