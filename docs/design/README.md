# ALEXEEV Studio admin: design entry point

**Status: Approved 08.10.2026** (owner approved the clickable prototype and `UX_SPEC.md`; real pages are rebuilt to match the prototype). Reference images and mockup packs were removed; they are no longer a source.

Substantive UI work follows `docs/AGENT_UI_WORKFLOW.md`. Owner reference images are reproduced visually exactly (layout, element shapes, sizes, spacing) with our colours, fonts and components (§ Reference fidelity there).

## Source of truth
1. [`UX_SPEC.md`](UX_SPEC.md): patterns, screens, flows, states, copy.
2. The prototype code at `/__proto` (dev-only): `apps/frontend/src/pages/prototypes`.
3. Tokens and primitives: `apps/frontend/src/app/styles/tokens.css`, `apps/frontend/src/shared/ui`.

Where they disagree, `UX_SPEC.md` wins for layout and patterns; publishing-safety rules in `docs/BACKEND_ARCHITECTURE.md` always win. Product scope is in `docs/PAGE_MAP.md`; AI/LLM functionality is not in scope.

## Opening the prototype
`npm run dev`, then http://localhost:5173/__proto. The «Состояние» switcher shows Данные / Загрузка / Пусто / Ошибка. `/__proto/index` lists every prototype screen. The prototype is not reachable in a production build.

## Visual rules (still binding)
- Calm operations: quiet cool neutrals, content carries the hierarchy, thin borders do the structure.
- Accent is sparse (about 5% of the UI): primary action, focus, selection, links, a meaningful chart series.
- No glow, no large gradients, restrained radii; panels are not a wall of floating cards.
- Status colours are muted and semantic; status is never colour only (text + icon).
- Skeletons keep the final geometry (header, toolbar, row count, row height, thumbnail boxes), so data arrival never shifts the layout.
- Density: desktop controls 34-36 px, rows 40-48 px, sidebar about 216-224 px (rail 56-64 px); touch targets 44 px.
- Responsive acceptance covers phone, tablet portrait/landscape, laptop and large desktop widths (320-1920 px+), with the 860 px composition breakpoint; widths to check and no-overflow rules: [`UX_SPEC.md`](UX_SPEC.md) Conventions.
- The colour constructor stays: 5 presets per theme plus up to 10 custom colours, light and dark separately.
- Type: Onest for UI (headings weight 650, letter-spacing −0.02em), JetBrains Mono for times, ids, revisions and counters (tabular figures); both self-hosted via `@fontsource-variable/*`, no third-party font request.
- Accent presets per theme: `cobalt` (default), `indigo`, `copper`, `orchid`, `mono`; exact values live only in `tokens.css`. Features never hard-code a colour: always a token.
- Status pill = icon + text + tinted fill; labels and the status → token mapping are canonical in skill `page-spec`.

## Design in code only (owner decision 03.10.2026, reaffirmed 07.10.2026)
Figma is not needed at all: no Figma tasks, exports, templates or handoff. Design exists only as tokens, `shared/ui` primitives, the `/__proto` prototype and browser screenshots. The dev-only route `/__catalog` (404 in production) shows every token and primitive state.

## Token layer as built (`apps/frontend/src/app/styles/tokens.css`)
- Selection by attributes on `<html>`: `data-theme="light|dark"`, `data-accent-light` / `data-accent-dark` = `cobalt|indigo|copper|orchid|mono|custom`. No attributes = dark + cobalt. `custom` reads `--custom-{light,dark}-{accent,accent-hover,accent-text,accent-soft,on-accent,focus-ring,accent-glow}`, which `src/app/theme.ts` injects from `shared/lib/color` `deriveAccent` (lightness moved until on-accent ≥ 4.5:1, accent text ≥ 4.5:1 and focus ring ≥ 3:1 on every surface). `applyAppearance()` applies it; the last appearance is cached in `localStorage` (`ui-appearance`, `ui-theme`) and replayed before React renders; the server setting stays the source of truth.
- Colors: `--color-bg`, `--color-surface-1|2|3`, `--color-border-subtle|strong`, `--color-text`, `-muted`, `-disabled`, `--color-danger`, `--color-scrim`, `--color-grid`; accent `--color-accent`, `-hover`, `-text`, `-soft`, `-glow`, `--color-on-accent`, `--color-focus-ring`; status `--color-status-{pending,active,done,retry,failed,unknown,muted}-{fg,bg,ring}`; Telegram preview `--color-chat-bg`, `--color-bubble`, `-text`, `-meta`, `-link`; `--shadow-card` (`none`), `--shadow-pop`; `--color-selected-bg`.
- Scales: `--font-body|mono`, `--font-size-2xs|xs|sm|md|lg|xl|display`, `--font-weight-*`, `--letter-spacing-heading|display`, `--space-1..8`, `--radius-1|2|3|pill` (7/8/9/999), `--size-target` 44, `--size-target-min` 24, `--size-control` / `--size-control-sm` / `--size-row` / `--size-topbar` (fine pointer 36/30/48/48 px; coarse pointer or < 860 px 44/44/52/56 px), `--size-sidebar` 216, `--size-sidebar-collapsed` 56, `--measure-reading` 760, `--motion-fast|base` (0 under reduced motion), `--z-sticky|nav|overlay|modal|toast`.
- `tokens.test.ts` measures every preset and status contrast from the real file.
