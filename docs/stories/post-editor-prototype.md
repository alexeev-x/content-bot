# Post editor clickable prototype — UX handoff

**Status:** expert review, not validated with users. Prototype-only handoff; it does not authorize production UI changes, API calls, uploads, saves, scheduling, or Telegram sends. The owner-provided three files are references for composition, information density, media states, and interaction—not a source for colors, typography, component styles, or technical claims.

## Reference manifest (owner-provided, 09.10.2026)

| ID | Path | Screen/state represented | Required elements |
|---|---|---|---|
| `posts-01` | `design-refs/posts/img.png` | Desktop editor + publication settings; mobile empty editor, media grid/upload, reorder list, preview and publication settings | Two desktop screens in the existing app shell; mobile states remain a full-screen editor with reachable media, preview and publication settings. |
| `posts-02` | `design-refs/posts/img_1.png` | Desktop media-source dialog, selected mixed queue | Sources `С компьютера / Медиабиблиотека / Недавние`; multi-file chooser/drop target; per-file thumbnail, metadata, upload progress, remove; cancel/add-to-post. |
| `posts-03` | `design-refs/posts/img_2.png` | Mobile media source sheet + image crop screen | Camera/device/library exits; crop canvas; ratios `Оригинал / 1:1 / 4:5 / 16:9`; zoom, rotate, `Использовать как обложку`, Done/Back. |

Reference mapping is based on the actual image files above. Image measurements are visual references, not token values; prototype QA compares the relevant desktop/mobile state against the image while preserving ALEXEEV tokens and components.

### Reference measurements for the prototype

These are approximate source-image pixels (the files are composite concept boards, not browser screenshots); normalize repeated elements and scale to the app viewport. Use only as layout measurements, not as copied CSS values.

| Reference | Grid / proportions | Repeated sizes / spacing | Shape and type roles | ALEXEEV mapping |
|---|---|---|---|---|
| `posts-01` desktop, 1536×1024 board | Editor app frame is about 890 px wide with ~145 px nav; writing/media takes roughly 2/3 of its work area and preview 1/3. Publication screen is a separate frame with settings and preview side-by-side. | Main column gap ~14 px in source; media thumbnails ~78×78 px, repeated gap ~8 px; header/actions align to content edges. | Compact labeled controls; medium rounded fields/cards; 1-line title, compact status; preview media dominates its card. | Existing `PageHeader`, panels, fields, buttons, status tokens, spacing/radius/type-scale tokens; preserve actual shell/sidebar rules from UX_SPEC. |
| `posts-02` desktop modal, 623×579 | One dialog, source tabs across full width; drop target above a vertical file queue; footer actions below divider. | Three source tabs ~195×55 px; drop target ~596×217 px; queue rows ~58 px with ~8 px separation. | Rounded source tabs, dashed drop target, compact per-file rows, distinct secondary cancel and primary add. | Existing Dialog, Button, Tabs/segmented primitives and semantic border/accent/status tokens; choose the nearest supported primitive, no local hex or new radii. |
| `posts-03` mobile board, 1450×1086 | Two phone states: source bottom sheet overlays editor; crop is full-screen with image canvas taking the top half and controls below. | Source sheet starts around 60% down the phone; crop ratios in one equal-width row; zoom and rotate are separate groups; large header actions. | Full-screen crop image with rule-of-thirds grid and corner handles; source actions are tall rows with icon + title + hint. | Full-screen route/bottom sheet via shared primitives; 44 px touch targets; safe-area padding; tokens for surfaces/border/accent, typography from Onest scale. |

When a screenshot does not reveal an exact CSS measurement (especially the composite mobile board), preserve its relationships and element order; the builder records concrete viewport screenshots and the QA gate checks the rendered page against those screenshots.

## Goal and source of truth

Help the frontend team implement the owner-requested post editor by first making its structure and interactions inspectable in a code-native clickable prototype. Preserve the existing ALEXEEV Studio palette, design tokens, typography, shared primitives, navigation shell, and publishing-safety rules. Reuse the current `/__proto` harness and mock-only state; never import production feature components or call real endpoints.

Priority when sources disagree: this repository's [`docs/design/UX_SPEC.md`](../design/UX_SPEC.md) for ALEXEEV layout, controls, shell and accessibility; this handoff for the owner-reference-specific editor composition and prototype interactions; owner images for structure only. Current statuses and publishing safety remain governed by the contracts and `docs/BACKEND_ARCHITECTURE.md`.

