# Rubrics → scheduler: what is left to build

**Status: partly built (31.10.2026).** The scheduler plans, builds, releases and reads back the bank rubrics whose inner
rules are coded (13, 14, 15, 16, 18, 24, 25, 27, 28, 30; docs/backend/rubric-scheduler.md); «Рубрики» shows the switch,
the slots, every rubric and the 35-day forecast. Event and chain rubrics, follow-ups, hero history and picture rubrics on
production come with the later stages of docs/scheduler/MASTER-PLAN.md. The DEV sample in «Тестирование» → «Рубрики»
is built by the same code (`app/rubric-build/`). This file
lists what the work of wiring rubrics to the scheduler and to real autopublishing must cover; the product rules
(pool, weekly budget, two-week rest, news first, picture rule) are in `docs/PLAN.md` §2 and are not repeated here.
Each rubric's approved look and text: `design-refs/rubrics/<NN>-<key>/README.md`.

## For every rubric

1. **A trigger per rubric.** What makes a rubric due: a new patch, a weekly slot, a build in the game files, or the
   pool's own turn. The scheduler picks among the due ones by PLAN §2's rules.
2. **No approval step** (DECISIONS 30.10.2026). A rubric post (the sample's picture, caption and poll) is built ahead of
   its slot and goes out by itself through the existing publishing pipeline (skill
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
7. **Automatic on production only** (owner, 30.10.2026: «на деве это не работает… работать только на прод должно
   автоматически, но также можно выключить»). On production it runs on its own, and the owner can switch it off. On DEV
   it never posts to the main channel: the owner calls a rubric from «Тестирование» → «Рубрики», and a rehearsal runs
   the scheduler for real into the test channel only, without the AI (DECISIONS 30.10.2026).
8. **Two kinds of rules, both to design with the owner** (owner, 29.10.2026: «пока не думаем про эти правила, но мы
   вернёмся к ним»). *Between rubrics*: which rubric goes when (the release plan below). *Inside a rubric*: what it
   picks for its next post — e.g. a hero does not come back until every hero of its pool has had his turn
   (22 «Что брать рекруту» today picks at random among this week's bank heroes), a look or a bank line in turn. Each
   rubric gets its own rule when wired; the history in item 3 is what they read. Every rubric has its own planner
   (owner, 30.10.2026: «внутри рубрик свой планировщик каждый… чтобы похожая шутка не попалась, у каждой свои
   правила»): besides exact repeats it blocks a *similar* joke, topic or comparison to the rubric's earlier posts, which
   for AI-written rubrics means checking the new text against that history before it goes out.
8a. **Moscow time** (owner, 30.10.2026: «все посты должны выходить по московскому часовому поясу»). Every slot, day
   boundary, weekday and «best hour» is reckoned in `Europe/Moscow` (UTC+3, no DST); D1 still stores UTC.
8a1. **Hours are learned** (owner, 30.10.2026: «время тоже… он должен учиться»). 12:30 and 19:00 MSK are only the
   starting slots; about one post in five tries another hour, and the scheduler moves the slots to the hours where
   our own posts do best (views and reactions compared at the same post age). Hours are learned per weekday, not one
   set for the week (owner: «понедельник утро — люди в школе, в универе»): weekdays and weekends, later each day, get
   their own best hours once there are enough posts. No hour is ruled out by guesswork (owner: «возможно, они как раз
   сидят в телефонах в школе»): the trial posts cover the whole day, 08:00–23:00 MSK, school hours included. Draft model:
   `.logs/handoff/scheduler/release-model.md`.
8b. **Calendar posts at their own hour** (owner, 30.10.2026: «рубрика с поздравлениями… новый год и т. д., там в каждой
   будет время»). «Открытка» (`greeting_card`, in work: `.logs/handoff/rubrics/new/greeting_card/notes.md`) goes out on
   its day at the hour set for that card (e.g. New Year at its own time); such a post holds its date and hour, and the
   other rubrics of that day fit around it.
9. **The DEV sample page stays**: it is how the owner calls any rubric on DEV (item 7).

## Per approved rubric

- **01 «Кого понерфили»** — trigger: a patch with hero changes. Inner rules (owner, 30.10.2026): one post per patch
  (a patch already posted is never taken again); a hotfix within 5 days joins the same post (built on the newest
  numbers if not yet out; never a second post); fewer than 3 weakened heroes — no post, not an error; its heroes are
  not reused by 03 of the same patch when others exist; portrait backgrounds stay random.
- **02 «Кто теперь имба?»** — the day after 01, same patch. Inner rules (owner, 30.10.2026): one post per patch, the
  evening after 01, and it goes out even when 01 was skipped if at least 2 heroes came out stronger; a hotfix joins the
  same post; the joke poll option may repeat only after 4 later posts of this rubric; the poll closes after 24 h and the
  bot keeps the final votes; its heroes are not reused by 03 of the same patch when others exist.
- **03 «Нерф или баф?»** — after a patch; one poll message with its picture inside. Inner rules (owner, 30.10.2026):
  one post per patch, on day 3, at least 40 h after 02's poll; its hero is not one of 01/02 of that patch when another
  fits; the picture look never the same twice in a row; the joke option may repeat only after 6 later posts of this
  rubric; a poll closes after 24 h, the trap quiz after 7 days, votes kept; no fitting hero — the trap; no trap — no post.
- **04 «Чья способность?»** — the answer post 3 h after the riddle (`ANSWER_AFTER_MINUTES`), the pair keeps one look.
  Inner rules (owner, 30.10.2026): rest 14 days, the answer the same day before the evening slot; an ability not
  repeated within the last 20 riddles, its hero not within the last 5; the look never twice in a row; difficulty in
  turn Лёгкий → Средний → Тяжёлый; a riddle whose send is `unknown` holds its answer for the owner. Built with the
  comment reading (stages 1 and 4): «Первым угадал @ник» — the first comment naming the right hero (players' names
  count, e.g. «Котл»); a hint (attribute or role) added after 1.5 h when no comment has the right hero.
- **05 «Утечка недели»** — weekly; no finds in 7 days means no post. Inner rules (owner, 30.10.2026): Friday evening;
  without finds the slot goes to another rubric, no notice; a find once shown is never taken again, even if a new build
  carries it; the look never twice in a row; easter eggs repeat only after 4 later posts; in a patch week it goes out
  only with finds not already in the patch — all finds in the patch means no post.
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
  - inner rules (owner, 30.10.2026): the result on day 2 of the new patch, after 01; a bet not within 3 days of 08;
    the bet poll closes after 7 days, its final votes kept for «Угадали?»; a bet's heroes do not repeat the previous
    bet — if the same are still strongest, at least two new ones; the result keeps the bet's form (picture or text);
  - a patch with no hero changes leaves the bet open; a bet still open 2 months after it was posted closes without a
    patch: the result post «Два месяца прошло, патча нет — Valve, как обычно, похуй» (owner, 27.10.2026).

## In work (06–10 batch, 27.10.2026)

- **07 «Valve, ты серьёзно?»** — after a patch with hero changes; not in the same days as 01–03 of that patch. Inner
  rules (owner, 30.10.2026): one post per patch, day 5 (window 4–6); text in the patch week, later with its picture
  unless two pictures came just before; its heroes not from 01–03 of that patch when other tiny changes exist; the
  joke option set repeats only after 6 later posts; the poll closes after 24 h, votes kept; a hotfix's tiny changes
  join the patch's, no second post.
- **08 «Валв-тайм»** — due on the day a mark without a patch is reached: 30, 45, 60, 90 days, then every 30; each mark
  once per patch. Inner rules (owner, 30.10.2026): the day slot of the mark's day, moved at most 2 days for a patch or a
  heavy day, never later; any patch (even without hero changes) resets the count; not within 3 days of 06's bet; the
  look never twice in a row; a mark's joke repeats only after all that mark's jokes went out.
- **09 «Оцениваем»** — due when a Valve announcement of the last 21 days brings a novelty to rate; each announcement
  once (kept by its Steam id, item 3). Inner rules (owner, 30.10.2026): evening, 1–5 days after the news post about the
  same announcement, never the same day; several announcements — the newest first, the others wait, at least 7 days
  between posts; not within 3 days of 11; the poll options never the same twice in a row; the poll closes after 24 h,
  votes kept.
- **10 «Кто кого перебьёт?»** — one picture, no answer post; a pair not repeated within the last ~20. Inner rules
  (owner, 30.10.2026): rest 21 days, evening; a pair not within the last 20 posts, each hero not within the last 5;
  real build and joke strictly in turn; the joke kind and the look never twice in a row; a title repeats only after 4
  later posts; for 7 days after a patch with hero changes only the joke variant.

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
- **«Сеты из мастерской»** — a set never repeats (owner, 27.10.2026: «чтобы сет не повторялся»): the scheduler skips
  every Workshop id already posted (the history in item 3) and takes the highest-trending one left of the week's top ten.
  Inner rules (owner, 30.10.2026; «сеты не повторяются — это важно»): a set never repeats, ever; rest 21 days; the set's
  hero not within the last 5 posts; not within 3 days of 09; no new set in the top ten — no post; a set Valve already
  announced as an item (09 told it) is not taken.
- **«Гайд на героя»** — a hero does not repeat (owner, 27.10.2026: «чтобы не повторялись герои», details when wired to
  publishing): the scheduler skips heroes already guided (the history in item 3). It also picks the role, not only the
  hero's main one (owner, 27.10.2026: «Инвокер саппорт, Рубик мид»), and may take the hero most named in the channel's
  comments; both are for when the scheduler is built. Its rubric sources must carry the bot's match base
  (`heroMatches`, `docs/backend/sources.md` «Hero statistics base»), as «Тестирование» does, and it should prefer a hero and
  role with at least 150 games there. Inner rules (owner, 30.10.2026): rest 9 days to start (owner: «хотя бы раз в 8–9
  дней, это полезный контент, или раз в 12»), Saturday or Sunday preferred; a hero not repeated until every hero has
  had a guide, then a new round with another role where possible; silent 7 days after a patch with hero changes; a
  second role only where the hero is really played there — never a joke role like «Антимаг саппорт» (owner: «шуточные
  не надо») — so it needs ≥150 games and a real share of the hero's games (e.g. ≥15%), no forced quota; its hero not in
  another rubric's post of the last 3 days; too few
  games for the role — the next hero, never a guide with guessed items.

## Inner rules, 13 onward (owner, 30.10.2026)

- **13 «Признавайтесь»** — rest 14 days, any slot, text; bank and AI posts in turn, confession 2 of 3, hot take 1 of 3;
  a bank line not repeated until the whole bank has gone out; an AI text is checked against all earlier posts of the
  rubric — similar topic or joke: one rewrite, still similar: a bank line instead; not in the same week as 24 «Что
  выберешь?» (same two-reaction mechanic), and if they meet, different emoji pairs; a topic (hero, role, situation) not
  within the last 10 posts.
- **14 «Объясни как дебилу»** — rest 21 days; bank and AI in turn; a mechanic not repeated until the whole bank has
  gone out, a comparison never repeated; numbers from the game files are read at build; a mechanic with a hand-written
  number (runes, glyph, buyback) is skipped after a patch that changed it until the owner rechecks it (the list goes to
  the owner); a mechanic changed by a patch may go out of turn as «теперь так»; not on the same day as 18.
- **15 «Переводчик с токсичного»** — rest 14 days, evening; the bank of 100 in a shuffled order, no line repeated
  until the whole bank has gone out; the form (dictionary, «как сказать», three ranks) never twice in a row; no phrase
  shared with 27 «Токсик-бинго»; not on the same day as 27.
- **16 «Способность в жизнь»** — rest 14 days, day slot; the bank of 100 in a shuffled order, none repeated until the
  whole bank has gone out; the kind (scene, catch, hero kit) never twice in a row; the poll closes after 24 h, votes
  kept; options shuffled with the joke last; not on the same day as 24 «Что выберешь?».
- **17 «Анкета»** — rest 21 days, Friday or Saturday evening; every hero once in a shuffled order before any repeats;
  its hero not in another rubric's post of the last 3 days; not on the same day as another AI scene (21, 22, 23, 31);
  never without its picture — a failed scene gives the slot to another rubric.
- **18 «Инструкция по применению»** — rest 21 days, any slot, text; the bank of 100 in a shuffled order, none repeated
  until the whole bank has gone out; no skipping after a patch (owner: «это забей»); its topic not within 2 weeks of the
  same topic in 14 (e.g. «иммунитет к магии» there, «БКБ» here); not on the same day as 14.
- **19 «Тир-лист»** — rest 30 days; the six looks strictly in turn; silent 7 days after a patch with hero changes; the
  rank of «best»/«worst» never twice in a row (ranks in a circle); not on the same day as another stats rubric (10, 12,
  20, 21, 29); a look that fails tries the next look in turn, none — the slot goes to another rubric.
- **20 «Что брать рекруту»** — rest 30 days, 18:00–19:00; AI-written from bank examples, the hero's abilities of the
  current patch, the live Recruit win rate and the slang lexicon, then the fact check; a hero not repeated until every
  fitting hero (the top ten on Recruit, not only the perennial first) has had a turn; silent 7 days after a patch with
  hero changes; its hero not in another rubric's post of the last 3 days (especially 12); not on the same day as another
  stats rubric; a failed fact check — one rewrite, still failing — the slot goes to another rubric.
- **21 «Забытый герой»** — rest 30 days; a hero not repeated until every fitting one (rare pick, win rate above
  average) has had a turn; the hero must still be rare at posting time, else the next; silent 7 days after a patch with
  hero changes; not on the same day as another stats rubric or AI scene (17, 22, 23, 31); its hero not in another
  rubric's post of the last 3 days; never without its picture.
- **22 «Гороскоп»** — an anchor: Monday 08:00 MSK every other week (owner: «в 9 утра наверно или вообще в 8»);
  forms in turn, the bank inside a form shuffled without repeats; a new teller each time, none repeated before every
  hero has read; the ball never shows the teller; the ball's hero not within the last 10 horoscopes; teller and ball
  hero not in another rubric's post of the last 3 days; no other AI scene that Monday; no picture — skipped until the
  next turn.
- **23 «Подозреваемый»** — rest 21 days, evening; each of the 127 heroes once in a random order before any repeats;
  its hero not in another rubric's post of the last 3 days; the verdict options never the same twice in a row; the
  poll closes after 24 h, votes kept; not on the same day as another AI scene; never without its picture.
- **24 «Что выберешь?»** — rest 14 days, any slot; the bank in a shuffled order, none repeated until the whole bank has
  gone out; options shuffled; the poll closes after 24 h, votes kept; not on the same day as 16 nor in the same week as
  13; the punishment topic (rank, teammates…) not within the last 5 posts.
- **25 «Ты на линии»** — rest 14 days, any slot (fine right after a patch: numbers are live); the bank in a shuffled
  order, none repeated until the whole bank has gone out, up to 3 tries when one fails; the quiz closes after 7 days,
  votes kept; one mechanic not more often than once in 2 weeks together with 14; not on the same day as 04 or 26.
- **26 «Ребус»** — rest 30 days, weekend; the bank in a shuffled order, options shuffled; the quiz closes after 7 days,
  votes kept; not on the same day as 04 or 25; never without its picture; when the bank runs out it pauses (below).

- **27 «Токсик-бинго»** — rest 21 days, Friday or Saturday evening; bingo and «тир-лист хуйни» strictly in turn; a card
  not repeated until all have gone out, then a new round with the owner told; no situation shared with 15 and not on
  the same day as 15; not on the same day as 19; never without its picture.

- **28 «Предмет, которого нет»** — rest 21 days, any slot; the 40 items not repeated until all have gone out, then a
  new round with the owner told; not on the same day as 18; never without its picture.

- **29 «Пидорок дня»** — rest 7 days, at 08:00 MSK (owner: «утром, в 8 утра»), never on a horoscope Monday (both 08:00);
  «yesterday» is the Moscow day (the code reckons UTC days today — fix when wired); a hero not within its last 3 posts
  nor in another rubric's post of the last 3 days; too few games yesterday (collector stalled) — no post, the slot goes to
  another rubric; not on the same day as another stats rubric; never without its picture.

- **30 «Цитата дня»** — rest 7 days, any slot, text; the bank of 300 not repeated until all have gone out, then a new
  round with the owner told; its topic (teammates, rank, hero) not within the last 5 posts; not on the same day as 13
  or 14.
- **31 «Открытка»** (in work) — item 8b: on its date at the card's own hour; weekday/any cards fill empty slots (rest
  30 days); the patch card only for a major patch 7.xx; each card once a year, 14.02 cards by `year % 4`.

## Common mechanisms (owner, 30.10.2026)

- **A bank runs out.** When a bank rubric sends its last unused entry, the bot tells the owner in the bot chat
  («„Ребус“ исчерпал банк — пополните») and the rubric pauses with the status «банк исчерпан» in «Рубрики». When new
  entries appear (the bank grows after a deploy), it resumes by itself with the new entries first. The pause applies to
  guessing rubrics whose answer is known once out (26 «Ребус» and the like); a joke bank (15, 16, 18, 24…) also tells
  the owner but starts a new shuffled round until refilled (owner agreed: jokes may repeat after months, a solved
  riddle may not). The two messages (owner, 30.10.2026):
  - pause: «Рубрика „Ребус“ закончила банк и поставлена на паузу. Пополните банк.»;
  - new round: «Рубрика „Переводчик с токсичного“ закончила банк и начала с начала. Если хотите — пополните банк,
    иначе будет по кругу.»
- **Start-up.** On the first run no rubric has a last post, so all would be due at once. The scheduler seeds each pool
  rubric's «last post» spread over its own rest window, so the first weeks fill evenly instead of a burst; event and
  calendar rubrics wait for their trigger. A resumed or newly enabled rubric is due at its next fitting slot.
- **A rubric that did not go out.** Its slot goes to the next candidate of the same weight (picture or text) that
  passes every rule, else the other weight, else a greeting filler, else the slot stays empty. The failed rubric keeps
  its turn (its rest is not consumed) and is first in line for the next fitting slot once its cause clears (the
  provider's pause ends); an event rubric is re-planned within its freshness window (09 ≤ 21 days, chain steps within
  their window), a calendar post whose day has passed is skipped. A content skip (nothing to say) is not a failure.
- **The weekly report has a «Рубрики» block** (owner, 30.10.2026: «в отчёте за неделю — по рубрикам, какая лучше»):
  in the existing Monday analytics report, the week's rubrics ranked against the channel's usual post (views at the
  same age, reactions, poll votes, comments), the best and worst rubric with the reason, the best and worst post inside
  the rubrics that went out, rest changes the scheduler made or advises, and failures/skips of the week in one line.
- **A picture plus its separate poll counts as one post** of the «≤ 3 a day» (owner, 30.10.2026); where the look
  allows, one poll message with the picture inside is preferred.
- **Similar-joke check by meaning is deferred** (owner, 30.10.2026): the lexical check first; the semantic one
  (Workers AI embeddings) only after 4 weeks of its data.
- **Comments** (owner, 30.10.2026): comment texts and the hashed author are kept 10 days («на всякий случай, если
  что-то сдвинется») and then purged; the comment count per post and the daily theme summaries are kept for good; the
  04 first guesser's @username is kept only on that riddle's answer post.
