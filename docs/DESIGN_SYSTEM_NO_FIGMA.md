# ALEXEEV — design exclusively in code

**Owner decision, 2026-10-03:** Figma is entirely excluded; no mockups, exports, paid seats or intermediate handoff. The current source of tokens remains `apps/frontend/src/tokens.css` until the single planned move to `apps/frontend/src/app/styles/tokens.css`; never maintain both as independent sources.

## Approved design direction
- **Visual language:** calm monochrome, light/dark themes, no bright brand accents. Use color for errors, destructive actions and the `unknown` state, always with text/icon. The old acid/green placeholder palette is not the approved final design.
- **Component foundation:** React Aria Components wrapped in `apps/frontend/src/shared/ui`, styled with CSS Modules and semantic CSS variables. No second general-purpose UI library. Use native elements when appropriate.
- **Frontend infrastructure:** TanStack Router + Query; React Hook Form and Zod; responsive web SPA and Telegram Mini App served by the **same Worker**.

## Designer's deliverables
1. Version-controlled semantic tokens: bg/surface/text/focus/status, typography, spacing, radius, motion, density, contrast and theme. Do not introduce arbitrary per-page hex values.
2. Typed, accessible primitives: input, button, dialog, toast, selectable lists, tables and status/empty/error states **only when a real screen requires them**. React Aria state attributes and accessibility behavior are part of the component contract.
3. Page states and mobile behavior from `docs/PAGE_MAP.md` and the `page-spec` skill; design role owns tokens/primitives, frontend owns feature composition.
4. Actual browser screenshots of stable fixtures at 375 px and 1280 px; Playwright/axe and keyboard checks. The planned `/__catalog` development route may expose all primitive states without Storybook when implemented; do not claim it exists before testing.

## Execution
Main-session orchestrator → product-analyst only if requirements unclear → design-system if tokens or primitives are missing → frontend → deterministic checks and targeted QA. Do not serialize independent backend/frontend work once the shared contract is fixed.

**Authoritative agent instructions:** `.agents/roles/design-system.md` and skills `visual-design`, `ui-patterns`, `page-spec`, `visual-check`, `react-aria`. `.claude/` and `.codex/` are generated adapters; never maintain standalone copies in `agents/`.
