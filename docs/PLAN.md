# Product plan

Written 14.10.2026 with the owner. Production waits until stages A–C are done and the owner says the result is ready.

## Goal

A media Telegram channel (@alexeev_x) fed by the owner's Reels traffic (TikTok and YouTube Shorts @alexeev_x), monetized by Telegram ads. The studio and the bot are the tools: an AI that writes like the owner, analytics that explains which videos worked, and rubrics that give people a reason to subscribe.

## Starting point (measured 14.10.2026)

| Platform | Audience | Signal |
|---|---|---|
| TikTok | 8 623 followers, 515.7K likes | «Учу фидить» tips with a provocative first line: 237–583K views; «Учусь играть, часть N» diary: 7–128K. ~1.5M views in the last 30 days |
| YouTube Shorts | 1.18K subscribers, 136 videos | Same videos, 3–10× fewer views than TikTok |
| Telegram | 836 subscribers | Median 291 views per post (35% of subscribers, on par with the best Dota channels); bursts of photo posts, no rubrics, polls or call to action |

Viewer geography on TikTok: Russia 40%, Ukraine 18%, Belarus 9%, Kazakhstan 7%, USA 5% (owner, rounded). TikTok Creator Rewards (needs 10K followers, videos over one minute) pays only for views from eight countries, so it is a small bonus; Telegram ads are the main income.

## Competitor findings (157 Dota 2 Telegram channels, public previews, 14.10.2026)

- About 85 of 157 channels are news hubs posting 10–20 times a day at 4–15% reach. Channels with the best reach post 2–4 times a day.
- Personal and humor channels hold 20–50% reach. Nobody runs an authored «учу фидить» channel with repeatable rubrics.
- Native polls and quizzes are almost unused (0 in most channels). Some use one-tap emoji votes («норм / фигня»).
- Growth runs on cross-promotion giveaways inside a network of channels (Mango, СВИТ, EZ25, Golovach). Advertisers seen: skin shops, energy drinks, betting. Dota ad prices were not found.
- Raw data: `.logs/handoff/tg-competitors.csv` and `.md` (local, not committed).

## Content findings (owner's 47 TikTok and 129 YouTube videos, 14.10.2026)

- «Учу фидить» tips: TikTok median 357K (6 of 7 at 237–583K); the diary: median 27K, plateau 15–30K, spikes only on milestones (rank, calibration, «Я взял героя»: 45–118K).
- Hooks that worked: an accusation with a concrete item («БКБ покупают только те…» 583K), a segment's pain as a question («Откуда саппорту брать деньги?» 470K), evergreen «как правильно X» (331–425K), «Устал <страдание>?» (357K), «90% <роль> совершают ошибку» (238K). Weak: abstract promises, «лучшие X», jokes without a claim.
- YouTube is a separate channel, not a weak copy: TikTok/YouTube views per video median 4.1× (1.3–140×). Many YouTube titles look English; check localisation in Studio. Since 31.03.2025 Shorts views count every start; judge by engaged views and viewed-vs-swiped.
- TikTok Creator Rewards pays only for views from US/UK/DE/JP/KR/FR/MX/BR (Creator Academy). With ~5% US viewers the payout is small (tens of dollars a month); videos are not stretched for it.
- Early verdict for the 72-hour tracking: index = views at hour t ÷ median of the same rubric at hour t; ≥1.5× by 3 h — likely hit, <0.6× by 6 h — likely weak; per-video Telegram invite links measure the funnel.
- Raw research: `.logs/handoff/content-playbook.md` (30 video ideas, 10 experiments) and `.logs/handoff/tg-rubrics.md` (26 rubrics, sources, weekly grid); local, not committed.

## Telegram rubrics the bot can draft (top 10)

1. Дневник новичка — owner's matches from OpenDota recentMatches + AI quip.
2. Учу фидить: правило дня — owner's rule bank + AI variants.
3. Вердикт чата — native poll.
4. Угадай героя — quiz from the official hero list.
5. Топ героев недели + Растут/падают — OpenDota heroStats weekly snapshot, template card.
6. Предсказание дня + итоги — pro-match poll, results next day.
7. Патч простым языком + poll — official datafeed (pipeline exists).
8. Датамайн «что готовят Valve» — SteamTracking/GameTracking-Dota2 commits (no licence: facts and links only, no assets; cosmetics not covered), fixed «утечка» label, owner review.
9. Розыгрыш недели — owner supplies the prize.
10. Гороскоп фидера — daily filler.

Sources: OpenDota keyless 60 req/min and 3 000/day; official datafeed keyless and undocumented; GitHub unauthenticated 60 req/h. Skipped for now: Steam Market prices (unofficial, ban risk), STRATZ (terms unverified), Liquipedia-heavy rubrics, Twitch digest. The bot proposes a weekly grid of 2–3 posts a day with the owner's personal posts on at least 4 days.

