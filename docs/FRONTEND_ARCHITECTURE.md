# CONTENT-BOT — FINAL FRONTEND ARCHITECTURE v1.0

**Date:** 03.10.2026 · **Status:** approved technical direction; the application is not yet implemented · **Product:** ALEXEEV Studio admin panel (working name), `apps/frontend/` in `content-bot`. Backend: `docs/BACKEND_ARCHITECTURE.md`.

> ALEXEEV Studio is the **primary full product control plane**, not a public SEO site and not a reduced admin MVP. SSR, Next.js, micro-frontends and heavy global state management are not needed at the start. The interface must provide polished browser/mobile control over content, publications, automations, sources/media/templates, operations, settings and analytics while preserving publishing safety.

## 0. Approved stack (owner decision 03.10.2026)

Chosen by three criteria: AI-friendliness (llms.txt, markdown documentation, official skills/MCP, API stability), documentation quality, flexibility. Replaces the table rows of §1 and the Pages/BFF scheme from §1 and §6.

| Layer | Choice | Fallback |
|---|---|---|
| UI components | React Aria Components, wrapped in `shared/ui` | HeroUI v3 |
| Styles | CSS Modules + CSS variables (dark/light themes, switchable accent presets) | Tailwind v4 |
| Router | TanStack Router (typed search params via Zod) | React Router 8 |
| Server state | TanStack Query v5 | SWR |
| Forms | React Hook Form 7 + Zod 4 (`^7`, v8 is in beta) | TanStack Form |
| Tables | React Aria Table / `<table>` + TanStack Table v9 for columns and sorting | custom table |
| Dates | `@internationalized/date` + `Intl` | date-fns 4 + tz |
| Texts | typed dictionary `ru.ts` + `Intl`, no i18n library | Lingui |
| Global state | none | Zustand |
| Build and hosting | Vite 8 + `@cloudflare/vite-plugin`; one Worker serves the SPA, `/api/*` and the bot webhook (no Pages and no BFF) | — |
| Telegram Mini App | the same SPA; a thin typed wrapper over `window.Telegram.WebApp` (no third-party SDK), see §16 | `@tma.js/sdk` |
| Sign-in | Mini App — `initData`; browser — «Войти через Telegram» (Telegram Login Widget); token in memory, in `Authorization: Bearer` | — |
| TypeScript | 6.x; move to 7.1 once linters get the API | TS 7 via compatibility package |
| Linter / formatter | Oxlint + Prettier | Biome |
| Tests | Vitest 4.1 (one version across the whole repository until the Cloudflare plugin supports 5) + Testing Library + MSW 2; Playwright + axe (`verify:e2e`) | — |
| Module boundaries | dependency-cruiser | — |

## 1. Library replacement rules

The choice of libraries is a technical decision for the start, not a license or pricing guarantee for the future. Pin specific versions in the lockfile after the repository is created; do not install latest blindly.

## 2. Architecture by functional area

We do not create one giant `components/` folder with all the code, but we also do not fully copy the complex Feature-Sliced Design with many artificial layers. We use a lightweight feature-first structure:

