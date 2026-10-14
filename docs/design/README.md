# ALEXEEV Studio admin: design entry point

**Direction: Cloudflare-dashboard look (owner, 14.10.2026).** References: `design-refs/нравится/` (liked), `design-refs/test/` (the old look, for contrast). Flows, states and copy stay in [`UX_SPEC.md`](UX_SPEC.md).

## Source of truth
1. [`UX_SPEC.md`](UX_SPEC.md): patterns, screens, flows, states, copy.
2. Tokens and primitives: `apps/frontend/src/app/styles/tokens.css`, `apps/frontend/src/shared/ui`.
3. Screenshots of the real app: `npm run shots -w @alexeev/frontend` → `.logs/shots/` (main pages, 375/1280, dark/light, mock data).

Publishing-safety rules in `docs/BACKEND_ARCHITECTURE.md` always win. Product scope is in `docs/PAGE_MAP.md`; AI/LLM functionality is not in scope.

## Visual rules
- Content column is centred, max `--measure-content` (1200 px), with side margins on large monitors (owner, 14.10.2026).
- Layered near-neutral greys: page `--color-bg`, panels `--color-surface-1`, hover/header strips `--color-surface-2`. Decorative borders are hairlines (`--color-border-subtle`); only controls get `--color-border-strong`.
- Panels: a title row (regular-weight title, optional link/arrow on the right), then rows or metrics; no nested cards.
- Tables are the core surface: left-aligned, 44 px rows, one line per cell where possible, muted header labels.
- Tabs are a bordered segmented group; the selected item is raised with an edge.
- Accent is sparse: primary button (saturated blue, white text), focus, selection, links, chart lines.
- Status = icon + text on a soft tinted fill, flat 6 px corners, no ring.
- Type: Onest; headings weight 600, page title 20 px; times and counters use tabular figures in the body face; JetBrains Mono only for ids and code.
- Skeletons keep the final geometry, so data arrival never shifts the layout.
- Touch targets 44 px on touch/narrow screens; desktop controls 36 px.
- Accent: one of 8 presets (blue default, orange, violet, teal, green, pink, red, graphite), the same for both themes; no custom colours (owner, 14.10.2026). Density: «Обычно / Компактно» per device.

## Design in code only (owner decision 03.10.2026, reaffirmed 07.10.2026)
Figma is not needed at all: no Figma tasks, exports, templates or handoff. Design exists only as tokens, `shared/ui` primitives and browser screenshots. The dev-only route `/__catalog` (404 in production) shows every token and primitive state.

## Token layer as built (`apps/frontend/src/app/styles/tokens.css`)
- Selection by attributes on `<html>`: `data-theme="light|dark"`, `data-accent="blue|orange|violet|teal|green|pink|red|graphite"` (no attribute = blue), `data-density="compact"` (fine pointer ≥ 860 px only). `src/app/theme.ts` `applyAppearance()` sets them; the last appearance is cached in `localStorage` and replayed before React renders; the server setting stays the source of truth. Server preset ids map: cobalt=blue, indigo=violet, copper=orange, orchid=pink, mono=graphite, teal, green, red (`shared/lib/color/accent-presets.ts`).
- Colors: `--color-bg`, `--color-surface-1|2|3`, `--color-border-subtle|strong`, `--color-text`, `-muted`, `-disabled`, `--color-danger`, `--color-scrim`, `--color-grid`; accent `--color-accent`, `-hover`, `-text`, `-soft`, `-glow`, `--color-on-accent`, `--color-focus-ring`; status `--color-status-{pending,active,done,retry,failed,unknown,muted}-{fg,bg,ring}`; Telegram preview `--color-chat-bg`, `--color-bubble`, `-text`, `-meta`, `-link`; `--shadow-card` (`none`), `--shadow-pop`; `--color-selected-bg`.
- Scales: `--font-body|mono`, `--font-size-2xs|xs|sm|md|lg|xl|display`, `--font-weight-*`, `--letter-spacing-heading|display`, `--space-1..8`, `--radius-1|2|3|4|pill` (6/6/8/10/999), `--size-target` 44, `--size-target-min` 24, `--size-control` / `--size-control-sm` / `--size-button` / `--size-button-sm` / `--size-row` / `--size-topbar` (fine pointer 36/36/36/34/44/52 px; coarse pointer or < 860 px 44/44/44/44/52/56 px), `--size-sidebar` 232, `--size-sidebar-collapsed` 56, `--measure-reading` 760, `--motion-fast|base` (0 under reduced motion), `--z-sticky|nav|overlay|modal|toast`.
