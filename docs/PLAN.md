# Product plan

Written 14.10.2026 with the owner; only what is not built yet. Production waits until stages A–C are done and the owner says the result is ready.

## Goal

A media Telegram channel (@alexeev_x) fed by the owner's Reels traffic (TikTok and YouTube Shorts @alexeev_x), monetized by Telegram ads. The studio and the bot are the tools: an AI that writes like the owner, analytics that explains which videos worked, and rubrics that give people a reason to subscribe.

## Competitor findings (157 Dota 2 Telegram channels, public previews, 14.10.2026)

- About 85 of 157 channels are news hubs posting 10–20 times a day at 4–15% reach. Channels with the best reach post 2–4 times a day.
- Personal and humor channels hold 20–50% reach. Nobody runs an authored «учу фидить» channel with repeatable rubrics.
- Native polls and quizzes are almost unused (0 in most channels). Some use one-tap emoji votes («норм / фигня»).
- Growth runs on cross-promotion giveaways inside a network of channels (Mango, СВИТ, EZ25, Golovach). Advertisers seen: skin shops, energy drinks, betting. Dota ad prices were not found.
- Raw data: `.logs/handoff/tg-competitors.csv` and `.md` (local, not committed).

## Telegram rubrics the bot can draft (top 10)

1. Дневник новичка — owner's matches from OpenDota recentMatches + AI quip.
2. Учу фидить: правило дня — owner's rule bank + AI variants.
3. Вердикт чата — native poll.
4. Угадай героя — quiz from the official hero list.
5. Топ героев недели + Растут/падают — weekly hero statistics snapshot, template card (needs a new source: OpenDota was removed, `docs/DECISIONS.md` 14.10.2026).
6. Предсказание дня + итоги — pro-match poll, results next day.
7. Патч простым языком + poll — official datafeed (pipeline exists).
8. Датамайн «что готовят Valve» — SteamTracking/GameTracking-Dota2 commits (no licence: facts and links only, no assets; cosmetics not covered), fixed «утечка» label, owner review.
9. Розыгрыш недели — owner supplies the prize.
10. Гороскоп фидера — daily filler.

Sources: OpenDota keyless 60 req/min and 3 000/day; official datafeed keyless and undocumented; GitHub unauthenticated 60 req/h. Skipped for now: Steam Market prices (unofficial, ban risk), STRATZ (terms unverified), Liquipedia-heavy rubrics, Twitch digest. The bot proposes a weekly grid of 2–3 posts a day with the owner's personal posts on at least 4 days.

## Stages

### 0. Channel habits (owner, no code)

- Bio with one promise; a pinned «what is here» post.
- 2–3 posts a day spread out: one rubric post plus one or two light posts.
- Every Reel ends with a reason to open Telegram (part two, poll result, uncut clip).
- A weekly giveaway with a subscription condition; cross-promotion with channels of similar size.

### A. AI that writes like the owner

Owned by `docs/ALEXEEV_AI_DEVELOPMENT_AND_TEST_PLAN.md` (only what is left).

### B. Video analytics

Not built, each a separate task (numbers in the owner's terms):

1. **Telegram invite links per source** (deferred by the owner 15.10.2026). The bot creates named invite links (TikTok bio, YouTube description, each ad post, each giveaway) and counts joins and leaves per link from `chat_member` updates. Answers which source brings subscribers and gives advertisers proof. Needs: the bot as channel admin with the «invite users» right; `chat_member` in the webhook's allowed updates.
2. **Telegram channel metrics as in TGStat** (deferred 15.10.2026: no ads planned soon). ERR (average views of the last 30 days' posts ÷ subscribers), ERR24 (views at 24 h ÷ subscribers, from the 24 h checkpoint), average reach per post and its trend.
3. **Studio rubrics against results.** Telegram posts published through the studio are matched to their collected statistics, so a rubric («Учу фидить», «Вердикт чата», …) gets its own median, reach and best time.
4. **Ad and event marks** (deferred 15.10.2026: no ads planned soon). The owner marks an ad post, a giveaway or a viral video; charts show the marks, and an ad post gets a report (views, reach, joins via its invite link, leaves after 7 days) for the advertiser.
5. **Media kit and export** (deferred 15.10.2026: no ads planned soon). A public page (or a PDF) with audience, reach, ERR and average views per platform for advertisers; CSV export of the publications table.
6. **YouTube sign-in (OAuth, YouTube Analytics API):** retention curve and relative retention, traffic sources, subscribers gained per video, audience geography. The early verdict stays on public counters; retention is added to the item panel when it lands (2–3 days delay).

Not available through the platforms' APIs: TikTok retention, traffic sources and demographics (the Display API has counters only); TGStat's citation index; YouTube Studio's «Research» tab.

### C. Telegram growth features

- «Топ героев недели»: a weekly hero statistics collection (needs a new source, see rubric 5), a card rendered from a template with official hero portraits, an AI caption, a draft and a bot alert.
- Interactive rubrics (prediction of the day, chat verdict) drafted by the bot and scheduled through the existing publishing flow.

### D. Images

- No paid plans (owner, 15.10.2026: the Workers Paid plan is not an option). The Worker's Free CPU limit cannot render images, so layers are composed by Cloudflare Images (free 5 000 unique transformations a month; over it a new image fails, nothing is charged): the owner's background, hero art or the news image, logo and a fixed set of pre-drawn labels («ПАТЧ», «СЛУХ», «ТУРНИР», «РОЗЫГРЫШ»). Free-form headline text on the image only if the binding can draw it; otherwise the text stays in the post.
- Order of choice per post: template card by default; the news image or the hero art when no template fits; an AI image only by the owner's button.
- AI images through Workers AI's free daily allowance (e.g. Flux): a background or scene, the real hero art composited on top, so the hero is never generated or distorted; no text drawn by the model.

### Later

Video production, streams, ad sales once the channel reaches about 3–5K subscribers.

## Owner inputs

| Needed for | Input |
|---|---|
| B | YouTube sign-in for OAuth |
| D | Enable Cloudflare Images (free); a background, a logo and 2–3 example images of the wanted style |
