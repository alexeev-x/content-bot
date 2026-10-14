# ALEXEEV Studio admin: UX spec

Status: **Approved 08.10.2026** for flows, states and copy. Visual look: Cloudflare-dashboard direction (owner, 14.10.2026; `docs/design/README.md`). The `/__proto` prototype was removed on 14.10.2026; mentions of it below are history. Expert review, not validated with users; the owner's words and the existing stories are the primary evidence. Scope: only screens and routes that exist now. Anything needing a missing API is marked **API need**; future items are marked **Later** and are never drawn as working.

Inputs: `docs/design/README.md` (visual rules) and `docs/PAGE_MAP.md`. Publishing-safety rules in `docs/BACKEND_ARCHITECTURE.md` and skill `publishing-reliability` always win.

Conventions: responsive on every route from 320 px phones to 1920 px+ desktops. **Viewport checks:** 375 and 1280 px (plus 1920 for wide tables) via `npm run shots -w @alexeev/frontend`; no horizontal page scroll down to 320 px; composition breakpoint 860 px.

**Index.** Split by screen and topic; open only the file you need. Section numbers (§) are kept.

| File | Sections |
|---|---|
| [`docs/design/ux/decisions.md`](./ux/decisions.md) | §0 Decisions at a glance |
| [`docs/design/ux/shell.md`](./ux/shell.md) | §1 Shell: desktop, compact, states |
| [`docs/design/ux/patterns.md`](./ux/patterns.md) | §2 Pattern system: header, controls, toolbar, table vs card, state matrix, skeletons, status chip, destructive actions |
| [`docs/design/ux/overview.md`](./ux/overview.md) | §3.1 Обзор `/` |
| [`docs/design/ux/posts.md`](./ux/posts.md) | §3.2–3.3 Посты, редактор поста |
| [`docs/design/ux/publications.md`](./ux/publications.md) | §3.4–3.5 Публикации, инциденты и сверка |
| [`docs/design/ux/settings-login.md`](./ux/settings-login.md) | §3.6–3.8 Настройки, вход, 404 / «Раздел в разработке» |
| [`docs/design/ux/sources.md`](./ux/sources.md) | §3.9 Источники и разбор события |
| [`docs/design/ux/media.md`](./ux/media.md) | §3.10 Медиатека |
| [`docs/design/ux/flows.md`](./ux/flows.md) | §4 Key flows, §5 API needs |
| [`docs/design/ux/previews.md`](./ux/previews.md) | §6 Former preview specs (analytics, calendar, automations…; history, prototype removed 14.10.2026) |