## Stages

### 0. Channel habits (owner, no code, starts now)

- Bio with one promise; a pinned «what is here» post.
- 2–3 posts a day spread out: one rubric post plus one or two light posts.
- Every Reel ends with a reason to open Telegram (part two, poll result, uncut clip).
- A weekly giveaway with a subscription condition; cross-promotion with channels of similar size.
- Rubric ideas: «Учу фидить: правило дня», «Дневник новичка», «Вердикт чата» (poll), «Угадай героя» (quiz), «Предсказание дня», weekly giveaway, «Мем-разбор», «Топ героев недели».

### A. AI that writes like the owner

Agreed with the owner 15.10.2026. Publishing always needs the owner's approval.

**Provider: OpenAI** (owner decision 15.10.2026, `docs/DECISIONS.md`). One port, the model chosen by configuration: a mid-priced model for drafts, the cheapest for checks and tags; exact names verified on OpenAI's site when the key exists. The key with a monthly limit is set by the owner in Worker secrets.

**Reels** (rubrics «Учу фидить» and «Учусь играть в доту»; more can be added):
1. A Reel script on a topic, with or without a rubric.
2. Topics for a rubric: 5–10 ideas that skip the owner's past videos (known from analytics) and lean on what flew; the chosen one becomes a script.
3. A new rubric from a trend, a patch, what flew or competitors: name, idea, format, first three topics; saved on approval.
4. The owner's raw thoughts → a structured script that keeps his words and only adds the hook, order and links.

**Telegram autoposts from news.** A source (official or not) finds news; duplicates from several sources merge into one; the AI writes the post in the owner's voice from the news facts only, an unofficial one marked as a rumour; the draft comes to the bot to publish, edit or reject. Open: which unofficial sources, a daily cap, which news topics.

**Voice, not fine-tuning.** A compact style profile (1–1.5K tokens) distilled from the owner's Telegram export and 10–15 of his own posts; 3–4 examples of the same rubric per request; a stop-list of AI-sounding phrases checked in code and by the cheap model; every AI draft stored next to the owner's final text, and a weekly batch run turns those edits into new profile rules.