References informing interaction conventions: Telegram lets users preview, reorder, and remove selected album media before sending ([Telegram](https://telegram.org/blog/downloads-attachments-streaming?setln=en)); Later supports adding media from its library and rearranging planned posts in its mobile planner ([Later mobile app](https://help.later.com/hc/en-us/articles/360043244813-A-Guide-to-the-Later-Mobile-App)); Buffer presents creation as one place to edit a draft and attach media ([Buffer Create](https://buffer.com/create)). These inform recognizable interaction patterns, not visual styling. Expert review only; no user validation.

## Current vs target

| Area | Shipped editor evidence | Target represented by owner references | Prototype decision |
|---|---|---|---|
| Hierarchy | [1280 screenshot](../../.logs/media-publish-qa/media-editor-1280.png) shows full application shell, compact content centered in a large canvas, edit fields and attachments in separate bordered regions; global bar crosses the screenshot. | Focused creator workspace: concise header, writing surface and preview share the desktop row; media has a clear visual gallery / upload queue. | Keep real Studio shell and tokens. Use a clear editor header and a two-column workspace: writing/media left, preview right. The screenshot is a viewport crop reference only; never emulate a global bar overlay. |
| Media | Shipped screenshot shows an attachment row with filename and controls, but the shown fixture has no visible thumbnail; empty copy says files appear after selection. | Empty drop target, source chooser, previewable thumbnails, mixed photos/videos, per-file progress, retry/remove/reorder. | Show useful media visual states and a unified source chooser. Use mock thumbnails and explicitly synthetic progress. Never claim 50 MB or format support beyond server contract; label prototype data. |
| Image crop | Current media DTO contains file facts and order only; it has no crop transform or source relationship (`apps/contracts/src/media.ts`). Migration `0016_post_media.sql` queues an asset for cleanup after its final post/revision reference is detached. | `posts-03` shows a crop workspace with four aspect ratios, zoom, rotation and a cover toggle. | Crop into a derived post-specific image. Preserve a durable source relationship so cleanup retains the reusable original while a derivative depends on it; preview and publish the derived bytes, not CSS-only clipping. |
| Preview | Preview is a text card and secondary tab; no visible attached-media preview in the QA fixture. | Channel-like Telegram card with media, caption/title, album browsing, and live update. | Reuse existing `TelegramPreview` if it supports required mock media; otherwise compose with shared primitives. Do not fake channel statistics or real delivery metadata. |
| Mobile | [375 screenshot](../../.logs/media-publish-qa/media-editor-375.png) shows shell chrome, a long text area, attachments below, and the fixed action bar; viewport capture indicates shell controls overlap editor content. | Full-screen editor, mobile media source bottom sheet, compact media grid, preview and publication setup available without desktop assumptions. | Use the UX-spec full-screen detail route, 44px touch targets, safe-area pinned actions and keyboard-aware layout. The shell's app bar/tab navigation stays hidden on editor detail routes. |
| Workflow | Editor offers save/exit and a publication-setup action; screen B is a separate route. | References depict editor, source sheet, media-ready state, preview/settings, final readiness and confirmation affordances. | Prototype the core path across editor → media source/selection → settings/preview → explicit confirmation *as local mock navigation only*. No click may publish or persist. |
| Visual language | Shipped screen already uses ALEXEEV tokens, controls and light theme. | Images are dark, blue-accented, denser and more decorative. | Keep current ALEXEEV light/dark themes, existing semantic accent, type scale, radii, spacing and primitives. Transfer only information hierarchy and interaction patterns; do not copy gradients, heavy nested cards, bright blue or reference-specific controls. |

### Audit (expert review, not validated)

| Screen / step | Heuristic | Evidence | Severity | Fix for prototype |
|---|---|---|---:|---|
| Editor / orient and begin | Match between system and real world; recognition over recall | Shipped: `media-editor-1280.png`; target image 1 header has title, draft status and autosave. | 2 | Make “Новый пост”/title, actual draft status, save status, and back-to-posts visible in one concise header. No fictitious “autosave enabled” when idle/empty. |
| Media / add first file | Visibility of system status; user control | Shipped empty: `media-empty-1280.png`; target image 4 empty drop-zone and mobile image 2 bottom sheet. | 3 | Make upload affordance available at first visit; show source choices immediately. Drop, system picker and library are visibly distinct. Simulate file-selected state in prototype. |
| Media / understand queue | Visibility of system status; error prevention | Shipped attachment row has filename/status/actions but no visible thumbnail in fixture; target images 1–2 show thumbnail, type, dimensions/duration and progress. | 3 | Each mock asset shows thumbnail/type, name, size, progress/state and cancel/remove; failed state includes reason + retry. Mark all metadata/progress as demo. |
| Media / reorder and remove | User control and freedom; consistency | Target images 2, 5, 6 show reorder handle and remove; Telegram album picker supports reorder/removal. | 2 | Reorder via handle and keyboard-accessible Move up/Move down actions; remove only detaches from this draft. Update preview order immediately. |
| Image / crop and return | User control and freedom; match between system and real world | `posts-03` crop screen; `apps/contracts/src/media.ts`; cleanup trigger in `apps/backend/migrations/0016_post_media.sql`. | 3 | Crop only photos. Offer `Оригинал`, `1:1`, `4:5`, `16:9`, zoom, rotate ±90°, reset, Cancel and `Готово`. Cancel restores the prior framing. On Done, create a derived image and replace this post attachment only after derivative upload succeeds; on failure keep the old item. The source remains available only if the backend persists the derivation relationship and cleanup treats it as a live dependency. |
| Preview / inspect what will be sent | Match between system and real world; visibility | Target images 1, 3, 5, 6 show media and caption together; shipped fixture preview has text only. | 3 | Present title/body/media in delivery order, with previous/next for group preview and a visible type marker. No made-up views/time/channel identity. |
| Settings / publish or schedule | User control; error prevention | UX_SPEC §4.1 and target image 3 show channel, now/schedule, readiness, final action. | 4 | Show selected channel and time zone, visibly distinguish immediate vs scheduled, summarize readiness and require a second explicit confirmation. Prototype action is mock-only. |
| Mobile / navigate while keyboard open | Aesthetic/minimal design; accessibility | Shipped `media-editor-375.png` viewport has shell chrome overlapping editor, plus fixed bottom actions. Target image 4 is full-screen and image 2 source sheet. | 3 | Full-screen edit route; keep focused input and pinned actions above visual viewport/keyboard; source chooser is a bottom sheet; no global shell overlap. |

### Cognitive walkthrough (pass 1: perform the owner's task)

For each step, ask: will the owner try it, notice the control, link it to their goal, and see progress? `Yes` below is a design expectation to verify in the prototype, not a validated user finding. Pass 2 is the heuristic hunt in the audit table above: visibility, user control, match to real world, consistency, and error prevention.

| Task step | Will try? | Notice? | Link to goal? | See progress/result? |
|---|---|---|---|---|
| Start writing | Yes — title/body are the natural first actions. | Yes — labeled fields at top of focused page. | Yes — title + text are explicitly grouped as post content. | Yes — save indicator moves through `Изменено` → `Сохраняем…` → `Сохранено`. |
| Add photo/video | Yes — media is a primary part of the task. | Yes — empty drop zone and “Добавить медиа” remain visible without a saved draft. | Yes — actions name device/library sources. | Yes — chosen items appear immediately in a per-file queue with state. |
| Review/order media | Yes — visible thumbnails invite review. | Yes — handles, type, sequence and remove affordance are on the item. | Yes — media cards sit directly in the post editor. | Yes — preview order changes alongside the grid. |
| Preview result | Yes — preview is a named destination. | Yes — desktop side panel; mobile tab/action. | Yes — Telegram-like message shows the composed post. | Yes — text and media update live. |
| Configure delivery | Yes — the next primary action is “Настроить публикацию”. | Yes — channel, “сейчас/по расписанию” and timezone are explicit. | Yes — readiness summary connects choices to final action. | Yes — selected mode and validation state remain visible. |
| Confirm | Yes — explicit final button. | Yes — named confirmation dialog and effect. | Yes — dialog names channel and immediate/scheduled outcome. | Yes — demo-only result follows confirm; cancel keeps editor state. |

## Flow and responsive wireframes

The flow is a prototype demonstration, not production interaction:

`Posts → New post → Edit title/body (mock autosave states) → Add media → Choose device/library → Queue/gallery → Preview → Publication settings → readiness → explicit confirmation dialog → mock result`

At every point, back returns to the previous editor state. Leaving the editor returns to Posts; an unsaved-loss confirmation is shown only in the prototype's explicit simulated `unsaved` state. Cancel/close source sheet returns focus to “Добавить медиа”. Cancel final confirmation makes no state change. A simulated upload can be cancelled without removing already uploaded mock items. No real publish endpoint or persistence is allowed.

### Desktop, target viewport 1280 px

```text
┌────────────────────── Studio shell / sidebar ──────────────────────┐
│  ← Все посты     Новый пост · Черновик       Сохранено / Сохраняем… │
│                                                                     │
│  ┌────────── Writing and media (min 0, max ~720) ──┐ ┌─ Preview ─┐ │
│  │ Заголовок                         0 / 200        │ │ Канал*    │ │
│  │ [input]                                          │ │ [message  │ │
│  │ Текст                                            │ │  card:    │ │
│  │ [format toolbar]                                 │ │  media,   │ │
│  │ [rich editor, internal scroll for long copy]     │ │  caption, │ │
│  │                                                  │ │  controls]│ │
│  │ Фото и видео                     [Добавить медиа]│ │           │ │
│  │ [dropzone when empty / asset queue or grid]       │ │ [tabs:    │ │
│  │                                                  │ │ preview / │ │
│  └──────────────────────────────────────────────────┘ │ posts]    │ │
│                                                       └───────────┘ │
│  [publication setup / next step]                                    │
└─────────────────────────────────────────────────────────────────────┘
```

Use content-first hierarchy: no mandatory progress-stepper or numbered “step 5/6”; the supplied step count is reference copy, not product architecture. At 1280 with the actual sidebar, allow columns to shrink fluidly; if they cannot meet readable minimums, stack preview after media instead of compressing controls. Header is not sticky on desktop. Keep the editor within the available page width and avoid nested-card walls.

### Mobile, target viewport 375 px

```text
┌──────────── Full-screen editor route ─────────────┐
│ ←  Новый пост / title         Черновик      ⋯     │
│     Сохранено / Сохраняем…                        │
│ Заголовок                              0 / 200    │
│ [single-line / growing title field]                │
│ Текст                                  0 / 4096   │
│ [horizontal formatting row + more menu]            │
│ [body editor; grows, keyboard-aware]                │
│ Фото и видео                         [Добавить]   │
│ [2-col media grid / upload status]                  │
│ [Открыть предпросмотр]                              │
│                                                    │
│ [Сохранить/Выйти]          [Настроить публикацию]  │ ← pinned, safe-area
└────────────────────────────────────────────────────┘

Tap Добавить:
┌──────────── dimmed editor behind ─────────────────┐
│                 bottom sheet                      │
│ Добавить фото и видео                              │
│ [Снять фото/видео] (device capability only)        │
│ [Выбрать на устройстве]                            │
│ [Из медиабиблиотеки]                               │
│ [Отмена]                                           │
└────────────────────────────────────────────────────┘
```

At mobile widths, avoid showing the preview in a narrow right column. Make preview a dedicated tab/sheet or expandable section, and ensure the setting screen is a full-screen route with the preview above settings and a single pinned primary action. In Mini App, the prototype may show the corresponding BackButton/MainButton affordance, but never duplicate a browser shell bar.

### Screen B — publication settings

Follow `posts-01` desktop right-hand screen: a focused page headed “Публикация”; channel selection first; mutually exclusive “Опубликовать сейчас / Запланировать”; date and time only for schedule, with explicit “Europe/Chisinau (UTC+3)” display; only supported options; and an adjacent/following final Telegram preview. On mobile use one column, full-height navigation back to the same editor state, preview before the settings, and one safe-area pinned primary action. Show a readiness summary (channel, delivery time, media count, validation); unavailable channel or unfinished upload blocks the action and links to the relevant field/item. Drafts must first pass the existing explicit approval transition; after approval, publication confirmation follows the existing API path.

### Crop screen — mobile and narrow layouts

Follow `posts-03`: full-screen image, dimmed outside the crop rectangle, thirds grid, controls below image and persistent “Назад / Готово” header. The crop viewport updates when ratio changes, while the source image itself remains unchanged. Zoom is a labeled slider plus/minus buttons; rotation is explicit buttons, not a gesture-only affordance. “Использовать как обложку” is explained as first-in-order, not an independent Telegram cover. Desktop can use a centered dialog of the same crop workspace; Escape and “Назад” cancel and return focus to the media card’s crop action. Production crop creates a derived asset, but the existing revision-aware upload/replace flow alone is insufficient: persist the derived-to-source relationship and make cleanup retain the source while any derivative depends on it. Keep the original attachment until derivative upload succeeds; do not present crop as ready before the retention relationship is implemented.

## States and actions

| State | Entry / visible result | Actions and exit | Prototype behavior |
|---|---|---|---|
| Empty draft | No title/body/media; empty media dropzone; preview placeholder; status `Изменено` only after typing | Type or add media; back to Posts creates nothing | Empty default; no fake saved draft. |
| Editing / autosave | Title/body live in editor; counter reflects Telegram message; status `Сохраняем…` then `Сохранено, 14:32` | Back returns to Posts; save action can force mocked save | Use deterministic demo clock and local in-memory state. |
| Upload idle | Dropzone with “Перетащите файлы сюда или выберите источник”; actions “С компьютера”, “Из медиабиблиотеки” | Open native-looking mocked chooser or library sheet; drop area accepts simulated selection | Never invoke OS picker or upload. |
| Uploading | Per-file card has thumbnail, type, progress and “Загружается…” | Cancel this item; other files continue | Progress is an authored sequence (e.g. 24 → 68 → 100%), labeled demo. |
| Processing | File remains queued with neutral “Обрабатывается…” | Continue editing/reordering; remove from draft | Don't suggest server processing is real. |
| Upload failed | Inline error beside file; progress stops | “Повторить” or remove | Retry returns to uploading mock state; no global alert-only. |
| Media selected | Grid; order visible via position/handle; first item subtly marked “Первое” (avoid Telegram “обложка” claim) | Move earlier/later; remove from this post; add more; tap preview | Changes immediately reflect in preview. |
| Library picker | Existing prototype media-library sheet; filter “Все / Фото / Видео”; multi-select; selected count; “Недавние” means newest first | “Добавить (N)” returns to editor; “Отмена” returns focus to opener | Reuse mock library state. Production can use the existing library endpoint's newest-first ordering; no separate recent store is implied. |
| Crop image | Full-height crop workspace for one photo; selected ratio, crop bounds and live thumbnail are visible | Ratio: “Оригинал / 1:1 / 4:5 / 16:9”; zoom slider with +/- buttons; rotate 90° left/right; “Сбросить”; cover toggle; “Готово” returns to that media item. “Назад”/Cancel discards only the in-progress crop; Escape follows the same path. | Mock transform only; clearly demo. Never crop video/animation. Toggle means “show this photo first”: move it to position 1 and explain that Telegram has no independent album-cover field. Toggle off leaves order unchanged. |
| Preview | Telegram-like post with media carousel, type/duration only when part of fixture; exact text order | Previous/next media, enlarge mock preview, back to edit | No views count, real send time or assumed channel stats. |
| Publication setup | Channel selection, “Опубликовать сейчас” / “Запланировать”, date/time and explicit Europe/Chisinau offset; readiness summary; current editorial status visible | Back to editor preserves mock values. A draft first exposes the existing “Одобрить” confirmation; after mock approval the publication action is available. Publication confirmation names channel and effect. | Demonstrate the current two-stage lifecycle in mock state. Unsupported toggles absent. |
| Final confirmation/result | Confirmation names channel and effect (“Опубликовать сейчас в …?” / “Запланировать на … в …?”); result states distinguish accepted/scheduled from sent | Cancel/Esc closes with focus restored. Confirm may show only a clearly labelled simulated server response; cancel never changes state. | Never call API; never label `202` as “Опубликовано”. Keep the result fixture explicit that it is demo data. |
| Offline/save failure/conflict | Persistent inline banner or save indicator explains issue; preserve typed content | Retry mock save; conflict opens compare/update state; leave only if safe mock state says saved | Do not show success unless state switcher sets it. |
| Loading / unavailable library | Skeleton geometry or inline library error | Safe GET-style retry only (mock) or cancel | Keep final layout geometry stable. |
| Read-only approved/sent | Lifecycle banner explains status; editing disabled; preview available | Return to draft only when supported by current post-state fixture; navigate back | Do not invent action eligibility. |

All action-like controls must visibly work inside the prototype. Any future operation not represented by current APIs/DTO state is a disabled/absent capability, not decorative UI.

## What the clickable prototype must show

Desktop and mobile should demonstrate the same core story, with density adapted—not reduced capabilities:

1. Empty editor with usable text fields and ready-to-use media dropzone.
2. Media-source sheet/menu with device and existing library options; library multi-selection and return path.
3. Mixed media queue: queued/uploading/processing/success/failure; per-file retry/cancel/remove; multiple files and visible sequence.
4. Loaded media grid, reorder by pointer plus keyboard-accessible move actions; removal affects the post only; first item order reflected in preview.
5. Text-only, image+caption, video+caption, album, and mixed media preview states. Use local fixture thumbnails with clear demo data; no fabricated asset metadata claims.
6. Screen B with channel, now/schedule, timezone and readiness; show the existing approve-then-publish/schedule sequence, explicit final confirmation, cancel and an explicitly mocked server-result state.
7. Crop screen with the four ratios, zoom, rotate, reset/cancel/done; cover toggle behaves only as reorder-to-first and is labelled accordingly.
8. Autosave pending/saved/failed, offline, conflict, empty/first-entry and keyboard-open states using existing prototype state switcher conventions.
9. Existing ALEXEEV theme toggle should demonstrate both light and dark without changing token values. Prototype banner/state switcher must remain clearly visible and mock-only as required by design README.

Do not add a new color palette or visual primitives. Reuse tokens/primitives from `apps/frontend/src/app/styles/tokens.css` and `apps/frontend/src/shared/ui`; reuse `TelegramPreview`, current app shell, and the `/__proto` store/state switcher where suitable. Prefer extending the existing prototype editor, not a second prototype framework.

## Acceptance criteria

- [ ] All three owner reference files map to explicit prototype states: editor/publication + six mobile states (`posts-01`), desktop source/queue (`posts-02`), mobile source/crop (`posts-03`). Each is represented at the relevant viewport, not by duplicating a whole reference image as one state.
- [ ] At 1280 px the editor has writing/media and preview columns within the ALEXEEV Studio shell; columns stack cleanly when the available width is insufficient.
- [ ] At 375 px the editor is full-screen without shell overlap, with a usable one-column form, mobile media source sheet, and safe-area pinned actions.
- [ ] At 320 px there is no horizontal page overflow, clipped text, or controls below 44px on touch.
- [ ] The blank editor has no premature “saved” status and no mock draft silently appears without user input.
- [ ] Adding media from a source, choosing multiple library items, reordering, removing, retrying a failed item, returning from preview, and returning from settings all have visible outcomes and preserve the prototype's in-memory state.
- [ ] The source chooser distinguishes device, existing library and recent (newest retained assets); empty/loading/error/selection states have cancel and return-focus behavior. Mobile offers camera only when device capability allows it, gallery picker, library and cancel.
- [ ] Crop prototype demonstrates original/1:1/4:5/16:9, zoom, rotate, reset, cancel and done. Crop applies only to photos; original library fixture remains unchanged. “Use as cover” visibly moves that photo first and tells the user Telegram has no separate album-cover property.
- [ ] The crop preview is mock-only in `/__proto`; production crop is not complete through the current upload endpoint alone. It applies the crop to real derived bytes, preserves the source asset through an explicit persisted derivation relationship and cleanup dependency, keeps the old post attachment on failure, and sends the same derivative shown in preview.
- [ ] Title/body/media update preview in real time. Preview order matches the media order and distinguishes photo/video without fabricated stats.
- [ ] Every write-like action is mock-only; browser network inspection shows no new request; final confirm has cancel/keyboard exit and returns focus to its trigger.
- [ ] The prototype uses existing ALEXEEV tokens/primitives and remains recognizable in both current themes; no owner-image colors, gradients, radii or type styles are copied.
- [ ] Focus order and headings are coherent, tabs/dialogs use existing accessible primitives, all icon actions have names, no drag-only interaction exists, and status is never communicated by color alone.
- [ ] Builder quick-check screenshots cover 375, 1280 and 1920 px. Independent UI QA covers the full `UX_SPEC.md` matrix: 320, 375, 390, 768, 1024, 1280, 1440 and 1920 px, plus widths around any layout breakpoint. At 375 and 1280, capture default, media grid, mobile source sheet, preview, settings/confirm and error states; distinguish viewport from full-page captures.

## Prototype builder ownership

Builder owns only these paths unless the orchestrator expands scope:

- `apps/frontend/src/pages/prototypes/EditorScreen.tsx`
- `apps/frontend/src/pages/prototypes/Editor.module.css`
- `apps/frontend/src/pages/prototypes/registry.ts`
- `apps/frontend/src/pages/prototypes/proto-store.tsx` only if mock behavior requires it
- `apps/frontend/src/pages/prototypes/ProtoIndex.tsx` only if a new state link needs a group label
- new files under `apps/frontend/src/pages/prototypes/` for editor-specific mock preview, source sheet or crop screen only

No production files under `features/posts`, `routes/posts`, `shared/ui`, tokens, API/contracts, backend or database are in builder scope. Do not modify `docs/design/UX_SPEC.md` in the prototype implementation task; this is a story handoff, not an automatic canonical-spec approval. Independent ui-qa may accept this prototype and allow implementation without waiting for owner review. Any change to the canonical approved UX system, publishing policy or other owner-only decision still requires owner approval. Follow `docs/AGENT_UI_WORKFLOW.md`.

## API needs and production constraints

The prototype must not issue requests. It may simulate all states using deterministic fixtures. For production, the following are grounded in current contracts and must not be presented as working until the implementation is verified:

- **Private image/video preview:** use the owner-authorized `GET /api/v1/media/{mediaId}/content` byte stream with the in-memory session. Create an object URL from the returned `Blob` only in the browser, revoke it when the media changes or the component unmounts, and show per-item loading/error/retry states. A `blob:` URL is not a server URL and cannot be reused across browser sessions/origins; never store it in a DTO or use it as the persisted media address. A failure to fetch preview must not disable remove/reorder.
- **Upload/remove/reorder/library attach:** these operations already exist and are revision-aware (`apps/contracts/src/media.ts`; API meaning in `docs/API_CONTRACTS.md`). Serialize writes for one post. Show success only after the server returns the new revision. If remove fails, keep the media in the post and show “Не удалось убрать файл из поста. Повторить” beside that item—not an upload error. On 409 preserve local text and explain that the post changed; reload/compare before retrying the media action. Removing an attachment must not be described as deleting the library file.
- **Recent source:** current library GET is keyset-paginated, returns retained assets, includes `createdAt`, and backend orders newest first. “Недавние” can be a view of that existing result; do not imply it includes unretained or temporary uploads.
- **Crop derivation and retention — API/data need:** the current upload endpoint accepts bytes/filename but cannot record that a cropped derived asset depends on a source asset. On detach of the source's last post/revision reference, migration `0016_post_media.sql` queues cleanup; therefore merely uploading a derivative and detaching its source can delete the library original. Add a persisted derivation relationship and make retention/cleanup treat that relationship as a live reference; keep the source available in the library while any derivative depends on it. Do not invent the endpoint or DTO shape in this handoff. If crop handles must reopen relative to the original, expose the required source/crop metadata via the contract as well. Until this data path exists, production crop is not ready; CSS-only preview is never sufficient.
- **Cover semantics:** the current media contract has order but no independent cover field. Telegram displays the first item first; it does not accept this app's album-cover toggle as a separate setting. The UX therefore maps “Использовать как обложку” to moving that photo to position 1 (using existing reorder), with helper copy “Фото будет первым в публикации; отдельную обложку Telegram не задаёт.” Only one photo can be first. Do not alter library ordering.

## Existing publication lifecycle (preserve; no new policy)

Screen B is a review/configuration step, not a shortcut around the existing editorial state. “К публикации” only navigates from Screen A. A draft uses the existing explicit “Одобрить” action and its confirmation; after the server returns `approved`, the publication action becomes available. The explicit “Опубликовать” / “Запланировать” confirmation then creates one publication for the chosen destination using the existing idempotency key and backend flow. Returning to Screen A preserves the same post and selected settings. A `202` is shown as accepted/queued/scheduled from the returned DTO, never as `Опубликовано`; only server-confirmed `sent` means sent. This is the current contract/model, not a new combined mutation. Follow `.agents/skills/publishing-reliability/SKILL.md` for production changes.
