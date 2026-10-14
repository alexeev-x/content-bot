---
name: contract-change
description: "Procedure for adding or changing an API endpoint, request/response DTO, error code, status enum or idempotency rule in apps/contracts — keeps backend, frontend, docs and contract tests in sync. Use before touching any API shape."
---
# Change an API contract

1. **Design the shape first** in `apps/contracts/src/<domain>.ts`, following `apps/contracts/AGENTS.md`. Write down:
   - the method and path, plus a request schema (`z.strictObject`);
   - the response schema for each success status (200/201/202);
   - every `ApiErrorCode` the endpoint can return;
   - the concurrency/idempotency rule.

   Example:
   ```ts
   export const createPublicationInputSchema = z.strictObject({
     postId: z.uuid(), revision: z.number().int().nonnegative(),
     destinationId: z.string().min(1), scheduledAt: z.iso.datetime(), timezone: z.string().min(1),
   });
   // POST /api/v1/publications, header Idempotency-Key → 202 PublicationDto(status 'scheduled')
   // errors: VALIDATION_ERROR 400, CONFLICT 409 (stale revision / same key in flight), UNAUTHORIZED, FORBIDDEN
   ```
2. **Idempotency for creating mutations.** Use the `Idempotency-Key` header, modeled on the IETF draft (expired, so not a standard). Store the key and a payload hash under a `UNIQUE` constraint, scoped per user, with an expiry. Responses:
   - same key + same payload → the original response;
   - same key + different payload → 409 `CONFLICT`, `details.reason = "IDEMPOTENCY_KEY_REUSED"` (the draft suggests 422; we reuse the existing code set);
   - same key still in flight → 409 `CONFLICT`, `details.reason = "IN_FLIGHT"`;
   - missing key on an endpoint that requires it → 400 `VALIDATION_ERROR`.

   Edits carry the revision in the body and get 409 `CONFLICT` with `details.reason = STALE_REVISION` when it is stale (owner decision 06.10.2026: no `If-Match` / 412).
3. **Classify the change.**
   - Additive: a new optional field, a new endpoint.
   - Breaking: a rename, a removal, a narrowed type, a new required input, a removed enum value.

   A breaking change goes expand → migrate → remove across separate PRs, because the admin deployed yesterday must keep working.
4. **Human doc:** add the endpoint to `docs/API_CONTRACTS.md` by name and meaning only. Never copy the schema; the code is the source.
5. **Update both consumers in the same PR.** The backend route parses input with the schema and returns the DTO type. The frontend fetcher parses the response with the schema in tests, and gets MSW fixtures for success and each error code. A new error code needs a frontend message and action.
6. **Contract test:** call the real Worker route, then parse the response with the schema for success and for each documented error.
7. **Publication statuses:** `PublicationStatus` is a projection. A new internal state updates the mapping table in `docs/backend/publishing.md` §5 and its unit test.

Before you finish: `npm run verify` passes, both consumers compile against the new types, and the contract test covers every documented status.

Sources: `references/sources.md`.
