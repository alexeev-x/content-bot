# «Источники»: the night watchman

Status: built (backend and contracts); the screen is a later frontend task. AI text generation is not part of it.

An event is a non-baseline row of `dota_update_items` (Steam announcements and official patch notes, detected by the Cron watcher). The read model and actions live in `modules/dota` (`source-events.ts` pure rules, `source-events-repository.ts` D1); the draft workflow in `app/workflows/` ties them to `content`. Endpoints: `docs/API_CONTRACTS.md` («Sources events»).

## Classification (best effort)
Fixed at detection, stored in `event_type` (migration 0037 backfills old rows from the title).
- `patch`: every patch-note item.
- `treasure`: a Steam announcement whose title or cleaned opening text matches `treasure`, `collector's cache`, `cosmetic|immortal|arcana|hero|player set(s)`, `сокровищ`, or `набор… косметик|предмет`.
- `news`: anything else. A miss only changes which template the draft uses; the owner edits the draft anyway.

## Status
`hidden` (owner dismissed) wins; else `new` (no draft post yet), `published` (the draft's latest publication job succeeded), `drafted`. `publication.status` is the coarse state of that latest publication (queued, sending, sent, failed, unknown, ...).

## Auto-draft at detection
`processDotaUpdates` (Cron, every 5 minutes, idle ticks only) makes one draft per new event: it reserves `draft_post_id` with a conditional UPDATE, then `createPost` with the idempotency key `dota:<sourceKey>:<externalId>`. The owner's «draft» endpoint uses the same reservation and key, so Cron, the endpoint, a re-detection and a rerun leave one post. Hidden events are skipped.

Templates (Russian, in `source-events.ts`; they only rearrange source text, never generate facts, never copy images):
- patch: title `Патч <версия>: что изменилось`; body lists changed heroes and items from the stored parse, watched ones first, at most 15, then `и ещё N`; if the notes are not parsed it says so; then `Источник: <url>`.
- treasure: title `Новая сокровищница: <название>`; first sentence of the announcement; link.
- news: the title; first sentence of the announcement; link.
The announcement text is Steam's first 500 characters, cleaned of BBCode/HTML, links and image macros, kept in `excerpt` (at most 600).

## Owner notice
After the draft exists the workflow claims `owner_alert_claimed_at` (one conditional UPDATE: once per event) and sends `<тип>: <заголовок> — черновик готов` with the publish keyboard from `app/bot/publish-keyboard.ts` («Опубликовать сейчас → канал», «Открыть в Студии»); the buttons come from `createPublishActions`. The `sourceAlerts` preference off means the claim is consumed and nothing is sent. A failed send is logged, not retried (the claim is spent).

## Budget (Free plan: 50 subrequests per invocation)
The workflow takes `container.queryBudget`: it charges the feed and detail fetches and the Telegram send, and skips drafting (13 left needed) and notices (9 left) when what remains would not leave room for the rest of the tick (12). Leftovers are picked up by the next 5-minute slot. Pinned by `tests/integration/source-events.test.ts` (tick within 50) and `dispatcher-budget.test.ts`.
