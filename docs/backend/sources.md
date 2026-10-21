# «Источники»: the night watchman

Status: built. The studio screen is one table of events (status a column; «Показать»: события, пропущенные, прошлые анонсы — the last one temporary) whose row opens a side panel with the whole announcement, its images and links, and the actions. A patch is drafted by a template, a Steam announcement by the AI writer (below).

An event is a non-baseline row of `dota_update_items` (Steam announcements and official patch notes, detected by the Cron watcher). The read model and actions live in `modules/dota` (`source-events.ts` pure rules, `source-events-repository.ts` D1); the draft workflow in `app/workflows/` ties them to `content`. Endpoints: `docs/API_CONTRACTS.md` («Sources events»).

## Classification (best effort)
Fixed at detection, stored in `event_type` (migration 0037 backfills old rows from the title).
- `patch`: every patch-note item.
- `treasure`: a Steam announcement whose title or cleaned opening text matches `treasure`, `collector's cache`, `cosmetic|immortal|arcana|hero|player set(s)`, `сокровищ`, or `набор… косметик|предмет`.
- `news`: anything else. A miss only changes which template the draft uses; the owner edits the draft anyway.

## Status
`hidden` (owner dismissed) wins; else `new` (no draft post yet), `published` (the draft's latest publication job succeeded), `drafted`. `publication.status` is the coarse state of that latest publication (queued, sending, sent, failed, unknown, ...).

## AI draft of a Steam announcement (migration 0090, owner 21.10.2026)
A news or treasure event is written by the AI writer, not by a template. Cron (`processDotaUpdates`) claims `ai_job_id` with a conditional UPDATE (once per event) and sends a `source_event` job to Queue `AI_JOBS`; a refused send gives the claim back for the next tick. The consumer sends «<тип> в Steam: <заголовок> / Пишу пост…» to the owner, fetches the whole announcement from Steam (`GetNewsForApp` up to its date, picked by gid; cleaned, at most 3 500 characters: the feed keeps only 500) and runs the writer in automatic mode with those words as the only facts (`app/workflows/source-event-ai-draft.ts`). The post links to the announcement's dota2.com page (owner, 21.10.2026): Steam's events list, the one dota2.com reads, gives its id by the same post time; when it is not among the 40 latest, the Steam page. The writer appends that link when the model left it out, in every version. The message becomes the usual writer draft (`docs/backend/bot.md` «AI writer»); a failed fetch or model call is said in it, and nothing retries by itself. A failure before that message (D1, Telegram) gives the claim back, so the next tick asks again; no model was called yet. The draft's id is kept in `ai_generation_id`; approving it or one of its rewrites makes the post, which becomes the event's `draft_post_id` (replacing an earlier draft that never went out, e.g. a template from before) with the notice counted as sent (the approval reply has the publish buttons). The sourceAlerts preference does not stop it: the draft is the event's draft, not a notice.

The approved post then gets the announcement's images (owner, 21.10.2026: an event post always carries its picture): the approval queues a `source_media` job; the consumer claims it once, downloads each image from Steam's CDN only (at most 10, each within the photo limit) and attaches it through the upload use case (same checks, an idempotency key per image, a stale revision retried), then tells the owner how many arrived. A failure leaves the text post as it is and says so.

«Написать через ИИ» in the side panel (`POST …/ai-draft`) asks for any announcement, a past one included: the claim is taken again, the row stops being baseline (it is an event from then on), and the same job runs. The earlier draft stays linked until the new one is written; a draft from a replaced job that finishes later is not. A replay the queue refused keeps its claim (released, the row would look new to Cron); the owner taps again. The «draft» endpoint still makes a template draft of any event; the studio calls it only for patches.

## Auto-draft at detection (patches)
`processDotaUpdates` (Cron, every 5 minutes, idle ticks only) makes one template draft per new patch: it reserves `draft_post_id` with a conditional UPDATE, then `createPost` with the idempotency key `dota:<sourceKey>:<externalId>`. The owner's «draft» endpoint uses the same reservation and key, so Cron, the endpoint, a re-detection and a rerun leave one post. Hidden events are skipped.

Templates (Russian, in `source-events.ts`; they only rearrange source text, never generate facts, never copy images):
- patch: title `Патч <версия>: что изменилось`; body lists changed heroes and items from the stored parse, watched ones first, at most 15, then `и ещё N`; if the notes are not parsed it says so; then `Источник: <url>`.
- treasure (screen «draft» only): title `Новая сокровищница: <название>`; first sentence of the announcement; link.
- news (screen «draft» only): the title; first sentence of the announcement; link.
The announcement text is Steam's first 500 characters, cleaned of BBCode/HTML, links and image macros, kept in `excerpt` (at most 600).

## Owner notice
After the draft exists the workflow claims `owner_alert_claimed_at` (one conditional UPDATE: once per event) and sends `<тип>: <заголовок> — черновик готов` with the publish keyboard from `app/bot/publish-keyboard.ts` («Опубликовать сейчас → канал», «Открыть в Студии»); the buttons come from `createPublishActions`. The `sourceAlerts` preference off means the claim is consumed and nothing is sent. A failed send is logged, not retried (the claim is spent).

## Budget (Free plan: 50 subrequests per invocation)
The workflow takes `container.queryBudget`: it charges the feed and detail fetches and the Telegram send, and skips drafting (13 left needed) and notices (9 left) when what remains would not leave room for the rest of the tick (12). Leftovers are picked up by the next 5-minute slot. Pinned by `tests/integration/source-events.test.ts` (tick within 50) and `dispatcher-budget.test.ts`.