```text
apps/frontend/
├── public/
│   └── icons/
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx                   # router + top-level providers
│   │   ├── router.tsx                # lazy route definitions
│   │   ├── query-client.ts
│   │   ├── layouts/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── AuthLayout.tsx
│   │   │   └── PageErrorBoundary.tsx
│   │   └── styles/
│   │       ├── tokens.css            # colors, spacing, typography
│   │       └── global.css
│   ├── pages/                         # screen assembly, minimal business logic
│   │   ├── dashboard/DashboardPage.tsx
│   │   ├── posts/PostsPage.tsx
│   │   ├── editor/PostEditorPage.tsx
│   │   ├── calendar/CalendarPage.tsx
│   │   ├── media/MediaPage.tsx
│   │   ├── incidents/IncidentsPage.tsx
│   │   ├── settings/SettingsPage.tsx
│   │   └── login/LoginPage.tsx
│   ├── features/                      # functional slices
│   │   ├── posts/
│   │   │   ├── index.ts              # public API of the feature
│   │   │   ├── api/posts-api.ts      # API functions from the shared client
│   │   │   ├── api/posts-queries.ts  # query keys, query/mutation hooks
│   │   │   ├── model/editor-schema.ts
│   │   │   ├── model/use-post-editor.ts
│   │   │   ├── ui/PostList.tsx
│   │   │   ├── ui/PostEditor.tsx
│   │   │   ├── ui/UnsavedChangesGuard.tsx
│   │   │   └── tests/
│   │   ├── calendar/ ...
│   │   ├── media/ ...
│   │   ├── monitoring/ ...
│   │   ├── auth/ ...
│   │   └── settings/ ...
│   ├── entities/                      # real shared entities, create as needed
│   │   ├── post/ ...
│   │   └── incident/ ...
│   ├── shared/
│   │   ├── api/
│   │   │   ├── http-client.ts        # fetch, Bearer token, re-sign-in on 401, requestId
│   │   │   ├── api-errors.ts
│   │   │   └── query-keys.ts
│   │   ├── ui/                        # Button, Input, Dialog, Toast, DataTable
│   │   ├── lib/                       # format-date, format-error, download
│   │   └── hooks/                     # only truly shared hooks
│   └── test/
│       ├── setup.ts
│       ├── msw-handlers.ts
│       └── fixtures.ts
├── tests/e2e/
├── package.json
├── vite.config.ts
└── tsconfig.json

apps/contracts/
├── src/index.ts
├── src/posts.ts                   # Zod API DTO
├── src/incidents.ts
├── src/media.ts
├── src/errors.ts
└── package.json
```

**Import rules:** `app` wires up pages and providers; `pages` compose `features`, `entities`, `shared`; one feature does not import the internals of another. If two features need the same type — move a real shared entity into `entities` or `contracts`, but do not turn `shared` into a dumping ground for business logic. Public exports go through `index.ts`; deep imports are forbidden. CI checks all dependency graphs.

## 3. Structure of a single feature, using `posts` as an example

- `api/posts-api.ts`: thin functions `listPosts`, `getPost`, `createDraft`, `saveRevision`, `schedulePost`, returning DTOs; no React imports.
- `api/posts-queries.ts`: `queryOptions`, `useMutation`, `invalidateQueries` only after a successful server response. Exception: after a failed mutation whose server side may have partly changed (e.g. bot connect), re-read the affected query; this is a refetch of server state, never an optimistic write. For important operations (publish/retry) **do not do optimistic success**.
- `model/editor-schema.ts`: Zod schema of the editor form, differing from the server DTO only where there is UI specificity; do not duplicate server business validation.
- `model/use-post-editor.ts`: draft lifecycle, dirty state, revision version, handling of the 409 conflict.
- `ui/PostEditor.tsx`: form fields + accessibility, no direct `fetch`.
- `ui/UnsavedChangesGuard.tsx`: navigation guard for unsaved changes.
- `tests/`: editor behavior, loading/error/conflict/unknown states.

Removing a feature should require changes only to `app/router.tsx`, `app/navigation.ts` and the corresponding slice. Do not create cross-imports of the calendar from the editor's internals: the calendar works with the same public API DTOs.

## 4. Proper state separation

| State | Where to store | Example |
|---|---|---|
| Server | TanStack Query | publications, list of heroes, incidents, profiles |
| URL | TanStack Router search params (route Zod schema) | filter `?status=failed`, page, search, period |
| Form | React Hook Form | title, text, hero, time, media |
| Transient UI | local `useState` | modal window, tab, focus |
| Account | `GET /api/v1/auth/me` + Query | displaying the user and permissions; the server always re-checks |
| User settings | server DB via API | timezone, enabled rubrics; only appearance is local |

