# Handoff: post editor v3 → implementation (09.10.2026)

Handoff for the next session (Claude Code or Codex). Read first: `AGENTS.md`, `docs/TOKEN_BUDGET.md`, skill `orchestrate`, `docs/AGENT_UI_WORKFLOW.md`. Queue item: `docs/IMPLEMENTATION_PLAN.md` §5 #2.

## Done (09.10.2026)
- Rules: § Reference fidelity strengthened (images are the exact target; colours/fonts/components ours), token budget (`docs/TOKEN_BUDGET.md`), role effort medium except qa-security, `ui-prototyper` tracked by stop hooks.
- UX handoff v3: `docs/stories/post-editor-prototype.md` (element lists §3, crop §4, states §5, reorder = drag-and-drop only §6.3, allowed deviations §8, API needs §10). References: `design-refs/posts/posts-0{1,2,3}-*.png` (committed).
- Owner decisions: no «Дополнительные настройки» switches; no «Выше/Ниже» buttons (drag-and-drop only); top bar hidden on editor routes (§8 D11).
- Primitives in `apps/frontend/src/shared/ui/` (catalog `/__catalog` → «Editor»): Dialog `size="media"`, MediaGridTile/MediaAddTile, MediaListRow, UploadRow, Dropzone, Progress, RatioTileGroup, Slider, BottomSheet/ActionRow, CropCanvas (+`fitFrame`), FormatToolbar, DateField; variants on Tabs, RadioGroup, Switch, TelegramPreview, TextField/TextArea (counter, toolbar, textSize), Button (`xl`, `link`, `soft`), Card `padding="sm"`; `AppShell` hides the top bar on `posts/*`.
- Prototype accepted: `/__proto/posts/new?state=<id>` (`apps/frontend/src/pages/prototypes/PostEditor*`). Gate A: 18/20 fixed then polish; open low items accepted by the owner («эти мелочи оставь»). Evidence: `.logs/qa-proto-v3d/`, `.logs/proto-v3e/`.
- Backend media fixes with red→green tests (`apps/backend/tests/integration/post-media.test.ts`): PATCH post returns its media (MEDIA-001, likely the owner's 404), library attach of a crop original (MEDIA-005), orphan object after slow upload (MEDIA-008).

## Next (in order)
1. **frontend**: implement the real editor (`apps/frontend/src/features/posts/**`, routes `/posts/new`, `/posts/$id`, `/posts/$id/publish`) to match the prototype exactly, using the same primitives. Fix in the same pass (audit, CONFIRMED by trace):
   - MEDIA-002: new post — `adoptMedia` ignores uploads while `baseline === null`; after redirect media vanish and the next write is 409 (`model/use-post-editor.ts` ~252, `ui/PostMediaEditor.tsx`).
   - MEDIA-003: crop uploads full-res PNG → >10 MB → 413. Use the prototype's `renderCrop` approach (`pages/prototypes/post-editor-crop.ts`): JPEG/WebP, long side ≤ 2048, ≤ 10 MB, same math for preview and output.
   - MEDIA-004: crop preview/output mismatch (inverted pan) — replaced by CropCanvas + shared math.
   - MEDIA-006/007: stale ids → 404; specific error copy for 404/400/413/503 in crop.
   - Tests: real `PostEditor` + `usePostEditor` (not a mocked `onServerChange`), real-size photos in e2e.
2. **ui-qa** Gate B: real pages vs prototype screenshots, 375/1440, both themes, axe, crop output = frame.
3. **qa-security** (R2: uploads/media): integrated review; then full `npm run verify` once.
API needs left out of scope (handoff §10): thumbnails/posters endpoint (API-8), bulk detach (API-9), switches (decided: none).
- Reorder in the prototype uses a small pointer hook (`pages/prototypes/post-editor-reorder.ts`: mouse after 5 px, touch after a 280 ms hold, Alt+Arrow keyboard), not React Aria DnD; e2e `apps/frontend/e2e/post-editor-dnd.spec.ts`.
