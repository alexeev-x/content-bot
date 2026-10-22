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
  neither for Dota (checked with the owner's key 21.10.2026: no item schema, no asset prices for app 570); the price comes
  from Valve by the item id (below). So two posts (owner): the news at once, then the sets with images from Liquipedia or the event's
  dota2.com page (two posts when there are many).
- Built 22.10.2026 (`docs/backend/sources.md` «Treasure follow-ups from Liquipedia»; follow-ups carry no set pictures: Liquipedia's files are outside its API). Liquipedia watch for a published event post that lacks details (owner, 22.10.2026): the sets, their images, drop
  rates or opening bonuses missing from what went out start a watch on the event's Liquipedia page (found by its
  name). Every 5 minutes one light request asks whether the page changed; the price never starts a watch (Liquipedia
  has none). Liquipedia fills a page in many small edits, so new details are collected until the page has been quiet
  for 30 minutes (see «Follow-up posts» below). The watch ends 6 hours after Valve's announcement (owner, 22.10.2026:
  one window for the details and the price, everything is out by then).
- Price from Valve, first choice (owner, 22.10.2026: «идеально»): `https://www.dota2.com/react/getbpprices?item_defs=<id>`
  (keyless, several ids comma-separated) gives Valve's store price, e.g. `{"34454":"$4.99"}` for Trove of Terror; the
  event pages use it themselves. The currency follows the caller's country (USD from Moldova and from the owner's
  browser; no parameter changes it). A treasure's item id comes from Liquipedia's `defindex` (Treasure of Wonders
  31200, $2.49): the carnival page prices other items, not its treasure (the automaton personas `nItemID` 31367 etc.
  $14.99, Secret Room Pack 34452 $14.99, 34472 $7.99). Posts give this price in dollars as Valve returns it, no «≈» (owner,
  22.10.2026: dollars are fine; no rouble price, owner 22.10.2026).
- An event page's treasure, read by our parser (checked on dota2.com/darkcarnival, 22.10.2026): the sets in slider
  order (`{heroname:…}` in the page chunk), which is rarity from common to rarest (owner, 22.10.2026: the last slide
  is the top reward, Io «Madame Scrio» in the carnival; the treasure post's image is the last slide's), each set's image at
  `cdn.steamstatic.com/apps/dota2/videos/dota_react/<slug>/treasure/set_<hero>.png`, and the personas' item ids
  (their prices). No drop rates and no treasure price on the page. Built 22.10.2026 (`docs/backend/sources.md`):
  checked on 13 event pages of 2023–2026, texts read on 11 (not summer2023, deadreckoning), the treasure with images
  on all 5 that have one; the personas' prices too.
- Follow-up posts of an event publish themselves (owner, 22.10.2026). Each event keeps a record of the facts already
  published (sets, drop rates, opening bonuses, price, trailer); a new fact is checked against it, so nothing, the
  price above all, goes out twice. New facts wait in the event's pending set: the sets with their images are a large
  fact, the rest are small. The pending set goes out after 30 quiet minutes when it holds a large fact or at least two
  small ones, and whatever is left goes out when the 6-hour window ends. Small facts never edit an earlier post: they
  go out as one «details» post (an edit reaches nobody who read the post, and a media caption is capped at 1024
  characters). At most three posts per event: the news, the sets, the details. A price found later that differs from
  the published one gives no new post: the bot asks the owner and offers to correct the published post. Trove of
  Terror would give: news 03:22, sets with «$4.99» ~04:35 (Liquipedia's `defindex` gives the id), drop rates and
  bonuses ~08:10.
- Built 21.10.2026, to be seen by the owner on DEV: an event with its own dota2.com page (e.g. dota2.com/darkcarnival) becomes a series of posts, not one (owner,
  21.10.2026): the page's own texts — Valve's Russian translation among them (story, how it works, rewards, the
  treasure's sets, personas) — and images are read; the AI first plans the series (how many posts, one topic each, in
  a logical order, no repeats, which images go where), then writes each post; they go out spaced in time. A trailer
  is linked when the page has one. Without such a page (Trove of Terror) the post comes from the announcement.
  Built 22.10.2026 (owner: five posts were too many): at most three posts on fixed topics (the event, the new hero
  cosmetics, the treasure opening with its rarest set), photos only. Spaced 10 minutes apart and published without the owner
  when switched on; a treasure without its own page is followed on Liquipedia (above).
- Sources come in two kinds (owner, 21.10.2026): important ones, whose news the studio writes and publishes by itself
  as soon as it appears, and scheduled rubrics (e.g. a weekly «worst heroes» from a stats API). Publishing without the
  owner is decided (`docs/DECISIONS.md`, 21.10.2026: Valve posts at the owner's night). Built 22.10.2026 for single news posts (`docs/backend/sources.md` «Automatic publishing»); an event series too (migration 0100).
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
