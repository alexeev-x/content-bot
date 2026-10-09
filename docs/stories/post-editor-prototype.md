# Post editor — UX handoff v3 (reference-exact)

**Status:** expert review, not validated with users. Revision v3, 09.10.2026. Replaces v1/v2 entirely. Prototype-only: it does not authorize production UI changes, real API calls, uploads, saves, scheduling or Telegram sends in `/__proto`.

## 0. Governing rule

The three owner images are the **target screens**, reproduced visually exactly, built only from our colours, fonts and components. The owner's words: «сделать так как на картинке только с нашими цветами». The binding text is `docs/AGENT_UI_WORKFLOW.md` § Reference fidelity; it overrides everything below if they ever differ.

- Copy from the image: composition, grid and column proportions, the set and order of elements, element shapes (pill / square, radius, borders, dividers, cards vs plain rows), sizes, spacing, density, alignment, visible states.
- Always ours: colours (nearest semantic token, both themes), fonts (nearest step of our type scale and weight), components (`shared/ui` primitives).
- A shape our primitives cannot express: `UI_PRIMITIVE_REQUEST`, never local styling.
- A control the product cannot honour yet: stays in the prototype as a working mock and is listed under `API needs`.
- Priority when sources disagree: publishing safety and real contracts → owner images → `docs/design/UX_SPEC.md` / `docs/design/README.md`. Safety deviations are listed in §8 and nowhere else.
- The current editor layout is **not** the target. Nothing here means "structure only" or "keep the current layout".

## 1. Reference manifest

| ID | Path | Dimensions | Screens it owns | Width it represents |
|---|---|---|---|---|
| `posts-01` | `design-refs/posts/posts-01-editor-board.png` | 1536×1024 board | Desktop editor (frame x27–915, y70–530); desktop Публикация (frame x930–1515); six mobile states (1 Пустой редактор, 2 С добавленными медиа, 3 Загрузка файлов, 4 Изменение порядка, 5 Предпросмотр, 6 Публикация) | Desktop frames = **1440 px viewport**; phones = **375 px viewport** |
| `posts-02` | `design-refs/posts/posts-02-desktop-media-crop-modals.png` | 1672×941 board | Desktop modal «Добавление медиа» (left half) and desktop modal «Кадрирование фото» (right half) | **1440 px viewport**; modals are overlays, only the modal itself is a source |
| `posts-03` | `design-refs/posts/posts-03-mobile-sheet-crop.png` | 1448×1086 board | Mobile bottom sheet «Добавить фото и видео»; mobile full-screen «Кадрирование» | **375 px viewport** |

Not sources (background screens, per the "images that disagree" rule): the editor behind both modals in `posts-02` (header «Все посты», chips «Не опубликовано» / «Автосохранение включено», «Шаг 5 из 6» footer, «Сохранить / Далее») and the editor behind the sheet in `posts-03`. `posts-01` owns the editor. The step counter «Шаг 5 из 6» is therefore **not built**.

Other widths follow `docs/design/UX_SPEC.md` Conventions: builders 375 / 1280 / 1920; QA 320, 375, 390, 768, 1024, 1280, 1440, 1920 plus widths around the 860 px breakpoint. At 1440 and 375 the prototype must match the image; elsewhere it keeps the same element set and order and interpolates proportions (desktop composition ≥ 860 px; phone composition below).

## 2. Measurement conventions

- Source px are read from the board. Scales are derived from a known element: **desktop editor (`posts-01`) ×1.62 to the 1440 viewport** (≈ 889 px frame ↔ 1440 px); **add-media / crop modal (`posts-02`) ×1.087 to a 760 px modal** (≈ 699 src ↔ 760); **phone (`posts-03`) ×0.81 to 375 pt** (phone screen ≈ 460 source px ↔ 375). `posts-01` phones are ≈ 220 source px per 375 pt: ×1.7. Values below are final measurements in target px (1440 / 760-modal / 375) and are **not** re-rounded to 4 px. QA tolerance is ±4 px on those values, or ±2 % for proportions.
- Generated-image inconsistencies are normalized to **one value per repeated element**: thumbnail tiles all equal, toolbar buttons all equal, row pitch constant, radii one value per element class. Each deviation is in §8.
- Each element maps to a token / primitive. Colours are never taken from the image. Font size = nearest step of the type scale; weight = nearest of our weights. Radius = nearest radius token (small controls → `--radius-sm`-class token, cards → card token; builder picks from `tokens.css`, never a literal).
- "REQ-n" = `UI_PRIMITIVE_REQUEST` in §9. "API-n" = entry in §10. "mock" = works in prototype only.

## 3. Per-image element lists

### 3.1 `posts-01` — Desktop 1. Редактор поста (1440)

Grid: app frame = sidebar (app-wide approved width, §8 D11) + work area; **no top bar** on editor routes (§8 D11). Work area splits into **writing column (≈ 66 %)** and **preview panel (≈ 31 %)**, gap ≈ 16 px, outer padding ≈ 24 px. **The writing card ends under the text counter «272 / 4096»** (title, «Текст», toolbar, text area, counter are inside it; the editor writing surface exception in UX_SPEC §0.3 applies). The «Фото и видео» row, the thumbnail strip and the footer row sit **directly on the work surface, not inside the card**. The preview panel is its own bordered card. **The screen fits the 1440×748 frame with no page scroll:** the text area is the flexible element (takes the height left over, internal scroll), the footer row is pinned at the bottom of the work area.