Do not copy server objects into Zustand/Redux/Context without real need. Do not use `useEffect` for values computed from props. Avoid `useEffect -> setState -> useEffect` chains. Context is acceptable for a lightweight theme/accessibility, but not as a universal event bus.

By default, Query treats data as stale immediately, inactive queries are usually kept in memory for five minutes and are refetched on focus/reconnect. Set an explicit `staleTime` for lists/reference data; on the incidents screen enable 15–30 second polling **only when the tab is visible**, and do not use polling on other screens. Limit pagination parameters (for example, 25–50 records) and the volume of cached images. The UI must not become an in-memory copy of D1.

```ts
// features/posts/api/posts-queries.ts — example
export const postKeys = {
  all: ['posts'] as const,
  list: (filters: PostFilters) => ['posts', 'list', filters] as const,
  detail: (id: string) => ['posts', 'detail', id] as const,
};

export function useSavePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savePost,
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: postKeys.all });
      void qc.invalidateQueries({ queryKey: postKeys.detail(id) });
    },
  });
}
```

## 5. Shared API contract and protection against desynchronization

`contracts` contains versions of shared Zod schemas and TypeScript DTOs (JSON-only). This is **not** shared business-logic code and not an ORM. Frontend and backend import the same types for responses and requests, but the server validates every change independently.

Examples: `PostDto`, `CreateDraftInput`, `SaveRevisionInput`, `PublicationDto`, `IncidentDto`, `ApiErrorDto`, `PageDto<T>`. `GET /api/v1/posts?cursor=...`, `POST /api/v1/posts`, `PATCH /api/v1/posts/:id` with a revision (409 on a stale one), `POST /api/v1/publications/:id/retry` — only a confirmed safe operation.

```ts
// apps/contracts/src/posts.ts
import { z } from 'zod';

export const postDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  revision: z.number().int().nonnegative(),
  status: z.enum(['draft', 'approved', 'scheduled']),
  updatedAt: z.iso.datetime(),
});
export type PostDto = z.infer<typeof postDtoSchema>;
```

`ApiError` — stable codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `CONFLICT`, `NOT_FOUND`, `RATE_LIMIT`, `UNAVAILABLE`, `UNKNOWN_SEND_RESULT`; the message text may be localized, the code does not change. The UI for 401 leads to sign-in; 403 shows the lack of permission; 409 keeps local edits and opens a version comparison dialog; 429 shows the retry time; 500/503 show the requestId and a retry button **only for a safe request**.

## 6. Network layer and security

```text
Browser or Telegram Mini App → https://<domain>/api/v1/*   (same Worker, same origin)
                             → Hono: Bearer token check → modules → D1
```

