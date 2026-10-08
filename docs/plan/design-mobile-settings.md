# Design, mobile and settings

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

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

Design reference: `docs/design/UX_SPEC.md` and the prototype at `/__proto` (approved 08.10.2026).

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
