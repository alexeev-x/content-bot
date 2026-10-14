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

- AI provider behind one port, switchable by configuration. Proposed: OpenAI (text and images with one key); optional blind A/B test against Claude on the owner's texts. Needs an owner decision and a key in Worker secrets.
- Rubrics in the studio: name, goal, format, examples.
- Style profile from the owner's texts (Telegram export, Reels scripts) and a list of phrases that sound like AI.
- Every AI draft is stored next to the owner's final version; these edits become the examples the AI learns from.
- Bot: «пост в рубрику X про Y» → draft → edit → approve. Publishing always needs the owner's approval.

### B. Video analytics

- YouTube first: owner OAuth, daily metrics per video (views, average view duration, retention).
- TikTok next: what a personal account can get through the official API must be verified before building; the 13.10.2026 decision that TikTok is not the first integration has to be revisited.
- Early tracking: a newly uploaded video is detected automatically and its public counters (views, likes, comments, shares) are snapshotted hourly for the first 72 hours, then daily. The curve is compared with the owner's own baseline (the median of past videos at the same age), giving a verdict «заходит / средне / не заходит» with a percentile. The bot reports at about 2 h, 24 h and 72 h. Snapshots are bounded: hourly rows collapse to daily after 72 hours.
- Retention and watch time arrive later (YouTube Analytics reports with a delay of about 2–3 days), so the early verdict uses public counters and the breakdown adds retention when it lands.
- New «Аналитика» section in the studio (sidebar; on phones in the «Ещё» sheet until it earns a tab): a list of videos from both platforms with the early verdict, views at 2 h / 24 h / 72 h and the platform; the newest videos on top while they are inside the 72-hour window.
- Per-video page: the growth curve against the owner's baseline, metrics plus an AI breakdown of the first seconds and the topic against retention; a weekly report in the bot; topic suggestions from what worked.

### C. Telegram growth features

- Native polls and quizzes as post types.
- «Топ героев недели»: a weekly OpenDota collection (hero statistics were removed on 14.10.2026 and come back in a smaller form), a card rendered from a template with official hero portraits, an AI caption, a draft and a bot alert.
- Interactive rubrics (prediction of the day, chat verdict) scheduled through the existing publishing flow.

### D. Images

- Templates rendered on the Worker (no paid render API): official hero art, owner screenshots, logo.
- AI-generated backgrounds with the real hero composited on top, so the hero is never generated or distorted.
- Generation from a reference only for memes, always approved by the owner.

### Later

Video production, streams, ad sales once the channel reaches about 3–5K subscribers.

## Owner inputs

| Needed for | Input |
|---|---|
| A | AI provider decision, API key with a monthly limit, 10–15 own texts, Telegram channel export |
| B | YouTube and TikTok sign-in for OAuth |
| D | 2–3 example images of the wanted style, logo |