**Sign-in (one identity — the owner's Telegram ID):**
- **Mini App:** on launch the client sends `Telegram.WebApp.initData` to `POST /api/v1/auth/telegram` and receives an access token (60 minutes). While the token is valid, the client renews it via `POST /api/v1/auth/refresh` with the current token; a Mini App session lives no longer than 12 hours. `initData` is valid for sign-in only 15 minutes after launch, so after the session expires the Mini App must be opened from the bot again.
- **Browser:** `/login` embeds the official Telegram Login Widget (`telegram.org/js/telegram-widget.js`, no `data-onauth`/`data-auth-url`: the app listens for the widget's `auth_user` message from the `oauth.telegram.org` iframe (exact origin and iframe-window check; not `data-onauth`, which needs `unsafe-eval`), so the signed data never lands in a URL) → the client POSTs the whole user object unchanged as JSON to `POST /api/v1/auth/telegram-widget` → the server answers with an access token and sets the refresh cookie. Later renewals use `POST /api/v1/auth/refresh` with the cookie, one request at a time (a parallel refresh with a rotated cookie revokes the session). CSP for `/login` must allow the widget script and its `oauth.telegram.org` frame.

**Storage:** the access token is **in memory only** (module `shared/api/session.ts`), never in `localStorage`/`sessionStorage`. Reason: the Telegram Web Mini App runs inside a frame where third-party cookies are blocked, so a cookie cannot be the basis. The refresh cookie (`HttpOnly; Secure; SameSite=Lax`, path `/api/v1/auth`) exists only in the browser scenario.

```ts
// shared/api/http-client.ts — compact example
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken()}`, ...init.headers },
  });
  if (response.status === 401) return session.reauthenticate().then(() => apiRequest<T>(path, init)); // once
  if (!response.ok) throw await mapApiError(response);
  return response.json() as Promise<T>;
}
```

The main API does not accept cookies, so a CSRF token is not needed; the server protects the `/api/v1/auth/*` endpoints that use cookies by checking `Origin`. The bot token and third-party API keys exist only on the server; `import.meta.env.VITE_*` is always public. Logout deletes the session on the server and clears the Query cache. Do not inject HTML from external sources via `dangerouslySetInnerHTML`; show text by default. Re-authentication on 401 — at most one attempt, then the sign-in screen (in the Mini App — the message «откройте заново из бота»).

## 7. Routes, loading and screen fault tolerance

```text
/login                  owner sign-in (Mini App sign-in is automatic)
/                       dashboard: activity, upcoming publications, automation health
/posts                  content library
/posts/new              full content editor
/posts/:id              editor, revisions, preview and publication history
/publications           publication history/control
/publications/:id       publication timeline and reconciliation
/calendar               schedule, reschedule/cancel
/automations            rubrics and automation health/control
/automations/:id        rubric rules, sources and run history
/sources                source health/provenance
/media                  media library
/templates              visual templates
/jobs                   execution history
/incidents              errors and unknown Telegram reconciliation
/analytics              publishing/automation/content intelligence
/settings/*             channels, integrations, defaults, appearance
/*                      NotFound
```

Lazy loading per route (`React.lazy` or lazy route modules), a shared lightweight layout. Every independent screen has `loading`, `empty`, `error`, `unauthorized`, `ready`; separate error boundaries prevent the whole admin panel from crashing, but do not replace HTTP error handling. Tables with pagination and accessible keyboard actions; do not load all 10,000 rows into memory. A partial result is allowed for the dashboard: a broken chart must not hide a critical send error. The incidents tab must show a stale label with the time of the last update.

## 8. Image previews and media handling

- Source hero images are provided by the owner; the editor uploads them with checks of type, size and allowed resolution. Do not put blob/base64 in localStorage or TanStack Query.
- For file previews use `URL.createObjectURL(file)` only before upload and always call `URL.revokeObjectURL()` on replacement/unmount so as not to hold memory.
- Media library — pagination + server thumbnails; `loading="lazy"` for lists, separate full-size files only on request. Metadata in D1, binary objects in R2.
- The preview of the final card must use **the same server renderer/template** as the publication: `POST /api/v1/media/preview`, not a separate copy of the markup in the browser. For speed, an approximate mockup may be shown locally, but before publication the actual PNG must be displayed. Rendering of heavy cards is asynchronous, protected against abuse and limited by quotas.
- If the renderer is unavailable, show a fallback and explicitly mark that the image was not created; do not present a sample as the real result.

## 9. Editor and calendar without data loss

- React Hook Form holds local values; the server receives only `Save`/a controlled debounce of **drafts**; do not send a request on every keystroke.
- On a field change set the dirty flag and enable a warning on navigation/close. `beforeunload` is not guaranteed on mobile: additionally a «Сохранить» button, the status of the latest edits, and a local in-memory buffer until the page is closed (without promising recovery after a crash).
- For concurrent edits — a revision; a 409 response does not overwrite another editor's data and offers to compare/reload.
- Publication is a separate two-step operation: preview -> explicit confirm -> the server creates a `publication`/job. The UI does not show «Опубликовано» until the backend returns `sent` and `externalMessageId`; after 202 Accepted — the label of the returned status (usually «Запланировано») and background updates.
- Cancel/retry are unavailable for `unknown` until manual verification. For an unknown result — a separate incident screen and a clear warning about the risk of a duplicate.
- In the calendar all dates are user dates, the server receives UTC ISO 8601 and an explicit IANA timezone (for example, `Europe/Chisinau`), DST is taken into account. Do not rely on text dates from the browser locale.

## 10. UI/UX and design system

- **Owner decision 06.10.2026 (supersedes the 03.10.2026 monochrome rule):** approved direction «modern» with one accent, cobalt by default — `docs/DESIGN_SYSTEM_NO_FIGMA.md` § Approved visual direction, reference `docs/design/studio-reference.html`. The accent is chosen per theme in Settings → Appearance (presets or custom), stored on the server; status colors always come with text and an icon. The current placeholder UI is explicitly not an acceptance reference: the first frontend milestone is a modern visual redesign with deliberate typography, spacing, density, navigation and responsive composition. Theme by `prefers-color-scheme` + a manual switch. Components — React Aria Components in `shared/ui` (see §0).
- Tokens `--color-bg`, `--color-surface`, `--color-text`, `--color-accent`, `--space-*`, `--radius-*` and typography in `app/styles/tokens.css`; buttons and fields via `shared/ui`.
- On desktop: side navigation, dense tables and a two-pane editor. On mobile: compact navigation, tables turn into cards/accessible horizontal scrolling, the main actions remain available.
- Accessibility: WCAG 2.2 AA as the target; interactive elements are keyboard-reachable, visible focus, semantic `label`, correct heading structure, color is not the only status marker, dialogs manage focus. For form errors `aria-describedby`; for background updates — moderate `aria-live`, without constant announcements.
- User-facing statuses: «Запланировано», «В очереди», «Публикуется», «Опубликовано», «Повтор по расписанию», «Ошибка», «Требует проверки», «Отменено». The canonical mapping `PublicationStatus` → label → token group is in the skill `page-spec`. Do not show HTTP 503 as the only explanation to a person — give a short text plus the requestId.

## 11. Performance and memory leaks

- Route lazy load, an import tree without heavy SDKs on the main screen. Check the Vite bundle size from the build report; load large dependencies only on the route that needs them.
- `useEffect` only for connecting to external systems; timers/subscriptions/AbortController must be cleaned up on unmount. Polling stops when the tab is hidden and when the screen unmounts; do not create parallel intervals.
- Large lists are paginated on the server; virtualization only for truly large screens when needed. Do not apply `useMemo`/`useCallback` everywhere without profiling.
- Clean up canvas/image object URLs; previews do not hold full-size images in component state. Do not load all hero-art from R2 at once.
- A network error must not trigger an infinite refetch. For mutations (especially publish/retry) `retry: false` by default. Read-only queries — limited retry with backoff and explicit exceptions for 401/403/400.

## 12. Frontend tests and integration

- Unit: date/UTC formatting, API error mapping, form Zod schemas, pure filter functions.
- Component (RTL + MSW): empty list, loading/error, login, editor validation, 409 conflict, saving with component re-creation, failed/unknown action restrictions.
- E2E (Playwright): Telegram sign-in (browser and Mini App with a mocked environment), draft creation, preview, safe scheduling, unknown Telegram result, incident log, logout, mobile viewport, basic keyboard. All tests are isolated, Telegram is mocked.
- Contract tests: `contracts` are imported by the API and the admin panel; fixtures match production DTOs. The Bearer token, the refresh cookie and the `Origin` check on `/api/v1/auth/*` are verified by Worker integration tests.
- CI: `npm run verify` (Oxlint, Prettier, `tsc`, dependency-cruiser, Vitest, `vite build`); Playwright — `verify:e2e`. A11y: axe in critical forms/dialogs + a manual keyboard smoke.
- Do not test internal `useState` and CSS classes as the main evidence of quality; verify user actions and visible results.

## 13. Rules for adding/removing a frontend feature

1. Public API contract and user scenario first, then the feature with the necessary minimum of files.
2. Implement `loading`, `empty`, `error`, `success` and all permissions/failures of server responses.
3. Where possible, do not change layout/router beyond registering a link and a lazy route.
4. Deep imports between features are forbidden; shared logic is moved to `entities/shared` only on real reuse.
5. To remove a feature — disable/hide the route and navigation; remove dependent query keys; make sure there are no other imports; delete the files; run architecture + component + E2E.

## 14. Acceptance of the first frontend version

- All routes in `docs/PAGE_MAP.md` are available on desktop/mobile with clear loading/empty/error states; mobile keeps operational feature parity.
- An unauthenticated user does not see private data; when the session expires React correctly clears the sensitive cache and redirects to sign-in.
- An editable draft cannot be accidentally lost during ordinary navigation, and a version conflict does not lead to silent overwriting.
- The admin panel shows the real state of the API and Cron (time of the last tick), an explicit `unknown`, the requestId and a safe retry button.
- After `202 Accepted` the interface does not report «Опубликовано» before Telegram confirms.
- No secrets in the Vite build, no infinite polling or object URL leaks, CI and basic E2E are green.
- Card rendering is consistent with the backend; the API contains a content version/revision and provides contract testing.

## 15. Primary sources for frontend

- React, Choosing State Structure: https://react.dev/learn/choosing-the-state-structure
- React, You Might Not Need an Effect: https://react.dev/learn/you-might-not-need-an-effect
- TanStack Query, Important Defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- TanStack Router (search params): https://tanstack.com/router/latest/docs/framework/react/guide/search-params
- Cloudflare Workers static assets (SPA): https://developers.cloudflare.com/workers/static-assets/
- Telegram Mini Apps: https://core.telegram.org/bots/webapps · Log in with Telegram: https://core.telegram.org/bots/telegram-login
- Testing Library, guiding principles: https://testing-library.com/docs/guiding-principles/
- Playwright, Best Practices: https://playwright.dev/docs/best-practices
- OWASP, CSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- dependency-cruiser: https://github.com/sverweij/dependency-cruiser

**This is design documentation. Actual performance, accessibility and security are confirmed only after implementation and tests.**

## 16. Telegram Mini App (the same admin panel)

The admin panel opens both as a regular website and as a Mini App from the bot (menu button, direct link `t.me/<bot>?startapp=<parameter>`). There is no separate version.

- **Wrapper `shared/telegram/`:** a thin typed module over `window.Telegram.WebApp` (the official script `telegram-web-app.js` is included in `<head>` before the bundle). The Mini App indicator is a non-empty `initData`; do not detect by User-Agent. All other code works only through the wrapper, so it is easy to replace in tests.
- **Launch parameters** are read from `Telegram.WebApp` (the script parses `location.hash` itself), not from the router URL.
- **Theme:** light/dark by Telegram `colorScheme` (event `themeChanged`); the palette remains ours (neutrals + the owner's accent preset), we do not copy Telegram colors.
- **Safe areas:** padding `max(env(safe-area-inset-*), var(--tg-content-safe-area-inset-*))`; the height of bottom panels — by `viewportStableHeight`. On launch `ready()` and `expand()`; we do not use fullscreen mode.
- **Native elements** (with an `isVersionAtLeast` check): the «Back» button — when router history exists; close confirmation is enabled while the form is dirty; the main button — «Сохранить» in forms; subscriptions are removed on unmount.
- **Mobile layout is primary:** 375 px is the main screen, not a cut-down one.
- **Tests:** Playwright mocks `window.Telegram.WebApp` via `addInitScript` and generates a signed `initData` with a test bot token; real Telegram is not needed for tests. Manual verification on a device — through the Telegram test environment or an HTTPS tunnel.

## Owner decision 03.10.2026: Figma is fully excluded
