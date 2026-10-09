# Design, mobile and settings

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 22. Design system and visual direction

Approved 08.10.2026 as «Calm Operations»: `docs/design/UX_SPEC.md` and `docs/design/README.md` are the visual source; the dev-only prototype at `/__proto` mirrors it; colour constructor kept. Theme «system» mode and a real-device touch test of widget drag remain open.

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

Geometry (sidebar, control and row sizes): `docs/design/README.md` and `docs/design/UX_SPEC.md`.

Design reference: `docs/design/UX_SPEC.md` and the prototype at `/__proto` (approved 08.10.2026).

Each major visual redesign gets screenshot references across the canonical responsive viewport matrix in `docs/design/UX_SPEC.md` Conventions (phone, tablet portrait/landscape, laptop, desktop), not just one desktop and one mobile width.

## 23. Mobile / Telegram Mini App

Phone-first work must also remain usable on tablet, laptop and desktop: all routes pass the canonical viewport matrix and no-overflow rules in `docs/design/UX_SPEC.md` Conventions. The widths below describe phone-specific behavior, not the whole product acceptance range.

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
