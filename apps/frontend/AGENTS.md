# apps/frontend/ — admin SPA rules

Stack (owner decision 03.10.2026; each library is added in the PR that first needs it): React 19 + Vite 8, TypeScript 6 (7 after 7.1); React Aria Components wrapped in `shared/ui` (skill `react-aria`); CSS Modules + tokens; TanStack Router (Zod `validateSearch`) + TanStack Query v5; React Hook Form 7 + `zodResolver`; TanStack Table v9 only for column/sort logic; `@internationalized/date` + `Intl`; a typed `ru.ts` copy dictionary, no i18n library; no global store; Vitest 4.1 + Testing Library + MSW 2; Playwright + axe. TanStack packages ship agent skills in `node_modules/@tanstack/*/skills/`: read the relevant SKILL.md (Table: v9 APIs only, never v8). Canonical design: `docs/FRONTEND_ARCHITECTURE.md` (§2 structure, §4 state, §6 network, §9 editor, §10 UI).

## Structure
- `src/app/`: router, providers, layouts, `styles/tokens.css`, global CSS. `styles/tokens.css` is the single token source (theme + accent selected by `app/theme.ts`).
- `src/pages/<page>/`: composes features and holds no data logic.
- `src/features/<feature>/`: `index.ts` (public API), `api/` (fetchers + `queryOptions` factories + hooks), `model/` (form schema, hooks), `ui/`, `tests/`. A feature never imports another feature; pages and `app/` compose features.
- `src/shared/`: `api/http-client.ts`, `ui/` primitives (owned by design-system), `lib/`. No business logic here.

## Code style
- Function components with named exports and `type Props = {…}`. Keys use stable ids, never the array index.
- Derive values during render. `useEffect` exists only to sync with an external system and always cleans up (AbortController, timers, subscriptions, `URL.revokeObjectURL`).
- Router loaders only prefetch (`queryClient.ensureQueryData`); TanStack Query stays the source of server state. Search params are parsed by the route's Zod schema with `.catch()` defaults.
- Only `features/*/api` talks to the network, through `shared/api/http-client.ts` (`Authorization: Bearer` from the in-memory session in `shared/api/session.ts`; one silent re-auth on 401).
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
- CSS Modules (`Component.module.css`) consume tokens only; style React Aria state through its `data-*` attributes (`[data-focus-visible]`, `[data-pressed]`, `[data-invalid]`). Add no other UI library. No raw hex or rgb and no ad-hoc sizes in features: a missing token or primitive is a request to design-system.
- Interaction patterns (dialog, confirm, toast, forms, tables, states, dates) follow the skill `ui-patterns`. Every screen implements the state matrix from the skill `page-spec`.
- Accessibility target is WCAG 2.2 AA:
  - semantic HTML first; ARIA only when no native element fits;
  - visible labels and focus, full keyboard use;
  - focus not hidden under sticky bars (2.4.11);
  - color never the only signal;
  - targets ≥ 24×24 CSS px (2.5.8), and 44×44 for primary and mobile controls by project choice.
- Responsive: quick check 375, 1280 and 1920 px; full matrix at the ui-qa gate (`docs/design/UX_SPEC.md` Conventions).

## Security
`VITE_*` values are public, so no secrets go there. Never use `dangerouslySetInnerHTML` for external content. The access token lives only in memory: never `localStorage`/`sessionStorage`. Logout clears the query cache.

## Telegram Mini App
The same SPA runs in a browser and as a Mini App. Only `src/shared/telegram/` touches `window.Telegram.WebApp` (inside Telegram = non-empty `initData`; never sniff the User-Agent). Theme follows Telegram `colorScheme` with our palette (neutrals + the owner's accent preset); pad with `max(env(safe-area-inset-*), var(--tg-content-safe-area-inset-*))`; BackButton follows router history; closing confirmation while a form is dirty; unsubscribe on unmount; guard features with `isVersionAtLeast`. Details: `docs/FRONTEND_ARCHITECTURE.md` §16.

## Tests and commands
Tests follow the skill `testing` (Testing Library queries: `getByRole` first, `getByTestId` last, with `userEvent`). Visual and accessibility checks follow the skill `visual-check`. Commands: `npm run dev|build|typecheck -w @alexeev/frontend`.
