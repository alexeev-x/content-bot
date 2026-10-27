# Rubrics → scheduler: what is left to build

**Status: not built.** Today a rubric exists only as a DEV sample: «Тестирование» → «Рубрики» sends one rubric's post
from live data to the owner's chat (`apps/backend/src/app/lab/rubric-samples.ts`). Nothing below runs yet. This file
lists what the work of wiring rubrics to the scheduler and to real autopublishing must cover; the product rules
(pool, weekly budget, two-week rest, news first, picture rule) are in `docs/PLAN.md` §2 and are not repeated here.
Each rubric's approved look and text: `design-refs/rubrics/<NN>-<key>/README.md`.

## For every rubric

1. **A trigger per rubric.** What makes a rubric due: a new patch, a weekly slot, a build in the game files, or the
   pool's own turn. The scheduler picks among the due ones by PLAN §2's rules.
2. **Draft, then the owner's approval.** A rubric post becomes an ordinary draft (the sample's picture, caption and
   poll) the owner approves or edits, then goes through the existing publishing pipeline (skill
   `publishing-reliability`: D1 owns state and dedup, an unconfirmed send is `unknown`, never retried by itself).
3. **What was posted is kept in D1.** Each published rubric post stores its rubric key, the facts it was built from
   (heroes, ability, patch version, finds) and its Telegram message and poll ids. Follow-up posts, no-repeat rules and
   analytics read it from there.
4. **Second posts are D1 jobs.** A rubric's `followUp` (`apps/backend/src/modules/rubrics/types.ts`) becomes a job with
   its own `run_at` (a fixed delay) or a wait for an event (the next patch); Queue `delaySeconds` holds 24 h at most,
   so long waits live in D1.
5. **Polls close.** Every poll gets `open_period`; a poll whose votes a later post quotes is stopped by the bot
   (`stopPoll` returns the final counts), so the bot must be the poll's sender.
6. **Budgets.** Browser Rendering's free 10 minutes a day (one screenshot per 10 s), 50 subrequests and 50 D1 queries
   per invocation, the AI queue's rate limit: render and write at draft time, never inside the Cron tick that sends.
7. **Background work.** DEV runs with the background work off; turning a rubric trigger on there is an owner choice.
8. **The DEV sample page goes** once every rubric is approved and the scheduler makes the same posts (code, tests and
   docs removed, not hidden).

## Per approved rubric

- **01 «Кого понерфили»** — trigger: a patch with hero changes.
- **02 «Кто теперь имба?»** — the day after 01, same patch.
- **03 «Нерф или баф?»** — after a patch; one poll message with its picture inside.
- **04 «Чья способность?»** — the answer post 3 h after the riddle (`ANSWER_AFTER_MINUTES`), the pair keeps one look.
  Ideas the owner asked to keep: who guessed first (the bot reads the discussion group), a hint after 1.5 h if nobody
  guessed, no ability repeated within the last ~20 riddles (needs the history in item 3).
- **05 «Утечка недели»** — weekly; no finds in 7 days means no post.
- **06 «Кого понерфят?»** (in work, `design-refs/rubrics/06-who_gets_nerfed/README.md`) — a bet on the next patch:
  - when: 21 days or more after the latest patch, before the next one (owner, 27.10.2026: «можно и после 3 недель»),
    so it never falls near 02;
  - store the bet: a new D1 table (expand-only migration, skill `d1-migration`) — the post's id, the hero ids, the
    patch version at bet time, the poll id, `resolved_at`;
  - never a second bet before the first one's result is out (owner, 27.10.2026: «чтобы случайно первый пост дважды
    не ушёл до того, как мы финал выпустим»): the rubric is not due while a bet is open or its result is unpublished,
    and D1 enforces it — a partial `UNIQUE` index allows one open bet, so an overlapping Cron tick cannot create a
    second; the bet closes only when its result post is published;
  - resolve: when the patch detection (`app/workflows/process-dota-updates.ts`) sees a newer patch with hero changes,
    a conditional claim of the open bet (`UPDATE … WHERE resolved_at IS NULL`), `stopPoll` for the vote shares, then the
    result draft «Угадали?»: each hero's outcome from the new patch (`patchOutcomes`), the vote shares («62% ставили на
    …») and the result picture of the same look as the question;
  - a patch with no hero changes leaves the bet open; a bet still open 2 months after it was posted closes without a
    patch: the result post «Два месяца прошло, патча нет — Valve, как обычно, похуй» (owner, 27.10.2026).

## In work (06–10 batch, 27.10.2026)

- **07 «Valve, ты серьёзно?»** — after a patch with hero changes; not in the same days as 01–03 of that patch.
- **08 «Валв-тайм»** — due on the day a mark without a patch is reached: 30, 45, 60, 90 days, then every 30; each mark
  once per patch.
- **09 «Оцениваем»** — due when a Valve announcement of the last 21 days brings a novelty to rate; each announcement
  once (kept by its Steam id, item 3).
- **10 «Кто кого перебьёт?»** — one picture, no answer post; a pair not repeated within the last ~20.

## Release plan (to design with the owner)

How rubrics go out is decided later, together with the scheduler (owner, 27.10.2026: «потом продумаем, как лучше
выпускать, чтобы это не было просто потоком текста»). Input from the SMM review of 01–10 (`.logs/handoff/rubrics/`):
Dota channels run 65–90% picture posts, so pictures are normal; they become wallpaper when the same hero faces come
several days in a row (01, 02, 03 and 07 all follow one patch). Proposed: a picture where it is the content, rubrics
that may alternate picture and text, at most two picture posts in a row, rubrics of one patch spread over days, and a
question-and-answer pair carrying one picture or two by the rubric's own choice. Each rubric keeps its picture layout
ready; the release plan picks picture or text per post.
- **06 «Угадали?» picture** (owner, 27.10.2026: «наверно тоже решается на уровне, была ли выше картинка рубрики»): by
  default the result follows its bet — a bet with a picture gets the result picture of the same look, a text bet a
  text result; the release plan may override.
- **07 picture** — optional (owner, 27.10.2026: «тот случай, что можно и без картинки, и с картинкой»): the release
  plan picks.
