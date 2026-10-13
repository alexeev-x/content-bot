# Media Library MVP

## Scope and current state

Queue item: 23 in `docs/IMPLEMENTATION_PLAN.md`. The prototype route is `/__proto/media`; the production `/media` implementation is complete locally but is not yet deployed to DEV. It uses `GET /api/v1/media` and serves private bytes through `GET /api/v1/media/{mediaId}/content`.

The current DTO supports kind, file name, MIME type, size, dimensions, duration and creation time. `media_assets.sha256` is already persisted. A retained asset is one referenced by a current post attachment or an immutable post revision. Uploads are attached to a draft; there is no detached-library upload endpoint. There is no manual delete endpoint.

## MVP recommendation

Build an owner-only, read-only retained-media library. Support bounded server-side filename search and existing kind filters, grid/list presentation, metadata, private preview, exact-byte duplicate counts from stored SHA-256, and links to current posts using an asset. Opening a media file must never expose a public R2 URL.

Do not offer standalone upload, tag editing, download, or manual deletion in this release. To add a new asset, the owner starts a draft and uploads it through the existing editor flow. Automatic cleanup remains the only deletion path and continues to delete only after checking both current attachments and immutable revisions. The owner has been asked whether removal of provably unreferenced retained assets should be added; until answered, no manual delete control is authorized.

## API contract proposal

- Extend `GET /api/v1/media` additively with `search` (bounded SQLite filename-prefix match: ASCII case-insensitive, non-ASCII case-sensitive) and `usage=all|used|unused`; keep kind, cursor and limit.
- Extend each list item with `duplicateCount` (count of retained assets with the same exact SHA-256), `usageCount` (current post attachments), and a bounded set of current post links `{ postId, title }`.
- Keep existing created-time keyset order, so existing cursors and consumers remain compatible. Search/filter must be server-side across pages; UI must not imply that it searched only the loaded page.
- Add supporting indexes for SHA-256, filename prefix and reverse post-media lookup. Verify each new query with `EXPLAIN QUERY PLAN`.
- Preview continues through the authenticated private content route. Attaching to a draft reuses the existing `POST /api/v1/posts/{postId}/media/attach` contract and its revision conflict and 10-item limit.

No database column/backfill is expected for checksum: SHA-256 already exists for every stored asset. The new indexes require the next numbered D1 migration. Contract/backend/frontend/docs/tests must change together.

## Acceptance criteria

1. Given an owner opens `/media`, when the page loads, then it shows retained assets only, with loading, empty, filtered-empty, error, 401 and 403 states.
2. Given a filename prefix, kind or usage filter, when applied, then the server filters the complete retained library and keyset pagination remains stable.
3. Given duplicate retained bytes exist, when an item is shown, then the exact duplicate count is visible and derived from SHA-256; different bytes with the same name are not marked duplicates.
4. Given a retained asset has current post attachments, when its details open, then the page shows a bounded list of those posts and a total count; no unbounded rows are loaded.
5. Given the owner opens a preview, then bytes are fetched through the private authenticated API, temporary object URLs are revoked, and no public storage URL is exposed.
6. Given an owner adds selected assets to a draft, then the existing attach API enforces ownership, retained status, revision and the media-count cap; on `409`, the selection remains available and the current draft can be reloaded. No post is published or scheduled by this flow.
7. The production UI does not imply standalone upload, tag storage, download or manual deletion capabilities that the API cannot honor.
8. The page meets the responsive, keyboard, focus, target-size and WCAG requirements in `docs/design/UX_SPEC.md` and has implementation Gate B evidence.

## Implementation record

- `GET /api/v1/media` accepts bounded filename search and kind/usage filters; list items include exact-checksum duplicate counts, current usage totals and at most three current-post links. Migration `0029_media_library_search_and_usage.sql` adds the supporting indexes and query-plan coverage.
- Production `/media` provides grid/list, authenticated blob previews with URL cleanup, metadata and attach-to-draft. The `409` flow retains selection, offers draft refresh, and never publishes. No manual delete/upload/download control was added while the deletion boundary remains unanswered.
- Gate A prototype and Gate B production checks passed. Gate B covered 24 realistic retained assets, 16 viewport/theme combinations, filters and keyset pagination, private preview, inspector details, keyboard focus/Escape, and the exact `409` → refresh → success flow. The repaired pending status announces progress without leaving stale React Aria live-announcer references; independent axe scans were clean immediately, at +1s and +8s, at 375/1280 light/dark.
- The integrated `npm.cmd run verify` passed after the review findings were fixed; focused frontend media/navigation checks passed (23/23), and lint/typecheck/format checks passed. The implementation remains local and unreleased. The owner applies migration 0029 via Actions → D1 migrations before pushing; the manual-deletion boundary remains unanswered and no delete action is included.
