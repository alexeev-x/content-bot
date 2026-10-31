# The rubric scheduler as built (stages 3–4, migration 0119)

The channel's rubrics go out by themselves (DECISIONS 30.10.2026): planned in Moscow time, built three hours ahead,
released to publishing a minute before their slot with a deadline, read back until sent. Plan and rules:
`docs/scheduler/MASTER-PLAN.md`; the owner's rubric rules: `docs/RUBRICS_SCHEDULER.md`.

## Where it runs (`app/rubric-scheduler/runtime.ts`)

| `RUBRIC_SCHEDULER` | Mode | Posts to | Capabilities |
|---|---|---|---|
| `on` (production) | live | the channel the owner picks in «Рубрики» | from the bindings: Browser Rendering, the AI, STRATZ, the match base |
| `rehearsal` (DEV) | rehearsal | only `RUBRIC_REHEARSAL_DESTINATION_ID` whose chat id is `RUBRIC_REHEARSAL_CHAT_ID` | Browser Rendering only: no AI, STRATZ or match base |
| anything else | forecast only | nowhere | — |

## Locks (`app/rubric-scheduler/locks.ts`)

The tick does nothing while any holds; «Рубрики» shows each: `NOT_HERE`, `SCHEMA` (0119 missing), `SWITCHED_OFF`,
`LAB_OFF` (DEV: «Рубрики» off in Фоновые задачи), `NO_DESTINATION`, `DESTINATION_DISABLED`, `REHEARSAL_DESTINATION`
(the rehearsal channel is not set, or a chat other than the test channel), `PUBLISHING_OFF`. Switching off cancels the
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
| `building` | lease over: again (3 attempts while ≥ 15 min remain) or `empty` | slot + 4 min → `empty` |
| `ready` | slot − 1 min: release | slot + 4 min → `missed` (posts deleted) |
| `released` | read the publications back every minute | slot + 30 min → `missed` |
| `unknown` | read back every 10 min until the owner reconciles in «Публикации» | 7 days → `unresolved` |

Ended: `sent`, `partial`, `unresolved`, `send_failed`, `missed`, `empty`, `skipped` (content skip or bank exhausted,
keeps its dedupe key), `cancelled` (switch off, rubric off, «Пропустить слот»), `superseded`, `yielded`.

## Build (`app/workflows/rubric-build.ts`, queue `rubric_build`)

`buildRubricPost` in strict mode: a degradation the rubric does not allow fails the candidate. The bank turn is the
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
