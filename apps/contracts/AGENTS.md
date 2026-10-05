# apps/contracts/ — shared API DTOs

This package is the single source of the frontend/backend wire format. It depends only on `zod` and never imports Hono, React, Cloudflare or business logic. Any change here follows the skill `contract-change`.

- One file per domain (`errors.ts`, `posts.ts`, `publications.ts`, …), re-exported from `src/index.ts`. Everything is in `src/index.ts` today; split it out when you add the next domain.
- Naming: `xxxSchema` plus `export type Xxx = z.infer<typeof xxxSchema>`. Request bodies are `XxxInput` and use `z.strictObject` so unknown keys are rejected. Responses are `XxxDto`. Lists are `PageDto<T>` = `{ items, nextCursor }`.
- Zod 4 idioms:
  - `z.uuid()`, `z.iso.datetime()` (UTC `Z` only, by default) and `z.email()` are top-level;
  - messages use the `error:` param;
  - `z.record(key, value)` takes two arguments;
  - `.strict()` and `.passthrough()` are deprecated.
- Types are JSON-only: dates are ISO-8601 UTC strings. No `Date`, `Map` or class instances.
- `PublicationStatus` is a user-facing projection of internal job states. Never leak SQL column names or internal states.
- Additive changes are safe. Renaming or removing a field or enum value is breaking: add the new shape, migrate both consumers, and remove the old one in a later PR.
