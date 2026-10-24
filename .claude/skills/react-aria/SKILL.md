---
name: react-aria
description: "How to use React Aria Components in this project: wrap once in shared/ui, style via data-* attributes, fetch only the one component doc you need. Use when building or changing a shared/ui primitive or an accessible widget."
---
# React Aria Components

- Primitives wrap `react-aria-components` once in `apps/frontend/src/shared/ui/`; features use the wrappers, never RAC directly. Check existing wrappers first (`ls apps/frontend/src/shared/ui`).
- Style with CSS Modules and tokens through RAC state attributes: `[data-hovered]`, `[data-pressed]`, `[data-focus-visible]`, `[data-selected]`, `[data-disabled]`, `[data-invalid]`, `[data-placement]`.
- Docs: fetch only the component you need, e.g. `https://react-spectrum.adobe.com/react-aria/Select.md` (or context7 `react-aria-components`). Never load the whole library docs.
- Dates: `@internationalized/date` (`CalendarDateTime`, `ZonedDateTime`); store UTC, convert in the UI.
- Toast: `UNSTABLE_ToastRegion`/`UNSTABLE_ToastQueue`; one queue in `shared/ui`.
- Keyboard and ARIA come from RAC: don't add `role`/`aria-*` that RAC already sets; don't replace RAC focus handling with `onKeyDown` hacks.