| # | Element, in reading order | Measurement (src → @1440) | Maps to |
|---|---|---|---|
| 1 | Sidebar: logo + «Контент» row | row ≈ 56 px tall (unchanged app-wide shell, §8 D11) | Existing shell. Brand text is the real app name; image text «Контент» is not copied (shell owns it) |
| 2 | Nav list: active item filled+bordered (accent-soft), 5 other items icon+label | row pitch ≈ 52 px; active item pill with radius, 1 px accent border | Existing shell nav active style; labels = real routes (§8 D1) |
| 3 | Sidebar footer: avatar + «Название канала» + «N подписчиков» | block ≈ 40 → 64 px | Existing shell footer / owner block; subscribers → API-2 |
| 4 | Title row (page header; replaces the hidden top bar, §8 D11): «Новый пост» H1 + small status dot + «Черновик сохранён 2 минуты назад» | H1 ≈ 32 px semibold; status 8 px dot + caption | `PageHeader` title + `StatusChip` (dot style) + caption; text from real autosave state |
| 5 | Field label «Заголовок» + counter «58 / 200» right-aligned | label ≈ 14 px; counter muted | `TextField` label/counter slot (`POST_TITLE_MAX` 200) |
| 6 | Title input, **focused look** (accent outline) in image | height 44 px, full column width | `TextField`, focus ring token |
| 7 | Label «Текст» | — | `TextArea` label |
| 8 | Toolbar row inside the text field: B I U S, link, bullet list, numbered list, code `<>`, quote «»; spacer; emoji; undo, redo | 12 buttons, each ≈ 36 px square, divider groups after S, after link, after quote | Format toolbar built from `IconButton` group; entities bold/italic/underline/strikethrough/text_link/code/blockquote are real (`post-entities.ts`); lists → API-5; emoji → API-6; undo/redo client-side |
| 9 | Text area, **5 lines visible**, text colour primary; text ≈ 16–17 px at ≈ 26 px line pitch; toolbar + text box together ≈ 239 px tall at 1440×748 (the text area flexes with the frame height, internal scroll, never fewer than 5 lines at 1440×748) | text box ≈ 130 px of the 239 | `TextArea` |
| 10 | Counter «272 / 4096» bottom-right; **the writing card ends directly under it** | muted caption | `TextArea` counter (`POST_BODY_MAX` 4096) |
| 11 | Section header: image icon + «Фото и видео» + muted «(5 файлов)» ; right: «Упорядочить» (list icon, **soft-filled** button, no border) and «Выбрать всё» (**accent text link**) | header row ≈ 38 px; button ≈ 116×30 | On the work surface (not in the card). Section title + `Button` (soft/tonal, small) + `Button` (link, accent); «Выбрать всё» → selection mode (§5.4, API-9) |
| 12 | Thumbnail strip: **add tile** (dashed border, «+», «Добавить файлы») then 5 media tiles | tile 120–124 px square (one value, 124), gap ≈ 12; add tile same size | Strip of `MediaGridTile` (REQ-1); add tile = dashed variant |
| 13 | Tile overlays: top-right «×» remove (circular dark badge); bottom-left type badge (image icon or video icon + duration «01:24»); video tile has centered play circle | badge ≈ 22 px; duration chip radius pill | REQ-1 overlays; duration from `durationMs` |
| 14 | Footer bar (below both columns, inside frame): «Выйти» (icon + label, secondary), info icon + «Черновик сохраняется автоматически», primary «К публикации →» right | «Выйти» ≈ **167×52**; «К публикации →» ≈ **233×52**; primary uses accent; row sits on the work surface, not in the card | `Button` secondary + `Button` primary + caption; **not sticky**, pinned at the bottom of the work area so the screen fits 1440×748 without scroll |
| 15 | Preview panel header: eye-in-circle icon + «Предпросмотр»; right «×» | header ≈ 44 px | `Panel` header; «×» collapses the panel (closes preview column, state remembered; the column re-opens from a «Предпросмотр» button in the title row when closed — mock-only collapse state) |
| 16 | Tabs «Пост» / «Альбом» (equal two-segment, active filled with accent border) | height ≈ 42 px, full panel width | `SegmentedControl` fullWidth (a mode of one view) |
| 17 | Preview image, full panel width, ~ 4:3, with chevron-right overlay button (circular) | ≈ 340×244 | REQ-4 media preview; `IconButton` overlay |
| 18 | Bubble text: bold title (2 lines), muted body (2 lines clipped), eye icon «0», right «сейчас» | title ≈ 16 px semibold; body ≈ 14 px | `TelegramPreview` + media slot (REQ-4); «0» and «сейчас» are static drafts values (API-3) |

### 3.2 `posts-01` — Desktop 2. Публикация (1440)

Grid: same shell; work area split into **settings column (≈ 42 %)** and **preview card (≈ 46 %)**; title «Публикация» H1 at top-left, «×» top-right.

| # | Element | Measurement | Maps to |
|---|---|---|---|
| 1 | H1 «Публикация», «×» close right | ≈ 32 px; no top bar (§8 D11) | `PageHeader`; «×» = back to editor, state preserved |
| 2 | Section «Канал»; card: avatar circle «K», name «Название канала», «3 420 подписчиков», chevron-right | card ≈ 64 px tall, full column width, radius card | Channel picker row (`RowCard`-style); chevron opens destinations list from `GET /destinations`; subscribers → API-2 |
| 3 | Section «Время публикации»; **two radio rows**: «Опубликовать сейчас» (selected: bordered accent) and «Запланировать» (plain row with divider) | each ≈ 46 px tall | `RadioGroup` card variant (REQ-9) |
| 4 | When «Запланировать»: date field «8 окт. 2026» with calendar icon, time field «12:00» with clock icon and up/down stepper, side by side | each ≈ 224×40; **both fields stay visible in place when «Опубликовать сейчас» is selected** (disabled, showing the current date/time) | `DateTimeField` (date + time); stepper per REQ-10 |
| 5 | ~~Section «Дополнительные настройки»~~ — **not built** (owner decision 09.10.2026, `docs/DECISIONS.md`): the section and its three switches are omitted in the prototype and the real UI; «Назад» / «Опубликовать» follow «Время публикации» | — | API-1 |
| 6 | «← Назад» secondary button, left bottom | ≈ 150×48 | `Button` secondary + arrow icon |
| 7 | Preview card heading «Предпросмотр публикации» | — | `Panel` header |
| 8 | Preview image with left/right chevrons and **«1 / 5» counter pill** at bottom-center | ≈ 320×240 | REQ-4 carousel |
| 9 | Bubble: bold title (2 lines), body (2 lines), eye «0», «сейчас» | as 3.1 #18 | `TelegramPreview` |
| 10 | Primary «Опубликовать ➤» full preview-column width, below caption «Пост будет опубликован в выбранном канале.» | ≈ 340×48; caption ≈ 12 px centred | `Button` primary full width + caption; safety wording in §8 D2 |

