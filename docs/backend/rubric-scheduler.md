# The rubric scheduler as built (stages 3–4, migration 0119)

The channel's rubrics go out by themselves (DECISIONS 30.10.2026): planned in Moscow time, built three hours ahead,
released to publishing a minute before their slot with a deadline, read back until sent. Plan and rules:
`docs/scheduler/MASTER-PLAN.md`; the owner's rubric rules: `docs/RUBRICS_SCHEDULER.md`.

## Where it runs (`app/rubric-scheduler/runtime.ts`)

| `RUBRIC_SCHEDULER` | Mode | Posts to | Capabilities |
|---|---|---|---|
| `on` (production) | live | the channel the owner picks in «Рубрики» | from the bindings: Browser Rendering, the AI, STRATZ, the match base |
| `rehearsal` (DEV) | rehearsal | the channel the owner picks in «Рубрики» | Browser Rendering only: no AI, STRATZ or match base |
| anything else | forecast only | nowhere | — |

## Locks (`app/rubric-scheduler/locks.ts`)

The tick does nothing while any holds; «Рубрики» shows each: `NOT_HERE`, `SCHEMA` (0119 missing), `SWITCHED_OFF`,
`LAB_OFF` (DEV: «Рубрики» off in Фоновые задачи), `NO_DESTINATION`, `DESTINATION_DISABLED`, `PUBLISHING_OFF`. Switching off cancels the
slots not yet released once (their studio posts deleted); released ones finish in publishing.

## The tick (`app/rubric-scheduler/tick.ts`, Cron step `rubric-scheduler`)

1. **Plan** every 30 minutes, or at once after a change the plan must see (`rubric_step_marks`): today and tomorrow over
   every channel post (news and the owner's publications, the scheduler's own slots). Only the rubrics whose inner rules
   are coded run (`INNER_RULES_READY`: banks that go round without repeats); a rubric switched off, paused (bank
   exhausted) or held back by a skip is left out. A slot being built or within 10 minutes of its build is frozen; a
   planned slot the new plan drops is `superseded`, never moved.
2. **Due slots**, at most two builds, two releases and four read-backs a tick; every move is a conditional transition.

## The slot (`modules/rubric-scheduler/domain/slot-machine.ts`)

| State | Next action | Deadline → exit |
|---|---|---|
| `planned` | build at slot − 3 h: claim (`building`, lease 15 min) and queue `rubric_build` | slot + 4 min → `empty` |
| `building` | lease over: `BUILD_LOST` — the candidate fails (rubric breaker counts it), the next candidate or `empty` | slot + 4 min → `empty` | A queue-send error returns the slot to `planned` (attempt given back, no blame). A late build (slot already moved) deletes its posts and counts nothing.
| `ready` | slot − 1 min: release | slot + 4 min → `missed` (posts deleted) |
| `released` | read the publications back every minute | slot + 30 min → `missed` |
| `unknown` | read back every 10 min until the owner reconciles in «Публикации» | 7 days → `unresolved` |

Ended: `sent`, `partial`, `unresolved`, `send_failed`, `missed`, `empty`, `skipped` (content skip or bank exhausted,
keeps its dedupe key), `cancelled` (switch off, rubric off, «Пропустить слот»), `superseded`, `yielded`.

## Build (`app/workflows/rubric-build.ts`, queue `rubric_build`)

`buildRubricPost` in strict mode: a degradation the rubric does not allow fails the candidate. The bank turn is the Bank turns count content slots only (not `poll_close` or `follow_up`). After-send steps run before the `sent` transition and are idempotent, so a crash between them is repeated by the next tick.
count of the rubric's slots that took one (`sent`, `partial`, `unresolved`, `unknown`, `ready`, `released`), so a build
that never goes out burns no line; the lab keeps its own counters. The post becomes approved studio posts (the
`rubric-scheduler` actor): the post with its pictures, then its poll as a second post, or one poll with the picture
inside (`pictureInPoll`); options shuffled for each voter. A failed candidate gives way to the slot's next one (up to two
fallbacks from the plan), else the slot ends `empty`. A bank that must not repeat (`exhaust: 'pause'`) pauses its rubric
at the end and the owner hears of it.

## Release and read-back (`app/workflows/rubric-release.ts`, `rubric-project.ts`)

