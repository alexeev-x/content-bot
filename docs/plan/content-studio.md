# Content Studio

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

08.10.2026: rich Telegram editor is built. Existing saved drafts now autosave after a 1.2 s quiet period; invalid drafts do not autosave, a failed save preserves local edits and stops the retry loop until the text changes or the owner presses Retry, and 409 still requires an explicit conflict decision. The editor exposes a read-only, cursor-paginated history of immutable stored revisions. New-post creation remains explicit; autosave starts after the draft exists on the server. Useful post actions are still open.

## 3.1 Content Studio

Purpose: manually create and prepare content.

Capabilities:

- draft creation.
- rich text editing.
- Telegram entities.
- autosave.
- revisions.
- approval.
- duplicate.
- archive / restore / permanent delete under safe rules.
- rubric and tags.
- source/provenance references where relevant.
- manual media attachments.
- Telegram preview.
- publication history for the post.
- mobile editing.

## 4.1 Post / Content Unit

A post remains the editable content record in the first phases.

Add over time:

- title.
- body.
- Telegram entities.
- status.
- rubric.
- tags.
- source references.
- created/updated timestamps.
- approved revision id.
- archive timestamps.

Later, when TikTok/YouTube variants exist, the broader concept may be named Content Unit in product language, while database migrations can remain incremental.

## 4.2 Revisions

A revision freezes all publish-relevant content:

- title.
- body.
- entities.
- ordered media references.
- relevant rendering settings.

Approval points to a frozen revision. A publication must always reference the exact approved revision it is sending.

## 4.3 Media

Introduce:

- media_assets.
- post_media or revision_media mapping.
- ordered position.
- kind: photo, animation/GIF, video and later document/audio if intentionally supported.
- R2 key.
- original filename.
- detected MIME.
- byte size.
- width/height where relevant.
- duration where relevant.
- checksum.
- created timestamp.

Do not store binary data in D1.

## 5. Content Studio v2

This is the first major product phase after the validated publishing foundation.

### 5.1 Rich editor

Replace the plain textarea.

Requirements:

- bold.
- italic.
- underline.
- strikethrough.
- spoiler.
- link.
- inline code.
- code block.
- quote.
- lists represented safely for Telegram.
- desktop toolbar.
- compact mobile toolbar.
- Ctrl/Cmd shortcuts.
- exact Telegram preview.
- correct UTF-16 entity offsets.
- no HTML parse mode as the canonical storage format.

Storage:

- plain text plus Telegram entities.
- same representation in post and revision.
- pure mapper between editor document and text/entities.
- round-trip tests including emoji and surrogate pairs.

### 5.2 Autosave

Draft behavior:

- debounce after editing.
- explicit state: Сохранено / Сохраняем… / Не сохранено.
- retry action on failure.
- 409 conflict never overwrites server data.
- leaving prompts only when needed.
- approved revisions remain immutable.

### 5.3 Post actions

Posts list and post detail need useful actions:

- Открыть.
- Дублировать.
- Архивировать.
- Восстановить.
- Удалить permanently only under lifecycle rules.
- Открыть публикации.
- Опубликовать / Запланировать when approved.
- Отменить / Перенести relevant pending publication.

Archive UX must explicitly explain how an item gets there and what retention/deletion rules apply.

### 5.4 Manual multi-media attachments

The owner can manually attach multiple files to one post.

Required file classes for the first release:

- photos.
- GIF/animations.
- videos.

UX:

- multi-file picker.
- drag/drop on desktop.
- mobile file selection.
- upload progress per file.
- preview per file.
- reorder.
- replace.
- remove.
- retry a failed upload.
- total media state in the Telegram preview.
- approval freezes media order and identity in the revision.

Validation happens both client-side for UX and server-side for trust:

- magic-byte/type validation.
- accepted MIME list.
- file-size limits based on the actual publishing capability.
- image/video metadata validation.
- filename sanitization.
- no executable interpretation.
- bounded upload count.
- R2 object keys generated server-side.

Telegram publishing strategy:

- no media → send text message.
- one compatible photo → photo message.
- one compatible animation → animation message.
- one compatible video → video message.
- compatible photo/video group → media group where Telegram supports the combination.
- attachments that cannot be represented as one Telegram media group must be rejected with a clear preflight reason or, if product rules explicitly allow it, published as an ordered sequence with a preview that shows the sequence before confirmation.
- never silently transform an unsupported combination.
- store every resulting Telegram message id.

Caption/text limits are capability-specific and validated before approval/publish. Do not hard-code one global 4096 limit for every media mode.

Platform limits that shape the design (checked 07.10.2026 against core.telegram.org/bots/api and developers.cloudflare.com/workers/platform/limits; re-check before implementation):

- Bot API multipart upload: photo ≤ 10 MB (width + height ≤ 10000, ratio ≤ 20); video and animation ≤ 50 MB. Sending by URL is lower (photo 5 MB, other 20 MB), so files are uploaded from R2, not passed as URLs.
- `sendMediaGroup` takes 2–10 items of photo, video, document or audio; animation/GIF cannot be in an album. First release: a GIF together with other media is rejected at preflight, not sent as a sequence, so a half-sent post cannot happen.
- Caption is 0–1024 characters after entity parsing; a text message is 4096.
- A Worker isolate has 128 MB of memory. `FormData` takes only strings and Blobs, so it buffers the file: a 50 MB video fits once but not concurrently. Bound media sends to one per invocation, or build a streamed multipart body with a known length (FixedLengthStream) — prove Telegram accepts it before relying on it.
- Inbound request body ≤ 100 MB on the Free plan, which bounds an upload through the Worker; larger files would need direct-to-R2 upload (a separate decision).

### 5.5 Media failure handling

States:

- selecting.
- uploading.
- uploaded.
- processing metadata.
- upload failed.
- unavailable object.
- invalid type.
- too large.
- removed.

A post cannot be approved while required upload state is unresolved.

## 6. Posts list and server-side data UX

The current table is directionally correct and should stay dense rather than become a card grid on desktop.

Delivered 08.10.2026 (DEV): one live search field and column sort over loaded rows (client-side), phone cards + sort sheet. Server-side search, total counts and URL state are still open.

Required:

- server-side search.
- status filter.
- rubric filter once rubrics exist.
- media/no-media filter later if useful.
- sort.
- cursor pagination.
- URL state.
- bulk archive/delete only where safe.
- row actions.
- useful columns without overloading the table.
- mobile card adaptation.

No disabled controls. If global search is not ready, the shell placeholder should be removed until the feature exists.
