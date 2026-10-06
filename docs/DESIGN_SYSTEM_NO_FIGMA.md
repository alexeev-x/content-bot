# ALEXEEV — design in code only

**Owner decision 03.10.2026: Figma is not needed at all.** Exclude Figma tasks, exports, licenses and handoff. Single source of truth: `apps/frontend/src/app/styles/tokens.css` (until the move — `apps/frontend/src/tokens.css`, a single source), `apps/frontend/src/shared/ui`, and the pages and their states in the repository.

## Designer artifacts
1. `tokens.css`: semantic colors, type scale, spacing, radius, elevation, motion, breakpoint usage; light/dark and Telegram theme mapping where needed.
2. Primitives: Button, Input, Select, Dialog, Toast, StatusBadge, Table, Tabs, and error/empty states. A component has public props, keyboard behavior, and loading/disabled/invalid examples.
3. `docs/PAGE_MAP.md`: routes, actions, loading/empty/error/401/403/409/unknown states and mobile layout.
4. Screenshot acceptance reference from a real browser render, Playwright diff on stable fixture data.

## Handoff to frontend
Analyst → page spec → Design System Agent (tokens + reusable components) → Frontend (feature composition) → QA (browser screenshots + accessibility). Frontend never waits for a drawn mockup; if a component is missing, it proposes a contract to the designer. Do not use random hex values in each feature. Keep the brand accent as a variable until the owner explicitly approves the color.

## Quality
Contrast and keyboard access per WCAG 2.2 AA as a target; focus, aria, Telegram Mini App safe areas, mobile/desktop, reduced motion, touch target sizes. Screenshot diff complements semantic tests but does not replace them.

## Executable artifacts (for agents)
The `design-system` role (`.agents/roles/design-system.md`); visual direction — skill `visual-design` (adapted from Anthropic `frontend-design`); interaction patterns — skill `ui-patterns`; page specification — skill `page-spec`; visual verification — skill `visual-check`. Owner decision: monochrome dark and light themes without bright accents; the current palette (`#0c0c0d` + `#d5f15b`) is to be replaced. The UI library will be chosen separately. Component catalog — the dev route `/__catalog` with all primitive states (no Storybook, so that screenshots and axe check the same components as in the product). Component styles — CSS Modules, only via tokens.

## Approved visual direction (owner decision 06.10.2026)
Reference: `docs/design/studio-reference.html` (open in a browser; static example, not product code) and its screenshots `docs/design/studio-reference-light.png`, `docs/design/studio-reference-dark.png` (desktop 1360 px and phone 375 px; regenerate after changing the reference). The owner compared four monochrome directions on the real dashboard and chose a hybrid: **dense operator layout on desktop** (Linear/Plain-like) **plus large touch targets on phone and Mini App** (Raycast/Things-like). Rejected: top-tab navigation (does not fit 10+ sections), soft shadowed card layout on desktop, serif headings.
- Type: Onest 400/500/600, self-hosted (no font CDN at runtime); tabular figures for times and counts. Scale 12 caption / 13 body / 15 section / 20 page title; phone body 15, page title 24.
- Sizes: desktop row 36, control 32, sidebar 224; phone control ≥ 44, list row ≥ 56, bottom tab bar ≥ 52 plus safe area.
- Radii: desktop 6 controls, 8 containers; phone 10 controls, 12 containers; status badges become pills on phone.
- Surfaces: background, sidebar and surface differ by a step of grey with 1 px borders; no shadows except overlays (menu, popover, dialog, toast). Lists and tables are rows on hairlines, not card grids.
- Navigation: desktop sidebar with grouped items and attention counters; phone header plus a 5-item tab bar (Обзор, Посты, Календарь, Инциденты, Ещё). Same capabilities on both.
- Status: icon plus text always; color only for «Ошибка» and «Требует проверки». An `unknown` send gets an attention banner on the dashboard linking to reconciliation.
- Environment: a dashed DEV label in the sidebar footer and the phone header.
- Search and commands: a «Поиск ⌘K» entry in the page header on desktop, an icon button on phone.
Deviations from the reference need an owner decision; refine values in `tokens.css`, not per feature.