**Anti-AI-tells (researched 15.10.2026).** Two passes: the draft, then a check against a catalogue of AI-writing patterns adapted to Russian (sources: the open «humanizer» skills built on Wikipedia's «Signs of AI writing», e.g. github.com/blader/humanizer, and ru.wikipedia «Признаки сгенерированности текста»; licences to be checked before reuse) — the cheap ones in code, the rest by the cheap model — and a rewrite of what it finds. The style profile starts with an explicit analysis of the owner's manner; examples are picked by similarity to the topic, not by rubric alone. Research (arXiv 2509.14543) finds few-shot imitation of informal everyday authors still noticeably off, so the owner's edits are the main lever; fine-tuning is not an option (OpenAI no longer opens it to new users, 15.10.2026), so the owner's edits and retrieval carry the voice.

**Token economy (owner priority).** Prompt caching of the stable prefix (profile, examples, rules, rubric) in a fixed order; one draft, not variants; output length bound to the rubric's format; low effort for simple posts; a rewrite sends only the owner's short instruction; non-urgent work (weekly rules, topic lists) through the Batch API; per-request token and cache accounting with a daily cap shown in the studio. No prompt-compression tools (LLMLingua and the like): they need a separate server and strip the wording that carries the voice.

**Spend tracking (owner, 15.10.2026), built with the provider port.** Every AI call is recorded (model, input, cache-read, cache-write and output tokens, cost from the model's price table). The studio shows this month's spend against the owner's monthly budget, what is left, drafts made and the average cost, by day and by kind of work; each draft shows its own cost. The bot messages the owner at once, each once per period: at 80% of the monthly budget (threshold editable) with spent, left and roughly how many drafts that is; at 100% that AI is stopped until the 1st, with a button to the budget setting; and when the daily cap is hit. At 100% AI stops until next month unless the owner raises the budget; the daily cap keeps one day from eating the month; the provider console's monthly limit stays as a backstop. «Left» is counted from the owner's budget: the provider's prepaid balance is not readable with a normal API key (an admin key would be a separate decision).

**Goal and acceptance (owner, 15.10.2026):** for now text only, written so that nobody can tell it is AI. Checked blind: 5 real posts mixed with 5 AI posts on the same topics; readers guessing no better than chance.

**Why a video flew or did not (owner, 15.10.2026: key).** At 72 h every Reel gets a short AI review in the owner's terms: the verdict against its usual curve and the reasons, read from audience signals (shares per 1 000 views as «relatable, sent to a friend» — the BKB video; comments and likes per 1 000 views; the first hours' pace), from the text (the hook, i.e. the first line: emotion and a recognisable situation vs a lesson; topic relatability; a reason to tag a friend) and, for YouTube, from comment texts (tags, «жиза», arguments); plus what to change in the text. A weekly batch summary names the hooks and topics that work for this owner; it feeds the style profile, so scripts and topic suggestions lean on what flew. Limits: TikTok's Display API gives counters only (no comment texts, no retention); the video's text comes from the studio script or the owner pastes it for old videos; YouTube retention needs the owner's OAuth (stage B).

**Architecture and readiness checklist (owner's review, 16.10.2026): `docs/ai/architecture.md`** — same-format baselines, text provenance, draft → final → video linking, edit diffs, rule lifecycle, direct vs automatic mode.

**What the model reads (16.10.2026): `docs/ai/` (see its README).** A compact pack (voice, one card per format, lessons, answer shape), a retrievable Dota lexicon and 37 exact Reels texts plus 520 Telegram posts as examples; built from the owner's guides (`docs/ai/sources/`) and the channel export. The studio controls it; new approved texts and video reviews extend it.

**How it learns (no fine-tuning: OpenAI closed it to new users; checked 15.10.2026).** A memory around the model: (1) static knowledge — voice profile, Dota lexicon, the post corpus; (2) per-request retrieval of 3–4 of the owner's posts of the same type and closest topic; (3) growing experience — every AI draft is stored with the owner's final text, and a weekly cheap-model run turns the diffs into weighted rules with evidence, next to the rules from video reviews; (4) a self-check before showing a draft (stop-list in code, the cheap model against the profile); (5) the progress metric — the share of each draft the owner changes, shown in «Настройки → ИИ», expected to fall week by week, plus occasional blind tests.

**Context engineering, researched 15.10.2026 (`docs/ai/research.md`).** Embed the owner's posts once with OpenAI's small embedding model (well under $0.01) and keep the vectors in D1 (cosine in the Worker, no Vectorize); retrieve 3–4 nearest posts plus one of the same length, most similar last (few-shot saturates at 2–10). Learn from edits the CIPHER way: one rule per (draft, final) pair by the cheap model, rules embedded and retrieved per request rather than all sent; a rule joins the always-on profile only after 2+ confirmations, with decay, a cap of ~25 and a monthly consolidation. Deterministic checks before any model critique; revise only on a violation. Optionally 3 variants in one call: the owner's pick is a free preference signal. Primary metric: the edit ratio; a monthly blind «which is mine» test of 20; an LLM judge only for A/B on a fixed set of 30 briefs, calibrated on the owner's picks; the model snapshot is pinned and the 30 briefs rerun before a switch. Skip DSPy/OPRO/TextGrad (metric too slow and noisy for the budget). Caveat: at 100–300 generations a month OpenAI's 30-minute prompt cache may rarely hit (writes cost 1.25×) — log cached tokens before relying on it.

**Self-learning loop (owner, 15.10.2026).** Each video review ends in rules with evidence («a situation hook beats a lesson hook: BKB 3.1×, lane 0.5×», linked to the videos). Weekly, the rules are merged into a short «Мой опыт» block (a few hundred tokens, cached) that goes into every generation, next to the style profile and the edit-derived rules. A rule gains weight when new videos confirm it and is dropped when they contradict it, so one lucky video does not become a law. The owner sees «Мой опыт» in the studio and can delete or add rules.

**Order:** rubrics + provider port → style profile from the export → «Написать с ИИ» in the editor and in the bot → learning from edits → video reviews «why it flew» and Reels topics from analytics → news autoposts.

**Dota humour (owner, 15.10.2026: important).** A compact «Сленг и мемы» lexicon (`docs/ai/lexicon.jsonl`) (term or meme, meaning, when it fits, an example line) sent cached with every request; the owner's own jokes and punchline habits extracted from his export as examples; the owner adds or retires entries in the studio in one line; posts about news see the news and its discussion, so fresh jokes come from there; a «шутка не зашла» button in the bot turns misses into rules. Owner input: 10–20 memes and words he uses or that are current.

**Swearing (owner, 15.10.2026):** allowed and sometimes needed; written in full, at the owner's own frequency and places as the style profile measures them, never more. A per-rubric «no swearing» switch can come with advertising.

**Owner inputs:** the Telegram channel export (JSON), 10–15 posts that are «100% him», how Reels are recorded and what a script must contain.

### B. Video analytics

**Built on DEV (15.10.2026).** Hourly collection of Telegram (public preview), YouTube (Data API key) and TikTok (Display API, owner sign-in); views at 1–72 h for the «same age» status; «Аналитика» with tabs «Обзор» (summary, conclusions, «Что залетает сейчас», every publication against the median, daily growth), «Публикации» (best and worst, table, video comparison) and «Аудитория» (followers, platform comparison, best time to post); item panel; sources in «Настройки → Аналитика». Research of comparable tools: `.logs/handoff/analytics-research.md`.

**Next, without AI, in this order** (each is a separate task; numbers in the owner's terms):

1. **Telegram invite links per source** (deferred by the owner 15.10.2026; start with item 2). The bot creates named invite links (TikTok bio, YouTube description, each ad post, each giveaway) and counts joins and leaves per link from `chat_member` updates. Answers the main question of the plan — which source brings subscribers — and gives advertisers proof. Needs: the bot as channel admin with the «invite users» right; `chat_member` in the webhook's allowed updates.
2. **Bot alerts and a weekly digest** (built on DEV 15.10.2026, rules in `docs/API_CONTRACTS.md` § Content analytics; also a source outage alert). «Ролик залетает: 1,8× обычного на 6 ч» for a video or post at 3, 6 and 24 h when it is ≥ 1.5× or ≤ 0.7× its usual curve; on Monday a digest: the period's «Главное», the best and worst three, followers change. Uses only what the page already computes.
3. **Telegram channel metrics as in TGStat** (deferred 15.10.2026: no ads planned soon). ERR (average views of the last 30 days' posts ÷ subscribers), ERR24 (views at 24 h ÷ subscribers, from the 24 h checkpoint), average reach per post and its trend; the numbers advertisers ask for.
4. **Studio rubrics against results.** Telegram posts published through the studio are matched to their collected statistics, so a rubric («Учу фидить», «Вердикт чата», …) gets its own median, reach and best time. Shows which rubric to post more.
5. **Goals with pace** (built on DEV 15.10.2026: «Аналитика → Аудитория» and the Monday digest). A target per platform (e.g. 1 000 Telegram subscribers) with the current pace and the forecast date; shown in «Сводка» and the weekly digest.
6. **Ad and event marks** (deferred 15.10.2026: no ads planned soon). The owner marks an ad post, a giveaway or a viral video; charts show the marks, and an ad post gets a report (views, reach, joins via its invite link, leaves after 7 days) to send to the advertiser.
7. **«Обычно» band** (built on DEV 15.10.2026: the item growth chart and «Каждая публикация»). The p25–p75 range of the last ~10 publications drawn behind curves and KPIs, so «normal» is a range, not a single median.
8. **Media kit and export** (deferred 15.10.2026: no ads planned soon). A public page (or a PDF) with audience, reach, ERR and average views per platform for advertisers; CSV export of the publications table.

**Needs the owner's YouTube sign-in (OAuth, YouTube Analytics API), not AI:** retention curve and relative retention, traffic sources, subscribers gained per video, audience geography. The early verdict stays on public counters; retention is added to the item panel when it lands (2–3 days delay).

**Needs AI (stage A):** a breakdown of the first seconds and the topic against retention, automatic topic tags, hook and title scoring, topic suggestions from what worked.

**Not available through the platforms' APIs:** TikTok retention, traffic sources and demographics (the Display API has counters only); TGStat's citation index; YouTube Studio's «Research» tab.

### C. Telegram growth features

- Native polls and quizzes as post types.
- «Топ героев недели»: a weekly OpenDota collection (hero statistics were removed on 14.10.2026 and come back in a smaller form), a card rendered from a template with official hero portraits, an AI caption, a draft and a bot alert.
- Interactive rubrics (prediction of the day, chat verdict) scheduled through the existing publishing flow.

### D. Images

- **Built on DEV (15.10.2026):** every hero's official animation without background (WebM, MOV), its PNG, portrait, icon and crop mirrored into R2; «Медиа → Герои Dota» shows and downloads them.
- No paid plans (owner, 15.10.2026: the Workers Paid plan is not an option). The Worker's Free CPU limit cannot render images, so layers are composed by Cloudflare Images (free 5 000 unique transformations a month; over it a new image fails, nothing is charged): the owner's background, hero art or the news image, logo and a fixed set of pre-drawn labels («ПАТЧ», «СЛУХ», «ТУРНИР», «РОЗЫГРЫШ»). Free-form headline text on the image only if the binding can draw it; otherwise the text stays in the post. Needs the owner to enable Cloudflare Images (free) and to supply a background, a logo and 2–3 reference images.
- Order of choice per post: template card by default; the news image or the hero art when no template fits; an AI image only by the owner's button.
- AI images through Workers AI's free daily allowance (e.g. Flux): a background or scene, the real hero art composited on top, so the hero is never generated or distorted; no text drawn by the model.

### Later

Video production, streams, ad sales once the channel reaches about 3–5K subscribers.

## Owner inputs

| Needed for | Input |
|---|---|
| A | AI provider decision, API key with a monthly limit, 10–15 own texts, Telegram channel export |
| B | YouTube and TikTok sign-in for OAuth |
| D | 2–3 example images of the wanted style, logo |
