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
  only in the game. So two posts (owner): the news at once, then the sets with images from Liquipedia or the event's
  dota2.com page (two posts when there are many).
- Liquipedia watch for a published event post that lacks details (owner, 22.10.2026): the sets, their images, drop
  rates or opening bonuses missing from what went out start a watch on the event's Liquipedia page (found by its
  name). Every 5 minutes one light request asks whether the page changed; the price never starts a watch (Liquipedia
  has none). Liquipedia fills a page in many small edits, so new details are collected until the page has been quiet
  for 30 minutes, then the AI writes the next post from what is new against what was published; later edits can give
  another post. The watch ends after 8 hours. Open: whether these posts publish themselves or wait for approval.
- Built 21.10.2026, to be seen by the owner on DEV: an event with its own dota2.com page (e.g. dota2.com/darkcarnival) becomes a series of posts, not one (owner,
  21.10.2026): the page's own texts — Valve's Russian translation among them (story, how it works, rewards, the
  treasure's sets, personas) — and images are read; the AI first plans the series (how many posts, one topic each, in
  a logical order, no repeats, which images go where), then writes each post; they go out spaced in time. A trailer
  is linked when the page has one. Without such a page (Trove of Terror) the post comes from the announcement.
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