### 3.3 `posts-01` — Mobile 1–6 (375)

Common phone chrome: back arrow + «Новый пост» + status (dot + «Черновик сохранён» or «Сохранение…») in a 56 px header row; no shell bar (UX_SPEC §0.6). Fields sit on the plain surface — **no bordered card around each section**. Footer pinned, **one row shared by both buttons**: «Выйти» ≈ **150** + «К публикации →» ≈ **178** (fills the rest), height 44 px, safe-area padded. The status bar (9:41, signal) is device chrome and is **not** built.

| State | Elements in order | Maps to |
|---|---|---|
| **M1 Пустой редактор** | Header; «Заголовок 0 / 200» + focused input with placeholder «Введите заголовок» (≈ 44 px); «Текст 0 / 4096» + toolbar (B I U S link bullet list; **narrower than desktop: 7 buttons, rest in overflow**) + area with placeholder «Напишите текст публикации»; «Фото и видео» row; dashed drop area ≈ 200 px tall: image icon in accent-soft square, «Добавьте фото или видео», muted «Поделитесь яркими моментами вашего путешествия», small primary «Добавить медиа» button; pinned footer | `TextField`, `TextArea`, toolbar (§3.1 #8), REQ-3 `Dropzone`, `Button` |
| **M2 С добавленными медиа** | Header status «Черновик сохранён»; title filled «58 / 200»; text filled «272 / 4096» and full toolbar (B I U link list list ⌘ emoji undo); «Фото и видео» then **3-column grid of square tiles with × and type badges**, 2 rows (5 tiles; 3+2) | REQ-1 grid ≈ 329 wide, tile ≈ 104×104 pt, gap ≈ 13 |
| **M3 Загрузка файлов** | As M2; header status «Сохранение…» with accent dot; grid of 3: tile 1 = **success** (green check circle, «100%»), tile 2 = video poster with progress ring «65%», tile 3 = poster with **orange** ring «60%» | REQ-1 `state` = `done` / `uploading` / `failed`; orange state is read as **failed at 60 %** with retry (§8 D4); status carried by icon + text, never colour only |
| **M4 Изменение порядка** | Header «Новый пост» + «Черновик сохранён»; section row «Фото и видео» left, accent link «Готово (5)» right; **5 list rows**: drag handle (⠿), ≈ 70×46 landscape thumbnail (video has play + «01:24» chip), file name + muted meta (video: «video_1.mp4» + «01:24»), × at right; row pitch ≈ 52 pt (thumb 70×46), hairline dividers; pinned footer | `Panel` list rows (`ListParts`), `MediaTile` ≈ 70×46 landscape, handles = REQ-1b; Up/Down keyboard (§6.3) |
| **M5 Предпросмотр** | Header; two-segment «Пост / Альбом» full width; preview image ≈ 343×200 with chevrons; bold title (2 lines) + body (3 lines) + eye «0» + «сейчас»; pinned footer | `SegmentedControl`, REQ-4, `TelegramPreview` |
| **M6 Публикация** | Header «Публикация» (back arrow, no status); «Канал» + row; «Время публикации» + two radio rows («Сейчас», «Запланировать») + date and time fields on one row (visible, disabled for «Сейчас»); no «Настройки» section (owner decision 09.10.2026); pinned footer «← Назад» + «Опубликовать ➤» | same as 3.2 on one column; mobile uses the shorter image label «Сейчас» |

Mobile tile and row sizes are normalized to **one value per class**: grid ≈ 329 wide, tile 104 pt square (3 columns, gap ≈ 13), M4 list thumbnail ≈ 70×46 landscape.

### 3.4 `posts-02` — Desktop modal «Добавление медиа» (1440)

Modal ≈ 698 src wide; proportions are expressed in % of modal width so the Dialog can be sized by one token (REQ-0 wide Dialog, target 760 px at 1440, max-height 90 vh, inner scroll). Backdrop = dimmed editor.

| # | Element | Measurement | Maps to |
|---|---|---|---|
| 1 | Title «Добавление медиа» left, «×» right | ≈ 26 px title | `Dialog` header |
| 2 | **Three equal source tabs**, each a bordered tile with icon (left, in square), bold title and muted hint: «С компьютера / Загрузите файлы с устройства» (selected: accent border + accent-soft fill), «Медиабиблиотека / Ваши сохранённые файлы», «Недавние / Ранее загруженные файлы» | each ≈ 31 % width, ≈ 72 px tall, gap 2 % | Tabs with REQ-2 `SourceTab` (card tab variant); roving arrow keys |
| 3 | Drop zone (tab 1): dashed border, radius, centered image-plus icon (≈ 36 px), bold «Перетащите фото и видео сюда», muted «или выберите файлы на устройстве», primary «Выбрать файлы» button (icon + label, **≈ 292×44**), 2-line caption with limits | ≈ 94 % wide × **≈ 257 px tall** (760 modal) | REQ-3 `Dropzone`, `Button` primary; **caption uses true limits (§8 D3)** |
| 4 | Tab 2/3 content (not drawn in the image, same slot, same height): library grid with search-less newest-first list, kind filter, multi-select checkmarks | same area as 3 | Library list: `MediaGridTile` selectable; `GET /media` (API-7); loading/empty/error per §5 |
| 5 | Row «Выбранные файлы (2)» left; «Очистить всё» (trash icon, bordered button) right | row ≈ 48 px | Section title + `Button` secondary small |
| 6 | **File rows** (2 shown; same row for N): **landscape thumbnail ≈ 120×62, flush left** in the row (video has play circle), bold file name, muted «4.2 МБ • 4032 × 3024» (video adds «• 01:24»), **status column**: green check + «Готов к добавлению» **or** spinner ring + «Загрузка…» + «62 %» + progress bar under it, × at right | row ≈ **68 px tall**, gap ≈ 6 px, row bordered with radius | REQ-5 `UploadRow`, REQ-6 `ProgressBar`; `IconButton` remove |
| 7 | Footer: «Отмена» (secondary), «+ Добавить в пост» (primary), right aligned | «Отмена» ≈ **187** wide, «Добавить в пост» ≈ **232** wide, height 44 px | `Button` secondary / primary |

### 3.5 `posts-02` — Desktop modal «Кадрирование фото» (1440)

| # | Element | Measurement | Maps to |
|---|---|---|---|
| 1 | Title «Кадрирование фото», «×» | as 3.4 #1 | `Dialog` header |
| 2 | **Left: crop canvas** panel, rounded, image fills it; dimmed outside; crop frame white 1.5 px border; **4 square corner handles**; **rule-of-thirds grid** (dashed white lines, 2 vertical + 2 horizontal) | canvas ≈ 60 % × ≈ 420 px | REQ-7 `CropCanvas` (feature-level, uses tokens `--on-media`/overlay) |
| 3 | **Right: «Предпросмотр» panel**: heading, preview image ≈ 206×222 of the current crop, checkbox «Использовать как обложку» + muted «Это фото будет отображаться в предпросмотре поста» | panel ≈ 36 % wide | `Panel`, `Checkbox`; semantics §8 D5, API-4 |
| 4 | Ratio tiles: **«Оригинал» (selected: accent border + fill), «1:1», «4:5», «16:9»**, each with a shape icon (rectangle in that ratio) above label | 4 equal tiles, each ≈ 14 % × 56 px, gap ≈ 12 px | REQ-8 `RatioTile` group (toggle group); icon per ratio |
| 5 | Row: label «Масштаб», **− button, slider with round thumb (accent filled track), + button** | row ≈ 48 px; slider ≈ 256 px wide; − / + ≈ 36 px | REQ-11 `Slider` with steppers |
| 6 | Right of the row: rotate-left icon button, readout «0°», rotate-right icon button, «Сбросить» (bordered button) | buttons 36–44 px square (desktop pointer 36; touch 44) | `IconButton` ×2, `Button` secondary |
| 7 | Footer: «Отмена» (secondary) and primary «Сохранить» with file icon | **both ≈ 180 px wide**, height 44 px | `Button` |

### 3.6 `posts-03` — Mobile sheet «Добавить фото и видео» (375)

Bottom sheet over the dimmed editor; top corners rounded, grabber bar centered at top.

| # | Element | Measurement | Maps to |
|---|---|---|---|
| 1 | Grabber | 40×4 | REQ-13 `BottomSheet` (or `Drawer` bottom placement) |
| 2 | Title «Добавить фото и видео» | 20 pt semibold | sheet header |
| 3 | Row «Снять фото / Открыть камеру устройства» | row **64 pt** (≥ 44), 40 pt icon circle (accent-soft) with camera icon, bold title, muted hint, right chevron | REQ-13 `ActionRow` |
| 4 | Row «Выбрать из галереи / Фото и видео с устройства» | same | `ActionRow` |
| 5 | Row «Открыть медиабиблиотеку / Ваши сохранённые файлы» | same; folder icon | `ActionRow` |
| 6 | «Отмена» full-width bordered button | 48 pt | `Button` secondary |

«Снять фото» is shown always (per image); it requests the device camera through `<input capture>`; where the browser ignores `capture` it behaves as the gallery picker and the hint reads «Откроется выбор файла» (capability branch, no false promise).

### 3.7 `posts-03` — Mobile «Кадрирование» (375)

Full-screen route, no shell bar.

| # | Element | Measurement | Maps to |
|---|---|---|---|
| 1 | Header: left «← Назад» (**accent** text link), centered «Кадрирование», right primary pill «Готово» | header ≈ 56 pt; «Готово» ≈ 76×44 pt | Header row; `Button` primary small |
| 2 | **Canvas full width, ≈ 400 pt tall**: dimmed outside frame, white frame border, **corner handles (L-shaped corner brackets in this image; squares in `posts-02`)**, thirds grid lines | canvas 100 % × ≈ 400 | REQ-7 `CropCanvas`; handle shape normalized (§8 D6) |
| 3 | Ratio tiles row: **«Ориг.» (selected), «1:1», «4:5», «16:9»**, icon above label | 4 equal ≈ 81×69 pt, gap ≈ 8 | REQ-8 `RatioTile`; short label «Ориг.» on phone, «Оригинал» ≥ 860 px |
| 4 | Label «Масштаб» left; label «Повернуть» right; below: pill container with **− slider +**, and **two square rotate buttons** (left, right) | pill ≈ 245 pt wide; **− / + are plain small symbols** (no circles or fills); rotate buttons 44 pt | REQ-11 `Slider`, `IconButton` |
| 5 | **Cover card**: thumbnail ≈ **72×56** of the crop, bold «Использовать как обложку» (**one line**), muted «Эта фотография будет показываться в превью публикации.» (**two lines**), switch at right | card ≈ **94 pt tall**, radius card | `Card`, `Switch`; semantics §8 D5, API-4 |

Desktop and mobile crop share one state; the desktop **«Сбросить»** and angle readout **«0°»** exist on desktop only (not drawn on the phone image) — on phone «Сбросить» is a text button beside the «Повернуть» label (§8 D7).

## 4. Crop interaction spec

State: `ratio` (`original|1:1|4:5|16:9`), `zoom` (1.0–4.0, step 0.05), `rotation` (multiple of 90° plus fine angle readout; image shows **«0°»**, the controls only ±90°, so the readout shows 0°, 90°, 180°, 270°), `frame` (x, y, w, h in image space), `cover` (bool), `dirty`.

- **Open:** from a photo tile (desktop: click the tile or «Кадрировать» in the tile menu; phone: tap tile → bottom menu «Кадрировать / Убрать из поста»). Videos and GIFs never show the entry. Starts with ratio «Оригинал», zoom 1 (slider thumb **mid-track by default**, as in the images; the zoom-to-slider mapping is the builder's), rotation 0, **an inset frame ≈ 73 % of the canvas (centred) with all four handles visible** (never flush with the canvas edge) — or, for a derivative (`sourceMediaId` set), loads the **original** (`GET /media/{sourceMediaId}/content`) so the owner can re-frame freely.
- **Pan:** drag inside the frame moves the image under the fixed frame (frame stays inside the image after rotation and zoom; clamped, never shows empty background). Keyboard: canvas is a focusable region (`role="application"`, label «Область кадрирования»); arrow keys move 1 % of image size, Shift+arrow 10 %.
- **Resize:** drag a corner handle to resize the frame, ratio locked unless `Оригинал` (free ratio in that mode, initial = image ratio). Handles are 12 px visible on desktop, with a 44×44 px invisible hit area on touch. Keyboard: with a handle focused (Tab cycles 4 handles, `aria-label` «Левый верхний угол» etc.), arrows resize by 1 %, Shift by 10 %. Minimum frame 10 % of the shorter image side and ≥ 320 px output on the shorter side (below that: slider and frame stop, inline caption «Слишком мелко для публикации»).
- **Ratio tiles:** select a ratio → frame snaps to the largest centered frame of that ratio at the current zoom, with a 150 ms transition (instant under `prefers-reduced-motion`). `aria-pressed` on the active tile. Arrow keys inside the group move selection (roving).
- **Zoom:** slider 1×–4× with − and + buttons (step 0.25 per press, 0.05 by arrow keys, Home/End), `aria-valuetext` «Масштаб 150 %». Wheel and pinch also zoom (progressive enhancement only; the slider is the accessible path). The frame stays centred on its current centre.
- **Rotate:** left/right buttons rotate the image 90° (counter-)clockwise; readout «90°» updates; frame is re-clamped. Names: «Повернуть влево», «Повернуть вправо».
- **Reset («Сбросить»):** restores ratio «Оригинал», zoom 1 (slider mid-track), rotation 0, the initial inset frame; disabled when already at default (`aria-disabled`, not hidden).
- **Live preview:** the right panel / cover-card thumbnail re-renders from the same transform with ≤ 100 ms lag.
- **Cancel / Назад / Esc / ×:** discard the in-progress crop and return focus to the tile's crop trigger. If `dirty`, the desktop modal and phone route ask nothing (nothing is lost but an unsaved crop; undo is «open again»); leaving costs nothing — consistent with "leaving is free". The attached photo is untouched until Save succeeds.
- **Save («Сохранить» desktop / «Готово» phone):** rasterize the transform to JPEG (or PNG when the source has transparency) ≤ `PHOTO_MEDIA_MAX_BYTES` (10 000 000 B), then `POST /api/v1/posts/{id}/media/{mediaId}/crop?revision&fileName` with `Idempotency-Key` (`docs/API_CONTRACTS.md` §Media). Button shows a spinner and «Сохраняем…» and is disabled (no double submit). **Success:** the tile is replaced at the same position, `sourceMediaId` set, the dialog closes, a toast «Кадрирование сохранено» with **«Отменить»** restores the previous attachment by re-cropping from the original (undo beats confirm; works while the toast is open and also from the tile menu «Вернуть исходное»). **Failure (400/413/503/409):** dialog stays open, inline banner with the reason: 413 → «Фото после кадрирования больше 10 МБ — уменьшите масштаб», 409 `STALE_REVISION` → «Пост изменился, обновите страницу — ваши правки текста сохранены», 503 → «Не удалось сохранить. Повторить».
- **Prototype:** all of the above works with a canvas draw on `crop-lake-demo.png`; Save writes a mock derivative into in-memory state only; no request.
- **Touch targets:** all buttons, ratio tiles, − / +, rotate, handles' hit areas ≥ 44 px on touch (UX_SPEC); 36 px allowed for fine pointer desktop only.
- **Cover toggle in this dialog:** see §8 D5.

## 5. States per screen

Widths: «D» = 1440 desktop (images), «P» = 375 phone (images); other widths per §1.

### 5.1 Editor (D, P)
| State | Visible result | Actions / exit |
|---|---|---|
| Empty (P: M1) | Placeholder «Введите заголовок», placeholder «Напишите текст публикации», empty dashed Dropzone with copy from M1; status pill «Черновик сохранён» is shown as in image M1; primary «К публикации →» **disabled** with reason caption «Добавьте заголовок или текст» (availability from validation) | Type → status «Изменено» → «Сохранение…» → «Черновик сохранён» (the pill already reads «Черновик сохранён» when empty) |
| With media (D: strip, P: M2) | Strip/grid exactly as §3.1 #12 / §3.3 M2; media count in section title | Tile click → tile menu «Кадрировать / Убрать из поста»; × removes with toast «Убрано из поста» + «Отменить» (only detaches, never deletes library file) |
| Uploading (P: M3) | Per-tile progress ring + %; uploads are **sequential per post** (server rule), queued tiles show «В очереди» | Cancel on a tile (×) stops that item; others continue |
| Failed + retry | Tile gets warning icon + «Ошибка», plus tile menu «Повторить / Убрать»; reason line under the strip: «Не удалось загрузить файл.mp4: размер больше 50 МБ» | Retry returns to uploading; remove detaches |
| Reorder (D: «Упорядочить», P: M4) | Strip becomes a list (D: tiles keep strip but gain drag handles and a «Готово» link; P: list view of M4); each row has handle + Up/Down buttons | Done saves order via `PATCH media/order` (§6.3) |
| Selection («Выбрать всё») | `SelectionBar`: «Выбрано 5» + «Убрать из поста» + «Отмена» | Remove = N sequential detaches (API-9); Esc cancels |
| Validation | Title empty / > 200, body > 4096 (counter turns error colour **plus** text «Превышено на N»), 11th file blocked with «В посте не больше 10 файлов» | Primary disabled with named reason |
| Limit reached (10) | Add tile and «Добавить медиа» disabled, caption «Достигнут лимит: 10 файлов» | Remove one to add |
| Save failed / offline / conflict | Banner + status «Не сохранено», typed text preserved; conflict = «Пост изменился» with «Обновить» | Retry; never blocks typing |
| Read-only (approved/sent) | Lifecycle banner, fields disabled, toolbar disabled; preview works | Back only |
| Loading | Skeleton with final geometry (two columns, toolbar, 5 tile placeholders) | — |
| Long content | Title 200 chars wraps in two lines in input scroll; file names ellipsis in middle (`very_long_name…final.jpg`) with full name in `title`/tooltip | — |

### 5.2 Preview (D panel, P: M5)
Tabs «Пост» (first media, caption) and «Альбом» (all media grid as Telegram groups; caption under first). Chevrons and arrow keys navigate; «N / M» pill on carousel on the publication screen. No media: text-only bubble. Preview image load failure: placeholder tile with «Не удалось загрузить», retry; does not block remove/reorder (§10 API-8).

### 5.3 Add media modal (D) and sheet (P)
| State | Behaviour |
|---|---|
| Empty queue | Drop zone only; footer «Добавить в пост» disabled, «Очистить всё» absent |
| Drag over | Drop zone border → accent, copy «Отпустите файлы» |
| Rejected file | Row appears in error: «.pdf — формат не поддерживается» / «фото больше 10 МБ»; excluded from the count |
| Uploading / ready | Rows as §3.4 #6; «Добавить в пост» enabled when ≥ 1 ready; with uploads in progress it stays enabled for ready ones and says «Добавить (1)» |
| Library / Недавние tabs | Skeleton (6 tiles) → grid; empty: «Здесь пока нет файлов»; error: inline «Не удалось загрузить библиотеку. Повторить»; selection count in footer «Добавить (N)»; `Недавние` = same endpoint newest-first, first 20 |
| Close with unfinished queue | Files already in the queue are kept in the draft's modal state for this editor session; «Отмена» discards the queue (the only real loss) after a confirm naming the count |
| Focus | Opens on selected tab; Esc/Отмена returns focus to «Добавить файлы» tile or «Добавить медиа» |

### 5.4 Crop (D modal, P route)
Loading source image (skeleton canvas), ready, saving, save error, unsupported (video/GIF: no crop entry), minimum size reached, `prefers-reduced-motion`.

### 5.5 Publication (D, P: M6)
| State | Visible |
|---|---|
| Now | «Опубликовать сейчас» selected; date/time fields **stay visible in place**, disabled and showing the current date/time (as in the images); button «Опубликовать» |
| Schedule | Date + time fields enabled, defaults to the next full hour; timezone caption under the fields; button «Запланировать» |
| Validation | Past time (> 5 min ago) → «Время уже прошло»; > 366 days → «Не дальше чем через год»; no channel → «Выберите канал»; disabled channel → blocked with reason; unfinished upload → blocked, caption «Дождитесь загрузки файлов» linking back to the editor |
| Draft (not approved) | Primary button is «Одобрить» in the same place (§8 D2); after mock approval it becomes «Опубликовать» |
| Confirm | Dialog «Опубликовать сейчас в «Название канала»?» / «Запланировать на 12 окт. в 12:00 в «Название канала»?» with the effect named, «Отмена» / confirm; focus returns to the trigger |
| Result | 202 → «Поставлено в очередь» / «Запланировано» (never «Опубликовано» until server `sent`); mock result labelled demo in the prototype |

## 6. Flow

`Посты → Новый пост (editor) → media modal/sheet → crop → editor → К публикации → Публикация → confirm → result`. Back from Публикация returns to the same editor state; «Выйти» returns to Посты (draft autosaved, nothing lost, no confirm). Mini App: BackButton replaces the in-page back arrow; MainButton carries «К публикации →» / «Опубликовать»; the pinned footer shows only «Выйти» (UX_SPEC §0.10).

### 6.3 Reorder
Drag-and-drop the tile/row (pointer, touch long-press) with a drop indicator — the only visible way (owner decision 09.10.2026: no «Выше» / «Ниже» buttons). Keyboard and screen-reader alternative without visible buttons: focus a tile/row, Space to lift, arrows to move, Space to drop, Esc to cancel. Live `aria-live` text «Файл 3 перемещён на позицию 2». Server write (`PATCH media/order`) after drop, serialized per post.

## 7. Themes

Dark theme is the image's look with our dark tokens (surface, panel, border, accent, semantic status tokens); **light theme is the identical layout with light tokens**. Image blue accents map to `--accent*`; image green (ready) and orange (warning/failed) map to `--success` / `--warning` / `--danger` tokens, always with icon and text. QA compares layout in both themes; colours are verified against tokens only.

## 8. Allowed deviations (the only ones)

| ID | Deviation | Reason |
|---|---|---|
| D1 | Sidebar labels are the real routes (Посты, Публикации…); the image's «Черновики / Запланированные / Опубликованные / Статистика» are not unbuilt nav sections | `docs/DECISIONS.md` honest nav; shell shape, density, active style and channel footer are copied |
| D2 | The draft publication button is «Одобрить» in the same place until the server returns `approved`; then «Опубликовать» / «Запланировать» with confirm. Caption under the button names the channel and timezone «Europe/Chisinau (UTC+3)» | Publishing safety: approve-then-publish lifecycle (`publishing-reliability`), no combined mutation |
| D3 | Dropzone caption: «Фото — JPG, PNG, WebP до 10 МБ; GIF и видео MP4 — до 50 МБ. В посте до 10 файлов.» Image text «MOV» and «50 МБ для всех» are false | `apps/contracts/src/media.ts` (`PHOTO_MEDIA_MAX_BYTES`, `VIDEO_MEDIA_MAX_BYTES`, `POST_MEDIA_MAX_ITEMS`); accepted types in `media-stream.ts` |
| D4 | The orange ring in M3 means failed-with-retry; thumbnails normalized to equal sizes | Image inconsistent |
| D5 | «Использовать как обложку» is built in both crop screens as drawn. Semantics: **moves this photo to position 1** (existing reorder); helper text on first hover/tap: «Фото станет первым в посте. Telegram не задаёт отдельную обложку.» Toggle off leaves order unchanged | No cover field in `postMediaSchema`; API-4 |
| D6 | Corner handles on every crop screen are one shape (square on desktop, L-bracket on phone as drawn); both are drawn by `CropCanvas` variants | Two images draw them differently; each follows its own image |
| D7 | Phone has «Сбросить» as a text button on the «Повернуть» label row; desktop readout «0°» absent on phone | Phone image shows no reset, the flow needs it |
| D8 | Image counters like «58 / 200» show live values | Real data |
| D9 | The preview panel «×» collapses the column (re-opened from the title row) | The image draws a close button without saying what it does |
| D10 | «Шаг 5 из 6», «Сохранить / Далее» footer from `posts-02` backgrounds are not built | Not a source |
| D11 | Shell: on editor routes (`/posts/new`, `/posts/{id}`, publication screen) the **top bar is hidden** (focused editor shell; back/title live in the page header). The sidebar stays the app-wide approved one (width and rows unchanged) although the image sidebar is wider | Orchestrator decision: one shell app-wide; the image shows no top bar |

## 9. UI_PRIMITIVE_REQUESTs (to design-system via orchestrator)

Until each lands, the prototype records a token delta and builds locally in prototype CSS only with tokens (no literals); production waits.

| ID | Request | Used by |
|---|---|---|
| REQ-0 | `Dialog` wide size variant (≈ 760 px, 90 vh scroll body, header with title + «×») | add media, crop |
| REQ-1 | `MediaGridTile` (124 px desktop / 104 pt phone square): image/poster, remove «×», type badge, duration chip, play circle, drag-handle, add-tile dashed variant, states `ready / uploading(progress ring %) / done / failed(retry)`, selectable (checkmark) | strip, grid, library, reorder |
| REQ-1b | `MediaListRow` (handle + 44 pt thumb + name/meta + remove) | M4 reorder, file rows |
| REQ-2 | `Tabs` card variant: icon square + title + hint, 3 equal columns | source tabs |
| REQ-3 | `Dropzone` (dashed border, accent-on-drag, icon + title + subtitle + action slot) | M1, add media |
| REQ-4 | `TelegramPreview` media slot with carousel chevrons, «N / M» counter pill, album grid mode | preview panel, M5, publication |
| REQ-5 | `UploadRow` (64 px thumb, name, meta, status slot, remove) | add media queue |
| REQ-6 | `ProgressBar` and circular progress ring | uploads |
| REQ-7 | `CropCanvas` (feature-level component on tokens: overlay token, handle size token, grid line token) | both crops |
| REQ-8 | `RatioTile` / toggle-group variant of `SegmentedControl` with icon above label | both crops |
| REQ-9 | `RadioGroup` card variant (bordered selected row, dividers) | publication |
| REQ-10 | `DateTimeField` time stepper variant (up/down) | schedule |
| REQ-11 | `Slider` with − / + steppers | zoom |
| REQ-13 | `BottomSheet` (grabber, title, `ActionRow` icon-circle + title + hint + chevron) | phone source sheet, tile menu |
| REQ-14 | Rich-text `Toolbar` button group (separators, overflow for narrow widths) | text field |

## 10. API needs

Each element still appears in the prototype as a working mock.

| ID | Element | Why it cannot be honoured today | Needed |
|---|---|---|---|
| API-1 | «Разрешить комментарии», «Уведомлять подписчиков», «Закрепить пост» switches | `createPublicationInputSchema` has only `postId, revision, destinationId, scheduledAt, timezone`; comments depend on channel linking, not per message | **Owner decided 09.10.2026: no switches** in prototype or implementation; revisit later as a separate decision |
| API-2 | «N подписчиков» in sidebar footer and channel card | `destinations.ts` has no member count | Optional `memberCount` via Telegram `getChatMemberCount` |
| API-3 | Eye «0», «сейчас» in preview | Draft has no views; «сейчас» is a prototype caption | None: show «0» and relative time; no stats claims |
| API-4 | «Использовать как обложку» | No cover field | None for D5 mapping (reorder); separate cover = not supported by Telegram |
| API-5 | Bullet / numbered list buttons | Telegram has no list entity | None: insert plain-text prefixes («• », «1. ») |
| API-6 | Emoji button | No emoji picker API | None: insert Unicode via a small picker popover; entity `custom` not used |
| API-7 | «Медиабиблиотека» / «Недавние» | Exists: `GET /media?kind&cursor&limit`, newest first, retained assets only | None; «Недавние» = first page newest-first |
| API-8 | Thumbnails and video posters | Only full-size `GET /media/{id}/content`; DTO has no poster/thumbnail; photos up to 10 MB would load per 124 px tile | Thumbnail/poster endpoint or derivative (width ≤ 512) — recommended; until then lazy load with object URLs and revoke on unmount |
| API-9 | «Выбрать всё» → bulk remove | One DELETE per attachment, revision increments each time | Optional bulk detach; until then sequential DELETEs with progress |
| API-10 | Per-file upload progress % | `fetch` has no upload progress | Frontend: `XMLHttpRequest`/streaming; no API change |
| API-11 | Crop | Exists: `POST /posts/{id}/media/{mediaId}/crop`, `sourceMediaId` retained; no persisted geometry | None. Reopening uses original via `sourceMediaId`; geometry is not restored (re-frame from scratch) |

Contract facts that bind copy: photo ≤ 10 000 000 B, GIF/video ≤ 50 000 000 B, ≤ 10 attachments, title ≤ 200, body ≤ 4096. Private preview uses `GET /api/v1/media/{mediaId}/content` with the in-memory session; object URLs are revoked on change/unmount and never persisted. Upload, remove, reorder, attach are revision-aware and serialized per post; success is shown only after the server returns the new revision; remove failure keeps the media with «Не удалось убрать файл из поста. Повторить»; 409 preserves typed text and offers reload.

## 11. Publication lifecycle (preserved)

«К публикации» navigates only. A draft needs the existing explicit approval; after `approved`, the publication confirm creates one publication with the existing idempotency key. Returning to the editor keeps post and settings. A `202` is accepted/queued/scheduled, never «Опубликовано»; only server `sent` means sent. `unknown` sends are never auto-retried (`.agents/skills/publishing-reliability/SKILL.md`).

## 12. Realistic fixtures (prototype and QA)

- Five media items matching the images: real photos ≥ 1000 px wide (use `apps/frontend/src/pages/prototypes/assets/crop-lake-demo.png`, 1122×1402, plus more landscape photos of mountains, sunset, waterfall at ≥ 1600×1067), **two videos with real posters** and durations («01:24», «00:46», «00:36»), file names `altai_lake.jpg`, `sunrise_trekking.mp4`, `mountains.jpg`, `waterfall.mp4`, `lake.jpg`, plus a **long** name `Невероятные_пейзажи_Алтая_3_дня_в_горах_и_озёрах_финальная_версия_для_публикации.jpg`.
- Title: «Невероятные пейзажи Алтая: 3 дня в горах и озёрах» (58 chars) and a 200-char variant; body ≈ 272 characters with emoji; a 4096-char variant for the counter.
- Channel «Название канала» with a 3 420 subscribers fixture; schedule fixture «8 окт. 2026, 12:00».
- Never a 1×1 placeholder, empty box or SVG icon in place of media; QA treats such evidence as `NOT_VERIFIED`.
- Fixtures for each state: empty, 5 media, uploading (62 % / 65 % / 100 %), failed, reorder, preview album 1/5, publication now / schedule, validation.

## 13. Acceptance criteria (Given / When / Then)

1. **Element parity.** Given `posts-01` / `posts-02` / `posts-03`, when the prototype is screenshotted at 1440 (D) and 375 (P), then every element in §3 exists, in the listed order, with the listed shape; positions/sizes are within ±4 px of the normalized measurement (±2 % for proportions); deviations are only §8.
2. **Tokens only.** Given the prototype CSS, when searched for literal colours, font sizes, radii not in `tokens.css`, then there are none; each element uses the primitive or REQ listed in §3.
3. **Both themes.** Given the theme toggle, when switched, then layout is unchanged and only tokens differ; contrast per UX_SPEC.
4. **Crop.** Given a photo tile, when the owner drags the image/frame, resizes corners, moves slider or ± buttons, rotates ±90°, picks each ratio, presses Сбросить, then the canvas, thirds grid and preview update as §4; **When** Отмена/Назад/Esc, **then** the attached photo is unchanged and focus returns to the trigger; **When** Сохранить/Готово, **then** a derived image replaces it at the same position (mock) with an undo toast.
5. **Keyboard / touch.** Given no pointer, when only keys are used, then every crop interaction, reorder, tab and dialog is operable and announced; touch targets ≥ 44 px; tab order matches reading order.
6. **Modals/sheets.** Given «Добавить медиа», when opened at 1440, then the 3-tab dialog appears; at 375, the bottom sheet with 3 rows + Отмена; Esc/Отмена restore focus.
7. **Reorder / remove / retry.** Given 5 media, when reordered, removed or a failed tile retried, then preview order and counts update and an undo toast follows removal.
8. **Publication.** Given the publication screen, when «Запланировать» is chosen, then date/time become editable (visible but disabled for «Сейчас»); when «Опубликовать» (after approval) is pressed, then a confirm names channel and effect; Cancel changes nothing.
9. **Truth.** Given the Dropzone caption, then limits equal the contract (D3); no MOV, no «50 МБ для всех».
10. **Mock-only.** Given browser network inspection of `/__proto`, then no request is made by any control.
11. **Viewports.** Builders: 375, 1280, 1920; QA: full matrix (§1). No horizontal overflow at 320; no clipped long names.
12. **Fixtures.** Given the screenshots, then photos are real ≥ 1000 px, videos have posters and durations, 5 items shown.

## 14. Builder ownership

ui-prototyper owns only `apps/frontend/src/pages/prototypes/**` (editor screens, CSS, registry, store if needed, new editor-specific mock components and assets). Not in scope: `features/`, production routes, `shared/ui`, tokens, contracts, backend. ui-prototyper writes the **reference measurement** (grid, spacing, sizes, radii, type roles, icons, chosen token or primitive) from §3 before building. Independent ui-qa checks element parity per `docs/AGENT_UI_WORKFLOW.md` § UI QA. Follow that document for gates.
