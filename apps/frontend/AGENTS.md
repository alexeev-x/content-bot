# apps/frontend/ — admin SPA rules

Stack: React 19, TypeScript strict, Vite. The architecture adds React Router, TanStack Query v5, React Hook Form + Zod (`@hookform/resolvers`, pinned and tested with Zod 4), Vitest + Testing Library + MSW v2, and Playwright, each in the PR that first needs it. Canonical design: `docs/FRONTEND_ARCHITECTURE.md` (§2 structure, §4 state, §6 network, §9 editor, §10 UI).

## Structure
- `src/app/`: router, providers, layouts, `styles/tokens.css`, global CSS. The single token source still lives at `src/tokens.css` until the design-system foundation task moves it.
- `src/pages/<page>/`: composes features and holds no data logic.
- `src/features/<feature>/`: `index.ts` (public API), `api/` (fetchers + `queryOptions` factories + hooks), `model/` (form schema, hooks), `ui/`, `tests/`. A feature never imports another feature's internals.
- `src/shared/`: `api/http-client.ts`, `ui/` primitives (owned by design-system), `lib/`. No business logic here.

## Code style
- Function components with named exports and `type Props = {…}`. Keys use stable ids, never the array index.
- Derive values during render. `useEffect` exists only to sync with an external system and always cleans up (AbortController, timers, subscriptions, `URL.revokeObjectURL`).
- Only `features/*/api` talks to the network, through `shared/api/http-client.ts` (same-origin credentials, CSRF header on mutations).
- Where state lives:
  - server data → TanStack Query (hierarchical key factories, explicit `staleTime`);
  - forms → React Hook Form + `zodResolver`;
  - filters and pages → URL search params;
  - open/closed and tabs → local state;
  - no global store.
- Mutations set `retry: false` and invalidate only after a server success. Publishing is never optimistic: no `useOptimistic` or optimistic cache writes for publish, cancel or retry. `202` shows the returned status label (usually «Запланировано», mapping in skill `page-spec`), «Опубликовано» requires `sent` + `externalMessageId`, and `unknown` disables retry and cancel. The reason: a false success here means a duplicate or missing post in a public channel.
- Polling: TanStack's `refetchIntervalInBackground` defaults to false. Keep it that way and test that polling stops when the tab is hidden or the component unmounts.
- Routes are lazy-loaded. Keep heavy dependencies off the first screen.

## Styling and UI
- Styling is provisional until the owner picks the UI library: use CSS Modules (`Component.module.css`) that consume tokens only, and never install a UI library on your own. No raw hex or rgb and no ad-hoc sizes in features: a missing token or primitive is a request to design-system.
- Interaction patterns (dialog, confirm, toast, forms, tables, states, dates) follow the skill `ui-patterns`. Every screen implements the state matrix from the skill `page-spec`.
- Accessibility target is WCAG 2.2 AA:
  - semantic HTML first; ARIA only when no native element fits;
  - visible labels and focus, full keyboard use;
  - focus not hidden under sticky bars (2.4.11);
  - color never the only signal;
  - targets ≥ 24×24 CSS px (2.5.8), and 44×44 for primary and mobile controls by project choice.
- Layouts must work at 375 px and 1280 px.

## Security
`VITE_*` values are public, so no secrets go there. Never use `dangerouslySetInnerHTML` for external content. No sessions or blobs in `localStorage`. Logout clears the query cache.

## Tests and commands
Tests follow the skill `testing` (Testing Library queries: `getByRole` first, `getByTestId` last, with `userEvent`). Visual and accessibility checks follow the skill `visual-check`. Commands: `npm run dev|build|typecheck -w @alexeev/frontend`.
