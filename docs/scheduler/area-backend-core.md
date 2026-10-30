# Area plan: backend core of the rubric scheduler (30.10.2026, planning only; nothing below is built)

Owner decisions are final (docs/RUBRICS_SCHEDULER.md, DECISIONS rows of 30.10.2026). Base design: `architect-plan-v2.md` incl. «v2.1 required fixes» (N1–N11), `review-backend.md`, `review-qa.md`. Stage numbers and migration numbers follow v2: 0 build extraction · 1 publishing extensions (0117) · 2 audience signals (0118, other area) · 3 pure core · 4 slot machinery (0119) · 5 events/anchors (0120) · 6 inner planners (0121) · 7 analytics (0122) · 8 learning (0123) · P pictures on prod (0124). Stages 2, 7, 8 are other areas; only their hooks are named here.

Everything is checked against the real code (paths below exist unless marked NEW). Where this plan refines v2 it says «refinement» and why.

## 0. Findings from the code that change the plan (new vs v2)

| # | Finding | Consequence |
|---|---|---|
| F1 | Builders consume mutable state **at build time**: `sources.turns.next(name)` (15 call sites: anketa.ts:1709, fake-item.ts:584, fun-rubrics.ts:428/1462/1931/3083/4225/4633, horoscope.ts:1528, on-lane.ts:931, quote-of-day.ts:357, rebus.ts:1265, shame-of-day.ts:895, suspect.ts:1632, tier-list.ts:469, toxic-bingo.ts:457) backed by `system_state` (`nextTurn`), plus `tellers.remember` (horoscope.ts:1552) and `shameHeroes.remember` (shame-of-day.ts:911). A build that fails, is superseded or never goes out would burn a bank entry / teller / hero. | Stage 0: scheduler build adapter implements these ports **purely** (turn = count of this rubric's counting slots; `remember` deferred into `BuiltRubricPost.facts`, applied by projection on `sent`). Lab keeps today's mutable adapter. «Failed rubric keeps its turn» then holds by construction. |
| F2 | Bank order is `shuffledOrder(round, size)[turn % size]` (bank-order.ts). Growing a bank after a deploy changes the permutation of the current round, so «new entries first» and «no repeat until the whole bank went out» cannot be guaranteed by a counter. | Stage 4 go-live only for rubrics where a repeat after bank growth is harmless (jokes). `exhaustion:'pause'` rubrics (26 «Ребус», solved riddles must not repeat) stay ineligible until stage 6 supplies explicit used-id history (`RUBRIC_META.needsHistory`). |
| F3 | The queue handler runs `rubric_sample` only when `lab !== null` (ai-queue.ts:452). Production needs a `rubric_build` branch that does not depend on `app/lab`. `scripts/check-no-lab.mjs` only matches the string `"/api/v1/lab`, so moving builders out of `app/lab` is allowed. | Stage 0 moves build code to `app/rubric-build/` (shared by lab and prod). |
| F4 | Moving builders into the production bundle adds `modules/rubrics/**` (5.6 MB of source, of which `fake-item-icons.generated.ts` is 4.28 MB) plus `modules/ai/*.generated.ts` (~2.5 MB). Today they are tree-shaken out of production because only `app/lab` reaches them. Worker script limit is 10 MB compressed on Paid. | Stage 0 acceptance: `wrangler deploy --dry-run --outdir` size before/after; if compressed script > 7 MB, move the fake-item icons to R2 (owner uploads once) before stage 4. Not measured here (`not_run`). |
| F5 | `writeRubricCaption` (modules/ai/rubric-writer.ts:41) returns `null` for five different causes (AI off, budget, provider error, number lost, link in text). The breaker and the owner message need the cause. | Stage 0: `writeRubricCaptionTyped` returns `{ok:true,text}\|{ok:false,code}`; the old function stays as a wrapper for the lab. |
| F6 | Prod `wrangler.jsonc` env.production has no `browser` binding and no BROWSER cap; env.dev has `browser` but no `STATS_DB`; neither has `RUBRIC_*` vars. DEV Cron is `* * * * *` behind the lab master switch (lab-cron.ts). | Capability map derives everything from bindings; DEV lacks `statsDb` by itself, so stats rubrics are excluded in rehearsal without a special case. |
| F7 | `PostPoll` (contracts/src/post-poll.ts) has no shuffle/picture flags; dispatch refuses a poll post with media (dispatch-due-jobs.ts: `revision.media.length > 0` → CONTENT_INVALID) and the content module refuses media on a poll post (post-media.ts:65, media-library.ts:72). `TelegramPollParams.media` (telegram-api.ts:65) already exists for the lab. | Stage 1 relaxes both for `pictureInPoll`. `open_period` is **not** used (Bot API allows seconds only; our closes are 24 h / 7 d): the scheduler closes polls by `stopPoll` in a `poll_close` slot. |
| F8 | `jobs` has no `not_after`; `DUE_JOBS_SQL` and `claim` (d1-dispatch-repository.ts:~188, ~232) are shared by all publishing. | 0117 changes shared SQL ⇒ prod migration before main (section 4.4) plus a temporary compatibility shim. |
| F9 | Series gap today: HTTP `intervalMinutes` min 5 (publications contract); `chain_gap_ms` (0098) is ms already. | `gapMs` is an application-level override, never in the HTTP contract. |
| F10 | `claimFailureNotice` prunes only `failure_notice:%` keys and uses a rolling window. | Scheduler gets its own tiny `rubric_notices` table (day-keyed) instead of overloading `system_state`. |
| F11 | `container.queryBudget` is the shared 50-statement meter (`meterD1(env.DB)`, container.ts:~402) and every repo built by the container is metered by it. | Scheduler builds **its own container** over `meterD1(env.DB, 40).db`, so release/createPublication statements count against the scheduler meter, not the other steps'. |

## 1. Vocabulary and constants

- `RUBRIC_ACTOR = 'rubric-scheduler'` (NEW const in `app/workflows/rubric-actor.ts`). Distinct from `AUTOPUBLISH_ACTOR` (its `dailyLimit` counts via `countCreatedBy`, autopublish-source-event.ts). Used only by scheduler workflows (contract test: no HTTP route can set it).
- Slot statuses (16; refinement: `skipped` added to v2's 15): `planned building ready released waiting_parent unknown` (live) · `sent partial unresolved send_failed missed empty skipped yielded cancelled superseded` (terminal). `skipped` = content skip («нечего сказать», not an error, no notice, no breaker, no rest consumed) and stays in the dedupe-unique set so an event key is not re-planned every tick.
- Slot kinds: `pool event anchor follow_up poll_close`. `poll_close` is housekeeping (never a post, never counted, exempt from slot_at uniqueness).
- Counting statuses (consume rest, count toward caps/hero/family rules): `sent partial unresolved unknown` and, as pending occupants, `ready released`. `send_failed missed empty skipped yielded cancelled superseded` do not consume rest.
- Time: all slot math in `Europe/Moscow` = fixed UTC+3 (no DST since 2014): `MSK_OFFSET_MS = 3*3_600_000`, no `Intl` in domain code; D1 stores UTC ms; `msk_day` = `YYYY-MM-DD`. MSK day starts at 21:00 UTC.
- Base slots: day 12:30, evening 19:00 MSK, jitter ±20 min (deterministic from hash(day, slotNo), whole minutes). Hard posting window **08:00–23:00 MSK** (owner 8a1: trial hours cover the whole day). Refinement: release-model R3 «слот не позже 21:00» is superseded (the mock itself shows 21:30 and 8a1 allows 23:00).
- Lead times: build_at = slot_at − 3 h (patch chain/event: at once); release lead 60 s; release window slot_at−60 s … +4 min; `not_after = slot_at + 20 min`.
- Budgets: scheduler meter 40 statements/tick (v2 M9). Per-tick caps: releases ≤ 2, build claims ≤ 2, projections ≤ 4, one marker step.

## 2. Stage map for this area

| Stage | Deliverable (this area) | Migration | Runs on DEV | Runs on prod |
|---|---|---|---|---|
| 0 | extract build, typed degradations, `RUBRIC_META`, pure build ports | none | lab «Рубрики» unchanged | nothing (code only; bundle grows, F4) |
| 1 | publishing extensions | 0117 | tests + CI auto-apply to DEV D1 | **owner applies 0117 before the develop→main PR** |
| 3 | pure domain + forecast endpoint | none | `GET /rubrics/calendar` forecast-only, `GET /rubrics/forecast` | same, read-only |
| 4 | tables, Cron steps, build consumer, release, projection, UI endpoints, rehearsal, prod go-live | 0119 | rehearsal into test channel (no AI) | switch default off; owner flips it; text/poll rubrics only |
| 5 | event/anchor triggers, patch chain, bets, 04 follow-up | 0120 | rehearsal | on |
| 6 | inner planners, facts, lexical similarity, bank-pause rubrics | 0121 | rehearsal | on |
| P | Browser ledger, picture rubrics | 0124 | DEV cap 4 min/day | owner adds BROWSER binding to prod; cap 12 min/day |

## 3. Stage 0 — extract the build (no migration, no behaviour change)

Goal: `buildRubricPost(deps, rubric, mode)` returns a `BuiltRubricPost` and sends nothing; `app/lab` = build + the existing owner-chat sends.

### 3.1 New types

- `modules/rubrics/degradations.ts` (NEW, exported from index): `DEGRADATION_CODES` const tuple and `DegradationCode`; `type Degradation = {code: DegradationCode; detail?: string}`; `DEGRADATION_TEXT_RU: Record<DegradationCode,string>` (lab maps codes to the same Russian notes it prints today). Codes, each from a real branch of `sendRubricSample`:
  - `SCENE_NOT_DRAWN` (L581–588 «Сцена не нарисована … пост без картинки»), `SLIDE_NOT_DRAWN` (L642), `FOLLOWUP_PICTURE_NOT_DRAWN` (L671), `TEXT_TEMPLATE` (L654 «Текст — шаблон: ИИ его не написал»), `ALBUM_PHOTO_MISSING` (L614 a photo fetch failed, album kept with fewer), `PHOTO_NOT_SHARPENED` (improvePhoto fell back to the source), `PICTURE_DROPPED` (a rubric with `picture:'optional'` went text),
  - guide (stats-rubrics.ts 234–402): `GUIDE_BLOCK_MISSING` (+detail block), `GUIDE_SOURCE_FALLBACK` (OpenDota stood in), `GUIDE_BASE_TOO_SMALL` (own base < `BASE_MIN_GAMES`, STRATZ sample used),
  - `QUESTION_RESCHEDULED` is **not** a degradation: it is on-lane.ts:940/955 internal retry; stays info.
- `RubricSample.notes?: string[]` → `notes?: RubricNote[]`, `RubricNote = {code: DegradationCode | 'INFO'; text: string}`. Edits: on-lane.ts (2 pushes → `INFO`), stats-rubrics.ts (~22 pushes → coded), horoscope.ts:1557 (`INFO`, plus structured `facts`). `RubricSample` also gains optional `facts?: RubricFacts` and `bank?: {name: string; size: number}` (additive, filled rubric by rubric from stage 5/6; stage 0 fills only what is generic, below).
- `RubricFacts` = `{patch?: string; heroIds?: number[]; abilityId?: number; pair?: [number, number]; itemId?: number; workshopId?: string; steamGid?: string; finds?: string[]; look?: string; topic?: string; bankLine?: string; tellers?: number[]; shameHero?: number; …}` (closed Zod schema in `modules/rubrics/facts.ts`, ≤ 16 KB serialized).
- `modules/rubrics/meta.ts` (NEW): `RUBRIC_META: Record<RubricKey, RubricMeta>`:

  ```ts
  type RubricMeta = {
    number: number;                          // 1..31, as in the owner's list
    family: 'patch'|'stats'|'scene'|'cosmetic'|'guess'|'bank_text'|'joke_poll'|'calendar';
    trigger: 'pool'|'patch_chain'|'event'|'anchor'|'calendar';
    weight: 'V'|'L'; picture: 'required'|'optional'|'none'; interactive: boolean;
    restDays: number;                        // base rest, 7..60 (events/chain keep a nominal value, unused)
    needs: Capability[];                     // 'browser'|'openai'|'stratz'|'statsDb'
    providers: Provider[];                   // breaker groups: 'stratz'|'openai'|'browser'|'valve'|'steam'|'github'
    textMode: 'own'|'writer'|'bank_turns';   // own = fixed text; writer = AI caption (TEXT_TEMPLATE fails); bank_turns = bank line when AI unavailable
    allowDegrade: DegradationCode[];         // anything else fails the candidate in prod
    exhaustion: 'none'|'pause'|'new_round_notice'|'new_round_silent';
    bank?: {name: string};                   // the `turns` name
    needsHistory: boolean;                   // true = not eligible before stage 6 (explicit used ids)
    pollCloseHours: 24 | 168 | null;         // 24 h polls, 7 d quizzes and the 06 bet
    hours: HourWindow;                       // 'day'|'evening'|'any'|'weekend'|'fri_sat_evening'|{exactMinute:number,…}
    followUp?: {afterMinutes: number; weight: 'V'|'L'};   // 04: 180
    factKinds: FactKind[];                   // kinds this rubric must emit before it is eligible beyond stage 4
  }
  ```
  Seed values come from RUBRICS_SCHEDULER.md «Per approved rubric / Inner rules» and release-model.md (rest tiers 7/14/21/30; families R8; interactive set 02,03,04,06,07,09,16,23,24,25,26). `exhaustion`: `pause` = 26; `new_round_notice` = 13,14,15,16,18,24,25,27,28,30 (owner: jokes may repeat after months); `new_round_silent` = 17,22,23 (hero pools); others `none`. 25 «Ты на линии» is classed `new_round_notice` (live numbers change after patches) — owner question Q2.
  A test pins `RUBRIC_META` keys = `RUBRIC_KEYS` = contracts `rubricSampleKeySchema` options (no such test exists today).
- `app/rubric-build/types.ts` (NEW): `BuiltRubricPost` =
  `{ rubric; text; entities; richHtml: string|null; boldLead; poll: PostPollSpec|null; pictureInPoll: boolean; media: BuiltMedia[] (bytes+kind+name); separatePoll: boolean; followUp: {afterMinutes|null; text; picture: bytes|null}|null; facts: RubricFacts; bank: {name,turn,size}|null; degradations: Degradation[]; variant: 'full'|'text'; notes: RubricNote[] (info) }`.
  Size bounds: text ≤ 4096, media ≤ 10 files, total ≤ `MAX_SEND_MEDIA_BYTES` (publishing policy).

### 3.2 `buildRubricPost` and the pure build ports

`app/rubric-build/build-post.ts` = lines 464–673 of rubric-samples.ts, with these changes only: (a) takes `BuildDeps` (the old `RubricSampleDeps` minus `telegram`, `ownerChatId`, `mirror`), (b) every «notes.push(…)» becomes a `Degradation`, (c) caption goes through `writeRubricCaptionTyped`, (d) `strict: boolean` — in strict mode (scheduler) a degradation not listed in `RUBRIC_META[rubric].allowDegrade` throws `AppError('UNAVAILABLE', …, {reason: 'DEGRADED:<code>'})`; lab runs non-strict and returns them, (e) the 11-s `BROWSER_GAP_MS` waits move behind `deps.pace()` so stage P can replace them with the ledger lease, (f) STRATZ pacing uses the exported `STRATZ_GAP_MS` of stratz-api.ts (lab had a second copy of 1500, review-backend).
Build-port adapters (`app/rubric-build/ports.ts`):
- lab adapter = today's `turns/tellers/shameHeroes` over `container.systemState` (unchanged);
- scheduler adapter (stage 4): `turns.next(name)` → `slotTurn` = number of this rubric's counting slots so far (one read, passed in `BuildDeps.turn`), `tellers.used()/shameHeroes.used()` read from D1 as today but `remember()` is captured into `facts.tellers` / `facts.shameHero` and applied on `sent`.

### 3.3 File-by-file (stage 0)

| File | Change |
|---|---|
| `apps/backend/src/app/rubric-build/sources.ts` NEW | `rubricSources`, `heroMatchSource`, `trackerFinds`, `fillBareFinds`, `sourceError` moved from rubric-samples.ts L160–382 |
| `.../rubric-build/build-post.ts` NEW | see 3.2 |
| `.../rubric-build/scene.ts` NEW | `fetchRender`, `fetchHeroImage`, `sceneFailed`, hero/fortune/base scene application (L81–113, L526–588) |
| `.../rubric-build/photos.ts` NEW | `fetchPhoto`, `PHOTO_ORIGINS`, album sort/cover/improve (L134–151, L599–632) |
| `.../rubric-build/payload.ts` NEW | `withLinks`, `albumRichHtml`, `escapeRich`, body/entities/lead assembly (L60–76, L115–132, L656–661) |
| `.../rubric-build/types.ts`, `ports.ts` NEW | 3.1, 3.2 |
| `apps/backend/src/app/lab/rubric-samples.ts` | shrinks to `sendRubricSample` = `buildRubricPost` + mirror + Telegram sends (L675–795 unchanged) and `runRubricSampleJob`; prints degradations through `DEGRADATION_TEXT_RU` |
| `apps/backend/src/modules/rubrics/{types,samples,index}.ts`, `degradations.ts`, `facts.ts`, `meta.ts` | 3.1; `index.ts` exports `RUBRIC_META`, `DEGRADATION_*`, `RubricFacts` |
| `modules/rubrics/{anketa,fake-item,fun-rubrics,horoscope,on-lane,quote-of-day,rebus,shame-of-day,suspect,tier-list,toxic-bingo,stats-rubrics}.ts` | `turns.next(name)` → `turns.next(name, bankSize)` (size recorded for exhaustion detection); coded notes; horoscope/shame emit `facts` |
| `modules/ai/rubric-writer.ts`, `modules/ai/index.ts` | `writeRubricCaptionTyped` |
| `integrations/stratz/stratz-api.ts` | `export const STRATZ_GAP_MS` |
| `apps/backend/src/modules/rubrics/meta.test.ts` NEW | keys/needs/allowDegrade/exhaustion coherence; every key of `rubricSampleKeySchema` has meta |
| `apps/backend/src/app/rubric-build/build-post.test.ts` NEW | strict mode: each degradation code fails unless allowed; `TEXT_TEMPLATE` from typed caption failure; no mutable port call in scheduler mode |

Acceptance (stage 0): `npm run verify:changed`; DEV: press three lab rubrics (a bank text, a code-drawn picture, an AI scene) and compare the owner-chat output with the pre-change run (same messages, same notes text); bundle-size dry-run (F4); Workers Logs `cpuTime` of each rubric build on DEV (queue consumer CPU default 30 s; if any build exceeds ~20 s set `limits.cpu_ms` for the consumer in wrangler.jsonc).

## 4. Stage 1 — publishing extensions + migration 0117

### 4.1 Migration `0117_publishing_not_after_poll_id.sql` (expand-only)

```sql
ALTER TABLE jobs ADD COLUMN not_after INTEGER CHECK (not_after IS NULL OR not_after > 0);
CREATE INDEX jobs_not_after_idx ON jobs (not_after, id)
  WHERE not_after IS NOT NULL AND status IN ('pending', 'retry_wait');
ALTER TABLE publications ADD COLUMN external_poll_id TEXT
  CHECK (external_poll_id IS NULL OR length(external_poll_id) BETWEEN 1 AND 64);
CREATE INDEX publications_poll_idx ON publications (external_poll_id) WHERE external_poll_id IS NOT NULL;
```
`EXPLAIN QUERY PLAN` required for the reconcile expiry query and the due scan (`USING INDEX jobs_due`/`jobs_not_after_idx`).

### 4.2 Code changes

| Feature | Change | Files |
|---|---|---|
| `not_after` | `createPublication`/`createPublicationSeries` command gets `notAfter?: number` (application-level, not in the HTTP schema); repo `create`/`createSeries` write `jobs.not_after` for every job of the series. `DUE_BRANCH` and `claim` add `AND (not_after IS NULL OR not_after >= ?now)` (N11: expired jobs must not keep `publicationIdle` false). `reconcileExpiredJobs` step 1 also cancels expired `pending`/`retry_wait` jobs (`LIMIT 20`, runs with the kill switch off), writes `publications.last_error_code='NOT_AFTER_PASSED'`, audit `job.expired`, no incident. `reschedulePublication` clears `not_after` (N4: the owner chose the time knowingly); the slot projection then marks `manual` because `publications.scheduled_at ≠ slot_at`. | `publishing/application/{create-publication,create-publication-series,reconcile-expired-jobs,change-publication,ports}.ts`, `infrastructure/{d1-publication-repository,d1-dispatch-repository}.ts` |
| `gapMs` | `createPublicationSeries` command takes `gapMs?` overriding `input.intervalMinutes*60_000` (hash includes it); the contract `intervalMinutes` (min 5) is untouched; the scheduler passes 30_000. | `create-publication-series.ts` |
| poll shuffle + picture | `postPollSchema` additive: `shuffleOptions: boolean = false`, `pictureInPoll: boolean = false` (old stored `poll_json` still parses). `pollParams()` maps `shuffle_options` and `media`; dispatch allows exactly one **photo** on a poll post iff `poll.pictureInPoll`, else `poll_invalid`; content module lets a poll post with `pictureInPoll` take one photo (`MediaPostState.pictureInPoll`). The studio editor never sets `pictureInPoll`; frontend only gets the type. | `contracts/src/post-poll.ts`, `publishing/infrastructure/telegram-publication-transport.ts`, `publishing/application/dispatch-due-jobs.ts`, `content/application/{post-media,media-library,media-ports}.ts`, `content/infrastructure/d1-post-media-repository.ts`, `integrations/telegram/telegram-api.ts` (already has `media`) |
| external poll id | `SendOutcome.sent` gains `externalPollId?: string` (from `sendPoll` result `poll.id`); `classifyPollResult` = `sent` when `message_id` is valid, poll id kept when it is a non-empty string (a missing id does **not** make the send `unknown`: the message is confirmed); `JobResolution.externalPollId`; the resolution batch also `UPDATE publications SET external_poll_id=?`. | `publishing/application/{ports,dispatch-due-jobs}.ts`, `infrastructure/{classify-telegram-result,d1-dispatch-repository,telegram-publication-transport}.ts` |
| `stopPoll` | `TelegramSendApi.stopPoll(chatId, messageId, signal)`; publishing exports `PollStopper` port + `createTelegramPollStopper(api)` returning `closed{total,options[{text,voters}]} \| already_closed \| not_found \| rate_limited{retryAfterSec} \| unknown{reason}` (400 «poll has already been closed» → `already_closed`; 400 message/poll not found → `not_found`; 429 → `rate_limited`; timeout/5xx/network → `unknown`). Safe to repeat. | `integrations/telegram/telegram-api.ts`, `publishing/application/ports.ts`, NEW `publishing/infrastructure/telegram-poll-stopper.ts`, `publishing/index.ts` |
| read side for the scheduler | `readPublicationOutcomes(ids ≤ 20)` → `{publicationId, status: PublicationStatus, externalMessageIds, externalPollId, scheduledAt, lastErrorCode, finishedAt}` (reuses `status-projection.ts`); `findPublicationByPost(postId, destinationId)` (N1); `listRecentPublications(sinceMs)` → `{at, status, postKind, hasMedia, postId}` for the gate (D1 only, ≤ 200 rows). | `publishing/application/*`, `d1-publication-repository.ts`, `publishing/index.ts` |

### 4.3 Tests (stage 1; publishing-reliability skill)

Two Cron ticks race one job with `not_after` (one send); claim refuses a job past `not_after`; reconcile cancels expired `pending`/`retry_wait` with the kill switch off, never touches `claimed`/`unknown`; series child behind an unknown parent cancelled at `not_after` (publication `cancelled`, parent untouched); 429 `retry_after` beyond `not_after` → cancelled not retried; reschedule clears `not_after`; `gapMs` 30 s spaces the second job and is rejected by the HTTP schema (strictObject); poll with `pictureInPoll` sends `media`, without it with media → `CONTENT_INVALID`; `poll.id` stored and visible via `readPublicationOutcomes`; send ok without `poll.id` stays `sent`; `PublicationStatus` mapping unchanged (docs/backend/publishing.md §5 table + its unit test); **«deploy without 0117»** (4.4).

### 4.4 Prod-migration-before-main step (N2) and the shim

0117 changes the due scan and the claim that every publication uses. If main is deployed while prod D1 lacks `jobs.not_after`, every dispatch throws «no such column» and **all publishing stops**. Controls:
1. **Release step, owner-run, recorded in `docs/backend/data-migrations.md` and DECISIONS:** before opening the develop→main PR that contains 0117 (and later 0118–0124), run Actions → «D1 migrations» → production (its «Pending migrations» step lists what applies). The stage-1 report states the migration number. Agents never run `--remote`.
2. **Compatibility shim (refinement, removed one release later):** `createD1DispatchRepository` holds `DUE_JOBS_SQL_V0` and `CLAIM_SQL_V0` (the pre-0117 text). On an error matching `/no such column: not_after/` the repo switches to V0 for the rest of the tick (closure variable, no module state), logs `SCHEMA_BEHIND` and the tick's alert step tells the owner once a day: «Продакшн-база без миграции 0117: примените её (Actions → D1 migrations). Публикации идут без защиты от опоздания.» The scheduler stays locked (`SCHEMA`) while the shim is active. Delete the shim in the first commit after the owner confirms prod has 0117. Test: unmigrated schema ⇒ dispatch still sends, one log line, scheduler off. Cheaper alternative (owner step only, no shim) is acceptable if the owner prefers; the shim is ~25 lines.
3. Same rule for `publications.external_poll_id` (written inside the resolution batch): the V0 resolution omits it under the same flag.

## 5. Pure domain (stage 3) — `modules/rubric-scheduler/domain/` (no imports of platform/infrastructure; clock and rng injected)

| File | Content |
|---|---|
| `msk-calendar.ts` | `mskDay(ms)`, `mskMinuteOfDay`, `mskWeekday` (1=Mon), `fromMsk(day, hh, mm)`, `addDays`, `isoWeek`, `weekParity(day)`; boundary tests at 20:59/21:00 UTC, 31 Dec→1 Jan, 29 Feb |
| `types.ts` | `RubricDescriptor` (the scheduler's own view of `RubricMeta`, mapped in `container.ts`), `SlotSpec`, `ChannelPost`, `PlanInput/Output`, `Candidate`, `Violation` |
| `triggers.ts` | pure trigger derivation → `Candidate[]` with `{rubric, kind, dedupeKey, notBefore, notAfter, preferredMinute?, exact?, priority}`. Patch version parsing `^(\d+\.\d+)([a-z]?)$`, base = without letter, a hotfix within 5 days joins the chain of its base. Chain (patch with hero changes): 01 D0, 02 D1 (even if 01 skipped when ≥2 stronger heroes), 06-result D2 after 01, 03 D3 and ≥40 h after 02's poll, 07 D5 window D4–D6. 08 marks 30/45/60/90 then every 30 days since the last patch of any kind, key `valve_time:<base>:<mark>`, ≤2 days moved, never later. 09 per Steam announcement ≤21 d old, key `steam:<gid>`, evening 1–5 days after its news post, never the same day, newest first, ≥7 days between 09 posts. 05 Friday evening if finds in 7 d not yet shown (key `files:<msk_week>`). 06 bet when ≥21 d after the latest patch and no open bet. 22 anchor Monday 08:00 every other week (`weekParity` against a stored anchor week). 29 weekly 08:00, never on a horoscope Monday. 31 calendar cards (date + own hour, once a year, 14.02 by `year % 4`, patch card only for 7.xx). Stage 3 implements pool + weekly anchors + 08/05/09/chain from stored state; stage 5 wires the live triggers. |
| `exclusions.ts` | data table, one source for every «not the same day / week / within N days» of the owner rules: `{a,b,scope:'day'\|'week'\|'days3'}` — 13↔24 (week; different emoji pairs if they meet), 13/14↔30 (day), 14↔18 (day), 15↔27 (day), 16↔24 (day), 19↔27 (day), 04↔25↔26 (day), AI scenes 17/21/22/23/31 mutually (day), stats family 10/12/19/20/21/29 mutually (day), 22↔29 (horoscope Monday), 09↔11 (3 days), 06 bet↔08 (3 days), 06 bet not near 02 (≥21-day rule), 03 not same hero as 01/02 of the patch (fact rule, stage 6). Pinned by a test that every pair in RUBRICS_SCHEDULER.md appears here. |
| `constraints.ts` | `check(slotSpec, ctx): Violation[]` — hard rules over **all** channel posts (ours + news): ≤3 posts/day; rubrics ≤2/day (≤3 with an anchor); ≥2 h between posts (follow_up and a series' second post exempt); window 08:00–23:00 MSK; interactive ≤1/day, ≤4 per 7 days, ≥40 h apart; family not twice a day; hero not twice within 72 h (06 result exempt); V/L alternation (no third V, no second L in a row over all posts); quiet week 7 days after a patch with hero changes for 12/19/20/21 and STRATZ builds of 10 (R10); heavy day (≥3 news in 24 h): one rubric slot, L only; picture rule. `unknown` slots count. Virtual follow-ups (04 answer at slot+180 min) count as occupants when planning. |
| `select.ts` | ranks pool candidates: ratio = daysSinceLast / restDays (≥1 eligible; `last_failed_at` within 48 h with a closed breaker adds +1.0: «first in line»), ties: needed weight (alternation), longest wait, stable hash. Returns ≤3 alternates ordered: same weight → other weight → greeting filler (31 weekday/any) → none. Skips rubrics with `skip_until > slotAt`, paused, disabled, ineligible by capabilities/breakers/ledger/needsHistory. |
| `plan.ts` | `plan(input) → {insert: SlotSpec[], supersede: SlotId[], conflicts: Conflict[], forecast?: ForecastSlot[]}`. Horizon today+tomorrow MSK (35 days when `forecast`). Takes live slots as input (B1): never two slots on one `slot_at`; places anchors/events first (exact minute for anchors, shifted only inside their freshness window), then base slots evening first, day slot only when a rested candidate exists (an empty slot is normal); `planned` slots re-evaluated, replaced via supersede+insert, **never UPDATE slot_at** (M2); a slot within 10 min of `build_at`, or past `planned`, is frozen; jitter/exploration inside `plan()` (M3; exploration rate 0 until stage 8). Conflicts are returned, never thrown. |
| `invariants.ts` | `assertInvariants(finalSlots, channel)` = the constraint set applied to the **final** times; used by property tests and, cheaply, as a last filter inside `plan()` (a violating slot is dropped and logged `plan_invariant`). |
| `slot-machine.ts` | transition table + `deadlineOf(slot)` + `nextActionOf(slot)` (section 7). |
| `release-classify.ts` | publishing error → slot outcome (section 10). |
| `fallback.ts` | candidate advance / retry decision (section 12). |
| `breakers.ts` | provider and rubric breaker transitions (section 12). |
| `capabilities.ts` | `eligible(descriptor, caps, breakers, ledger, mode)` → `{ok} \| {ok:false, missing[], reason}`. |
| `seeding.ts` | start-up seed (section 13). |
| `bank-exhaustion.ts` | `detect(facts.bank)`, pause/resume decision, exact owner texts (section 11.3). |
| `notice-policy.ts` | keys, cap, summary, all Russian message builders (section 16). |

Interfaces owned by the scheduler (`application/ports.ts`, wired by hand in `app/container.ts`/`app/rubric-scheduler/wiring.ts`): `RubricSlotRepository`, `SettingsRepository`, `MarkerRepository`, `BreakerRepository`, `NoticeRepository`, `ChannelLoad` (publishing's `listRecentPublications` ∪ content-analytics `readChannelPostTimes`, de-duplicated by external message id; a preview-only post counts as V when it has a thumbnail), `DotaState` (modules/dota: latest `patch_notes` items + hero-change count from `dota_patch_analyses`, `steam_news` items, plus `container.gameFileBuilds.recentFinds`), `RubricCatalog` (`RUBRIC_META`, `RUBRIC_TITLES`), `CapabilityReader`, `PublicationGateway`, `PostGateway` (create/delete/exists), `PollStopper`, `OwnerNotifier`, `AudienceReader` (null until stage 2; 04's first guesser). Adding these exports to `modules/dota/index.ts` and `modules/content-analytics/index.ts` is part of stage 3/4.

Tests (stage 3): L1 tables; L2 fast-check over the final times (every invariant, 200 seeds, devDependency `fast-check`, reason: invariants are the product); L3 simulation 10 seeds × 30 days with a deterministic clock (no rubric starves beyond max(2·rest, 60) d; never two slots on one time; ≤3/day; interactive spacing). Stage 8 raises it to 20 × 365.

## 6. D1 schema (expand-only; all times UTC ms; ids TEXT uuid; migration applies from zero in tests)

### 6.1 `0119_rubric_scheduler.sql` (stage 4)

```sql
CREATE TABLE rubric_scheduler_settings (          -- singleton
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  destination_id TEXT REFERENCES destinations (id) ON DELETE SET NULL,
  horoscope_anchor_week TEXT,                      -- ISO Monday of the first horoscope, fixes the 2-week parity
  off_cleanup_done INTEGER NOT NULL DEFAULT 1 CHECK (off_cleanup_done IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO rubric_scheduler_settings (id, updated_at) VALUES (1, 0);

CREATE TABLE rubric_settings (
  rubric_key TEXT PRIMARY KEY CHECK (length(rubric_key) BETWEEN 1 AND 40),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  base_rest_days INTEGER NOT NULL CHECK (base_rest_days BETWEEN 7 AND 60),
  rest_days INTEGER NOT NULL CHECK (rest_days BETWEEN 7 AND 60),
  last_sent_at INTEGER,                            -- real or seeded
  last_sent_seeded INTEGER NOT NULL DEFAULT 0 CHECK (last_sent_seeded IN (0, 1)),
  last_failed_at INTEGER, last_fail_code TEXT,
  skip_until INTEGER,                              -- content skip cooldown for pool rubrics
  paused_reason TEXT CHECK (paused_reason IS NULL OR paused_reason = 'BANK_EXHAUSTED'),
  paused_at INTEGER, bank_size_at_pause INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE rubric_slots (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  msk_day TEXT NOT NULL CHECK (length(msk_day) = 10),
  slot_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pool','event','anchor','follow_up','poll_close')),
  rubric_key TEXT NOT NULL CHECK (length(rubric_key) BETWEEN 1 AND 40),
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json) AND json_type(candidates_json) = 'array' AND json_array_length(candidates_json) BETWEEN 1 AND 3),
  cand_idx INTEGER NOT NULL DEFAULT 0 CHECK (cand_idx BETWEEN 0 AND 2),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  status TEXT NOT NULL CHECK (status IN ('planned','building','ready','released','waiting_parent','unknown',
    'sent','partial','unresolved','send_failed','missed','empty','skipped','yielded','cancelled','superseded')),
  build_at INTEGER NOT NULL,
  next_action_at INTEGER NOT NULL,                 -- every live row has one
  deadline_at INTEGER NOT NULL,                    -- every row has one: its exit
  lease_until INTEGER, build_started_at INTEGER,
  handler_errors INTEGER NOT NULL DEFAULT 0 CHECK (handler_errors >= 0),
  weight TEXT NOT NULL CHECK (weight IN ('V','L')),
  interactive INTEGER NOT NULL CHECK (interactive IN (0, 1)),
  family TEXT NOT NULL,
  explore INTEGER NOT NULL DEFAULT 0 CHECK (explore IN (0, 1)),
  manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1)),   -- owner rescheduled the publication (N4)
  dedupe_key TEXT NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 128),
  parent_slot_id TEXT, replaces_slot_id TEXT,
  reason_json TEXT NOT NULL CHECK (json_valid(reason_json)),
  build_json TEXT CHECK (build_json IS NULL OR (json_valid(build_json) AND length(build_json) <= 65536)),  -- N3: text, entities, poll, R2 keys
  facts_json TEXT CHECK (facts_json IS NULL OR (json_valid(facts_json) AND length(facts_json) <= 16384)),
  post_id TEXT, publication_id TEXT, message_ids_json TEXT, poll_id TEXT, sent_at INTEGER,
  error_code TEXT, error_step TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
-- live + sent statuses own a dedupe key; ended ones free it (skipped keeps it so a content skip is not re-planned)
CREATE UNIQUE INDEX rubric_slots_dedupe_uq ON rubric_slots (dedupe_key)
  WHERE status IN ('planned','building','ready','released','waiting_parent','unknown','sent','partial','unresolved','skipped');
CREATE UNIQUE INDEX rubric_slots_at_uq ON rubric_slots (slot_at)
  WHERE kind <> 'poll_close' AND status IN ('planned','building','ready','released','waiting_parent','unknown','sent','partial','unresolved');
CREATE INDEX rubric_slots_due_idx ON rubric_slots (next_action_at, id)
  WHERE status IN ('planned','building','ready','released','waiting_parent','unknown');
CREATE INDEX rubric_slots_rubric_idx ON rubric_slots (rubric_key, slot_at DESC);
CREATE INDEX rubric_slots_day_idx ON rubric_slots (msk_day, slot_at);
CREATE INDEX rubric_slots_pub_idx ON rubric_slots (publication_id) WHERE publication_id IS NOT NULL;
CREATE INDEX rubric_slots_parent_idx ON rubric_slots (parent_slot_id) WHERE parent_slot_id IS NOT NULL;

CREATE TABLE rubric_slot_attempts (                 -- written on failure, skip, degradation and the final ok; 90 d
  slot_id TEXT NOT NULL REFERENCES rubric_slots (id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL, step TEXT NOT NULL CHECK (step IN
    ('capability','data','writer','similarity','scene','render','photo','store','release','dispatch','project')),
  rubric_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','failed','skipped','degraded')),
  provider TEXT, http_status INTEGER, error_code TEXT,
  message TEXT CHECK (message IS NULL OR length(message) <= 300),   -- boundDetail + redactSecrets
  started_at INTEGER NOT NULL, finished_at INTEGER NOT NULL,
  PRIMARY KEY (slot_id, attempt, step)
) WITHOUT ROWID;
CREATE INDEX rubric_slot_attempts_age_idx ON rubric_slot_attempts (started_at);

CREATE TABLE rubric_step_marks (                    -- persisted «due» markers (dota-enqueue pattern, scheduled.ts)
  step TEXT PRIMARY KEY CHECK (step IN ('plan','health','purge','learn')),
  next_due_at INTEGER NOT NULL, last_run_at INTEGER, last_success_at INTEGER,
  last_error_code TEXT, fail_count INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
INSERT OR IGNORE INTO rubric_step_marks (step, next_due_at) VALUES ('plan',0),('health',0),('purge',0);

CREATE TABLE rubric_breakers (
  scope TEXT NOT NULL CHECK (scope IN ('provider','rubric')),
  key TEXT NOT NULL,
  failures_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(failures_json) AND json_array_length(failures_json) <= 6),
  opened_until INTEGER, last_code TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key)
) WITHOUT ROWID;

CREATE TABLE rubric_notices (                       -- refinement of v2: day-keyed, own prune, own counter
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 160),
  msk_day TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('failure','health','bank','summary')),
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX rubric_notices_day_idx ON rubric_notices (msk_day, kind);
```
Design points: no FK to `posts`/`publications` (lifecycle archives and purges posts after retention; a slot's `post_id` may dangle and the detail endpoint copes); all `ON CONFLICT` clauses repeat the partial index predicate or omit the target (N11); `INSERT … ON CONFLICT DO NOTHING` without a target for slot inserts (B1). Stage 4 does **not** create the audience tables (0118), bets (0120), facts/signatures (0121), analytics, hour slots (0123) or ledger (0124).

### 6.2 Later migrations (this area)

- `0120_rubric_bets.sql` (stage 5): `rubric_bets(id PK, post_slot_id, patch_version, hero_ids_json, poll_id, form TEXT CHECK IN ('picture','text'), opened_at, resolved_at, result_slot_id)`; `CREATE UNIQUE INDEX rubric_bets_open_uq ON rubric_bets (1) WHERE resolved_at IS NULL` (one open bet; an overlapping tick cannot create a second); resolution by `UPDATE … WHERE resolved_at IS NULL` (changes === 1), which also stores `stopPoll` shares. Bet closes only when the result post is published.
- `0121_rubric_post_facts.sql` (stage 6): `rubric_post_facts(slot_id, rubric_key, kind, value, at, state CHECK IN ('reserved','sent'))` with partial UNIQUE for once-ever kinds (`workshop`, `steam`, `ability` per window handled in code) **reserved at `ready`** (H3: two builds never take the same hero/line), released on yield/empty/cancel; `rubric_slots.sig_text`, `sig_lead` BLOB for lexical similarity. History for similarity/inner planning = sent ∪ live.
- `0124_rubric_budget.sql` (stage P): `rubric_budget_days(day TEXT, resource TEXT, used INTEGER, cap INTEGER, PRIMARY KEY(day, resource))` (UTC day; resources `browser_ms`, `screenshots`), `rubric_leases(name PK, until)` (`browser_next_at`). STRATZ lease lives in STATS_DB with the collector (M4).

## 7. Slot state machine (every state has a deadline exit; `next_action_at` and `deadline_at` NOT NULL)

| State | Entered when | At `next_action_at` | Success → | `deadline_at` and exit |
|---|---|---|---|---|
| planned | plan insert; fallback retry/advance | `build_at` (slot−3 h; chain/event: now): guarded claim `planned→building`, `attempt+1`, `lease_until=now+15 min`, `build_started_at=NULL`, then `AI_JOBS.send(rubric-build uuid)` | building | slot−20 min → `empty` NOT_BUILT_IN_TIME. Superseded by plan (patch changed, constraint changed, trigger gone) or cancelled by lock-off. |
| building | claim | lease expiry (`min(lease_until, deadline)`) | ready (consumer) · planned (next/same candidate) · empty · cancelled | slot+2 min → `empty` NOT_BUILT_IN_TIME. Lease expired **after** `build_started_at` = `BUILD_LOST` ⇒ next candidate (H5); **before** start ⇒ same candidate once; rubric breaker: 2 BUILD_LOST/24 h ⇒ rubric out 24 h. |
| ready | guarded `building→ready` (post created after, N3) | slot−60 s: release | released · yielded (gate) · superseded (patch changed) · missed | slot+4 min → `missed` RELEASE_LATE. **Before every exit from ready** (deadline, KEY_REUSED, lock-off, supersede) look up the publication by post (`findPublicationByPost`); found ⇒ mark `released`, never delete (N1). |
| released | publication created | slot+2 min, then every 5 min: project | sent · partial · unknown · send_failed · missed | slot+24 h → `unresolved` (job still not final, tick never saw it). Poison: handler error ⇒ `handler_errors+1`, backoff 2ⁿ min, at 3 ⇒ deadline exit (`released→unresolved`). |
| unknown | projection sees job `unknown` | every 1 h | sent / missed after the owner's reconciliation (existing «Публикации» flow) | created_at+72 h → `unresolved` + one notice. Excluded from re-selection and lease recovery; **counts** for caps/rest/hero rules; holds follow-ups. |
| waiting_parent | follow-up created at parent's `released` (provisional `slot_at = parent.slot_at + afterMinutes`, build output copied) | parent sent ⇒ `ready` | ready | own slot_at+20 min → `cancelled` + notice (post kept in the studio as an approved post for a manual send: the one case where an unpublished rubric post is **not** deleted). Parent unknown ⇒ keeps waiting until that deadline («a riddle whose send is `unknown` holds its answer for the owner»). |
| poll_close | projection of a sent poll | `slot_at` (sent_at + 24 h / 7 d): `stopPoll` | `sent` (facts = final counts) | slot_at+24 h → `missed` + one notice; `already_closed` ⇒ take final counts from `tg_polls` if present (stage 2) else `sent` with empty counts; `not_found` ⇒ `missed`; 429/unknown ⇒ retry with backoff (idempotent). |

Terminal: `sent partial unresolved send_failed missed empty skipped yielded cancelled superseded`. `send_failed` only from a definite `rejected` outcome. Generated test: for every live status × clock, the exit exists and is reachable within its deadline (a table-driven test over `slot-machine.ts`).

## 8. Cron flow (app/scheduled.ts hook, own container with own 40-statement meter)

Placement: after `notifyOwnerOfDeliveries` and `publicationIdle` are known, before `dota-enqueue`; **not** gated by `publicationIdle`, `counts.due`, `minute`, or other steps' failures (B4); scheduler failures never feed `failures` of other gates but do count for the tick summary (`step('rubric-scheduler', …)`). A missing table anywhere ⇒ scheduler off this tick, one warn log, one owner notice per day (H9); `PUBLISHING_ENABLED` off or no bot token ⇒ lock, one health line (N7).

0. `runSchedulerTick(controller, runtime)` (NEW `app/rubric-scheduler/tick.ts`): evaluate locks (section 14) — env locks cost **zero** D1 statements; then 1 read of `rubric_scheduler_settings` (+ `rubric_settings` when needed).
1. Off-cleanup (once): `off_cleanup_done=0` set by `PUT scheduler enabled=false` ⇒ one guarded batch: live pre-release slots (`planned building ready waiting_parent`) → `cancelled` SCHEDULER_OFF, their unpublished posts deleted via lifecycle `deletePosts` (≤20 per tick; leftovers next tick), `released` continue; then `off_cleanup_done=1`. Runs **before** the lock check closes (it must run while the lock is off), bounded.
2. Slot step (every tick, including :00/:30): `SELECT id … WHERE status IN live AND next_action_at <= now` as two bounded branches (ready first, LIMIT 3; others LIMIT 3), each slot handled in its own try/catch: release (≤2), claim-build (≤2, `AI_JOBS.send` with `uuid(sha256('rubric-build:'+slot+':'+attempt))`, N8), project (≤4), poll-close, deadline exits. Stops when `meter.remaining() < 8`.
3. One marker step per tick: `SELECT step … WHERE next_due_at <= now ORDER BY next_due_at LIMIT 1`; success ⇒ `next_due_at = now + period`; failure ⇒ `fail_count+1`, `next_due_at = now + min(2^fail, 30) min` (N5, so a throwing plan cannot starve health/purge). Periods: `plan` 30 min or when dirty (`UPDATE … SET next_due_at = now` from yield/supersede/trigger), `health` 15 min, `purge` daily (200 rows: attempts > 90 d, notices > 14 d, terminal slots > 400 d), `learn` (stage 8).
4. `plan` (≈ 10 reads + 1 guarded batch, ≤ 28 statements): settings, rubric_settings, live+recent slots, channel load (2), dota state (2), breakers, capabilities; pure `plan()` for today+tomorrow; batch of `[UPDATE … SET status='superseded' WHERE id=? AND status='planned'; INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM rubric_slots WHERE id=?old AND status IN live)]` pairs (N6) and plain `INSERT … ON CONFLICT DO NOTHING` for new slots; a conflict logs `plan_conflict`, marks dirty, never throws.
5. Release, 6. projection, 7. health: sections 10, 11, 16. Dead Cron is already caught by the existing heartbeat (`/status`, 7-min staleness); `/status` gets one scheduler line (`app/bot/owner-reports.ts`).

Statement budget (test): lock read 1–2 + slot step select 2 + release ≈ 18 (gate 3 + createPublication ≈ 14 + guarded update 1) + claim 1–2 + project 2/slot + marker ≤ 28; worst busy tick asserted ≤ 40 by the meter (an over-budget step defers itself to the next tick, never half-applies).

## 9. Build consumer — `rubric_build` job (`app/workflows/rubric-build.ts`, NEW; branch in `app/ai-queue.ts`; schema in `app/bot/ai-job.ts`)

`AiJob` gains `{id: uuid, kind: 'rubric_build', slotId: uuid, attempt: int}` (no `chatId`, so `lostJobs` never double-reports; `WriterJob` Exclude list updated). The branch runs **in every build** (not behind `lab !== null`), always `message.ack()`, never throws (Queue `max_retries: 0`, batch 1). Boundary of the transaction: «claim = conditional UPDATE on `rubric_slots`; result = guarded `building→ready` + post attach».

1. `aiWriter.claimJob(id, now)` (INSERT OR IGNORE; false ⇒ duplicate ⇒ ack). No lease in `ai_queue_jobs`: the **slot lease** is the only recovery (review-backend).
2. Load slot; must be `building`, same `attempt`, `lease_until > now`, else ack (stale message).
3. Guarded `UPDATE … SET build_started_at=? WHERE id=? AND status='building' AND attempt=?`.
4. Candidate = `candidates_json[cand_idx]`: `eligible()` (capabilities, provider/rubric breakers, ledger) — missing capability ⇒ `CAPABILITY_MISSING`, no notice, advance.
5. Inner history (stage 4: only the slot turn; stage 6: sent ∪ live facts) ⇒ `BuildDeps`.
6. `buildRubricPost(strict:true)`; typed `AppError`/source errors classified transient/permanent by `errorParts` (5xx, timeout, 429 ⇒ transient). `reason: 'NO_DATA'` ⇒ **content skip** (outcome `skipped`, no notice).
7. Stage 6: similarity (lexical) ⇒ one rewrite, then bank line / next candidate; fact check for AI-written rubrics (20) ⇒ one rewrite, then next candidate.
8. Media to R2 `rubric/<slot>/<attempt>/<n>` (stage P; stage 4 has no media).
9. Guarded `UPDATE rubric_slots SET status='ready', build_json=?, facts_json=?, next_action_at=slot_at−60 s, deadline_at=slot_at+4 min WHERE id=? AND status='building' AND attempt=?`; 0 changes (lock-off, superseded, lease lost) ⇒ delete the R2 objects, ack.
10. Create the approved post: `createPost` with `newId` = deterministic uuid `uuid(sha256('rubric-post:'+slot+':'+attempt))` (v8 bits, tested against `z.uuid()`, N8), `approvePost` actor `RUBRIC_ACTOR`, poll posts with `poll.shuffleOptions`/`pictureInPoll`; then `UPDATE rubric_slots SET post_id=? WHERE id=? AND post_id IS NULL AND status='ready' AND attempt=?`; 0 changes ⇒ `deletePost`. A crash between 9 and 10 is repaired by release, which recreates the post from `build_json` only when the post row is absent (N3); an archived post ⇒ `missed`.
11. Failure ⇒ `recordBuildResult`: attempt row (step, provider, status, code, message via `describeError`/`redactSecrets`), then section 12.

Orphan control: every error path after step 8/10 deletes what it created; `purge` also deletes approved posts of `RUBRIC_ACTOR` with no slot reference older than 1 day (guard rail, ≤20/day).

## 10. Release gate and error classification (`app/workflows/rubric-release.ts`, NEW)

Order for a `ready` slot with `next_action_at <= now`:
1. Locks re-checked (a lock off ⇒ cancel path: N1 lookup first).
2. **N1 lookup** `findPublicationByPost(slot.post_id, destination)` ⇒ found ⇒ `released` (publication id) and stop.
3. Gate on a D1 snapshot only (H6): all channel posts today + last 72 h (`ChannelLoad`), plus earlier releases of this same tick (appended in memory), `constraints.check` with the **final** time. Stale/unavailable load ⇒ fail **open**, log `GATE_LOAD_STALE`. Patch check: `facts.patch ≠ latest patch` for a patch-dependent rubric ⇒ `superseded` + dirty (H2). Violation ⇒ `yielded` + dirty (event/anchor re-planned inside its freshness; pool rubric not consumed).
4. Post exists? absent ⇒ recreate from `build_json` (N3).
5. `createPublication` / `createPublicationSeries` (separate picture+poll, `gapMs: 30_000`): `actor: RUBRIC_ACTOR`, `idempotencyKey: 'rubric:'+slot.id`, `scheduledAt = slot_at` exactly (idempotency hashes the request), `timezone: 'Europe/Moscow'`, `notAfter: slot_at+20 min`, noop notifier, then `kickDispatch`. Guarded `ready→released` stores `publication_id`, `next_action_at = slot_at+2 min`.
6. Rehearsal: destination chat must be in the allowlist `{OWNER_TELEGRAM_ID, RUBRIC_REHEARSAL_CHAT_ID}` else slot `missed` `REHEARSAL_TARGET` (section 14).

| Outcome of step 5 | Slot | Owner message |
|---|---|---|
| replay of the stored response (`runIdempotent`) | `released` | – |
| `SCHEDULE_OUT_OF_RANGE` (late > 5 min grace) | `missed` RELEASE_LATE | yes |
| `POST_NOT_FOUND`, `POST_NOT_APPROVED`, `STALE_REVISION`, `CONTENT_INVALID`, `ALREADY_PUBLISHED`, `IDEMPOTENCY_KEY_REUSED` (N1 lookup done first) | `missed` + code | yes |
| `POST_ARCHIVED` | `missed` POST_ARCHIVED | yes |
| `DESTINATION_NOT_FOUND`, `DESTINATION_DISABLED` | `missed` + lock `DESTINATION` | health line |
| `IN_FLIGHT`, `UNAVAILABLE`, D1 error | stay `ready`, `next_action_at = now+30 s`, `handler_errors+1` (3 ⇒ deadline exit) | only via health |
| gate violation | `yielded` + dirty | no |

Never a second send: one deterministic post id and one idempotency key per slot attempt; the dispatcher's conditional claim and send mark are untouched.

## 11. Projection, follow-ups, poll_close, bank exhaustion

### 11.1 `app/workflows/rubric-project.ts` (NEW; every ≤5 min per released slot, batched read of ≤20 publications)
Input `readPublicationOutcomes`. Mapping: `sent` ⇒ `sent`; `failed` (definite refusal, RETRIES_EXHAUSTED) ⇒ `send_failed`; `unknown` ⇒ `unknown`; `cancelled`/missing ⇒ `missed` (NOT_AFTER_PASSED / OWNER_CANCELLED); series first sent + later cancelled ⇒ `partial`; scheduled_at ≠ slot_at ⇒ `manual=1`. The transition is **one guarded batch** `WHERE status IN ('released','unknown')`: slot row (sent_at, `message_ids_json`, `poll_id`, `facts_json`), `rubric_settings.last_sent_at`/clears `last_failed_at`/`skip_until`, follow-up slot(s), `poll_close` slot, deferred `remember` of tellers/shame hero (stage 4: `system_state` writes in the same batch), bank exhaustion marker (11.3). Counting: `sent partial unresolved unknown` consume rest; `send_failed` does not.

### 11.2 Follow-ups and poll close
- 04: parent `released` ⇒ child `kind='follow_up'`, `waiting_parent`, `parent_slot_id`, `slot_at = parent.slot_at + 180 min`, build output copied from the parent's build (riddle + answer built together, like the lab); constraint check treats it as a virtual occupant when planning; answer is `V` (same look as the riddle). Parent sent ⇒ child `ready`; slot_at collision ⇒ +10 min up to 6 tries. First guesser «Первым угадал @ник» (stage 4 comment reading) comes from `AudienceReader` (null until stage 2/7) with the hint-after-1.5 h variant; absent ⇒ the plain answer.
- Poll posts: on `sent`, insert `poll_close` slot at `sent_at + pollCloseHours` (24 h polls, 7 d quizzes and 06 bets). `stopPoll` result stored in that slot's `facts_json` (`{total, options:[{text,voters}]}`); later posts that quote votes read it. `open_period` is not used (F7).

### 11.3 Bank exhaustion (exact owner messages)
Projection reads `facts.bank = {name, turn, size}`; the round is complete when `(turn + 1) % size === 0`.
- `exhaustion:'pause'` (26 «Ребус», after stage 6 history): `rubric_settings.paused_reason='BANK_EXHAUSTED'`, `bank_size_at_pause=size`; list status «банк исчерпан»; message: «Рубрика „Ребус“ закончила банк и поставлена на паузу. Пополните банк.» Resume by itself in the `plan` step when the catalog's current bank size is larger than `bank_size_at_pause`: clear the pause and pick the new entries first (stage 6 used-id history; F2).
- `exhaustion:'new_round_notice'` (jokes and banks 13, 14, 15, 16, 18, 24, 25, 27, 28, 30): no pause; message once per round (`rubric_notices` key `bank:<rubric>:<round>`, exempt from the daily cap): «Рубрика „Переводчик с токсичного“ закончила банк и начала с начала. Если хотите — пополните банк, иначе будет по кругу.»
- `new_round_silent` (17, 22, 23 hero pools): next round without a message.
Titles come from `RUBRIC_TITLES` (no hard-coded copies).

## 12. Fallback chain, breakers, failed-rubric re-queue, content skip

- Advance rule (`fallback.ts`, pure): on a candidate failure — transient (5xx/timeout/429) with ≥45 min to `slot_at` and not yet retried ⇒ same candidate once after 10 min (`planned`, `build_at = now+10 min`); `PICTURE_DROPPED`/text variant allowed by `allowDegrade` ⇒ text variant if alternation allows; otherwise next alternate (≤3 candidates, order set by `select.ts`: same weight → other weight → greeting filler); none left or past slot_at+20 min ⇒ `empty`. Late fill same day only when the invariants hold (plan re-runs, dirty). One transient retry per slot, ≤3 candidates (H5).
- Failed rubric **keeps its turn**: the rest uses `last_sent_at` (set only on `sent`), turns are slot counts (F1), reservations released on yield/empty; `last_failed_at` set; `select.ts` boosts it for 48 h **only when its provider breakers are closed** («first in line for the next fitting slot once its cause clears»). Event rubrics are re-planned inside their freshness (09 ≤ 21 d, chain steps within their window); a key with ≥2 ended slots in `empty/missed/send_failed` is dropped with one notice (B2); a calendar post whose day passed is skipped (`skipped`).
- Content skip (`NO_DATA`/«нечего сказать»): `skipped`, `rubric_settings.skip_until = next MSK day 00:00` for pool rubrics, no notice/breaker/failure count.
- Provider breaker (`rubric_breakers` scope `provider`): failure timestamps (≤6) in 6 h; ≥3 ⇒ `opened_until = now+6 h`; dependent rubrics (via `RubricMeta.providers`/`needs`) are not candidates until then (one notice on open: «Провайдер STRATZ: 3 сбоя за 6 часов — рубрики на нём отдыхают до 19:40 МСК.»); after expiry the next build is the probe; success clears. Rubric breaker (scope `rubric`): 2 `BUILD_LOST` in 24 h ⇒ out 24 h.
- Error taxonomy (`rubric_slot_attempts.error_code`, stable): `CAPABILITY_MISSING BREAKER_OPEN DATA_SOURCE_UNAVAILABLE NO_DATA STATS_NOT_CONFIGURED BROWSER_NOT_BOUND BROWSER_BUDGET_EXHAUSTED PICTURE_RENDER_FAILED PICTURE_SCENE_FAILED PHOTO_FETCH AI_UNAVAILABLE AI_BUDGET DEGRADED:<code> SIMILAR_TEXT FACT_CHECK_FAILED STORE_FAILED BUILD_LOST HANDLER_ERROR NOT_BUILT_IN_TIME RELEASE_LATE GATE_VIOLATION PATCH_CHANGED SCHEDULER_OFF REHEARSAL_TARGET`.

## 13. Start-up seeding (`seeding.ts`, pure; applied by `plan` when `rubric_settings` rows are missing)

First run: no rubric has a last post, so all are due. For every **pool** rubric order by stable hash(rubric_key, anchor date); rubric k gets `due offset = min(k × (7 / POOL_PER_WEEK), restDays − 1)` days with `POOL_PER_WEEK = 10` (≈ the pool's weekly capacity, release-model 10.4); `last_sent_at = now − (restDays − offset) days`, `last_sent_seeded = 1` (the UI shows «первый выход по плану»; seeded values are never used for analytics). Event/calendar/chain rubrics are not seeded (they wait for their trigger); `horoscope_anchor_week` is fixed to the first Monday ≥ enable day + 1. A rubric newly enabled (0→1) or resumed gets `last_sent_at = now − restDays days` (due at its next fitting slot); the seed batch is idempotent (`INSERT OR IGNORE`).

## 14. Locks, capability map, DEV rehearsal

Locks (the scheduler acts only if all hold; each is reported with a code in `GET /rubrics/status`; frontend codes from area-frontend.md adopted):

| # | Lock | Code when failing | Notes |
|---|---|---|---|
| 1 | build: `__LAB__ === false` (prod) or rehearsal | `DEV_NO_REHEARSAL` | scheduler handed to `handleScheduled` from `src/index.ts` only then |
| 2 | var `RUBRIC_SCHEDULER` exactly `"on"` (env.production only) or `"rehearsal"` (env.dev only); any other string = off, **zero D1 rows** | `VAR_OFF` | `"true"`/`"ON"`/missing ⇒ off (test) |
| 3 | D1 `rubric_scheduler_settings.enabled = 1` (default 0) | switch off | owner flips it in UI |
| 4 | `PUBLISHING_ENABLED === "true"` and bot token | `PUBLISHING_OFF` / `BOT_NOT_CONFIGURED` | N7 |
| 5 | destination present (prod: `settings.destination_id`; rehearsal: `RUBRIC_REHEARSAL_DESTINATION_ID`) | `DESTINATION_MISSING` / `REHEARSAL_TARGET_MISSING` | |
| 6 | DEV only: lab master Cron on and BackgroundJob `rubricScheduler` on | `CRON_OFF` | contracts `BACKGROUND_JOBS` += `rubricScheduler`; `lab-cron.ts` unchanged logic |
| 7 | schema present (tables of 0119, and 0117 columns) | `SCHEDULER_NOT_READY` | «no such table/column» ⇒ off this tick, one warn log |
Per-rubric `rubric_settings.enabled` is the finer switch. Off: live pre-release slots cancelled, unpublished posts deleted, released publications continue (DECISIONS 13.10.2026).

Capability map (`app/rubric-scheduler/capabilities.ts`, NEW): `{browser, openai, stratz, statsDb}` read from bindings, never from names of environments: `browser = isBrowserBinding(env.BROWSER)` (ledger is a separate dynamic check, stage P); `openai = Boolean(OPENAI_API_KEY) && mode≠'rehearsal'`; `stratz = stratzAccess(...) !== null && mode≠'rehearsal'` (rehearsal must not touch the shared STRATZ quota: 2 addresses/15 min); `statsDb = env.STATS_DB !== undefined` (DEV: false by itself). Unmet `needs` ⇒ never a candidate, UI «нужен Browser Rendering», **no notices** (H7). `GET` endpoints can run a forecast with `FORECAST_CAPABILITIES` (DEV var, comma list) so the DEV Календарь shows what prod would plan.

DEV rehearsal (DECISIONS 30.10.2026, N9): `env.dev.vars`: `RUBRIC_SCHEDULER="rehearsal"`, `RUBRIC_REHEARSAL_DESTINATION_ID` (uuid of the test channel's destination row), `RUBRIC_REHEARSAL_CHAT_ID` (its chat id). The scheduler runs for real into the test channel only: no AI (capability `openai=false` ⇒ `writer` rubrics are not candidates, `bank_turns` rubrics use the bank, AI scenes/upscale excluded), stats rubrics excluded (no `STATS_DB`, `stratz=false`). Defence in depth: allowlist `chat_id ∈ {OWNER_TELEGRAM_ID, RUBRIC_REHEARSAL_CHAT_ID}` checked at release **and** in the dispatcher in lab builds (`DispatchDeps.refuseChat`, applied only to publications linked from `rubric_slots`, one extra read per job on DEV only). Rehearsal spends no OpenAI balance by construction. DEV owner notices carry a «[DEV]» prefix; «nothing in 36 h» and «0 audience updates» are suppressed on DEV and only evaluated when all locks hold and a rubric is eligible (N10).

## 15. Browser ledger and prod-only locks (stage P)

- Prod gets `"browser": {"binding": "BROWSER"}` in `env.production` (owner decision 30.10.2026: «подключи на проде»); agents edit wrangler.jsonc, the owner deploys.
- Ledger (`rubric_budget_days`, 0124): conditional reserve `INSERT … ON CONFLICT(day, resource) DO UPDATE SET used = used + ?3 WHERE used + ?3 <= ?4` (repeat the predicate if the index is partial), `changes === 1` ⇒ reserved; settle with the measured wall time. **UTC day** (Cloudflare resets at UTC, QA M4). Caps in vars: `BROWSER_DAILY_CAP_MS` prod 720000 (12 min), DEV 240000 (4 min) — together 16 min/day, under the Paid allowance (10 h/month included ≈ 20 min/day) so no overage; to be re-verified against the current Browser Rendering price page before stage P (`not_run`). Cap reached ⇒ `browser` leaves the capability map for the rest of the day: picture rubrics are not candidates, no notices, UI «лимит браузера».
- Pacing: D1 lease `browser_next_at` (`UPDATE rubric_leases SET until=?1 WHERE name='browser' AND until <= ?2`) replaces the in-process `setTimeout` gap, because two queue consumers can run in parallel; gap constant starts at 2 s on Paid (the lab's 11 s is the Free plan) — verify REST limits before changing.
- Prod-only: nothing in this area writes a row on DEV unless `RUBRIC_SCHEDULER="rehearsal"`; the lab «Прислать» path keeps working and never touches slots.

## 16. Notices policy and health (`notice-policy.ts`, `app/workflows/rubric-notices.ts`)

- Key `rubric:<rubric>:<step>:<code>:<msk_day>` claimed by `INSERT OR IGNORE` into `rubric_notices` (one per rubric+step+code per MSK day). Daily cap 6 failure notices; the 7th and later only increment a count; the health step sends **one** summary after 20:00 MSK when suppressed events exist: «За сегодня ещё N событий по рубрикам — см. «Рубрики».» (exact N). Provider breaker open, bank, unresolved-72 h and schema notices have their own kinds and are exempt from the cap (still deduped by key).
- Exact failure line (v2): «Тир-лист» (19:00 МСК) не собран: шаг «данные», STRATZ через мост, HTTP 503. Вместо него: «Признавайтесь». — built from the attempt row (step, provider, status, code, message; no secrets, no `initData`/payloads), plus `requestId` in the log, not in the line.
- Other lines: release failure «„Нерф или баф?“ (19:00 МСК) не вышла: слот опоздал, публикация не создана.»; unresolved «Пост „Что выберешь?“ от 3 ноя не подтверждён уже 72 часа — сверьте его в «Публикациях».»; health «Планировщик рубрик: план не обновлялся N ч.» / «Рубрики не выходили 36 часов, хотя кандидаты были.» / «Слот „X“ (19:00 МСК) просрочен и не закрыт.» / «Планировщик рубрик выключен: в базе нет миграции 0119 — примените её.»
- Health step (every 15 min): `plan` stale (> 2 h while locks hold) · no `sent`/`partial` rubric slot in 36 h with all locks on and an eligible rubric · a live slot with `deadline_at < now − 5 min` · stage 2: 0 audience updates in 24 h while posts exist · lock lines (for `/status`, no notice). All composed from D1; no network.

## 17. Endpoints the UI needs (skill `contract-change`)

New `apps/contracts/src/rubric-scheduler.ts` (exported from `index.ts`; the frontend plan calls it `rubrics.ts` — the coordinator picks one name), all under `/api/v1/rubrics`, owner-only (session guard + `requireOwner`), `z.strictObject` inputs, instants UTC ISO, MSK days `YYYY-MM-DD`. Error codes stay in the existing set (`apiErrorCodeSchema`) with `details.reason`; **no new `ApiErrorCode`**. Additive: new endpoints only. Rate limit via `rateLimit` (reads 60/min).

| Endpoint | Request | 200 response | Errors (`details.reason`) | Concurrency |
|---|---|---|---|---|
| `GET /rubrics/status` (C2) | – | `RubricSchedulerStatusDto`: `{mode:'live'\|'rehearsal'\|'unavailable'\|'forecast_only', enabled, effective:'running'\|'switched_off'\|'locked'\|'unavailable', locks:{code}[], transition:'enabling'\|'disabling'\|null, pendingCancel, liveSlots, next:{slotId,rubricKey,at,reason}\|null, destination:{kind:'channel'\|'rehearsal',title}\|null, lastPlanAt, planStale, capabilities:{browser,openai,stratz,statsDb}, browserBudget?:{usedToday,capToday}, revision, updatedAt}` | 401, 403, 503 UNAVAILABLE `SCHEDULER_NOT_READY` | – |
| `PUT /rubrics/scheduler` (C3) | `{enabled: boolean, destinationId?: uuid\|null, revision: int}` | same DTO | 400 `DESTINATION_REQUIRED`/`DESTINATION_NOT_ALLOWED`; 409 CONFLICT `STALE_REVISION`; 409 `UNAVAILABLE_HERE` (mode unavailable); 503 `SCHEDULER_NOT_READY` | revision in body (owner decision 06.10.2026, no If-Match); locks are state, not errors. `enabled=false` sets `off_cleanup_done=0` and answers `transition:'disabling'`. |
| `GET /rubrics/calendar?from&to` (C4) | `from`,`to` MSK dates, span ≤ 42 d | `{slots: SlotDto[], changes: ChangeDto[], oldestDay, updatedAt}`; `SlotDto = {id, rubricKey, at, role:'post'\|'followup', hasPicture, hasPoll, state: SlotState, reason:{kind:'rest'\|'event'\|'anchor'\|'chain'\|'weekly'\|'filler'\|'replacement', text}, detail?:{code,message,step?,provider?,httpStatus?}, replacementOf?, replacedBy?, movedFrom?, publicationId?, externalMessageId?, manual?}` (`poll_close` rows never returned; ≤ 500 rows; `reason.text`/`detail.message` composed server-side in Russian, same wording as the owner notice) | 400 span; 401; 403; 503 `SCHEDULER_NOT_READY` | read |
| `GET /rubrics/forecast` (C5) | – | `{days:[{date, slots:[{rubricKey, at, hasPicture, hasPoll, reason}]}], from, until, computedAt}` — pure `plan()` over 35 MSK days against current state; `Cache-Control: private, max-age=300`; works in stage 3 (forecast_only, no tables) and in stage 4 | 401, 403, 503 | read |
| `GET /rubrics` (C6) | – | `{items: RubricListItem[], updatedAt}`; item `{key, state:'active'\|'paused'\|'waiting_event'\|'bank_exhausted'\|'unavailable'\|'breaker', unavailable?:'browser'\|'openai'\|'stratz'\|'statsDb', breaker?:{until,code}, enabled, hasPicture, rest:{baseDays,currentDays,reason?}\|null, trigger:{text}, lastPostAt, next:{at,slotId}\|null, liveSlots, revision, bank?:{total,used,round,kind:'pause'\|'cycle'}, posts?, multiple?}` (`posts`, `multiple` from stage 7) | 401, 403 | read |
| `GET /rubrics/{key}` (C7) | – | item + `recent: SlotDto[]` (last 8) + stage-gated blocks (`bet` stage 5, `innerRules` stage 6, `hours`/`advice` stage 8) | 404 NOT_FOUND `RUBRIC_NOT_FOUND` | read |
| `PATCH /rubrics/{key}` (C8) | `{enabled: boolean, revision: int}` | item | 400; 404 `RUBRIC_NOT_FOUND`; 409 `STALE_REVISION` | revision in body; enabling sets `last_sent_at = now − rest`; disabling cancels that rubric's live pre-release slots (cleanup marker) |
| `GET /rubrics/slots/{id}` | – | `SlotDetailDto = SlotDto + {attempts:[{attempt,step,provider?,httpStatus?,code,message,at,outcome}], candidates:[{rubricKey,state:'chosen'\|'failed'\|'skipped'\|'waiting',reason}], facts, preview:{text,hasPicture,poll?:{question,options}}, times:{createdAt,buildStartedAt,readyAt,releasedAt,sentAt}, publication?:{id,status}}` | 404 `SLOT_NOT_FOUND` | read |

Alignment with `area-frontend.md` (the same needs, merged): names C1–C8 adopted; `STALE_VERSION`/`expectedVersion` → project convention `STALE_REVISION`/`revision` (skill contract-change); `SlotState` = the 16 backend statuses without `poll_close` (frontend list lacks `skipped`: badge «Пропуск» maps it, `empty` maps «Не собран»); the frontend's forecast-from-plan-step suggestion is replaced by per-request compute + 5-min cache (pure code, ~10 reads); `slots/{id}` is added for the slot detail the mocks show; compare/slices/comments (C9–C13) belong to stage 7; C15 removal of the manual «Рубрики Telegram» API happens in the UI stage together with the frontend (`content-analytics-routes.ts` rubric routes, `modules/content-analytics` rubric repository, `apps/backend/tests/integration/content-rubrics.test.ts`; tables of 0089 dropped by a later migration after deploy, d1-migration rule 9). Scheduler attribution never reads `content_rubrics`/`content_post_rubrics` (v1's idea of seeding them is dropped).

Backend files: `apps/contracts/src/{rubric-scheduler,settings,rubric-samples,index}.ts` (add `rubricKeySchema`, `rubricSampleKeySchema` rebuilt from it, `BACKGROUND_JOBS += 'rubricScheduler'` with default `false` in schema and `BACKGROUND_DEFAULTS`), `apps/backend/src/app/rubric-routes.ts` NEW (thin handlers → `modules/rubric-scheduler` use cases), mounted in `create-app.ts` next to `/api/v1/publications`; `docs/API_CONTRACTS.md` (section «Рубрики»: names and meaning only); contract tests in `apps/backend/tests/integration/rubric-scheduler-contract.test.ts` (success + each documented error parse with the schema); frontend MSW fixtures are the frontend area's.

## 18. File-by-file change list (everything this area touches)

Stage 0: section 3.3. Stage 1: section 4.2 plus `apps/backend/migrations/0117_publishing_not_after_poll_id.sql`, `docs/backend/publishing.md` (not_after, poll flags, `external_poll_id`, `stopPoll`), `docs/backend/data-migrations.md` (release step), `docs/DECISIONS.md` (prod-migration-before-main row), `apps/contracts/src/post-poll.ts` + frontend type consumers (frontend area).

Stage 3 (pure, no D1): NEW `modules/rubric-scheduler/{index.ts, domain/*, application/{ports.ts, plan-preview.ts, read-forecast.ts}}`, NEW `app/rubric-routes.ts` (forecast + status read-only), `app/container.ts` (`rubricScheduler` getter, `rubricCatalog`), `modules/dota/index.ts` + `modules/content-analytics/index.ts` (read exports above), `.dependency-cruiser.cjs` unchanged (rules already cover the new module), `package.json` (devDependency `fast-check`).

Stage 4: `migrations/0119_rubric_scheduler.sql`; NEW `modules/rubric-scheduler/application/{claim-build,record-build-result,release-slot,project-slots,close-polls,check-health,purge,settings,read-calendar,read-rubrics,read-slot}.ts` and `infrastructure/{d1-slot-repository,d1-settings-repository,d1-marker-repository,d1-breaker-repository,d1-notice-repository}.ts`; NEW `app/rubric-scheduler/{runtime,tick,wiring,capabilities}.ts`; NEW `app/workflows/{rubric-actor,rubric-build,rubric-release,rubric-project,rubric-notices}.ts`; `app/scheduled.ts` (one `step('rubric-scheduler')` after `publicationIdle`; `TickContainer` Pick extended), `app/ai-queue.ts` (+ `rubric_build` branch, always ack), `app/bot/ai-job.ts` (+ schema, `WriterJob` Exclude), `src/index.ts` (`createSchedulerRuntime(env, {lab})`, `createRubricBuildAccess(env)` passed to the queue handler), `app/env.ts` (`RUBRIC_SCHEDULER`, `RUBRIC_REHEARSAL_DESTINATION_ID`, `RUBRIC_REHEARSAL_CHAT_ID`, `FORECAST_CAPABILITIES`), `app/container.ts`, `app/lab/lab-cron.ts` (job list) + `apps/contracts/src/settings.ts`, `app/bot/owner-reports.ts` (`/status` line), `app/post-origins.ts` (include `RUBRIC_ACTOR` in `createdBy` so rubric posts carry the automatic-origin mark in the studio; optional), `app/create-app.ts`, `platform/security/deterministic-uuid.ts` NEW (+ test vs `z.uuid()`), `wrangler.jsonc` (`env.production.vars.RUBRIC_SCHEDULER="on"`, `env.dev.vars.RUBRIC_SCHEDULER="rehearsal"` + rehearsal ids; the setting stays off until the owner flips it), `docs/backend/cron.md`, NEW `docs/backend/rubric-scheduler.md` (canonical state machine, locks, tables; linked from the `docs/BACKEND_ARCHITECTURE.md` index), `docs/RUBRICS_SCHEDULER.md` status line, `docs/API_CONTRACTS.md`, `docs/LOCAL_PREVIEW.md` (rehearsal vars).

Stage 5: `migrations/0120_rubric_bets.sql`; `domain/triggers.ts` live wiring; `app/workflows/process-dota-updates.ts` (marks `plan` dirty on a new patch with hero changes; resolves the open 06 bet by conditional claim + `stopPoll`); `modules/rubrics/greeting-card.ts` bank (rubric 31, with the owner's notes in `.logs/handoff/rubrics/new/greeting_card/`); 04 follow-up wiring (11.2).

Stage 6: `migrations/0121_rubric_post_facts.sql`; `modules/rubric-scheduler/domain/{inner-planner,similarity}.ts`; `RubricSources.history` port; builders' `facts`; lift `needsHistory` for 26.

Stage P: `migrations/0124_rubric_budget.sql`; `app/rubric-scheduler/ledger.ts`; `wrangler.jsonc` production `browser` binding + cap vars; `app/rubric-build/build-post.ts` (`pace()` → lease); picture media path (`attachStoredMedia` in `modules/content` if measurement shows >3 files cost too many statements: `uploadPostMedia` ≈ 13 D1 statements per file).

## 19. Tests per stage (assert D1 state, not mock calls; fake clock and scripted transport)

- Stage 0: meta/key coherence; strict degradations; scheduler build ports have no side effects (turn counter, tellers, shame hero untouched by a failed build) — critical (F1).
- Stage 1: section 4.3.
- Stage 3: L1 tables (MSK, triggers incl. hotfix join, exclusions pinned to the owner doc, constraints one by one, plan B1/freeze/jitter, seeding spread, release classification, notice keys/cap, breaker transitions, deadline exit for every state); L2 fast-check; L3 30-day simulation.
- Stage 4 (L4 Worker integration): plan (off→on restores slots, yield re-plans, re-plan vs claim race, conflict never throws, `slot_at` unique across kinds); markers (archive step throws every tick ⇒ slots still planned/built/released; busy ticks; missed window next tick; failing marker backs off, others still run); build (two claims → one message; lease expiry before/after start; stale message; lock-off mid-build deletes media/post; crash between `ready` and post attach; no BROWSER ⇒ no candidates and 0 notices; strict degradation fails the candidate; content skip ⇒ `skipped`, no notice); release (two ticks → one publication; crash between create and `released` repaired by N1; late > 4 min `missed`; post deleted / CONTENT_INVALID / KEY_REUSED; two releases < 2 h in one tick; stale channel data fail-open; patch between build and release; same hero in two builds); dispatch interplay (kill switch past `not_after`; 429 beyond `not_after`; claim refuses expired); projection (sent/partial/unknown/cancelled, `manual`, follow-up created once, `poll_close` created once, `stopPoll` retries/already closed/not found); sweeps/health; notices (10 failures ⇒ 1 notice + summary); bank exhaustion messages (exact text); budget (worst tick ≤ 40); deploy without migration (0117 shim, 0119 off); locks table (`"on"`, `"true"`, `"ON"`, missing); rehearsal (allowlist refuses prod chat at release and dispatch; zero AI calls; zero rows when var off).
- Stage 5: bet race (partial UNIQUE), resolution once, 2-month close, patch chain with hotfix, anchor exact minute, greeting date/hour.
- Stage 6: reservation at `ready` (two builds, one hero), release on yield, once-ever UNIQUE, similarity reject → rewrite → bank line.
- L6 contract tests: every endpoint success + documented errors parse; `OWNER_PREAPPROVED`/`RUBRIC_ACTOR` not reachable via HTTP; `gapMs`, `pictureInPoll` not settable via HTTP.

## 20. Verification per stage: DEV vs prod

| Stage | DEV | Prod (owner steps) |
|---|---|---|
| 0 | `npm run verify:changed`; lab presses of 3 rubrics identical to before; bundle size and CPU readings recorded | none (no runtime change); bundle size check gates the merge |
| 1 | tests green; CI applies 0117 to DEV D1 before the deploy; news autopublish still sends (existing flow as regression) | **apply 0117 to prod first**, then the develop→main PR; verify with the owner-run D1 list; shim removed one release later |
| 3 | `GET /rubrics/forecast` on DEV with `FORECAST_CAPABILITIES`; owner reads the 35-day plan | same endpoint, read-only, honest `forecast_only` |
| 4 | master Cron on + `rubricScheduler` job on + switch on in UI: 3-day rehearsal into the test channel, no AI; acceptance: every slot ends in a terminal state, no post outside the allowlist, no slot stuck past its deadline, `/status` line present, notices bounded | apply 0119; switch default **off**; owner turns it on; first week: text/poll rubrics only; watch `/status`, «Рубрики» |
| 5 | rehearse a patch chain by replaying a past patch version | live triggers |
| 6 | rehearse bank rotation | pause rubrics enabled |
| P | picture rubrics in rehearsal within the 4 min DEV cap | owner adds BROWSER to prod; cap 12 min/day; picture rubrics join after a week of text go-live (owner question 1 of v2) |

## 21. Risks

1. Shared publishing SQL (0117) — outage if prod lacks the column (mitigated: release step + shim).
2. Worker bundle size after F4 — unmeasured here; gate at stage 0.
3. Build-time state (F1) — fixed in the scheduler adapter; any builder added later that mutates state must go through a port (test enforces).
4. Bank growth vs shuffled order (F2) — pause rubrics wait for stage 6.
5. Release timing: slot_at is minute-aligned and release lead is 60 s; the dispatcher still claims at the next tick or via `dispatch_now`; anchors are exact ±1 min, others ≈ +0–60 s.
6. Cron/queue concurrency: queue consumer concurrency scales; two builds of different slots can race for Browser/STRATZ (ledger/lease, stage P) and for the same hero (reservation at `ready`, stage 6; until then the release gate catches the second one).
7. Poll stop depends on the bot being the sender (true) and on `message_id` of the poll; a missing `poll.id` does not break it.
8. Owner reschedules/cancels a rubric publication by hand: handled (`manual`, `missed OWNER_CANCELLED`).
9. D1 write volume: ~6 slot rows/day + attempts; negligible against 50 M/month.
10. Lifecycle purges archived posts, leaving dangling `post_id` (detail endpoint shows «пост удалён»).
11. Dependency on two parallel areas: frontend (endpoint shapes above) and stage 2 audience (null port until then).

## 22. Open questions for the owner

1. **Comments text kept 7 days — ждёт владельца** (not needed by this area; counts and summaries are kept).
2. 25 «Ты на линии»: when its bank ends, pause (answers known) or new round with a notice? Recommendation: new round (numbers are live).
3. Rubric destination in prod: choose the channel in the switch panel (prefilled from the autopublish channel) or always reuse the autopublish channel? Recommendation: choose in the switch, prefilled.
4. Browser caps 12 / 4 min a day (DEV/prod) — confirm after the price page check; recommendation yes.
5. Fallback shim for 0117 (section 4.4) or owner step only? Recommendation: both.
