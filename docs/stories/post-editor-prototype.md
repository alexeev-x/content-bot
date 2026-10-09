# Post editor clickable prototype — UX handoff

**Status:** expert review, not validated with users. Prototype-only handoff; it does not authorize production UI changes, API calls, uploads, saves, scheduling, or Telegram sends. The owner-provided six images are references for composition, information density, media states, and interaction—not a source for colors, typography, component styles, or technical claims.

## Goal and source of truth

Help the frontend team implement the owner-requested post editor by first making its structure and interactions inspectable in a code-native clickable prototype. Preserve the existing ALEXEEV Studio palette, design tokens, typography, shared primitives, navigation shell, and publishing-safety rules. Reuse the current `/__proto` harness and mock-only state; never import production feature components or call real endpoints.

Priority when sources disagree: this repository's [`docs/design/UX_SPEC.md`](../design/UX_SPEC.md) for ALEXEEV layout, controls, shell and accessibility; this handoff for the owner-reference-specific editor composition and prototype interactions; owner images for structure only. Current statuses and publishing safety remain governed by the contracts and `docs/stories/posts-lifecycle.md`.

References informing interaction conventions: Telegram lets users preview, reorder, and remove selected album media before sending ([Telegram](https://telegram.org/blog/downloads-attachments-streaming?setln=en)); Later supports adding media from its library and rearranging planned posts in its mobile planner ([Later mobile app](https://help.later.com/hc/en-us/articles/360043244813-A-Guide-to-the-Later-Mobile-App)); Buffer presents creation as one place to edit a draft and attach media ([Buffer Create](https://buffer.com/create)). These inform recognizable interaction patterns, not visual styling. Expert review only; no user validation.

## Current vs target

| Area | Shipped editor evidence | Target represented by owner references | Prototype decision |
|---|---|---|---|
| Hierarchy | [1280 screenshot](../../.logs/media-publish-qa/media-editor-1280.png) shows full application shell, compact content centered in a large canvas, edit fields and attachments in separate bordered regions; global bar crosses the screenshot. | Focused creator workspace: concise header, writing surface and preview share the desktop row; media has a clear visual gallery / upload queue. | Keep real Studio shell and tokens. Use a clear editor header and a two-column workspace: writing/media left, preview right. The screenshot is a viewport crop reference only; never emulate a global bar overlay. |
| Media | Shipped screenshot shows an attachment row with filename and controls, but the shown fixture has no visible thumbnail; empty copy says files appear after selection. | Empty drop target, source chooser, previewable thumbnails, mixed photos/videos, per-file progress, retry/remove/reorder. | Show useful media visual states and a unified source chooser. Use mock thumbnails and explicitly synthetic progress. Never claim 50 MB or format support beyond server contract; label prototype data. |
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
| Library picker | Existing prototype media-library sheet; filter “Все / Фото / Видео”; multi-select; selected count | “Добавить (N)” returns to editor; “Отмена” returns focus to opener | Reuse mock library state; do not invent search if absent. |
| Preview | Telegram-like post with media carousel, type/duration only when part of fixture; exact text order | Previous/next media, enlarge mock preview, back to edit | No views count, real send time or assumed channel stats. |
| Publication setup | Channel selection, “Опубликовать сейчас” / “Запланировать”, date/time and explicit Europe/Chisinau offset; readiness summary | Back to editor preserves mock values; choose action to open confirmation | Only channels/options already represented in app mock data. Unsupported toggles absent. |
| Final confirmation | Dialog names channel and effect (“Опубликовать сейчас в …?” / “Запланировать на … в …?”) | Cancel/Esc closes with focus restored; explicit confirm shows mock accepted/scheduled result | Never call API; label result “Демо: …”, not “Опубликовано” as if real. |
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
6. Screen B with channel, now/schedule, timezone, readiness and final explicit confirmation; modal cancel and mock confirmed result.
7. Autosave pending/saved/failed, offline, conflict, empty/first-entry and keyboard-open states using existing prototype state switcher conventions.
8. Existing ALEXEEV theme toggle should demonstrate both light and dark without changing token values. Prototype banner/state switcher must remain clearly visible and mock-only as required by design README.

Do not add a new color palette or visual primitives. Reuse tokens/primitives from `apps/frontend/src/app/styles/tokens.css` and `apps/frontend/src/shared/ui`; reuse `TelegramPreview`, current app shell, and the `/__proto` store/state switcher where suitable. Prefer extending the existing prototype editor, not a second prototype framework.

## Acceptance criteria

- [ ] All six owner images are represented as explicit states in the prototype index/state switcher; each design state has a desktop and mobile equivalent where it makes sense.
- [ ] At 1280 px the editor has writing/media and preview columns within the ALEXEEV Studio shell; columns stack cleanly when the available width is insufficient.
- [ ] At 375 px the editor is full-screen without shell overlap, with a usable one-column form, mobile media source sheet, and safe-area pinned actions.
- [ ] At 320 px there is no horizontal page overflow, clipped text, or controls below 44px on touch.
- [ ] The blank editor has no premature “saved” status and no mock draft silently appears without user input.
- [ ] Adding media from a source, choosing multiple library items, reordering, removing, retrying a failed item, returning from preview, and returning from settings all have visible outcomes and preserve the prototype's in-memory state.
- [ ] Title/body/media update preview in real time. Preview order matches the media order and distinguishes photo/video without fabricated stats.
- [ ] Every write-like action is mock-only; browser network inspection shows no new request; final confirm has cancel/keyboard exit and returns focus to its trigger.
- [ ] The prototype uses existing ALEXEEV tokens/primitives and remains recognizable in both current themes; no owner-image colors, gradients, radii or type styles are copied.
- [ ] Focus order and headings are coherent, tabs/dialogs use existing accessible primitives, all icon actions have names, no drag-only interaction exists, and status is never communicated by color alone.
- [ ] Viewport screenshots are captured at 375 and 1280 for default, media grid, mobile source sheet, preview, settings/confirm and error states; visual review distinguishes viewport from full-page captures.

## Prototype builder ownership

Builder owns only these paths unless the orchestrator expands scope:

- `apps/frontend/src/pages/prototypes/EditorScreen.tsx`
- `apps/frontend/src/pages/prototypes/Editor.module.css`
- `apps/frontend/src/pages/prototypes/registry.ts`
- `apps/frontend/src/pages/prototypes/proto-store.tsx` only if mock behavior requires it
- `apps/frontend/src/pages/prototypes/ProtoIndex.tsx` only if a new state link needs a group label
- new files under `apps/frontend/src/pages/prototypes/` for editor-specific mock preview/source sheet only

No production files under `features/posts`, `routes/posts`, `shared/ui`, tokens, API/contracts, backend or database are in builder scope. Do not modify `docs/design/UX_SPEC.md` in the prototype implementation task; this is a story handoff, not an automatic canonical-spec approval. Independent ui-qa may accept this prototype and allow implementation without waiting for owner review. Any change to the canonical approved UX system, publishing policy or other owner-only decision still requires owner approval. Follow `docs/AGENT_UI_WORKFLOW.md`.

## API needs

None for the clickable prototype. The prototype must not issue requests. Any later production feature absent from current API/DTO contracts must be raised to the orchestrator before implementation; do not simulate it as already available in production.
