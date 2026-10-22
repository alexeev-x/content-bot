# Product plan

Written 20.10.2026 with the owner; replaces the plan of 14.10.2026. A general direction, to be narrowed with the owner
into tasks. Only what is not built yet.

## Goal

The AI makes the Telegram channel's content itself: news and rubric posts drafted from sources, the owner approves.

## 1. Sources

- Today two are connected: Steam News of Dota 2 (`steam_news`) and the official patch notes (`patch_notes`). A Steam
  announcement is drafted by the AI writer in the bot; the studio's «Прошлые анонсы» lets the owner try a past one.
  Patch notes still use a template.
- A Dota event announcement (an event like «The Dark Carnival», a treasure, …) always carries its image in the post
  (owner, 21.10.2026); other sources get their own rules later. Done for the approved AI post: its images are attached.
- A treasure post lists its sets, images and price. Liquipedia had the sets 35 minutes after Valve's announcement
  (Trove of Terror: sets at once, drop rates and opening bonuses after ~4 h) and never the price. Steam's Web API gives
  neither for Dota (checked with the owner's key 21.10.2026: no item schema, no asset prices for app 570); the price is
  shown only in the game, and Russian news sites print it the same morning (see the price watch below). So two posts (owner): the news at once, then the sets with images from Liquipedia or the event's
  dota2.com page (two posts when there are many).
- Liquipedia watch for a published event post that lacks details (owner, 22.10.2026): the sets, their images, drop
  rates or opening bonuses missing from what went out start a watch on the event's Liquipedia page (found by its
  name). Every 5 minutes one light request asks whether the page changed; the price never starts a watch (Liquipedia
  has none). Liquipedia fills a page in many small edits, so new details are collected until the page has been quiet
  for 30 minutes (see «Follow-up posts» below). The watch ends 6 hours after Valve's announcement (owner, 22.10.2026:
  one window for the details and the price, everything is out by then).
- Price watch, Russian region (owner, 22.10.2026: the price in roubles matters). Trove of Terror (Valve 07.10 03:22
  MSK) was priced by Championat at 04:07 (only as «21 тыс. ₽ за аркану» in the title), esports.ru 07:41 (420 ₽),
  offstage.ru 08:40 (424 ₽, the first exact price), dota2.ru 10:02, PlayGround.ru 13:15 (424 ₽); no site is earlier,
  Russian newsrooms start in the morning. Sources, all keyless: Championat's RSS `championat.com/rss/news/cybersport/`
  (title and lead only: its articles sit behind a Sber ID single sign-on wall, not to be bypassed, and it has no
  public API), the RSS of esports.ru (`/rss/`) and dota2.ru (`/news/rss/`), and PlayGround.ru's posts in the Steam
  News feed for app 570 (today the code keeps only Valve's feed). A price goes into a post, always as «≈ N ₽» with
  its source, when two sources agree within about 2%; a figure derived from another (the arcana's 21 000 ₽ / 50 =
  420 ₽) counts as one of the two (owner, 22.10.2026). The price is watched in the same 6-hour window as the details;
  after it the owner adds the price by hand. Checked and not used: Steam Web API, Steam Market (marketable items only),
  dota2.com datafeed (no store data), GameTracking-Dota2 (no `items_game` since 07.10), Dota 2 Fandom (slower than
  Liquipedia), paid web search.
- Follow-up posts of an event publish themselves (owner, 22.10.2026). Each event keeps a record of the facts already
  published (sets, drop rates, opening bonuses, price, trailer); a new fact is checked against it, so nothing, the
  price above all, goes out twice. New facts wait in the event's pending set: the sets with their images are a large
  fact, the rest are small. The pending set goes out after 30 quiet minutes when it holds a large fact or at least two
  small ones, and whatever is left goes out when the 6-hour window ends. Small facts never edit an earlier post: they
  go out as one «details» post (an edit reaches nobody who read the post, and a media caption is capped at 1024
  characters). At most three posts per event: the news, the sets, the details. A price found later that differs from
  the published one gives no new post: the bot asks the owner and offers to correct the published post. Trove of
  Terror would give: news 03:22, sets ~04:35, drop rates, bonuses and «≈ 420 ₽» ~08:10.
- Built 21.10.2026, to be seen by the owner on DEV: an event with its own dota2.com page (e.g. dota2.com/darkcarnival) becomes a series of posts, not one (owner,
  21.10.2026): the page's own texts — Valve's Russian translation among them (story, how it works, rewards, the
  treasure's sets, personas) — and images are read; the AI first plans the series (how many posts, one topic each, in
  a logical order, no repeats, which images go where), then writes each post; they go out spaced in time. A trailer
  is linked when the page has one. Without such a page (Trove of Terror) the post comes from the announcement.
  To change (owner, 22.10.2026: five posts are too many): at most three posts, one per fixed topic, a topic the page
  lacks is skipped: the event itself (what players do, e.g. the carnival's wagons, and its rewards), the new hero
  cosmetics (e.g. the five automaton personas) and the new treasure (its sets; details and price as in the watch
  above). Today the planner picks 2–6 posts on any topics.
- Sources come in two kinds (owner, 21.10.2026): important ones, whose news the studio writes and publishes by itself
  as soon as it appears, and scheduled rubrics (e.g. a weekly «worst heroes» from a stats API). Publishing without the
  owner is decided (`docs/DECISIONS.md`, 21.10.2026: Valve posts at the owner's night); its safeguards come with it.
- Liquipedia Dota 2 as an on-demand source (owner, 22.10.2026): no Cron polling; the server fetches a page when a
  post or rubric needs it. Only the MediaWiki `api.php` (wikitext and image URLs; HTML pages are forbidden by its
  terms): at most 1 request per 2 s (`action=parse` 1 per 30 s), a `User-Agent` naming the project with a contact,
  gzip accepted, «Источник: Liquipedia» in the post (CC-BY-SA 3.0; cosmetic images stay Valve's). It has heroes with
  per-patch changelogs, items, patches, treasures and sets with images (no prices), tournaments, matches, teams,
  rosters and transfers. LiquipediaDB (structured data) needs an approved key and is paid unless the use is
  non-commercial; not planned.
- Find and add more that give a post a day without the owner's work; each must be free, keyless or with a free key,
  and allowed by its terms.

## 2. Rubrics the AI runs itself

Many repeatable rubrics the AI drafts from the sources on its own schedule; the owner approves or edits. Their results
show in Аналитика → «Рубрики Telegram».

Ideas from Liquipedia, kept for later (owner, 22.10.2026: recorded, not chosen):
- «Чей сет?»: a treasure set's image without the hero and a poll with four heroes; the answer the next day, or a
  Telegram quiz poll (our polls are regular only today).
- «Что сломали в патче»: after a patch, short posts on who was buffed or killed from the heroes' changelogs, then a
  poll «кто теперь имба?».
- Transfers of the week: who moved where, in the owner's voice.
- «Этот день в Доте»: which tournament was won on this date years ago.
- «Кто победит?»: a poll before a big match and the result after it; harder, it needs the tournament brackets parsed.
- Open question: does the channel want esports (the last three) or only the game itself.

## 3. News

Claude was compared blind with OpenAI on 13 writer tasks (21.10.2026): the writer stays on OpenAI (`docs/DECISIONS.md`); the comparison was removed afterwards, the result and the reference are in `docs/ai/claude-provider.md`.

The AI turns new source events into news posts in the owner's voice: what happened, why it matters to a player.

## Next: video

Once 1–3 are done (owner, 20.10.2026): video. Planned with the owner when it starts.