One publication, or a series (the post, its poll 30 s later), keyed by the slot, scheduled at the slot with
`not_after` = slot + 20 min (publishing cancels it past that). The slot follows publishing's status: all sent → `sent`
(the rubric's rest starts from the real send time), some → `partial`, any unconfirmed → `unknown`, dropped past
`not_after` → `missed`. Nothing is ever sent twice: an unconfirmed send waits for the owner.

## Notices (`app/workflows/rubric-notices.ts`)

One per reason and Moscow day (`rubric_notices`), at most six failures a day, then one summary; «[DEV]» in rehearsal.

## Tables (migration 0119)

`rubric_scheduler_settings` (switch, channel, horoscope week, revision), `rubric_settings` (per rubric: on/off, rest
and its source, last post real or seeded, skip, bank pause), `rubric_slots` (unique live `slot_at` and `dedupe_key`),
`rubric_slot_attempts` (90 days), `rubric_step_marks`, `rubric_breakers`, `rubric_notices`.

## Events, chains and follow-ups (stage 5, migration 0120)

`domain/triggers.ts` turns the stored patches (`dota_update_items` patch_notes) and Steam announcements, the week's
game-file finds, the open bet and the greeting-card calendar into event candidates, each with its Moscow day window
and a dedupe key; the plan places them before the pool rubrics.

| Rubric | When | Dedupe key |
|---|---|---|
| 01 / 02 / 03 / 07 | the patch's day / the evening after / day 3 / days 4–6 (a hotfix within 5 days joins its patch; a later one is a patch of its own, chain `chain:<full version>:…`) | `chain:<base>:<rubric>` |
| 06 bet / result | 21+ days after a patch, one open bet (`rubric_bets`) / two days after the next patch | `bet:<base>` / `bet-result:<base>` |
| 08 | 30, 45, 60, 90, then every 30 days without a patch; at most two days earlier | `valve_time:<version>:<mark>` |
| 09 | one to five days after a Steam announcement | `steam:<gid>` |
| 05 | Friday evening when the game's files showed something new | `files:<friday>` |
| 31 | a dated card on its day at 11:00 (four 14.02 cards by `year % 4`; the patch card for a major patch) | `card:<id>:<year>` |

A slot's build gets the rubric's history (its own posts newest first, the other rubrics' of the last week, from
`rubric_slots.facts_json`) and stores the new post's facts. The builders keep the owner's rules with it: joke options rest
(02: 4 posts, 03: 6, 09: 4), looks never twice in a row (03, 04, 05, 06, 08), 03 avoids 01/02's heroes of the patch, 04
rotates its difficulty and rests a hero 5 riddles and an ability 20, 05 never shows a find twice, 07's answer sets rest 5
posts, 09 rates an announcement once, 11 never repeats a set. Every build is also refused (the next candidate tries) when
its text is too close to one of the rubric's last 20 (word-trigram Jaccard ≥ 0.5, `modules/rubrics/similarity.ts`) or
when its hero was in another rubric post within 72 hours (`heroGate: cross72h`).

After a post went out: its poll is registered with the audience module and a `poll_close` slot closes it at 24 h (7 days
for quizzes and bets) with `stopPoll`, the final counts kept; 04's answer, built with the riddle, becomes a `follow_up`
slot 180 minutes after the riddle really went out; a bet opens with its poll and closes with its result, which quotes the
channel's votes.

«Открытка» (31) posts the owner's own picture for the card (R2 `static/greeting/<id>.png`) with the card's wish word for
word; no picture uploaded, no post. The bank is copied from `.logs/handoff/rubrics/new/greeting_card/bank.json` into
`modules/rubrics/greeting-cards.ts`; weekday and «any» cards fill free slots 30 days apart.

## All rubrics and their own rules (stage 6)

Every rubric runs except «Открытка», the owner's unapproved draft (`INNER_RULES_READY`, 31.10.2026). A builder that finds nothing worth posting returns a
content skip (`CONTENT_SKIP`): the slot's next candidate tries, else the slot ends `skipped`. «Факты Валв» (14) takes
its numbers from Valve's live data at build time (`modules/rubrics/valve-values.ts`, the on-lane pattern); an entry
without live numbers rests 7 days after a patch. The other history rules: 10 and 12 never take the same hero twice in a
row (12 picks among the top 5 heroes with no guide yet), 17, 19–23, 26 and 29 rest their last lines and heroes by
`recentFacts`; «Гороскоп» keeps its tellers and «Позор дня» its hero in the slot's facts, not in a counter.

## Analytics (stage 7, migration 0121)

`modules/rubric-analytics` scores each rubric post of the analytics channel (`ANALYTICS_TELEGRAM_CHANNEL`) once it is
25.5 hours old, against the channel's usual post of the 28 days before it: views by the median, reactions, comments and
votes by the median rate per view (+1 smoothing), each clamped to ×0.1–×10; the score is their weighted geometric mean
(views 0.5, reactions 0.2, comments 0.2, votes 0.1, renormalised over what is known). A post the preview did not see
from its first hours, a contaminated one or one of another channel (DEV's test channel) is never scored. Rows
(`rubric_post_scores`) keep their raw numbers and the baseline used, so a formula change can re-score them.

| Step (queue `rubric_analytics`) | When (Cron, claim `ra:*`) | What |
|---|---|---|
| `score` | every hour at :22 | new scores, then the 72 h numbers of older rows |
| `summary` | 06:07 MSK | the comment themes: one AI call a day at most (`rubric_summary_runs`), production only, comments as JSON data, ids and counts checked by code (`domain/theme-validate.ts`) |
| `week` | Monday from 06:47 MSK, hourly until built | the Monday report's «Рубрики» block (`rubric_week_blocks`) from the rows scored since the last block |

The Monday report shows the block after «🎬 Форматы видео» (the old video-format line, renamed): best and worst
rubric and post, a table against the usual post, failures of the week. «Рубрики» → «Аналитика» reads
`/api/v1/rubric-analytics/{compare,posts,comments}`.

«Первым угадал» (04): the riddle's answer stays a draft until its release; then the riddle's comments (kept 10 days)
are matched by `modules/rubrics/first-guess.ts` (the lexicon's nicknames, the «Анкета» names, Valve's name; a word
with a short ending, never a longer word; a comment naming three heroes is ignored) and the first guess goes above
the answer. A failure to read the comments sends the plain answer.

## Learning (stage 8, migration 0122)

Each Moscow Monday after the report's block, the `learn` step (claim `ra:learn`, minute 52) turns the scores into
advice: a pool rubric whose last scores (shrunk toward ×1 by three pseudo-posts) land above ×1.15 comes 10 % more often
(1–5 days), below ×0.85 rarer; rests stay 7–60, a rubric changes at most every 14 days, at most three a week; the
owner's own rest is never touched. Hours: each post against its own rubric's usual post, cells by weekday group (`wd`,
`we`, a single weekday once it has 12 posts) and hour, shrunk toward their block of the day; a slot moves an hour
toward a hour that lands 10 %+ better, never beyond ±3 hours of 12:30/19:00, inside 08:00–22:30, two hours from the
other slot. One pool slot in five goes an hour off its time (a trial hour), so other hours get data.

Four weeks from the first scored post the step only logs advice (`rubric_learning_log`); then it applies through
conditional writes (`rubric_settings.rest_source = 'learned'`, `rubric_hour_slots`), unless the owner turned it off in
«Рубрики» → «Аналитика» → «Обучение» (owner, 31.10.2026: answer 10). A replay of the step logs and applies nothing twice.

## The DEV week-long test (stage 10, migration 0123)

`RUBRIC_REHEARSAL_PACE=week` in DEV vars only (`app/rubric-scheduler/runtime.ts` `rehearsalPace`); production never reads it (mode `live`).

- **Pace** (`WEEK_PACE`, the plan's `PlanInput.pace`): rests, «apart» days and the quiet after a patch ÷ 8; slots at 10:00, 14:30, 16:30, 21:00 besides 12:30 and 19:00; ≤ 8 posts and 6 rubrics a day, 1 h apart; ≤ 2 interactive a day, 4 h apart; «same week» means the same day. Polls close after 2 h, 04's answer after 1 h (`rubric-after-send.ts`).
- **Stubs**: a rubric that needs the AI, STRATZ or the match base is planned (`planCapabilities`) and built as a stub text (`rehearsal.ts` `stubPost`, with a stub poll for poll rubrics); no paid call. The similarity check skips stubs.
- **Events** (`event-sources.ts`): the newest patch counts as out on the test's first day (its chain runs); «Валв-тайм» on day 1, the bet and an announcement on day 2, game-file finds on day 3.
- **Staged failures** (`scenarioFor`): one slot in four, in turn — `build_crash` (the first build dies; the lost lease counts as `BUILD_LOST` and the next candidate goes), `build_fail` (the first candidate fails; the next one goes), `build_late` (every build dies; the slot ends empty), `tg_429`, `tg_timeout` (the job goes `unknown`, never re-sent; the check stays open until the slot ends or 26 h, `bad` if a second send happened), `tg_forbidden` (`send_failed`, rest not spent). Telegram failures are answered by `rehearsal-send.ts` through `DispatchDeps.rehearse` after the send mark, once per slot; Telegram is not called.
- **Journal** `rubric_rehearsal_checks` (`rehearsal-journal.ts`): the plan step (every 30 min) enlists new slots and judges ended ones (`judge`: ok / bad / void with a Russian note; a slot live 26 h past its time is «stuck»). `GET /api/v1/rubrics/rehearsal`, page `/lab/rehearsal`.

## Why a rubric post did not go out

The slot keeps it: `rubric_slots.status`, `error_code`, `error_step` and every step in `rubric_slot_attempts`. The Russian wording of each code is `apps/contracts/src/rubric-reasons.ts`. «Рубрики» shows a rubric's last 30 slots («История», `GET /api/v1/rubrics/{key}/slots`); «Лента дня» marks rubric posts and shows the day's slots that are not a publication with their reason (`dashboard-routes.ts` adds `rubricKey` and `rubricSlots`).
