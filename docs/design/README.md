# ALEXEEV Studio admin: design entry point

**Status: Approved 08.10.2026** (owner approved the clickable prototype and `UX_SPEC.md`; real pages are rebuilt to match the prototype). Reference images and mockup packs were removed; they are no longer a source.

## Autonomous UI delivery
Substantial UI changes follow `docs/AGENT_UI_WORKFLOW.md`: UX → mock-only clickable prototype in `/__proto` → independent ui-qa → production frontend → ui-qa. The existing approved 08.10 visual system remains authoritative. Owner-supplied screenshots are task layout/interaction references, not automatic overrides of tokens. Routine QA can accept a prototype without the owner; no prototype may perform real API mutations.

## Source of truth
1. [`UX_SPEC.md`](UX_SPEC.md): patterns, screens, flows, states, copy.
2. The prototype code at `/__proto` (dev-only): `apps/frontend/src/pages/prototypes`.
3. Tokens and primitives: `apps/frontend/src/app/styles/tokens.css`, `apps/frontend/src/shared/ui`.

Where they disagree, `UX_SPEC.md` wins for layout and patterns; publishing-safety rules in `docs/stories/*` stay authoritative. Product scope is in `docs/PAGE_MAP.md`; AI/LLM functionality is not in scope.

## Opening the prototype
`npm run dev`, then http://localhost:5173/__proto. The «Состояние» switcher shows Данные / Загрузка / Пусто / Ошибка. `/__proto/index` lists every prototype screen. The prototype is not reachable in a production build.

## Visual rules (still binding)
- Calm operations: quiet cool neutrals, content carries the hierarchy, thin borders do the structure.
- Accent is sparse (about 5% of the UI): primary action, focus, selection, links, a meaningful chart series.
- No glow, no large gradients, restrained radii; panels are not a wall of floating cards.
- Status colours are muted and semantic; status is never colour only (text + icon).
- Skeletons keep the final geometry (header, toolbar, row count, row height, thumbnail boxes), so data arrival never shifts the layout.
- Density: desktop controls 34-36 px, rows 40-48 px, sidebar about 216-224 px (rail 56-64 px); touch targets 44 px.
- Responsive acceptance covers phone, tablet portrait/landscape, laptop and large desktop widths (320-1920 px+), not only the legacy 375/1280 screenshot pair. The canonical viewport matrix, 860 px composition breakpoint and no-overflow rules are in [`UX_SPEC.md` §1](UX_SPEC.md).
- The colour constructor stays: 5 presets per theme plus up to 10 custom colours, light and dark separately (`docs/stories/settings.md`).
- No Figma; design exists only as code (`docs/DESIGN_SYSTEM_NO_FIGMA.md`).
