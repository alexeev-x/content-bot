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
